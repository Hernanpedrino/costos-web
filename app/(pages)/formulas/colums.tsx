"use client"

import { ColumnDef } from "@tanstack/react-table"

export type ItemFila = {
  id: string;
  cantidad: string;
  nombreIngrediente: string;
  precioInsumo: number | null;
}

export const columns: ColumnDef<ItemFila>[] = [
  {
    accessorKey: "nombreIngrediente",
    header: "Insumo",
    footer: 'Costo del producto'
  },
  {
    accessorKey: "cantidad",
    header: "Cantidad",
  },
  {
    accessorKey: "precioInsumo",
    header: "Precio Unitario",
    cell: ({ row }) => {
      const amount = parseFloat(row.getValue("precioInsumo"))
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
      const quantity = Number(row.original.cantidad)
      const price = Number(row.original.precioInsumo)
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
          const totalFila = Number(row.original.cantidad) * Number(row.original.precioInsumo)
          return {
            sumaTotales: acc.sumaTotales + totalFila,
            sumaCantidades: acc.sumaCantidades + Number(row.original.cantidad),
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