#!/usr/bin/env python3
"""Reproduce the original geometric MPS mark; Python standard library only.

No source image, external font, network resource or embedded metadata is used.
Coordinates mirror assets/mps-mark.svg. Proposed license: MIT; see assets/LICENSE.
"""
from pathlib import Path
import struct
import zlib

ROOT = Path(__file__).resolve().parents[1]

def chunk(kind, data):
    return struct.pack('>I', len(data)) + kind + data + struct.pack('>I', zlib.crc32(kind + data) & 0xffffffff)

def near(x, y, ax, ay, bx, by, radius):
    dx, dy = bx - ax, by - ay
    t = max(0, min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy)))
    return (x - ax - t * dx)**2 + (y - ay - t * dy)**2 <= radius**2

def sample(x, y):
    # Rounded square, then paper, folded corner and author-confirmation mark.
    cx, cy = max(184, min(840, x)), max(184, min(840, y))
    if (x - cx)**2 + (y - cy)**2 > 160**2:
        return (0, 0, 0, 0)
    c = (19, 43, 56, 255)
    if 220 <= x <= 804 and 150 <= y <= 874 and y >= x - 470:
        c = (244, 248, 250, 255)
        if 620 <= x and y <= 334:
            c = (185, 217, 222, 255)
        if near(x, y, 320, 490, 440, 610, 26) or near(x, y, 440, 610, 690, 360, 26) or near(x, y, 320, 720, 690, 720, 12) or near(x, y, 320, 790, 570, 790, 12):
            c = (8, 127, 140, 255)
    return c

def png(size):
    rows = bytearray()
    for y in range(size):
        rows.append(0)
        for x in range(size):
            colors = [sample((x + ox) * 1024 / size, (y + oy) * 1024 / size) for ox, oy in [(0.25, 0.25), (0.75, 0.25), (0.25, 0.75), (0.75, 0.75)]]
            rows.extend(round(sum(c[i] for c in colors) / 4) for i in range(4))
    return b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', size, size, 8, 6, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(rows, 9)) + chunk(b'IEND', b'')

def save(name, data):
    p = ROOT / name
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_bytes(data)

def main():
    images = {n: png(n) for n in [16, 32, 48, 64, 128, 192, 256, 512, 1024]}
    for name, size in {
        'apps/desktop/src/assets/codex-prism.png': 1024,
        'apps/desktop/public/icon-192.png': 192,
        'apps/desktop/src-tauri/icons/icon.png': 1024,
        'apps/desktop/src-tauri/icons/32x32.png': 32,
        'apps/desktop/src-tauri/icons/128x128.png': 128,
        'apps/desktop/src-tauri/icons/128x128@2x.png': 256,
        'apps/desktop/src-tauri/icons/256x256.png': 256,
    }.items():
        save(name, images[size])
    sizes = [16, 32, 48, 64, 128, 256]
    directory = bytearray(struct.pack('<HHH', 0, 1, len(sizes)))
    offset = 6 + len(sizes) * 16
    for n in sizes:
        b = images[n]
        directory.extend(struct.pack('<BBBBHHII', n % 256, n % 256, 0, 0, 1, 32, len(b), offset))
        offset += len(b)
    ico = bytes(directory) + b''.join(images[n] for n in sizes)
    save('apps/desktop/public/favicon.ico', ico)
    save('apps/desktop/src-tauri/icons/icon.ico', ico)
    entries = b''.join(tag + struct.pack('>I', len(images[n]) + 8) + images[n] for tag, n in [(b'icp4', 16), (b'icp5', 32), (b'icp6', 64), (b'ic07', 128), (b'ic08', 256), (b'ic09', 512), (b'ic10', 1024)])
    save('apps/desktop/src-tauri/icons/icon.icns', b'icns' + struct.pack('>I', len(entries) + 8) + entries)

if __name__ == '__main__':
    main()
