// lib/whatsapp/bejerman-live.ts
// Consultas EN VIVO contra Bejerman (SQL Server, SBDACANE) — a diferencia de
// bejerman-lookup.ts, que lee de la base MySQL sincronizada por el ETL.
//
// El stock necesita leerse en vivo: Bejerman no mantiene Stock/StockPar
// actualizados vía triggers automáticos y el ETL no los sincroniza (son los
// mismos saldos que se repararon manualmente — ver reparar-saldos-stock.sql).
// Mostrarle a un cliente un stock desactualizado podría hacer que el bot
// confirme un pedido que en realidad no se puede cubrir.
//
// Variantes: en Bejerman el stock es por CodGen+CodEle1+CodEle2+CodEle3. Los
// CodEle vacíos se guardan como ' ' (y alguno puede haber quedado NULL), así
// que siempre se comparan con LTRIM(RTRIM(ISNULL(x,''))) contra el valor
// trimmeado ('' = sin variante).

import { getBejermanPool, esFlagSi } from "@/lib/bejerman-op";
import { claveVariante } from "./bejerman-lookup";

const DEPOSITO = "1"; // mismo depósito por defecto que usa crearOPparaLinea

const q = (v: string) => v.replace(/'/g, "''");

/** CodEle normalizado para comparar en SQL: LTRIM(RTRIM(ISNULL(col,''))) */
const ele = (col: string) => `LTRIM(RTRIM(ISNULL(${col}, '')))`;

export interface VarianteStock {
  codEle1: string;
  codEle2: string;
  codEle3: string;
}

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
  /** Unidad de venta (ClasArt.claume_Cod1): 'UN', 'KG', 'MT', 'CJ', 'LT'. 'UN' si no tiene. */
  unidad: string;
}

/**
 * Consulta el stock disponible de un artículo (o de una variante puntual) en
 * el depósito por defecto. Replica la misma lógica de lectura que usa
 * crearOPparaLinea / baja-np-prueba para no divergir del criterio ya validado
 * en producción.
 *
 * Sin `variante` se consulta la fila sin elementos (CodEle vacíos): para un
 * artículo con variantes eso da 0 — usar la variante o consultarStockVariantes.
 */
export async function consultarStock(
  codigoArticulo: string,
  variante?: VarianteStock
): Promise<ResultadoStock> {
  const pool = await getBejermanPool();
  const codigo = q(codigoArticulo.trim());
  const e1 = q((variante?.codEle1 ?? "").trim());
  const e2 = q((variante?.codEle2 ?? "").trim());
  const e3 = q((variante?.codEle3 ?? "").trim());

  // Con variante, el flag de partida se lee de esa fila; sin variante, de la
  // genérica (art_Gen = 1) si existe.
  const rArt = await pool.request().query(`
    SELECT TOP 1 a.art_StockPart, LTRIM(RTRIM(ISNULL(c.claume_Cod1, ''))) AS unidad
    FROM Articulos a
    LEFT JOIN ClasArt c ON c.cla_Cod = a.artcla_Cod
    WHERE a.art_CodGen = '${codigo}'
      ${variante ? `AND ${ele("a.art_CodEle1")} = '${e1}' AND ${ele("a.art_CodEle2")} = '${e2}' AND ${ele("a.art_CodEle3")} = '${e3}'` : ""}
    ORDER BY a.art_Gen DESC
  `);
  if (rArt.recordset.length === 0) {
    const detalle = variante ? ` (variante ${claveVariante(e1, e2, e3)})` : "";
    throw new Error(`Artículo ${codigoArticulo}${detalle} inexistente en Bejerman`);
  }

  // art_StockPart es bit: mssql lo devuelve como boolean ('true'/'false')
  const llevaPartida = esFlagSi(rArt.recordset[0].art_StockPart);
  const unidad = String(rArt.recordset[0].unidad || "UN").toUpperCase();

  if (!llevaPartida) {
    const rStock = await pool.request().query(`
      SELECT ISNULL(SUM(stk_CantUM1), 0) AS cant
      FROM Stock
      WHERE stkart_CodGen = '${codigo}' AND stkdep_Cod = '${DEPOSITO}'
        AND ${ele("stkart_CodEle1")} = '${e1}'
        AND ${ele("stkart_CodEle2")} = '${e2}'
        AND ${ele("stkart_CodEle3")} = '${e3}'
    `);
    const disponible = Number(rStock.recordset[0]?.cant ?? 0);
    return { disponible, llevaPartida: false, partidas: [], unidad };
  }

  const rPart = await pool.request().query(`
    SELECT LTRIM(RTRIM(stp_Partida)) AS partida, stp_CantUM1 AS cantidad
    FROM StockPar
    WHERE stpart_CodGen = '${codigo}' AND stpdep_Cod = '${DEPOSITO}'
      AND ${ele("stpart_CodEle1")} = '${e1}'
      AND ${ele("stpart_CodEle2")} = '${e2}'
      AND ${ele("stpart_CodEle3")} = '${e3}'
      AND stp_CantUM1 > 0
    ORDER BY stp_FechVtoIng ASC, stp_Partida ASC
  `);

  const partidas: StockPorPartida[] = rPart.recordset.map((p: { partida: string; cantidad: number }) => ({
    partida: p.partida,
    cantidad: Number(p.cantidad),
  }));

  const disponible = partidas.reduce((acc, p) => acc + p.cantidad, 0);
  return { disponible, llevaPartida: true, partidas, unidad };
}

/**
 * Stock en el depósito por defecto de TODAS las variantes de un artículo, en
 * una sola consulta. Devuelve Map<claveVariante(e1,e2,e3), cantidad> con una
 * entrada por cada fila de Articulos del CodGen (las que no tienen stock
 * vienen en 0). Un artículo sin variantes devuelve una sola clave "~~".
 *
 * Por variante: si lleva partida (art_StockPart) se suma StockPar con
 * stp_CantUM1 > 0; si no, Stock — el mismo criterio que consultarStock.
 */
export async function consultarStockVariantes(codGen: string): Promise<Map<string, number>> {
  const pool = await getBejermanPool();
  const codigo = q(codGen.trim());

  const r = await pool.request().query(`
    SELECT a.e1, a.e2, a.e3, a.art_StockPart,
           ISNULL(s.cant, 0) AS cantStock,
           ISNULL(p.cant, 0) AS cantPartidas
    FROM (
      SELECT ${ele("art_CodEle1")} AS e1, ${ele("art_CodEle2")} AS e2, ${ele("art_CodEle3")} AS e3,
             MAX(CAST(art_StockPart AS int)) AS art_StockPart
      FROM Articulos
      WHERE art_CodGen = '${codigo}'
      GROUP BY ${ele("art_CodEle1")}, ${ele("art_CodEle2")}, ${ele("art_CodEle3")}
    ) a
    LEFT JOIN (
      SELECT ${ele("stkart_CodEle1")} AS e1, ${ele("stkart_CodEle2")} AS e2, ${ele("stkart_CodEle3")} AS e3,
             SUM(stk_CantUM1) AS cant
      FROM Stock
      WHERE stkart_CodGen = '${codigo}' AND stkdep_Cod = '${DEPOSITO}'
      GROUP BY ${ele("stkart_CodEle1")}, ${ele("stkart_CodEle2")}, ${ele("stkart_CodEle3")}
    ) s ON s.e1 = a.e1 AND s.e2 = a.e2 AND s.e3 = a.e3
    LEFT JOIN (
      SELECT ${ele("stpart_CodEle1")} AS e1, ${ele("stpart_CodEle2")} AS e2, ${ele("stpart_CodEle3")} AS e3,
             SUM(stp_CantUM1) AS cant
      FROM StockPar
      WHERE stpart_CodGen = '${codigo}' AND stpdep_Cod = '${DEPOSITO}' AND stp_CantUM1 > 0
      GROUP BY ${ele("stpart_CodEle1")}, ${ele("stpart_CodEle2")}, ${ele("stpart_CodEle3")}
    ) p ON p.e1 = a.e1 AND p.e2 = a.e2 AND p.e3 = a.e3
    ORDER BY a.e1, a.e2, a.e3
  `);

  const resultado = new Map<string, number>();
  for (const f of r.recordset as {
    e1: string; e2: string; e3: string; art_StockPart: unknown; cantStock: number; cantPartidas: number;
  }[]) {
    const cantidad = esFlagSi(f.art_StockPart) ? Number(f.cantPartidas) : Number(f.cantStock);
    resultado.set(claveVariante(f.e1, f.e2, f.e3), cantidad);
  }
  return resultado;
}
