"use client"

import { useState } from "react"
import { columns } from "@/app/(pages)/insumos/columns"
import { DataTable } from "@/app/(pages)/insumos/data-table"
import { EditInsumoSheet } from "@/components/insumos/EditInsumoSheet"
import { Form } from "@/components/form/Form"
import { Separator } from "@/components/ui/separator"
import type { Insumo } from "@/types"

interface InsumosClientProps {
  initialData: Insumo[]
}

export function InsumosClient({ initialData }: InsumosClientProps) {
  const [data, setData]                 = useState<Insumo[]>(initialData)
  const [insumoEditar, setInsumoEditar] = useState<Insumo | null>(null)

  // Edición: reemplaza el item actualizado en el array
  const handleSaved = (actualizado: Insumo) => {
    setData((prev) =>
      prev.map((i) => (i.id === actualizado.id ? actualizado : i))
    )
  }

  // Creación: agrega al inicio (orden desc por createdAt)
  const handleCreated = (nuevo: Insumo) => {
    setData((prev) => [nuevo, ...prev])
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

      <Separator orientation="horizontal" className="my-10" />

      <Form onCreated={handleCreated} />
    </>
  )
}
