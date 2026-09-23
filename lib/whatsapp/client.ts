// lib/whatsapp/client.ts
// Wrapper simple sobre la Cloud API de Meta para enviar mensajes salientes.
//
// Modo simulación (WHATSAPP_SIMULAR=1, lo usa scripts/simular-chat.ts): no se
// llama a Meta, el mensaje se imprime por consola. Los límites de la API se
// validan igual en los dos modos, así un título largo se ve como error en vez
// de que Meta lo rechace (o de truncarlo en silencio).

import { registrarMensaje } from "./registro";

const WHATSAPP_API_VERSION = "v21.0";
const PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID!;
const ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN!;

const BASE_URL = `https://graph.facebook.com/${WHATSAPP_API_VERSION}/${PHONE_NUMBER_ID}/messages`;

// Límites de la Cloud API para mensajes de texto, botones y listas.
const MAX_BOTONES = 3;
const LARGO_TITULO_BOTON = 20;
const MAX_FILAS_LISTA = 10; // en total, sumando todas las secciones
const LARGO_TITULO_FILA = 24;
const LARGO_DESCRIPCION_FILA = 72;
const LARGO_TITULO_SECCION = 24;
const LARGO_BOTON_LISTA = 20;
const LARGO_CUERPO_INTERACTIVO = 1024;
const LARGO_TEXTO = 4096;
const LARGO_ID = 200;

/** Se lee en cada envío (no al cargar el módulo) para que el script pueda activarlo antes de importar. */
function modoSimulacion(): boolean {
  return process.env.WHATSAPP_SIMULAR === "1";
}

/**
 * Normaliza números argentinos para el campo "to" de la API.
 *
 * Meta identifica los mensajes ENTRANTES de celulares argentinos con un "9"
 * extra después del código de país (ej: 5493416688014), pero para ENVIAR
 * mensajes hay que sacarlo (543416688014) — si no, tira el error 131030
 * "Recipient phone number not in allowed list" aunque el número sí esté
 * autorizado, porque la API lo trata como un string distinto.
 * Referencia: es un comportamiento documentado y muy reportado para AR/MX/BR.
 */
function normalizarNumeroDestino(numero: string): string {
  // Código de país Argentina: 54. El patrón es 54 9 <código de área> <número>.
  if (numero.startsWith("549")) {
    return "54" + numero.slice(3);
  }
  return numero;
}

// ---- Validación de límites ----

function validarLargo(valor: string, maximo: number, que: string) {
  if (valor.length === 0) throw new Error(`WhatsApp: ${que} está vacío.`);
  if (valor.length > maximo) {
    throw new Error(`WhatsApp: ${que} tiene ${valor.length} caracteres (máximo ${maximo}): "${valor}"`);
  }
}

function validarIdsUnicos(ids: string[], que: string) {
  const vistos = new Set<string>();
  for (const id of ids) {
    validarLargo(id, LARGO_ID, `el id de ${que}`);
    if (vistos.has(id)) throw new Error(`WhatsApp: id de ${que} repetido: "${id}"`);
    vistos.add(id);
  }
}

// ---- Envío ----

/**
 * Manda el body a la API (o lo imprime en simulación). Si viene `telefono`,
 * el mensaje queda registrado como saliente en whatsapp_mensajes (con el
 * error, si la API lo rechaza).
 */
async function callWhatsAppApi(body: Record<string, unknown>, telefono?: string) {
  const tipo = String(body.type);

  if (modoSimulacion()) {
    imprimirSimulado(body);
    if (telefono) await registrarMensaje({ telefono, direccion: "saliente", tipo, contenido: body });
    return { messaging_product: "whatsapp", simulado: true, messages: [{ id: `wamid.SIMULADO.${Date.now()}` }] };
  }

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
    if (telefono) {
      await registrarMensaje({
        telefono,
        direccion: "saliente",
        tipo,
        contenido: { enviado: body, error: { status: res.status, respuesta: errorBody } },
      });
    }
    throw new Error(`WhatsApp API error: ${res.status}`);
  }

  if (telefono) await registrarMensaje({ telefono, direccion: "saliente", tipo, contenido: body });
  return res.json();
}

/** Envía un mensaje de texto simple. */
export async function sendTextMessage(to: string, text: string) {
  validarLargo(text, LARGO_TEXTO, "el texto");

  return callWhatsAppApi(
    {
      messaging_product: "whatsapp",
      to: normalizarNumeroDestino(to),
      type: "text",
      text: { body: text, preview_url: false },
    },
    to
  );
}

/** Envía hasta 3 botones interactivos (para menús cortos). */
export async function sendButtons(
  to: string,
  bodyText: string,
  buttons: { id: string; title: string }[]
) {
  if (buttons.length === 0 || buttons.length > MAX_BOTONES) {
    throw new Error(
      `WhatsApp permite de 1 a ${MAX_BOTONES} botones por mensaje (vinieron ${buttons.length}). Usá sendList para más opciones.`
    );
  }
  validarLargo(bodyText, LARGO_CUERPO_INTERACTIVO, "el cuerpo del mensaje con botones");
  for (const b of buttons) validarLargo(b.title, LARGO_TITULO_BOTON, `el título del botón ${b.id}`);
  validarIdsUnicos(
    buttons.map((b) => b.id),
    "botón"
  );

  return callWhatsAppApi(
    {
      messaging_product: "whatsapp",
      to: normalizarNumeroDestino(to),
      type: "interactive",
      interactive: {
        type: "button",
        body: { text: bodyText },
        action: {
          buttons: buttons.map((b) => ({
            type: "reply",
            reply: { id: b.id, title: b.title },
          })),
        },
      },
    },
    to
  );
}

/** Envía una lista desplegable (para menús con más de 3 opciones, ej. catálogo). */
export async function sendList(
  to: string,
  bodyText: string,
  buttonLabel: string,
  sections: { title: string; rows: { id: string; title: string; description?: string }[] }[]
) {
  validarLargo(bodyText, LARGO_CUERPO_INTERACTIVO, "el cuerpo de la lista");
  validarLargo(buttonLabel, LARGO_BOTON_LISTA, "el texto del botón de la lista");
  if (sections.length === 0) throw new Error("WhatsApp: la lista no tiene secciones.");

  const filas = sections.flatMap((s) => s.rows);
  if (filas.length === 0 || filas.length > MAX_FILAS_LISTA) {
    throw new Error(
      `WhatsApp permite de 1 a ${MAX_FILAS_LISTA} filas por lista, sumando secciones (vinieron ${filas.length}).`
    );
  }
  for (const s of sections) {
    // Con una sola sección el título es opcional; con varias, obligatorio.
    if (sections.length > 1 || s.title) validarLargo(s.title, LARGO_TITULO_SECCION, "el título de la sección");
  }
  for (const f of filas) {
    validarLargo(f.title, LARGO_TITULO_FILA, `el título de la fila ${f.id}`);
    if (f.description !== undefined && f.description.length > LARGO_DESCRIPCION_FILA) {
      throw new Error(
        `WhatsApp: la descripción de la fila ${f.id} tiene ${f.description.length} caracteres (máximo ${LARGO_DESCRIPCION_FILA}): "${f.description}"`
      );
    }
  }
  validarIdsUnicos(
    filas.map((f) => f.id),
    "fila"
  );

  return callWhatsAppApi(
    {
      messaging_product: "whatsapp",
      to: normalizarNumeroDestino(to),
      type: "interactive",
      interactive: {
        type: "list",
        body: { text: bodyText },
        action: {
          button: buttonLabel,
          sections,
        },
      },
    },
    to
  );
}

/** Marca un mensaje entrante como leído (opcional, mejora UX). No se registra: no es un mensaje. */
export async function markAsRead(messageId: string) {
  if (modoSimulacion()) return { success: true, simulado: true };

  return callWhatsAppApi({
    messaging_product: "whatsapp",
    status: "read",
    message_id: messageId,
  });
}

// ---- Simulación ----

interface InteractivoSimulado {
  type: "button" | "list";
  body: { text: string };
  action: {
    buttons?: { reply: { id: string; title: string } }[];
    button?: string;
    sections?: { title: string; rows: { id: string; title: string; description?: string }[] }[];
  };
}

/** Imprime el mensaje como lo vería el cliente, con los ids para poder "tocarlos" (#ID en simular-chat). */
function imprimirSimulado(body: Record<string, unknown>) {
  const lineas: string[] = [`┌─ BOT → ${String(body.to)} [${String(body.type)}]`];
  const sangrar = (texto: string) => texto.split("\n").map((l) => `│ ${l}`);

  if (body.type === "text") {
    lineas.push(...sangrar((body.text as { body: string }).body));
  } else if (body.type === "interactive") {
    const interactive = body.interactive as InteractivoSimulado;
    lineas.push(...sangrar(interactive.body.text), "│");
    if (interactive.type === "button") {
      for (const b of interactive.action.buttons ?? []) lineas.push(`│ [ ${b.reply.title} ]  #${b.reply.id}`);
    } else {
      lineas.push(`│ ≡ ${interactive.action.button}`);
      for (const s of interactive.action.sections ?? []) {
        if (s.title) lineas.push(`│   ${s.title}`);
        for (const r of s.rows) {
          lineas.push(`│   • ${r.title}  #${r.id}`);
          if (r.description) lineas.push(`│       ${r.description}`);
        }
      }
    }
  } else {
    lineas.push(...sangrar(JSON.stringify(body, null, 2)));
  }

  lineas.push("└─");
  console.log(lineas.join("\n"));
}
