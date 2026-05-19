import { NextResponse } from "next/server";
import sql from "mssql";

// ─── Configuración del servidor SQL ───────────────────────────────────────────
const SQL_CONFIG = {
  server: "192.168.1.230", 
  port: 1433, 
  user: "sa",                     
  password: process.env.DB_PASSWORD!,
  options: {
    trustServerCertificate: true,
    encrypt: false,
  },
};

// ─── Bases de datos confirmadas en SSMS ───────────────────────────────────────
const DB_A = "SBDACANE";
const DB_B = "SBDALILI";

// ─── Query con estructura real de Bejerman Empresas v8.80 ─────────────────────
const QUERY_STOCK = (db: string) => `
  SELECT
    s.cfsart_CodGen                             AS codigo,
    ISNULL(a.art_DescGen, s.cfsart_CodGen)       AS descripcion,
    ISNULL(s.cfs_CodDep, 'GEN')                 AS deposito,
    ISNULL(SUM(s.cfs_ExistenciaUM1), 0)         AS cantidad
  FROM [${db}].[dbo].[CFStock] s
  LEFT JOIN [${db}].[dbo].[Articulos] a
    ON s.cfsart_CodGen = a.art_CodGen
  GROUP BY s.cfsart_CodGen, a.art_DescGen, s.cfs_CodDep
  ORDER BY s.cfsart_CodGen
`;

export async function GET() {
  let pool: sql.ConnectionPool | null = null;

  try {
    pool = await sql.connect(SQL_CONFIG);

    // Consultamos ambas bases en paralelo
    const [resultA, resultB] = await Promise.all([
      pool.request().query(QUERY_STOCK(DB_A)),
      pool.request().query(QUERY_STOCK(DB_B)),
    ]);

    // Unificamos los resultados sumando por código de artículo
    const mapa = new Map<string, {
      codigo: string;
      descripcion: string;
      stockA: number;
      stockB: number;
      total: number;
    }>();

    for (const row of resultA.recordset) {
      const key = row.codigo;
      if (!mapa.has(key)) {
        mapa.set(key, { codigo: key, descripcion: row.descripcion, stockA: 0, stockB: 0, total: 0 });
      }
      mapa.get(key)!.stockA += Number(row.cantidad);
    }

    for (const row of resultB.recordset) {
      const key = row.codigo;
      if (!mapa.has(key)) {
        mapa.set(key, { codigo: key, descripcion: row.descripcion, stockA: 0, stockB: 0, total: 0 });
      }
      mapa.get(key)!.stockB += Number(row.cantidad);
    }

    const stock = Array.from(mapa.values()).map((item) => ({
      ...item,
      total: item.stockA + item.stockB,
    }));

    return NextResponse.json({
      ok: true,
      empresaA: DB_A,
      empresaB: DB_B,
      actualizadoEn: new Date().toISOString(),
      items: stock,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Error desconocido";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  } finally {
    if (pool) await pool.close();
  }
}