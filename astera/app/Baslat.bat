@echo off
chcp 65001 >nul
title Astera Management
cd /d "%~dp0"

set PY=
where py >nul 2>nul && set PY=py -3
if not defined PY where python >nul 2>nul && set PY=python
if not defined PY goto nopython

start "" http://localhost:8080
%PY% server.py --port 8080
pause
exit /b 0

:nopython
echo.
echo  Python bulunamadi.
echo  https://www.python.org/downloads/ adresinden Python 3 kurun.
echo  Kurulumda "Add python.exe to PATH" kutusunu isaretlemeyi unutmayin.
echo.
pause
exit /b 1
