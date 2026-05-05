// lib/registrarAccion.ts
// Helper para registrar acciones de auditoría desde los Server Actions

import { prisma } from "@/lib/prisma";
import { auth } from "@/auth/auth";
import { Prisma, type TipoAccion, type EntidadAccion } from "@/generated/prisma";

interface RegistrarAccionParams {
  accion:    TipoAccion;
  entidad:   EntidadAccion;
  entidadId?: string;
  detalle?:  Prisma.InputJsonValue;
}

export async function registrarAccion({
  accion,
  entidad,
  entidadId,
  detalle,
}: RegistrarAccionParams): Promise<void> {
  const session = await auth();

  // Si no hay sesión activa no registramos (no debería pasar con el middleware)
  if (!session?.user?.id) return;

  await prisma.registroAccion.create({
    data: {
      usuarioId: session.user.id,
      accion,
      entidad,
      entidadId,
      detalle,
    },
  });
}