// app/(pages)/admin/usuarios/page.tsx
import { redirect } from "next/navigation"
import { auth } from "@/auth"
import { getUsuariosAction } from "@/actions/usuarios"
import { UsuariosClient } from "@/components/admin/UsuariosClient"

export const dynamic = "force-dynamic"

export default async function UsuariosPage() {
  const session = await auth()

  // Protección a nivel de page — si no es ADMIN, redirige al inicio
  if (session?.user?.role !== "ADMIN") {
    redirect("/")
  }

  const usuarios = await getUsuariosAction()

  return (
    <div className="container mx-auto px-2 py-10">
      <h1 className="text-3xl text-center my-5 font-bold">Gestión de usuarios</h1>
      <UsuariosClient initialData={usuarios} />
    </div>
  )
}
