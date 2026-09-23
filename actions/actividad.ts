// actions/actividad.ts
"use server"

import { prisma } from "@/lib/prisma"
import type { ISODateString } from "@/types"

export interface ActividadItem {
  id:        string
  usuario:   string
  accion:    string   // "CREAR" | "EDITAR" | "ELIMINAR" — define el color/ícono
  titulo:    string   // ej. "Procesó la planilla del 22/09"
  detalle:   string   // ej. "5 OP creadas"
  createdAt: ISODateString
}

/** Unión de las formas que usan las distintas llamadas a registrarAccion */
type Detalle = {
  name?: string
  nuevo?: { name?: string }
  evento?: "procesar" | "confirmar" | "reabrir"
  fecha?: string
  ok?: number
  errores?: number
  lineas?: number
  producto?: string
  lote?: string
  cantidad?: number | string
  accion?: string
  email?: string
}

const VERBOS: Record<string, string> = { CREAR: "Creó", EDITAR: "Modificó", ELIMINAR: "Eliminó" }

/** "2026-09-22" → "22/09" */
const diaMes = (fechaISO: unknown) => {
  const [, m, d] = String(fechaISO ?? "").split("-")
  return d && m ? `${d}/${m}` : ""
}

const lineaProduccion = (d: Detalle) =>
  [d.producto, d.lote && `lote ${d.lote}`, d.cantidad !== undefined && `cant. ${d.cantidad}`]
    .filter(Boolean)
    .join(" · ")

/**
 * Arma el texto de la tarjeta según la entidad y el evento. El JSON de
 * `detalle` tiene una forma distinta en cada action que llama a registrarAccion.
 */
function describir(accion: string, entidad: string, d: Detalle, entidadId: string | null) {
  if (entidad === "Formula" || entidad === "Insumo") {
    const e = entidad === "Formula" ? "la fórmula" : "el insumo"
    return { titulo: `${VERBOS[accion] ?? "Actualizó"} ${e}`, detalle: d.name ?? d.nuevo?.name ?? "" }
  }

  if (entidad === "Produccion") {
    switch (d.evento) {
      case "procesar":
        return {
          titulo: `Procesó la planilla del ${diaMes(d.fecha)}`,
          detalle: `${d.ok ?? 0} OP creada(s)` + (d.errores ? `, ${d.errores} con error` : ""),
        }
      case "confirmar":
        return { titulo: `Confirmó la planilla del ${diaMes(d.fecha)}`, detalle: `${d.lineas ?? 0} línea(s)` }
      case "reabrir":
        return { titulo: `Reabrió la planilla del ${diaMes(d.fecha)}`, detalle: "" }
    }
    if (accion === "CREAR")    return { titulo: "Cargó producción",                 detalle: lineaProduccion(d) }
    if (accion === "ELIMINAR") return { titulo: "Quitó una línea de producción",    detalle: lineaProduccion(d) }
    return                            { titulo: "Modificó una línea de producción", detalle: lineaProduccion(d) }
  }

  if (entidad === "Usuario") {
    if (d.accion === "reset_password") return { titulo: "Reseteó una contraseña", detalle: d.email ?? "" }
    return { titulo: `${VERBOS[accion] ?? "Actualizó"} un usuario`, detalle: d.email ?? "" }
  }

  return { titulo: VERBOS[accion] ?? "Actualizó", detalle: entidadId ?? "" }
}

// Sin caché: son 20 filas por índice de createdAt, y la caché de 5 minutos
// hacía que las acciones nuevas tardaran en aparecer.
export async function getActividadAction(): Promise<ActividadItem[]> {
  const registros = await prisma.registroAccion.findMany({
    take:    20,  // últimas 20 acciones
    orderBy: { createdAt: "desc" },
    include: {
      usuario: { select: { nombre: true } },
    },
  })

  return registros.map((r) => {
    const { titulo, detalle } = describir(r.accion, r.entidad, (r.detalle as Detalle | null) ?? {}, r.entidadId)
    return {
      id:        r.id,
      usuario:   r.usuario.nombre,
      accion:    r.accion,
      titulo,
      detalle,
      createdAt: r.createdAt.toISOString(),
    }
  })
}
