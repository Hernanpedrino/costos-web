// actions/informes.ts
"use server"

import { prisma } from "@/lib/prisma"
import type { ISODateString } from "@/types"

export interface InformeFormula {
  id:             string
  nombre:         string
  precioActual:   number
  precioAnterior: number | null
  variacionPct:   number | null   // null = sin historial previo
  tendencia:      "sube" | "baja" | "igual" | "nuevo"
  ultimoCambio:   ISODateString | null
}

export async function getInformeFormulasAction(): Promise<InformeFormula[]> {
  // Traemos todas las fórmulas con sus items para calcular precio actual
  const formulas = await prisma.formula.findMany({
    include: {
      items: {
        include: {
          insumo: true,
          subFormula: {
            include: {
              items: {
                include: {
                  insumo: true,
                  subFormula: {
                    include: {
                      items: { include: { insumo: true } },
                    },
                  },
                },
              },
            },
          },
        },
      },
      // Último snapshot y el anterior para comparar
      historialPrecios: {
        orderBy: { createdAt: "desc" },
        take:    2,
      },
    },
    orderBy: { name: "asc" },
  })

  return formulas.map((formula) => {
    // Calcular precio actual (misma lógica que getFormulasAction)
    const precioActual = calcularPrecioFormula(formula.items)

    const historial = formula.historialPrecios
    const precioAnterior = historial.length >= 2
      ? historial[1].precio.toNumber()   // el registro anterior al último
      : historial.length === 1
      ? historial[0].precio.toNumber()   // solo hay un snapshot
      : null

    const ultimoCambio = historial.length > 0
      ? historial[0].createdAt.toISOString()
      : null

    let variacionPct: number | null = null
    let tendencia: InformeFormula["tendencia"] = "nuevo"

    if (precioAnterior !== null && precioAnterior > 0) {
      variacionPct = ((precioActual - precioAnterior) / precioAnterior) * 100
      if (variacionPct > 0.01)       tendencia = "sube"
      else if (variacionPct < -0.01) tendencia = "baja"
      else                           tendencia = "igual"
    }

    return {
      id:             formula.id,
      nombre:         formula.name,
      precioActual,
      precioAnterior,
      variacionPct,
      tendencia,
      ultimoCambio,
    }
  })
}

// ─── Helper de cálculo recursivo (igual que en formulas.ts) ──────────────────

type ItemConIngrediente = any  // usa el tipo real de Prisma en tu proyecto

function calcularPrecioNivel3(items: ItemConIngrediente[]): number {
  const subtotales = items.map((i: ItemConIngrediente) => ({
    precio:   i.insumo ? i.insumo.price.toNumber() : 0,
    cantidad: i.cantidad.toNumber(),
  }))
  const sumaSubtotales = subtotales.reduce((t: number, i: any) => t + i.precio * i.cantidad, 0)
  const sumaCantidades  = subtotales.reduce((t: number, i: any) => t + i.cantidad, 0)
  return sumaCantidades > 0 ? sumaSubtotales / sumaCantidades : 0
}

function calcularPrecioDetalle(item: ItemConIngrediente): number {
  if (item.insumo) return item.insumo.price.toNumber()

  if (item.subFormula) {
    const subItems = item.subFormula.items.map((subItem: ItemConIngrediente) => ({
      precio: subItem.insumo
        ? subItem.insumo.price.toNumber()
        : subItem.subFormula
        ? calcularPrecioNivel3(subItem.subFormula.items)
        : 0,
      cantidad: subItem.cantidad.toNumber(),
    }))
    const sumaSubtotales = subItems.reduce((t: number, i: any) => t + i.precio * i.cantidad, 0)
    const sumaCantidades  = subItems.reduce((t: number, i: any) => t + i.cantidad, 0)
    return sumaCantidades > 0 ? sumaSubtotales / sumaCantidades : 0
  }

  return 0
}

function calcularPrecioFormula(items: ItemConIngrediente[]): number {
  const subtotales = items.map((item) => ({
    precio:   calcularPrecioDetalle(item),
    cantidad: item.cantidad.toNumber(),
  }))

  const sumaSubtotales = subtotales.reduce((t, i) => t + i.precio * i.cantidad, 0)
  const sumaCantidades  = subtotales.reduce((t, i) => t + i.cantidad, 0)

  return sumaCantidades > 0 ? sumaSubtotales / sumaCantidades : 0
}