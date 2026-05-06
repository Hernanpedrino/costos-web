
import { getFormulasAction } from "@/actions/formulas";
import { DataTable } from "./data-table";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { columns } from "./colums";
export const dynamic = 'force-dynamic'


export default async function FormulasPage() {
  const formulas = await getFormulasAction();

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

      {formulas.map((formula) => (
        <div className="p-10 w-3/4" key={formula.id}>
          <DataTable
            columns={columns}
            data={formula.items}
            title={formula.name}
            precioTotal={formula.precioTotal}
          />
        </div>
      ))}
    </div>
  );
}

// TODO: FAB para volver al inicio de la página
