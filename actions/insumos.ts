"use server"

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { Prisma } from "@/generated/prisma";
import { serializarInsumo } from "@/types";
import { registrarAccion } from "@/lib/registrarAccion";
import { auth } from "@/auth";
import type { Insumo, CreateInsumoDTO, UpdateInsumoDTO } from "@/types";

type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };

// ─── GET ──────────────────────────────────────────────────────────────────────

export async function getInsumosAction(): Promise<Insumo[]> {
  const raws = await prisma.insumo.findMany({ orderBy: { createdAt: "desc" } });
  return raws.map(serializarInsumo);
}

export async function getInsumoByIdAction(id: string): Promise<Insumo | null> {
  const raw = await prisma.insumo.findUnique({ where: { id } });
  return raw ? serializarInsumo(raw) : null;
}

// ─── GET HISTORIAL DE PRECIOS ─────────────────────────────────────────────────

export interface HistorialPrecio {
  id:            string;
  precioAntes:   number;
  precioDespues: number;
  variacion:     number;   // precioDespues - precioAntes
  variacionPct:  number;   // % de cambio respecto al precio anterior
  usuario:       string;   // nombre del usuario que hizo el cambio
  createdAt:     string;   // ISODateString
}

export async function getHistorialPreciosAction(
  insumoId: string
): Promise<HistorialPrecio[]> {
  const registros = await prisma.historialPrecioInsumo.findMany({
    where:   { insumoId },
    include: { usuario: { select: { nombre: true } } },
    orderBy: { createdAt: "desc" },
  });

  return registros.map((r) => {
    const antes   = r.precioAntes.toNumber();
    const despues = r.precioDespues.toNumber();
    return {
      id:            r.id,
      precioAntes:   antes,
      precioDespues: despues,
      variacion:     despues - antes,
      variacionPct:  antes > 0 ? ((despues - antes) / antes) * 100 : 0,
      usuario:       r.usuario.nombre,
      createdAt:     r.createdAt.toISOString(),
    };
  });
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
        price:   new Prisma.Decimal(data.price),
      },
    });

    await registrarAccion({
      accion:    "CREAR",
      entidad:   "Insumo",
      entidadId: raw.id,
      detalle: { name: raw.name, suplier: raw.suplier, price: raw.price.toString() },
    });

    revalidatePath("/insumos");
    return { success: true, data: serializarInsumo(raw) };

  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
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
    const anterior = await prisma.insumo.findUnique({ where: { id } });
    const session  = await auth();

    const raw = await prisma.insumo.update({
      where: { id },
      data: {
        ...rest,
        ...(price !== undefined && { price: new Prisma.Decimal(price) }),
      },
    });

    // Registrar historial SOLO si el precio cambió
    const precioAntes   = anterior?.price.toNumber() ?? 0;
    const precioDespues = raw.price.toNumber();
    const precioCambio  = precioAntes !== precioDespues;

    if (precioCambio && session?.user?.id) {
      await prisma.historialPrecioInsumo.create({
        data: {
          insumoId:      id,
          precioAntes:   new Prisma.Decimal(precioAntes),
          precioDespues: raw.price,
          usuarioId:     session.user.id,
        },
      });
    }

    await registrarAccion({
      accion:    "EDITAR",
      entidad:   "Insumo",
      entidadId: raw.id,
      detalle: {
        anterior: { name: anterior?.name, price: anterior?.price.toString() },
        nuevo:    { name: raw.name, price: raw.price.toString() },
        precioCambio,
      },
    });

    revalidatePath("/insumos");
    return { success: true, data: serializarInsumo(raw) };

  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { success: false, error: "Ya existe un insumo con ese nombre." };
    }
    console.error("[updateInsumoAction]", error);
    return { success: false, error: "Error al actualizar el insumo." };
  }
}

// ─── DELETE ───────────────────────────────────────────────────────────────────

export async function deleteInsumoAction(id: string): Promise<ActionResult<null>> {
  try {
    const anterior = await prisma.insumo.findUnique({ where: { id } });
    await prisma.insumo.delete({ where: { id } });

    await registrarAccion({
      accion:    "ELIMINAR",
      entidad:   "Insumo",
      entidadId: id,
      detalle:   { name: anterior?.name, price: anterior?.price.toString() },
    });

    revalidatePath("/insumos");
    return { success: true, data: null };

  } catch (error) {
    console.error("[deleteInsumoAction]", error);
    return { success: false, error: "Error al eliminar el insumo." };
  }
}