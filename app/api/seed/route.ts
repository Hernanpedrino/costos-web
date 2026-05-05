// app/api/seed/route.ts
// IMPORTANTE: eliminar este archivo después de crear el usuario admin

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Rol } from "@/generated/prisma";
import bcrypt from "bcryptjs";

export async function POST(req: Request) {
  // Clave de seguridad para evitar que cualquiera llame este endpoint
  const secret = req.headers.get("x-seed-secret");
  if (secret !== process.env.SEED_SECRET) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const { email, password, nombre, rol } = await req.json();

  if (!email || !password || !nombre) {
    return NextResponse.json(
      { error: "email, password y nombre son requeridos" },
      { status: 400 }
    );
  }

  const passwordHash = await bcrypt.hash(password, 12);

  const usuario = await prisma.usuario.upsert({
    where:  { email },
    update: {},
    create: {
      email,
      password: passwordHash,
      nombre,
      rol: rol ?? Rol.ADMIN,
    },
  });

  return NextResponse.json({
    success: true,
    usuario: {
      id:    usuario.id,
      email: usuario.email,
      nombre: usuario.nombre,
      rol:   usuario.rol,
    },
  });
}