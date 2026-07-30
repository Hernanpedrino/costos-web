// actions/informes.ts
"use server"

import { prisma } from "@/lib/prisma"
import { calcularPrecioFormula } from "@/lib/calcularPrecioFormula"
import type { ISODateString } from "@/types"

export interface InformeFormula {
  id: string
  nombre: string
  precioActual: number
  precioAnterior: number | null
  variacionPct: number | null   // null = sin historial previo
  tendencia: "sube" | "baja" | "igual" | "nuevo"
  ultimoCambio: ISODateString | null
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
        take: 2,
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
      if (variacionPct > 0.01) tendencia = "sube"
      else if (variacionPct < -0.01) tendencia = "baja"
      else tendencia = "igual"
    }

    return {
      id: formula.id,
      nombre: formula.name,
      precioActual,
      precioAnterior,
      variacionPct,
      tendencia,
      ultimoCambio,
    }
  })
}