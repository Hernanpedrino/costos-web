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
    // console.log(`     ${c.COLUMN_NAME.padEnd(35)} ${tipo}`);
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
      const detalle = await pool.request().query(`
    SELECT 
      'VENTA' AS origen,
      SUM(ive_CantUM1)   AS unidades,
      SUM(ive_NetoLoc)   AS importe
    FROM ItemVta
    WHERE iveart_CodGen = 'RED0000041'
      AND ive_tipoIt = 'A'
      AND ivecve_FEmision >= DATEADD(month, -12, GETDATE())
    UNION ALL
    SELECT 
      'NP' AS origen,
      SUM(d.sdv_CantUM1)  AS unidades,
      SUM(d.sdv_ImpTot)   AS importe
    FROM SegDetV d
    INNER JOIN SegCabV s ON s.scv_ID = d.sdvscv_ID
    WHERE d.sdvart_CodGen = 'RED0000041'
      AND d.sdv_TipoIt = 'A'
      AND d.sdv_ActStock = '4'
      AND s.scv_Fact = 0
      AND s.scv_Estado = 'S'
      AND s.scv_FEmision >= DATEADD(month, -12, GETDATE())
  `);
      console.log('\n🔎 Detalle RED0000041:');
      detalle.recordset.forEach((r: any) => {
        console.log(`  ${r.origen}: ${r.unidades?.toLocaleString()} unidades | $ ${r.importe?.toLocaleString('es-AR', { maximumFractionDigits: 0 })}`);
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