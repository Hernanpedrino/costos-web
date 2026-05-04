
import { getFormulasAction } from "@/actions/Formulas";
import { getInsumosAction } from "@/actions/Insumos";
import { NewFormulaForm } from "./newFormulaForm";

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
