// components/admin/UsuariosClient.tsx
"use client"

import { useState } from "react"
import { zodResolver } from "@hookform/resolvers/zod"
import { Controller, useForm } from "react-hook-form"
import * as z from "zod"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"

import {
  createUsuarioAction,
  toggleUsuarioActivoAction,
  resetPasswordAction,
  type UsuarioListItem,
} from "@/actions/usuarios"

// ─── Schema ───────────────────────────────────────────────────────────────────

const formSchema = z.object({
  nombre: z.string().min(2, "Mínimo 2 caracteres"),
  email: z.string().email("Email inválido"),
  password: z.string().min(6, "Mínimo 6 caracteres"),
})

type FormValues = z.infer<typeof formSchema>

// ─── Helpers ──────────────────────────────────────────────────────────────────

const formatearFecha = (iso: string) =>
  new Intl.DateTimeFormat("es-AR", {
    day: "2-digit", month: "2-digit", year: "numeric",
  }).format(new Date(iso))

// ─── Componente ───────────────────────────────────────────────────────────────

export function UsuariosClient({ initialData }: { initialData: UsuarioListItem[] }) {
  const [usuarios, setUsuarios] = useState<UsuarioListItem[]>(initialData)
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null)
  const [resetando, setResetando] = useState<string | null>(null)  // id del usuario
  const [nuevaPass, setNuevaPass] = useState('')
  const [feedbackReset, setFeedbackReset] = useState<{ type: 'success' | 'error'; msg: string } | null>(null)

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { nombre: "", email: "", password: "" },
  })

  const onSubmit = async (data: FormValues) => {
    setFeedback(null)
    const result = await createUsuarioAction(data)

    if (result.success) {
      setFeedback({ type: "success", message: `Usuario "${result.data.nombre}" creado correctamente.` })
      form.reset()
      setUsuarios((prev) => [result.data, ...prev])
    } else {
      setFeedback({ type: "error", message: result.error })
    }
  }

  const handleToggle = async (id: string) => {
    const result = await toggleUsuarioActivoAction(id)
    if (result.success) {
      setUsuarios((prev) =>
        prev.map((u) => (u.id === id ? { ...u, activo: !u.activo } : u))
      )
    }
  }
  async function handleReset(id: string) {
    setFeedbackReset(null)
    if (nuevaPass.length < 6) {
      setFeedbackReset({ type: 'error', msg: 'Mínimo 6 caracteres.' })
      return
    }
    const result = await resetPasswordAction({ id, newPassword: nuevaPass })
    if (result.success) {
      setFeedbackReset({ type: 'success', msg: 'Contraseña restablecida.' })
      setResetando(null)
      setNuevaPass('')
    } else {
      setFeedbackReset({ type: 'error', msg: result.error })
    }
  }

  return (
    <div className="flex flex-col items-center gap-10">

      {/* Formulario de creación */}
      <Card className="w-full max-w-md shadow-xl">
        <CardHeader>
          <CardTitle>Nuevo usuario operador</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={form.handleSubmit(onSubmit)}>
            <FieldGroup>
              <Controller
                name="nombre"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor="u-nombre">Nombre completo</FieldLabel>
                    <Input {...field} id="u-nombre" autoComplete="off" placeholder="Juan Pérez" />
                    {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                  </Field>
                )}
              />
              <Controller
                name="email"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor="u-email">Email</FieldLabel>
                    <Input {...field} id="u-email" type="email" autoComplete="off" placeholder="juan@empresa.com" />
                    {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                  </Field>
                )}
              />
              <Controller
                name="password"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor="u-password">Contraseña</FieldLabel>
                    <Input {...field} id="u-password" type="password" autoComplete="off" />
                    {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                  </Field>
                )}
              />
            </FieldGroup>

            {feedback && (
              <p className={`mt-4 text-sm px-3 py-2 rounded-md ${feedback.type === "success"
                ? "bg-green-50 text-green-800 border border-green-200"
                : "bg-red-50 text-red-700 border border-red-200"
                }`}>
                {feedback.message}
              </p>
            )}

            <Button
              type="submit"
              disabled={form.formState.isSubmitting}
              className="w-full mt-6 bg-green-800 text-white hover:bg-green-600
                         disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {form.formState.isSubmitting ? "Creando..." : "Crear usuario"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Separator className="w-full max-w-2xl" />

      {/* Lista de usuarios */}
      <div className="w-full max-w-2xl">
        <h2 className="text-lg font-semibold mb-4">Usuarios registrados</h2>
        <div className="flex flex-col gap-3">
          {usuarios.map((u) => (
            <div
              key={u.id}
              className="flex flex-col border rounded-lg px-4 py-3"  // ← cambiá a flex-col
            >
              <div className="flex items-center justify-between">
                {/* Info del usuario */}
                <div>
                  <p className="font-medium text-sm">{u.nombre}</p>
                  <p className="text-xs text-muted-foreground">{u.email}</p>
                  <p className="text-xs text-muted-foreground">
                    {u.rol} · Creado: {formatearFecha(u.createdAt)}
                  </p>
                </div>

                {/* Botones */}
                <div className="flex items-center gap-3">
                  <span className={`text-xs font-medium px-2 py-1 rounded-full ${u.activo
                      ? "bg-green-50 text-green-700 border border-green-200"
                      : "bg-red-50 text-red-600 border border-red-200"
                    }`}>
                    {u.activo ? "Activo" : "Inactivo"}
                  </span>
                  {u.rol !== "ADMIN" && (
                    <>
                      <Button variant="outline" size="sm" onClick={() => handleToggle(u.id)} className="text-xs">
                        {u.activo ? "Desactivar" : "Activar"}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setResetando(prev => prev === u.id ? null : u.id)
                          setNuevaPass('')
                          setFeedbackReset(null)
                        }}
                        className="text-xs"
                      >
                        🔑 Reset pass
                      </Button>
                    </>
                  )}
                </div>
              </div>

              {/* Panel de reset inline */}
              {resetando === u.id && (
                <div className="mt-3 flex gap-2 items-center">
                  <input
                    type="password"
                    value={nuevaPass}
                    onChange={e => setNuevaPass(e.target.value)}
                    placeholder="Nueva contraseña"
                    className="border rounded px-3 py-1.5 text-sm flex-1"
                  />
                  <Button size="sm" onClick={() => handleReset(u.id)} className="bg-green-700 text-white text-xs">
                    Guardar
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setResetando(null)} className="text-xs">
                    Cancelar
                  </Button>
                  {feedbackReset && (
                    <span className={`text-xs ${feedbackReset.type === 'success' ? 'text-green-700' : 'text-red-600'}`}>
                      {feedbackReset.msg}
                    </span>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
