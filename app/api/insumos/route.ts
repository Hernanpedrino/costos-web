import { prisma } from '@/lib/prisma';
import { NextResponse, NextRequest } from 'next/server'

export async function POST(request: Request) {
  const body = await request.json();
  const newIput = await prisma.inputs.create({ data: body });
  return NextResponse.json(newIput);
}

export async function GET(request:Request) {
  const inputs = await prisma.inputs.findMany();
  return NextResponse.json(inputs);
}