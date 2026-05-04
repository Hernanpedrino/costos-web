
import { getInsumosAction } from "@/actions/Insumos";
import { NewFormulaForm } from "./newFormulaForm";

type DataInsumos = {
  name: string;
  id: string;
  suplier: string;
  price: number;
  createdAt: Date;
  updatedAt: Date;
} 

async function getData(): Promise<DataInsumos[]> {
  const response = await getInsumosAction();
  return response;
}

export default async function () {
  const data = await getData();
  return (
    <div className="flex flex-col items-center justify-center mt-4">
      <NewFormulaForm listaInsumosDB={data}  />
    </div>
  )
}