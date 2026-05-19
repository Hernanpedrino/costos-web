
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { ActividadCards } from "@/components/home/ActividadCards"
import { getActividadAction } from "@/actions/actividad"

export const revalidate = 300

export default async function HomePage() {
  const actividad = await getActividadAction()

  return (
    <div className="container mx-auto px-4 py-10 flex flex-col items-center gap-8">

      {/* Actividad reciente */}
      <div className="w-full">
        <h2 className="text-lg font-semibold mb-4 text-center">Actividad reciente</h2>
        <ActividadCards items={actividad} />
        <p className="text-xs text-muted-foreground text-center mt-4">
          Actualizado cada 5 minutos
        </p>
      </div>

    </div>
  )
}
