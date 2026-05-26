// lib/snapshotFormulas.ts
// Guarda el precio actual de todas las fórmulas que usan un insumo determinado.
// Se llama desde updateInsumoAction después de actualizar el precio.

import { prisma } from "@/lib/prisma"
import { Prisma } from "@/generated/prisma"

type ItemConIngrediente = any

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

export async function guardarSnapshotFormulas(insumoId: string): Promise<void> {
  // Buscar todas las fórmulas que usan este insumo (directamente o via sub-fórmula)
  const formulasDirectas = await prisma.formula.findMany({
    where: {
      items: { some: { insumoId } },
    },
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
    },
  })

  // También fórmulas que usan sub-fórmulas que contienen este insumo
  const formulasIndirectas = await prisma.formula.findMany({
    where: {
      items: {
        some: {
          subFormula: {
            items: { some: { insumoId } },
          },
        },
      },
    },
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
    },
  })

  // Deduplicar por id
  const todasMap = new Map<string, typeof formulasDirectas[0]>()
  for (const f of [...formulasDirectas, ...formulasIndirectas]) {
    todasMap.set(f.id, f)
  }
  const todas = Array.from(todasMap.values())

  if (todas.length === 0) return

  // Calcular precio actual de cada fórmula y guardar snapshot
  const snapshots = todas.map((formula) => {
    const subtotales = formula.items.map((item) => ({
      precio:   calcularPrecioDetalle(item),
      cantidad: item.cantidad.toNumber(),
    }))
    const sumaSubtotales = subtotales.reduce((t, i) => t + i.precio * i.cantidad, 0)
    const sumaCantidades  = subtotales.reduce((t, i) => t + i.cantidad, 0)
    const precio          = sumaCantidades > 0 ? sumaSubtotales / sumaCantidades : 0

    return {
      formulaId: formula.id,
      precio:    new Prisma.Decimal(precio.toFixed(2)),
      insumoId,
    }
  })

  await prisma.historialPrecioFormula.createMany({ data: snapshots })
}