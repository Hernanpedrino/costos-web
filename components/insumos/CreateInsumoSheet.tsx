"use client"

import { useState } from "react"
import { zodResolver } from "@hookform/resolvers/zod"
import { Controller, useForm } from "react-hook-form"
import * as z from "zod"

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"

import { createInsumoAction } from "@/actions/insumos"
import type { Insumo } from "@/types"

// ─── Schema ───────────────────────────────────────────────────────────────────
// Mismo schema que EditInsumoSheet, para que ambos formularios se comporten igual.

const formSchema = z.object({
  name: z.string().min(2, "Mínimo 2 caracteres").max(32, "Máximo 32 caracteres"),
  suplier: z.string().min(3, "Mínimo 3 caracteres").max(32, "Máximo 32 caracteres"),
  price: z.number({ message: "Ingresá un número válido" })
    .positive("Debe ser mayor a 0")
    .refine((v) => Math.round(v * 100) / 100 === v, "Máximo 2 decimales"),
  codigoBejerman: z.string().optional(),
})

type FormValues = z.infer<typeof formSchema>

const valoresIniciales: Partial<FormValues> = {
  name: "",
  suplier: "",
  price: undefined,
  codigoBejerman: "",
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface CreateInsumoSheetProps {
  open: boolean
  onClose: () => void
  onCreated: (insumo: Insumo) => void
}

// ─── Componente ───────────────────────────────────────────────────────────────

export function CreateInsumoSheet({ open, onClose, onCreated }: CreateInsumoSheetProps) {
  const [feedback, setFeedback] = useState<string | null>(null)

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: valoresIniciales,
  })

  // Cada vez que se abre el sheet, arrancamos con el form limpio.
  // Ajuste de estado durante el render (no en un efecto) para evitar
  // un render en cascada innecesario.
  const [openPrevio, setOpenPrevio] = useState(open)
  if (open !== openPrevio) {
    setOpenPrevio(open)
    if (open) {
      form.reset(valoresIniciales)
      setFeedback(null)
    }
  }

  const onSubmit = async (data: FormValues) => {
    setFeedback(null)

    const result = await createInsumoAction({
      name: data.name,
      suplier: data.suplier,
      price: data.price.toString(),
      codigoBejerman: data.codigoBejerman || undefined,
    })

    if (result.success) {
      onCreated(result.data)
      onClose()
    } else {
      setFeedback(result.error)
    }
  }

  return (
    <Sheet open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Nuevo insumo</SheetTitle>
          <SheetDescription>
            Completá los datos para cargar un insumo nuevo.
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={form.handleSubmit(onSubmit)} className="m-6 space-y-4">
          <FieldGroup>

            <Controller
              name="name"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="create-name">Nombre</FieldLabel>
                  <Input
                    {...field}
                    id="create-name"
                    placeholder="Ají molido"
                    autoComplete="off"
                    aria-invalid={fieldState.invalid}
                  />
                  {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                </Field>
              )}
            />

            <Controller
              name="codigoBejerman"
              control={form.control}
              render={({ field }) => (
                <Field>
                  <FieldLabel htmlFor="create-codigo-bej">
                    Código Bejerman <span className="text-gray-400 text-xs">(opcional)</span>
                  </FieldLabel>
                  <Input
                    {...field}
                    value={field.value ?? ''}
                    id="create-codigo-bej"
                    placeholder="ADI0000015"
                    autoComplete="off"
                  />
                </Field>
              )}
            />

            <Controller
              name="suplier"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="create-suplier">Proveedor</FieldLabel>
                  <Input
                    {...field}
                    id="create-suplier"
                    placeholder="Alimentos del Plata"
                    autoComplete="off"
                    aria-invalid={fieldState.invalid}
                  />
                  {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                </Field>
              )}
            />

            <Controller
              name="price"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="create-price">Precio</FieldLabel>
                  <Input
                    name={field.name}
                    ref={field.ref}
                    onBlur={field.onBlur}
                    value={Number.isNaN(field.value) || field.value === undefined ? "" : field.value}
                    onChange={(e) => field.onChange(e.target.valueAsNumber)}
                    id="create-price"
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="4500"
                    autoComplete="off"
                    aria-invalid={fieldState.invalid}
                  />
                  {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                </Field>
              )}
            />

          </FieldGroup>

          {feedback && (
            <p className="text-sm px-3 py-2 rounded-md bg-red-50 text-red-700 border border-red-200">
              {feedback}
            </p>
          )}

          <div className="flex gap-3 pt-4">
            <Button
              type="submit"
              disabled={form.formState.isSubmitting}
              className="flex-1 bg-green-800 text-white hover:bg-green-600
                         disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {form.formState.isSubmitting ? "Guardando..." : "Crear insumo"}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
            >
              Cancelar
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  )
}
