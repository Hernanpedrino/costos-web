"use client"

import { FormulaListItem } from "@/actions/Formulas";
import { ColumnDef } from "@tanstack/react-table";


// El tipo de cada fila es el tipo de los items de FormulaListItem.
// Al derivarlo directamente de la action, si FormulaListItem cambia
// este archivo se actualiza solo — sin duplicar la definición.
export type ItemFila = FormulaListItem["items"][number];

const formatearPrecio = (amount: number) =>
  new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
  }).format(amount);

export const columns: ColumnDef<ItemFila>[] = [
  {
    accessorKey: "nombreIngrediente",
    header: "Ingrediente",
  },
  {
    accessorKey: "cantidad",
    header: "Cantidad",
    cell: ({ row }) => {
      // Decimal serializado a number — mostramos hasta 4 decimales
      // pero eliminamos los ceros innecesarios (1.5000 → 1.5)
      const valor = row.getValue<number>("cantidad");
      return parseFloat(valor.toFixed(4));
    },
  },
  {
    accessorKey: "precioIngrediente",
    header: () => <div className="text-right">Precio unitario</div>,
    cell: ({ row }) => (
      <div className="text-right font-medium">
        {formatearPrecio(row.getValue<number>("precioIngrediente"))}
      </div>
    ),
  },
  {
    id: "subtotal",
    header: () => <div className="text-right">Subtotal</div>,
    cell: ({ row }) => {
      const precio = row.getValue<number>("precioIngrediente");
      const cantidad = row.getValue<number>("cantidad");
      return (
        <div className="text-right font-medium">
          {formatearPrecio(precio * cantidad)}
        </div>
      );
    },
  },
];
