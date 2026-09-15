// lib/bejerman-op.ts
//
// Motor de creación de Órdenes de Producción en Bejerman.
// Lo usan tanto el script scripts/crear-op.ts como la acción del servidor que
// dispara el botón de la planilla, para que ambos escriban exactamente lo mismo.
//
// Por cada línea de planilla, en una transacción propia:
//   1. ProdOrdenes                     cabecera
//   2. ProdOrd_Procesos                antes que producidos y componentes (FK)
//   3. ProdOrd_Producidos              el producto a fabricar
//   4. ProdOrd_Componentes             insumos previstos (explosión de fórmula)
//   5. ProdOrd_Programa                centro de trabajo, fecha y turno
//   6. CabMovS 'ENT' + MovStock (+)    ingreso del producto terminado
//   7. CabMovS 'SAL' + MovStock (-)    una salida por insumo y partida (FIFO)
//   8. ProdDecl_*                      vinculan la orden con los movimientos
//   9. UPDATE Stock / StockPar         saldos
//  10. estado = 4                      cierre, salvo que se pida dejarla abierta
//
// REGLAS DE UNIDADES (verificadas contra una OP cargada a mano)
//   - Producido:   cantidadUM1 y cantidadUM2
//   - Componentes: cantidadUM1 con la cantidad, cantidadUM2 siempre en 0
//   - sbart_CodEle1/2/3 van con un espacio, nunca NULL: si quedan en NULL los
//     reportes de Crystal no encuentran el artículo y salen incompletos.

import pkg from "mssql"

const { ConnectionPool } = pkg

export interface OpcionesOP {
  /** Recibe las líneas de avance; por defecto no hace nada */
  log?: (msg: string) => void
  /** Deja la orden en ejecución (estado 2) en vez de cerrarla */
  dejarAbierta?: boolean
}

// ─── Configuración ────────────────────────────────────────────────────────────

const CENTRO_TRABAJO = 1
const TURNO = 1
const DEPOSITO = "1"
const RESPONSABLE = "MARIA"   // usuario con el que Bejerman registra la OP
const USUARIO_SQL = "HER"     // usuario que queda en los saldos de stock

const ESTADO_EN_EJECUCION = 2
const ESTADO_CERRADA = 4

const config: pkg.config = {
  server: process.env.BEJERMAN_SERVER!,
  database: "SBDACANE",
  user: process.env.BEJERMAN_USER!,
  password: process.env.BEJERMAN_PASSWORD!,
  options: { encrypt: false, trustServerCertificate: true },
  port: 1433,
  pool: { max: 4, min: 0, idleTimeoutMillis: 30000 },
}

// Pool compartido, mismo criterio que el cliente de Prisma
const globalForMssql = globalThis as unknown as { bejermanOpPool?: Promise<pkg.ConnectionPool> }

export function getBejermanPool(): Promise<pkg.ConnectionPool> {
  if (!globalForMssql.bejermanOpPool) {
    globalForMssql.bejermanOpPool = new ConnectionPool(config).connect()
  }
  return globalForMssql.bejermanOpPool
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const pad8 = (n: number) => String(n).padStart(8, "0")
const q = (v: string | null | undefined) => (v ?? "").replace(/'/g, "''")

/** Bejerman guarda estos flags como '1'/'0', 'S'/'N' o bit segun la columna */
const esFlagSi = (v: unknown): boolean => {
  const t = String(v ?? "").trim().toUpperCase()
  return t === "1" || t === "S" || t === "TRUE" || t === "SI"
}

/** Cadena que Bejerman guarda en ProdDecl_*.comprob, ej. S-ENT-00046182-08/09/2026 */
function comprobStr(tipo: "ENT" | "SAL", nro: string, fechaISO: string): string {
  const [a, m, d] = fechaISO.split("-")
  return `S-${tipo}-${nro}-${d}/${m}/${a}`
}

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface LineaPlanilla {
  id: number
  productoCod: string
  productoDesc: string
  lote: string
  cantidad: number
  formulaCod: string | null
}

interface DatosArticulo {
  art_CodGen: string
  art_Tipo: string
  art_FactorConv: number
  art_StockPart: string
  artdep_Cod: string
  claume_Cod1: string
  claume_Cod2: string
}

interface CompFormula {
  paso: number
  componente: string
  phantom: string
  cantidadUM1: number
  deposito: string
  propBatch: number
  tipoConsumo: number
  esClave: number
  secuencia: number
  pasoDecl: number | null
  afectaCosto: string
}

interface ProdFormula {
  paso: number
  producto: string
  cantidadUM1: number
  cantidadUM2: number
  tipoDeclaracion: number
  prorateoCosto: number
  deposito: string
}

interface ProcFormula {
  ppr_Cod: string
  secuencia: number
  cantidad: number
}

interface Partida {
  stp_Partida: string
  stp_CantUM1: number
  stp_FechVtoIng: Date
}

// ─── Numeración ───────────────────────────────────────────────────────────────

async function proximoNroOrden(req: pkg.Request): Promise<number> {
  const r = await req.query(`SELECT ISNULL(MAX(orden), 0) + 1 AS nro FROM ProdOrdenes`)
  return Number(r.recordset[0].nro)
}

async function proximoNroComp(req: pkg.Request): Promise<string> {
  const r = await req.query(`
    SELECT ISNULL(MAX(CAST(ord_NroComp AS BIGINT)), 0) + 1 AS nro
    FROM ProdOrdenes WHERE ISNUMERIC(ord_NroComp) = 1
  `)
  return pad8(Number(r.recordset[0].nro))
}

/** Próximo número de la serie S-ENT o S-SAL */
async function proximoNroMov(req: pkg.Request, tipo: "ENT" | "SAL"): Promise<number> {
  const r = await req.query(`
    SELECT ISNULL(MAX(CAST(cms_Nro AS BIGINT)), 0) + 1 AS nro
    FROM CabMovS
    WHERE cmstco_Cod = '${tipo}' AND cms_Circuito = 'S' AND ISNUMERIC(cms_Nro) = 1
  `)
  return Number(r.recordset[0].nro)
}

// ─── Lecturas del maestro ─────────────────────────────────────────────────────

async function datosArticulo(req: pkg.Request, codigo: string): Promise<DatosArticulo> {
  const r = await req.query(`
    SELECT a.art_CodGen, a.art_Tipo, a.art_FactorConv, a.art_StockPart, a.artdep_Cod,
           ISNULL(c.claume_Cod1, '') AS claume_Cod1,
           ISNULL(c.claume_Cod2, '') AS claume_Cod2
    FROM Articulos a
    LEFT JOIN ClasArt c ON c.cla_Cod = a.artcla_Cod
    WHERE a.art_CodGen = '${q(codigo)}'
  `)
  if (r.recordset.length === 0) throw new Error(`Artículo ${codigo} inexistente`)
  const a = r.recordset[0]
  return {
    art_CodGen: a.art_CodGen,
    art_Tipo: String(a.art_Tipo ?? "2"),
    art_FactorConv: Number(a.art_FactorConv ?? 0),
    art_StockPart: String(a.art_StockPart ?? "0"),
    artdep_Cod: String(a.artdep_Cod ?? DEPOSITO).trim(),
    claume_Cod1: (a.claume_Cod1 || "").trim(),
    claume_Cod2: (a.claume_Cod2 || "").trim(),
  }
}

async function producidoFormula(req: pkg.Request, formula: string): Promise<ProdFormula> {
  const r = await req.query(`
    SELECT paso, producto, cantidadUM1, cantidadUM2,
           tipoDeclaracion, prorateoCosto, deposito
    FROM ProdFrm_Producidos WHERE formula = '${q(formula)}'
  `)
  if (r.recordset.length === 0) throw new Error(`Fórmula ${formula} sin producido`)
  const f = r.recordset[0]
  return {
    paso: Number(f.paso),
    producto: String(f.producto).trim(),
    cantidadUM1: Number(f.cantidadUM1),
    cantidadUM2: Number(f.cantidadUM2 ?? 0),
    tipoDeclaracion: Number(f.tipoDeclaracion ?? 0),
    prorateoCosto: Number(f.prorateoCosto ?? 1),
    deposito: String(f.deposito ?? DEPOSITO),
  }
}

async function componentesFormula(req: pkg.Request, formula: string): Promise<CompFormula[]> {
  const r = await req.query(`
    SELECT paso, componente, phantom, cantidadUM1, deposito,
           propBatch, tipoConsumo, esClave,
           pfcpfo_Secuencia, pfcpfo_PasoDecl, pfc_AfectaCosto
    FROM ProdFrm_Componentes WHERE formula = '${q(formula)}'
    ORDER BY paso
  `)
  return r.recordset.map((c: any) => ({
    paso: Number(c.paso),
    componente: String(c.componente).trim(),
    phantom: (c.phantom || "").trim(),
    cantidadUM1: Number(c.cantidadUM1),
    deposito: String(c.deposito ?? DEPOSITO),
    propBatch: Number(c.propBatch ?? 1),
    tipoConsumo: Number(c.tipoConsumo ?? 0),
    esClave: Number(c.esClave ?? 0),
    secuencia: Number(c.pfcpfo_Secuencia ?? 1),
    pasoDecl: c.pfcpfo_PasoDecl === null ? null : Number(c.pfcpfo_PasoDecl),
    afectaCosto: (c.pfc_AfectaCosto || "S").trim(),
  }))
}

async function procesosFormula(req: pkg.Request, formula: string): Promise<ProcFormula[]> {
  const r = await req.query(`
    SELECT pfoppr_Cod, pfo_Secuencia, pfo_Cantidad
    FROM ProdFrm_Procesos WHERE pfofor_Formula = '${q(formula)}'
    ORDER BY pfo_Secuencia
  `)
  return r.recordset.map((x: any) => ({
    ppr_Cod: String(x.pfoppr_Cod).trim(),
    secuencia: Number(x.pfo_Secuencia ?? 1),
    cantidad: Number(x.pfo_Cantidad ?? 1),
  }))
}

/** Partidas con saldo, ordenadas FIFO por fecha de vencimiento / ingreso */
async function partidasFIFO(req: pkg.Request, codigo: string, dep: string): Promise<Partida[]> {
  const r = await req.query(`
    SELECT LTRIM(RTRIM(stp_Partida)) AS stp_Partida, stp_CantUM1, stp_FechVtoIng
    FROM StockPar
    WHERE stpart_CodGen = '${q(codigo)}' AND stpdep_Cod = '${q(dep)}'
      AND stp_CantUM1 > 0
    ORDER BY stp_FechVtoIng ASC, stp_Partida ASC
  `)
  return r.recordset.map((p: any) => ({
    stp_Partida: p.stp_Partida,
    stp_CantUM1: Number(p.stp_CantUM1),
    stp_FechVtoIng: p.stp_FechVtoIng,
  }))
}

// ─── Movimientos de stock ─────────────────────────────────────────────────────

/**
 * Crea un CabMovS del circuito S con su MovStock y descuenta o acumula saldos.
 * Devuelve el cms_ID, que es lo que ProdDecl_* guarda en idMov.
 */
async function crearMovimiento(
  req: pkg.Request,
  opts: {
    tipo: "ENT" | "SAL"
    nro: number
    fechaISO: string
    articulo: string
    art: DatosArticulo
    cantUM1: number   // con signo: positivo ingreso, negativo salida
    cantUM2: number
    partida: string
    deposito: string
  },
): Promise<number> {
  const nroStr = pad8(opts.nro)

  const insCab = await req.query(`
    INSERT INTO CabMovS (
      cmsemp_Codigo, cmssuc_Cod, cms_FComp,
      cms_Circuito, cmstco_Cod, cmsptr_Cod,
      cms_CodPvt, cms_Letra, cms_Nro, cms_CodApe,
      cms_FecMod, cmsusu_Codigo, cms_Convert,
      cms_FContab, cms_PasadoCG
    )
    OUTPUT INSERTED.cms_ID
    VALUES (
      'CANE', ' ', '${opts.fechaISO}',
      'S', '${opts.tipo}', '7',
      ' ', ' ', '${nroStr}', ' ',
      GETDATE(), '${RESPONSABLE}', ' ',
      '${opts.fechaISO}', 'C'
    )
  `)
  const cmsID = Number(insCab.recordset[0].cms_ID)

  await req.query(`
    INSERT INTO MovStock (
      mstemp_Codigo, mstsuc_Cod, mstcms_ID,
      mstart_Tipo, mstart_CodGen, mstart_CodEle1, mstart_CodEle2, mstart_CodEle3,
      mstdep_Cod, mst_CantUM1, mst_CantUM2,
      mst_CantStockUM1, mst_CantStockUM2,
      mststp_Partida, mststs_Serie,
      mst_PrCostoT, mst_Kit, mst_PasadoCC,
      mst_Transferido, mst_PrCostoTME,
      mstda1_Cod, mstda2_Cod
    )
    VALUES (
      'CANE', ' ', ${cmsID},
      '${opts.art.art_Tipo}', '${q(opts.articulo)}', ' ', ' ', ' ',
      '${opts.deposito}', ${opts.cantUM1}, ${opts.cantUM2},
      0, 0,
      '${q(opts.partida) || " "}', ' ',
      0, ' ', 'N',
      ' ', 0,
      'ADI', 'ADI'
    )
  `)

  // Saldo general
  await req.query(`
    UPDATE Stock
    SET stk_CantUM1   = stk_CantUM1 + ${opts.cantUM1},
        stk_CantUM2   = stk_CantUM2 + ${opts.cantUM2},
        stk_FecMod    = GETDATE(),
        stkusu_Codigo = '${USUARIO_SQL}'
    WHERE stkart_CodGen = '${q(opts.articulo)}'
      AND LTRIM(RTRIM(ISNULL(stkart_CodEle1,''))) = ''
      AND LTRIM(RTRIM(ISNULL(stkart_CodEle2,''))) = ''
      AND LTRIM(RTRIM(ISNULL(stkart_CodEle3,''))) = ''
      AND stkdep_Cod = '${opts.deposito}'
  `)

  // Saldo por partida (solo si el artículo la lleva)
  if (opts.partida) {
    const upd = await req.query(`
      UPDATE StockPar
      SET stp_CantUM1   = stp_CantUM1 + ${opts.cantUM1},
          stp_CantUM2   = stp_CantUM2 + ${opts.cantUM2},
          stp_FecMod    = GETDATE(),
          stpusu_Codigo = '${USUARIO_SQL}'
      WHERE stpart_CodGen = '${q(opts.articulo)}'
        AND LTRIM(RTRIM(ISNULL(stpart_CodEle1,''))) = ''
        AND LTRIM(RTRIM(ISNULL(stpart_CodEle2,''))) = ''
        AND LTRIM(RTRIM(ISNULL(stpart_CodEle3,''))) = ''
        AND stpdep_Cod = '${opts.deposito}'
        AND LTRIM(RTRIM(stp_Partida)) = '${q(opts.partida)}'
      SELECT @@ROWCOUNT AS filas
    `)

    // Si la partida no existía (caso típico del producto terminado), se crea
    if (Number(upd.recordset[0].filas) === 0) {
      await req.query(`
        INSERT INTO StockPar (
          stpart_CodGen, stpart_CodEle1, stpart_CodEle2, stpart_CodEle3,
          stpdep_Cod, stp_Partida,
          stp_CantUM1, stp_CantUM2, stp_CantCompUM1, stp_CantCompUM2,
          stp_FechVtoIng, stp_Obs, stp_OtrosDatos, stp_FecMod, stpusu_Codigo
        )
        VALUES (
          '${q(opts.articulo)}', ' ', ' ', ' ',
          '${opts.deposito}', '${q(opts.partida)}',
          ${opts.cantUM1}, ${opts.cantUM2}, 0, 0,
          '${opts.fechaISO}', ' ', ' ', GETDATE(), '${USUARIO_SQL}'
        )
      `)
    }
  }

  return cmsID
}

// ─── Creación de una OP ───────────────────────────────────────────────────────

export async function crearOPparaLinea(
  pool: pkg.ConnectionPool,
  linea: LineaPlanilla,
  fechaISO: string,
  opts: OpcionesOP = {},
): Promise<{ orden: number; nroComp: string }> {
  const log = opts.log ?? (() => {})
  const dejarAbierta = opts.dejarAbierta ?? false
  const tx = new pkg.Transaction(pool)
  await tx.begin()
  const req = new pkg.Request(tx)

  try {
    const formula = linea.formulaCod
    if (!formula) throw new Error(`Línea ${linea.id} sin fórmula resuelta`)

    const frmProd = await producidoFormula(req, formula)
    const frmComps = await componentesFormula(req, formula)
    if (frmComps.length === 0) throw new Error(`Fórmula ${formula} sin componentes`)
    const frmProcs = await procesosFormula(req, formula)
    if (frmProcs.length === 0) throw new Error(`Fórmula ${formula} sin procesos`)

    // Multiplicador: cuántas veces la fórmula base entra en lo pedido
    const mult = linea.cantidad / frmProd.cantidadUM1
    if (!Number.isFinite(mult) || mult <= 0) {
      throw new Error(`Multiplicador inválido para ${linea.productoCod}`)
    }

    const artProd = await datosArticulo(req, linea.productoCod)

    // Datos de maestro de cada componente (unidad, tipo, si lleva partida)
    const artComps = new Map<string, DatosArticulo>()
    for (const c of frmComps) {
      artComps.set(c.componente, await datosArticulo(req, c.componente))
    }
    const cantProdUM1 = linea.cantidad
    const cantProdUM2 = frmProd.cantidadUM2 * mult

    // ── 1. Cabecera ────────────────────────────────────────────────────────
    const orden = await proximoNroOrden(req)
    const nroComp = await proximoNroComp(req)

    await req.query(`
      INSERT INTO ProdOrdenes (
        orden, alias, formula, producto, cantidad, ultimoNivel,
        fecha_creacion, resp_creacion, fecha_apertura, resp_apertura,
        fecha_entrega, estado, prioridad, partida,
        fecha_mod, resp_mod,
        sbart_CodGen, sbart_CodEle1, sbart_CodEle2, sbart_CodEle3,
        ord_Firme, ordtco_Circuito, ordtco_Cod, ord_NroComp
      )
      VALUES (
        ${orden}, '${pad8(orden)}', '${q(formula)}', '${q(linea.productoCod)}',
        ${cantProdUM1}, 0,
        '${fechaISO}', '${RESPONSABLE}', '${fechaISO}', '${RESPONSABLE}',
        '${fechaISO}', ${ESTADO_EN_EJECUCION}, 0, '${q(linea.lote)}',
        GETDATE(), '${RESPONSABLE}',
        '${q(linea.productoCod)}', ' ', ' ', ' ',
        'S', 'P', 'OP', '${nroComp}'
      )
    `)
    log(`  OP ${nroComp} (interna ${orden}) — ${linea.productoCod} x ${cantProdUM1}`)

    // ── 2. Procesos ────────────────────────────────────────────────────────
    // Va antes que producidos y componentes: ambos tienen FK hacia esta tabla
    // a traves de poppoo_Secuencia / pocpoo_Secuencia.
    for (const pr of frmProcs) {
      await req.query(`
        INSERT INTO ProdOrd_Procesos (
          pooord_Orden, poo_Secuencia, pooppr_Cod,
          poo_FInicio, poo_FFin, poo_Iniciado, poo_Previsto
        )
        VALUES (
          ${orden}, ${pr.secuencia}, '${q(pr.ppr_Cod)}',
          '${fechaISO}', '${fechaISO}', ${cantProdUM1}, ${cantProdUM1}
        )
      `)
    }

    // ── 3. Producido ───────────────────────────────────────────────────────
    await req.query(`
      INSERT INTO ProdOrd_Producidos (
        orden, paso, producto, tipo,
        cantidadUM1, cantidadUM2, consolidadoUM1, consolidadoUM2,
        UM1, UM2, deposito, tipoDeclaracion, prorateoCosto,
        sbart_CodGen, sbart_CodEle1, sbart_CodEle2, sbart_CodEle3,
        poppoo_Secuencia, pop_AvanceProc, pop_FInicio, pop_FFin
      )
      VALUES (
        ${orden}, ${frmProd.paso}, '${q(linea.productoCod)}', 'P',
        ${cantProdUM1}, ${cantProdUM2}, ${cantProdUM1}, ${cantProdUM2},
        '${artProd.claume_Cod1}', '${artProd.claume_Cod2}',
        '${DEPOSITO}', ${frmProd.tipoDeclaracion}, ${frmProd.prorateoCosto},
        '${q(linea.productoCod)}', ' ', ' ', ' ',
        ${frmProcs[0].secuencia}, 0, '${fechaISO}', '${fechaISO}'
      )
    `)

    // ── 4. Componentes ─────────────────────────────────────────────────────
    for (const c of frmComps) {
      const cant = c.cantidadUM1 * mult
      const ac = artComps.get(c.componente)!
      await req.query(`
        INSERT INTO ProdOrd_Componentes (
          orden, paso, componente, phantom,
          cantidadUM1, cantidadUM2, consolidadoUM1, consolidadoUM2,
          UM1, deposito, propBatch, tipoConsumo,
          sbart_CodGen, sbart_CodEle1, sbart_CodEle2, sbart_CodEle3,
          esClave, pocpoo_Secuencia, poc_PasoDecl, poc_AvanceProc,
          poc_FInicio, poc_FFin, poc_AfectaCosto, poc_PorcMer
        )
        VALUES (
          ${orden}, ${c.paso}, '${q(c.componente)}', '${q(c.phantom)}',
          ${cant}, 0, ${cant}, 0,
          '${ac.claume_Cod1}', '${DEPOSITO}', ${c.propBatch}, ${c.tipoConsumo},
          '${q(c.componente)}', ' ', ' ', ' ',
          ${c.esClave}, ${c.secuencia},
          ${c.pasoDecl === null ? "NULL" : c.pasoDecl}, 0,
          '${fechaISO}', '${fechaISO}', '${c.afectaCosto}', 0
        )
      `)
    }

    // ── 5. Programa ────────────────────────────────────────────────────────
    await req.query(`
      INSERT INTO ProdOrd_Programa (orden, centroTrabajo, fecha, turno, cantidad, fechaMod, resp)
      VALUES (${orden}, ${CENTRO_TRABAJO}, '${fechaISO}', ${TURNO}, ${cantProdUM1}, GETDATE(), '${RESPONSABLE}')
    `)

    // ── 6. Ingreso del producto terminado ──────────────────────────────────
    const nroEnt = await proximoNroMov(req, "ENT")
    const cmsEnt = await crearMovimiento(req, {
      tipo: "ENT", nro: nroEnt, fechaISO,
      articulo: linea.productoCod, art: artProd,
      cantUM1: cantProdUM1, cantUM2: cantProdUM2,
      partida: linea.lote, deposito: DEPOSITO,
    })

    await req.query(`
      INSERT INTO ProdDecl_Producidos (
        orden, indice, producto, fecha_Prod, turno_Prod, resp_Prod,
        partida, centroTrabajo, cantidadUM1, cantidadUM2, deposito,
        fecha_Decl, responsable, idMov, codEmpr, comprob,
        sbart_CodGen, sbart_CodEle1, sbart_CodEle2, sbart_CodEle3, pdppop_Paso
      )
      VALUES (
        ${orden}, 1, '${q(linea.productoCod)}', '${fechaISO}', ${TURNO}, 'PROD.ESTÁNDAR',
        '${q(linea.lote)}', ${CENTRO_TRABAJO}, ${cantProdUM1}, ${cantProdUM2}, '${DEPOSITO}',
        '${fechaISO}', '${RESPONSABLE}', ${cmsEnt}, 'CANE',
        '${comprobStr("ENT", pad8(nroEnt), fechaISO)}',
        '${q(linea.productoCod)}', ' ', ' ', ' ', ${frmProd.paso}
      )
    `)
    log(`    ENT ${pad8(nroEnt)} | ${linea.productoCod} +${cantProdUM1} (UM2: ${cantProdUM2}) | partida ${linea.lote}`)

    // ── 7. Consumo de insumos, con FIFO de partidas ────────────────────────
    for (const c of frmComps) {
      const cantTotal = c.cantidadUM1 * mult
      const artComp = artComps.get(c.componente)!
      const llevaPart = esFlagSi(artComp.art_StockPart)
      log(`    ${c.componente}: lleva partida = ${llevaPart} (art_StockPart='${artComp.art_StockPart}')`)

      if (!llevaPart) {
        const nroSal = await proximoNroMov(req, "SAL")
        const cmsSal = await crearMovimiento(req, {
          tipo: "SAL", nro: nroSal, fechaISO,
          articulo: c.componente, art: artComp,
          cantUM1: -cantTotal, cantUM2: 0,
          partida: "", deposito: DEPOSITO,
        })
        await insertarDeclComponente(req, orden, c, cmsSal, nroSal, fechaISO, cantTotal, "")
        log(`    SAL ${pad8(nroSal)} | ${c.componente} -${cantTotal} | sin partida`)
        continue
      }

      // Reparte el consumo entre partidas hasta cubrir la cantidad
      const partidas = await partidasFIFO(req, c.componente, DEPOSITO)
      let restante = cantTotal

      for (const p of partidas) {
        if (restante <= 0) break
        const cantDeEsta = Math.min(restante, p.stp_CantUM1)
        restante -= cantDeEsta

        const nroSal = await proximoNroMov(req, "SAL")
        const cmsSal = await crearMovimiento(req, {
          tipo: "SAL", nro: nroSal, fechaISO,
          articulo: c.componente, art: artComp,
          cantUM1: -cantDeEsta, cantUM2: 0,
          partida: p.stp_Partida, deposito: DEPOSITO,
        })
        await insertarDeclComponente(req, orden, c, cmsSal, nroSal, fechaISO, cantDeEsta, p.stp_Partida)
        log(`    SAL ${pad8(nroSal)} | ${c.componente} -${cantDeEsta} | partida ${p.stp_Partida}`)
      }

      if (restante > 0.0001) {
        throw new Error(
          `Stock insuficiente de ${c.componente}: faltan ${restante.toFixed(4)} de ${cantTotal}`,
        )
      }
    }

    // ── 8. Cierre de la orden ──────────────────────────────────────────────
    if (!dejarAbierta) {
      await req.query(`
        UPDATE ProdOrdenes
        SET estado = ${ESTADO_CERRADA}, fecha_mod = GETDATE(), resp_mod = '${RESPONSABLE}'
        WHERE orden = ${orden}
      `)
      log(`    Orden cerrada (estado ${ESTADO_CERRADA})`)
    }

    await tx.commit()
    return { orden, nroComp }
  } catch (err) {
    await tx.rollback()
    throw err
  }
}

async function insertarDeclComponente(
  req: pkg.Request,
  orden: number,
  c: CompFormula,
  cmsID: number,
  nroSal: number,
  fechaISO: string,
  cantidad: number,
  partida: string,
) {
  await req.query(`
    INSERT INTO ProdDecl_Componentes (
      orden, indice, insumo, fecha_Prod, turno_Prod, resp_Prod,
      partida, centroTrabajo, cantidadUM1, cantidadUM2, deposito,
      fecha_decl, responsable, idMov, codEmpr, comprob,
      moneda, TipCambio, sbart_CodGen,
      sbart_CodEle1, sbart_CodEle2, sbart_CodEle3, pdcpoc_Paso
    )
    VALUES (
      ${orden}, 1, '${q(c.componente)}', '${fechaISO}', ${TURNO}, 'CONS.ESTÁNDAR',
      '${q(partida) || " "}', ${CENTRO_TRABAJO}, ${cantidad}, 0, '${DEPOSITO}',
      '${fechaISO}', '${RESPONSABLE}', ${cmsID}, 'CANE',
      '${comprobStr("SAL", pad8(nroSal), fechaISO)}',
      '1', 'UNI', '${q(c.componente)}', ' ', ' ', ' ', ${c.paso}
    )
  `)
}