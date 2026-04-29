import { prisma } from "@/lib/prisma";
import { NewFormulaForm } from "./newFormulaForm";

type DataInsumos = {
  name: string;
  id: string;
  suplier: string;
  price: string;
  createdAt: Date;
  updatedAt: Date;
} 

async function getData(): Promise<DataInsumos[]> {
  const response = await prisma.inputs.findMany({
    orderBy: { name: "asc" }
  });
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