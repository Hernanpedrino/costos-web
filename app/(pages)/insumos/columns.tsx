"use client"
import { ColumnDef } from "@tanstack/react-table"
export type Insumos = {
  name: string;
  id: string;
  suplier: string;
  price: string;
  createdAt: Date;
  updatedAt: Date;
  // depends_formula?: boolean //TODO: Arreglar el tipo luego de tener los datos reales
}

export const columns: ColumnDef<Insumos>[] = [
  {
    accessorKey: "name",
    header: "Insumo",
  },
  {
    accessorKey: "createdAt",
    header: "Fecha de creacion",
  },
  {
    accessorKey: "updatedAt",
    header: "Fecha de ultima modificacion"
    //TODO: Corregir el formato de la fecha
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