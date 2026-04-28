"use client"

import { ColumnDef } from "@tanstack/react-table"
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
    footer: 'Costo del producto'
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
    footer: ({ table }) => {
      const rows = table.getFilteredRowModel().rows
      const { sumaTotales, sumaCantidades } = rows.reduce(
        (acc, row) => {
          const totalFila = row.original.quantity * row.original.price
          return {
            sumaTotales: acc.sumaTotales + totalFila,
            sumaCantidades: acc.sumaCantidades + row.original.quantity,
          }
        },
        { sumaTotales: 0, sumaCantidades: 0 }
      )
      const resultadoFinal = sumaCantidades > 0 ? sumaTotales / sumaCantidades : 0
      return new Intl.NumberFormat("es-AR", {
        style: "currency",
        currency: "ARS",
      }).format(resultadoFinal)
    },
  },
]