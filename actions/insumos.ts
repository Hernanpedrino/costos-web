"use server"

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { Prisma } from "@/generated/prisma";
import { serializarInsumo } from "@/types";
import type { Insumo, CreateInsumoDTO, UpdateInsumoDTO } from "@/types";

// ─── Tipo de retorno de las actions ───────────────────────────────────────────
// Discriminated union: success = true/false para que el cliente pueda hacer
// narrowing sin casteos: if (result.success) { result.data ... }

type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };

// ─── GET ──────────────────────────────────────────────────────────────────────

export async function getInsumosAction(): Promise<Insumo[]> {
  const raws = await prisma.insumo.findMany({
    orderBy: { createdAt: "desc" },
  });
  // serializarInsumo convierte Decimal → number y Date → ISODateString
  return raws.map(serializarInsumo);
}

export async function getInsumoByIdAction(
  id: string
): Promise<Insumo | null> {
  const raw = await prisma.insumo.findUnique({ where: { id } });
  return raw ? serializarInsumo(raw) : null;
}

// ─── CREATE ───────────────────────────────────────────────────────────────────

export async function createInsumoAction(
  data: CreateInsumoDTO
): Promise<ActionResult<Insumo>> {
  try {
    const raw = await prisma.insumo.create({
      data: {
        name:    data.name,
        suplier: data.suplier,
        // data.price viene como string desde el form — Decimal lo parsea
        price:   new Prisma.Decimal(data.price),
      },
    });

    revalidatePath("/insumos");
    console.log("Insumo creado", data);
    return { success: true, data: serializarInsumo(raw) };

  } catch (error) {
    // P2002 = unique constraint violation (name @unique)
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return { success: false, error: "Ya existe un insumo con ese nombre." };
    }
    console.error("[createInsumoAction]", error);
    return { success: false, error: "Error al guardar el insumo." };
  }
}

// ─── UPDATE ───────────────────────────────────────────────────────────────────

export async function updateInsumoAction(
  data: UpdateInsumoDTO
): Promise<ActionResult<Insumo>> {
  const { id, price, ...rest } = data;

  try {
    const raw = await prisma.insumo.update({
      where: { id },
      data: {
        ...rest,
        // Solo actualizamos el precio si viene en el DTO
        ...(price !== undefined && { price: new Prisma.Decimal(price) }),
      },
    });

    revalidatePath("/insumos");
    return { success: true, data: serializarInsumo(raw) };

  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return { success: false, error: "Ya existe un insumo con ese nombre." };
    }
    console.error("[updateInsumoAction]", error);
    return { success: false, error: "Error al actualizar el insumo." };
  }
}

// ─── DELETE ───────────────────────────────────────────────────────────────────

export async function deleteInsumoAction(
  id: string
): Promise<ActionResult<null>> {
  try {
    await prisma.insumo.delete({ where: { id } });
    revalidatePath("/insumos");
    return { success: true, data: null };

  } catch (error) {
    console.error("[deleteInsumoAction]", error);
    return { success: false, error: "Error al eliminar el insumo." };
  }
}