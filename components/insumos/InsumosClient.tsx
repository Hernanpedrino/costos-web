"use client"

import { useState } from "react"
import { columns } from "@/app/(pages)/insumos/columns"
import { DataTable } from "@/app/(pages)/insumos/data-table"
import type { Insumo } from "@/types"
import { EditInsumoSheet } from "./EditInsumoSheet"

interface InsumosClientProps {
  initialData: Insumo[]
}

export function InsumosClient({ initialData }: InsumosClientProps) {
  const [data, setData]                 = useState<Insumo[]>(initialData)
  const [insumoEditar, setInsumoEditar] = useState<Insumo | null>(null)

  const handleSaved = (actualizado: Insumo) => {
    setData((prev) =>
      prev.map((i) => (i.id === actualizado.id ? actualizado : i))
    )
  }

  return (
    <>
      <DataTable
        columns={columns}
        data={data}
        onRowClick={setInsumoEditar}
      />
      <EditInsumoSheet
        insumo={insumoEditar}
        onClose={() => setInsumoEditar(null)}
        onSaved={handleSaved}
      />
    </>
  )
}
