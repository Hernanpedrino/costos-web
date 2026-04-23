import { inputs } from "@/generated/prisma/client";


export const createInput = async (name: string, suplier: string, price: string): Promise<inputs> => {
  const body = { name, suplier, price };
  const input = await fetch(`/api/insumos`, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: {
      'Content-Type': 'aplication/json'
    }
  }).then(resp => resp.json());
  console.log({ input });
  return input;
}

