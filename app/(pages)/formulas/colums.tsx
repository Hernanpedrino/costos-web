"use client"

import { ColumnDef } from "@tanstack/react-table"

// This type is used to define the shape of our data.
// You can use a Zod schema here if you want.
export type Componente = {
  id: string
  inputs: string
  quantity: number
  price: number
  depends_formula: boolean
}
export type Formula = {
  tittle: string,
  formula: Componente[]
}

export const columns: ColumnDef<Componente>[] = [
  {
    accessorKey: "inputs",
    header: "Insumo",
  },
  {
    accessorKey: "quantity",
    header: "Cantidad",
  },
  {
    accessorKey: "price",
    header: "Precio Unitario",
    cell: ({ row }) => {
      const amount = parseFloat(row.getValue("price"))
      return new Intl.NumberFormat("es-AR", {
        style: "currency",
        currency: "ARS",
      }).format(amount)
    },
  },
  {
    accessorKey: "total",
    header: "Total",
    cell: ({ row }) => {
      const quantity = row.original.quantity
      const price = row.original.price
      const total = quantity * price
      return new Intl.NumberFormat("es-AR", {
        style: "currency",
        currency: "ARS",
      }).format(total)
    },
  },
]