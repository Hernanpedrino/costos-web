// actions/estadisticas.ts
"use server"

import { prisma } from "@/lib/prisma"
import { unstable_cache } from "next/cache"
import type { ISODateString } from "@/types"

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface PuntoHistorial {
  fecha:        ISODateString
  precioAntes:  number
  precioDespues: number
  usuario:      string
}

export interface HistorialInsumo {
  id:              string
  nombre:          string
  precioActual:    number
  variacionTotal:  number   // % variación entre primer y último precio
  puntos:          PuntoHistorial[]
}

export interface TopVariacion {
  id:             string
  nombre:         string
  precioInicial:  number
  precioActual:   number
  variacionPct:   number   // % total de variación
  cantCambios:    number
}

// ─── Top 5 insumos con mayor variación ───────────────────────────────────────

const getTopVariacionCached = unstable_cache(
  async (): Promise<TopVariacion[]> => {
    // Traemos todos los insumos que tienen historial
    const historiales = await prisma.historialPrecioInsumo.groupBy({
      by: ["insumoId"],
      _count: { id: true },
    })

    if (historiales.length === 0) return []

    const insumoIds = historiales.map((h) => h.insumoId)

    // Para cada insumo obtenemos el primer y último precio
    const datos = await Promise.all(
      insumoIds.map(async (insumoId) => {
        const [primero, ultimo, insumo] = await Promise.all([
          prisma.historialPrecioInsumo.findFirst({
            where:   { insumoId },
            orderBy: { createdAt: "asc" },
          }),
          prisma.historialPrecioInsumo.findFirst({
            where:   { insumoId },
            orderBy: { createdAt: "desc" },
          }),
          prisma.insumo.findUnique({
            where:  { id: insumoId },
            select: { name: true, price: true },
          }),
        ])

        if (!primero || !ultimo || !insumo) return null

        const precioInicial = primero.precioAntes.toNumber()
        const precioActual  = insumo.price.toNumber()
        const variacionPct  = precioInicial > 0
          ? ((precioActual - precioInicial) / precioInicial) * 100
          : 0

        return {
          id:            insumoId,
          nombre:        insumo.name,
          precioInicial,
          precioActual,
          variacionPct,
          cantCambios:   historiales.find((h) => h.insumoId === insumoId)?._count.id ?? 0,
        }
      })
    )

    return datos
      .filter((d): d is TopVariacion => d !== null)
      .sort((a, b) => Math.abs(b.variacionPct) - Math.abs(a.variacionPct))
      .slice(0, 5)
  },
  ["top-variacion"],
  { revalidate: 300 }
)

export async function getTopVariacionAction(): Promise<TopVariacion[]> {
  return getTopVariacionCached()
}

// ─── Historial de un insumo específico ───────────────────────────────────────

export async function getHistorialInsumoAction(
  insumoId: string
): Promise<HistorialInsumo | null> {
  const [insumo, registros] = await Promise.all([
    prisma.insumo.findUnique({
      where:  { id: insumoId },
      select: { name: true, price: true },
    }),
    prisma.historialPrecioInsumo.findMany({
      where:   { insumoId },
      orderBy: { createdAt: "asc" },
      include: { usuario: { select: { nombre: true } } },
    }),
  ])

  if (!insumo) return null

  const precioActual = insumo.price.toNumber()

  if (registros.length === 0) {
    return {
      id:             insumoId,
      nombre:         insumo.name,
      precioActual,
      variacionTotal: 0,
      puntos:         [],
    }
  }

  const precioInicial    = registros[0].precioAntes.toNumber()
  const variacionTotal   = precioInicial > 0
    ? ((precioActual - precioInicial) / precioInicial) * 100
    : 0

  const puntos: PuntoHistorial[] = registros.map((r) => ({
    fecha:         r.createdAt.toISOString(),
    precioAntes:   r.precioAntes.toNumber(),
    precioDespues: r.precioDespues.toNumber(),
    usuario:       r.usuario.nombre,
  }))

  return {
    id: insumoId,
    nombre:        insumo.name,
    precioActual,
    variacionTotal,
    puntos,
  }
}

// ─── Búsqueda de insumos para el selector ────────────────────────────────────

export async function buscarInsumosAction(query: string) {
  const insumos = await prisma.insumo.findMany({
    where: {
      name: { contains: query },
    },
    select: { id: true, name: true, price: true },
    orderBy: { name: "asc" },
    take: 10,
  })

  return insumos.map((i) => ({
    id:    i.id,
    name:  i.name,
    price: i.price.toNumber(),
  }))
}