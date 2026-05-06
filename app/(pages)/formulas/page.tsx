// app/(pages)/formulas/page.tsx
import { Button } from "@/components/ui/button"
import Link from "next/link"
import { getFormulasAction } from "@/actions/formulas"
import { getInsumosAction } from "@/actions/insumos"
import { FormulasClient } from "@/components/formulas/FormulasClient"

export const dynamic = 'force-dynamic'

export default async function FormulasPage() {
  const [formulas, insumos] = await Promise.all([
    getFormulasAction(),
    getInsumosAction(),
  ])

  return (
    <div className="flex flex-col items-center">
      <Link href="/formulas/nueva">
        <Button
          type="button"
          className="text-white bg-green-800 border-0 py-2 px-6 focus:outline-none hover:bg-green-600 rounded text-sm mt-10"
          size="lg"
        >
          Nueva fórmula
        </Button>
      </Link>

      {formulas.length === 0 && (
        <p className="mt-16 text-muted-foreground text-sm">
          No hay fórmulas cargadas todavía.
        </p>
      )}

      <FormulasClient
        initialData={formulas}
        listaInsumos={insumos}
        listaFormulas={formulas}   // las fórmulas existentes pueden ser sub-fórmulas
      />
    </div>
  )
}
