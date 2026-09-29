/**
 * scripts/crear-npw.ts
 *
 * Genera en Bejerman (SBDACANE) las NPW de los pedidos del chat de WhatsApp
 * que quedaron "identificado" en whatsapp_pedidos. La lógica vive en
 * lib/bejerman-npw.ts.
 *
 * POR DEFECTO SIMULA: lee todo, calcula precios y totales, lo muestra y NO
 * graba nada. Para escribir en Bejerman hay que pasar --ejecutar.
 *
 * Uso:
 *   npx tsx scripts/crear-npw.ts                      simula todos los pendientes
 *   npx tsx scripts/crear-npw.ts --pedido=12          simula solo el pedido 12
 *   npx tsx scripts/crear-npw.ts --ejecutar --pedido=12   graba la NPW del pedido 12
 *   npx tsx scripts/crear-npw.ts --ejecutar           graba todos los pendientes
 *
 * Primera etapa (acordado con Hernán): manual. Cuando los resultados estén
 * validados, se dispara solo al confirmar en el chat.
 */

import "dotenv/config"

import fs from "fs"
import path from "path"
import { prisma } from "../lib/prisma"
import { getBejermanPool } from "../lib/bejerman-op"
import { crearNPW, type EntregaPedido, type ItemPedido } from "../lib/bejerman-npw"

// ─── Parámetros ───────────────────────────────────────────────────────────────

const EJECUTAR = process.argv.includes("--ejecutar")
const argPedido = process.argv.find((a) => a.startsWith("--pedido="))
const PEDIDO = argPedido ? Number(argPedido.split("=")[1]) : null

// ─── Logging ──────────────────────────────────────────────────────────────────

const LOG_DIR = path.join(process.cwd(), "logs")
if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true })
const LOG_FILE = path.join(LOG_DIR, `crear-npw-${new Date().toISOString().split("T")[0]}.log`)

function log(msg: string) {
  console.log(msg)
  fs.appendFileSync(LOG_FILE, `[${new Date().toISOString()}] ${msg}\n`, "utf8")
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const ok: string[] = []
  const fallidos: { id: number; error: string }[] = []

  try {
    log("=".repeat(60))
    log(`Creación de NPW — ${EJECUTAR ? "EJECUCIÓN REAL (graba en Bejerman)" : "SIMULACIÓN (no graba)"}`)
    log("=".repeat(60))

    const pedidos = await prisma.pedidoWhatsApp.findMany({
      where: { estado: "identificado", ...(PEDIDO ? { id: PEDIDO } : {}) },
      orderBy: { id: "asc" },
    })
    if (pedidos.length === 0) {
      log(PEDIDO ? `El pedido ${PEDIDO} no está pendiente de NPW (o no existe).` : "No hay pedidos pendientes de NPW.")
      return
    }
    log(`${pedidos.length} pedido(s) pendiente(s)\n`)

    const pool = await getBejermanPool()

    for (const p of pedidos) {
      log(`— Pedido #${p.id} | ${p.telefono} | cliente ${p.cliCod} ${p.cliRazSoc ?? ""}`)
      try {
        if (!p.cliCod) throw new Error("Pedido sin cliente de Bejerman")
        const r = await crearNPW(
          pool,
          {
            id: p.id,
            cliCod: p.cliCod,
            carrito: p.carrito as unknown as ItemPedido[],
            entrega: p.entrega as unknown as EntregaPedido,
            creadoEn: p.creadoEn,
          },
          { simular: !EJECUTAR, log }
        )

        if (EJECUTAR) {
          // Recién acá, con la NPW ya confirmada en Bejerman, se marca el pedido.
          await prisma.pedidoWhatsApp.update({
            where: { id: p.id },
            data: { estado: "npw_creada", npwNumero: r.nro, error: r.avisos.length ? r.avisos.join(" | ") : null },
          })
        }
        ok.push(`#${p.id} → NPW ${r.nro}`)
        log("")
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        fallidos.push({ id: p.id, error: msg })
        log(`   ERROR: ${msg}\n`)
        if (EJECUTAR) {
          await prisma.pedidoWhatsApp.update({ where: { id: p.id }, data: { estado: "error", error: msg } })
        }
      }
    }

    log("-".repeat(60))
    log(`Resumen: ${ok.length} ${EJECUTAR ? "creada(s)" : "simulada(s)"} | ${fallidos.length} con error`)
    ok.forEach((o) => log(`   ${o}`))
    fallidos.forEach((f) => log(`   #${f.id}: ${f.error}`))
    log("-".repeat(60))
    if (fallidos.length > 0) process.exitCode = 1
  } catch (err) {
    log(`FALLA GENERAL: ${err instanceof Error ? err.message : err}`)
    process.exitCode = 1
  } finally {
    await prisma.$disconnect()
    process.exit(process.exitCode ?? 0)
  }
}

main()
