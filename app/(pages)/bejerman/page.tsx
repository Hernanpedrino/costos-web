// app/(pages)/bejerman/page.tsx
import { getRankingArticulosAction } from "@/actions/bejerman"
import { RankingClient } from "@/components/bejerman/RankingClient";

export default async function BejermanPage() {
  const data = await getRankingArticulosAction({
    orden:   'facturacion',
    limite:  50,
    periodo: 'anio',
  });

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6">Estadísticas de Ventas</h1>
      <RankingClient data={data} />
    </div>
  );
}