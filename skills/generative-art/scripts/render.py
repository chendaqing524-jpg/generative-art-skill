#!/usr/bin/env python3
"""Render an HTML page to PNG with headless Chrome or Edge.

Usage:
    python render.py page.html out.png --size 1080x1350 [--scale 2] [--hash "seed=101"]

--size is the final PNG size in pixels. The page is laid out at size / scale CSS px,
so keep gen.js `scale` equal to --scale. Set the BROWSER environment variable to
point at a specific Chrome, Chromium or Edge executable if it is not found.
"""
import argparse
import os
import shutil
import subprocess
import sys
from pathlib import Path

CANDIDATES = [
    r"C:\Program Files\Google\Chrome\Application\chrome.exe",
    r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
    r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
    r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
]
NAMES = ["google-chrome", "google-chrome-stable", "chromium", "chromium-browser", "microsoft-edge", "msedge", "chrome"]


def find_browser():
    env = os.environ.get("BROWSER")
    if env and Path(env).exists():
        return env
    for c in CANDIDATES:
        if Path(c).exists():
            return c
    for n in NAMES:
        p = shutil.which(n)
        if p:
            return p
    return None


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("page")
    ap.add_argument("out")
    ap.add_argument("--size", default="1080x1350", help="final PNG size, e.g. 1080x1440")
    ap.add_argument("--scale", type=float, default=2.0)
    ap.add_argument("--hash", default="", help='URL hash parameters, e.g. "seed=101&bg=%%23F3EEE2"')
    ap.add_argument("--budget", type=int, default=10000, help="ms of virtual time for scripts to finish")
    a = ap.parse_args()

    browser = find_browser()
    if not browser:
        sys.exit("No Chrome, Chromium or Edge found. Set BROWSER to the executable path.")

    w, h = (int(v) for v in a.size.lower().split("x"))
    css_w, css_h = round(w / a.scale), round(h / a.scale)
    page = Path(a.page).resolve()
    out = Path(a.out).resolve()
    out.parent.mkdir(parents=True, exist_ok=True)
    # Pass the exact CSS size: headless browsers report a smaller viewport while scripts run,
    # so a page that sized its canvas from the viewport would come out stretched.
    frag = f"w={css_w}&h={css_h}" + (("&" + a.hash) if a.hash else "")
    url = page.as_uri() + "#" + frag

    cmd = [
        browser, "--headless=new", "--disable-gpu", "--hide-scrollbars",
        "--allow-file-access-from-files",
        f"--force-device-scale-factor={a.scale}",
        f"--window-size={css_w},{css_h}",
        f"--virtual-time-budget={a.budget}",
        f"--screenshot={out}",
        url,
    ]
    subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=180)
    if not out.exists():
        sys.exit(f"Render failed, no file written: {out}")
    print(f"{out} ({w}x{h})")


if __name__ == "__main__":
    main()
