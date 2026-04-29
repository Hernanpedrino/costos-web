
import { prisma } from '@/lib/prisma';
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  const body = await request.json();
  const newIput = await prisma.insumo.create(body)
  return NextResponse.json(newIput);
}

export async function GET(request:Request) {
  const insumos = await prisma.insumo.findMany()
  return NextResponse.json(insumos);
}