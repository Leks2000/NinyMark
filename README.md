# NinyraWatermark

Smart watermark placement tool for anime/AI-generated images.  
Intelligently detects empty zones via 3×3 grid analysis and places a branded `patreon.com/Ninyra` watermark.

---

## Структура репозитория

```
NinyMark/
├── web/         # 🌐 Веб-версия (Vite + React, открывается в браузере)
├── desktop/     # 🖥️ Desktop EXE (Electron + PyInstaller, кликай и работай)
├── backend/     # 🐍 Общий Python FastAPI (используется обеими версиями)
└── assets/      # 🎨 Иконки, шрифты
```

---

## 🌐 Веб-версия

```bash
cd web
npm install
pip install -r ../backend/requirements.txt
npm run start          # Запускает всё сразу
# → http://localhost:3000
```

---

## 🖥️ Desktop EXE

### Разработка (dev режим)

```bash
pip install -r backend/requirements.txt
cd desktop && npm install

# Terminal 1:
cd backend && uvicorn main:app --host 127.0.0.1 --port 8765

# Terminal 2:
cd desktop && npx electron .
```

### Сборка EXE (один раз, результат раздаёшь всем)

```bash
cd desktop
build.bat
# → desktop/dist-electron/NinyraWatermark Setup.exe  (установщик)
# → desktop/dist-electron/NinyraWatermark.exe        (portable)
```

> Пользователю на машине **ничего устанавливать не нужно** — Python внутри.

---

## Features

- **Smart Zone Detection** — 3×3 grid analysis, автовыбор пустого места
- **3 стиля водяного знака** — Text / Icon+Text / Branded Block
- **Batch Processing** — до 100 изображений параллельно
- **Before/After Preview** — сравнение с зумом
- **Пресеты** — IG Post, Patreon R18, TikTok
- **Dark Theme** — оптимизирован для контент-мейкеров
- **Keyboard Shortcuts** — Ctrl+O, Ctrl+Shift+B

## Tech Stack

| | Web | Desktop |
|---|---|---|
| **Frontend** | React 18, TypeScript, Tailwind, Framer Motion | То же самое |
| **Backend** | Python 3.11+, FastAPI, Pillow, NumPy | То же самое (в EXE) |
| **Shell** | Браузер | Electron 33 |
| **Packaging** | Vite → static files | PyInstaller + electron-builder |

## License

Private — NinyraWatermark © Ninyra
