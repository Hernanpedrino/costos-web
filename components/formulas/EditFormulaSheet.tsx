"use client"

import { useState, useEffect } from "react"
import { zodResolver } from "@hookform/resolvers/zod"
import { Controller, useForm, useFieldArray } from "react-hook-form"
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
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"

import { updateFormulaAction } from "@/actions/formulas"
import type { FormulaListItem } from "@/actions/formulas"
import type { Insumo, Formula } from "@/types"

// ─── Schema ───────────────────────────────────────────────────────────────────
// Solo cantidad e ingrediente — sin precio (se gestiona desde insumos)

const formSchema = z.object({
  items: z.array(
    z.object({
      ingredienteId: z.string().min(1, "Seleccioná un ingrediente"),
      cantidad: z
        .string()
        .min(1, "Requerido")
        .refine(
          (v) => !isNaN(parseFloat(v)) && parseFloat(v) > 0,
          "Debe ser mayor a 0"
        ),
    })
  ).min(1, "Agregá al menos un ingrediente"),
})

type FormValues = z.infer<typeof formSchema>

// ─── Props ────────────────────────────────────────────────────────────────────

interface EditFormulaSheetProps {
  formula:      FormulaListItem | null
  listaInsumos: Insumo[]
  listaFormulas: Pick<Formula, "id" | "name">[]
  onClose:      () => void
  onSaved:      () => void
}

// ─── Helper ───────────────────────────────────────────────────────────────────

function parsearIngredienteId(ingredienteId: string) {
  const [tipo, id] = ingredienteId.split(":")
  return {
    insumoId:     tipo === "insumo"  ? id : undefined,
    subFormulaId: tipo === "formula" ? id : undefined,
  }
}

// ─── Componente ───────────────────────────────────────────────────────────────

export function EditFormulaSheet({
  formula,
  listaInsumos,
  listaFormulas,
  onClose,
  onSaved,
}: EditFormulaSheetProps) {
  const [feedback, setFeedback] = useState<string | null>(null)

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { items: [] },
  })

  const { fields, replace, append, remove } = useFieldArray({
    control: form.control,
    name: "items",
  })

  // Pre-poblar el form con los items actuales de la fórmula
  useEffect(() => {
    if (formula) {
      form.reset({
        items: formula.items.map((item) => ({
          // Reconstruimos el ingredienteId con prefijo
          ingredienteId: item.insumoId
            ? `insumo:${item.insumoId}`
            : `formula:${item.subFormulaId}`,
          cantidad: item.cantidad.toString(),
        })),
      })
      setFeedback(null)
    }
  }, [formula, form])

  const onSubmit = async (data: FormValues) => {
    if (!formula) return
    setFeedback(null)

    const result = await updateFormulaAction(formula.id, {
      name:  formula.name,   // el nombre no cambia acá
      items: data.items.map((item) => ({
        cantidad: item.cantidad,
        ...parsearIngredienteId(item.ingredienteId),
      })),
    })

    if (result.success) {
      // Reconstruimos el FormulaListItem actualizado para la tabla
      // Los precios se mantienen de la fórmula original
      onSaved()
      onClose()
    } else {
      setFeedback(result.error)
    }
  }

  return (
    <Sheet open={!!formula} onOpenChange={(open) => { if (!open) onClose() }}>
      <SheetContent className="overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{formula?.name}</SheetTitle>
          <SheetDescription>
            Editá los ingredientes y cantidades. Los precios se gestionan desde la sección de insumos.
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={form.handleSubmit(onSubmit)} className="m-6 space-y-4">

          {/* Lista de ingredientes */}
          <div className="flex flex-col gap-4">
            {fields.map((field, index) => (
              <div key={field.id} className="p-3 border rounded-lg space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-sm font-medium">Ingrediente #{index + 1}</span>
                  <button
                    type="button"
                    onClick={() => remove(index)}
                    className="text-xs text-red-500 hover:text-red-700"
                  >
                    Eliminar
                  </button>
                </div>

                <Controller
                  name={`items.${index}.ingredienteId`}
                  control={form.control}
                  render={({ field, fieldState }) => (
                    <Field data-invalid={fieldState.invalid}>
                      <FieldLabel>Ingrediente</FieldLabel>
                      <Select onValueChange={field.onChange} value={field.value ?? ""}>
                        <SelectTrigger aria-invalid={fieldState.invalid}>
                          <SelectValue placeholder="Seleccioná un ingrediente" />
                        </SelectTrigger>
                        <SelectContent>
                          {listaInsumos.length > 0 && (
                            <SelectGroup>
                              <SelectLabel className="text-xs text-muted-foreground">Insumos</SelectLabel>
                              {listaInsumos.map((insumo) => (
                                <SelectItem key={insumo.id} value={`insumo:${insumo.id}`}>
                                  {insumo.name}
                                </SelectItem>
                              ))}
                            </SelectGroup>
                          )}
                          {listaFormulas.length > 0 && (
                            <SelectGroup>
                              <SelectLabel className="text-xs text-muted-foreground">Fórmulas</SelectLabel>
                              {listaFormulas
                                .filter((f) => f.id !== formula?.id) // evitar auto-referencia
                                .map((f) => (
                                  <SelectItem key={f.id} value={`formula:${f.id}`}>
                                    {f.name}
                                  </SelectItem>
                                ))}
                            </SelectGroup>
                          )}
                        </SelectContent>
                      </Select>
                      {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                    </Field>
                  )}
                />

                <Controller
                  name={`items.${index}.cantidad`}
                  control={form.control}
                  render={({ field, fieldState }) => (
                    <Field data-invalid={fieldState.invalid}>
                      <FieldLabel>Cantidad</FieldLabel>
                      <Input
                        {...field}
                        value={field.value ?? ""}
                        type="number"
                        step="0.0001"
                        min="0"
                      />
                      {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                    </Field>
                  )}
                />
              </div>
            ))}
          </div>

          {/* Botón para agregar ingrediente */}
          <Button
            type="button"
            variant="outline"
            className="w-full border-dashed"
            onClick={() => append({ ingredienteId: "", cantidad: "" })}
          >
            + Agregar ingrediente
          </Button>

          {feedback && (
            <p className="text-sm px-3 py-2 rounded-md bg-red-50 text-red-700 border border-red-200">
              {feedback}
            </p>
          )}

          <div className="flex gap-3 pt-2">
            <Button
              type="submit"
              disabled={form.formState.isSubmitting}
              className="flex-1 bg-green-800 text-white hover:bg-green-600
                         disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {form.formState.isSubmitting ? "Guardando..." : "Guardar cambios"}
            </Button>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancelar
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  )
}
