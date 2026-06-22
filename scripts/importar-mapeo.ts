import "dotenv/config";
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const XLSX = require('xlsx');
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

async function importar() {
  console.log('📥 Importando mapeo desde Excel...\n');

  const wb   = XLSX.readFile('logs/mapeo-articulos.xlsx');
  const ws   = wb.Sheets['Para Revisar'];
  const rows = XLSX.utils.sheet_to_json(ws) as any[];

  const aprobados  = rows.filter(r => r['¿Es el mismo? (SI/NO)']?.toString().trim().toUpperCase() === 'SI');
  const rechazados = rows.filter(r => r['¿Es el mismo? (SI/NO)']?.toString().trim().toUpperCase() === 'NO');
  const pendientes = rows.filter(r => !r['¿Es el mismo? (SI/NO)']?.toString().trim());

  console.log(`  ✅ Aprobados:  ${aprobados.length}`);
  console.log(`  ❌ Rechazados: ${rechazados.length}`);
  console.log(`  ⏳ Pendientes: ${pendientes.length}\n`);

  // Aprobados → marcar como verificados
  if (aprobados.length > 0) {
    await Promise.all(aprobados.map((r: any) =>
      prisma.bejArticuloMapeo.updateMany({
        where: { codigoLili: r['Código LILI'] },
        data:  { verificado: true }
      })
    ));
    console.log(`✅ ${aprobados.length} mapeos verificados`);
  }

  // Rechazados → eliminar del mapeo
  if (rechazados.length > 0) {
    await prisma.bejArticuloMapeo.deleteMany({
      where: {
        codigoLili: { in: rechazados.map((r: any) => r['Código LILI']) }
      }
    });
    console.log(`🗑️  ${rechazados.length} mapeos eliminados`);
  }

  // Resumen final
  const totalVerificados = await prisma.bejArticuloMapeo.count({
    where: { verificado: true }
  });
  const totalPendientes = await prisma.bejArticuloMapeo.count({
    where: { verificado: false }
  });

  console.log(`\n📊 Estado del mapeo:`);
  console.log(`   Verificados: ${totalVerificados}`);
  console.log(`   Pendientes:  ${totalPendientes}`);

  await prisma.$disconnect();
}

importar();
export {};