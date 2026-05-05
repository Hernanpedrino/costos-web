"use client"

import { useState, useEffect } from "react"
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

import { updateInsumoAction } from "@/actions/insumos"
import type { Insumo } from "@/types"

// ─── Schema ───────────────────────────────────────────────────────────────────

const formSchema = z.object({
  name:    z.string().min(2, "Mínimo 2 caracteres").max(32, "Máximo 32 caracteres"),
  suplier: z.string().min(3, "Mínimo 3 caracteres").max(32, "Máximo 32 caracteres"),
  price:   z.number({ message: "Ingresá un número válido" })
    .positive("Debe ser mayor a 0")
    .refine((v) => Math.round(v * 100) / 100 === v, "Máximo 2 decimales"),
})

type FormValues = z.infer<typeof formSchema>

// ─── Props ────────────────────────────────────────────────────────────────────

interface EditInsumoSheetProps {
  insumo:   Insumo | null       // null = sheet cerrado
  onClose:  () => void
  onSaved:  (insumo: Insumo) => void
}

// ─── Componente ───────────────────────────────────────────────────────────────

export function EditInsumoSheet({ insumo, onClose, onSaved }: EditInsumoSheetProps) {
  const [feedback, setFeedback] = useState<string | null>(null)

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { name: "", suplier: "", price: undefined },
  })

  // Cuando cambia el insumo seleccionado, pre-cargamos el form
  useEffect(() => {
    if (insumo) {
      form.reset({
        name:    insumo.name,
        suplier: insumo.suplier,
        price:   insumo.price,
      })
      setFeedback(null)
    }
  }, [insumo, form])

  const onSubmit = async (data: FormValues) => {
    if (!insumo) return
    setFeedback(null)

    const result = await updateInsumoAction({
      id:      insumo.id,
      name:    data.name,
      suplier: data.suplier,
      price:   data.price.toString(),
    })

    if (result.success) {
      onSaved(result.data)
      onClose()
    } else {
      setFeedback(result.error)
    }
  }

  return (
    <Sheet open={!!insumo} onOpenChange={(open) => { if (!open) onClose() }}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Editar insumo</SheetTitle>
          <SheetDescription>
            Modificá los datos y guardá los cambios.
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={form.handleSubmit(onSubmit)} className="m-6 space-y-4">
          <FieldGroup>

            <Controller
              name="name"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="edit-name">Nombre</FieldLabel>
                  <Input
                    {...field}
                    id="edit-name"
                    autoComplete="off"
                    aria-invalid={fieldState.invalid}
                  />
                  {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                </Field>
              )}
            />

            <Controller
              name="suplier"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="edit-suplier">Proveedor</FieldLabel>
                  <Input
                    {...field}
                    id="edit-suplier"
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
                  <FieldLabel htmlFor="edit-price">Precio</FieldLabel>
                  <Input
                    name={field.name}
                    ref={field.ref}
                    onBlur={field.onBlur}
                    value={Number.isNaN(field.value) || field.value === undefined ? "" : field.value}
                    onChange={(e) => field.onChange(e.target.valueAsNumber)}
                    id="edit-price"
                    type="number"
                    step="0.01"
                    min="0"
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
              {form.formState.isSubmitting ? "Guardando..." : "Guardar cambios"}
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
