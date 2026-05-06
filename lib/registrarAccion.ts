// lib/registrarAccion.ts
// Helper para registrar acciones de auditoría desde los Server Actions

import { prisma } from "@/lib/prisma";
import { Prisma, type TipoAccion, type EntidadAccion } from "@/generated/prisma";

interface RegistrarAccionParams {
  usuarioId:  string;
  accion:     TipoAccion;
  entidad:    EntidadAccion;
  entidadId?: string;
  detalle?:   Prisma.InputJsonValue;
}

export async function registrarAccion({
  usuarioId,
  accion,
  entidad,
  entidadId,
  detalle,
}: RegistrarAccionParams): Promise<void> {
  if (!usuarioId) return;

  await prisma.registroAccion.create({
    data: {
      usuarioId,
      accion,
      entidad,
      entidadId,
      detalle,
    },
  });
}