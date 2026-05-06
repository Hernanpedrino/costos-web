"use client"

import {
  ColumnDef,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Pencil } from "lucide-react"

interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[]
  data: TData[]
  title: string
  precioTotal: number
  onEdit?: () => void  // ← abre el Sheet de edición de esta fórmula
}

const formatearPrecio = (amount: number) =>
  new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
  }).format(amount);

export function DataTable<TData, TValue>({
  columns,
  data,
  title,
  precioTotal,
  onEdit,
}: DataTableProps<TData, TValue>) {
  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
  })

  return (
    <div className="overflow-hidden rounded-md border shadow-xl">

      {/* Header — click abre el Sheet de edición */}
      <div className="px-4 py-3 bg-green-800 text-white flex items-center justify-between">
        <h2 className="text-base font-medium uppercase tracking-wide">
          {title}
        </h2>
        {onEdit && (
          <button
            onClick={onEdit}
            title="Editar fórmula"
            className="flex items-center gap-1 text-xs text-white/80 hover:text-white transition-colors"
          >
            <Pencil className="w-4 h-4" />
            <span>Editar</span>
          </button>
        )}
      </div>

      <Table>
        <TableHeader>
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id}>
              {headerGroup.headers.map((header) => (
                <TableHead key={header.id}>
                  {header.isPlaceholder
                    ? null
                    : flexRender(
                        header.column.columnDef.header,
                        header.getContext()
                      )}
                </TableHead>
              ))}
            </TableRow>
          ))}
        </TableHeader>

        <TableBody>
          {table.getRowModel().rows.length ? (
            table.getRowModel().rows.map((row) => (
              <TableRow
                key={row.id}
                data-state={row.getIsSelected() && "selected"}
              >
                {row.getVisibleCells().map((cell) => (
                  <TableCell key={cell.id}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            ))
          ) : (
            <TableRow>
              <TableCell colSpan={columns.length} className="h-24 text-center">
                Sin ingredientes.
              </TableCell>
            </TableRow>
          )}
          <TableRow className="border-t-2 border-green-800 bg-muted/40">
            <TableCell className="font-medium">Precio total</TableCell>
            <TableCell colSpan={columns.length - 2} />
            <TableCell className="text-right font-semibold">
              {formatearPrecio(precioTotal)}
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </div>
  )
}
