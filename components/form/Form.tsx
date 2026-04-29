"use client";
import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, Resolver, useForm } from "react-hook-form";
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
import * as z from "zod";
import { createInsumoAction } from "@/actions/insumos";

const formSchema = z.object({
  name: z
    .string()
    .min(2, "El nombre debe tener al menos 2 caracteres")
    .max(32, "El nombre no debe tener mas de 32 caracteres"),
  suplier: z
    .string()
    .min(3, "El nombre debe tener al menos 3 caracteres")
    .max(32, "El nombre no debe tener mas de 32 caracteres"),
  price: z
    .coerce
    .number()
    .positive("El precio debe ser mayor a 0"),
});
type InsumoFormValues = z.infer<typeof formSchema>;

export const Form = () => {
  const form = useForm<InsumoFormValues>({
    resolver: zodResolver(formSchema) as Resolver<InsumoFormValues>,
    defaultValues: {
      name: "",
      suplier: "",
      price: 0,
    },
  });
  async function onSubmit(data: z.infer<typeof formSchema>) {
    const result = await createInsumoAction(data);
    form.reset();
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
                    <FieldLabel htmlFor="form-rhf-demo-title">
                      Nombre del insumo
                    </FieldLabel>
                    <Input
                      {...field}
                      id="form-rhf-demo-title"
                      aria-invalid={fieldState.invalid}
                      placeholder="Aji molido"
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
                    <FieldLabel htmlFor="form-rhf-demo-title">
                      Proveedor
                    </FieldLabel>
                    <Input
                      {...field}
                      id="form-rhf-demo-title"
                      aria-invalid={fieldState.invalid}
                      placeholder="Alimentos del plata"
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
                    <FieldLabel htmlFor="form-rhf-demo-description">
                      Precio
                    </FieldLabel>
                    <Input
                      {...field}
                      id="form-rhf-demo-title"
                      aria-invalid={fieldState.invalid}
                      placeholder="4500"
                      autoComplete="off"
                      type="number"
                    />
                    {fieldState.invalid && (
                      <FieldError errors={[fieldState.error]} />
                    )}
                  </Field>
                )}
              />
            </FieldGroup>
          </form>
        </CardContent>
        <CardFooter>
          <Field orientation="horizontal">
            <Button
              type="submit"
              className="inline-flex text-white bg-green-800 border-0 py-2 px-6 focus:outline-none hover:bg-green-600 rounded text-sm mt-10"
              form="form-insumos"
            >
              Agregar Insumo
            </Button>
          </Field>
        </CardFooter>
      </Card>
    </div>
  );
};
