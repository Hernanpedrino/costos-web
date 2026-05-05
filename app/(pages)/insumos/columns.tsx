"use client"

import { ColumnDef } from "@tanstack/react-table";
import type { Insumo } from "@/types";


const formatearFecha = (isoString: string) =>
  new Intl.DateTimeFormat("es-ES", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(isoString));

const formatearPrecio = (amount: number) =>
  new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
  }).format(amount);

export const columns: ColumnDef<Insumo>[] = [
  {
    accessorKey: "name",
    header: "Producto / Insumo",
  },
  {
    accessorKey: "suplier",
    header: "Proveedor",
  },
  {
    accessorKey: "price",
    header: () => <div className="text-right">Precio</div>,
    cell: ({ row }) => {
      const formatted = formatearPrecio(row.getValue<number>("price"));
      return <div className="text-right font-medium">{formatted}</div>;
    },
  },
  {
    accessorKey: "createdAt",
    header: "Fecha de carga",
    cell: ({ row }) => formatearFecha(row.getValue<string>("createdAt")),
  },
  {
    accessorKey: "updatedAt",
    header: "Última modificación",
    cell: ({ row }) => {
      return formatearFecha(row.getValue<string>("updatedAt"));
    },
  },
];
