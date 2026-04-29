"use server"

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

export async function createFormulaAction(data: {
  name: string;
  insumos: { nombreInsumo: string; cantidad: string; esFormula?: boolean }[];
}) {
  try {
    const result = await prisma.formula.create({
      data: {
        name: data.name,
        items: {
          create: data.insumos.map((item) => ({
            cantidad: item.cantidad,
            insumoId: item.esFormula ? null : item.nombreInsumo,
            subFormulaId: item.esFormula ? item.nombreInsumo : null,
          })),
        },
      },
    });

    revalidatePath("/formulas");
    return { success: true };
  } catch (error: any) {
    console.error(error);
    return { success: false, error: "Error al guardar la fórmula compleja" };
  }
}
