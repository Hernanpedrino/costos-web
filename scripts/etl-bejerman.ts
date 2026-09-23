import "dotenv/config";
import pkg from 'mssql';
const { ConnectionPool } = pkg;
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaClient } from '../generated/prisma/client.js';

const adapter = new PrismaMariaDb({
  host: "localhost",
  port: 3306,
  connectionLimit: 5,
  database: process.env.DATABASE_NAME,
  user: process.env.DATABASE_USER,
  password: process.env.DATABASE_PASSWORD,
});

const prisma = new PrismaClient({ adapter });

const sqlConfig: pkg.config = {
  server: process.env.BEJERMAN_SERVER!,
  database: process.env.BEJERMAN_DB!,
  user: process.env.BEJERMAN_USER!,
  password: process.env.BEJERMAN_PASSWORD!,
  options: {
    encrypt: false,
    trustServerCertificate: true,
  },
  port: 1433
};
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
// ─── Helper: log de ETL ───────────────────────────────────────────────────────

async function logETL(tabla: string, registros: number, durMs: number, estado: 'ok' | 'error', error?: string) {
  await prisma.bejEtlLog.create({
    data: { tabla, registros, durMs, estado, error }
  });
}

// ─── Helper: upsert en lotes ──────────────────────────────────────────────────

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
  console.log('\n📦 Sincronizando Artículos...');
  try {
    const result = await pool.request().query(`
      SELECT
        art_CodGen      AS codigo,
        art_DescGen     AS descripcion,
        art_Clasif      AS clasificacion,
        art_CircProd    AS esProducido,
        art_CircVta     AS esVendido,
        art_CircCpra    AS esComprado,
        art_FecMod      AS updatedAt
      FROM Articulos
      WHERE art_Gen = 1
    `);

    const rows = result.recordset;

    await procesarEnLotes(rows, 200, async (lote) => {
      await Promise.all(lote.map(row =>
        prisma.bejArticulo.upsert({
          where: { codigo: row.codigo },
          update: {
            descripcion: row.descripcion?.trim() ?? '',
            clasificacion: row.clasificacion?.trim() ?? null,
            esProducido: row.esProducido ?? false,
            esVendido: row.esVendido ?? false,
            esComprado: row.esComprado ?? false,
            updatedAt: row.updatedAt ?? new Date(),
          },
          create: {
            codigo: row.codigo,
            descripcion: row.descripcion?.trim() ?? '',
            clasificacion: row.clasificacion?.trim() ?? null,
            esProducido: row.esProducido ?? false,
            esVendido: row.esVendido ?? false,
            esComprado: row.esComprado ?? false,
            updatedAt: row.updatedAt ?? new Date(),
          }
        })
      ));
    });

    await logETL('articulos', rows.length, Date.now() - inicio, 'ok');
    console.log(`  ✅ ${rows.length} artículos sincronizados`);
  } catch (err: any) {
    await logETL('articulos', 0, Date.now() - inicio, 'error', err.message);
    throw err;
  }
}

// ─── ETL: Ventas ──────────────────────────────────────────────────────────────

async function etlVentas(pool: pkg.ConnectionPool, desdeFecha: Date) {
  const inicio = Date.now();
  console.log(`\n🧾 Sincronizando Ventas desde ${desdeFecha.toLocaleDateString()}...`);
  try {
    // Cabeceras
    const cabResult = await pool.request()
      .input('desde', desdeFecha)
      .query(`
    SELECT
      cve_ID          AS id,
      cve_FEmision    AS fecha,
      cve_CodCli      AS codCliente,
      cvecli_RazSoc   AS razonSocial,
      cve_ImpMonLoc   AS importeTotal,
      cve_Anulado     AS anulado
    FROM CabVenta
    WHERE cve_FEmision >= @desde
      AND cve_Anulado = 0
      AND cvetco_Cod NOT IN ('RC', 'NC6', 'CG', 'CIB', 'CR', 'CRO')
  `);

    const cabeceras = cabResult.recordset;
    console.log(`  Cabeceras: ${cabeceras.length}`);

    await procesarEnLotes(cabeceras, 100, async (lote) => {
      await Promise.all(lote.map(row =>
        prisma.bejVentaCab.upsert({
          where: { id: row.id },
          update: {
            fecha: row.fecha,
            codCliente: row.codCliente?.trim() ?? '',
            razonSocial: row.razonSocial?.trim() ?? '',
            importeTotal: row.importeTotal ?? 0,
            anulado: row.anulado ?? false,
          },
          create: {
            id: row.id,
            fecha: row.fecha,
            codCliente: row.codCliente?.trim() ?? '',
            razonSocial: row.razonSocial?.trim() ?? '',
            importeTotal: row.importeTotal ?? 0,
            anulado: row.anulado ?? false,
          }
        })
      ));
    });

    // Detalles — solo de las cabeceras que trajimos
    const ids = cabeceras.map(c => c.id);
    if (ids.length === 0) {
      console.log('  Sin ventas nuevas.');
      return;
    }

    // SQL Server no acepta IN con demasiados valores, procesamos en lotes de 1000 ids
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
          ive_PrCosto     AS precioCosto,
          ivecve_FEmision AS fecha
        FROM ItemVta
        WHERE ivecve_ID IN (${loteIds.join(',')})
          AND ive_tipoIt = 'A'
      `);

      const detalles = detResult.recordset.filter(d => d.artCodigo?.trim());

      // Para detalles hacemos deleteMany + createMany (más rápido que upsert individual)
      const ventaIdsLote = [...new Set(detalles.map(d => d.ventaId))];
      if (ventaIdsLote.length > 0) {
        await prisma.bejVentaDet.deleteMany({
          where: { ventaId: { in: ventaIdsLote } }
        });
        await prisma.bejVentaDet.createMany({
          data: detalles.map(row => ({
            ventaId: row.ventaId,
            artCodigo: row.artCodigo.trim(),
            descripcion: row.descripcion?.trim() ?? '',
            cantidad: row.cantidad ?? 0,
            neto: row.neto ?? 0,
            precioCosto: row.precioCosto ?? 0,
            fecha: row.fecha,
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

// ─── ETL: Fórmulas de Producción ─────────────────────────────────────────────

async function etlFormulas(pool: pkg.ConnectionPool) {
  const inicio = Date.now();
  console.log('\n⚙️  Sincronizando Fórmulas de Producción...');
  try {
    const result = await pool.request().query(`
      SELECT
        f.formula,
        f.batch,
        f.vigente,
        COALESCE(c.costoTotal, 0)        AS costoTotal,
        COALESCE(c.costoComponentes, 0)  AS costoComp,
        COALESCE(c.costoRrhh, 0)         AS costoRrhh,
        COALESCE(c.costoMaq, 0)          AS costoMaq,
        COALESCE(c.costoIndirecto, 0)    AS costoInd,
        c.fechaModif                     AS fechaCosto
      FROM ProdFormulas f
      LEFT JOIN ProdFrm_Costos c
        ON c.formula = f.formula
    `);

    const formulas = result.recordset;

    await procesarEnLotes(formulas, 100, async (lote) => {
      await Promise.all(lote.map(row =>
        prisma.bejProdFormula.upsert({
          where: { formula: row.formula },
          update: {
            batch: row.batch ?? 1,
            costoTotal: row.costoTotal,
            costoComp: row.costoComp,
            costoRrhh: row.costoRrhh,
            costoMaq: row.costoMaq,
            costoInd: row.costoInd,
            fechaCosto: row.fechaCosto ?? null,
            vigente: row.vigente === 1,
          },
          create: {
            formula: row.formula,
            batch: row.batch ?? 1,
            costoTotal: row.costoTotal,
            costoComp: row.costoComp,
            costoRrhh: row.costoRrhh,
            costoMaq: row.costoMaq,
            costoInd: row.costoInd,
            fechaCosto: row.fechaCosto ?? null,
            vigente: row.vigente === 1,
          }
        })
      ));
    });

    // Componentes — deleteAll + insertAll es más simple aquí
    const compResult = await pool.request().query(`
      SELECT formula, componente, cantidadUM1 AS cantidad
      FROM ProdFrm_Componentes
    `);

    await prisma.bejProdFormulaComp.deleteMany();
    await prisma.bejProdFormulaComp.createMany({
      data: compResult.recordset.map(row => ({
        formula: row.formula,
        componente: row.componente,
        cantidad: row.cantidad ?? 0,
      }))
    });
    // Producidos — qué artículo genera cada fórmula
    const prodResult = await pool.request().query(`
  SELECT 
    formula,
    sbart_CodGen  AS artCodigo,
    cantidadUM1   AS cantidad
  FROM ProdFrm_Producidos
  WHERE sbart_CodGen IS NOT NULL
    AND sbart_CodGen <> ''
`);

    await prisma.bejProdFormulaProducido.deleteMany();
    await prisma.bejProdFormulaProducido.createMany({
      data: prodResult.recordset
        .filter((r: any) => r.artCodigo?.trim())
        .map((r: any) => ({
          formula: r.formula,
          artCodigo: r.artCodigo.trim(),
          cantidad: r.cantidad ?? 1,
        }))
    });

    console.log(`  ✅ ... ${prodResult.recordset.length} producidos sincronizados`);

    await logETL('formulas', formulas.length, Date.now() - inicio, 'ok');
    console.log(`  ✅ ${formulas.length} fórmulas, ${compResult.recordset.length} componentes sincronizados`);
  } catch (err: any) {
    await logETL('formulas', 0, Date.now() - inicio, 'error', err.message);
    throw err;
  }
}

// ─── ETL: Lista de Precios ────────────────────────────────────────────────────

async function etlListaPrecios(pool: pkg.ConnectionPool) {
  const inicio = Date.now();
  console.log('\n💲 Sincronizando Lista de Precios...');
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

    const precios = result.recordset.filter(r => r.artCodigo?.trim());

    await prisma.bejListaPrecio.deleteMany();
    await procesarEnLotes(precios, 500, async (lote) => {
      await prisma.bejListaPrecio.createMany({
        data: lote.map(row => ({
          listaCod: row.listaCod?.trim(),
          artCodigo: row.artCodigo.trim(),
          precio: row.precio ?? 0,
          fechaMod: row.fechaMod ?? new Date(),
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

// ─── ETL: Variantes de artículos ──────────────────────────────────────────────
// En Bejerman, Articulos tiene una fila por variante (CodGen+CodEle1+CodEle2+
// CodEle3), pero bej_articulos solo guarda la genérica (art_Gen = 1). Acá van
// las variantes vendibles con su precio de la lista FIN (nunca SIV: esto lo
// lee el chatbot). La clave se compara con LTRIM/RTRIM/ISNULL porque los
// CodEle vacíos vienen como ' ' (y alguno puede venir NULL).

interface FilaVariante {
  codGen: string;
  codEle1: string;
  codEle2: string;
  codEle3: string;
  desc1: string;
  desc2: string;
  desc3: string;
  precioFin: number | null; // lpr_Precio es float en Bejerman
}

async function etlVariantes(pool: pkg.ConnectionPool) {
  const inicio = Date.now();
  console.log('\n🧩 Sincronizando Variantes de artículos...');
  try {
    const result = await pool.request().query(`
      SELECT
        LTRIM(RTRIM(a.art_CodGen))                    AS codGen,
        LTRIM(RTRIM(ISNULL(a.art_CodEle1, '')))       AS codEle1,
        LTRIM(RTRIM(ISNULL(a.art_CodEle2, '')))       AS codEle2,
        LTRIM(RTRIM(ISNULL(a.art_CodEle3, '')))       AS codEle3,
        LTRIM(RTRIM(ISNULL(a.artele_Desc1, '')))      AS desc1,
        LTRIM(RTRIM(ISNULL(a.artele_Desc2, '')))      AS desc2,
        LTRIM(RTRIM(ISNULL(a.artele_Desc3, '')))      AS desc3,
        l.lpr_Precio                                  AS precioFin
      FROM Articulos a
      LEFT JOIN ListaPrec l
        ON  l.lprdlp_Cod = 'FIN'
        AND l.lprart_CodGen = a.art_CodGen
        AND LTRIM(RTRIM(ISNULL(l.lprart_CodEle1, ''))) = LTRIM(RTRIM(ISNULL(a.art_CodEle1, '')))
        AND LTRIM(RTRIM(ISNULL(l.lprart_CodEle2, ''))) = LTRIM(RTRIM(ISNULL(a.art_CodEle2, '')))
        AND LTRIM(RTRIM(ISNULL(l.lprart_CodEle3, ''))) = LTRIM(RTRIM(ISNULL(a.art_CodEle3, '')))
      WHERE a.art_CircVta = 1
        AND LTRIM(RTRIM(ISNULL(a.art_CodEle1, ''))) <> ''
    `);

    // La FK exige que el CodGen esté en bej_articulos (que solo trae art_Gen = 1).
    // Hoy todas las variantes vendibles tienen su genérica, pero si aparece una
    // huérfana se saltea en vez de romper el ETL. También se deduplica por clave
    // por si ListaPrec llegara a tener dos filas FIN para la misma variante.
    const codigosExistentes = new Set(
      (await prisma.bejArticulo.findMany({ select: { codigo: true } })).map(a => a.codigo)
    );
    const porClave = new Map<string, FilaVariante>();
    let huerfanas = 0;
    for (const row of result.recordset as FilaVariante[]) {
      if (!row.codGen || !codigosExistentes.has(row.codGen)) { huerfanas++; continue; }
      const clave = `${row.codGen}~${row.codEle1}~${row.codEle2}~${row.codEle3}`;
      if (!porClave.has(clave)) porClave.set(clave, row);
    }
    const variantes = [...porClave.values()];
    if (huerfanas > 0) console.log(`  ⚠️  ${huerfanas} variantes sin artículo genérico en bej_articulos (salteadas)`);

    // Reemplazo total dentro de una transacción: así el bot nunca ve la tabla
    // vacía a mitad de la sincronización.
    const ahora = new Date();
    await prisma.$transaction(async (tx) => {
      await tx.bejArticuloVariante.deleteMany();
      await procesarEnLotes(variantes, 500, async (lote) => {
        await tx.bejArticuloVariante.createMany({
          data: lote.map(row => ({
            codGen: row.codGen,
            codEle1: row.codEle1,
            codEle2: row.codEle2,
            codEle3: row.codEle3,
            desc1: row.desc1,
            desc2: row.desc2,
            desc3: row.desc3,
            // Precio 0 o sin precio en FIN → null (no ofrecer precio en $0)
            precioFin: row.precioFin != null && Number(row.precioFin) > 0
              ? Math.round(Number(row.precioFin) * 100) / 100
              : null,
            updatedAt: ahora,
          })),
        });
      });
    }, { timeout: 60_000 });

    await logETL('articulo_variantes', variantes.length, Date.now() - inicio, 'ok');
    console.log(`  ✅ ${variantes.length} variantes sincronizadas`);
  } catch (err) {
    await logETL('articulo_variantes', 0, Date.now() - inicio, 'error', err instanceof Error ? err.message : String(err));
    throw err;
  }
}
async function etlCompras(pool: pkg.ConnectionPool, desdeFecha: Date) {
  const inicio = Date.now();
  console.log(`\n🛒 Sincronizando Compras desde ${desdeFecha.toLocaleDateString()}...`);
  try {
    const cabResult = await pool.request()
      .input('desde', desdeFecha)
      .query(`
        SELECT
          cco_ID        AS id,
          cco_FEmision  AS fecha,
          cco_CodPro    AS codProveedor,
          ccopro_RazSoc AS razonSocial,
          cco_ImpMonLoc AS importeTotal,
          cco_Anulado   AS anulado
        FROM CabCompra
        WHERE cco_FEmision >= @desde
          AND cco_Anulado = 0
      `);

    const cabeceras = cabResult.recordset;
    console.log(`  Cabeceras: ${cabeceras.length}`);

    await procesarEnLotes(cabeceras, 100, async (lote) => {
      await Promise.all(lote.map(row =>
        prisma.bejCompraCab.upsert({
          where: { id: row.id },
          update: {
            fecha: row.fecha,
            codProveedor: row.codProveedor?.trim() ?? '',
            razonSocial: row.razonSocial?.trim() ?? '',
            importeTotal: Math.abs(row.importeTotal ?? 0),
            anulado: row.anulado ?? false,
          },
          create: {
            id: row.id,
            fecha: row.fecha,
            codProveedor: row.codProveedor?.trim() ?? '',
            razonSocial: row.razonSocial?.trim() ?? '',
            importeTotal: Math.abs(row.importeTotal ?? 0),
            anulado: row.anulado ?? false,
          }
        })
      ));
    });

    const ids = cabeceras.map(c => c.id);
    if (ids.length === 0) {
      console.log('  Sin compras nuevas.');
      return;
    }

    let totalDet = 0;
    for (let i = 0; i < ids.length; i += 1000) {
      const loteIds = ids.slice(i, i + 1000);
      const detResult = await pool.request().query(`
        SELECT
          i.icocco_ID     AS compraId,
          i.icoart_CodGen AS artCodigo,
          i.ico_CantUM1   AS cantidad,
          ABS(i.ico_NetoLoc) AS neto,
          ABS(i.ico_NetoLoc) / NULLIF(i.ico_CantUM1, 0) AS precioUnit,
          c.cco_FEmision  AS fecha
        FROM ItemComp i
        INNER JOIN CabCompra c ON c.cco_ID = i.icocco_ID
        WHERE i.icocco_ID IN (${loteIds.join(',')})
          AND i.ico_tipoIt = 'A'
          AND i.ico_CantUM1 > 0
          AND i.ico_NetoLoc <> 0
      `);

      const detalles = detResult.recordset.filter(d => d.artCodigo?.trim());
      const compraIdsLote = [...new Set(detalles.map(d => d.compraId))];

      if (compraIdsLote.length > 0) {
        await prisma.bejCompraDet.deleteMany({
          where: { compraId: { in: compraIdsLote } }
        });
        await prisma.bejCompraDet.createMany({
          data: detalles.map(row => ({
            compraId: row.compraId,
            artCodigo: row.artCodigo.trim(),
            cantidad: row.cantidad ?? 0,
            neto: row.neto ?? 0,
            precioUnit: row.precioUnit ?? 0,
            fecha: row.fecha,
          })),
          skipDuplicates: true,
        });
        totalDet += detalles.length;
      }
    }

    await logETL('compras', cabeceras.length, Date.now() - inicio, 'ok');
    console.log(`  ✅ ${cabeceras.length} cabeceras, ${totalDet} ítems sincronizados`);
  } catch (err: any) {
    await logETL('compras', 0, Date.now() - inicio, 'error', err.message);
    throw err;
  }
}
async function etlNotasPedido(pool: pkg.ConnectionPool, desdeFecha: Date) {
  const inicio = Date.now();
  console.log(`\n📝 Sincronizando Notas de Pedido desde ${desdeFecha.toLocaleDateString()}...`);
  try {
    const cabResult = await pool.request()
      .input('desde', desdeFecha)
      .query(`
        SELECT
          scv_ID        AS id,
          scv_FEmision  AS fecha,
          scvcli_Cod    AS codCliente,
          scvcli_RazSoc AS razonSocial
        FROM SegCabV
        WHERE scv_FEmision >= @desde
          AND scv_ActStock = 1
          AND scv_Fact = 0
          AND scv_Estado = 'S'
      `);

    const cabeceras = cabResult.recordset;
    console.log(`  Cabeceras: ${cabeceras.length}`);

    if (cabeceras.length === 0) {
      console.log('  Sin notas de pedido nuevas.');
      await logETL('notas_pedido', 0, Date.now() - inicio, 'ok');
      return;
    }

    await procesarEnLotes(cabeceras, 100, async (lote) => {
      await Promise.all(lote.map(row =>
        prisma.bejNPCab.upsert({
          where: { id: row.id },
          update: {
            fecha: row.fecha,
            codCliente: row.codCliente?.trim() ?? '',
            razonSocial: row.razonSocial?.trim() ?? '',
          },
          create: {
            id: row.id,
            fecha: row.fecha,
            codCliente: row.codCliente?.trim() ?? '',
            razonSocial: row.razonSocial?.trim() ?? '',
          }
        })
      ));
    });

    const ids = cabeceras.map(c => c.id);
    let totalDet = 0;

    for (let i = 0; i < ids.length; i += 1000) {
      const loteIds = ids.slice(i, i + 1000);
      const detResult = await pool.request().query(`
        SELECT
          d.sdvscv_ID     AS npId,
          d.sdvart_CodGen AS artCodigo,
          d.sdv_Desc      AS descripcion,
          d.sdv_CantUM1   AS cantidad,
          d.sdv_ImpTot    AS importeTotal,
          d.sdv_PrecioUn  AS precioUn,
          s.scv_FEmision  AS fecha
        FROM SegDetV d
        INNER JOIN SegCabV s ON s.scv_ID = d.sdvscv_ID
        WHERE d.sdvscv_ID IN (${loteIds.join(',')})
          AND d.sdv_TipoIt = 'A'
          AND d.sdv_CantUM1 > 0
          AND d.sdv_ActStock = '4'
      `);

      const detalles = detResult.recordset.filter(d => d.artCodigo?.trim());
      const npIdsLote = [...new Set(detalles.map(d => d.npId))];

      if (npIdsLote.length > 0) {
        await prisma.bejNPDet.deleteMany({
          where: { npId: { in: npIdsLote } }
        });
        await prisma.bejNPDet.createMany({
          data: detalles.map(row => ({
            npId: row.npId,
            artCodigo: row.artCodigo.trim(),
            descripcion: row.descripcion?.trim() ?? '',
            cantidad: row.cantidad ?? 0,
            importeTotal: row.importeTotal ?? 0,
            precioUn: row.precioUn ?? 0,
            fecha: row.fecha,
          })),
          skipDuplicates: true,
        });
        totalDet += detalles.length;
      }
    }

    await logETL('notas_pedido', cabeceras.length, Date.now() - inicio, 'ok');
    console.log(`  ✅ ${cabeceras.length} cabeceras, ${totalDet} ítems sincronizados`);
  } catch (err: any) {
    await logETL('notas_pedido', 0, Date.now() - inicio, 'error', err.message);
    throw err;
  }
}


// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  let pool: pkg.ConnectionPool | null = null;

  // Si se pasa fecha como argumento la usa, sino busca la última venta sincronizada
  const argFecha = process.argv[2];
  let desdeFecha: Date;

  if (argFecha) {
    desdeFecha = new Date(argFecha);
  } else {
    // Buscar la fecha de la última venta sincronizada
    const ultimaVenta = await prisma.bejVentaCab.findFirst({
      orderBy: { fecha: 'desc' },
      select: { fecha: true }
    });
    // Si hay datos, desde 2 días atrás de la última (margen de seguridad)
    // Si no hay datos, último año
    desdeFecha = ultimaVenta
      ? new Date(ultimaVenta.fecha.getTime() - 2 * 24 * 60 * 60 * 1000)
      : new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);
  }

  console.log(`📅 Sincronizando desde: ${desdeFecha.toLocaleDateString()}`);

  try {
    console.log('🔌 Conectando a Bejerman...');
    pool = await new ConnectionPool(sqlConfig).connect();
    console.log('✅ Conectado\n');

    await etlArticulos(pool);
    await etlVentas(pool, desdeFecha);
    await etlNotasPedido(pool, desdeFecha);
    await etlCompras(pool, desdeFecha);
    await etlFormulas(pool);
    await etlListaPrecios(pool);
    // Después de artículos (FK a bej_articulos). Va al final para que, si
    // falla (ej. migración add_articulo_variantes sin aplicar), no frene el
    // resto de la sincronización.
    await etlVariantes(pool);

    console.log('\n✅ ETL completado exitosamente');
  } catch (err) {
    console.error('\n❌ Error en ETL:', err);
    process.exit(1);
  } finally {
    if (pool) await pool.close();
    await prisma.$disconnect();
  }
}

main();

export { };