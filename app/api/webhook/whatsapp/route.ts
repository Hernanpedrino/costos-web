// app/api/webhook/whatsapp/route.ts
import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import type { WhatsAppWebhookPayload } from "@/lib/whatsapp/types";
import { handleIncomingMessage } from "@/lib/whatsapp/conversation-handler";

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

  const payload: WhatsAppWebhookPayload = JSON.parse(rawBody);

  try {
    for (const entry of payload.entry ?? []) {
      for (const change of entry.changes ?? []) {
        const { messages, contacts } = change.value;

        if (!messages || messages.length === 0) {
          // Esto puede ser un evento de "status" (delivered/read), lo ignoramos por ahora.
          continue;
        }

        for (const message of messages) {
          const nombreContacto = contacts?.[0]?.profile?.name ?? "Desconocido";
          await handleIncomingMessage(message, nombreContacto);
        }
      }
    }
  } catch (err) {
    // Importante: igual respondemos 200 para que Meta no reintente el mismo
    // mensaje en loop. El error se loguea para investigar aparte.
    console.error("Error procesando webhook de WhatsApp:", err);
  }

  // Meta espera un 200 rápido (idealmente <5s). Si tu lógica es lenta,
  // conviene encolar el procesamiento en vez de hacerlo todo acá adentro.
  return NextResponse.json({ received: true }, { status: 200 });
}