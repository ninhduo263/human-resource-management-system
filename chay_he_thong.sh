#!/usr/bin/env bash
set -e

cd "$(dirname "$0")"

echo "=============================================================="
echo "  PEOPLEOPS - HE THONG QUAN LY NHAN SU NHOM 16 (DOCKER)"
echo "  Stack: PostgreSQL 16 + Node.js (Express/TS) + React (Vite)"
echo "=============================================================="
echo ""

if ! docker info >/dev/null 2>&1; then
  echo "[!] Docker Desktop chua duoc bat tren may."
  echo "Vui long mo ung dung Docker Desktop, doi khoi dong xong roi chay lai."
  exit 1
fi

echo "[*] Dang khoi dong cac container (db, backend, frontend)..."
if docker compose version >/dev/null 2>&1; then
  docker compose up --build -d
else
  docker-compose up --build -d
fi

echo ""
echo "[OK] He thong da khoi dong thanh cong!"
echo " - Giao dien Web (Frontend): http://localhost:3000"
echo " - API Server (Backend):     http://localhost:5000/api/health"
echo " - PostgreSQL Database:      localhost:5432"
echo " - Tai khoan mau:            admin / Demo@12345"
echo ""
