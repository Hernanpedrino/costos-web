import "dotenv/config";
import pkg from 'mssql';
const { ConnectionPool } = pkg;
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaClient } from '../generated/prisma/client.js';

const adapter = new PrismaMariaDb({
  host:            "localhost",
  port:            3306,
  connectionLimit: 5,
  database:        process.env.DATABASE_NAME,
  user:            process.env.DATABASE_USER,
  password:        process.env.DATABASE_PASSWORD,
});

const prisma = new PrismaClient({ adapter });

const liliConfig: pkg.config = {
  server:   process.env.LILI_SERVER!,
  database: process.env.LILI_DATABASE!,
  user:     process.env.LILI_USER!,
  password: process.env.LILI_PASSWORD!,
  options: {
    encrypt: false,
    trustServerCertificate: true,
  },
  port: 1433
};

// ─── Helper: log ──────────────────────────────────────────────────────────────

async function logETL(tabla: string, registros: number, durMs: number, estado: 'ok' | 'error', error?: string) {
  await prisma.bejEtlLog.create({
    data: { tabla: `lili_${tabla}`, registros, durMs, estado, error }
  });
}

// ─── Helper: lotes ────────────────────────────────────────────────────────────

async function procesarEnLotes<T>(
  items: T[],
  tamanoLote: number,
  fn: (lote: T[]) => Promise<void>
) {
  for (let i = 0; i < items.length; i += tamanoLote) {
    const lote = items.slice(i, i + tamanoLote);
    await fn(lote);
    process.stdout.write(`\r  ${Math.min(i + tamanoLote, items.length)}/${items.length}`);
  }
  console.log();
}

// ─── ETL: Artículos ───────────────────────────────────────────────────────────

async function etlArticulos(pool: pkg.ConnectionPool) {
  const inicio = Date.now();
  console.log('\n📦 Sincronizando Artículos LILI...');
  try {
    const result = await pool.request().query(`
      SELECT
        art_CodGen   AS codigo,
        art_DescGen  AS descripcion,
        art_Clasif   AS clasificacion,
        art_CircProd AS esProducido,
        art_CircVta  AS esVendido,
        art_CircCpra AS esComprado,
        art_FecMod   AS updatedAt
      FROM Articulos
      WHERE art_Gen = 1
    `);

    await procesarEnLotes(result.recordset, 200, async (lote) => {
      await Promise.all(lote.map((row: any) =>
        prisma.liliArticulo.upsert({
          where:  { codigo: row.codigo },
          update: {
            descripcion:   row.descripcion?.trim() ?? '',
            clasificacion: row.clasificacion?.trim() ?? null,
            esProducido:   row.esProducido ?? false,
            esVendido:     row.esVendido ?? false,
            esComprado:    row.esComprado ?? false,
            updatedAt:     row.updatedAt ?? new Date(),
          },
          create: {
            codigo:        row.codigo,
            descripcion:   row.descripcion?.trim() ?? '',
            clasificacion: row.clasificacion?.trim() ?? null,
            esProducido:   row.esProducido ?? false,
            esVendido:     row.esVendido ?? false,
            esComprado:    row.esComprado ?? false,
            updatedAt:     row.updatedAt ?? new Date(),
          }
        })
      ));
    });

    await logETL('articulos', result.recordset.length, Date.now() - inicio, 'ok');
    console.log(`  ✅ ${result.recordset.length} artículos sincronizados`);
  } catch (err: any) {
    await logETL('articulos', 0, Date.now() - inicio, 'error', err.message);
    throw err;
  }
}

// ─── ETL: Ventas ──────────────────────────────────────────────────────────────

async function etlVentas(pool: pkg.ConnectionPool, desdeFecha: Date) {
  const inicio = Date.now();
  console.log(`\n🧾 Sincronizando Ventas LILI desde ${desdeFecha.toLocaleDateString()}...`);
  try {
    const cabResult = await pool.request()
      .input('desde', desdeFecha)
      .query(`
        SELECT
          cve_ID        AS id,
          cve_FEmision  AS fecha,
          cve_CodCli    AS codCliente,
          cvecli_RazSoc AS razonSocial,
          cve_ImpMonLoc AS importeTotal,
          cvetco_Cod    AS tipoComp
        FROM CabVenta
        WHERE cve_FEmision >= @desde
          AND cve_Anulado = 0
          AND cvetco_Cod IN ('FX', 'FVX')
      `);

    const cabeceras = cabResult.recordset;
    console.log(`  Cabeceras: ${cabeceras.length}`);

    if (cabeceras.length === 0) {
      console.log('  Sin ventas nuevas.');
      await logETL('ventas', 0, Date.now() - inicio, 'ok');
      return;
    }

    await procesarEnLotes(cabeceras, 100, async (lote) => {
      await Promise.all(lote.map((row: any) =>
        prisma.liliVentaCab.upsert({
          where:  { id: row.id },
          update: {
            fecha:        row.fecha,
            codCliente:   row.codCliente?.trim() ?? '',
            razonSocial:  row.razonSocial?.trim() ?? '',
            importeTotal: row.importeTotal ?? 0,
            tipoComp:     row.tipoComp?.trim() ?? '',
          },
          create: {
            id:           row.id,
            fecha:        row.fecha,
            codCliente:   row.codCliente?.trim() ?? '',
            razonSocial:  row.razonSocial?.trim() ?? '',
            importeTotal: row.importeTotal ?? 0,
            tipoComp:     row.tipoComp?.trim() ?? '',
          }
        })
      ));
    });

    // Detalles
    const ids = cabeceras.map((c: any) => c.id);
    let totalDet = 0;

    for (let i = 0; i < ids.length; i += 1000) {
      const loteIds = ids.slice(i, i + 1000);
      const detResult = await pool.request().query(`
        SELECT
          ivecve_ID       AS ventaId,
          iveart_CodGen   AS artCodigo,
          ive_Desc        AS descripcion,
          ive_CantUM1     AS cantidad,
          ive_NetoLoc     AS neto,
          ivecve_FEmision AS fecha
        FROM ItemVta
        WHERE ivecve_ID IN (${loteIds.join(',')})
          AND ive_tipoIt = 'A'
          AND ive_CantUM1 > 0
          AND ive_NetoLoc > 0
      `);

      const detalles = detResult.recordset.filter((d: any) => d.artCodigo?.trim());
      const ventaIdsLote = [...new Set(detalles.map((d: any) => d.ventaId))];

      if (ventaIdsLote.length > 0) {
        await prisma.liliVentaDet.deleteMany({
          where: { ventaId: { in: ventaIdsLote as number[] } }
        });
        await prisma.liliVentaDet.createMany({
          data: detalles.map((row: any) => ({
            ventaId:     row.ventaId,
            artCodigo:   row.artCodigo.trim(),
            descripcion: row.descripcion?.trim() ?? '',
            cantidad:    row.cantidad ?? 0,
            neto:        row.neto ?? 0,
            fecha:       row.fecha,
          })),
          skipDuplicates: true,
        });
        totalDet += detalles.length;
      }
    }

    await logETL('ventas', cabeceras.length, Date.now() - inicio, 'ok');
    console.log(`  ✅ ${cabeceras.length} cabeceras, ${totalDet} ítems sincronizados`);
  } catch (err: any) {
    await logETL('ventas', 0, Date.now() - inicio, 'error', err.message);
    throw err;
  }
}

// ─── ETL: Lista de Precios ────────────────────────────────────────────────────

async function etlListaPrecios(pool: pkg.ConnectionPool) {
  const inicio = Date.now();
  console.log('\n💲 Sincronizando Lista de Precios LILI...');
  try {
    const result = await pool.request().query(`
      SELECT
        lprdlp_Cod    AS listaCod,
        lprart_CodGen AS artCodigo,
        lpr_Precio    AS precio,
        lpr_FecMod    AS fechaMod
      FROM ListaPrec
      WHERE lpr_Precio > 0
    `);

    const precios = result.recordset.filter((r: any) => r.artCodigo?.trim());

    await prisma.liliListaPrecio.deleteMany();
    await procesarEnLotes(precios, 500, async (lote) => {
      await prisma.liliListaPrecio.createMany({
        data: lote.map((row: any) => ({
          listaCod:  row.listaCod?.trim(),
          artCodigo: row.artCodigo.trim(),
          precio:    row.precio ?? 0,
          fechaMod:  row.fechaMod ?? new Date(),
        })),
        skipDuplicates: true,
      });
    });

    await logETL('lista_precios', precios.length, Date.now() - inicio, 'ok');
    console.log(`  ✅ ${precios.length} precios sincronizados`);
  } catch (err: any) {
    await logETL('lista_precios', 0, Date.now() - inicio, 'error', err.message);
    throw err;
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  let pool: pkg.ConnectionPool | null = null;

  const argFecha = process.argv[2];
  let desdeFecha: Date;

  if (argFecha) {
    desdeFecha = new Date(argFecha);
  } else {
    const ultimaVenta = await prisma.liliVentaCab.findFirst({
      orderBy: { fecha: 'desc' },
      select:  { fecha: true }
    });
    desdeFecha = ultimaVenta
      ? new Date(ultimaVenta.fecha.getTime() - 2 * 24 * 60 * 60 * 1000)
      : new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);
  }

  console.log(`📅 Sincronizando desde: ${desdeFecha.toLocaleDateString()}`);

  try {
    console.log('🔌 Conectando a LILI...');
    pool = await new ConnectionPool(liliConfig).connect();
    console.log('✅ Conectado\n');

    await etlArticulos(pool);
    await etlVentas(pool, desdeFecha);
    await etlListaPrecios(pool);

    console.log('\n✅ ETL LILI completado exitosamente');
  } catch (err) {
    console.error('\n❌ Error en ETL LILI:', err);
    process.exit(1);
  } finally {
    if (pool) await pool.close();
    await prisma.$disconnect();
  }
}

main();
export {};