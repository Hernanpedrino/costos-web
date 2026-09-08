// lib/whatsapp/conversation-handler.ts
import { sendTextMessage, sendButtons, markAsRead } from "./client";
import type { WhatsAppMessage } from "./types";
// import { prisma } from "@/lib/prisma"; // descomentar cuando integres el modelo de sesión

/**
 * Punto de entrada único para cualquier mensaje entrante.
 * Acá se decide, según el estado guardado de la conversación, qué hacer.
 */
export async function handleIncomingMessage(message: WhatsAppMessage, nombreContacto: string) {
  await markAsRead(message.id);

  const telefono = message.from;

  // TODO: reemplazar por lookup real en Prisma
  // const sesion = await prisma.conversacionWhatsApp.findUnique({ where: { telefono } });
  const sesion = { estadoActual: "MENU_PRINCIPAL" as const, carritoActual: [] };

  // --- Texto libre ---
  if (message.type === "text") {
    const texto = message.text!.body.trim();
    await manejarTextoLibre(telefono, texto, sesion);
    return;
  }

  // --- Respuesta a botón ---
  if (message.type === "interactive" && message.interactive?.type === "button_reply") {
    const idBoton = message.interactive.button_reply!.id;
    await manejarSeleccionBoton(telefono, idBoton, sesion);
    return;
  }

  // --- Respuesta a lista ---
  if (message.type === "interactive" && message.interactive?.type === "list_reply") {
    const idOpcion = message.interactive.list_reply!.id;
    await manejarSeleccionLista(telefono, idOpcion, sesion);
    return;
  }

  // Tipo no soportado todavía (imagen, audio, ubicación, etc.)
  await sendTextMessage(telefono, "Por ahora solo puedo procesar texto y las opciones de los menús 🙂");
}

async function manejarTextoLibre(telefono: string, texto: string, sesion: { estadoActual: string }) {
  const saludo = /^(hola|buenas|hi|buen[oa]s? d[ií]as|buenas tardes)/i;

  if (saludo.test(texto) || sesion.estadoActual === "MENU_PRINCIPAL") {
    await mostrarMenuPrincipal(telefono);
    return;
  }

  // TODO: acá va la interpretación de texto libre para consultas
  // (ej. "tenés harina 0000?") — matching contra tabla de artículos,
  // o delegar a un LLM para extraer intención + producto.
  await sendTextMessage(
    telefono,
    `Todavía estoy aprendiendo a interpretar mensajes libres. Por ahora escribí "menu" para ver las opciones.`
  );
}

async function manejarSeleccionBoton(telefono: string, idBoton: string, _sesion: unknown) {
  switch (idBoton) {
    case "HACER_PEDIDO":
      await sendTextMessage(telefono, "Buenísimo, ¿qué artículo necesitás? (escribilo como lo conocés, ej: \"harina 000\")");
      // TODO: actualizar estado de sesión a ARMANDO_PEDIDO
      break;
    case "VER_CATALOGO":
      await sendTextMessage(telefono, "Te muestro el catálogo... (pendiente de integrar con la tabla de artículos)");
      break;
    case "CONSULTAR_PEDIDO":
      await sendTextMessage(telefono, "Decime tu número de pedido o cliente para consultarlo.");
      break;
    default:
      await mostrarMenuPrincipal(telefono);
  }
}

async function manejarSeleccionLista(telefono: string, idOpcion: string, _sesion: unknown) {
  // Análogo a manejarSeleccionBoton, para cuando el usuario elige de una lista larga.
  await sendTextMessage(telefono, `Elegiste: ${idOpcion} (pendiente de conectar a lógica real)`);
}

async function mostrarMenuPrincipal(telefono: string) {
  await sendButtons(telefono, "¡Hola! ¿En qué te puedo ayudar hoy?", [
    { id: "HACER_PEDIDO", title: "Hacer pedido" },
    { id: "VER_CATALOGO", title: "Ver catálogo" },
    { id: "CONSULTAR_PEDIDO", title: "Consultar pedido" },
  ]);
}