"use server"

// actions/auth.ts
import { signIn, signOut } from "@/auth"
import { AuthError } from "next-auth"

export async function loginAction(formData: FormData) {
  try {
    // Sin redirectTo — solo autentica y setea la cookie.
    // La navegación la maneja el cliente con router.push
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
  await signOut({ redirectTo: "/login" })
}