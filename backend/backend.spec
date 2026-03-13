# -*- mode: python ; coding: utf-8 -*-
"""
PyInstaller spec for NinyraWatermark backend.
Bundles Python + FastAPI + Pillow + NumPy into backend.exe

Usage:
    pyinstaller backend.spec

Output: desktop/resources/backend/backend.exe
"""

import sys
from pathlib import Path

block_cipher = None

# Root of the project (parent of backend/)
ROOT = Path(SPECPATH).parent

a = Analysis(
    ['backend_entry.py'],
    pathex=[
        str(ROOT / 'backend'),
        str(ROOT),
    ],
    binaries=[],
    datas=[
        # Include the Patreon icon asset
        (str(ROOT / 'assets'), 'assets'),
        # Include the MediaPipe face detection model
        (str(ROOT / 'backend' / 'blaze_face_short_range.tflite'), 'backend'),
    ],
    hiddenimports=[
        # FastAPI / Starlette internal imports that PyInstaller misses
        'uvicorn',
        'uvicorn.logging',
        'uvicorn.loops',
        'uvicorn.loops.auto',
        'uvicorn.protocols',
        'uvicorn.protocols.http',
        'uvicorn.protocols.http.auto',
        'uvicorn.protocols.websockets',
        'uvicorn.protocols.websockets.auto',
        'uvicorn.lifespan',
        'uvicorn.lifespan.on',
        'fastapi',
        'fastapi.responses',
        'fastapi.staticfiles',
        'pydantic',
        'pydantic.deprecated.class_validators',
        'pydantic_core',
        'starlette',
        'starlette.routing',
        'starlette.middleware',
        'starlette.staticfiles',
        'starlette.responses',
        'starlette.templating',
        'anyio',
        'anyio._backends._asyncio',
        'PIL',
        'PIL.Image',
        'PIL.ImageDraw',
        'PIL.ImageFont',
        'PIL.ImageFilter',
        'numpy',
        'numpy.core',
        # Backend modules
        'backend',
        'backend.main',
        'backend.watermark',
        'backend.zone_detector',
        'backend.wm_types',
        'backend.ai_detection',
        # MediaPipe and its deps
        'mediapipe',
        'mediapipe.python',
        'mediapipe.python.solutions',
        'mediapipe.python.solutions.face_detection',
        # Standard lib
        'email',
        'email.mime',
        'email.mime.text',
        'multipart',
        'python_multipart',
    ],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[
        'tkinter',
        'matplotlib',
        'scipy',
        'pandas',
        'IPython',
        'jupyter',
        'cv2',  # We use Pillow, not OpenCV
        'torch',
        'torchvision',
        'tensorflow',
        'tensorboard',
        'triton',
        'nvidia',
    ],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name='backend',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=False,          # No console window
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)

coll = COLLECT(
    exe,
    a.binaries,
    a.zipfiles,
    a.datas,
    strip=False,
    upx=True,
    upx_exclude=[],
    name='backend',
)
