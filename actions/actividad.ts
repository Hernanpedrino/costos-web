// actions/actividad.ts
"use server"

import { prisma } from "@/lib/prisma"
import { unstable_cache } from "next/cache"
import type { ISODateString } from "@/types"

export interface ActividadItem {
  id:        string
  usuario:   string
  accion:    string   // "CREAR" | "EDITAR" | "ELIMINAR"
  entidad:   string   // "Insumo" | "Formula"
  detalle:   string   // nombre del insumo/fórmula
  createdAt: ISODateString
}

// Cache de 5 minutos — buen balance entre frescura y rendimiento
const getActividadCached = unstable_cache(
  async (): Promise<ActividadItem[]> => {
    const registros = await prisma.registroAccion.findMany({
      take:    20,  // últimas 20 acciones
      orderBy: { createdAt: "desc" },
      include: {
        usuario: { select: { nombre: true } },
      },
    })

    return registros.map((r) => {
      // Extraer el nombre del recurso del campo detalle (JSON)
      const detalle = r.detalle as Record<string, any> | null
      const nombre  = detalle?.name ?? detalle?.nuevo?.name ?? r.entidadId ?? ""

      return {
        id:        r.id,
        usuario:   r.usuario.nombre,
        accion:    r.accion,
        entidad:   r.entidad,
        detalle:   nombre,
        createdAt: r.createdAt.toISOString(),
      }
    })
  },
  ["actividad-reciente"],
  { revalidate: 300 }  // 300 segundos = 5 minutos
)

export async function getActividadAction(): Promise<ActividadItem[]> {
  return getActividadCached()
}