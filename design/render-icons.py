"""Renders from design/schmeckts-app-icon.svg whatever Android will not take as a vector: the launcher icons for
Android 7 (API 24/25, mipmap-*/ic_launcher.png and ic_launcher_round.png). That file is the whole icon including its
background. From Android 8 on the adaptive icon from app/native/res (vectors) applies. Needs Python with
Playwright/Chromium.
Usage: python3 design/render-icons.py"""

import asyncio
import pathlib
import re
from playwright.async_api import async_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
RES = ROOT / 'app/android/app/src/main/res'
SVG = (ROOT / 'design/schmeckts-app-icon.svg').read_text()
DENS = {'mdpi': 1, 'hdpi': 1.5, 'xhdpi': 2, 'xxhdpi': 3, 'xxxhdpi': 4}


def page(size, round_):  # square with rounded corners, or round
    radius = '50%' if round_ else f'{size * 0.22}px'
    svg = re.sub(r'<svg ', f'<svg width="{size}" height="{size}" style="display:block" ', SVG, count=1)
    return (
        f'<html><body style="margin:0;background:transparent">'
        f'<div style="width:{size}px;height:{size}px;border-radius:{radius};overflow:hidden">{svg}</div></body></html>'
    )


async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        pg = await b.new_page()

        async def shot(size, round_, path):
            path.parent.mkdir(parents=True, exist_ok=True)
            await pg.set_viewport_size({'width': int(size), 'height': int(size)})
            await pg.set_content(page(size, round_))
            await pg.screenshot(path=str(path), omit_background=True, clip={'x': 0, 'y': 0, 'width': int(size), 'height': int(size)})

        for d, k in DENS.items():
            out = RES / f'mipmap-{d}'
            await shot(48 * k, False, out / 'ic_launcher.png')
            await shot(48 * k, True, out / 'ic_launcher_round.png')
            (out / 'ic_launcher_foreground.png').unlink(missing_ok=True)  # Capacitor's template, replaced by the vector
        await b.close()


asyncio.run(main())
print('icons rendered')
