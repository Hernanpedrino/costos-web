"use client"

import {
  ColumnDef,
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  useReactTable,
} from "@tanstack/react-table"
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[]
  data: TData[]
}

export function DataTable<TData, TValue>({
  columns,
  data,
}: DataTableProps<TData, TValue>) {
  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  })

  return (
    <div className="overflow-hidden rounded-md border shadow-2xl">
      <Table>
        <TableHeader>
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id}>
              {headerGroup.headers.map((header) => {
                return (
                  <TableHead key={header.id}>
                    {header.isPlaceholder
                      ? null
                      : flexRender(
                        header.column.columnDef.header,
                        header.getContext()
                      )}
                  </TableHead>
                )
              })}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {table.getRowModel().rows?.length ? (
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
                No results.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
      <Separator orientation="horizontal"/>
      <div className="mt-1 p-5">
        <Button className="mr-2 bg-green-800 text-white" onClick={() => { table.setPageIndex(0) }}>Primera Pagina</Button>
        <Button className="mr-2 bg-green-800 text-white" onClick={() => { table.previousPage() }} disabled={!table.getCanPreviousPage()}>Anterior</Button>
        <Button className="mr-2 bg-green-800 text-white" onClick={() => { table.nextPage() }} disabled={!table.getCanNextPage()}>Siguiente</Button>
        <Button className="mr-2 bg-green-800 text-white" onClick={() => { table.setPageIndex(table.getPageCount() - 1) }}>Ultima Pagina</Button>
        <span className="ml-2">Pagina {`${table.getState().pagination.pageIndex + 1} - ${table.getPageCount()}`}</span>
      </div>
    </div>
  )
}