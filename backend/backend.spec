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
        'backend.types',  # Renamed to wm_types.py to avoid stdlib shadowing
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
    a.binaries,
    a.zipfiles,
    a.datas,
    [],
    name='backend',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=False,          # No console window (hidden background process)
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    # Windows-specific: hide the console window
    uac_admin=False,
)
