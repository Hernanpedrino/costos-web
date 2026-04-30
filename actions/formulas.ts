"use server"

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

export interface FormulaWithItems {
  id: string;
  name: string;
  createdAt: Date;
  items: {
    id: string;
    cantidad: string;
    nombreIngrediente: string;
    precioInsumo: number | null;
  }[];
}


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
export async function getFormulasAction(): Promise<FormulaWithItems[]> {
  const formulas = await prisma.formula.findMany({
    include: {
      items: {
        include: {
          insumo: true,
          subFormula: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });
  return formulas.map((formula) => ({
    id: formula.id,
    name: formula.name,
    createdAt: formula.createdAt, 
    items: formula.items.map((item) => ({
      id: item.id,
      cantidad: item.cantidad, 
      nombreIngrediente: item.insumo?.name || item.subFormula?.name || "Desconocido",
      precioInsumo: item.insumo ? Number(item.insumo.price) : 0, 
    })),
  }));
}
