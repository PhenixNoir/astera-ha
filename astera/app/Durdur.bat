@echo off
rem Arka planda calisan Astera sunucusunu durdurur.
for /f "tokens=5" %%p in ('netstat -ano ^| findstr ":8080" ^| findstr "LISTENING"') do taskkill /PID %%p /F
echo Astera durduruldu.
timeout /t 2 >nul
