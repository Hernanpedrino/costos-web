// app/api/webhook/whatsapp/route.ts
import { NextRequest, NextResponse } from "next/server";
import type { WhatsAppWebhookPayload } from "@/lib/whatsapp/types";
import { handleIncomingMessage } from "@/lib/whatsapp/conversation-handler";

const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN!;

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
  const payload: WhatsAppWebhookPayload = await req.json();

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