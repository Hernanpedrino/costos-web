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


async function explorarEsquema() {
  let pool: pkg.ConnectionPool | null = null;

  try {
    pool = await new ConnectionPool(config).connect();
    if (pool) {
      const nps = await pool.request().query(`
    SELECT 
      stv.spvscv_ID,
      stv.spv_Nro,
      s.scv_FEmision,
      COUNT(d.sdv_ID) AS items
    FROM SegTiposV stv
    INNER JOIN SegCabV s ON s.scv_ID = stv.spvscv_ID
    INNER JOIN SegDetV d ON d.sdvscv_ID = s.scv_ID
    WHERE stv.spvtco_Cod = 'NP'
      AND stv.spv_CodPvt = '00001'
      AND s.scvcli_CUIT = '00000000'
      AND s.scvtdc_Cod = 39
      AND s.scv_Fact = 0
      AND d.sdv_CPendRtUM1 > 0
      AND s.scv_FEmision >= CAST(GETDATE() AS DATE)
    GROUP BY stv.spvscv_ID, stv.spv_Nro, s.scv_FEmision
    ORDER BY stv.spv_Nro ASC
  `)
      console.log('\n📋 NPs pendientes de hoy:')
      nps.recordset.forEach((r: any) => {
        console.log(`  scv_ID: ${r.spvscv_ID} | NP: ${r.spv_Nro} | Items: ${r.items}`)
      })
    }
  } catch (err) {
    console.error("❌ Error:", err);
  } finally {
    if (pool) await pool.close();
  }
}


explorarEsquema();

export { };