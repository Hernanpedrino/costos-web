"use client"

// components/formulas/FormulasClient.tsx
import { useState, useCallback } from "react"
import { columns } from "@/app/(pages)/formulas/colums"
import { DataTable } from "@/app/(pages)/formulas/data-table"
import { EditFormulaSheet } from "@/components/formulas/EditFormulaSheet"
import { getFormulasAction } from "@/actions/formulas"
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

  // Recarga los datos frescos desde el servidor tras guardar
  const handleSaved = useCallback(async () => {
    const actualizadas = await getFormulasAction()
    setData(actualizadas)
  }, [])

  return (
    <>
      {data.map((formula) => (
        <div className="p-10 w-3/4" key={formula.id}>
          <DataTable
            columns={columns}
            data={formula.items}
            title={formula.name}
            precioTotal={formula.precioTotal}
            onEdit={() => setFormulaEditar(formula)}
          />
        </div>
      ))}

      <EditFormulaSheet
        formula={formulaEditar}
        listaInsumos={listaInsumos}
        listaFormulas={listaFormulas}
        onClose={() => setFormulaEditar(null)}
        onSaved={handleSaved}
      />
    </>
  )
}
