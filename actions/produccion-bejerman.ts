"use server"

// actions/produccion-bejerman.ts
//
// Consultas en vivo contra SBDACANE para la planilla de producción.
// No usa el ETL porque los saldos de partidas cambian durante el día y la
// previsualización tiene que reflejar lo que el script va a consumir realmente.

import pkg from "mssql"

const { ConnectionPool } = pkg

const config: pkg.config = {
  server: process.env.BEJERMAN_SERVER!,
  database: "SBDACANE",
  user: process.env.BEJERMAN_USER!,
  password: process.env.BEJERMAN_PASSWORD!,
  options: { encrypt: false, trustServerCertificate: true },
  port: 1433,
  pool: { max: 4, min: 0, idleTimeoutMillis: 30000 },
}

// Pool reutilizado entre requests, igual criterio que el cliente de Prisma
const globalForMssql = globalThis as unknown as { bejermanPool?: Promise<pkg.ConnectionPool> }

function getPool(): Promise<pkg.ConnectionPool> {
  if (!globalForMssql.bejermanPool) {
    globalForMssql.bejermanPool = new ConnectionPool(config).connect()
  }
  return globalForMssql.bejermanPool
}

const DEPOSITO = "1"

const esFlagSi = (v: unknown): boolean => {
  const t = String(v ?? "").trim().toUpperCase()
  return t === "1" || t === "S" || t === "TRUE" || t === "SI"
}

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface PartidaConsumo {
  partida: string
  cantidad: number      // cuánto se tomaría de esta partida
  saldo: number         // saldo actual de la partida
  fecha: string | null  // fecha de vto / ingreso, la que ordena el FIFO
}

export interface ConsumoInsumo {
  componente: string
  descripcion: string
  cantidad: number          // cantidad total a consumir
  unidad: string
  llevaPartida: boolean
  esClave: boolean          // marca el insumo que define la trazabilidad
  partidas: PartidaConsumo[]
  faltante: number          // > 0 si el stock no alcanza
}

export interface PrevisionConsumo {
  formula: string
  insumos: ConsumoInsumo[]
  loteSugerido: string | null   // partida del insumo clave, si es una sola
  advertencias: string[]
}

// ─── Consulta ─────────────────────────────────────────────────────────────────

/**
 * Explota la fórmula del producto para la cantidad indicada y resuelve, con el
 * mismo criterio FIFO que usa el script, de qué partidas saldría cada insumo.
 */
export async function previsualizarConsumoAction(
  productoCod: string,
  cantidad: number,
): Promise<PrevisionConsumo | null> {
  if (!productoCod || !Number.isFinite(cantidad) || cantidad <= 0) return null

  try {
    const pool = await getPool()
    const req = pool.request()
    const advertencias: string[] = []

    // Fórmula vigente y cantidad base del producido
    const rFrm = await req.query(`
      SELECT TOP 1 p.formula, p.cantidadUM1
      FROM ProdFrm_Producidos p
      WHERE p.producto = '${productoCod.replace(/'/g, "''")}'
    `)
    if (rFrm.recordset.length === 0) return null

    const formula: string = String(rFrm.recordset[0].formula).trim()
    const cantBase = Number(rFrm.recordset[0].cantidadUM1)
    const mult = cantidad / cantBase

    // Componentes con su descripción, unidad y si llevan partida
    const rComp = await pool.request().query(`
      SELECT c.paso, c.componente, c.cantidadUM1, c.esClave,
             a.art_DescGen, a.art_StockPart,
             ISNULL(cl.claume_Cod1, '') AS unidad
      FROM ProdFrm_Componentes c
      LEFT JOIN Articulos a ON a.art_CodGen = c.componente
      LEFT JOIN ClasArt cl  ON cl.cla_Cod  = a.artcla_Cod
      WHERE c.formula = '${formula.replace(/'/g, "''")}'
      ORDER BY c.paso
    `)

    const insumos: ConsumoInsumo[] = []

    for (const c of rComp.recordset) {
      const componente = String(c.componente).trim()
      const cantTotal = Number(c.cantidadUM1) * mult
      const llevaPartida = esFlagSi(c.art_StockPart)
      const esClave = Number(c.esClave ?? 0) === 1

      const insumo: ConsumoInsumo = {
        componente,
        descripcion: (c.art_DescGen || componente).trim(),
        cantidad: cantTotal,
        unidad: (c.unidad || "").trim(),
        llevaPartida,
        esClave,
        partidas: [],
        faltante: 0,
      }

      if (!llevaPartida) {
        insumos.push(insumo)
        continue
      }

      const rPart = await pool.request().query(`
        SELECT LTRIM(RTRIM(stp_Partida)) AS partida, stp_CantUM1, stp_FechVtoIng
        FROM StockPar
        WHERE stpart_CodGen = '${componente.replace(/'/g, "''")}'
          AND stpdep_Cod = '${DEPOSITO}' AND stp_CantUM1 > 0
        ORDER BY stp_FechVtoIng ASC, stp_Partida ASC
      `)

      let restante = cantTotal
      for (const p of rPart.recordset) {
        if (restante <= 0) break
        const saldo = Number(p.stp_CantUM1)
        const toma = Math.min(restante, saldo)
        restante -= toma
        insumo.partidas.push({
          partida: String(p.partida).trim(),
          cantidad: toma,
          saldo,
          fecha: p.stp_FechVtoIng ? new Date(p.stp_FechVtoIng).toISOString().slice(0, 10) : null,
        })
      }

      if (restante > 0.0001) {
        insumo.faltante = restante
        advertencias.push(
          `Stock insuficiente de ${insumo.descripcion}: faltan ${restante.toFixed(2)} ${insumo.unidad}`,
        )
      }

      insumos.push(insumo)
    }

    // Lote sugerido: la partida del insumo clave, solo si sale de una sola
    let loteSugerido: string | null = null
    const clave = insumos.find(i => i.esClave && i.llevaPartida)
    if (clave) {
      if (clave.partidas.length === 1) {
        loteSugerido = clave.partidas[0].partida
      } else if (clave.partidas.length > 1) {
        advertencias.push(
          `El consumo de ${clave.descripcion} abarca ${clave.partidas.length} partidas, ` +
          `así que no hay un único lote de origen. Elegí el lote a mano.`,
        )
      }
    }

    return { formula, insumos, loteSugerido, advertencias }
  } catch (err: any) {
    console.error("previsualizarConsumoAction:", err)
    return null
  }
}
