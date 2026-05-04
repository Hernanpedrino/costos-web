"use client";

import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm, useFieldArray } from "react-hook-form";
import * as z from "zod";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";


import type { Insumo, Formula } from "@/types";
import { createFormulaAction } from "@/actions/Formulas";

// ─── Schema ───────────────────────────────────────────────────────────────────
// ingredienteId lleva un prefijo que identifica el tipo:
//   "insumo:uuid"   → se mapea a insumoId en el DTO
//   "formula:uuid"  → se mapea a subFormulaId en el DTO
// Así el Select puede mezclar ambos tipos sin un flag separado.

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
});

type FormValues = z.infer<typeof formSchema>;

// ─── Props ────────────────────────────────────────────────────────────────────

interface NewFormulaFormProps {
  listaInsumos: Insumo[];
  listaFormulas: Pick<Formula, "id" | "name">[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Convierte el ingredienteId con prefijo al campo correcto del DTO */
function parsearIngredienteId(ingredienteId: string) {
  const [tipo, id] = ingredienteId.split(":");
  return {
    insumoId:     tipo === "insumo"  ? id : undefined,
    subFormulaId: tipo === "formula" ? id : undefined,
  };
}

// ─── Componente ───────────────────────────────────────────────────────────────

export const NewFormulaForm = ({ listaInsumos, listaFormulas }: NewFormulaFormProps) => {
  const [feedback, setFeedback] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { name: "", items: [] },
  });

  const { fields, replace } = useFieldArray({
    control: form.control,
    name: "items",
  });

  // Selector de cantidad de filas — mantiene valores existentes al cambiar
  const handleCantidadChange = (val: string) => {
    const cantidad = parseInt(val, 10);
    if (isNaN(cantidad)) return;
    const actuales = form.getValues("items") ?? [];
    replace(
      Array.from({ length: cantidad }, (_, i) =>
        actuales[i] ?? { ingredienteId: "", cantidad: "" }
      )
    );
  };

  const onSubmit = async (data: FormValues) => {
    setFeedback(null);

    const result = await createFormulaAction({
      name: data.name,
      items: data.items.map((item) => ({
        cantidad: item.cantidad,
        ...parsearIngredienteId(item.ingredienteId),
      })),
    });

    if (result.success) {
      setFeedback({
        type: "success",
        message: `Fórmula "${result.data.name}" guardada correctamente.`,
      });
      form.reset();
    } else {
      setFeedback({ type: "error", message: result.error });
    }
  };

  return (
    <div className="text-2xl w-1/2">
      <Card className="w-full shadow-xl">
        <CardHeader>
          <CardTitle>Nueva fórmula</CardTitle>
        </CardHeader>

        <CardContent>
          <form id="form-formula" onSubmit={form.handleSubmit(onSubmit)}>
            <FieldGroup>

              {/* Nombre */}
              <Controller
                name="name"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor="formula-name">
                      Nombre de la fórmula
                    </FieldLabel>
                    <Input
                      {...field}
                      id="formula-name"
                      aria-invalid={fieldState.invalid}
                      placeholder="Condimento para chorizos"
                      autoComplete="off"
                    />
                    {fieldState.invalid && (
                      <FieldError errors={[fieldState.error]} />
                    )}
                  </Field>
                )}
              />

              {/* Cantidad de ingredientes */}
              <Field>
                <FieldLabel>Cantidad de ingredientes</FieldLabel>
                <Select onValueChange={handleCantidadChange}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Seleccioná la cantidad" />
                  </SelectTrigger>
                  <SelectContent>
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((num) => (
                      <SelectItem key={num} value={num.toString()}>
                        {num} {num === 1 ? "ingrediente" : "ingredientes"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>

              {/* Filas de ingredientes */}
              <div className="flex flex-col gap-6 mt-4">
                {fields.map((field, index) => (
                  <div
                    key={field.id}
                    className="p-4 border rounded-lg space-y-4"
                  >
                    <h4 className="font-medium text-sm">
                      Ingrediente #{index + 1}
                    </h4>

                    {/* Select de ingrediente — agrupa insumos y fórmulas */}
                    <Controller
                      name={`items.${index}.ingredienteId`}
                      control={form.control}
                      render={({ field, fieldState }) => (
                        <Field data-invalid={fieldState.invalid}>
                          <FieldLabel>Ingrediente</FieldLabel>
                          <Select
                            onValueChange={field.onChange}
                            value={field.value ?? ""}
                          >
                            <SelectTrigger aria-invalid={fieldState.invalid}>
                              <SelectValue placeholder="Seleccioná un ingrediente" />
                            </SelectTrigger>
                            <SelectContent>

                              {/* ── Insumos ── */}
                              {listaInsumos.length > 0 && (
                                <SelectGroup>
                                  <SelectLabel className="text-xs text-muted-foreground">
                                    Insumos
                                  </SelectLabel>
                                  {listaInsumos.map((insumo) => (
                                    <SelectItem
                                      key={insumo.id}
                                      value={`insumo:${insumo.id}`}
                                    >
                                      {insumo.name}
                                    </SelectItem>
                                  ))}
                                </SelectGroup>
                              )}

                              {/* ── Fórmulas (sub-fórmulas) ── */}
                              {listaFormulas.length > 0 && (
                                <SelectGroup>
                                  <SelectLabel className="text-xs text-muted-foreground">
                                    Fórmulas
                                  </SelectLabel>
                                  {listaFormulas.map((formula) => (
                                    <SelectItem
                                      key={formula.id}
                                      value={`formula:${formula.id}`}
                                    >
                                      {formula.name}
                                    </SelectItem>
                                  ))}
                                </SelectGroup>
                              )}

                              {listaInsumos.length === 0 &&
                                listaFormulas.length === 0 && (
                                  <SelectItem value="" disabled>
                                    No hay ingredientes disponibles
                                  </SelectItem>
                                )}
                            </SelectContent>
                          </Select>
                          {fieldState.invalid && (
                            <FieldError errors={[fieldState.error]} />
                          )}
                        </Field>
                      )}
                    />

                    {/* Cantidad */}
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
                          />
                          {fieldState.invalid && (
                            <FieldError errors={[fieldState.error]} />
                          )}
                        </Field>
                      )}
                    />
                  </div>
                ))}
              </div>

            </FieldGroup>
          </form>

          {feedback && (
            <p
              className={`mt-4 text-sm px-3 py-2 rounded-md ${
                feedback.type === "success"
                  ? "bg-green-50 text-green-800 border border-green-200"
                  : "bg-red-50 text-red-700 border border-red-200"
              }`}
            >
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
  );
};
