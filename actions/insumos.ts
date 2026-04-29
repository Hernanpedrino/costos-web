"use server"

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
type DataInsumos = {
  name: string;
  id: string;
  suplier: string;
  price: number;
  createdAt: Date;
  updatedAt: Date;
} 
export async function getInsumosAction(): Promise<DataInsumos[]> {
  const insumos = await prisma.insumo.findMany();
  return insumos.map(insumo => ({
    id: insumo.id,
    name: insumo.name,
    suplier: insumo.suplier,
    price: Number(insumo.price),
    createdAt: insumo.createdAt,
    updatedAt: insumo.updatedAt,
  }));
}

export async function createInsumoAction(data: any) {
  try {
    const nuevoInsumo = await prisma.insumo.create({
      data: {
        name: data.name,
        suplier: data.suplier,
        price: data.price,
      },
    });

    revalidatePath("/insumos"); 
    return { 
      success: true, 
      data: {
        ...nuevoInsumo,
        price: Number(nuevoInsumo.price)
      } 
    };
  } catch (error) {
    return { success: false, error: "Error al guardar" };
  }
}
