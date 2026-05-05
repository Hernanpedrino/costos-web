// components/Login.tsx
"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { signIn } from "next-auth/react"
import { zodResolver } from "@hookform/resolvers/zod"
import { Controller, useForm } from "react-hook-form"
import * as z from "zod"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"

// ─── Schema ───────────────────────────────────────────────────────────────────

const formSchema = z.object({
  email:    z.email("Ingresá un email válido"),
  password: z.string().min(6, "La contraseña debe tener al menos 6 caracteres"),
})

type LoginFormValues = z.infer<typeof formSchema>

// ─── Componente ───────────────────────────────────────────────────────────────

export const Login = () => {
  const router = useRouter()
  const [errorServidor, setErrorServidor] = useState<string | null>(null)

  const form = useForm<LoginFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { email: "", password: "" },
  })

  const onSubmit = async (data: LoginFormValues) => {
    setErrorServidor(null)

    const result = await signIn("credentials", {
      email:    data.email,
      password: data.password,
      redirect: false,       // manejamos la redirección manualmente
    })

    if (result?.error) {
      // NextAuth devuelve error genérico — nunca revelar si es email o password
      setErrorServidor("Email o contraseña incorrectos.")
      return
    }

    router.push("/")
    router.refresh() // sincroniza la sesión en los Server Components
  }

  return (
    <div className="w-full h-screen flex items-center justify-center">
      <div className="w-full md:w-1/3 border rounded-lg shadow-xl">

        {/* Logo */}
        <div className="flex font-bold justify-center my-6">
        </div>

        <h2 className="text-2xl text-center font-bold mb-8">Iniciar sesión</h2>

        <form
          onSubmit={form.handleSubmit(onSubmit)}
          className="px-12 pb-10"
        >
          <FieldGroup>
            <Controller
              name="email"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="login-email">Email</FieldLabel>
                  <Input
                    {...field}
                    id="login-email"
                    type="email"
                    placeholder="ejemplo@correo.com"
                    autoComplete="email"
                    aria-invalid={fieldState.invalid}
                  />
                  {fieldState.invalid && (
                    <FieldError errors={[fieldState.error]} />
                  )}
                </Field>
              )}
            />

            <Controller
              name="password"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="login-password">Contraseña</FieldLabel>
                  <Input
                    {...field}
                    id="login-password"
                    type="password"
                    placeholder="••••••••"
                    autoComplete="current-password"
                    aria-invalid={fieldState.invalid}
                  />
                  {fieldState.invalid && (
                    <FieldError errors={[fieldState.error]} />
                  )}
                </Field>
              )}
            />
          </FieldGroup>

          {/* Error de credenciales (viene del servidor) */}
          {errorServidor && (
            <p className="mt-4 text-sm px-3 py-2 rounded-md bg-red-50 text-red-700 border border-red-200">
              {errorServidor}
            </p>
          )}

          <Button
            type="submit"
            disabled={form.formState.isSubmitting}
            className="w-full py-2 mt-8 rounded-full bg-green-800 text-white
                       focus:outline-none hover:bg-green-600
                       disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {form.formState.isSubmitting ? "Ingresando..." : "Ingresar"}
          </Button>
        </form>
      </div>
    </div>
  )
}
