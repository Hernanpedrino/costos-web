"use client"

import { ColumnDef } from "@tanstack/react-table";
import { ArrowUp, ArrowDown, ArrowUpDown } from "lucide-react";
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
    header: ({ column }) => {
      const orden = column.getIsSorted();
      return (
        <button
          type="button"
          onClick={() => column.toggleSorting(orden === "asc")}
          className="flex items-center gap-1.5 hover:text-foreground transition-colors"
        >
          Producto / Insumo
          {orden === "asc" && <ArrowUp className="w-3.5 h-3.5" />}
          {orden === "desc" && <ArrowDown className="w-3.5 h-3.5" />}
          {!orden && <ArrowUpDown className="w-3.5 h-3.5 opacity-40" />}
        </button>
      );
    },
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
    header: () => <div className="text-right">Fecha de carga</div>,
    cell: ({ row }) => (
      <div className="text-right">
        {formatearFecha(row.getValue<string>("createdAt"))}
      </div>
    ),
  },
  {
    accessorKey: "updatedAt",
    header: () => <div className="text-right">Última modificación</div>,
    cell: ({ row }) => (
      <div className="text-right">
        {formatearFecha(row.getValue<string>("updatedAt"))}
      </div>
    ),
  },
];
