"use server"

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { Prisma } from "@/generated/prisma";
import { serializarFormula } from "@/types";
import type {
  Formula,
  CreateFormulaDTO,
  ISODateString,
} from "@/types";

// ─── Tipo de retorno ──────────────────────────────────────────────────────────

type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };

// ─── View model para la lista de fórmulas ────────────────────────────────────
// Esta forma "aplanada" es específica de la vista de lista.
// Exportala para tiparla en los componentes que la consuman.

export interface FormulaListItem {
  id: string;
  name: string;
  createdAt: ISODateString; // ← string, no Date — serializable a Client Components
  items: {
    id: string;
    cantidad: string;
    nombreIngrediente: string;
    // null cuando el ingrediente es una sub-fórmula (no tiene precio propio)
    precioInsumo: number | null;
  }[];
}

// ─── GET (lista) ──────────────────────────────────────────────────────────────

export async function getFormulasAction(): Promise<FormulaListItem[]> {
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
    createdAt: formula.createdAt.toISOString(), // ← Date → string
    items: formula.items.map((item) => ({
      id: item.id,
      cantidad: item.cantidad,
      nombreIngrediente:
        item.insumo?.name ?? item.subFormula?.name ?? "Desconocido",
      // Usamos null (no 0) para sub-fórmulas — 0 puede confundirse con precio real
      precioInsumo: item.insumo ? item.insumo.price.toNumber() : null,
    })),
  }));
}

// ─── GET (detalle por id) ─────────────────────────────────────────────────────

export async function getFormulaByIdAction(
  id: string
): Promise<Formula | null> {
  const raw = await prisma.formula.findUnique({ where: { id } });
  return raw ? serializarFormula(raw) : null;
}

// ─── CREATE ───────────────────────────────────────────────────────────────────
// CAMBIO CLAVE: el DTO ahora usa insumoId / subFormulaId en lugar de
// "nombreInsumo" + flag esFormula. Más explícito y type-safe.
//
// Antes:  { nombreInsumo: string; esFormula?: boolean }
// Ahora:  { insumoId?: string; subFormulaId?: string }   ← CreateFormulaDetalleDTO

export async function createFormulaAction(
  data: CreateFormulaDTO
): Promise<ActionResult<Formula>> {
  // Validación: cada item debe tener exactamente uno de los dos IDs
  const itemsInvalidos = data.items.filter(
    (item) => !item.insumoId && !item.subFormulaId
  );
  if (itemsInvalidos.length > 0) {
    return {
      success: false,
      error: "Cada ingrediente debe ser un insumo o una sub-fórmula.",
    };
  }

  try {
    const raw = await prisma.formula.create({
      data: {
        name: data.name,
        items: {
          create: data.items.map((item) => ({
            cantidad:      item.cantidad,
            insumoId:      item.insumoId     ?? null,
            subFormulaId:  item.subFormulaId ?? null,
          })),
        },
      },
    });

    revalidatePath("/formulas");
    return { success: true, data: serializarFormula(raw) };

  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return { success: false, error: "Ya existe una fórmula con ese nombre." };
    }
    console.error("[createFormulaAction]", error);
    return { success: false, error: "Error al guardar la fórmula." };
  }
}

// ─── DELETE ───────────────────────────────────────────────────────────────────

export async function deleteFormulaAction(
  id: string
): Promise<ActionResult<null>> {
  try {
    // onDelete: Cascade en FormulaDetalle elimina los items automáticamente
    await prisma.formula.delete({ where: { id } });
    revalidatePath("/formulas");
    return { success: true, data: null };

  } catch (error) {
    console.error("[deleteFormulaAction]", error);
    return { success: false, error: "Error al eliminar la fórmula." };
  }
}