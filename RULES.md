# RULES.md — NinyraWatermark Project
## Обязательные правила для AI-разработчика

---

## ОБЩИЕ ПРАВИЛА

### R1 — Пиши весь код, не заглушки
- Никаких `// TODO: implement later`
- Никаких `pass` в Python без реализации
- Каждая функция должна быть полностью рабочей

### R2 — Типизация строго
- TypeScript: никаких `any`, используй `unknown` если тип не известен
- Python: все функции с type hints (Python 3.11+)
- Интерфейсы и типы определяй в отдельных файлах `types.ts` / `types.py`

### R3 — Обработка ошибок везде
- Каждый API endpoint оборачивай в try/except
- Frontend показывает понятные сообщения об ошибках пользователю
- Логируй ошибки в файл `~/.ninyrawatermark/logs/app.log`

### R4 — Не изменяй оригиналы
- Исходные файлы ТОЛЬКО для чтения
- Все результаты в `/output` папку рядом с оригиналами
- Перед записью проверяй что output path != input path

---

## АЛГОРИТМ УМНОГО РАЗМЕЩЕНИЯ

### R5 — Zone Detection обязателен
```python
# ПРАВИЛЬНО:
def detect_best_zone(image: np.ndarray) -> tuple[int, int]:
    # 1. Конвертируй в grayscale
    # 2. Раздели на 3x3 = 9 зон
    # 3. Посчитай std для каждой
    # 4. Исключи центр (индекс 4)
    # 5. Верни координаты зоны с min(std)

# НЕПРАВИЛЬНО:
def detect_best_zone(image):
    return (image.width - 100, image.height - 20)  # всегда один угол — запрещено
```

### R6 — Fallback логика
- Если разница между лучшей и худшей зоной < 15 единиц → используй правый нижний угол
- Если изображение меньше 300x300px → принудительно правый нижний угол с минимальным отступом

---

## ПРОИЗВОДИТЕЛЬНОСТЬ

### R7 — Batch обработка асинхронно
- Используй `asyncio` + `ThreadPoolExecutor` для параллельной обработки
- Максимум 4 потока одновременно (не перегружай CPU)
- Каждые 100ms отправляй прогресс на frontend через SSE или WebSocket

### R8 — Размер watermark адаптивный
```python
SIZES = {
    'S': 0.08,  # 8% от ширины изображения
    'M': 0.12,  # 12%
    'L': 0.18,  # 18%
}
watermark_width = int(image.width * SIZES[size])
```

---

## UI ПРАВИЛА

### R9 — Тёмная тема по умолчанию
- Background: `#0F0F0F` или `#111111`
- Cards: `#1A1A1A`
- Accent: `#FF424D` (Patreon red) или `#6366F1` (indigo)
- Text: `#FFFFFF` primary, `#A1A1AA` secondary

### R10 — Drag & Drop зона
- При перетаскивании файлов — визуальный highlight зоны
- Принимай: .png, .jpg, .jpeg, .webp
- Отклоняй другие форматы с сообщением об ошибке

### R11 — Превью обязательно
- После обработки показывай before/after
- Для batch: сетка миниатюр 4 колонки
- Кликабельные миниатюры для просмотра полного размера

---

## ФАЙЛОВАЯ СТРУКТУРА

### R12 — Не мешай файлы
```
backend/        # только Python
src/            # только React/TS
src-tauri/      # только Rust/Tauri конфиг
assets/         # только статика (иконки, шрифты)
```

### R13 — Конфиги и пресеты
- Путь конфига: `~/.ninyrawatermark/config.json`
- Путь пресетов: `~/.ninyrawatermark/presets.json`
- Создавай эти папки автоматически при первом запуске

---

## СБОРКА И ЗАПУСК

### R14 — README с 3 командами
```bash
# Должно работать так:
npm install
pip install -r requirements.txt
npm run dev        # или tauri dev
```

### R15 — Python backend автозапуск
- При старте Tauri/Electron — автоматически запускай `uvicorn backend.main:app --port 8765`
- Проверяй health check `/health` перед показом UI
- Если порт занят — используй следующий свободный (8766, 8767...)

---

## ЗАПРЕЩЕНО

- ❌ Хардкодить абсолютные пути (используй `pathlib.Path.home()`)
- ❌ Блокирующие операции в main thread
- ❌ Логировать base64 изображений (только имена файлов)
- ❌ `console.log` в production сборке
- ❌ `print()` в Python без использования `logging`
- ❌ Изменять оригинальные файлы
- ❌ Внешние API вызовы любого рода
- ❌ `any` тип в TypeScript

---

## ПРИОРИТЕТ ЗАДАЧ

Реализуй в таком порядке:
1. `zone_detector.py` — алгоритм анализа зон (CORE)
2. `watermark.py` — наложение watermark всех 3 стилей
3. `backend/main.py` — FastAPI с /process/single и /process/batch
4. React компоненты: DropZone → Preview → Settings
5. Tauri интеграция и упаковка

---

*Версия правил: 1.0 | Проект: NinyraWatermark*
