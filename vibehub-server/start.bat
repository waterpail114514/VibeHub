@echo off
chcp 65001 >nul
title VibeHub Server
cd /d "%~dp0"

echo ╔══════════════════════════════════════╗
echo ║     🔮  VibeHub Server v1.1          ║
echo ╚══════════════════════════════════════╝
echo.

node src/index.js

echo.
echo Server stopped.
pause
