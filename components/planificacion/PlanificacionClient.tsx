"use client"

import { useState, useMemo } from "react"
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine
} from "recharts"
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
import type { ConsumoMateriaPrima, DemandaArticulo } from "@/actions/planificacion"
import { exportarPlanificacionExcelAction } from "@/actions/planificacion"

const formatNum = (n: number) =>
  new Intl.NumberFormat('es-AR', { maximumFractionDigits: 1 }).format(n)

function formatMes(m: string) {
  const [anio, mes] = m.split('-')
  const meses = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
  return `${meses[parseInt(mes) - 1]} ${anio}`
}

function proxMesLabel() {
  const d = new Date()
  const prox = new Date(d.getFullYear(), d.getMonth() + 1, 1)
  return formatMes(`${prox.getFullYear()}-${String(prox.getMonth() + 1).padStart(2, '0')}`)
}

interface Props {
  consumoPrimas: ConsumoMateriaPrima[]
  demandaArticulos: DemandaArticulo[]
}

export function PlanificacionClient({ consumoPrimas, demandaArticulos }: Props) {
  const [vista, setVista] = useState<'primas' | 'articulos'>('primas')
  const [sortingP, setSortingP] = useState<SortingState>([])
  const [sortingA, setSortingA] = useState<SortingState>([])
  const [filterP, setFilterP] = useState('')
  const [filterA, setFilterA] = useState('')
  const [soloPicos, setSoloPicos] = useState(false)
  const [seleccionado, setSeleccionado] = useState<string | null>(null)
  const [exportando, setExportando] = useState(false)

  const prox = proxMesLabel()

  const detalleArticulo = useMemo(() =>
    demandaArticulos.find(a => a.codigo === seleccionado)
    , [seleccionado, demandaArticulos])

  const detallePrima = useMemo(() =>
    consumoPrimas.find(p => p.codigo === seleccionado)
    , [seleccionado, consumoPrimas])

  async function exportarExcel() {
    setExportando(true)
    try {
      const { buffer, filename } = await exportarPlanificacionExcelAction()
      // Convertir base64 a blob
      const byteChars = atob(buffer)
      const byteNums = new Array(byteChars.length)
      for (let i = 0; i < byteChars.length; i++) {
        byteNums[i] = byteChars.charCodeAt(i)
      }
      const blob = new Blob([new Uint8Array(byteNums)], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      a.click()
      URL.revokeObjectURL(url)
    } finally {
      setExportando(false)
    }
  }

  // ─── Columnas materias primas ──────────────────────────────────────────────
  const columnsPrimas = useMemo<ColumnDef<ConsumoMateriaPrima>[]>(() => [
    {
      accessorKey: 'descripcion',
      header: 'Materia Prima',
      cell: ({ row }) => (
        <div>
          <div className="font-medium">{row.original.descripcion}</div>
          <div className="text-xs text-gray-400">{row.original.codigo}</div>
        </div>
      )
    },
    {
      accessorKey: 'promedio6m',
      header: () => <span className="block text-right">Prom. 6m</span>,
      cell: ({ getValue }) => (
        <span className="block text-right">{formatNum(getValue() as number)}</span>
      )
    },
    {
      accessorKey: 'promedio12m',
      header: () => <span className="block text-right">Prom. 12m</span>,
      cell: ({ getValue }) => (
        <span className="block text-right">{formatNum(getValue() as number)}</span>
      )
    },
    {
      accessorKey: 'mismoMesAnioAnt',
      header: () => <span className="block text-right">Mismo mes ant.</span>,
      cell: ({ getValue }) => {
        const v = getValue() as number | null
        return <span className="block text-right">{v !== null ? formatNum(v) : <span className="text-gray-300">—</span>}</span>
      }
    },
    {
      accessorKey: 'proyeccionProxMes',
      header: () => <span className="block text-right font-semibold">Proyección {prox}</span>,
      cell: ({ getValue, row }) => {
        const v = getValue() as number
        const esPico = row.original.mismoMesAnioAnt !== null &&
          row.original.promedio12m > 0 &&
          row.original.mismoMesAnioAnt > row.original.promedio12m * 1.3
        return (
          <span className={`block text-right font-semibold ${esPico ? 'text-orange-500' : 'text-blue-600'}`}>
            {formatNum(v)}
            {esPico && ' 🔺'}
          </span>
        )
      }
    },
    {
      accessorKey: 'variacionPct',
      header: () => <span className="block text-right">Var. vs prom.</span>,
      cell: ({ getValue }) => {
        const v = getValue() as number | null
        if (v === null) return <span className="text-gray-300 block text-right">—</span>
        return (
          <span className={`block text-right text-sm ${v > 20 ? 'text-orange-500' : v < -20 ? 'text-blue-500' : 'text-gray-500'}`}>
            {v > 0 ? '+' : ''}{v.toFixed(1)}%
          </span>
        )
      }
    },
  ], [prox])

  // ─── Columnas artículos ────────────────────────────────────────────────────
  const columnsArticulos = useMemo<ColumnDef<DemandaArticulo>[]>(() => [
    {
      accessorKey: 'descripcion',
      header: 'Artículo',
      cell: ({ row }) => (
        <div>
          <div className="font-medium">{row.original.descripcion}</div>
          <div className="flex gap-2 mt-0.5">
            <span className="text-xs text-gray-400">{row.original.codigo}</span>
            {row.original.esElaborado && (
              <span className="text-xs bg-purple-100 text-purple-700 px-1 rounded">elaborado</span>
            )}
            {row.original.esPico && (
              <span className="text-xs bg-orange-100 text-orange-700 px-1 rounded">🔺 pico</span>
            )}
          </div>
        </div>
      )
    },
    {
      accessorKey: 'promedio6m',
      header: () => <span className="block text-right">Prom. 6m</span>,
      cell: ({ getValue }) => <span className="block text-right">{formatNum(getValue() as number)}</span>
    },
    {
      accessorKey: 'promedio12m',
      header: () => <span className="block text-right">Prom. 12m</span>,
      cell: ({ getValue }) => <span className="block text-right">{formatNum(getValue() as number)}</span>
    },
    {
      accessorKey: 'mismoMesAnioAnt',
      header: () => <span className="block text-right">Mismo mes ant.</span>,
      cell: ({ getValue }) => {
        const v = getValue() as number | null
        return <span className="block text-right">{v !== null ? formatNum(v) : <span className="text-gray-300">—</span>}</span>
      }
    },
    {
      accessorKey: 'proyeccionProxMes',
      header: () => <span className="block text-right font-semibold">Proyección {prox}</span>,
      cell: ({ getValue, row }) => (
        <span className={`block text-right font-semibold ${row.original.esPico ? 'text-orange-500' : 'text-blue-600'}`}>
          {formatNum(getValue() as number)}
          {row.original.esPico && ' 🔺'}
        </span>
      )
    },
    {
      accessorKey: 'variacionPct',
      header: () => <span className="block text-right">Var. vs prom.</span>,
      cell: ({ getValue }) => {
        const v = getValue() as number | null
        if (v === null) return <span className="text-gray-300 block text-right">—</span>
        return (
          <span className={`block text-right text-sm ${v > 20 ? 'text-orange-500' : v < -20 ? 'text-blue-500' : 'text-gray-500'}`}>
            {v > 0 ? '+' : ''}{v.toFixed(1)}%
          </span>
        )
      }
    },
  ], [prox])

  const articulosFiltrados = useMemo(() =>
    soloPicos ? demandaArticulos.filter(a => a.esPico) : demandaArticulos
    , [demandaArticulos, soloPicos])

  const tablePrimas = useReactTable({
    data: consumoPrimas,
    columns: columnsPrimas,
    state: { sorting: sortingP, globalFilter: filterP },
    onSortingChange: setSortingP,
    onGlobalFilterChange: setFilterP,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize: 20 } },
  })

  const tableArticulos = useReactTable<DemandaArticulo>({
    data: articulosFiltrados,
    columns: columnsArticulos,
    state: { sorting: sortingA, globalFilter: filterA },
    onSortingChange: setSortingA,
    onGlobalFilterChange: setFilterA,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize: 20 } },
  })

  const datosGrafico = useMemo(() => {
    if (!seleccionado) return []
    if (vista === 'primas' && detallePrima) {
      return detallePrima.consumoMensual.map(m => ({
        mes: formatMes(m.mes),
        cantidad: m.cantidad,
        promedio: detallePrima.promedio12m,
      }))
    }
    if (vista === 'articulos' && detalleArticulo) {
      return detalleArticulo.ventasMensual.map(m => ({
        mes: formatMes(m.mes),
        cantidad: m.cantidad,
        promedio: detalleArticulo.promedio12m,
      }))
    }
    return []
  }, [seleccionado, vista, detallePrima, detalleArticulo])

  const tituloSeleccionado = vista === 'primas'
    ? detallePrima?.descripcion
    : detalleArticulo?.descripcion

  return (
    <div>
      {/* Tabs + botón exportar */}
      <div className="flex justify-between items-center mb-6">
        <div className="flex gap-2">
          <button
            onClick={() => { setVista('primas'); setSeleccionado(null) }}
            className={`px-4 py-2 rounded text-sm font-medium ${vista === 'primas' ? 'bg-blue-600 text-white' : 'bg-gray-100 hover:bg-gray-200'}`}
          >
            🧪 Materias Primas
          </button>
          <button
            onClick={() => { setVista('articulos'); setSeleccionado(null) }}
            className={`px-4 py-2 rounded text-sm font-medium ${vista === 'articulos' ? 'bg-blue-600 text-white' : 'bg-gray-100 hover:bg-gray-200'}`}
          >
            📦 Artículos
          </button>
        </div>
        <button
          onClick={exportarExcel}
          disabled={exportando}
          className="px-4 py-2 rounded text-sm font-medium bg-green-700 text-white hover:bg-green-600 disabled:opacity-50"
        >
          {exportando ? 'Generando...' : '📥 Exportar Excel'}
        </button>
      </div>

      {/* Resumen */}
      {vista === 'primas' && (
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="bg-gray-50 rounded-lg p-4">
            <div className="text-xs text-gray-400 mb-1">Materias primas</div>
            <div className="text-lg font-bold">{consumoPrimas.length}</div>
          </div>
          <div className="bg-orange-50 rounded-lg p-4">
            <div className="text-xs text-gray-400 mb-1">Con pico proyectado</div>
            <div className="text-lg font-bold text-orange-500">
              {consumoPrimas.filter(p =>
                p.mismoMesAnioAnt !== null && p.mismoMesAnioAnt > p.promedio12m * 1.3
              ).length}
            </div>
          </div>
          <div className="bg-gray-50 rounded-lg p-4">
            <div className="text-xs text-gray-400 mb-1">Proyección total {prox}</div>
            <div className="text-lg font-bold">
              {formatNum(consumoPrimas.reduce((t, p) => t + p.proyeccionProxMes, 0))}
            </div>
          </div>
        </div>
      )}

      {vista === 'articulos' && (
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="bg-gray-50 rounded-lg p-4">
            <div className="text-xs text-gray-400 mb-1">Artículos con ventas</div>
            <div className="text-lg font-bold">{demandaArticulos.length}</div>
          </div>
          <div className="bg-orange-50 rounded-lg p-4">
            <div className="text-xs text-gray-400 mb-1">Con pico proyectado 🔺</div>
            <div className="text-lg font-bold text-orange-500">
              {demandaArticulos.filter(a => a.esPico).length}
            </div>
          </div>
          <div className="bg-purple-50 rounded-lg p-4">
            <div className="text-xs text-gray-400 mb-1">Elaborados con pico</div>
            <div className="text-lg font-bold text-purple-600">
              {demandaArticulos.filter(a => a.esPico && a.esElaborado).length}
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-6">
        {/* Tabla */}
        <div>
          <div className="flex gap-3 mb-3 items-center">
            <input
              value={vista === 'primas' ? filterP : filterA}
              onChange={e => vista === 'primas' ? setFilterP(e.target.value) : setFilterA(e.target.value)}
              placeholder={vista === 'primas' ? 'Buscar materia prima...' : 'Buscar artículo...'}
              className="border rounded px-3 py-1.5 text-sm w-64"
            />
            {vista === 'articulos' && (
              <button
                onClick={() => setSoloPicos(v => !v)}
                className={`px-3 py-1.5 rounded text-sm ${soloPicos ? 'bg-orange-500 text-white' : 'bg-gray-100 hover:bg-gray-200'}`}
              >
                🔺 Solo picos
              </button>
            )}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                {vista === 'primas'
                  ? tablePrimas.getHeaderGroups().map(hg => (
                    <tr key={hg.id} className="border-b text-gray-500">
                      {hg.headers.map(h => (
                        <th key={h.id} className="pb-2 pr-4 select-none"
                          onClick={h.column.getToggleSortingHandler()}
                          style={{ cursor: h.column.getCanSort() ? 'pointer' : 'default' }}>
                          {flexRender(h.column.columnDef.header, h.getContext())}
                          {h.column.getIsSorted() === 'asc' && ' ↑'}
                          {h.column.getIsSorted() === 'desc' && ' ↓'}
                        </th>
                      ))}
                    </tr>
                  ))
                  : tableArticulos.getHeaderGroups().map(hg => (
                    <tr key={hg.id} className="border-b text-gray-500">
                      {hg.headers.map(h => (
                        <th key={h.id} className="pb-2 pr-4 select-none"
                          onClick={h.column.getToggleSortingHandler()}
                          style={{ cursor: h.column.getCanSort() ? 'pointer' : 'default' }}>
                          {flexRender(h.column.columnDef.header, h.getContext())}
                          {h.column.getIsSorted() === 'asc' && ' ↑'}
                          {h.column.getIsSorted() === 'desc' && ' ↓'}
                        </th>
                      ))}
                    </tr>
                  ))
                }
              </thead>
              <tbody>
                {vista === 'primas'
                  ? tablePrimas.getRowModel().rows.map(row => (
                    <tr key={row.id}
                      className={`border-b cursor-pointer ${seleccionado === row.original.codigo ? 'bg-blue-50' : 'hover:bg-gray-50'}`}
                      onClick={() => setSeleccionado(prev => prev === row.original.codigo ? null : row.original.codigo)}
                    >
                      {row.getVisibleCells().map(cell => (
                        <td key={cell.id} className="py-2 pr-4">
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </td>
                      ))}
                    </tr>
                  ))
                  : tableArticulos.getRowModel().rows.map(row => (
                    <tr key={row.id}
                      className={`border-b cursor-pointer ${seleccionado === row.original.codigo ? 'bg-blue-50' : 'hover:bg-gray-50'}`}
                      onClick={() => setSeleccionado(prev => prev === row.original.codigo ? null : row.original.codigo)}
                    >
                      {row.getVisibleCells().map(cell => (
                        <td key={cell.id} className="py-2 pr-4">
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </td>
                      ))}
                    </tr>
                  ))
                }
              </tbody>
            </table>
          </div>

          {/* Paginación */}
          <div className="flex items-center gap-4 mt-3 text-sm text-gray-500">
            {vista === 'primas' ? (
              <>
                <button onClick={() => tablePrimas.previousPage()} disabled={!tablePrimas.getCanPreviousPage()} className="px-3 py-1 rounded bg-gray-100 disabled:opacity-40">← Anterior</button>
                <span>Página {tablePrimas.getState().pagination.pageIndex + 1} de {tablePrimas.getPageCount()} · {tablePrimas.getFilteredRowModel().rows.length} registros</span>
                <button onClick={() => tablePrimas.nextPage()} disabled={!tablePrimas.getCanNextPage()} className="px-3 py-1 rounded bg-gray-100 disabled:opacity-40">Siguiente →</button>
              </>
            ) : (
              <>
                <button onClick={() => tableArticulos.previousPage()} disabled={!tableArticulos.getCanPreviousPage()} className="px-3 py-1 rounded bg-gray-100 disabled:opacity-40">← Anterior</button>
                <span>Página {tableArticulos.getState().pagination.pageIndex + 1} de {tableArticulos.getPageCount()} · {tableArticulos.getFilteredRowModel().rows.length} registros</span>
                <button onClick={() => tableArticulos.nextPage()} disabled={!tableArticulos.getCanNextPage()} className="px-3 py-1 rounded bg-gray-100 disabled:opacity-40">Siguiente →</button>
              </>
            )}
          </div>
        </div>

        {/* Panel de detalle */}
        {seleccionado && datosGrafico.length > 0 && (
          <div className="border rounded-lg p-4">
            <div className="flex justify-between items-start mb-4">
              <div>
                <h3 className="font-semibold">{tituloSeleccionado}</h3>
                <p className="text-xs text-gray-400">Evolución últimos 12 meses</p>
              </div>
              <button onClick={() => setSeleccionado(null)} className="text-gray-400 hover:text-gray-600">✕</button>
            </div>

            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={datosGrafico}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="mes" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip formatter={(v) => [formatNum(Number(v)), '']} />
                <ReferenceLine y={datosGrafico[0]?.promedio} stroke="#94a3b8" strokeDasharray="4 4" label={{ value: 'Prom.', fontSize: 10 }} />
                <Bar dataKey="cantidad" name="Cantidad" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>

            <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
              {vista === 'primas' && detallePrima && (
                <>
                  <div className="bg-gray-50 rounded p-3">
                    <div className="text-xs text-gray-400">Promedio 6 meses</div>
                    <div className="font-semibold">{formatNum(detallePrima.promedio6m)}</div>
                  </div>
                  <div className="bg-gray-50 rounded p-3">
                    <div className="text-xs text-gray-400">Promedio 12 meses</div>
                    <div className="font-semibold">{formatNum(detallePrima.promedio12m)}</div>
                  </div>
                  <div className="bg-gray-50 rounded p-3">
                    <div className="text-xs text-gray-400">Mismo mes año ant.</div>
                    <div className="font-semibold">
                      {detallePrima.mismoMesAnioAnt !== null ? formatNum(detallePrima.mismoMesAnioAnt) : '—'}
                    </div>
                  </div>
                  <div className="bg-blue-50 rounded p-3">
                    <div className="text-xs text-gray-400">Proyección {prox}</div>
                    <div className="font-semibold text-blue-600">{formatNum(detallePrima.proyeccionProxMes)}</div>
                  </div>
                </>
              )}
              {vista === 'articulos' && detalleArticulo && (
                <>
                  <div className="bg-gray-50 rounded p-3">
                    <div className="text-xs text-gray-400">Promedio 6 meses</div>
                    <div className="font-semibold">{formatNum(detalleArticulo.promedio6m)}</div>
                  </div>
                  <div className="bg-gray-50 rounded p-3">
                    <div className="text-xs text-gray-400">Promedio 12 meses</div>
                    <div className="font-semibold">{formatNum(detalleArticulo.promedio12m)}</div>
                  </div>
                  <div className="bg-gray-50 rounded p-3">
                    <div className="text-xs text-gray-400">Mismo mes año ant.</div>
                    <div className="font-semibold">
                      {detalleArticulo.mismoMesAnioAnt !== null ? formatNum(detalleArticulo.mismoMesAnioAnt) : '—'}
                    </div>
                  </div>
                  <div className="bg-blue-50 rounded p-3">
                    <div className="text-xs text-gray-400">Proyección {prox}</div>
                    <div className="font-semibold text-blue-600">{formatNum(detalleArticulo.proyeccionProxMes)}</div>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
