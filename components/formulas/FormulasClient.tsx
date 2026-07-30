"use client"

import { useState, useCallback, useEffect, useMemo } from "react"
import { columns } from "@/app/(pages)/formulas/colums"
import { DataTable } from "@/app/(pages)/formulas/data-table"
import { EditFormulaSheet } from "@/components/formulas/EditFormulaSheet"
import { FormulaPieChart } from "@/components/formulas/FormulaPieChart"
import { getFormulasAction } from "@/actions/formulas"
import { Input } from "@/components/ui/input"
import { ArrowUp, ArrowUpAZ, ArrowDownAZ, ChevronLeft, ChevronRight } from "lucide-react"
import type { FormulaListItem } from "@/actions/formulas"
import type { Insumo, Formula } from "@/types"

const POR_PAGINA = 10

type Orden = "ninguno" | "asc" | "desc"

interface FormulasClientProps {
  initialData:   FormulaListItem[]
  listaInsumos:  Insumo[]
  listaFormulas: Pick<Formula, "id" | "name">[]
}

export function FormulasClient({
  initialData,
  listaInsumos,
  listaFormulas,
}: FormulasClientProps) {
  const [data, setData]                   = useState<FormulaListItem[]>(initialData)
  const [formulaEditar, setFormulaEditar] = useState<FormulaListItem | null>(null)
  const [busqueda, setBusqueda]           = useState("")
  const [orden, setOrden]                 = useState<Orden>("ninguno")
  const [pagina, setPagina]               = useState(1)
  const [mostrarFab, setMostrarFab]       = useState(false)

  useEffect(() => {
    const handleScroll = () => setMostrarFab(window.scrollY > 300)
    window.addEventListener("scroll", handleScroll)
    return () => window.removeEventListener("scroll", handleScroll)
  }, [])

  const scrollAlInicio = () => window.scrollTo({ top: 0, behavior: "smooth" })

  const handleSaved = useCallback(async () => {
    const actualizadas = await getFormulasAction()
    setData(actualizadas)
  }, [])

  const formulasFiltradas = useMemo(() => {
    const filtradas = data.filter((f) =>
      f.name.toLowerCase().includes(busqueda.toLowerCase())
    )
    if (orden === "ninguno") return filtradas
    const ordenadas = [...filtradas].sort((a, b) => a.name.localeCompare(b.name, "es"))
    return orden === "asc" ? ordenadas : ordenadas.reverse()
  }, [data, busqueda, orden])

  // Volver a la página 1 cada vez que cambia el filtro o el orden
  // (ajuste de estado durante el render, no en un efecto — evita un
  // render en cascada innecesario).
  const [filtroPrevio, setFiltroPrevio] = useState({ busqueda, orden })
  if (filtroPrevio.busqueda !== busqueda || filtroPrevio.orden !== orden) {
    setFiltroPrevio({ busqueda, orden })
    setPagina(1)
  }

  const totalPaginas = Math.max(1, Math.ceil(formulasFiltradas.length / POR_PAGINA))
  const paginaSegura = Math.min(pagina, totalPaginas)
  const formulasPaginadas = formulasFiltradas.slice(
    (paginaSegura - 1) * POR_PAGINA,
    paginaSegura * POR_PAGINA
  )

  function cambiarOrden() {
    setOrden((prev) => (prev === "ninguno" ? "asc" : prev === "asc" ? "desc" : "ninguno"))
  }

  function irAPagina(p: number) {
    setPagina(Math.min(Math.max(1, p), totalPaginas))
    scrollAlInicio()
  }

  return (
    <>
      <div className="w-full max-w-5xl px-2 mt-6 mb-2 flex flex-wrap items-center gap-3">
        <div className="w-full max-w-sm">
          <Input
            type="text"
            placeholder="Buscar fórmula por nombre..."
            className="border-green-800"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
          />
        </div>

        <button
          type="button"
          onClick={cambiarOrden}
          title="Ordenar alfabéticamente"
          className="flex items-center gap-1.5 px-3 py-1.5 rounded border text-sm text-muted-foreground hover:text-foreground hover:bg-gray-50 transition-colors"
        >
          {orden === "desc" ? (
            <ArrowDownAZ className="w-4 h-4" />
          ) : (
            <ArrowUpAZ className="w-4 h-4" />
          )}
          {orden === "ninguno" && "Ordenar A-Z"}
          {orden === "asc" && "Nombre A-Z"}
          {orden === "desc" && "Nombre Z-A"}
        </button>

        {formulasFiltradas.length > 0 && (
          <span className="text-xs text-muted-foreground ml-auto">
            {formulasFiltradas.length} {formulasFiltradas.length === 1 ? "fórmula" : "fórmulas"}
          </span>
        )}
      </div>

      {formulasFiltradas.length === 0 && (
        <p className="text-sm text-muted-foreground mt-4">
          {busqueda
            ? `No se encontraron fórmulas con "${busqueda}".`
            : "No hay fórmulas cargadas."}
        </p>
      )}

      {formulasPaginadas.map((formula) => (
        <div className="py-4 px-2 w-full max-w-5xl" key={formula.id}>
          <div className="flex flex-col lg:flex-row gap-4 items-start">

            {/* Tabla — flex-1 para ocupar el espacio disponible */}
            <div className="flex-1 min-w-0">
              <DataTable
                columns={columns}
                data={formula.items}
                title={formula.name}
                precioTotal={formula.precioTotal}
                onEdit={() => setFormulaEditar(formula)}
              />
            </div>

            {/* Gráfico de torta — ancho fijo */}
            <div className="w-full lg:w-64 border rounded-lg shadow-sm p-3 shrink-0">
              <p className="text-xs font-medium text-center text-muted-foreground uppercase tracking-wide mb-1">
                Composición del costo
              </p>
              <FormulaPieChart formula={formula} />
            </div>

          </div>
        </div>
      ))}

      {totalPaginas > 1 && (
        <div className="flex items-center justify-center gap-4 my-6">
          <button
            type="button"
            onClick={() => irAPagina(paginaSegura - 1)}
            disabled={paginaSegura === 1}
            className="flex items-center gap-1 px-3 py-1.5 rounded bg-gray-100 hover:bg-gray-200 text-sm disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <ChevronLeft className="w-4 h-4" />
            Anterior
          </button>
          <span className="text-sm text-muted-foreground">
            Página {paginaSegura} de {totalPaginas}
          </span>
          <button
            type="button"
            onClick={() => irAPagina(paginaSegura + 1)}
            disabled={paginaSegura === totalPaginas}
            className="flex items-center gap-1 px-3 py-1.5 rounded bg-gray-100 hover:bg-gray-200 text-sm disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Siguiente
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}

      <EditFormulaSheet
        formula={formulaEditar}
        listaInsumos={listaInsumos}
        listaFormulas={listaFormulas}
        onClose={() => setFormulaEditar(null)}
        onSaved={handleSaved}
      />

      {mostrarFab && (
        <button
          onClick={scrollAlInicio}
          title="Volver al inicio"
          className="fixed bottom-8 right-8 z-50 bg-green-800 text-white
                     w-12 h-12 rounded-full shadow-lg
                     flex items-center justify-center
                     hover:bg-green-600 transition-colors"
        >
          <ArrowUp className="w-5 h-5" />
        </button>
      )}
    </>
  )
}
