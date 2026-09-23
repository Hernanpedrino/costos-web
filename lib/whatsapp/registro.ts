// lib/whatsapp/registro.ts
//
// Log de mensajes del chatbot en whatsapp_mensajes (modelo MensajeWhatsApp),
// para debug y auditoría: entrantes (desde el webhook), salientes (desde
// client.ts) y errores de entrega que informa Meta ("status_error").
//
// Nunca lanza: si el log falla, el mensaje igual se tiene que procesar.

import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma";

export type DireccionMensaje = "entrante" | "saliente";

export async function registrarMensaje({
  telefono,
  direccion,
  tipo,
  contenido,
}: {
  telefono: string;
  direccion: DireccionMensaje;
  tipo: string;
  contenido: unknown;
}): Promise<void> {
  try {
    await prisma.mensajeWhatsApp.create({
      data: {
        telefono,
        direccion,
        tipo,
        // Los objetos de Meta son JSON válido, pero TS no los acepta directo como InputJsonValue.
        contenido: (contenido ?? {}) as Prisma.InputJsonValue,
      },
    });
  } catch (err) {
    console.error(`[whatsapp] No se pudo registrar el mensaje ${direccion} de ${telefono}:`, err);
  }
}
