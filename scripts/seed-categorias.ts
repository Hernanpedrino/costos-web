import "dotenv/config";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaClient } from '../generated/prisma/client.js';

const adapter = new PrismaMariaDb({
  host:            "localhost",
  port:            3306,
  connectionLimit: 5,
  database:        process.env.DATABASE_NAME,
  user:            process.env.DATABASE_USER,
  password:        process.env.DATABASE_PASSWORD,
});
const prisma = new PrismaClient({ adapter });

const categorias = [
  // Fijos
  { nombre: 'Sueldos y cargas sociales', tipo: 'FIJO',     orden: 1 },
  { nombre: 'Alquiler',                  tipo: 'FIJO',     orden: 2 },
  { nombre: 'Electricidad',              tipo: 'FIJO',     orden: 3 },
  { nombre: 'Gas',                       tipo: 'FIJO',     orden: 4 },
  { nombre: 'Internet y telefonía',      tipo: 'FIJO',     orden: 5 },
  { nombre: 'Seguros',                   tipo: 'FIJO',     orden: 6 },
  { nombre: 'Amortizaciones',            tipo: 'FIJO',     orden: 7 },
  // Variables
  { nombre: 'Fletes y logística',        tipo: 'VARIABLE', orden: 8 },
  { nombre: 'Comisiones vendedores',     tipo: 'VARIABLE', orden: 9 },
  { nombre: 'Mantenimiento',             tipo: 'VARIABLE', orden: 10 },
  { nombre: 'Impuestos y tasas',         tipo: 'VARIABLE', orden: 11 },
  { nombre: 'Gastos bancarios',          tipo: 'VARIABLE', orden: 12 },
  { nombre: 'Otros',                     tipo: 'VARIABLE', orden: 13 },
] as const;

async function seed() {
  console.log('🌱 Cargando categorías de costos...');
  for (const cat of categorias) {
    await prisma.costoCategoria.upsert({
      where:  { nombre: cat.nombre },
      update: {},
      create: { nombre: cat.nombre, tipo: cat.tipo, orden: cat.orden },
    });
    console.log(`  ✅ ${cat.nombre}`);
  }
  console.log('\n✅ Categorías cargadas');
  await prisma.$disconnect();
}

seed();
export {};