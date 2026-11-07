#!/usr/bin/env python3
"""Generate iPad build assets from MPS's existing MIT-licensed geometric mark.

Python standard library only; no historical logo or personal image is imported.
Generated assets stay out of source control. See assets/PROVENANCE.md.
"""
from pathlib import Path
import importlib.util
import json

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("mps_owned_icons", ROOT / "scripts/generate-owned-icons.py")
icons = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(icons)
original_sample = icons.sample

def opaque_sample(x, y):
    color = original_sample(x, y)
    return color if color[3] else (19, 43, 56, 255)

def main():
    icons.sample = opaque_sample
    target = ROOT / "apps/ipad/src-tauri/icons"
    catalog = target / "ios/Assets.xcassets"
    app = catalog / "AppIcon.appiconset"
    app.mkdir(parents=True, exist_ok=True)
    info = {"author": "xcode", "version": 1}
    entries = []
    sizes = [(size, scale, "ipad") for size in [20, 29, 40, 76] for scale in [1, 2]]
    sizes += [(83.5, 2, "ipad"), (1024, 1, "ios-marketing")]
    for size, scale, idiom in sizes:
        name = f"AppIcon-{size}@{scale}x.png"
        image = icons.png(int(size * scale))
        (app / name).write_bytes(image)
        entries.append({"filename": name, "idiom": idiom, "size": f"{size}x{size}", "scale": f"{scale}x"})
        if size == 1024:
            (target / "icon.png").write_bytes(image)
    (app / "Contents.json").write_text(json.dumps({"images": entries, "info": info}, indent=2) + "\n")
    (catalog / "Contents.json").write_text(json.dumps({"info": info}, indent=2) + "\n")
    print("Generated iPad icons from the existing owned MPS mark.")

if __name__ == "__main__":
    main()
