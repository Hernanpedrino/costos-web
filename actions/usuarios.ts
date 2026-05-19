// actions/usuarios.ts
"use server"

import { prisma } from "@/lib/prisma"
import { revalidatePath } from "next/cache"
import { Rol } from "@/generated/prisma"
import { auth } from "@/auth"
import bcrypt from "bcryptjs"
import * as z from "zod"

// ─── Schema de validación ─────────────────────────────────────────────────────

const createUsuarioSchema = z.object({
  nombre:   z.string().min(2, "El nombre debe tener al menos 2 caracteres"),
  email:    z.string().email("Email inválido"),
  password: z.string().min(6, "La contraseña debe tener al menos 6 caracteres"),
})

type ActionResult<T> =
  | { success: true;  data: T }
  | { success: false; error: string }

export interface UsuarioListItem {
  id:        string
  nombre:    string
  email:     string
  rol:       string
  activo:    boolean
  createdAt: string
}

// ─── Verificar que el usuario actual es ADMIN ─────────────────────────────────

async function verificarAdmin(): Promise<boolean> {
  const session = await auth()
  return session?.user?.role === "ADMIN"
}

// ─── GET usuarios ─────────────────────────────────────────────────────────────

export async function getUsuariosAction(): Promise<UsuarioListItem[]> {
  const esAdmin = await verificarAdmin()
  if (!esAdmin) return []

  const usuarios = await prisma.usuario.findMany({
    orderBy: { createdAt: "desc" },
  })

  return usuarios.map((u) => ({
    id:        u.id,
    nombre:    u.nombre,
    email:     u.email,
    rol:       u.rol,
    activo:    u.activo,
    createdAt: u.createdAt.toISOString(),
  }))
}

// ─── CREATE usuario operador ──────────────────────────────────────────────────

export async function createUsuarioAction(data: {
  nombre:   string
  email:    string
  password: string
}): Promise<ActionResult<UsuarioListItem>> {
  const esAdmin = await verificarAdmin()
  if (!esAdmin) {
    return { success: false, error: "No tenés permisos para realizar esta acción." }
  }

  const parsed = createUsuarioSchema.safeParse(data)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message }
  }

  try {
    const passwordHash = await bcrypt.hash(parsed.data.password, 12)

    const usuario = await prisma.usuario.create({
      data: {
        nombre:   parsed.data.nombre,
        email:    parsed.data.email,
        password: passwordHash,
        rol:      Rol.OPERADOR,  // siempre OPERADOR — ADMIN solo se crea por seed
      },
    })

    revalidatePath("/admin/usuarios")
    return {
      success: true,
      data: {
        id:        usuario.id,
        nombre:    usuario.nombre,
        email:     usuario.email,
        rol:       usuario.rol,
        activo:    usuario.activo,
        createdAt: usuario.createdAt.toISOString(),
      },
    }
  } catch (error: any) {
    if (error?.code === "P2002") {
      return { success: false, error: "Ya existe un usuario con ese email." }
    }
    console.error("[createUsuarioAction]", error)
    return { success: false, error: "Error al crear el usuario." }
  }
}

// ─── TOGGLE activo/inactivo ───────────────────────────────────────────────────

export async function toggleUsuarioActivoAction(
  id: string
): Promise<ActionResult<null>> {
  const esAdmin = await verificarAdmin()
  if (!esAdmin) {
    return { success: false, error: "No tenés permisos." }
  }

  try {
    const usuario = await prisma.usuario.findUnique({ where: { id } })
    if (!usuario) return { success: false, error: "Usuario no encontrado." }

    await prisma.usuario.update({
      where: { id },
      data:  { activo: !usuario.activo },
    })

    revalidatePath("/admin/usuarios")
    return { success: true, data: null }
  } catch (error) {
    console.error("[toggleUsuarioActivoAction]", error)
    return { success: false, error: "Error al actualizar el usuario." }
  }
}
