// lib/snapshotFormulas.ts
// Guarda el precio actual de todas las fórmulas que usan un insumo determinado.
// Se llama desde updateInsumoAction después de actualizar el precio.

import { prisma } from "@/lib/prisma"
import { Prisma } from "@/generated/prisma"
import { calcularPrecioFormula } from "@/lib/calcularPrecioFormula"

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
    const precio = calcularPrecioFormula(formula.items)

    return {
      formulaId: formula.id,
      precio:    new Prisma.Decimal(precio.toFixed(2)),
      insumoId,
    }
  })

  await prisma.historialPrecioFormula.createMany({ data: snapshots })
}