"use client"

import { useState, useTransition, useMemo } from "react"
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell
} from "recharts"
import {
  getCostosPeriodoAction,
  guardarCostoAction,
  crearCategoriaAction,
  editarCategoriaAction,
  eliminarCategoriaAction,
  type ResumenPeriodo,
  type EvolucionMes,
  type CategoriaConRegistro,
} from "@/actions/costos"

const formatPeso = (n: number) =>
  new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(n)

const COLORES_FIJO = '#3b82f6'
const COLORES_VARIABLE = '#f59e0b'
const COLORES_PIE = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#f97316', '#84cc16', '#ec4899', '#6366f1', '#14b8a6', '#a855f7', '#f43f5e']

function formatPeriodo(p: string) {
  const [anio, mes] = p.split('-')
  const meses = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
  return `${meses[parseInt(mes) - 1]} ${anio}`
}

function periodoAnterior(p: string) {
  const [anio, mes] = p.split('-').map(Number)
  const d = new Date(anio, mes - 2, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function periodoSiguiente(p: string) {
  const [anio, mes] = p.split('-').map(Number)
  const d = new Date(anio, mes, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function periodoActual() {
  const hoy = new Date()
  return `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}`
}

interface Props {
  resumenInicial: ResumenPeriodo
  evolucionInicial: EvolucionMes[]
}

export function CostosClient({ resumenInicial, evolucionInicial }: Props) {
  const [resumen, setResumen] = useState(resumenInicial)
  const [evolucion] = useState(evolucionInicial)
  const [isPending, startTransition] = useTransition()
  const [editando, setEditando] = useState<string | null>(null)
  const [importeEdit, setImporteEdit] = useState('')
  const [notaEdit, setNotaEdit] = useState('')
  const [feedback, setFeedback] = useState<{ tipo: 'ok' | 'error'; msg: string } | null>(null)
  const [showNuevaCat, setShowNuevaCat] = useState(false)
  const [nuevaCat, setNuevaCat] = useState({ nombre: '', tipo: 'FIJO' as 'FIJO' | 'VARIABLE' })
  const [editandoCat, setEditandoCat] = useState<CategoriaConRegistro | null>(null)
  const [editCatForm, setEditCatForm] = useState({ nombre: '', tipo: 'FIJO' as 'FIJO' | 'VARIABLE' })
  const hoy = periodoActual()
  const esFuturo = resumen.periodo > hoy

  function cambiarPeriodo(p: string) {
    startTransition(async () => {
      const nuevo = await getCostosPeriodoAction(p)
      setResumen(nuevo)
      setEditando(null)
      setFeedback(null)
    })
  }

  function iniciarEdicion(cat: CategoriaConRegistro) {
    setEditando(cat.id)
    setImporteEdit(cat.importe?.toString() ?? '')
    setNotaEdit(cat.nota ?? '')
    setFeedback(null)
  }

  async function guardar(categoriaId: string) {
    setFeedback(null)
    const result = await guardarCostoAction({
      categoriaId,
      periodo: resumen.periodo,
      importe: importeEdit,
      nota: notaEdit || undefined,
    })
    if (result.success) {
      setFeedback({ tipo: 'ok', msg: 'Guardado correctamente.' })
      setEditando(null)
      const nuevo = await getCostosPeriodoAction(resumen.periodo)
      setResumen(nuevo)
    } else {
      setFeedback({ tipo: 'error', msg: result.error })
    }
  }

  async function crearCategoria() {
    if (!nuevaCat.nombre.trim()) return
    const result = await crearCategoriaAction(nuevaCat)
    if (result.success) {
      setShowNuevaCat(false)
      setNuevaCat({ nombre: '', tipo: 'FIJO' })
      const nuevo = await getCostosPeriodoAction(resumen.periodo)
      setResumen(nuevo)
    } else {
      setFeedback({ tipo: 'error', msg: result.error })
    }
  }
  function iniciarEdicionCat(cat: CategoriaConRegistro) {
    setEditandoCat(cat)
    setEditCatForm({ nombre: cat.nombre, tipo: cat.tipo })
    setFeedback(null)
  }

  async function guardarCategoria() {
    if (!editandoCat) return
    const result = await editarCategoriaAction({
      id: editandoCat.id,
      nombre: editCatForm.nombre,
      tipo: editCatForm.tipo,
    })
    if (result.success) {
      setEditandoCat(null)
      const nuevo = await getCostosPeriodoAction(resumen.periodo)
      setResumen(nuevo)
    } else {
      setFeedback({ tipo: 'error', msg: result.error })
    }
  }

  async function eliminarCategoria(cat: CategoriaConRegistro) {
    if (!confirm(`¿Eliminar la categoría "${cat.nombre}"?`)) return
    const result = await eliminarCategoriaAction(cat.id)
    if (result.success) {
      const nuevo = await getCostosPeriodoAction(resumen.periodo)
      setResumen(nuevo)
    } else {
      setFeedback({ tipo: 'error', msg: result.error })
    }
  }

  const fijos = resumen.categorias.filter(c => c.tipo === 'FIJO')
  const variables = resumen.categorias.filter(c => c.tipo === 'VARIABLE')

  // Datos para torta
  const dataTorta = useMemo(() =>
    resumen.categorias
      .filter(c => (c.importe ?? 0) > 0)
      .map(c => ({ name: c.nombre, value: c.importe ?? 0 }))
    , [resumen])

  return (
    <div>
      {/* Navegación de período */}
      <div className="flex items-center gap-4 mb-6">
        <button
          onClick={() => cambiarPeriodo(periodoAnterior(resumen.periodo))}
          className="px-3 py-1 rounded bg-gray-100 hover:bg-gray-200 text-sm"
        >
          ← Anterior
        </button>
        <span className="text-lg font-semibold w-36 text-center">
          {formatPeriodo(resumen.periodo)}
        </span>
        <button
          onClick={() => cambiarPeriodo(periodoSiguiente(resumen.periodo))}
          disabled={esFuturo}
          className="px-3 py-1 rounded bg-gray-100 hover:bg-gray-200 text-sm disabled:opacity-40"
        >
          Siguiente →
        </button>
        {resumen.periodo !== hoy && (
          <button
            onClick={() => cambiarPeriodo(hoy)}
            className="px-3 py-1 rounded bg-blue-600 text-white text-sm"
          >
            Hoy
          </button>
        )}
      </div>

      {/* Tarjetas resumen */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        <div className="bg-gray-50 rounded-lg p-4">
          <div className="text-xs text-gray-400 mb-1">Costos fijos</div>
          <div className="text-lg font-bold text-blue-600">{formatPeso(resumen.totalFijo)}</div>
        </div>
        <div className="bg-gray-50 rounded-lg p-4">
          <div className="text-xs text-gray-400 mb-1">Costos variables</div>
          <div className="text-lg font-bold text-amber-500">{formatPeso(resumen.totalVariable)}</div>
        </div>
        <div className="bg-gray-50 rounded-lg p-4">
          <div className="text-xs text-gray-400 mb-1">Total del período</div>
          <div className="text-lg font-bold">{formatPeso(resumen.total)}</div>
        </div>
      </div>

      {feedback && (
        <div className={`mb-4 px-3 py-2 rounded text-sm ${feedback.tipo === 'ok'
          ? 'bg-green-50 text-green-800 border border-green-200'
          : 'bg-red-50 text-red-700 border border-red-200'
          }`}>
          {feedback.msg}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
        {/* Tabla de carga */}
        <div>
          {/* Fijos */}
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">
            Costos Fijos
          </h2>
          <table className="w-full text-sm mb-6">
            <tbody>
              {fijos.map(cat => (
                <tr key={cat.id} className="border-b">
                  {/* Columna nombre + edición de categoría */}
                  <td className="py-2 pr-4">
                    {editandoCat?.id === cat.id ? (
                      <div className="flex gap-2">
                        <input
                          value={editCatForm.nombre}
                          onChange={e => setEditCatForm(p => ({ ...p, nombre: e.target.value }))}
                          className="border rounded px-2 py-1 text-sm flex-1"
                        />
                        <select
                          value={editCatForm.tipo}
                          onChange={e => setEditCatForm(p => ({ ...p, tipo: e.target.value as 'FIJO' | 'VARIABLE' }))}
                          className="border rounded px-2 py-1 text-sm"
                        >
                          <option value="FIJO">Fijo</option>
                          <option value="VARIABLE">Variable</option>
                        </select>
                        <button onClick={guardarCategoria} className="px-2 py-1 rounded bg-green-700 text-white text-xs">✓</button>
                        <button onClick={() => setEditandoCat(null)} className="px-2 py-1 rounded bg-gray-100 text-xs">✕</button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 group">
                        <span>{cat.nombre}</span>
                        <div className="hidden group-hover:flex gap-1">
                          <button onClick={() => iniciarEdicionCat(cat)} className="text-xs text-blue-500 hover:underline">✏️</button>
                          <button onClick={() => eliminarCategoria(cat)} className="text-xs text-red-400 hover:underline">🗑️</button>
                        </div>
                      </div>
                    )}
                  </td>

                  {/* Columna importe */}
                  <td className="py-2 pr-4 text-right">
                    {editando === cat.id ? (
                      <input
                        type="number"
                        value={importeEdit}
                        onChange={e => setImporteEdit(e.target.value)}
                        className="border rounded px-2 py-1 w-36 text-right"
                        autoFocus
                        onWheel={e => e.currentTarget.blur()}
                      />
                    ) : (
                      <span className={cat.importe ? 'font-medium' : 'text-gray-300'}>
                        {cat.importe ? formatPeso(cat.importe) : '—'}
                      </span>
                    )}
                  </td>

                  {/* Columna acciones importe */}
                  <td className="py-2 text-right">
                    {editando === cat.id ? (
                      <div className="flex gap-2 justify-end">
                        <button onClick={() => guardar(cat.id)} className="px-3 py-1 rounded bg-green-700 text-white text-xs">Guardar</button>
                        <button onClick={() => setEditando(null)} className="px-3 py-1 rounded bg-gray-100 text-xs">Cancelar</button>
                      </div>
                    ) : (
                      <button onClick={() => iniciarEdicion(cat)} className="text-xs text-blue-600 hover:underline">
                        {cat.importe ? 'Editar' : 'Cargar'}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Variables */}
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">
            Costos Variables
          </h2>
          <table className="w-full text-sm mb-4">
            <tbody>
              {variables.map(cat => (
                <tr key={cat.id} className="border-b">
                  <td className="py-2 pr-4">
                    {editandoCat?.id === cat.id ? (
                      <div className="flex gap-2">
                        <input
                          value={editCatForm.nombre}
                          onChange={e => setEditCatForm(p => ({ ...p, nombre: e.target.value }))}
                          className="border rounded px-2 py-1 text-sm flex-1"
                        />
                        <select
                          value={editCatForm.tipo}
                          onChange={e => setEditCatForm(p => ({ ...p, tipo: e.target.value as 'FIJO' | 'VARIABLE' }))}
                          className="border rounded px-2 py-1 text-sm"
                        >
                          <option value="FIJO">Fijo</option>
                          <option value="VARIABLE">Variable</option>
                        </select>
                        <button onClick={guardarCategoria} className="px-2 py-1 rounded bg-green-700 text-white text-xs">✓</button>
                        <button onClick={() => setEditandoCat(null)} className="px-2 py-1 rounded bg-gray-100 text-xs">✕</button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 group">
                        <span>{cat.nombre}</span>
                        <div className="hidden group-hover:flex gap-1">
                          <button onClick={() => iniciarEdicionCat(cat)} className="text-xs text-blue-500 hover:underline">✏️</button>
                          <button onClick={() => eliminarCategoria(cat)} className="text-xs text-red-400 hover:underline">🗑️</button>
                        </div>
                      </div>
                    )}
                  </td>
                  <td className="py-2 pr-4 text-right">
                    {editando === cat.id ? (
                      <input
                        type="number"
                        value={importeEdit}
                        onChange={e => setImporteEdit(e.target.value)}
                        className="border rounded px-2 py-1 w-36 text-right"
                        autoFocus
                        onWheel={e => e.currentTarget.blur()}
                      />
                    ) : (
                      <span className={cat.importe ? 'font-medium' : 'text-gray-300'}>
                        {cat.importe ? formatPeso(cat.importe) : '—'}
                      </span>
                    )}
                  </td>
                  <td className="py-2 text-right">
                    {editando === cat.id ? (
                      <div className="flex gap-2 justify-end">
                        <button onClick={() => guardar(cat.id)} className="px-3 py-1 rounded bg-green-700 text-white text-xs">Guardar</button>
                        <button onClick={() => setEditando(null)} className="px-3 py-1 rounded bg-gray-100 text-xs">Cancelar</button>
                      </div>
                    ) : (
                      <button onClick={() => iniciarEdicion(cat)} className="text-xs text-blue-600 hover:underline">
                        {cat.importe ? 'Editar' : 'Cargar'}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Nueva categoría */}
          {showNuevaCat ? (
            <div className="border rounded-lg p-4 mt-2">
              <h3 className="text-sm font-medium mb-3">Nueva categoría</h3>
              <div className="flex gap-2 mb-2">
                <input
                  value={nuevaCat.nombre}
                  onChange={e => setNuevaCat(p => ({ ...p, nombre: e.target.value }))}
                  placeholder="Nombre de la categoría"
                  className="border rounded px-3 py-1.5 text-sm flex-1"
                />
                <select
                  value={nuevaCat.tipo}
                  onChange={e => setNuevaCat(p => ({ ...p, tipo: e.target.value as 'FIJO' | 'VARIABLE' }))}
                  className="border rounded px-3 py-1.5 text-sm"
                >
                  <option value="FIJO">Fijo</option>
                  <option value="VARIABLE">Variable</option>
                </select>
              </div>
              <div className="flex gap-2">
                <button onClick={crearCategoria} className="px-3 py-1.5 rounded bg-green-700 text-white text-sm">
                  Crear
                </button>
                <button onClick={() => setShowNuevaCat(false)} className="px-3 py-1.5 rounded bg-gray-100 text-sm">
                  Cancelar
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setShowNuevaCat(true)}
              className="text-sm text-blue-600 hover:underline mt-2"
            >
              + Nueva categoría
            </button>
          )}
        </div>

        {/* Torta de composición */}
        <div>
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">
            Composición del período
          </h2>
          {dataTorta.length > 0 ? (
            <ResponsiveContainer width="100%" height={350}>
              <PieChart>
                <Pie
                  data={dataTorta}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="45%"
                  outerRadius={110}
                  label={(props: any) => `${((props.value / resumen.total) * 100).toFixed(1)}%`}
                >
                  {dataTorta.map((_, i) => (
                    // eslint-disable-next-line @typescript-eslint/no-deprecated
                    <Cell key={i} fill={COLORES_PIE[i % COLORES_PIE.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(v) => [formatPeso(Number(v ?? 0)), 'Importe']} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-64 text-gray-300 text-sm">
              Sin datos para este período
            </div>
          )}
        </div>
      </div>

      {/* Evolución mensual */}
      <div>
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">
          Evolución últimos 12 meses
        </h2>
        <ResponsiveContainer width="100%" height={250}>
          <BarChart data={evolucion}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="periodo" tickFormatter={formatPeriodo} tick={{ fontSize: 11 }} />
            <YAxis tickFormatter={v => `$${(v / 1000000).toFixed(1)}M`} tick={{ fontSize: 11 }} />
            <Tooltip
              formatter={(v) => [formatPeso(Number(v ?? 0)), '']}
              labelFormatter={(label) => formatPeriodo(String(label))}
            />
            <Legend />
            <Bar dataKey="totalFijo" name="Fijos" fill={COLORES_FIJO} stackId="a" radius={[0, 0, 0, 0]} />
            <Bar dataKey="totalVariable" name="Variables" fill={COLORES_VARIABLE} stackId="a" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}