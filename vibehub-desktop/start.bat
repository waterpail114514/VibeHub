@echo off
chcp 65001 >nul
title VibeHub Desktop
cd /d "%~dp0"
start "" npx electron .
