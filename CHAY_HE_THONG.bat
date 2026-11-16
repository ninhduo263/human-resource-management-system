@echo off
chcp 65001 >nul
title PeopleOps HRMS - Nhom 16 (Docker)
cd /d "%~dp0"

echo ==============================================================
echo   PEOPLEOPS - HE THONG QUAN LY NHAN SU NHOM 16 (DOCKER)
echo   Stack: PostgreSQL 16 + Node.js (Express/TS) + React (Vite)
echo ==============================================================
echo.

docker info >nul 2>&1
if %errorlevel% neq 0 (
  echo [!] Docker Desktop chua duoc bat tren may.
  echo Vui long mo ung dung Docker Desktop, doi khoi dong xong roi chay lai file nay.
  pause
  exit /b 1
)

echo [*] Dang khoi dong cac container (db, backend, frontend)...
docker-compose up --build -d
if %errorlevel% neq 0 (
  docker compose up --build -d
)

echo.
echo [OK] He thong da khoi dong thanh cong!
echo  - Giao dien Web (Frontend): http://localhost:3000
echo  - API Server (Backend):     http://localhost:5000/api/health
echo  - PostgreSQL Database:      localhost:5432
echo  - Tai khoan mau:            admin / Demo@12345
echo.
pause
