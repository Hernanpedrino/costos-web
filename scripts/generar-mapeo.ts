// scripts/generar-mapeo.ts
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

async function generarMapeo() {
  console.log('🔄 Generando mapeo LILI → CANE...\n');

  // Traer todos los artículos de ambas bases
  const [artsCane, artsLili] = await Promise.all([
    prisma.bejArticulo.findMany({ select: { codigo: true, descripcion: true } }),
    prisma.liliArticulo.findMany({ select: { codigo: true, descripcion: true } }),
  ]);

  const caneMap = new Map(artsCane.map(a => [a.codigo, a.descripcion.trim().toLowerCase()]));
  const caneDescMap = new Map(artsCane.map(a => [a.descripcion.trim().toLowerCase(), a.codigo]));

  let coincidenCodigo   = 0;
  let coincidencDesc    = 0;
  let sinCoincidencia   = 0;
  const mapeos: { codigoLili: string; codigoCane: string; verificado: boolean }[] = [];
  const sinMatch: { codigo: string; descripcion: string }[] = [];

  for (const lili of artsLili) {
    const descLili = lili.descripcion.trim().toLowerCase();

    // 1. Coincidencia exacta por código
    if (caneMap.has(lili.codigo)) {
      mapeos.push({ codigoLili: lili.codigo, codigoCane: lili.codigo, verificado: true });
      coincidenCodigo++;
      continue;
    }

    // 2. Coincidencia exacta por descripción
    if (caneDescMap.has(descLili)) {
      mapeos.push({ 
        codigoLili: lili.codigo, 
        codigoCane: caneDescMap.get(descLili)!, 
        verificado: false  // requiere revisión manual
      });
      coincidencDesc++;
      continue;
    }

    sinCoincidencia++;
    sinMatch.push({ codigo: lili.codigo, descripcion: lili.descripcion });
  }

  // Insertar mapeos en la base
  await prisma.bejArticuloMapeo.deleteMany();
  if (mapeos.length > 0) {
    await prisma.bejArticuloMapeo.createMany({
      data: mapeos,
      skipDuplicates: true,
    });
  }

  console.log(`✅ Coincidencia por código:      ${coincidenCodigo}`);
  console.log(`🔍 Coincidencia por descripción: ${coincidencDesc} (requieren revisión)`);
  console.log(`❌ Sin coincidencia:             ${sinCoincidencia}`);
  console.log(`\nTotal mapeados: ${mapeos.length} / ${artsLili.length}`);

  if (sinMatch.length > 0) {
    console.log('\n📋 Sin coincidencia (primeros 20):');
    sinMatch.slice(0, 20).forEach(a => {
      console.log(`  ${a.codigo.padEnd(20)} ${a.descripcion}`);
    });
  }

  await prisma.$disconnect();
}

generarMapeo();
export {};