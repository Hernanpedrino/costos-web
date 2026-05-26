"use server"

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { Prisma } from "@/generated/prisma";
import { serializarFormula } from "@/types";
import { registrarAccion } from "@/lib/registrarAccion";
import { auth } from "@/auth";
import type { Formula, CreateFormulaDTO, ISODateString } from "@/types";

type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };

export interface FormulaListItem {
  id: string;
  name: string;
  createdAt: ISODateString;
  items: {
    id: string;
    cantidad: number;
    nombreIngrediente: string;
    precioIngrediente: number;
  }[];
  precioTotal: number;
}

type FormulaDetalleConIngrediente = Prisma.FormulaDetalleGetPayload<{
  include: {
    insumo: true;
    subFormula: {
      include: {
        items: {
          include: {
            insumo: true;
            subFormula: {
              include: {
                items: {
                  include: { insumo: true };
                };
              };
            };
          };
        };
      };
    };
  };
}>;

function calcularPrecioNivel3(items: any[]): number {
  const subtotales = items.map((i: any) => ({
    precio:   i.insumo ? i.insumo.price.toNumber() : 0,
    cantidad: i.cantidad.toNumber(),
  }))
  const sumaSubtotales = subtotales.reduce((t, i) => t + i.precio * i.cantidad, 0)
  const sumaCantidades  = subtotales.reduce((t, i) => t + i.cantidad, 0)
  return sumaCantidades > 0 ? sumaSubtotales / sumaCantidades : 0
}

function calcularPrecioDetalle(item: FormulaDetalleConIngrediente): number {
  if (item.insumo) return item.insumo.price.toNumber();

  if (item.subFormula) {
    const subItems = item.subFormula.items.map((subItem) => ({
      precio: subItem.insumo
        ? subItem.insumo.price.toNumber()
        : subItem.subFormula
        ? calcularPrecioNivel3(subItem.subFormula.items)
        : 0,
      cantidad: subItem.cantidad.toNumber(),
    }))
    const sumaSubtotales = subItems.reduce((t, i) => t + i.precio * i.cantidad, 0)
    const sumaCantidades  = subItems.reduce((t, i) => t + i.cantidad, 0)
    return sumaCantidades > 0 ? sumaSubtotales / sumaCantidades : 0
  }

  return 0;
}

// ─── GET ──────────────────────────────────────────────────────────────────────

export async function getFormulasAction(): Promise<FormulaListItem[]> {
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
                    include: { items: { include: { insumo: true } } },
                  },
                },
              },
            },
          },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return formulas.map((formula) => {
    const items = formula.items.map((item) => {
      const precioIngrediente = calcularPrecioDetalle(item);
      const cantidad = item.cantidad.toNumber();
      return {
        id: item.id,
        cantidad,
        nombreIngrediente: item.insumo?.name ?? item.subFormula?.name ?? "Desconocido",
        precioIngrediente,
        _subtotal: precioIngrediente * cantidad,
      };
    });

    const precioTotal = items.reduce((total, item) => total + item._subtotal, 0);

    return {
      id: formula.id,
      name: formula.name,
      createdAt: formula.createdAt.toISOString(),
      items: items.map(({ _subtotal: _, ...rest }) => rest),
      precioTotal,
    };
  });
}

export async function getFormulaByIdAction(id: string): Promise<Formula | null> {
  const raw = await prisma.formula.findUnique({ where: { id } });
  return raw ? serializarFormula(raw) : null;
}

// ─── CREATE ───────────────────────────────────────────────────────────────────

export async function createFormulaAction(
  data: CreateFormulaDTO
): Promise<ActionResult<Formula>> {
  const itemsInvalidos = data.items.filter(
    (item) => !item.insumoId && !item.subFormulaId
  );
  if (itemsInvalidos.length > 0) {
    return { success: false, error: "Cada ingrediente debe ser un insumo o una sub-fórmula." };
  }

  try {
    const session   = await auth()
    const usuarioId = session?.user?.id ?? ""

    const raw = await prisma.formula.create({
      data: {
        name: data.name,
        items: {
          create: data.items.map((item) => ({
            cantidad:     new Prisma.Decimal(item.cantidad),
            insumoId:     item.insumoId     ?? null,
            subFormulaId: item.subFormulaId ?? null,
          })),
        },
      },
    });

    await registrarAccion({
      usuarioId,
      accion:    "CREAR",
      entidad:   "Formula",
      entidadId: raw.id,
      detalle: {
        name:          raw.name,
        cantidadItems: data.items.length,
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
    const session   = await auth()
    const usuarioId = session?.user?.id ?? ""
    const anterior  = await prisma.formula.findUnique({ where: { id } });

    await prisma.formula.delete({ where: { id } });

    await registrarAccion({
      usuarioId,
      accion:    "ELIMINAR",
      entidad:   "Formula",
      entidadId: id,
      detalle: { name: anterior?.name },
    });

    revalidatePath("/formulas");
    return { success: true, data: null };

  } catch (error) {
    console.error("[deleteFormulaAction]", error);
    return { success: false, error: "Error al eliminar la fórmula." };
  }
}