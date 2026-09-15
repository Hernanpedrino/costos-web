/**
 * scripts/crear-op.ts
 *
 * Crea en Bejerman las Órdenes de Producción de una planilla confirmada.
 * La lógica vive en lib/bejerman-op.ts, compartida con el botón de la planilla,
 * para que las dos vías escriban exactamente lo mismo.
 *
 * Uso:
 *   npx tsx scripts/crear-op.ts --dry-run           lista, no escribe nada
 *   npx tsx scripts/crear-op.ts                     procesa la planilla de hoy
 *   npx tsx scripts/crear-op.ts --fecha=2026-09-15  procesa la de esa fecha
 *   npx tsx scripts/crear-op.ts --limite=1          tope de líneas
 *   npx tsx scripts/crear-op.ts --dejar-abierta     no cierra la orden
 */

import "dotenv/config"

import fs from "fs"
import path from "path"
import { prisma } from "../lib/prisma"
import { getBejermanPool, crearOPparaLinea } from "../lib/bejerman-op"

// ─── Parámetros ───────────────────────────────────────────────────────────────

const DRY_RUN = process.argv.includes("--dry-run")
const DEJAR_ABIERTA = process.argv.includes("--dejar-abierta")

const argFecha = process.argv.find(a => a.startsWith("--fecha="))
const argLimite = process.argv.find(a => a.startsWith("--limite="))
const LIMITE = argLimite ? Number(argLimite.split("=")[1]) : Infinity

function hoyISO(): string {
  const h = new Date()
  return `${h.getFullYear()}-${String(h.getMonth() + 1).padStart(2, "0")}-${String(h.getDate()).padStart(2, "0")}`
}

// ─── Logging ──────────────────────────────────────────────────────────────────

const LOG_DIR = path.join(process.cwd(), "logs")
if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true })
const LOG_FILE = path.join(LOG_DIR, `crear-op-${new Date().toISOString().split("T")[0]}.log`)

function log(msg: string) {
  console.log(msg)
  fs.appendFileSync(LOG_FILE, `[${new Date().toISOString()}] ${msg}\n`, "utf8")
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const ok: number[] = []
  const fallidas: { id: number; error: string }[] = []
  const fechaISO = argFecha ? argFecha.split("=")[1] : hoyISO()

  try {
    log("=".repeat(60))
    log(`Creación de OP — ${DRY_RUN ? "DRY RUN (no escribe)" : "EJECUCIÓN REAL"}`)
    log(`Planilla: ${fechaISO}`)
    log("=".repeat(60))

    const [a, m, d] = fechaISO.split("-").map(Number)
    const planilla = await prisma.planillaProduccion.findUnique({
      where: { fecha: new Date(Date.UTC(a, m - 1, d)) },
      include: { lineas: { orderBy: { orden: "asc" } } },
    })

    if (!planilla) { log("No hay planilla para esa fecha."); return }
    if (planilla.estado === "borrador") {
      log("La planilla está en borrador. Confirmala antes de procesarla.")
      return
    }

    const pendientes = planilla.lineas.filter(l => !l.ordenBej)
    if (pendientes.length === 0) { log("Todas las líneas ya se procesaron."); return }

    log(`${pendientes.length} línea(s) a procesar:`)
    pendientes.forEach(l =>
      log(`   ${l.productoCod} — ${l.productoDesc} | lote ${l.lote} | ${Number(l.cantidad)}`))

    if (DRY_RUN) {
      log("")
      log("DRY RUN — no se creó ninguna OP.")
      return
    }

    const pool = await getBejermanPool()
    log("Conectado a Bejerman\n")

    for (const l of pendientes.slice(0, LIMITE)) {
      try {
        const r = await crearOPparaLinea(
          pool,
          {
            id: l.id,
            productoCod: l.productoCod,
            productoDesc: l.productoDesc,
            lote: l.lote,
            cantidad: Number(l.cantidad),
            formulaCod: l.formulaCod,
          },
          fechaISO,
          { log, dejarAbierta: DEJAR_ABIERTA },
        )

        await prisma.planillaProduccionLinea.update({
          where: { id: l.id },
          data: { ordenBej: r.orden, nroCompBej: r.nroComp, procesadaEn: new Date(), error: null },
        })
        ok.push(l.id)
        log(`  OK línea ${l.id} → OP ${r.nroComp}\n`)
      } catch (err: any) {
        const msg = err.message ?? String(err)
        fallidas.push({ id: l.id, error: msg })
        await prisma.planillaProduccionLinea.update({
          where: { id: l.id }, data: { error: msg },
        })
        log(`  ERROR línea ${l.id}: ${msg}\n`)
      }
    }

    if (ok.length > 0 && fallidas.length === 0) {
      await prisma.planillaProduccion.update({
        where: { id: planilla.id },
        data: { estado: "procesada", procesadaEn: new Date() },
      })
    }

    log("-".repeat(60))
    log(`Resumen: ${ok.length} procesadas | ${fallidas.length} con error`)
    fallidas.forEach(f => log(`   línea ${f.id}: ${f.error}`))
    log("-".repeat(60))

    if (fallidas.length > 0) process.exitCode = 1
  } catch (err: any) {
    log(`FALLA GENERAL: ${err.message ?? err}`)
    process.exitCode = 1
  } finally {
    await prisma.$disconnect()
    log("Conexión cerrada")
    process.exit(process.exitCode ?? 0)
  }
}

main()