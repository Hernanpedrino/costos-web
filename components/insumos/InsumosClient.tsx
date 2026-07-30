"use client"

import { useState } from "react"
import { Plus } from "lucide-react"
import { columns } from "@/app/(pages)/insumos/columns"
import { DataTable } from "@/app/(pages)/insumos/data-table"
import { EditInsumoSheet } from "@/components/insumos/EditInsumoSheet"
import { CreateInsumoSheet } from "@/components/insumos/CreateInsumoSheet"
import { Button } from "@/components/ui/button"
import type { Insumo } from "@/types"

interface InsumosClientProps {
  initialData: Insumo[]
}

export function InsumosClient({ initialData }: InsumosClientProps) {
  const [data, setData]                 = useState<Insumo[]>(initialData)
  const [insumoEditar, setInsumoEditar] = useState<Insumo | null>(null)
  const [crearAbierto, setCrearAbierto] = useState(false)

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
        actions={
          <Button
            type="button"
            onClick={() => setCrearAbierto(true)}
            className="bg-green-800 text-white hover:bg-green-600 shrink-0"
          >
            <Plus className="w-4 h-4" />
            Crear insumo
          </Button>
        }
      />

      <EditInsumoSheet
        insumo={insumoEditar}
        onClose={() => setInsumoEditar(null)}
        onSaved={handleSaved}
      />

      <CreateInsumoSheet
        open={crearAbierto}
        onClose={() => setCrearAbierto(false)}
        onCreated={handleCreated}
      />
    </>
  )
}
