# NinyraWatermark — Desktop Version

Полноценное desktop-приложение. Запускается двойным кликом — ничего отдельно запускать не нужно.

## Быстрый старт (разработка)

```bash
# 1. Python deps (один раз)
pip install -r ../backend/requirements.txt

# 2. Node deps (один раз)
npm install

# 3. Запустить Python backend в отдельном терминале
cd ../backend && uvicorn main:app --host 127.0.0.1 --port 8765

# 4. Запустить Electron
npx electron .
```

## Сборка EXE (для дистрибуции)

```bash
# Всё в одной команде:
build.bat
```

Что происходит внутри `build.bat`:
1. **PyInstaller** упаковывает Python backend → `backend.exe`
2. **Vite** собирает React frontend → `dist/`
3. **electron-builder** создаёт установщик:
   - `dist-electron/NinyraWatermark Setup.exe` — установщик
   - `dist-electron/NinyraWatermark.exe` — portable (без установки)

## Как работает EXE

```
Пользователь кликает NinyraWatermark.exe
         ↓
Electron показывает загрузочный экран
         ↓
Electron запускает backend.exe (в фоне, без консоли)
         ↓
Electron делает polling /health каждые 500ms
         ↓
Когда backend готов → открывает окно приложения
         ↓
При закрытии окна → Electron убивает backend.exe
```

## Требования для сборки

- Python 3.11+
- Node.js 18+
- `pip install pyinstaller`

**На целевой машине ничего дополнительно не требуется** — Python внутри EXE.

## Структура

```
desktop/
├── electron/
│   ├── main.js         # Electron main process
│   └── preload.js      # IPC bridge
├── src/                # React компоненты (общие с web/)
├── resources/
│   └── backend/
│       ├── backend.exe   # PyInstaller bundle (создаётся при build)
│       └── dist/         # React build (копируется при build)
├── dist/               # Vite output
├── dist-electron/      # Финальный .exe (создаётся при build)
├── build-resources/    # Иконки для installer
├── vite.config.ts
├── package.json
├── build.bat           # Сборка Windows
└── build.sh            # Сборка macOS/Linux
```
