import { getFormulasAction } from "@/actions/formulas";
import { getInsumosAction } from "@/actions/insumos";
import { NewFormulaForm } from "./newFormulaForm";
export const dynamic = 'force-dynamic'
export default async function NuevaFormulaPage() {
  const [insumos, formulas] = await Promise.all([
    getInsumosAction(),
    getFormulasAction(),
  ]);

  return (
    <div className="flex flex-col items-center justify-center mt-4">
      <NewFormulaForm
        listaInsumos={insumos}
        listaFormulas={formulas}
      />
    </div>
  );
}
