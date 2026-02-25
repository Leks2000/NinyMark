# Project Rules — Ninyra Watermark

## Stack (не менять без причины)
- **Backend:** Python 3.10+, PIL/Pillow, OpenCV, Flask
- **Frontend:** Vanilla JS, no frameworks, no bundlers
- **Styling:** CSS custom properties (variables), no Tailwind, no Bootstrap
- **Deps:** добавлять только если нет встроенного решения. Каждая новая зависимость — в `requirements.txt` с комментарием зачем

---

## Python — правила

**Структура файлов:**
```
backend/
  app.py          ← Flask роуты только, без бизнес-логики
  watermark.py    ← вся логика наложения watermark
  ai_detection.py ← MediaPipe, зонирование
  fonts.py        ← работа со шрифтами
  steganography.py← invisible watermark
  utils.py        ← общие хелперы
```

**Стиль:**
- Функции — snake_case, классы — PascalCase
- Каждая функция делает ОДНО дело
- Максимум 40 строк на функцию — если больше, разбей
- Type hints обязательны для всех параметров и return
- Docstring для каждой публичной функции (одна строка)

```python
# ✅ правильно
def apply_watermark(image: Image.Image, text: str, opacity: float = 0.5) -> Image.Image:
    """Apply text watermark to image and return result."""
    ...

# ❌ неправильно
def do_stuff(img, t, o=0.5):
    ...
```

**Ошибки:**
- Никогда не глотать исключения молча — минимум `logger.error`
- API всегда возвращает `{ "success": bool, "error": str | null, "data": any }`
- Пользователю — понятное сообщение, в лог — полный traceback

```python
# ✅ правильно
try:
    font = ImageFont.truetype(path, size)
except OSError as e:
    logger.error(f"Font load failed: {path} — {e}")
    return error_response("Файл шрифта повреждён или не поддерживается")
```

**Конфиг:**
- Все пути через `pathlib.Path`, не `os.path.join`
- Все константы в `config.py`, не разбросаны по коду
- Секреты и пути — через env переменные или `~/.ninyrawatermark/config.json`

---

## JavaScript — правила

**Структура:**
```
frontend/
  js/
    app.js        ← инициализация, точка входа
    preview.js    ← логика preview canvas
    settings.js   ← управление настройками, undo/redo
    upload.js     ← загрузка файлов
    api.js        ← все fetch запросы к backend
    ui.js         ← toast, модалки, утилиты UI
```

**Стиль:**
- `const` по умолчанию, `let` только если переменная меняется, `var` — никогда
- Async/await, не `.then()` цепочки
- Все API вызовы только через `api.js` — не писать `fetch` прямо в обработчиках
- Имена: camelCase для переменных/функций, UPPER_SNAKE для констант

```javascript
// ✅ правильно
const MAX_FONT_SIZE = 200;

async function applyWatermark(settings) {
  const result = await api.preview(settings);
  if (!result.success) {
    ui.showToast(result.error, 'error');
    return;
  }
  preview.update(result.data.image);
}

// ❌ неправильно
var maxSize = 200;
api.preview(settings).then(r => { ... }).catch(e => { ... });
```

**DOM:**
- Все элементы кэшировать при инициализации, не делать `querySelector` в loop
- Data-атрибуты для JS-хуков (`data-action`, `data-target`), не CSS классы
- CSS классы только для стилей, не для JS логики

---

## CSS — правила

**Переменные:**
```css
/* все цвета, размеры, тени — через переменные */
:root {
  --color-bg: #1a1a2e;
  --color-surface: #16213e;
  --color-accent: #e94560;
  --radius-md: 8px;
  --transition-fast: 150ms ease;
}
```

- BEM-подобные классы: `.settings-panel__item--active`
- Никаких `!important`
- Анимации только через `transition` или `@keyframes`, не JS style manipulation
- Mobile-first media queries

---

## API — контракт

Все эндпоинты:
```
POST /api/preview      ← вернуть base64 превью
POST /api/export       ← вернуть файл
POST /api/fonts/upload ← загрузить шрифт
GET  /api/fonts        ← список шрифтов
POST /api/verify       ← проверить invisible watermark
```

Формат ответа всегда:
```json
{
  "success": true,
  "data": { ... },
  "error": null
}
```

Коды ошибок:
- `400` — неверные параметры (объяснить что именно)
- `422` — файл не прошёл валидацию
- `500` — внутренняя ошибка (не показывать traceback пользователю)

---

## Git — правила

**Коммиты** (conventional commits):
```
feat: add drag-and-drop watermark repositioning
fix: font upload crashes on corrupted ttf file
refactor: split watermark.py into modules
docs: update README with new features
```

**Ветки:**
```
main          ← только рабочий код
dev           ← текущая разработка
feature/...   ← новые фичи
fix/...       ← баги
```

- Не коммитить `*.pyc`, `__pycache__`, `.env`, загруженные шрифты
- `.gitignore` обязателен с первого коммита

---

## Работа с ИИ — правила промптов

Когда просишь ИИ написать код для этого проекта — всегда добавляй:

```
Контекст: Python Flask backend + Vanilla JS frontend.
Стиль: type hints, одна функция = одно действие, max 40 строк.
API response format: { "success": bool, "data": any, "error": str|null }
Не использовать: var, jQuery, os.path, голые except.
```

При добавлении фичи — сначала описывай **что** нужно сделать, потом **как** это вписывается в существующую структуру.

---

## Чеклист перед тем как считать фичу готовой

- [ ] Функция имеет type hints и docstring
- [ ] Ошибки обрабатываются и логируются
- [ ] API возвращает правильный формат
- [ ] Новая зависимость добавлена в `requirements.txt`
- [ ] Нет `console.log` и `print` оставленных для дебага
- [ ] Работает если MediaPipe / invisible-watermark не установлен (graceful degradation)
