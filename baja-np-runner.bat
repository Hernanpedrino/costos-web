@echo off
setlocal

REM ============================================================
REM  Baja automatica de NPs pendientes en Bejerman
REM  Crea el comprobante BP para las NPs del cliente 000001
REM  Se ejecuta todos los dias a las 06:30 por tarea programada
REM ============================================================

set PROYECTO=C:\Users\Usuario\Documents\react\costos-web\costos-web
set LOGDIR=%PROYECTO%\logs
set RUNLOG=%LOGDIR%\baja-np-runner.log

cd /d "%PROYECTO%"
if errorlevel 1 (
    echo No se pudo acceder a %PROYECTO%
    exit /b 1
)

if not exist "%LOGDIR%" mkdir "%LOGDIR%"

echo. >> "%RUNLOG%"
echo ============================================================ >> "%RUNLOG%"
echo INICIO %DATE% %TIME% >> "%RUNLOG%"
echo ============================================================ >> "%RUNLOG%"

REM Para probar sin insertar nada, agregar --dry-run a la linea siguiente
call npx tsx scripts\baja-np-automatico.ts >> "%RUNLOG%" 2>&1

set RESULTADO=%ERRORLEVEL%

if %RESULTADO% NEQ 0 (
    echo FIN CON ERRORES %DATE% %TIME% ^(codigo %RESULTADO%^) >> "%RUNLOG%"
) else (
    echo FIN OK %DATE% %TIME% >> "%RUNLOG%"
)

endlocal & exit /b %RESULTADO%