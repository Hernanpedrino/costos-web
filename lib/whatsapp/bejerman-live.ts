// lib/whatsapp/bejerman-live.ts
// Consultas EN VIVO contra Bejerman (SQL Server, SBDACANE) — a diferencia de
// bejerman-lookup.ts, que lee de la base MySQL sincronizada por el ETL.
//
// El stock necesita leerse en vivo: Bejerman no mantiene Stock/StockPar
// actualizados vía triggers automáticos y el ETL no los sincroniza (son los
// mismos saldos que se repararon manualmente — ver reparar-saldos-stock.sql).
// Mostrarle a un cliente un stock desactualizado podría hacer que el bot
// confirme un pedido que en realidad no se puede cubrir.

import { getBejermanPool } from "@/lib/bejerman-op";

const DEPOSITO = "1"; // mismo depósito por defecto que usa crearOPparaLinea

const q = (v: string) => v.replace(/'/g, "''");

export interface StockPorPartida {
  partida: string;
  cantidad: number;
}

export interface ResultadoStock {
  /** Stock total disponible en el depósito, sumando todas las partidas si las tiene. */
  disponible: number;
  /** true si el artículo maneja partidas (art_StockPart) */
  llevaPartida: boolean;
  /** Detalle por partida, solo si llevaPartida es true */
  partidas: StockPorPartida[];
}

/**
 * Consulta el stock disponible de un artículo en el depósito por defecto.
 * Replica la misma lógica de lectura que usa crearOPparaLinea / baja-np-prueba
 * para no divergir del criterio ya validado en producción.
 */
export async function consultarStock(codigoArticulo: string): Promise<ResultadoStock> {
  const pool = await getBejermanPool();
  const codigo = q(codigoArticulo);

  const rArt = await pool.request().query(`
    SELECT art_StockPart FROM Articulos WHERE art_CodGen = '${codigo}'
  `);
  if (rArt.recordset.length === 0) {
    throw new Error(`Artículo ${codigoArticulo} inexistente en Bejerman`);
  }

  const llevaPartida = String(rArt.recordset[0].art_StockPart ?? "0").trim().toUpperCase();
  const tienePartida = llevaPartida === "1" || llevaPartida === "S" || llevaPartida === "SI";

  if (!tienePartida) {
    const rStock = await pool.request().query(`
      SELECT ISNULL(stk_CantUM1, 0) AS cant
      FROM Stock
      WHERE stkart_CodGen = '${codigo}' AND stkdep_Cod = '${DEPOSITO}'
        AND stkart_CodEle1 = ' ' AND stkart_CodEle2 = ' ' AND stkart_CodEle3 = ' '
    `);
    const disponible = rStock.recordset.length > 0 ? Number(rStock.recordset[0].cant) : 0;
    return { disponible, llevaPartida: false, partidas: [] };
  }

  const rPart = await pool.request().query(`
    SELECT LTRIM(RTRIM(stp_Partida)) AS partida, stp_CantUM1 AS cantidad
    FROM StockPar
    WHERE stpart_CodGen = '${codigo}' AND stpdep_Cod = '${DEPOSITO}'
      AND stp_CantUM1 > 0
    ORDER BY stp_FechVtoIng ASC, stp_Partida ASC
  `);

  const partidas: StockPorPartida[] = rPart.recordset.map((p: { partida: string; cantidad: number }) => ({
    partida: p.partida,
    cantidad: Number(p.cantidad),
  }));

  const disponible = partidas.reduce((acc, p) => acc + p.cantidad, 0);
  return { disponible, llevaPartida: true, partidas };
}
