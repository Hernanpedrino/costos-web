/**
 * scripts/simular-chat.ts
 *
 * Simula una conversación con el chatbot de WhatsApp sin pasar por Meta:
 * activa WHATSAPP_SIMULAR=1, así client.ts imprime los mensajes en vez de
 * mandarlos y lib/mail.ts imprime los mails en vez de enviarlos. Los límites
 * de la API (largos, cantidad de botones/filas, ids repetidos) se validan
 * igual que en producción.
 *
 * Cada argumento es un paso: texto libre, `#ID` para "tocar" un botón o
 * fila de lista (los ids aparecen impresos al lado de cada opción), o
 * `@lat,lng[,dirección]` para mandar una ubicación del mapa.
 *
 *   npx tsx --tsconfig tsconfig.json scripts/simular-chat.ts "hola" "#HACER_PEDIDO" "#RETIRO" "Juan" "hoja de sierra"
 *   npx tsx --tsconfig tsconfig.json scripts/simular-chat.ts "Hola de sierra"
 *   npx tsx --tsconfig tsconfig.json scripts/simular-chat.ts "hola" "#HABLAR_PERSONA" "me llaman al 341..."
 *
 * Ojo con acentos/emojis desde Git Bash: npx pasa por cmd y los rompe
 * ("menú" llega como "men├║"). Ahí conviene llamar a tsx directo:
 *
 *   node node_modules/tsx/dist/cli.mjs --tsconfig tsconfig.json scripts/simular-chat.ts "Buen día!"
 *
 * Usa el teléfono de prueba 5490000000000: al principio y al final borra su
 * sesión (whatsapp_conversaciones) y su log (whatsapp_mensajes) en MySQL.
 * Contra Bejerman solo hace las lecturas que hace el bot (stock en vivo).
 */

import { config } from "dotenv"
import type { WhatsAppMessage } from "../lib/whatsapp/types"

// Mismo orden que Next: .env.local pisa a .env
config({ path: [".env.local", ".env"], quiet: true })
// ANTES de importar los módulos del bot (van con import dinámico más abajo).
process.env.WHATSAPP_SIMULAR = "1"

const TELEFONO = "5490000000000"
const NOMBRE = "Prueba Simulación"

let contador = 0

function armarMensaje(paso: string): WhatsAppMessage {
  contador++
  const base = {
    from: TELEFONO,
    id: `wamid.SIM.${Date.now()}.${contador}`,
    timestamp: String(Math.floor(Date.now() / 1000)),
  }

  if (paso.startsWith("#")) {
    const id = paso.slice(1)
    // El handler resuelve igual button_reply y list_reply; mandamos list_reply
    // (el título no se usa para decidir nada).
    return { ...base, type: "interactive", interactive: { type: "list_reply", list_reply: { id, title: id } } }
  }
  // Ubicación compartida: "@lat,lng" o "@lat,lng,dirección"
  const ubicacion = paso.match(/^@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)(?:,(.+))?$/)
  if (ubicacion) {
    const [, lat, lng, address] = ubicacion
    return { ...base, type: "location", location: { latitude: Number(lat), longitude: Number(lng), address } }
  }
  return { ...base, type: "text", text: { body: paso } }
}

async function main() {
  const pasos = process.argv.slice(2)
  if (pasos.length === 0) {
    console.error('Uso: npx tsx --tsconfig tsconfig.json scripts/simular-chat.ts "hola" "#HACER_PEDIDO" ...')
    process.exitCode = 1
    return
  }

  const { prisma } = await import("@/lib/prisma")
  const { handleIncomingMessage } = await import("@/lib/whatsapp/conversation-handler")
  const { registrarMensaje } = await import("@/lib/whatsapp/registro")

  async function limpiar() {
    await prisma.mensajeWhatsApp.deleteMany({ where: { telefono: TELEFONO } })
    await prisma.conversacionWhatsApp.deleteMany({ where: { telefono: TELEFONO } })
  }

  await limpiar()
  try {
    for (const [i, paso] of pasos.entries()) {
      console.log(`\n══════ Paso ${i + 1}/${pasos.length} — CLIENTE: ${paso}`)
      const mensaje = armarMensaje(paso)
      // Igual que el webhook: primero se registra el entrante, después se procesa.
      await registrarMensaje({ telefono: TELEFONO, direccion: "entrante", tipo: mensaje.type, contenido: mensaje })
      try {
        await handleIncomingMessage(mensaje, NOMBRE)
      } catch (err) {
        console.error(`✖ Error en el paso ${i + 1}:`, err)
      }

      const sesion = await prisma.conversacionWhatsApp.findUnique({ where: { telefono: TELEFONO } })
      console.log(
        `   ↳ estado: ${sesion?.estadoActual ?? "(sin sesión)"}\n` +
          `   ↳ carrito: ${JSON.stringify(sesion?.carritoActual ?? [])}\n` +
          `   ↳ contexto: ${JSON.stringify(sesion?.contexto ?? {})}`
      )
    }
  } finally {
    await limpiar()
    await prisma.$disconnect()
  }
}

main()
  .catch((err) => {
    console.error("Falló la simulación:", err)
    process.exitCode = 1
  })
  // Los pools (MySQL/Bejerman) pueden dejar el proceso vivo.
  .finally(() => process.exit())
