// lib/bejerman-npw.ts
//
// Crea la nota de pedido de WhatsApp (comprobante NPW) en Bejerman a partir de
// un pedido confirmado en el chat (tabla MySQL whatsapp_pedidos). Mapeado
// contra las NPW de prueba 00000001 / 00000002 cargadas a mano (29/09/2026).
//
// Una transacción por pedido:
//   1. SegCabV      cabecera: datos del cliente (ficha de Clientes), lista de
//                   precios de la ficha, fechas, lugar de entrega
//   2. SegCabVAux   solo el vínculo con la cabecera
//   3. SegTiposV    comprobante NPW (tipo fijo NP, sin punto de venta),
//                   número = MAX + 1 (con applock)
//   4. SegDetV      un renglón por artículo (variante con CodEle ' ') y, al
//                   final, leyendas (tipo 'L') con los productos "a consultar"
//   5. SegTotV      un renglón de IVA 21 % (todos los vendibles son 21 %)
// Una NP NO mueve stock: no hay CabMovS/MovStock ni se tocan Stock/StockPar.
// Las NPW no las toma el BP automático (filtra spvtco_Cod = 'NP').
//
// Leyenda mapeada contra la NPW 00000003 (cargada a mano): texto en sdv_Desc
// (50), todo en 0 y SIN artículo — Bejerman guarda código, CodEle, unidad,
// IVA y depósito en NULL en ese tipo de renglón (a diferencia de los de
// artículo, donde CodEle va con ' ').

import pkg from "mssql"
// Rutas relativas: lo usa también scripts/crear-npw.ts (tsx sin alias "@/").
import { esFlagSi } from "./bejerman-op"
import { calcularFechaEntrega } from "./whatsapp/delivery-schedule"

// ─── Configuración ────────────────────────────────────────────────────────────

const EMPRESA = "CANE"
const DEPOSITO = "1"
const USUARIO = "HER" // definido por Hernán (29/09/2026)
const TASA_IVA = 21
const LARGO = { razSoc: 40, direc: 30, loc: 25, desc: 50, mens: 40, lugarLen: 25, locLen: 15, horarioLen: 20 }

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface ItemPedido {
  codigoArticulo: string
  descripcion: string
  cantidad: number
  codEle1?: string
  codEle2?: string
  codEle3?: string
  consulta?: boolean
}

export interface EntregaPedido {
  tipo: "REPARTO" | "RETIRO" | "TRANSPORTE"
  nombreLocal?: string
  nombrePersona?: string
  direccion?: string
  localidad?: string
}

export interface PedidoParaNPW {
  id: number
  cliCod: string
  carrito: ItemPedido[]
  entrega: EntregaPedido
  creadoEn: Date
}

export interface RenglonNPW {
  nReng: number
  codigo: string
  e1: string
  e2: string
  e3: string
  desc: string
  cantUM1: number
  cantUM2: number
  um1: string
  um1Desc: string
  um2: string | null
  um2Desc: string
  factor: number
  tipoTasa: string
  tiv: string
  precio: number
  total: number
  costo: number
  llevaPart: boolean
}

export interface ResultadoNPW {
  /** null en simulación */
  scvID: number | null
  nro: string
  cliente: string
  lista: string
  tipoLista: string
  renglones: RenglonNPW[]
  neto: number
  iva: number
  total: number
  /** Cosas para avisar al equipo (sin precio, consultas que no entraron, etc.) */
  avisos: string[]
}

export interface OpcionesNPW {
  /** true: lee y calcula todo, pero deshace la transacción (no graba nada) */
  simular: boolean
  log?: (msg: string) => void
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const t = (v: unknown) => String(v ?? "").trim()
const ele = (col: string) => `LTRIM(RTRIM(ISNULL(${col}, '')))`
const redondear2 = (n: number) => Math.round(n * 100) / 100
const pad8 = (n: number) => String(n).padStart(8, "0")
/** Bejerman guarda ' ' (un espacio) en los códigos y textos vacíos, nunca NULL ni ''. */
const espacio = (v: string | null | undefined, largo?: number) => {
  const s = t(v)
  return (largo ? s.slice(0, largo) : s) || " "
}

/** Fecha en Argentina como 'YYYYMMDD' (formato que SQL Server no confunde). */
function fechaAR(d: Date): string {
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires" }).format(d) // YYYY-MM-DD
  return p.replace(/-/g, "")
}

function sumarDias(yyyymmdd: string, dias: number): string {
  const [a, m, d] = [yyyymmdd.slice(0, 4), yyyymmdd.slice(4, 6), yyyymmdd.slice(6, 8)].map(Number)
  const f = new Date(Date.UTC(a, m - 1, d + dias))
  return `${f.getUTCFullYear()}${String(f.getUTCMonth() + 1).padStart(2, "0")}${String(f.getUTCDate()).padStart(2, "0")}`
}

/** Parte un texto en líneas de hasta `largo` caracteres, cortando por palabras. */
function partirEnLineas(texto: string, largo: number): string[] {
  const lineas: string[] = []
  let actual = ""
  for (const palabra of texto.replace(/\s+/g, " ").trim().split(" ")) {
    const p = palabra.slice(0, largo) // una palabra más larga que la línea se corta
    if (!actual) actual = p
    else if (actual.length + 1 + p.length <= largo) actual += ` ${p}`
    else {
      lineas.push(actual)
      actual = p
    }
  }
  if (actual) lineas.push(actual)
  return lineas
}

/** Request nuevo de la transacción con parámetros (los textos vienen del cliente). */
function consulta(tx: pkg.Transaction, params: Record<string, unknown> = {}) {
  const req = new pkg.Request(tx)
  for (const [k, v] of Object.entries(params)) req.input(k, v as never)
  return req
}

// ─── Motor ────────────────────────────────────────────────────────────────────

export async function crearNPW(pool: pkg.ConnectionPool, pedido: PedidoParaNPW, opts: OpcionesNPW): Promise<ResultadoNPW> {
  const log = opts.log ?? (() => {})
  const avisos: string[] = []
  const tx = new pkg.Transaction(pool)
  await tx.begin()

  try {
    // Numeración MAX+1: el applock evita que dos procesos tomen el mismo número.
    const lock = await consulta(tx).query(`
      DECLARE @res INT
      EXEC @res = sp_getapplock @Resource = 'costos-web:crear-npw', @LockMode = 'Exclusive',
        @LockOwner = 'Transaction', @LockTimeout = 10000 -- por debajo del requestTimeout de mssql (15 s)
      SELECT @res AS res
    `)
    if (Number(lock.recordset[0].res) < 0) throw new Error("Otro proceso está creando NPW. Reintentá en un momento.")

    // ── Cliente (ficha de Bejerman) ──────────────────────────────────────────
    const rCli = await consulta(tx, { cod: pedido.cliCod }).query(`
      SELECT cli_Cod, cli_RazSoc, cli_Direc, cli_Loc, cli_CodPos, cli_CUIT, cli_NroIB, cli_Habilitado,
             clisiv_Cod, clitdc_Cod, cliprv_Codigo, cliven_Cod, clidlp_Cod, clicvt_Cod, clizon_Cod, clidep_Cod
      FROM Clientes WHERE cli_Cod = @cod
    `)
    const cli = rCli.recordset[0]
    if (!cli) throw new Error(`Cliente ${pedido.cliCod} inexistente en Bejerman`)
    if (!cli.cli_Habilitado) throw new Error(`Cliente ${pedido.cliCod} inhabilitado en Bejerman`)

    const lista = t(cli.clidlp_Cod) || "FIN"
    const rLista = await consulta(tx, { lista }).query(`SELECT dlp_Tipo FROM DefListP WHERE dlp_Cod = @lista`)
    // C = precios con IVA incluido (FIN), I = sin IVA (SIV)
    const tipoLista = t(rLista.recordset[0]?.dlp_Tipo) || "C"
    log(`Cliente ${t(cli.cli_Cod)} ${t(cli.cli_RazSoc)} | lista ${lista} (${tipoLista === "I" ? "sin IVA" : "con IVA"})`)

    // ── Renglones ────────────────────────────────────────────────────────────
    const articulos = pedido.carrito.filter((it) => !it.consulta)
    const consultas = pedido.carrito.filter((it) => it.consulta)
    if (articulos.length === 0) throw new Error("El pedido no tiene artículos para la NPW (solo consultas)")
    // Cada consulta en una o más leyendas de 50 caracteres, al final del detalle.
    const leyendas = consultas.flatMap((c) => partirEnLineas(`A CONSULTAR: ${c.descripcion}`, LARGO.desc))
    if (consultas.length > 0) avisos.push(`${consultas.length} producto(s) a consultar cargados como leyenda`)

    const renglones: RenglonNPW[] = []
    for (const [i, it] of articulos.entries()) {
      const clave = { cod: it.codigoArticulo.trim(), e1: t(it.codEle1), e2: t(it.codEle2), e3: t(it.codEle3) }
      const filtroArt = `a.art_CodGen = @cod AND ${ele("a.art_CodEle1")} = @e1 AND ${ele("a.art_CodEle2")} = @e2 AND ${ele("a.art_CodEle3")} = @e3`

      const rArt = await consulta(tx, clave).query(`
        SELECT a.art_DescGen, a.artele_Desc1, a.artele_Desc2, a.artele_Desc3, a.art_FactorConv, a.art_StockPart,
               a.art_TipoTasaVta, a.arttiv_CodVta,
               c.claume_Cod1 um1, c.claume_Cod2 um2, u1.ume_Desc um1Desc, u2.ume_Desc um2Desc
        FROM Articulos a
        LEFT JOIN ClasArt c ON c.cla_Cod = a.artcla_Cod
        LEFT JOIN UniMed u1 ON u1.ume_Cod = c.claume_Cod1
        LEFT JOIN UniMed u2 ON u2.ume_Cod = c.claume_Cod2
        WHERE ${filtroArt}
      `)
      const art = rArt.recordset[0]
      if (!art) throw new Error(`Artículo ${clave.cod} (${clave.e1}~${clave.e2}~${clave.e3}) inexistente en Bejerman`)

      const rPrecio = await consulta(tx, { ...clave, lista }).query(`
        SELECT TOP 1 lpr_Precio FROM ListaPrec
        WHERE lprdlp_Cod = @lista AND lprart_CodGen = @cod
          AND ${ele("lprart_CodEle1")} = @e1 AND ${ele("lprart_CodEle2")} = @e2 AND ${ele("lprart_CodEle3")} = @e3
      `)
      const precio = Number(rPrecio.recordset[0]?.lpr_Precio ?? 0)

      // Costo: por ahora no se calcula (definido por Hernán, 29/09/2026). Cuando
      // hay varios proveedores Bejerman no usa cualquier fila de ArtProv; queda
      // para revisar más adelante.
      const costo = 0

      const um2 = t(art.um2) || null
      const factor = Number(art.art_FactorConv) || 1
      const cantUM1 = it.cantidad
      const cantUM2 = um2 ? redondear2(cantUM1 * factor) : 0
      const desc = [art.art_DescGen, art.artele_Desc1, art.artele_Desc2, art.artele_Desc3]
        .map(t)
        .filter(Boolean)
        .join(" ")
        .slice(0, LARGO.desc)

      if (!precio) avisos.push(`Sin precio en la lista ${lista}: ${desc} (va con precio 0)`)
      if (t(art.art_TipoTasaVta) !== "1") avisos.push(`${desc}: tasa de IVA distinta de 21 % (revisar)`)

      renglones.push({
        nReng: i + 1,
        codigo: clave.cod,
        e1: clave.e1,
        e2: clave.e2,
        e3: clave.e3,
        desc,
        cantUM1,
        cantUM2,
        um1: t(art.um1) || "UN",
        um1Desc: t(art.um1Desc) || "UNIDAD",
        um2,
        um2Desc: t(art.um2Desc),
        factor,
        tipoTasa: t(art.art_TipoTasaVta) || "1",
        tiv: t(art.arttiv_CodVta) || "01",
        precio,
        total: redondear2(cantUM1 * precio),
        costo,
        llevaPart: esFlagSi(art.art_StockPart),
      })
    }

    // ── Totales (un solo renglón de IVA) ─────────────────────────────────────
    const total = redondear2(renglones.reduce((acc, r) => acc + r.total, 0))
    let neto: number
    let iva: number
    if (tipoLista === "I") {
      neto = total
      iva = redondear2(neto * (TASA_IVA / 100))
    } else {
      neto = redondear2(total / (1 + TASA_IVA / 100))
      iva = redondear2(total - neto)
    }

    // ── Número y fechas ──────────────────────────────────────────────────────
    const rNro = await consulta(tx).query(
      `SELECT ISNULL(MAX(CAST(spv_Nro AS BIGINT)), 0) + 1 AS nro FROM SegTiposV WHERE spvtco_Cod = 'NPW' AND ISNUMERIC(spv_Nro) = 1`
    )
    const nro = pad8(Number(rNro.recordset[0].nro))

    const hoy = fechaAR(new Date())
    const fddjj = `${hoy.slice(0, 6)}01`
    const e = pedido.entrega
    const fechaEntrega = e.tipo === "REPARTO" ? sumarDias(fechaAR(pedido.creadoEn), calcularFechaEntrega(pedido.creadoEn).diasHasta) : hoy

    // Lugar de entrega: la NP no tiene observaciones; se usan los campos de entrega.
    const entregaLen =
      e.tipo === "REPARTO"
        ? { lugar: e.direccion, loc: e.localidad, horario: `REPARTO ${fechaEntrega.slice(6, 8)}/${fechaEntrega.slice(4, 6)}` }
        : e.tipo === "RETIRO"
          ? { lugar: "RETIRA EN LOCAL", loc: "", horario: `RETIRA ${e.nombrePersona ?? ""}` }
          : { lugar: "ENVIO POR TRANSPORTE", loc: "", horario: "A COORDINAR" }
    const mens = `WHATSAPP #${pedido.id} ${e.nombrePersona ?? ""}`

    log(`NPW ${nro} | ${renglones.length} renglón(es) | neto ${neto} + IVA ${iva} = ${redondear2(neto + iva)} | entrega ${fechaEntrega}`)
    for (const r of renglones) {
      log(`   ${r.nReng}. ${r.codigo}${r.e1 ? `~${r.e1}~${r.e2}~${r.e3}` : ""} ${r.desc} | ${r.cantUM1} ${r.um1}${r.um2 ? ` (${r.cantUM2} ${r.um2})` : ""} x ${r.precio} = ${r.total} | costo ${r.costo}`)
    }
    leyendas.forEach((l, i) => log(`   ${renglones.length + i + 1}. [leyenda] ${l}`))
    for (const a of avisos) log(`   ⚠ ${a}`)

    if (opts.simular) {
      await tx.rollback()
      return { scvID: null, nro, cliente: t(cli.cli_Cod), lista, tipoLista, renglones, neto, iva, total, avisos }
    }

    // ── 1. SegCabV ───────────────────────────────────────────────────────────
    const rCab = await consulta(tx, {
      hoy, fddjj, fechaEntrega,
      cliCod: t(cli.cli_Cod),
      siv: espacio(cli.clisiv_Cod),
      razSoc: espacio(cli.cli_RazSoc, LARGO.razSoc),
      direc: espacio(cli.cli_Direc, LARGO.direc),
      loc: espacio(cli.cli_Loc, LARGO.loc),
      codPos: espacio(cli.cli_CodPos),
      prv: espacio(cli.cliprv_Codigo),
      tdc: Number(cli.clitdc_Cod ?? 39),
      cuit: espacio(cli.cli_CUIT),
      nroIB: espacio(cli.cli_NroIB),
      ven: t(cli.cliven_Cod) || null,
      lista, tipoLista,
      cvt: t(cli.clicvt_Cod) || "1",
      zon: t(cli.clizon_Cod) || null,
      dep: t(cli.clidep_Cod) || DEPOSITO,
      mens: espacio(mens, LARGO.mens),
      lugarLen: espacio(entregaLen.lugar, LARGO.lugarLen),
      locLen: espacio(entregaLen.loc, LARGO.locLen),
      prvLen: e.tipo === "REPARTO" ? espacio(cli.cliprv_Codigo) : " ",
      horarioLen: espacio(entregaLen.horario, LARGO.horarioLen),
      usuario: USUARIO,
    }).query(`
      DECLARE @ids TABLE (scv_ID INT)
      INSERT INTO SegCabV (
        scvemp_Codigo, scvsuc_Cod, scvptr_Cod, scvpre_Cod, scv_OrigenComp,
        scv_FContab, scv_FDDJJ, scv_IncluDDJJ, scv_Estado, scv_FIngreso, scv_FEmision, scv_FEntrega,
        scvcli_Cod, scvsiv_Cod, scvcli_RazSoc, scvcli_Direc, scvcli_Loc, scvcli_CodPos, scvprv_Codigo,
        scvtdc_Cod, scvcli_CUIT, scvcli_NroIB, scvprv_CodigoIB,
        scvmon_codigo, scvmtca_codigo, scvmcot_cotiza, scvven_Cod, scvdlp_Cod, scvdlp_Tipo,
        scvdco_Tasa1, scvdco_Tasa2, scvdco_Tasa3, scvcvt_Cod, scvdfi_Tasa, scvdrv_Tasa,
        scv_ImpDtoCom, scv_ImpDtoFin, scv_ImpDtoPie, scv_Mens, scv_NroRt, scv_PlazoEnt, scv_DiasMantOf,
        scv_ActStock, scv_CompStock, scv_Remite, scv_Fact, scv_GenPendRt, scv_GenPendFc, scv_TransfStk, scv_SgnStk,
        scvdep_Cod, scv_LugarLen, scv_LocLen, scvprv_CodigoLen, scv_CodPosLen, scv_HorarioLen,
        scv_TotKilos, scv_TotBultos, scv_Anticipo, scv_CodApe, scvzon_Cod, scv_BUso, scv_Lote,
        scv_ControloCrDisp, scv_CumpXPgm, scv_PasadoACC, scv_Convert, scv_ModVenc, scv_ControloMora,
        scv_FecMod, scvusu_Codigo, scv_CotizaClausula, scvrtd_MaxLinDet, scvpai_Cod, scv_CantHojas, scv_CancelaMismaMoneda
      )
      OUTPUT INSERTED.scv_ID INTO @ids
      VALUES (
        '${EMPRESA}', ' ', '1', '1', 'E',
        @hoy, @fddjj, 255, 'S', @hoy, @hoy, @fechaEntrega,
        @cliCod, @siv, @razSoc, @direc, @loc, @codPos, @prv,
        @tdc, @cuit, @nroIB, @prv,
        '1', 'UNI', 1, @ven, @lista, @tipoLista,
        0, 0, 0, @cvt, 0, 0,
        0, 0, 0, @mens, ' ', 0, 0,
        0, 0, 0, 0, 1, 1, 0, -1,
        @dep, @lugarLen, @locLen, @prvLen, ' ', @horarioLen,
        0, 0, 0, ' ', @zon, 'N', ' ',
        'N', 0, 0, ' ', 0, 'N',
        GETDATE(), @usuario, 0, 0, 'ARG', 1, 'N'
      )
      SELECT scv_ID FROM @ids
    `)
    const scvID = Number(rCab.recordset[0].scv_ID)

    // ── 2. SegCabVAux ────────────────────────────────────────────────────────
    await consulta(tx, { scvID }).query(`INSERT INTO SegCabVAux (scxemp_Codigo, scxsuc_Cod, scxscv_ID) VALUES ('${EMPRESA}', ' ', @scvID)`)

    // ── 3. SegTiposV ─────────────────────────────────────────────────────────
    await consulta(tx, { scvID, nro }).query(`
      INSERT INTO SegTiposV (
        spvemp_Codigo, spvsuc_Cod, spvscv_ID, spvtco_Circuito, spvtco_Cod, spvtco_TipoFijo, spv_Orig,
        spv_Letra, spv_CodPvt, spv_Nro, spvtco_Remite, spvtco_Fact, spvtco_GenPendRt, spvtco_GenPendFc,
        spvtco_TransfStk, spvtco_AcStk, spvtco_SgnStk, spv_OrdenLis, spv_BPM
      )
      VALUES ('${EMPRESA}', ' ', @scvID, 'V', 'NPW', 'NP', 'O', ' ', ' ', @nro, 0, 0, 1, 1, 0, 0, -1, 1, 'N')
    `)

    // ── 4. SegDetV ───────────────────────────────────────────────────────────
    for (const r of renglones) {
      await consulta(tx, {
        scvID, fechaEntrega, hoy, fddjj,
        nReng: r.nReng,
        cod: r.codigo, e1: espacio(r.e1), e2: espacio(r.e2), e3: espacio(r.e3),
        desc: espacio(r.desc, LARGO.desc),
        um1: r.um1, um1Desc: r.um1Desc, um2: r.um2, um2Desc: r.um2 ? espacio(r.um2Desc) : " ",
        cant1: r.cantUM1, cant2: r.cantUM2,
        precio: r.precio, total: r.total, tipoTasa: r.tipoTasa, tiv: r.tiv,
        dep: DEPOSITO, factor: r.factor, costo: r.costo, llevaPart: r.llevaPart ? 1 : 0,
      }).query(`
        INSERT INTO SegDetV (
          sdvemp_Codigo, sdvsuc_Cod, sdvscv_ID, sdv_FEntrega, sdv_FContab, sdv_FDDJJ, sdv_IncluDDJJ,
          sdv_NReng, sdv_TipoIt, sdvart_CodGen, sdvart_CodEle1, sdvart_CodEle2, sdvart_CodEle3,
          sdv_Desc, sdvume_Cod1, sdvume_Desc1, sdvume_Cod2, sdvume_Desc2,
          sdv_CantUM1, sdv_CantUM2, sdv_CantDim1, sdv_CantDim2, sdv_CantDim3,
          sdv_CBonUM1, sdv_CBonUM2, sdv_CRtUM1, sdv_CRtUM2, sdv_CBonRtUM1, sdv_CBonRtUM2,
          sdv_CFcUM1, sdv_CFcUM2, sdv_CBonFcUM1, sdv_CBonFcUM2,
          sdv_CPendRtUM1, sdv_CPendRtUM2, sdv_CBonPendRtUM1, sdv_CBonPendRtUM2,
          sdv_CPendFcUM1, sdv_CPendFcUM2, sdv_CBonPendFcUM1, sdv_CBonPendFcUM2,
          sdv_TasaBon, sdv_ImpBon, sdv_PrecioUn, sdvart_TipoTasaVta, sdvtiv_Cod, sdv_ImpNG, sdv_ImpTot,
          sdvstp_Partida, sdv_Serie, sdv_ActStock, sdv_PesoBr, sdv_CantEnv, sdvdep_Cod, sdv_FactorConv,
          sdv_PrModif, sdv_PrCosto, sdv_Kit, sdv_RengKit, sdv_PorcCalc, sdv_BUso, sdv_LlevaPart, sdv_LlevaSerie,
          sdv_NoComputable, sdv_ImporteDefi, sdv_EsPromo
        )
        VALUES (
          '${EMPRESA}', ' ', @scvID, @fechaEntrega, @hoy, @fddjj, 255,
          @nReng, 'A', @cod, @e1, @e2, @e3,
          @desc, @um1, @um1Desc, @um2, @um2Desc,
          @cant1, @cant2, 0, 0, 0,
          0, 0, 0, 0, 0, 0,
          0, 0, 0, 0,
          @cant1, @cant2, 0, 0,
          @cant1, @cant2, 0, 0,
          0, 0, @precio, @tipoTasa, @tiv, 0, @total,
          ' ', ' ', '2', 0, 1, @dep, @factor,
          0, @costo, ' ', 0, 0, 'N', @llevaPart, 0,
          0, 0, 'N'
        )
      `)
    }

    // Leyendas: igual que las carga Bejerman a mano (NPW 00000003).
    for (const [i, texto] of leyendas.entries()) {
      await consulta(tx, { scvID, fechaEntrega, hoy, fddjj, nReng: renglones.length + i + 1, desc: espacio(texto, LARGO.desc) }).query(`
        INSERT INTO SegDetV (
          sdvemp_Codigo, sdvsuc_Cod, sdvscv_ID, sdv_FEntrega, sdv_FContab, sdv_FDDJJ, sdv_IncluDDJJ,
          sdv_NReng, sdv_TipoIt, sdv_Desc, sdvume_Desc1, sdvume_Desc2,
          sdv_CantUM1, sdv_CantUM2, sdv_CantDim1, sdv_CantDim2, sdv_CantDim3,
          sdv_CBonUM1, sdv_CBonUM2, sdv_CRtUM1, sdv_CRtUM2, sdv_CBonRtUM1, sdv_CBonRtUM2,
          sdv_CFcUM1, sdv_CFcUM2, sdv_CBonFcUM1, sdv_CBonFcUM2,
          sdv_CPendRtUM1, sdv_CPendRtUM2, sdv_CBonPendRtUM1, sdv_CBonPendRtUM2,
          sdv_CPendFcUM1, sdv_CPendFcUM2, sdv_CBonPendFcUM1, sdv_CBonPendFcUM2,
          sdv_TasaBon, sdv_ImpBon, sdv_PrecioUn, sdvart_TipoTasaVta, sdv_ImpNG, sdv_ImpTot,
          sdvstp_Partida, sdv_Serie, sdv_ActStock, sdv_PesoBr, sdv_CantEnv, sdv_FactorConv,
          sdv_PrModif, sdv_PrCosto, sdv_Kit, sdv_RengKit, sdv_PorcCalc, sdv_BUso, sdv_LlevaPart, sdv_LlevaSerie,
          sdv_NoComputable, sdv_ImporteDefi, sdv_EsPromo
        )
        VALUES (
          '${EMPRESA}', ' ', @scvID, @fechaEntrega, @hoy, @fddjj, 255,
          @nReng, 'L', @desc, ' ', ' ',
          0, 0, 0, 0, 0,
          0, 0, 0, 0, 0, 0,
          0, 0, 0, 0,
          0, 0, 0, 0,
          0, 0, 0, 0,
          0, 0, 0, ' ', 0, 0,
          ' ', ' ', '0', 0, 0, 0,
          0, 0, ' ', 0, 0, 'N', 0, 0,
          0, 0, 'N'
        )
      `)
    }

    // ── 5. SegTotV ───────────────────────────────────────────────────────────
    await consulta(tx, { scvID, hoy, fddjj, neto, iva }).query(`
      INSERT INTO SegTotV (
        stvemp_Codigo, stvsuc_Cod, stvscv_ID, stv_FContab, stv_FDDJJ, stv_IncluDDJJ, stv_Marca2,
        stv_TipoPropDesc, stvtiv_Cod, stvres_Art, stv_Tasa1, stv_Tasa2, stv_ImpNetoEmi, stv_Imp1Emi,
        stv_Imp2Emi, stv_AplicaDesc, stv_REModMan, stv_BUso, stv_Base, stv_PorcentajeRes
      )
      VALUES ('${EMPRESA}', ' ', @scvID, @hoy, @fddjj, 255, '1', '1', '01', ' ', ${TASA_IVA}, 0, @neto, @iva, 0, 'S', 0, 'N', 0, 0)
    `)

    await tx.commit()
    log(`✅ NPW ${nro} creada (scv_ID ${scvID})`)
    return { scvID, nro, cliente: t(cli.cli_Cod), lista, tipoLista, renglones, neto, iva, total, avisos }
  } catch (err) {
    await tx.rollback()
    throw err
  }
}
