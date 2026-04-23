"use client";
import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm } from "react-hook-form";
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
import * as apiInputs from "@/app/(pages)/insumos/helper/insumos";

const formSchema = z.object({
  name: z
    .string()
    .min(5, "El nombre debe tener al menos 5 caracteres")
    .max(32, "El nombre no debe tener mas de 32 caracteres"),
  suplier: z
    .string()
    .min(3, "El nombre debe tener al menos 5 caracteres")
    .max(32, "El nombre no debe tener mas de 32 caracteres"),
  price: z
    .string()
    .min(3, "El nombre debe tener al menos 5 caracteres")
    .max(32, "El nombre no debe tener mas de 32 caracteres"),
});

export const Form = () => {
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      suplier: "",
      price: "",
    },
  });
  function onSubmit(data: z.infer<typeof formSchema>) {
    apiInputs.createInput(data.name, data.suplier, data.price);
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
