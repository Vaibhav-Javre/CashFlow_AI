@echo off
echo ========================================================
echo Starting CashFlow AI (Backend + Frontend)
echo ========================================================
echo.

echo Starting Flask Backend API on http://localhost:5000...
start "CashFlow AI - Backend" cmd /k "cd /d %~dp0 && backend\venv\Scripts\python -m backend.app"

echo Starting React Frontend on http://localhost:5173...
start "CashFlow AI - Frontend" cmd /k "cd /d %~dp0frontend && npm run dev"

echo.
echo CashFlow AI is starting up!
echo - Backend API:  http://localhost:5000
echo - Frontend UI:  http://localhost:5173
echo.
pause
