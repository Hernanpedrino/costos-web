"use client";

import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm } from "react-hook-form";
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
import { createInsumoAction } from "@/actions/Insumos";

const formSchema = z.object({
  name: z
    .string()
    .min(2, "El nombre debe tener al menos 2 caracteres")
    .max(32, "El nombre no debe superar los 32 caracteres"),
  suplier: z
    .string()
    .min(3, "El proveedor debe tener al menos 3 caracteres")
    .max(32, "El proveedor no debe superar los 32 caracteres"),
  price: z
    .number({ message: "Ingresá un número válido" })
    .positive("El precio debe ser mayor a 0"),
});

type InsumoFormValues = z.infer<typeof formSchema>;

// ─── Componente ───────────────────────────────────────────────────────────────

export const Form = () => {
  const [feedback, setFeedback] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  const form = useForm<InsumoFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      suplier: "",
      price: undefined,
    },
  });

  async function onSubmit(data: InsumoFormValues) {
    setFeedback(null);

    // Zod produce price: number → lo convertimos a string para CreateInsumoDTO
    const result = await createInsumoAction({
      name:    data.name,
      suplier: data.suplier,
      price:   data.price.toString(),
    });

    if (result.success) {
      setFeedback({
        type: "success",
        message: `"${result.data.name}" agregado correctamente.`,
      });
      form.reset();
    } else {
      setFeedback({ type: "error", message: result.error });
    }
  }

  return (
    <div className="text-2xl mt-5">
      <Card className="w-full sm:max-w-md mt-3 shadow-xl">
        <CardHeader>
          <CardTitle>Carga de nuevo insumo</CardTitle>
        </CardHeader>

        <CardContent>
          <form id="form-insumos" onSubmit={form.handleSubmit(onSubmit)}>
            <FieldGroup>

              <Controller
                name="name"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor="insumo-name">
                      Nombre del insumo
                    </FieldLabel>
                    <Input
                      {...field}
                      id="insumo-name"
                      aria-invalid={fieldState.invalid}
                      placeholder="Ají molido"
                      autoComplete="off"
                    />
                    {fieldState.invalid && (
                      <FieldError errors={[fieldState.error]} />
                    )}
                  </Field>
                )}
              />

              <Controller
                name="suplier"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor="insumo-suplier">
                      Proveedor
                    </FieldLabel>
                    <Input
                      {...field}
                      id="insumo-suplier"
                      aria-invalid={fieldState.invalid}
                      placeholder="Alimentos del Plata"
                      autoComplete="off"
                    />
                    {fieldState.invalid && (
                      <FieldError errors={[fieldState.error]} />
                    )}
                  </Field>
                )}
              />

              <Controller
                name="price"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor="insumo-price">Precio</FieldLabel>

                    <Input
                      name={field.name}
                      ref={field.ref}
                      onBlur={field.onBlur}
                      value={field.value ?? ""}
                      onChange={(e) => field.onChange(e.target.valueAsNumber)}
                      id="insumo-price"
                      aria-invalid={fieldState.invalid}
                      placeholder="4500"
                      autoComplete="off"
                      type="number"
                      step="0.01"
                      min="0"
                    />
                    {fieldState.invalid && (
                      <FieldError errors={[fieldState.error]} />
                    )}
                  </Field>
                )}
              />

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
              form="form-insumos"
              disabled={form.formState.isSubmitting}
              className="inline-flex text-white bg-green-800 border-0 py-2 px-6
                         focus:outline-none hover:bg-green-600 rounded text-sm mt-10
                         disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {form.formState.isSubmitting ? "Guardando..." : "Agregar insumo"}
            </Button>
          </Field>
        </CardFooter>
      </Card>
    </div>
  );
};
//TODO: Corregir los decimales en el formulario. Consultar a Claude.
