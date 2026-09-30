@echo off
echo ========================================
echo   Starting CrushCar Project
echo ========================================
echo.

echo [1/4] Installing dependencies...
call npm install
if %errorlevel% neq 0 (
    echo ERROR: npm install failed!
    pause
    exit /b 1
)
echo.

echo [2/4] Generating Prisma client...
call npm run db:generate
if %errorlevel% neq 0 (
    echo ERROR: Prisma generate failed!
    pause
    exit /b 1
)
echo.

echo [3/4] Pushing database schema...
call npm run db:push
if %errorlevel% neq 0 (
    echo WARNING: Prisma push failed. Database may need setup.
    echo.
)
echo.

echo [4/4] Starting development server...
echo.
echo App will be available at: http://localhost:3000
echo Press Ctrl+C to stop the server
echo ========================================
echo.
call npm run dev
