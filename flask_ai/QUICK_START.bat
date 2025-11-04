@echo off
echo ========================================
echo    تشغيل زحل AI الذكي
echo ========================================
echo.

echo [1/3] تثبيت المتطلبات...
pip install -r requirements.txt

echo.
echo [2/3] تشغيل الخادم...
echo الخادم سيعمل على: http://localhost:3001
echo.

python server.py

pause

