@echo off
chcp 65001 >nul 2>&1
title CrushCar - منصة حجز المقاعد
color 0A
cd /d "%~dp0"

echo.
echo  ==========================================
echo       CrushCar - منصة حجز المقاعد
echo  ==========================================
echo.
echo  [1] بدء السيرفر...
echo  [2] قاعدة البيانات: SQLite
echo  [3] الرابط: http://localhost:3000
echo.
echo  الحسابات التجريبية:
echo    مدير: admin@cairoexpress.com / admin123
echo    مستخدم: user@example.com / user123
echo.
echo  ==========================================
echo.

start http://localhost:3000
npm run dev

pause