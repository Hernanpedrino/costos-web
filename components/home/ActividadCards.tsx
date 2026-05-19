// components/home/ActividadCards.tsx
import type { ActividadItem } from "@/actions/actividad"
import { PackagePlus, PackageMinus, Pencil, UserRound } from "lucide-react"

// ─── Helpers ──────────────────────────────────────────────────────────────────

const formatearFecha = (iso: string) => {
  const fecha = new Date(iso)
  const ahora = new Date()
  const diffMin  = Math.floor((ahora.getTime() - fecha.getTime()) / 60000)
  const diffHs   = Math.floor(diffMin / 60)
  const diffDias = Math.floor(diffHs / 24)

  if (diffMin < 1)  return "Hace un momento"
  if (diffMin < 60) return `Hace ${diffMin} min`
  if (diffHs  < 24) return `Hace ${diffHs} hs`
  if (diffDias < 7) return `Hace ${diffDias} día${diffDias > 1 ? "s" : ""}`
  return new Intl.DateTimeFormat("es-AR", {
    day: "2-digit", month: "2-digit", year: "numeric",
  }).format(fecha)
}

const textoAccion = (accion: string, entidad: string, detalle: string) => {
  const e = entidad === "Formula" ? "fórmula" : "insumo"
  switch (accion) {
    case "CREAR":    return { verbo: "Creó",     resto: `el ${e}` }
    case "EDITAR":   return { verbo: "Modificó", resto: `el ${e}` }
    case "ELIMINAR": return { verbo: "Eliminó",  resto: `el ${e}` }
    default:         return { verbo: "Actualizó", resto: `el ${e}` }
  }
}

const coloresAccion: Record<string, { bg: string; icon: string; border: string }> = {
  CREAR:    { bg: "bg-green-50",  icon: "text-green-700",  border: "border-green-200" },
  EDITAR:   { bg: "bg-blue-50",   icon: "text-blue-700",   border: "border-blue-200"  },
  ELIMINAR: { bg: "bg-red-50",    icon: "text-red-600",    border: "border-red-200"   },
}

const IconoAccion = ({ accion }: { accion: string }) => {
  const color = coloresAccion[accion] ?? { bg: "bg-gray-100", icon: "text-gray-600", border: "" }
  const claseBase = `w-9 h-9 rounded-full flex items-center justify-center ${color.bg}`
  const claseIcon = `w-4 h-4 ${color.icon}`

  if (accion === "CREAR")    return <div className={claseBase}><PackagePlus  className={claseIcon} /></div>
  if (accion === "EDITAR")   return <div className={claseBase}><Pencil       className={claseIcon} /></div>
  if (accion === "ELIMINAR") return <div className={claseBase}><PackageMinus className={claseIcon} /></div>
  return <div className={claseBase}><UserRound className={claseIcon} /></div>
}

// ─── Componente ───────────────────────────────────────────────────────────────

export function ActividadCards({ items }: { items: ActividadItem[] }) {
  if (items.length === 0) {
    return (
      <p className="text-sm text-muted-foreground text-center mt-4">
        No hay actividad registrada todavía.
      </p>
    )
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 w-full">
      {items.map((item) => {
        const { verbo, resto } = textoAccion(item.accion, item.entidad, item.detalle)
        const colores = coloresAccion[item.accion] ?? { bg: "", icon: "", border: "border-gray-200" }

        return (
          <div
            key={item.id}
            className={`flex flex-col gap-3 border ${colores.border} rounded-lg p-4 shadow-sm`}
          >
            {/* Icono + tiempo */}
            <div className="flex items-center justify-between">
              <IconoAccion accion={item.accion} />
              <span className="text-xs text-muted-foreground">
                {formatearFecha(item.createdAt)}
              </span>
            </div>

            {/* Contenido */}
            <div>
              <p className="text-sm font-semibold text-gray-800 truncate">
                {item.usuario}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {verbo} {resto}
              </p>
              <p className="text-xs font-medium text-gray-700 mt-1 truncate" title={item.detalle}>
                {item.detalle || "—"}
              </p>
            </div>
          </div>
        )
      })}
    </div>
  )
}
