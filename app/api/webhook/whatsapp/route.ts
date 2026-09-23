// app/api/webhook/whatsapp/route.ts
import { NextRequest, NextResponse, after } from "next/server";
import crypto from "node:crypto";
import type { WhatsAppMessage, WhatsAppStatus, WhatsAppWebhookPayload } from "@/lib/whatsapp/types";
import { handleIncomingMessage } from "@/lib/whatsapp/conversation-handler";
import { encolarPorClave } from "@/lib/whatsapp/cola";
import { registrarMensaje } from "@/lib/whatsapp/registro";

const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN!;
const APP_SECRET = process.env.WHATSAPP_APP_SECRET!;

/**
 * Verifica que el request realmente venga de Meta comparando el HMAC-SHA256
 * del body crudo (firmado con tu App Secret) contra el header que manda Meta.
 * Referencia: https://developers.facebook.com/docs/graph-api/webhooks/getting-started#validate-payloads
 */
function verificarFirma(rawBody: string, signatureHeader: string | null): boolean {
  if (!signatureHeader) return false;

  const [algoritmo, firmaRecibida] = signatureHeader.split("=");
  if (algoritmo !== "sha256" || !firmaRecibida) return false;

  const firmaEsperada = crypto
    .createHmac("sha256", APP_SECRET)
    .update(rawBody, "utf-8")
    .digest("hex");

  // timingSafeEqual evita timing attacks; requiere buffers del mismo largo.
  const bufferRecibido = Buffer.from(firmaRecibida, "hex");
  const bufferEsperado = Buffer.from(firmaEsperada, "hex");

  if (bufferRecibido.length !== bufferEsperado.length) return false;

  return crypto.timingSafeEqual(bufferRecibido, bufferEsperado);
}

// ---- Duplicados ----
// Meta reintenta el webhook si no recibe el 200 a tiempo (o por sus propios
// motivos), así que el mismo message.id puede llegar más de una vez. Guardamos
// los ids ya recibidos una hora. En memoria, igual que lib/cola-op.ts: vale
// porque PM2 corre una sola instancia.

const TTL_DUPLICADOS_MS = 60 * 60 * 1000;
const globalForWebhook = globalThis as unknown as { whatsappIdsProcesados?: Map<string, number> };

function idsProcesados(): Map<string, number> {
  if (!globalForWebhook.whatsappIdsProcesados) globalForWebhook.whatsappIdsProcesados = new Map();
  return globalForWebhook.whatsappIdsProcesados;
}

/** Marca el id como visto; devuelve true si ya se había recibido dentro del TTL. */
function esDuplicado(messageId: string): boolean {
  const ids = idsProcesados();
  const ahora = Date.now();

  // Limpieza de vencidos. El Map mantiene orden de inserción, así que los
  // más viejos están primero: cortamos en el primero que sigue vigente.
  for (const [id, recibido] of ids) {
    if (ahora - recibido < TTL_DUPLICADOS_MS) break;
    ids.delete(id);
  }

  if (ids.has(messageId)) return true;
  ids.set(messageId, ahora);
  return false;
}

// ---- Procesamiento ----

/** Status de entrega de Meta; los fallidos traen el detalle en `errors`. */
type StatusConErrores = WhatsAppStatus & {
  errors?: { code: number; title: string; message?: string; error_data?: { details?: string } }[];
};

async function procesarMensaje(message: WhatsAppMessage, nombreContacto: string) {
  await registrarMensaje({ telefono: message.from, direccion: "entrante", tipo: message.type, contenido: message });
  await handleIncomingMessage(message, nombreContacto);
}

/**
 * Procesa el payload ya validado. Corre después de responder a Meta (con
 * after()), así que nada de acá puede afectar la respuesta: los errores solo
 * se loguean.
 */
async function procesarPayload(payload: WhatsAppWebhookPayload) {
  const trabajos: Promise<unknown>[] = [];

  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const { messages, contacts, statuses } = change.value;

      // Statuses (sent/delivered/read): solo nos importan los que fallaron.
      for (const status of (statuses ?? []) as StatusConErrores[]) {
        if (!status.errors?.length) continue;
        console.error(
          `[whatsapp] Meta no pudo entregar el mensaje ${status.id} a ${status.recipient_id} (${status.status}):`,
          JSON.stringify(status.errors)
        );
        trabajos.push(
          registrarMensaje({ telefono: status.recipient_id, direccion: "saliente", tipo: "status_error", contenido: status })
        );
      }

      for (const message of messages ?? []) {
        if (esDuplicado(message.id)) {
          console.warn(`[whatsapp] Mensaje ${message.id} de ${message.from} repetido (reintento de Meta) — descartado.`);
          continue;
        }

        const nombreContacto =
          contacts?.find((c) => c.wa_id === message.from)?.profile?.name ?? contacts?.[0]?.profile?.name ?? "Desconocido";

        // Serial por teléfono: dos mensajes seguidos del mismo cliente no
        // pueden leer/pisar la sesión a la vez. Clientes distintos van en paralelo.
        trabajos.push(
          encolarPorClave(message.from, () => procesarMensaje(message, nombreContacto)).catch((err) => {
            console.error(`[whatsapp] Error procesando el mensaje ${message.id} de ${message.from}:`, err);
          })
        );
      }
    }
  }

  // after() mantiene vivo el trabajo hasta que termine la promesa que le pasamos.
  await Promise.all(trabajos);
}

/**
 * Meta llama a este GET una sola vez, cuando configurás el webhook en el panel
 * de Meta for Developers, para confirmar que el endpoint es tuyo.
 */
export async function GET(req: NextRequest) {
  const searchParams = req.nextUrl.searchParams;
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    console.log("Webhook de WhatsApp verificado correctamente.");
    return new NextResponse(challenge, { status: 200 });
  }

  return new NextResponse("Verificación fallida", { status: 403 });
}

/**
 * Acá llegan todos los mensajes entrantes y los cambios de estado
 * (sent/delivered/read) de los mensajes que vos mandaste.
 */
export async function POST(req: NextRequest) {
  // Leemos el body como texto crudo PRIMERO — es obligatorio para que el
  // cálculo del HMAC coincida con el que hizo Meta antes de enviarlo.
  const rawBody = await req.text();
  const signatureHeader = req.headers.get("x-hub-signature-256");

  if (!verificarFirma(rawBody, signatureHeader)) {
    console.warn("Firma inválida en webhook de WhatsApp — request rechazado.");
    return new NextResponse("Firma inválida", { status: 401 });
  }

  let payload: WhatsAppWebhookPayload;
  try {
    payload = JSON.parse(rawBody);
  } catch (err) {
    // Firmado por Meta pero ilegible: reintentarlo no lo va a arreglar.
    console.error("Webhook de WhatsApp con JSON inválido:", err);
    return NextResponse.json({ received: true }, { status: 200 });
  }

  // Meta espera un 200 rápido (idealmente <5s) y si no, reintenta: antes
  // procesábamos todo acá adentro ("Hablar con persona" tardaba >5 s por el
  // SMTP). Ahora respondemos enseguida y el procesamiento sigue en after().
  after(async () => {
    try {
      await procesarPayload(payload);
    } catch (err) {
      console.error("Error procesando webhook de WhatsApp:", err);
    }
  });

  return NextResponse.json({ received: true }, { status: 200 });
}
