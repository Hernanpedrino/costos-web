import "dotenv/config";
import pkg from 'mssql';
const { ConnectionPool } = pkg;

const config: pkg.config = {
  server: '192.168.1.230',
  database: 'SBDACANE',
  user: process.env.BEJERMAN_USER!,
  password: process.env.BEJERMAN_PASSWORD!,
  options: {
    encrypt: false,
    trustServerCertificate: true,
  },
  port: 1433
};

// ─── Obtener próximo número de BP ────────────────────────────────────────────

async function obtenerProximoNroBP(pool: pkg.ConnectionPool): Promise<string> {
  const result = await pool.request().query(`
    SELECT ISNULL(MAX(CAST(cms_Nro AS BIGINT)), 0) + 1 AS proximoNro
    FROM CabMovS
    WHERE cmstco_Cod = 'BP'
      AND cms_CodPvt = '00006'
      AND cms_Letra = 'X'
      AND ISNUMERIC(cms_Nro) = 1
  `)
  const nro = result.recordset[0].proximoNro
  return String(nro).padStart(8, '0')
}

// ─── Crear BP para una NP ─────────────────────────────────────────────────────

export async function crearBPparaNP(
  pool: pkg.ConnectionPool,
  scvID: number,
  nroBP: string
): Promise<void> {
  const transaction = new pkg.Transaction(pool)
  await transaction.begin()

  try {
    const request = new pkg.Request(transaction)

    // 1. Obtener datos de la NP cabecera
    const cabResult = await request.query(`
      SELECT * FROM SegCabV WHERE scv_ID = ${scvID}
    `)
    const cab = cabResult.recordset[0]
    if (!cab) throw new Error(`NP ${scvID} no encontrada`)

    // 2. Obtener items con stock disponible
    const itemsResult = await request.query(`
      SELECT 
        d.*,
        ISNULL(stk.stk_CantUM1, 0) AS stockDisp,
        CASE 
          WHEN ISNULL(stk.stk_CantUM1, 0) >= d.sdv_CPendRtUM1 THEN d.sdv_CPendRtUM1
          WHEN ISNULL(stk.stk_CantUM1, 0) > 0 THEN ISNULL(stk.stk_CantUM1, 0)
          ELSE 0
        END AS cantAProcesar
      FROM SegDetV d
      LEFT JOIN Stock stk ON stk.stkart_CodGen = d.sdvart_CodGen
        AND stk.stkart_CodEle1 = d.sdvart_CodEle1
        AND stk.stkart_CodEle2 = d.sdvart_CodEle2
        AND stk.stkart_CodEle3 = d.sdvart_CodEle3
        AND stk.stkdep_Cod = d.sdvdep_Cod
      WHERE d.sdvscv_ID = ${scvID}
        AND d.sdv_TipoIt = 'A'
        AND d.sdv_CPendRtUM1 > 0
    `)

    const items = itemsResult.recordset.filter((i: any) => Number(i.cantAProcesar) > 0)
    if (items.length === 0) throw new Error(`NP ${scvID} sin items con stock disponible`)

    const hoy = new Date()
    const fechaStr = hoy.toISOString().split('T')[0]

    // 3. Insertar CabMovS
    const insertCms = await request.query(`
      INSERT INTO CabMovS (
        cmsemp_Codigo, cmssuc_Cod, cms_FComp,
        cms_Circuito, cmstco_Cod, cmsptr_Cod, cms_CodPvt,
        cmspvt_CodIN, cms_Letra, cms_Nro, cmscli_Cod,
        cms_CodApe, cms_FecMod, cms_Convert,
        cms_FContab, cms_PasadoCG, cmsusu_Codigo
      )
      OUTPUT INSERTED.cms_ID
      VALUES (
        'CANE', ' ', '${fechaStr}',
        'V', 'BP', '7', '00006',
        '00006', 'X', '${nroBP}', '${cab.scvcli_Cod}',
        ' ', GETDATE(), ' ',
        '${fechaStr}', 'C', 'HER'
      )
    `)
    const cmsID = insertCms.recordset[0].cms_ID
    console.log(`  CabMovS ID: ${cmsID}`)

    // 4. Insertar SegCabV (BP)
    const insertScv = await request.query(`
      INSERT INTO SegCabV (
        scvemp_Codigo, scvsuc_Cod, scvptr_Cod, scvpre_Cod,
        scv_OrigenComp, scv_FContab, scv_FDDJJ, scv_IncluDDJJ,
        scv_Estado, scv_FIngreso, scv_FEmision, scv_FEntrega,
        scvcli_Cod, scvsiv_Cod, scvcli_RazSoc, scvcli_Direc,
        scvcli_Loc, scvcli_CodPos, scvprv_Codigo, scvtdc_Cod,
        scvcli_CUIT, scvcli_NroIB, scvprv_CodigoIB,
        scvmon_codigo, scvmtca_codigo, scvmcot_cotiza,
        scvdlp_Tipo, scvdco_Tasa1, scvdco_Tasa2, scvdco_Tasa3,
        scvdfi_Tasa, scvdrv_Tasa,
        scv_ImpDtoCom, scv_ImpDtoFin, scv_ImpDtoPie,
        scv_Mens, scv_NroRt, scv_PlazoEnt, scv_DiasMantOf,
        scv_ActStock, scv_CompStock, scv_Remite, scv_Fact,
        scv_GenPendRt, scv_GenPendFc, scv_TransfStk, scv_SgnStk,
        scv_LugarLen, scv_LocLen, scv_CodPosLen, scv_HorarioLen,
        scv_TotKilos, scv_TotBultos, scv_Anticipo,
        scv_CodApe, scv_BUso, scv_Lote, scv_ControloCrDisp,
        scv_CumpXPgm, scv_PasadoACC, scv_Convert, scv_ModVenc,
        scv_ControloMora, scv_FecMod, scvusu_Codigo,
        scv_CotizaClausula, scv_CancelaMismaMoneda,
        scvemp_CodigoMS, scvsuc_CodMS, scvcms_ID,
        scvdlp_Cod, scvcvt_Cod, scvven_Cod, scvdep_Cod,
        scv_CantHojas, scvpai_Cod
      )
      OUTPUT INSERTED.scv_ID
      SELECT
        scvemp_Codigo, scvsuc_Cod, '7', '1',
        'R', '${fechaStr}', '${fechaStr}', scv_IncluDDJJ,
        'S', '${fechaStr}', '${fechaStr}', '${fechaStr}',
        scvcli_Cod, scvsiv_Cod, scvcli_RazSoc, scvcli_Direc,
        scvcli_Loc, scvcli_CodPos, scvprv_Codigo, scvtdc_Cod,
        scvcli_CUIT, scvcli_NroIB, scvprv_CodigoIB,
        scvmon_codigo, scvmtca_codigo, scvmcot_cotiza,
        scvdlp_Tipo, scvdco_Tasa1, scvdco_Tasa2, scvdco_Tasa3,
        scvdfi_Tasa, scvdrv_Tasa,
        0, 0, 0,
        ' ', ' ', 0, 0,
        1, 1, 1, 0,
        0, 1, 0, -1,
        ' ', ' ', ' ', ' ',
        0, 0, 0,
        ' ', 'N', ' ', 'N',
        0, 0, ' ', 0,
        'N', GETDATE(), 'HER',
        0, 'N',
        'CANE', ' ', ${cmsID},
        scvdlp_Cod, scvcvt_Cod, scvven_Cod, scvdep_Cod,
        0, 'ARG'
      FROM SegCabV
      WHERE scv_ID = ${scvID}
    `)
    const newScvID = insertScv.recordset[0].scv_ID
    console.log(`  SegCabV ID: ${newScvID}`)

    // 5. Insertar SegTiposV
    await request.query(`
      INSERT INTO SegTiposV (
        spvemp_Codigo, spvsuc_Cod, spvscv_ID,
        spvtco_Circuito, spvtco_Cod, spvtco_TipoFijo,
        spv_Orig, spv_Letra, spv_CodPvt, spvpvt_CodIN, spv_Nro,
        spvtco_Remite, spvtco_Fact, spvtco_GenPendRt, spvtco_GenPendFc,
        spvtco_TransfStk, spvtco_AcStk, spvtco_SgnStk,
        spv_OrdenLis, spv_BPM
      )
      VALUES (
        'CANE', ' ', ${newScvID},
        'V', 'BP', 'RT',
        'O', 'X', '00006', '00006', '${nroBP}',
        1, 0, 0, 1,
        0, 1, -1,
        1, 'N'
      )
    `)
    console.log(`  SegTiposV insertado`)

    // 6. Insertar en SegTotV — totales impositivos por tasa de IVA
    const totalesResult = await request.query(`
      SELECT 
        sdvtiv_Cod,
        SUM(sdv_ImpTot) AS impTotal
      FROM SegDetV
      WHERE sdvscv_ID = ${scvID}
        AND sdv_TipoIt = 'A'
        AND sdv_CPendRtUM1 > 0
      GROUP BY sdvtiv_Cod
    `)

    for (const tot of totalesResult.recordset) {
      const tasa = tot.sdvtiv_Cod === '01' ? 21 : tot.sdvtiv_Cod === '02' ? 10.5 : 0
      const impNeto = tasa > 0
        ? Number(tot.impTotal) / (1 + tasa / 100)
        : Number(tot.impTotal)
      const imp1 = Number(tot.impTotal) - impNeto

      await request.query(`
      INSERT INTO SegTotV (
        stvemp_Codigo, stvsuc_Cod, stvscv_ID,
        stv_FContab, stv_FDDJJ, stv_IncluDDJJ,
        stv_Marca2, stv_TipoPropDesc,
        stvtiv_Cod, stv_Tasa1, stv_Tasa2,
        stv_ImpNetoEmi, stv_Imp1Emi, stv_Imp2Emi,
        stv_AplicaDesc, stv_REModMan, stv_BUso,
        stv_Base, stv_PorcentajeRes
      )
      VALUES (
        'CANE', ' ', ${newScvID},
        '${fechaStr}', '${fechaStr}', 255,
        '1', '1',
        '${tot.sdvtiv_Cod}', ${tasa}, 0,
        ${impNeto.toFixed(2)}, ${imp1.toFixed(2)}, 0,
        'S', 0, 'N',
        0, 0
      )
    `)
    }
    console.log(`  SegTotV insertado`)

    // 7. Procesar items con FIFO por partidas

    let nReng = 1
    const itemsProcessados: { sdv_ID: number; cantProcesada: number }[] = []

    for (const item of items) {
      const cantAProcesar = Number(item.cantAProcesar)
      const llevaPart = item.sdv_LlevaPart

      if (!llevaPart) {
        // ── Artículo sin partida ─────────────────────────────────────────────
        const insertMst = await request.query(`
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
          OUTPUT INSERTED.mst_ID
          VALUES (
            'CANE', ' ', ${cmsID},
            '2', '${item.sdvart_CodGen}', '${item.sdvart_CodEle1?.trim() || ' '}', '${item.sdvart_CodEle2?.trim() || ' '}', '${item.sdvart_CodEle3?.trim() || ' '}',
            '${item.sdvdep_Cod}', ${-cantAProcesar}, ${-cantAProcesar},
            0, 0,
            ' ', ' ',
            0, ' ', 'N',
            ' ', 0,
            'ADI', 'ADI'
          )
        `)
        const mstID = insertMst.recordset[0].mst_ID

        await request.query(`
          INSERT INTO SegDetV (
            sdvemp_Codigo, sdvsuc_Cod, sdvscv_ID,
            sdv_FEntrega, sdv_FContab, sdv_FDDJJ, sdv_IncluDDJJ,
            sdv_NReng, sdv_TipoIt,
            sdvart_CodGen, sdvart_CodEle1, sdvart_CodEle2, sdvart_CodEle3,
            sdv_Desc, sdvume_Cod1, sdvume_Desc1, sdvume_Cod2, sdvume_Desc2,
            sdv_CantUM1, sdv_CantUM2,
            sdv_CantDim1, sdv_CantDim2, sdv_CantDim3,
            sdv_CBonUM1, sdv_CBonUM2,
            sdv_CRtUM1, sdv_CRtUM2,
            sdv_CBonRtUM1, sdv_CBonRtUM2,
            sdv_CFcUM1, sdv_CFcUM2,
            sdv_CBonFcUM1, sdv_CBonFcUM2,
            sdv_CPendRtUM1, sdv_CPendRtUM2,
            sdv_CBonPendRtUM1, sdv_CBonPendRtUM2,
            sdv_CPendFcUM1, sdv_CPendFcUM2,
            sdv_CBonPendFcUM1, sdv_CBonPendFcUM2,
            sdv_TasaBon, sdv_ImpBon,
            sdv_PrecioUn, sdvart_TipoTasaVta, sdvtiv_Cod,
            sdv_ImpNG, sdv_ImpTot,
            sdvstp_Partida, sdv_Serie, sdv_ActStock,
            sdv_PesoBr, sdv_CantEnv, sdvdep_Cod, sdv_FactorConv,
            sdv_PrModif, sdv_PrCosto, sdv_Kit, sdv_RengKit,
            sdv_PorcCalc, sdv_BUso, sdv_LlevaPart, sdv_LlevaSerie,
            sdvemp_CodigoMS, sdvsuc_CodMS, sdvmst_ID,
            sdv_NoComputable, sdv_ImporteDefi, sdv_EsPromo
          )
          SELECT
            sdvemp_Codigo, sdvsuc_Cod, ${newScvID},
            '${fechaStr}', '${fechaStr}', '${fechaStr}', sdv_IncluDDJJ,
            ${nReng}, sdv_TipoIt,
            sdvart_CodGen, sdvart_CodEle1, sdvart_CodEle2, sdvart_CodEle3,
            sdv_Desc, sdvume_Cod1, sdvume_Desc1, sdvume_Cod2, sdvume_Desc2,
            ${cantAProcesar}, ${cantAProcesar},
            sdv_CantDim1, sdv_CantDim2, sdv_CantDim3,
            0, 0,
            ${cantAProcesar}, ${cantAProcesar},
            0, 0,
            0, 0,
            0, 0,
            0, 0,
            0, 0,
            ${cantAProcesar}, ${cantAProcesar},
            0, 0,
            0, 0,
            sdv_PrecioUn, sdvart_TipoTasaVta, sdvtiv_Cod,
            0, sdv_ImpTot,
            ' ', sdv_Serie, '4',
            0, 1, sdvdep_Cod, 1,
            0, sdv_PrCosto, ' ', 0,
            0, 'N', 0, 0,
            'CANE', ' ', ${mstID},
            0, 0, 'N'
          FROM SegDetV
          WHERE sdv_ID = ${item.sdv_ID}
        `)

        console.log(`  Sin partida: ${item.sdvart_CodGen} | Cant: ${cantAProcesar} | mst_ID: ${mstID}`)
        itemsProcessados.push({ sdv_ID: item.sdv_ID, cantProcesada: cantAProcesar })
        nReng++

      } else {
        // ── Artículo con partida — FIFO por stp_FechVtoIng ──────────────────
        const partidasResult = await request.query(`
          SELECT stp_Partida, stp_CantUM1, stp_FechVtoIng
          FROM StockPar
          WHERE stpart_CodGen = '${item.sdvart_CodGen}'
            AND stpart_CodEle1 = '${item.sdvart_CodEle1?.trim() || ' '}'
            AND stpart_CodEle2 = '${item.sdvart_CodEle2?.trim() || ' '}'
            AND stpart_CodEle3 = '${item.sdvart_CodEle3?.trim() || ' '}'
            AND stpdep_Cod = '${item.sdvdep_Cod}'
            AND stp_CantUM1 > 0
          ORDER BY stp_FechVtoIng ASC
        `)

        const partidas = partidasResult.recordset
        let restante = cantAProcesar
        let cantProcesadaTotal = 0

        for (const partida of partidas) {
          if (restante <= 0) break

          const cantDeEstaPartida = Math.min(restante, Number(partida.stp_CantUM1))
          restante -= cantDeEstaPartida
          cantProcesadaTotal += cantDeEstaPartida

          const insertMst = await request.query(`
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
            OUTPUT INSERTED.mst_ID
            VALUES (
              'CANE', ' ', ${cmsID},
              '2', '${item.sdvart_CodGen}', '${item.sdvart_CodEle1?.trim() || ' '}', '${item.sdvart_CodEle2?.trim() || ' '}', '${item.sdvart_CodEle3?.trim() || ' '}',
              '${item.sdvdep_Cod}', ${-cantDeEstaPartida}, ${-cantDeEstaPartida},
              0, 0,
              '${partida.stp_Partida.trim()}', ' ',
              0, ' ', 'N',
              ' ', 0,
              'ADI', 'ADI'
            )
          `)
          const mstID = insertMst.recordset[0].mst_ID

          await request.query(`
            INSERT INTO SegDetV (
              sdvemp_Codigo, sdvsuc_Cod, sdvscv_ID,
              sdv_FEntrega, sdv_FContab, sdv_FDDJJ, sdv_IncluDDJJ,
              sdv_NReng, sdv_TipoIt,
              sdvart_CodGen, sdvart_CodEle1, sdvart_CodEle2, sdvart_CodEle3,
              sdv_Desc, sdvume_Cod1, sdvume_Desc1, sdvume_Cod2, sdvume_Desc2,
              sdv_CantUM1, sdv_CantUM2,
              sdv_CantDim1, sdv_CantDim2, sdv_CantDim3,
              sdv_CBonUM1, sdv_CBonUM2,
              sdv_CRtUM1, sdv_CRtUM2,
              sdv_CBonRtUM1, sdv_CBonRtUM2,
              sdv_CFcUM1, sdv_CFcUM2,
              sdv_CBonFcUM1, sdv_CBonFcUM2,
              sdv_CPendRtUM1, sdv_CPendRtUM2,
              sdv_CBonPendRtUM1, sdv_CBonPendRtUM2,
              sdv_CPendFcUM1, sdv_CPendFcUM2,
              sdv_CBonPendFcUM1, sdv_CBonPendFcUM2,
              sdv_TasaBon, sdv_ImpBon,
              sdv_PrecioUn, sdvart_TipoTasaVta, sdvtiv_Cod,
              sdv_ImpNG, sdv_ImpTot,
              sdvstp_Partida, sdv_Serie, sdv_ActStock,
              sdv_PesoBr, sdv_CantEnv, sdvdep_Cod, sdv_FactorConv,
              sdv_PrModif, sdv_PrCosto, sdv_Kit, sdv_RengKit,
              sdv_PorcCalc, sdv_BUso, sdv_LlevaPart, sdv_LlevaSerie,
              sdvemp_CodigoMS, sdvsuc_CodMS, sdvmst_ID,
              sdv_NoComputable, sdv_ImporteDefi, sdv_EsPromo
            )
            SELECT
              sdvemp_Codigo, sdvsuc_Cod, ${newScvID},
              '${fechaStr}', '${fechaStr}', '${fechaStr}', sdv_IncluDDJJ,
              ${nReng}, sdv_TipoIt,
              sdvart_CodGen, sdvart_CodEle1, sdvart_CodEle2, sdvart_CodEle3,
              sdv_Desc, sdvume_Cod1, sdvume_Desc1, sdvume_Cod2, sdvume_Desc2,
              ${cantDeEstaPartida}, ${cantDeEstaPartida},
              sdv_CantDim1, sdv_CantDim2, sdv_CantDim3,
              0, 0,
              ${cantDeEstaPartida}, ${cantDeEstaPartida},
              0, 0,
              0, 0,
              0, 0,
              0, 0,
              0, 0,
              ${cantDeEstaPartida}, ${cantDeEstaPartida},
              0, 0,
              0, 0,
              sdv_PrecioUn, sdvart_TipoTasaVta, sdvtiv_Cod,
              0, sdv_ImpTot,
              '${partida.stp_Partida.trim()}', sdv_Serie, '4',
              0, 1, sdvdep_Cod, 1,
              0, sdv_PrCosto, ' ', 0,
              0, 'N', 1, 0,
              'CANE', ' ', ${mstID},
              0, 0, 'N'
            FROM SegDetV
            WHERE sdv_ID = ${item.sdv_ID}
          `)

          console.log(`  Con partida: ${item.sdvart_CodGen} | Partida: ${partida.stp_Partida.trim()} | Cant: ${cantDeEstaPartida} | mst_ID: ${mstID}`)
          nReng++
        }

        itemsProcessados.push({ sdv_ID: item.sdv_ID, cantProcesada: cantProcesadaTotal })
      }
    }

    // 8. Actualizar pendientes en la NP original
    for (const proc of itemsProcessados) {
      await request.query(`
        UPDATE SegDetV
        SET 
          sdv_CPendRtUM1 = sdv_CPendRtUM1 - ${proc.cantProcesada},
          sdv_CPendRtUM2 = sdv_CPendRtUM2 - ${proc.cantProcesada},
          sdv_CPendFcUM1 = sdv_CPendFcUM1 - ${proc.cantProcesada},
          sdv_CPendFcUM2 = sdv_CPendFcUM2 - ${proc.cantProcesada},
          sdv_CBonPendRtUM1 = 0,
          sdv_CBonPendRtUM2 = 0,
          sdv_CBonPendFcUM1 = 0,
          sdv_CBonPendFcUM2 = 0
        WHERE sdv_ID = ${proc.sdv_ID}
      `)
    }
    console.log(`  SegDetV actualizado — pendientes reducidos`)

    await transaction.commit()
    console.log(`\n✅ BP creado exitosamente`)
    console.log(`   Nro BP:     ${nroBP}`)
    console.log(`   SegCabV ID: ${newScvID}`)
    console.log(`   Items:      ${items.length}`)

  } catch (err) {
    await transaction.rollback()
    console.error('🔄 Rollback ejecutado')
    throw err
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  let pool: pkg.ConnectionPool | null = null

  try {
    console.log('🔌 Conectando a SBDACANE...')
    pool = await new ConnectionPool(config).connect()
    console.log('✅ Conectado\n')

    const nroBP = await obtenerProximoNroBP(pool)
    console.log(`  Próximo Nro BP: ${nroBP}`)

    // ← Cambiar el scv_ID por la NP a procesar
    await crearBPparaNP(pool, 167062, nroBP)

  } catch (err) {
    console.error('❌ Error:', err)
  } finally {
    if (pool) await pool.close()
  }
}

if (process.argv[1]?.includes('baja-np-prueba')) { main() }
export { }