"use client";

import { useState } from "react"
import { useRouter } from "next/navigation"
import { zodResolver } from "@hookform/resolvers/zod"
import { Controller, useForm, useFieldArray } from "react-hook-form"
import * as z from "zod"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardFooter,
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
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

import { createFormulaAction } from "@/actions/formulas"
import type { Insumo, Formula } from "@/types"

const formSchema = z.object({
  name: z.string().min(5, "El nombre debe tener al menos 5 caracteres"),
  items: z.array(
    z.object({
      ingredienteId: z.string().min(1, "Seleccioná un ingrediente"),
      cantidad: z
        .string()
        .min(1, "Requerido")
        .refine(
          (v) => !isNaN(parseFloat(v)) && parseFloat(v) > 0,
          "La cantidad debe ser mayor a 0"
        ),
    })
  ).min(1, "Agregá al menos un ingrediente"),
})

type FormValues = z.infer<typeof formSchema>

interface NewFormulaFormProps {
  listaInsumos:  Insumo[]
  listaFormulas: Pick<Formula, "id" | "name">[]
}

function parsearIngredienteId(ingredienteId: string) {
  const [tipo, id] = ingredienteId.split(":")
  return {
    insumoId:     tipo === "insumo"  ? id : undefined,
    subFormulaId: tipo === "formula" ? id : undefined,
  }
}

export const NewFormulaForm = ({ listaInsumos, listaFormulas }: NewFormulaFormProps) => {
  const router = useRouter()
  const [feedback, setFeedback] = useState<{
    type: "success" | "error"
    message: string
  } | null>(null)

  // Ordenar A-Z al recibir las listas
  const insumosOrdenados  = [...listaInsumos].sort((a, b) => a.name.localeCompare(b.name))
  const formulasOrdenadas = [...listaFormulas].sort((a, b) => a.name.localeCompare(b.name))

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { name: "", items: [] },
  })

  const { fields, replace } = useFieldArray({
    control: form.control,
    name: "items",
  })

  const handleCantidadChange = (val: string) => {
    const cantidad = parseInt(val, 10)
    if (isNaN(cantidad)) return
    const actuales = form.getValues("items") ?? []
    replace(
      Array.from({ length: cantidad }, (_, i) =>
        actuales[i] ?? { ingredienteId: "", cantidad: "" }
      )
    )
  }

  const onSubmit = async (data: FormValues) => {
    setFeedback(null)

    const result = await createFormulaAction({
      name:  data.name,
      items: data.items.map((item) => ({
        cantidad: item.cantidad,
        ...parsearIngredienteId(item.ingredienteId),
      })),
    })

    if (result.success) {
      setFeedback({
        type: "success",
        message: `Fórmula "${result.data.name}" guardada correctamente.`,
      })
      form.reset()
      router.push("/formulas")
      router.refresh()
    } else {
      setFeedback({ type: "error", message: result.error })
    }
  }

  return (
    <div className="text-2xl w-1/2">
      <Card className="w-full shadow-xl">
        <CardHeader>
          <CardTitle>Nueva fórmula</CardTitle>
        </CardHeader>

        <CardContent>
          <form id="form-formula" onSubmit={form.handleSubmit(onSubmit)}>
            <FieldGroup>
              <Controller
                name="name"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor="formula-name">Nombre de la fórmula</FieldLabel>
                    <Input
                      {...field}
                      id="formula-name"
                      aria-invalid={fieldState.invalid}
                      placeholder="Condimento para chorizos"
                      autoComplete="off"
                    />
                    {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                  </Field>
                )}
              />

              <Field>
                <FieldLabel>Cantidad de ingredientes</FieldLabel>
                <Select onValueChange={handleCantidadChange}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Seleccioná la cantidad" />
                  </SelectTrigger>
                  <SelectContent>
                    {/* ← hasta 20 ingredientes */}
                    {Array.from({ length: 20 }, (_, i) => i + 1).map((num) => (
                      <SelectItem key={num} value={num.toString()}>
                        {num} {num === 1 ? "ingrediente" : "ingredientes"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>

              <div className="flex flex-col gap-6 mt-4">
                {fields.map((field, index) => (
                  <div key={field.id} className="p-4 border rounded-lg space-y-4">
                    <h4 className="font-medium text-sm">Ingrediente #{index + 1}</h4>

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
                              {insumosOrdenados.length > 0 && (
                                <SelectGroup>
                                  <SelectLabel className="text-xs text-muted-foreground">
                                    Insumos
                                  </SelectLabel>
                                  {insumosOrdenados.map((insumo) => (
                                    <SelectItem key={insumo.id} value={`insumo:${insumo.id}`}>
                                      {insumo.name}
                                    </SelectItem>
                                  ))}
                                </SelectGroup>
                              )}
                              {formulasOrdenadas.length > 0 && (
                                <SelectGroup>
                                  <SelectLabel className="text-xs text-muted-foreground">
                                    Fórmulas
                                  </SelectLabel>
                                  {formulasOrdenadas.map((formula) => (
                                    <SelectItem key={formula.id} value={`formula:${formula.id}`}>
                                      {formula.name}
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
                            placeholder="0.5"
                            type="number"
                            step="0.0001"
                            min="0"
                            // ← evita que el scroll cambie el valor
                            onWheel={(e) => e.currentTarget.blur()}
                          />
                          {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                        </Field>
                      )}
                    />
                  </div>
                ))}
              </div>
            </FieldGroup>
          </form>

          {feedback && (
            <p className={`mt-4 text-sm px-3 py-2 rounded-md ${
              feedback.type === "success"
                ? "bg-green-50 text-green-800 border border-green-200"
                : "bg-red-50 text-red-700 border border-red-200"
            }`}>
              {feedback.message}
            </p>
          )}
        </CardContent>

        <CardFooter>
          <Field orientation="horizontal">
            <Button
              type="submit"
              form="form-formula"
              disabled={form.formState.isSubmitting}
              className="inline-flex text-white bg-green-800 border-0 py-2 px-6
                         focus:outline-none hover:bg-green-600 rounded text-sm mt-10
                         disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {form.formState.isSubmitting ? "Guardando..." : "Guardar fórmula"}
            </Button>
          </Field>
        </CardFooter>
      </Card>
    </div>
  )
}
