"use client"

import { ColumnDef } from "@tanstack/react-table"

// This type is used to define the shape of our data.
// You can use a Zod schema here if you want.
export type Insumos = {
  id: string
  inputs: string
  quantity: number
  price: number
  depends_formula?: boolean //TODO: Arreglar el tipo luego de tener los datos reales
}

export const columns: ColumnDef<Insumos>[] = [
  {
    accessorKey: "id",
    header: "Id",
  },
  {
    accessorKey: "inputs",
    header: "Insumo",
  },
  {
    accessorKey: "price",
    header: () => <div className="text-right">Precio</div>,
    cell: ({ row }) => {
      const amount = parseFloat(row.getValue("price"))
      const formatted = new Intl.NumberFormat("es-AR", {
        style: "currency",
        currency: "ARS",
      }).format(amount)

      return <div className="text-right font-medium">{formatted}</div>
    },
  },
]