@echo off
REM ============================================================
REM  NinyraWatermark Desktop - Polnaya sborka v .exe
REM  Zapuskat iz papki desktop/
REM  Rezultat: desktop\dist-electron\NinyraWatermark Setup.exe
REM             desktop\dist-electron\NinyraWatermark.exe (portable)
REM ============================================================

cd /d "%~dp0"

echo.
echo ==========================================
echo   NinyraWatermark - Desktop Build
echo ==========================================
echo.

REM ---- Python check ----
python --version >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Python not found. Install Python 3.11+.
    pause & exit /b 1
)

REM ---- Node.js check ----
node --version >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Node.js not found. Install Node.js 18+.
    pause & exit /b 1
)

echo [1/5] Installing Python dependencies...
pip install -r ..\backend\requirements.txt -q
pip install pyinstaller -q
echo.

echo [2/5] Building Python backend (backend.exe)...
if not exist "resources\backend" mkdir "resources\backend"

cd ..\backend
pyinstaller backend.spec --distpath "..\desktop\resources\backend" --workpath "..\desktop\build-tmp\pyinstaller" --noconfirm --clean
set PYI_ERR=%ERRORLEVEL%
cd ..\desktop

if %PYI_ERR% NEQ 0 (
    echo [ERROR] PyInstaller failed with code %PYI_ERR%
    pause & exit /b 1
)
echo [OK] backend.exe ready: resources\backend\backend.exe
echo.

echo [3/5] Installing Node.js dependencies...
call npm install --prefer-offline
REM npm returns non-zero for vulnerability warnings - that's OK, continue
echo.

echo [4/5] Building React frontend...
call npx vite build
set VITE_ERR=%ERRORLEVEL%
if %VITE_ERR% NEQ 0 (
    echo [ERROR] Vite build failed with code %VITE_ERR%
    pause & exit /b 1
)
echo [OK] Frontend built to dist/

REM Copy dist/ next to backend.exe so it can serve it when packaged
if not exist "resources\backend\dist" mkdir "resources\backend\dist"
xcopy /E /I /Y "dist\*" "resources\backend\dist\" >nul
echo [OK] dist/ copied to resources/backend/dist/
echo.

echo [5/5] Packaging Electron app (.exe installer)...
call npx electron-builder --win --x64
set EB_ERR=%ERRORLEVEL%
if %EB_ERR% NEQ 0 (
    echo [ERROR] electron-builder failed with code %EB_ERR%
    pause & exit /b 1
)

echo.
echo ==========================================
echo   BUILD COMPLETE!
echo ==========================================
echo.
echo   Installer: dist-electron\NinyraWatermark Setup.exe
echo   Portable:  dist-electron\NinyraWatermark.exe
echo.
pause
