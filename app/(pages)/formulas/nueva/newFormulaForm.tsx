"use client";
import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm, useFieldArray } from "react-hook-form";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { createFormulaAction } from "@/actions/Formulas";

type FormValues = z.infer<typeof formSchema>
type DataInsumos = {
  name: string;
  id: string;
  suplier: string;
  price: number;
  createdAt: Date;
  updatedAt: Date;
} 

interface NewFormulaFormProps {
  listaInsumosDB: DataInsumos[];
}
const formSchema = z.object({
  name: z
    .string()
    .min(5, "El nombre debe tener al menos 5 caracteres"),
  insumos: z
    .array(z.object({
      nombreInsumo: z.string().min(1, "Requerido"),
      cantidad: z.string().min(1, "Requerido"),
    }))
});

export const NewFormulaForm = ({ listaInsumosDB }: NewFormulaFormProps) => {

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      insumos: [],
    },
  });

  const { fields, replace } = useFieldArray({
    control: form.control,
    name: "insumos",
  });

  const onSubmit = async (data: FormValues) => {
    const createFormula = await createFormulaAction(data)
    console.log("Datos enviados:", data, createFormula);
    form.reset();
  }

  const handleSelectChange = (val: string) => {
    const cantidad = parseInt(val, 10);
    if (isNaN(cantidad)) return;
    const valoresActuales = form.getValues("insumos") || [];
    const nuevosCampos = Array.from({ length: cantidad }, (_, index) => {
      return valoresActuales[index] || { nombreInsumo: "", cantidad: "" };
    });
    replace(nuevosCampos);
  };

  return (
    <div className="text-2xl w-1/2">
      <Card className="w-full shadow-xl">
        <CardHeader>
          <CardTitle>Nueva Formula</CardTitle>
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
                      Nombre de la formula
                    </FieldLabel>
                    <Input
                      {...field}
                      id="form-rhf-demo-title"
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
              <FieldLabel>
                Seleccionar la cantidad de componentes de la formula
              </FieldLabel>
              <Select onValueChange={handleSelectChange}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Selecciona la cantidad de insumos" />
                </SelectTrigger>
                <SelectContent>
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((num) => (
                    <SelectItem key={num} value={num.toString()}>
                      {num} {num === 1 ? "Insumo" : "Insumos"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="flex flex-col gap-6 mt-4">
                {fields.map((field, index) => (
                  <div key={field.id} className="p-4 border rounded-lg space-y-4">
                    <h4 className="font-medium text-sm">Insumo #{index + 1}</h4>
                    <Controller
                      name={`insumos.${index}.nombreInsumo`}
                      control={form.control}
                      render={({ field, fieldState }) => (
                        <Field data-invalid={fieldState.invalid}>
                          <FieldLabel>Insumo</FieldLabel>
                          <Select
                            onValueChange={field.onChange}
                            value={field.value ?? ""}
                          >
                            <SelectTrigger aria-invalid={fieldState.invalid}>
                              <SelectValue placeholder="Seleccione un insumo" />
                            </SelectTrigger>

                            <SelectContent>
                              {listaInsumosDB.map((insumo) => (
                                <SelectItem key={insumo.id} value={insumo.id}>
                                  {insumo.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                        </Field>
                      )}
                    />
                    <Controller
                      name={`insumos.${index}.cantidad`}
                      control={form.control}
                      render={({ field, fieldState }) => (
                        <Field data-invalid={fieldState.invalid}>
                          <FieldLabel>Cantidad</FieldLabel>
                          <Input {...field}
                            placeholder="4500"
                            value={field.value ?? ""}
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
        </CardContent>
        <CardFooter>
          <Field orientation="horizontal">
            <Button
              type="submit"
              className="inline-flex text-white bg-green-800 border-0 py-2 px-6 focus:outline-none hover:bg-green-600 rounded text-sm mt-10"
              form="form-insumos"
            >
              Guardar
            </Button>
          </Field>
        </CardFooter>
      </Card>
    </div>
  );
};
