"use client"
import { ColumnDef } from "@tanstack/react-table";
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
    header: "Producto/Insumo",
  },
  {
    accessorKey: "createdAt",
    header: "Fecha de carga",
    cell: ({ row }) => {
      const date: string = row.getValue("createdAt")
      const dateObj = new Date(date);
      const formateador = new Intl.DateTimeFormat('es-ES', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
      });
      const fechaFormateada = formateador.format(dateObj);
      return fechaFormateada;
    }
  },
  {
    accessorKey: "updatedAt",
    header: "Fecha de ultima modificacion",
    cell: ({ row }) => {
      const date: string = row.getValue("createdAt")
      const dateObj = new Date(date);
      const formateador = new Intl.DateTimeFormat('es-ES', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
      });
      const fechaFormateada = formateador.format(dateObj);
      return fechaFormateada;
    }
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