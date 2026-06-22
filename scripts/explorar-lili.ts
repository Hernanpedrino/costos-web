import pkg from 'mssql';
const { ConnectionPool } = pkg;
import "dotenv/config";

const liliConfig: pkg.config = {
  server: process.env.LILI_SERVER!,
  database: process.env.LILI_DATABASE!,
  user: process.env.LILI_USER!,
  password: process.env.LILI_PASSWORD!,
  options: {
    encrypt: false,
    trustServerCertificate: true,
  },
  port: 1433
};

async function explorar() {
  let pool: pkg.ConnectionPool | null = null;
  try {
    pool = await new ConnectionPool(liliConfig).connect();
    console.log('✅ Conectado a LILI\n');
    // Necesitamos conectar ambas bases para comparar
    // Esto lo hacemos comparando desde MySQL después del ETL
    const totalLili = await pool.request().query(`
  SELECT COUNT(*) AS total 
  FROM Articulos 
  WHERE art_Gen = 1
`);
    console.log(`\nTotal artículos LILI: ${totalLili.recordset[0].total}`);

    // Ver muestra de códigos que podrían coincidir con CANE
    const codigos = await pool.request().query(`
  SELECT TOP 30
    art_CodGen  AS codigo,
    art_DescGen AS descripcion,
    art_CircVta AS esVendido,
    art_CircProd AS esProducido
  FROM Articulos
  WHERE art_Gen = 1
  ORDER BY art_CodGen
`);
    console.log('\n📦 Primeros 30 artículos LILI:');
    codigos.recordset.forEach((r: any) => {
      console.log(`  ${r.codigo?.padEnd(20)} ${r.descripcion?.trim()}`);
    });

    // Ver tipos de comprobante en ventas
    const tipos = await pool.request().query(`
      SELECT 
        cvetco_Cod    AS tipo,
        COUNT(*)      AS cantidad,
        SUM(cve_ImpMonLoc) AS importe
      FROM CabVenta
      WHERE cve_Anulado = 0
        AND cve_FEmision >= DATEADD(month, -12, GETDATE())
      GROUP BY cvetco_Cod
      ORDER BY COUNT(*) DESC
    `);
    console.log('📋 Tipos de comprobante en LILI (último año):');
    tipos.recordset.forEach((r: any) => {
      console.log(
        `  ${r.tipo?.padEnd(10)} → ${String(r.cantidad).padStart(6)} comprobantes` +
        ` | $ ${Math.abs(r.importe ?? 0).toLocaleString('es-AR', { maximumFractionDigits: 0 })}`
      );
    });

    // Ver muestra de artículos para comparar códigos con CANE
    const arts = await pool.request().query(`
      SELECT TOP 10
        art_CodGen  AS codigo,
        art_DescGen AS descripcion,
        art_CircVta AS esVendido
      FROM Articulos
      WHERE art_Gen = 1
        AND art_CircVta = 1
      ORDER BY art_CodGen
    `);
    console.log('\n📦 Muestra artículos LILI:');
    arts.recordset.forEach((r: any) => {
      console.log(`  ${r.codigo?.padEnd(20)} ${r.descripcion?.trim()}`);
    });

    // Comparar cantidad de artículos
    const totales = await pool.request().query(`
      SELECT COUNT(*) AS total FROM Articulos WHERE art_Gen = 1
    `);
    console.log(`\n📊 Total artículos en LILI: ${totales.recordset[0].total}`);

  } catch (err) {
    console.error('❌ Error:', err);
  } finally {
    if (pool) await pool.close();
  }
}


explorar();
export { };