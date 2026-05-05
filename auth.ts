"use server"

import { signIn, signOut } from "@/auth"
import { AuthError } from "next-auth"
import { redirect } from "next/navigation"

export async function loginAction(formData: FormData) {
  try {
    await signIn("credentials", {
      email:    formData.get("email"),
      password: formData.get("password"),
      redirect: false,
    })
    return { success: true }
  } catch (error) {
    if (error instanceof AuthError) {
      return { success: false, error: "Email o contraseña incorrectos." }
    }
    return { success: false, error: "Error inesperado. Intentá de nuevo." }
  }
}

export async function logoutAction() {
  // signOut sin redirectTo — dejamos que Next.js maneje la redirección
  // con redirect() para que funcione correctamente en cualquier host
  await signOut({ redirect: false })
  redirect("/login")
}