// lib/whatsapp/session.ts
// Persistencia del estado de conversación por número de teléfono.
// Reemplaza el objeto hardcodeado que usaba conversation-handler.ts al
// principio — sin esto, el bot "olvida" todo entre un mensaje y el siguiente
// (ej. no puede recordar que le acaba de preguntar la cantidad de algo).

import { prisma } from "@/lib/prisma";
import type { CarritoItem, ConversationState } from "./types";

export interface Sesion {
  telefono: string;
  estadoActual: ConversationState;
  carritoActual: CarritoItem[];
  contexto: Record<string, unknown>;
}

/** Trae la sesión actual, creándola con valores por defecto si es la primera vez que escribe. */
export async function obtenerSesion(telefono: string, nombreContacto?: string): Promise<Sesion> {
  const registro = await prisma.conversacionWhatsApp.upsert({
    where: { telefono },
    update: {}, // si ya existe, no tocamos nada acá — solo la leemos
    create: {
      telefono,
      nombreContacto,
      estadoActual: "MENU_PRINCIPAL",
      carritoActual: [],
      contexto: {},
    },
  });

  return {
    telefono: registro.telefono,
    estadoActual: registro.estadoActual as ConversationState,
    carritoActual: (registro.carritoActual as CarritoItem[] | null) ?? [],
    contexto: (registro.contexto as Record<string, unknown> | null) ?? {},
  };
}

/**
 * Actualiza parcialmente la sesión. Pasar solo los campos que cambian
 * (ej. `{ estadoActual: "ESPERANDO_CANTIDAD", contexto: {...} }`).
 */
export async function actualizarSesion(
  telefono: string,
  cambios: Partial<Pick<Sesion, "estadoActual" | "carritoActual" | "contexto">>
): Promise<void> {
  await prisma.conversacionWhatsApp.update({
    where: { telefono },
    data: {
      ...(cambios.estadoActual !== undefined && { estadoActual: cambios.estadoActual }),
      ...(cambios.carritoActual !== undefined && { carritoActual: cambios.carritoActual }),
      ...(cambios.contexto !== undefined && { contexto: cambios.contexto }),
    },
  });
}

/** Vuelve al estado inicial, vaciando carrito y contexto (ej. tras confirmar o cancelar un pedido). */
export async function reiniciarSesion(telefono: string): Promise<void> {
  await actualizarSesion(telefono, {
    estadoActual: "MENU_PRINCIPAL",
    carritoActual: [],
    contexto: {},
  });
}
