# 🚀 Запуск NinyraWatermark локально

## Требования
- Python 3.10+
- pip

---

## Установка и запуск (3 команды)

```bash
# 1. Перейти в папку с проектом
cd e:\PROjECTS\Sites\Link\NinyMark

# 2. Установить зависимости (один раз)
pip install -r backend/requirements.txt
pip install flask

# 3. Запустить backend
python -m backend.app
```

Потом открываешь браузер: **http://localhost:8765**

---

## Что есть в интерфейсе

### Быстрая работа (Fast Manual Mode)
1. **Загрузи** кадры — drag & drop или кнопка (до 100 штук)
2. **Нажми** "Apply Watermark" / "Process N Images"
3. **Включи** "Drag to reposition watermark" в Settings → Position Mode
4. **Кликни** на картинку — вотермарка прыгает туда
5. **Навигация**:
   - `←` / `→` — предыдущий / следующий кадр
   - `Shift + →` — скопировать текущую позицию на следующий кадр и перейти
   - 🖱 **Колесо мыши** на картинке — изменить размер вотермарки
6. **Сохранить**: кнопка "Save" или "Download All" (ZIP)

### Умные иконки (авто-определение по тексту)
- Введи `t.me/channel` → появится иконка **Telegram**
- Введи `youtube.com/channel` → появится иконка **YouTube**
- Всё остальное → иконка **Patreon**

---

## Если что-то не работает

**Backend Offline** в шапке?
```bash
# Проверь что Python и Flask установлены
pip install flask pillow opencv-python numpy
python backend/app.py
```

**Mediapipe** (для AI определения лиц, необязательно):
```bash
pip install mediapipe
```

**Перезапуск** — просто `Ctrl+C` в терминале и `python backend/app.py` снова.
