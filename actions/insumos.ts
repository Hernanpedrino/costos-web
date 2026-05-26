"use server"

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { Prisma } from "@/generated/prisma";
import { serializarInsumo } from "@/types";
import { registrarAccion } from "@/lib/registrarAccion";
import { guardarSnapshotFormulas } from "@/lib/snapshotFormulas"
import type { Insumo, CreateInsumoDTO, UpdateInsumoDTO } from "@/types";
import { auth } from "@/auth"

type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };

// ─── GET ──────────────────────────────────────────────────────────────────────

export async function getInsumosAction(): Promise<Insumo[]> {
  const raws = await prisma.insumo.findMany({
    orderBy: { createdAt: "desc" },
  });
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
  const session = await auth()
  const usuarioId = session?.user?.id ?? ""
  try {
    const raw = await prisma.insumo.create({
      data: {
        name: data.name,
        suplier: data.suplier,
        price: new Prisma.Decimal(data.price),
      },
    });

    // Registramos después de confirmar que el guardado fue exitoso
    await registrarAccion({
      usuarioId,
      accion: "CREAR",
      entidad: "Insumo",
      entidadId: raw.id,
      detalle: {
        name: raw.name,
        suplier: raw.suplier,
        price: raw.price.toString(),
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
    console.error("[createInsumoAction]", error);
    return { success: false, error: "Error al guardar el insumo." };
  }
}

// ─── UPDATE ───────────────────────────────────────────────────────────────────

export async function updateInsumoAction(
  data: UpdateInsumoDTO
): Promise<ActionResult<Insumo>> {
  const { id, price, ...rest } = data;
  const session = await auth()
  const usuarioId = session?.user?.id ?? ""

  try {
    const anterior = await prisma.insumo.findUnique({ where: { id } });

    const raw = await prisma.insumo.update({
      where: { id },
      data: {
        ...rest,
        ...(price !== undefined && { price: new Prisma.Decimal(price) }),
      },
    });

    const precioAntes = anterior?.price.toNumber() ?? 0
    const precioDespues = raw.price.toNumber()
    const precioCambio = precioAntes !== precioDespues

    if (precioCambio && usuarioId) {
      await prisma.historialPrecioInsumo.create({
        data: {
          insumoId: id,
          precioAntes: new Prisma.Decimal(precioAntes),
          precioDespues: raw.price,
          usuarioId,
        },
      })
      await guardarSnapshotFormulas(id)
    }

    await registrarAccion({
      usuarioId,
      accion: "EDITAR",
      entidad: "Insumo",
      entidadId: raw.id,
      detalle: {
        anterior: {
          name: anterior?.name,
          price: anterior?.price.toString(),
        },
        nuevo: {
          name: raw.name,
          price: raw.price.toString(),
        },
        precioCambio,
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
  const session = await auth()
  const usuarioId = session?.user?.id ?? ""
  try {
    // Guardamos los datos antes de eliminar — después ya no los podemos leer
    const anterior = await prisma.insumo.findUnique({ where: { id } });

    await prisma.insumo.delete({ where: { id } });

    await registrarAccion({
      usuarioId,
      accion: "ELIMINAR",
      entidad: "Insumo",
      entidadId: id,
      detalle: {
        name: anterior?.name,
        suplier: anterior?.suplier,
        price: anterior?.price.toString(),
      },
    });

    revalidatePath("/insumos");
    return { success: true, data: null };

  } catch (error) {
    console.error("[deleteInsumoAction]", error);
    return { success: false, error: "Error al eliminar el insumo." };
  }
}