import { prisma } from '@/lib/prisma';
import { NextResponse, NextRequest } from 'next/server'

export async function GET(request: Request) {
  const inputs = await prisma.inputs.findMany();
  return NextResponse.json(inputs)
}
export async function POST(request: Request) {
  const body = await request.json();
  const newInput = await prisma.inputs.create({ data: body });
  return NextResponse.json(newInput);
}