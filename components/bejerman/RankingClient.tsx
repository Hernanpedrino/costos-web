// components/bejerman/RankingClient.tsx
"use client"

import { useState, useTransition, useMemo } from "react"
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
} from "@tanstack/react-table"
import { getRankingArticulosAction, type RankingArticulo } from "@/actions/bejerman"

const formatPeso = (n: number) =>
  new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(n);

const formatNum = (n: number) =>
  new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 }).format(n);

type Orden   = 'facturacion' | 'unidades' | 'margen'
type Periodo = 'mes' | 'trimestre' | 'semestre' | 'anio'

export function RankingClient({ data: inicial }: { data: RankingArticulo[] }) {
  const [data, setData]           = useState(inicial);
  const [orden, setOrden]         = useState<Orden>('facturacion');
  const [periodo, setPeriodo]     = useState<Periodo>('anio');
  const [sorting, setSorting]     = useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = useState('');
  const [isPending, startTransition]    = useTransition();

  function actualizar(nuevoOrden: Orden, nuevoPeriodo: Periodo) {
    setOrden(nuevoOrden);
    setPeriodo(nuevoPeriodo);
    startTransition(async () => {
      const result = await getRankingArticulosAction({
        orden:   nuevoOrden,
        limite:  50,
        periodo: nuevoPeriodo,
      });
      setData(result);
    });
  }

  const columns = useMemo<ColumnDef<RankingArticulo>[]>(() => [
    {
      id: 'posicion',
      header: '#',
      cell: ({ row }) => (
        <span className="text-gray-400">{row.index + 1}</span>
      ),
      enableSorting: false,
    },
    {
      accessorKey: 'descripcion',
      header: 'Artículo',
      cell: ({ row }) => (
        <div>
          <div className="font-medium">{row.original.descripcion}</div>
          <div className="text-xs text-gray-400">{row.original.codigo}</div>
        </div>
      ),
    },
    {
      accessorKey: 'unidadesVendidas',
      header: 'Unidades',
      cell: ({ getValue }) => (
        <span className="text-right block">{formatNum(getValue() as number)}</span>
      ),
    },
    {
      accessorKey: 'facturacionNeta',
      header: 'Facturación',
      cell: ({ getValue }) => (
        <span className="text-right block font-medium">{formatPeso(getValue() as number)}</span>
      ),
    },
    {
      accessorKey: 'precioSIV',
      header: 'Precio SIV',
      cell: ({ getValue }) => {
        const v = getValue() as number | null;
        return <span className="text-right block">{v ? formatPeso(v) : <span className="text-gray-300">—</span>}</span>;
      },
    },
    {
      accessorKey: 'costoUnitario',
      header: 'Costo unit.',
      cell: ({ getValue }) => {
        const v = getValue() as number | null;
        return <span className="text-right block">{v ? formatPeso(v) : <span className="text-gray-300">—</span>}</span>;
      },
    },
    {
      accessorKey: 'margenPct',
      header: 'Margen',
      cell: ({ getValue }) => {
        const v = getValue() as number | null;
        if (v === null) return <span className="text-gray-300 block text-right">—</span>;
        return (
          <span className={`block text-right font-medium ${
            v < 20 ? 'text-red-500' : v < 35 ? 'text-yellow-500' : 'text-green-600'
          }`}>
            {v.toFixed(1)}%
          </span>
        );
      },
    },
    {
      accessorKey: 'fuenteCosto',
      header: 'Fuente',
      cell: ({ getValue }) => {
        const v = getValue() as string | null;
        return (
          <span className="text-xs text-gray-400">
            {v === 'compra' ? '🛒 compra' : v === 'produccion' ? '⚙️ prod.' : '—'}
          </span>
        );
      },
      enableSorting: false,
    },
  ], []);

  const table = useReactTable({
    data,
    columns,
    state:    { sorting, globalFilter },
    onSortingChange:      setSorting,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel:       getCoreRowModel(),
    getSortedRowModel:     getSortedRowModel(),
    getFilteredRowModel:   getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize: 25 } },
  });

  return (
    <div>
      {/* Filtros de período y orden */}
      <div className="flex gap-4 mb-4 flex-wrap">
        <div className="flex gap-2 items-center">
          <span className="text-sm font-medium">Ordenar por:</span>
          {(['facturacion', 'unidades', 'margen'] as Orden[]).map(o => (
            <button
              key={o}
              onClick={() => actualizar(o, periodo)}
              className={`px-3 py-1 rounded text-sm ${
                orden === o ? 'bg-blue-600 text-white' : 'bg-gray-100 hover:bg-gray-200'
              }`}
            >
              {o === 'facturacion' ? 'Facturación' : o === 'unidades' ? 'Unidades' : 'Menor margen'}
            </button>
          ))}
        </div>
        <div className="flex gap-2 items-center">
          <span className="text-sm font-medium">Período:</span>
          {(['mes', 'trimestre', 'semestre', 'anio'] as Periodo[]).map(p => (
            <button
              key={p}
              onClick={() => actualizar(orden, p)}
              className={`px-3 py-1 rounded text-sm ${
                periodo === p ? 'bg-blue-600 text-white' : 'bg-gray-100 hover:bg-gray-200'
              }`}
            >
              {p === 'mes' ? '1 mes' : p === 'trimestre' ? '3 meses' : p === 'semestre' ? '6 meses' : '1 año'}
            </button>
          ))}
        </div>
      </div>

      {/* Buscador */}
      <div className="mb-4">
        <input
          value={globalFilter}
          onChange={e => setGlobalFilter(e.target.value)}
          placeholder="Buscar artículo..."
          className="border rounded px-3 py-1.5 text-sm w-72"
        />
      </div>

      {/* Tabla */}
      <div className={`overflow-x-auto transition-opacity ${isPending ? 'opacity-50' : ''}`}>
        <table className="w-full text-sm">
          <thead>
            {table.getHeaderGroups().map(headerGroup => (
              <tr key={headerGroup.id} className="border-b text-left text-gray-500">
                {headerGroup.headers.map(header => (
                  <th
                    key={header.id}
                    className="pb-2 pr-4 select-none"
                    onClick={header.column.getToggleSortingHandler()}
                    style={{ cursor: header.column.getCanSort() ? 'pointer' : 'default' }}
                  >
                    <div className="flex items-center gap-1">
                      {flexRender(header.column.columnDef.header, header.getContext())}
                      {header.column.getIsSorted() === 'asc'  && ' ↑'}
                      {header.column.getIsSorted() === 'desc' && ' ↓'}
                    </div>
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map(row => (
              <tr key={row.id} className="border-b hover:bg-gray-50">
                {row.getVisibleCells().map(cell => (
                  <td key={cell.id} className="py-2 pr-4">
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Paginación */}
      <div className="flex items-center gap-4 mt-4 text-sm text-gray-500">
        <button
          onClick={() => table.previousPage()}
          disabled={!table.getCanPreviousPage()}
          className="px-3 py-1 rounded bg-gray-100 disabled:opacity-40"
        >
          ← Anterior
        </button>
        <span>
          Página {table.getState().pagination.pageIndex + 1} de {table.getPageCount()}
          {' '}· {table.getFilteredRowModel().rows.length} artículos
        </span>
        <button
          onClick={() => table.nextPage()}
          disabled={!table.getCanNextPage()}
          className="px-3 py-1 rounded bg-gray-100 disabled:opacity-40"
        >
          Siguiente →
        </button>
      </div>
    </div>
  );
}