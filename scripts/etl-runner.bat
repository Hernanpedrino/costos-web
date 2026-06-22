@echo off
cd /d "C:\Users\Usuario\Documents\react\costos-web\costos-web"
echo [%date% %time%] Iniciando ETL Bejerman >> logs\etl.log
npx ts-node scripts/etl-bejerman.ts >> logs\etl.log 2>&1
echo [%date% %time%] ETL finalizado >> logs\etl.log
@echo off
cd /d "C:\Users\Usuario\Documents\react\costos-web\costos-web"
echo [%date% %time%] Iniciando ETL Bejerman >> logs\etl.log
npx ts-node scripts/etl-bejerman.ts >> logs\etl.log 2>&1
echo [%date% %time%] Iniciando ETL LILI >> logs\etl.log
npx ts-node scripts/etl-lili.ts >> logs\etl.log 2>&1
echo [%date% %time%] ETL finalizado >> logs\etl.log