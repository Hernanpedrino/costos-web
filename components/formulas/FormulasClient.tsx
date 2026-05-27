"use client"

import { useState, useCallback, useEffect } from "react"
import { columns } from "@/app/(pages)/formulas/colums"
import { DataTable } from "@/app/(pages)/formulas/data-table"
import { EditFormulaSheet } from "@/components/formulas/EditFormulaSheet"
import { FormulaPieChart } from "@/components/formulas/FormulaPieChart"
import { getFormulasAction } from "@/actions/formulas"
import { Input } from "@/components/ui/input"
import { ArrowUp } from "lucide-react"
import type { FormulaListItem } from "@/actions/formulas"
import type { Insumo, Formula } from "@/types"

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

  const formulasFiltradas = data.filter((f) =>
    f.name.toLowerCase().includes(busqueda.toLowerCase())
  )

  return (
    <>
      <div className="w-full max-w-sm m-6">
        <Input
          type="text"
          placeholder="Buscar fórmula por nombre..."
          className="border-green-800"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
        />
      </div>

      {formulasFiltradas.length === 0 && (
        <p className="text-sm text-muted-foreground mt-4">
          {busqueda
            ? `No se encontraron fórmulas con "${busqueda}".`
            : "No hay fórmulas cargadas."}
        </p>
      )}

      {formulasFiltradas.map((formula) => (
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
