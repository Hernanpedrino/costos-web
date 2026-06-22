import { getDetalleArticuloAction } from "@/actions/bejerman"
import { notFound } from "next/navigation"
import { DetalleArticuloClient } from "@/components/bejerman/DetalleArticuloClient";
import Link from "next/link"

export default async function DetalleArticuloPage({
  params
}: {
  params: Promise<{ codigo: string }>
}) {
  const { codigo } = await params;
  const detalle = await getDetalleArticuloAction(
    decodeURIComponent(codigo)
  );

  if (!detalle) notFound();

  return (
    <div className="p-6">
      <Link
        href="/bejerman"
        className="text-sm text-blue-600 hover:underline mb-4 block"
      >
        ← Volver al ranking
      </Link>
      <DetalleArticuloClient detalle={detalle} />
    </div>
  );
}