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
    console.log(`     ${c.COLUMN_NAME.padEnd(35)} ${tipo}`);
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

    //También ver una muestra de datos de Articulos
    console.log("\n\n🔎 Muestra de Articulos (5 registros):");
    const muestra = await pool.request().query(`SELECT TOP 5 * FROM Articulos`);
    console.log(JSON.stringify(muestra.recordset, null, 2));
    if (pool) {
      const listas = await pool.request().query(`
        SELECT DISTINCT lprdlp_Cod AS lista, COUNT(*) AS articulos
        FROM ListaPrec
        GROUP BY lprdlp_Cod
        ORDER BY lprdlp_Cod
      `);
      console.log('\n💲 Listas de precios:');
      listas.recordset.forEach((l: any) => {
        console.log(`  Lista ${l.lista}: ${l.articulos} artículos`);
      });
      //     const muestra = await pool.request().query(`
      //   SELECT TOP 20
      //     i.iveart_CodGen                     AS codigo,
      //     a.art_DescGen                       AS descripcion,
      //     AVG(i.ive_PrCosto)                  AS costoPromedio,
      //     MAX(i.ive_PrCosto)                  AS costoMax,
      //     MIN(i.ive_PrCosto)                  AS costoMin,
      //     COUNT(*)                            AS vecesVendido,
      //     MAX(i.ivecve_FEmision)              AS ultimaVenta,
      //     lp.lpr_Precio                       AS precioSIV
      //   FROM ItemVta i
      //   INNER JOIN Articulos a ON a.art_CodGen = i.iveart_CodGen
      //   LEFT JOIN ListaPrec lp 
      //     ON lp.lprart_CodGen = i.iveart_CodGen 
      //     AND lp.lprdlp_Cod = 'SIV'
      //   WHERE i.ive_tipoIt = 'A'
      //     AND i.ive_PrCosto > 0
      //     AND i.ivecve_FEmision >= DATEADD(month, -3, GETDATE())
      //   GROUP BY i.iveart_CodGen, a.art_DescGen, lp.lpr_Precio
      //   ORDER BY COUNT(*) DESC
      // `);
      //     console.log('\n🔎 Muestra costo vs precio (últimos 3 meses):');
      //     muestra.recordset.forEach((r: any) => {
      //       const margen = r.precioSIV > 0
      //         ? (((r.precioSIV - r.costoPromedio) / r.precioSIV) * 100).toFixed(1)
      //         : 'N/A';
      //       console.log(
      //         `  ${r.descripcion?.trim().padEnd(40)} ` +
      //         `Costo: ${r.costoPromedio?.toFixed(2).padStart(10)} ` +
      //         `(min:${r.costoMin?.toFixed(2)} max:${r.costoMax?.toFixed(2)}) ` +
      //         `| SIV: ${r.precioSIV?.toFixed(2).padStart(10)} ` +
      //         `| Margen: ${margen}% ` +
      //         `| Ventas: ${r.vecesVendido}`
      //       );
      //     });
      const compras = await pool.request().query(`
    SELECT TOP 15
      i.icoart_CodGen                                   AS codigo,
      a.art_DescGen                                     AS descripcion,
      AVG(ABS(i.ico_NetoLoc) / NULLIF(i.ico_CantUM1, 0))  AS costoUnitPromedio,
      MIN(ABS(i.ico_NetoLoc) / NULLIF(i.ico_CantUM1, 0))  AS costoMin,
      MAX(ABS(i.ico_NetoLoc) / NULLIF(i.ico_CantUM1, 0))  AS costoMax,
      MAX(c.cco_FEmision)                               AS ultimaCompra,
      COUNT(*)                                          AS cantCompras,
      lp.lpr_Precio                                     AS precioSIV
    FROM ItemComp i
    INNER JOIN CabCompra c ON c.cco_ID = i.icocco_ID
    INNER JOIN Articulos a ON a.art_CodGen = i.icoart_CodGen
    LEFT JOIN ListaPrec lp 
      ON lp.lprart_CodGen = i.icoart_CodGen 
      AND lp.lprdlp_Cod = 'SIV'
    WHERE i.ico_tipoIt = 'A'
      AND i.ico_CantUM1 > 0
      AND i.ico_NetoLoc <> 0
      AND c.cco_FEmision >= DATEADD(month, -3, GETDATE())
      AND c.cco_Anulado = 0
    GROUP BY i.icoart_CodGen, a.art_DescGen, lp.lpr_Precio
    ORDER BY COUNT(*) DESC
  `);

      console.log('\n🛒 Costo real desde compras (últimos 3 meses):');
      compras.recordset.forEach((r: any) => {
        const margen = r.precioSIV > 0
          ? (((r.precioSIV - r.costoUnitPromedio) / r.precioSIV) * 100).toFixed(1)
          : 'N/A';
        console.log(
          `  ${r.descripcion?.trim().padEnd(40)} ` +
          `Costo: ${r.costoUnitPromedio?.toFixed(2).padStart(10)} ` +
          `| SIV: ${r.precioSIV?.toFixed(2).padStart(10)} ` +
          `| Margen: ${margen}% ` +
          `| Compras: ${r.cantCompras} ` +
          `| Última: ${new Date(r.ultimaCompra).toLocaleDateString()}`
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