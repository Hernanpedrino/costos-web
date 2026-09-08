/**
 * scripts/baja-np-automatico.ts
 *
 * Procesa automáticamente las NPs pendientes del cliente 000001
 * (Venta Global, documento 00000000) creando el comprobante BP correspondiente.
 *
 * Uso:
 *   npx ts-node scripts/baja-np-automatico.ts --dry-run   → solo lista, NO inserta nada
 *   npx ts-node scripts/baja-np-automatico.ts             → procesa e inserta los BP
 *
 * Requisito previo: en scripts/baja-np-prueba.ts hay que exportar la función
 * ya probada:  export async function crearBPparaNP(...)
 * y envolver la llamada a main() para que no se ejecute al importarla:
 *
 *   if (process.argv[1]?.includes('baja-np-prueba')) { main() }
 */

import "dotenv/config";
import fs from "fs";
import path from "path";
import pkg from "mssql";

// La función ya probada se reutiliza tal cual — no se duplica lógica.
import { crearBPparaNP } from "./baja-np-prueba";

// ─────────────────────────────────────────────────────────────
// Configuración
// ─────────────────────────────────────────────────────────────

const DRY_RUN = process.argv.includes("--dry-run");

/** Días hacia atrás a revisar (NPs que quedaron sin stock y se repusieron después) */
const argDias = process.argv.find((a) => a.startsWith("--dias="));
const DIAS_ATRAS = argDias ? Number(argDias.split("=")[1]) : 3;

/** Tope de NPs a procesar en una corrida (para las primeras pruebas en real) */
const argLimite = process.argv.find((a) => a.startsWith("--limite="));
const LIMITE = argLimite ? Number(argLimite.split("=")[1]) : Infinity;

/**
 * Franja de numeración reservada para los BP generados automáticamente.
 * En Bejerman el número del BP se carga a mano, así que no hay contador que
 * respetar: usamos una franja propia para que los BP del script queden
 * identificables y separados de los que se cargan manualmente.
 */
const FRANJA_DESDE = 74_874_856;
const FRANJA_HASTA = 74_999_999;

const config: pkg.config = {
  server: process.env.BEJERMAN_SERVER!,
  database: "SBDACANE", // PRODUCCIÓN
  user: process.env.BEJERMAN_USER!,
  password: process.env.BEJERMAN_PASSWORD!,
  options: {
    encrypt: false,
    trustServerCertificate: true,
  },
  port: 1433,
};

// ─────────────────────────────────────────────────────────────
// Logging
// ─────────────────────────────────────────────────────────────

const LOG_DIR = path.join(process.cwd(), "logs");
if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });

const LOG_FILE = path.join(
  LOG_DIR,
  `baja-np-${new Date().toISOString().split("T")[0]}.log`
);

function log(msg: string) {
  console.log(msg);
  fs.appendFileSync(LOG_FILE, `[${new Date().toISOString()}] ${msg}\n`, "utf8");
}

// ─────────────────────────────────────────────────────────────
// Numeración
// ─────────────────────────────────────────────────────────────

async function obtenerNroInicial(pool: pkg.ConnectionPool): Promise<number> {
  const result = await pool.request().query(`
    SELECT ISNULL(MAX(CAST(cms_Nro AS BIGINT)), ${FRANJA_DESDE - 1}) AS ultimoNro
    FROM CabMovS
    WHERE cmstco_Cod = 'BP'
      AND cms_CodPvt = '00006'
      AND cms_Letra  = 'X'
      AND ISNUMERIC(cms_Nro) = 1
      AND CAST(cms_Nro AS BIGINT) BETWEEN ${FRANJA_DESDE - 1} AND ${FRANJA_HASTA}
  `);

  const proximo = Number(result.recordset[0].ultimoNro) + 1;
  if (proximo > FRANJA_HASTA) {
    throw new Error(`Franja de numeración agotada (tope ${FRANJA_HASTA})`);
  }
  return proximo;
}

const formatearNro = (n: number) => String(n).padStart(8, "0");

// ─────────────────────────────────────────────────────────────
// Candidatas
// ─────────────────────────────────────────────────────────────

interface NPCandidata {
  scv_ID: number;
  fecha: string;
  spv_Nro: string;
  items: number;
}

/**
 * NPs pendientes: documento 00000000 (Venta Global), no facturadas y con
 * ítems que todavía tienen cantidad pendiente de remitir.
 *
 * El vínculo con el tipo de comprobante va por SegTiposV (spvtco_Cod = 'NP'),
 * NO por CabMovS: scvcms_ID apunta a otro comprobante y trae los BP ya creados.
 *
 * El filtro sdv_CPendRtUM1 > 0 es lo que evita reprocesar una NP a la que ya
 * se le hizo la baja: al crear el BP esos pendientes quedan en 0.
 */
async function obtenerCandidatas(pool: pkg.ConnectionPool): Promise<NPCandidata[]> {
  const result = await pool.request().query(`
    SELECT
      stv.spvscv_ID AS scv_ID,
      CONVERT(varchar(10), s.scv_FEmision, 103) AS fecha,
      stv.spv_Nro,
      COUNT(d.sdv_ID) AS items
    FROM SegTiposV stv
    INNER JOIN SegCabV s ON s.scv_ID    = stv.spvscv_ID
    INNER JOIN SegDetV d ON d.sdvscv_ID = s.scv_ID
    WHERE stv.spvtco_Cod  = 'NP'
      AND stv.spv_CodPvt  = '00001'
      AND s.scvcli_CUIT   = '00000000'
      AND s.scvtdc_Cod    = 39
      AND s.scv_Fact      = 0
      AND d.sdv_CPendRtUM1 > 0
      AND s.scv_FEmision >= CAST(DATEADD(day, -${DIAS_ATRAS}, GETDATE()) AS DATE)
    GROUP BY stv.spvscv_ID, s.scv_FEmision, stv.spv_Nro
    ORDER BY MIN(s.scv_FEmision) ASC, stv.spvscv_ID ASC
  `);

  return result.recordset as NPCandidata[];
}

// ─────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────

async function main() {
  let pool: pkg.ConnectionPool | null = null;

  const procesadas: number[] = [];
  const fallidas: { scvID: number; error: string }[] = [];

  try {
    log("=".repeat(60));
    log(`Baja automática de NPs — ${DRY_RUN ? "DRY RUN (no inserta)" : "EJECUCIÓN REAL"}`);
    log(`Base: ${config.database} | Ventana: últimos ${DIAS_ATRAS} días`);
    log("=".repeat(60));

    log(`Conectando a ${config.database}...`);
    pool = await new pkg.ConnectionPool(config).connect();
    log("Conectado");

    const candidatas = await obtenerCandidatas(pool);

    if (candidatas.length === 0) {
      log("No hay NPs pendientes para procesar.");
      return;
    }

    log(`${candidatas.length} NP(s) candidata(s):`);
    candidatas.forEach((c) =>
      log(
        `   NP ${c.spv_Nro} | scv_ID ${c.scv_ID} | ${c.fecha} | ` +
          `${c.items} ítem(s) pendiente(s)`
      )
    );

    if (DRY_RUN) {
      log("");
      log("DRY RUN — no se insertó ningún BP. Estas NPs siguen pendientes");
      log("y hay que darles la baja manualmente en Bejerman.");
      return;
    }

    let nro = await obtenerNroInicial(pool);
    log("");
    log(`Numeración: arranca en ${formatearNro(nro)}`);
    log("");

    const aProcesar = candidatas.slice(0, LIMITE);
    if (aProcesar.length < candidatas.length) {
      log(`Limitado a ${aProcesar.length} de ${candidatas.length} NPs`);
      log("");
    }

    for (const c of aProcesar) {
      const nroBP = formatearNro(nro);
      try {
        // crearBPparaNP abre y commitea su propia transacción:
        // si una NP falla, hace rollback solo de esa y el resto continúa.
        await crearBPparaNP(pool, c.scv_ID, nroBP);
        procesadas.push(c.scv_ID);
        nro++; // el número solo se consume si el BP se creó bien
        log(`OK    scv_ID ${c.scv_ID} → BP ${nroBP}`);
      } catch (err: any) {
        fallidas.push({ scvID: c.scv_ID, error: err.message ?? String(err) });
        log(`ERROR scv_ID ${c.scv_ID} → ${err.message ?? err}`);
      }
    }

    log("");
    log("-".repeat(60));
    log(`Resumen: ${procesadas.length} procesadas | ${fallidas.length} con error`);
    fallidas.forEach((f) => log(`   scv_ID ${f.scvID}: ${f.error}`));
    log("-".repeat(60));

    if (fallidas.length > 0) process.exitCode = 1;
  } catch (err: any) {
    log(`FALLA GENERAL: ${err.message ?? err}`);
    process.exitCode = 1;
  } finally {
    if (pool) await pool.close();
    log("Conexión cerrada");
  }
}

main();