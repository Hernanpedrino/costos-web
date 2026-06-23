// scripts/explorar-bejerman.ts
import pkg from 'mssql';
const { ConnectionPool } = pkg;
type SqlConfig = pkg.config;

const config: SqlConfig = {
  server: "192.168.1.230",
  database: "SBDACANE",
  user: "sa",
  password: "Sa.2012",
  options: {
    encrypt: false,
    trustServerCertificate: true,
  },
  port: 1433
};

async function explorarColumnas(pool: pkg.ConnectionPool, tabla: string) {
  const result = await pool.request().query(`
    SELECT 
      COLUMN_NAME,
      DATA_TYPE,
      CHARACTER_MAXIMUM_LENGTH,
      IS_NULLABLE
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_NAME = '${tabla}'
    ORDER BY ORDINAL_POSITION
  `);
  console.log(`\n📊 ${tabla} (${result.recordset.length} columnas):`);
  result.recordset.forEach((c: any) => {
    const tipo = c.CHARACTER_MAXIMUM_LENGTH
      ? `${c.DATA_TYPE}(${c.CHARACTER_MAXIMUM_LENGTH})`
      : c.DATA_TYPE;
  });
}

async function explorarEsquema() {
  let pool: pkg.ConnectionPool | null = null;

  try {
    pool = await new ConnectionPool(config).connect();
    console.log("✅ Conectado\n");

    //Tablas clave a explorar
    const tablasObjetivo = [
      // Artículos
      "Articulos",
      // Ventas
      "CabVenta",
      "ItemVta",
      // Compras
      "CabCompra",
      "ItemComp",
      // Producción - Fórmulas
      "ProdFormulas",
      "ProdFrm_Componentes",
      "ProdFrm_Producidos",
      "ProdFrm_Costos",
      // Producción - Órdenes
      "ProdOrdenes",
      "ProdOrd_Componentes",
      "ProdOrd_Producidos",
      "ProdOrd_PCostos",
      // Listas de precios
      "ListaPrec",
      // Stock
      "Stock",
    ];

    for (const tabla of tablasObjetivo) {
      await explorarColumnas(pool, tabla);
    }
    if (pool) {
      const comp = await pool.request().query(`
    SELECT
      f.formula,
      f.batch,
      c.componente,
      c.cantidadUM1  AS cantidad,
      c.sbart_CodGen AS codigoArticulo,
      a.art_DescGen  AS descripcion
    FROM ProdFormulas f
    INNER JOIN ProdFrm_Componentes c ON c.formula = f.formula
    LEFT JOIN Articulos a ON a.art_CodGen = c.sbart_CodGen
    WHERE f.formula = 'CONDIMENTO PROVENZAL POR 1 KG'
  `);
      console.log('\n🔎 Componentes de CONDIMENTO PROVENZAL POR 1 KG:');
      comp.recordset.forEach((r: any) => {
        console.log(
          `  ${r.codigoArticulo?.padEnd(15)} ` +
          `${r.descripcion?.trim().padEnd(40)} ` +
          `Cant: ${r.cantidad}`
        );
      });
    }
  } catch (err) {
    console.error("❌ Error:", err);
  } finally {
    if (pool) await pool.close();
  }
}


explorarEsquema();

export { };