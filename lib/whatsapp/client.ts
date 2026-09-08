// lib/whatsapp/client.ts
// Wrapper simple sobre la Cloud API de Meta para enviar mensajes salientes.

const WHATSAPP_API_VERSION = "v21.0";
const PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID!;
const ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN!;

const BASE_URL = `https://graph.facebook.com/${WHATSAPP_API_VERSION}/${PHONE_NUMBER_ID}/messages`;

async function callWhatsAppApi(body: Record<string, unknown>) {
  const res = await fetch(BASE_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${ACCESS_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errorBody = await res.text();
    console.error("Error enviando mensaje WhatsApp:", res.status, errorBody);
    throw new Error(`WhatsApp API error: ${res.status}`);
  }

  return res.json();
}

/** Envía un mensaje de texto simple. */
export async function sendTextMessage(to: string, text: string) {
  return callWhatsAppApi({
    messaging_product: "whatsapp",
    to,
    type: "text",
    text: { body: text, preview_url: false },
  });
}

/** Envía hasta 3 botones interactivos (para menús cortos). */
export async function sendButtons(
  to: string,
  bodyText: string,
  buttons: { id: string; title: string }[]
) {
  if (buttons.length > 3) {
    throw new Error("WhatsApp solo permite hasta 3 botones por mensaje. Usá sendList para más opciones.");
  }

  return callWhatsAppApi({
    messaging_product: "whatsapp",
    to,
    type: "interactive",
    interactive: {
      type: "button",
      body: { text: bodyText },
      action: {
        buttons: buttons.map((b) => ({
          type: "reply",
          reply: { id: b.id, title: b.title.slice(0, 20) }, // límite de 20 chars
        })),
      },
    },
  });
}

/** Envía una lista desplegable (para menús con más de 3 opciones, ej. catálogo). */
export async function sendList(
  to: string,
  bodyText: string,
  buttonLabel: string,
  sections: { title: string; rows: { id: string; title: string; description?: string }[] }[]
) {
  return callWhatsAppApi({
    messaging_product: "whatsapp",
    to,
    type: "interactive",
    interactive: {
      type: "list",
      body: { text: bodyText },
      action: {
        button: buttonLabel.slice(0, 20),
        sections,
      },
    },
  });
}

/** Marca un mensaje entrante como leído (opcional, mejora UX). */
export async function markAsRead(messageId: string) {
  return callWhatsAppApi({
    messaging_product: "whatsapp",
    status: "read",
    message_id: messageId,
  });
}