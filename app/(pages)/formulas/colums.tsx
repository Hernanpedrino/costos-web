"use client"

import { ColumnDef } from "@tanstack/react-table"

// This type is used to define the shape of our data.
// You can use a Zod schema here if you want.
export type Formulas = {
  id: string
  name: string
  inputs: string
  quantity: number
  price: number
  total: number
  depends_formula: boolean
}

export const columns: ColumnDef<Formulas>[] = [
  {
    header: 'Pimenton Cafayate',
    columns: [
    {
      accessorKey: "inputs",
      header: "Insumos",
    },
    {
      accessorKey: "quantity",
      header: "Cantidad",
    },
    {
      accessorKey: "price",
      header: "Valor insumo"
    },
    {
      accessorKey: "total",
      header: "Costo"
    },
    {
      accessorKey: "depends_formula",
      header: "Depende Formula"
    },
    ]
  }
]