"use server"

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { Prisma } from "@/generated/prisma";
import { serializarFormula } from "@/types";
import { auth } from "@/auth"
import type {
  Formula,
  CreateFormulaDTO,
  ISODateString,
} from "@/types";
import { registrarAccion } from "@/lib/registrarAccion";

// ─── Tipo de retorno ──────────────────────────────────────────────────────────

type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };

// ─── View model para la lista de fórmulas ────────────────────────────────────

export interface FormulaListItem {
  id: string;
  name: string;
  createdAt: ISODateString;
  items: {
    id: string;
    cantidad: number;
    nombreIngrediente: string;
    precioIngrediente: number;
    insumoId: string | null;
    subFormulaId: string | null;
  }[];
  precioTotal: number;
}

// ─── Tipo auxiliar para la query profunda ────────────────────────────────────

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

// ─── Cálculo recursivo de precio ─────────────────────────────────────────────

function calcularPrecioDetalle(item: FormulaDetalleConIngrediente): number {
  if (item.insumo) {
    return item.insumo.price.toNumber();
  }

  if (item.subFormula) {
    return item.subFormula.items.reduce((total, subItem) => {
      const cantidad = subItem.cantidad.toNumber(); // ← era parseFloat(string)
      const precio = subItem.insumo
        ? subItem.insumo.price.toNumber()
        : subItem.subFormula
          ? subItem.subFormula.items.reduce((t, i) => {
            const c = i.cantidad.toNumber(); // ← era parseFloat(string)
            return t + (i.insumo ? i.insumo.price.toNumber() : 0) * c;
          }, 0)
          : 0;
      return total + precio * cantidad;
    }, 0);
  }

  return 0;
}

// ─── GET (lista) ──────────────────────────────────────────────────────────────

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
                    include: {
                      items: {
                        include: { insumo: true },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    orderBy: { name: "asc" },
  });

  return formulas.map((formula) => {
    const items = formula.items.map((item) => {
      const precioIngrediente = calcularPrecioDetalle(item);
      const cantidad = item.cantidad.toNumber();
      return {
        id: item.id,
        cantidad,
        nombreIngrediente:
          item.insumo?.name ?? item.subFormula?.name ?? "Desconocido",
        precioIngrediente,
        _subtotal: precioIngrediente * cantidad,
        insumoId: item.insumoId,
        subFormulaId: item.subFormulaId,
      };
    });

    const sumaSubtotales = items.reduce((total, item) => total + item._subtotal, 0);
    const sumaCantidades = items.reduce((total, item) => total + item.cantidad, 0);
    const precioTotal = sumaCantidades > 0 ? sumaSubtotales / sumaCantidades : 0;

    return {
      id: formula.id,
      name: formula.name,
      createdAt: formula.createdAt.toISOString(),
      items: items.map(({ _subtotal: _, ...rest }) => rest),
      precioTotal,
    };
  });
}

// ─── GET (detalle por id) ─────────────────────────────────────────────────────

export async function getFormulaByIdAction(
  id: string
): Promise<Formula | null> {
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
            cantidad: new Prisma.Decimal(item.cantidad), // ← string → Decimal
            insumoId: item.insumoId ?? null,
            subFormulaId: item.subFormulaId ?? null,
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
    await prisma.formula.delete({ where: { id } });
    revalidatePath("/formulas");
    return { success: true, data: null };

  } catch (error) {
    console.error("[deleteFormulaAction]", error);
    return { success: false, error: "Error al eliminar la fórmula." };
  }
}
export async function updateFormulaAction(
  id: string,
  data: CreateFormulaDTO
): Promise<ActionResult<Formula>> {
  const itemsInvalidos = data.items.filter(
    (item) => !item.insumoId && !item.subFormulaId
  );
  if (itemsInvalidos.length > 0) {
    return { success: false, error: "Cada ingrediente debe tener un insumo o sub-fórmula." };
  }

  try {
    const session = await auth();
    const usuarioId = session?.user?.id ?? "";
    const anterior = await prisma.formula.findUnique({ where: { id } });

    const raw = await prisma.formula.update({
      where: { id },
      data: {
        name: data.name,
        items: {
          // Borramos todos los items actuales y creamos los nuevos
          deleteMany: {},
          create: data.items.map((item) => ({
            cantidad: new Prisma.Decimal(item.cantidad),
            insumoId: item.insumoId ?? null,
            subFormulaId: item.subFormulaId ?? null,
          })),
        },
      },
    });

    await registrarAccion({
      usuarioId,
      accion: "EDITAR",
      entidad: "Formula",
      entidadId: raw.id,
      detalle: {
        anterior: { name: anterior?.name, cantidadItems: anterior ? undefined : 0 },
        nuevo: { name: raw.name, cantidadItems: data.items.length },
      },
    });

    revalidatePath("/formulas");
    return { success: true, data: serializarFormula(raw) };

  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { success: false, error: "Ya existe una fórmula con ese nombre." };
    }
    console.error("[updateFormulaAction]", error);
    return { success: false, error: "Error al actualizar la fórmula." };
  }
}