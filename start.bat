@echo off
echo Starting Outlet Audit...
echo.

:: Start backend
echo [1/2] Starting backend (port 8000)...
start "Backend" cmd /k "cd /d %~dp0backend && py -3 -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload"

:: Wait for backend
timeout /t 3 /nobreak >nul

:: Start frontend
echo [2/2] Starting frontend (port 5173)...
start "Frontend" cmd /k "cd /d %~dp0frontend && npm run dev"

timeout /t 4 /nobreak >nul
echo.
echo App running at: http://localhost:5173
start http://localhost:5173
