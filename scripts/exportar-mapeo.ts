import "dotenv/config";
import * as XLSX from 'xlsx';
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

async function exportar() {
  console.log('📊 Generando Excel de mapeo...');

  const [artsCane, artsLili, mapeos] = await Promise.all([
    prisma.bejArticulo.findMany({ select: { codigo: true, descripcion: true } }),
    prisma.liliArticulo.findMany({ select: { codigo: true, descripcion: true } }),
    prisma.bejArticuloMapeo.findMany({ where: { verificado: false } }),
  ]);

  const liliMap  = new Map(artsLili.map(a => [a.codigo, a.descripcion]));
  const caneMap  = new Map(artsCane.map(a => [a.codigo, a.descripcion]));

  // Hoja 1 — Candidatos por descripción (requieren revisión)
  const hojaCandidatos = mapeos.map(m => ({
    'Código LILI':    m.codigoLili,
    'Descripción LILI': liliMap.get(m.codigoLili) ?? '',
    'Código CANE':    m.codigoCane,
    'Descripción CANE': caneMap.get(m.codigoCane) ?? '',
    '¿Es el mismo? (SI/NO)': '',  // columna para completar
  }));

  // Hoja 2 — Mapeados por código (ya verificados)
  const mapeadosCodigo = await prisma.bejArticuloMapeo.findMany({
    where: { verificado: true }
  });
  const hojaVerificados = mapeadosCodigo.map(m => ({
    'Código LILI':      m.codigoLili,
    'Descripción LILI': liliMap.get(m.codigoLili) ?? '',
    'Código CANE':      m.codigoCane,
    'Descripción CANE': caneMap.get(m.codigoCane) ?? '',
    'Estado':           'Verificado automáticamente',
  }));

  // Hoja 3 — Sin coincidencia (solo en LILI)
  const codigosConMapeo = new Set([
    ...mapeos.map(m => m.codigoLili),
    ...mapeadosCodigo.map(m => m.codigoLili),
  ]);
  const sinCoincidencia = artsLili
    .filter(a => !codigosConMapeo.has(a.codigo))
    .map(a => ({
      'Código LILI':      a.codigo,
      'Descripción LILI': a.descripcion,
      'Nota':             'Solo existe en LILI',
    }));

  // Generar Excel
  const wb = XLSX.utils.book_new();

  const ws1 = XLSX.utils.json_to_sheet(hojaCandidatos);
  ws1['!cols'] = [
    { wch: 15 }, { wch: 50 }, { wch: 15 }, { wch: 50 }, { wch: 20 }
  ];
  XLSX.utils.book_append_sheet(wb, ws1, 'Para Revisar');

  const ws2 = XLSX.utils.json_to_sheet(hojaVerificados);
  ws2['!cols'] = [
    { wch: 15 }, { wch: 50 }, { wch: 15 }, { wch: 50 }, { wch: 30 }
  ];
  XLSX.utils.book_append_sheet(wb, ws2, 'Verificados');

  const ws3 = XLSX.utils.json_to_sheet(sinCoincidencia);
  ws3['!cols'] = [
    { wch: 15 }, { wch: 50 }, { wch: 25 }
  ];
  XLSX.utils.book_append_sheet(wb, ws3, 'Solo en LILI');

  const path = 'logs/mapeo-articulos.xlsx';
  XLSX.writeFile(wb, path);

  console.log(`\n✅ Excel generado: ${path}`);
  console.log(`   📋 Para Revisar:  ${hojaCandidatos.length} artículos`);
  console.log(`   ✅ Verificados:   ${hojaVerificados.length} artículos`);
  console.log(`   ❌ Solo en LILI:  ${sinCoincidencia.length} artículos`);

  await prisma.$disconnect();
}

exportar();
export {};