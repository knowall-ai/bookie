#!/usr/bin/env python3
"""Compose Bookie's presence plates the way robot_avatar.py does, to prove the eyes land.

Mirrors agent-presence robot_avatar.py: backdrop cover-fit to the canvas, plate
height = canvas x plate.scale anchored bottom and centred, eyes drawn on a separate
transparent face layer (glass patch, radial halo, core lamp, eye_hot centre, rim),
blink by squashing ry, glow = 0.8 + 0.12 sin(1.1 t) + level x 0.3. No lashes, no mouth.

usage: plate_test_render.py ASSETS_DIR OUT_DIR [--opaque-lamp]
"""
import json, math, sys
from pathlib import Path
from PIL import Image, ImageDraw

assets, out = Path(sys.argv[1]), Path(sys.argv[2]); out.mkdir(parents=True, exist_ok=True)
cfg = json.loads((assets / "bookie-avatar.json").read_text()); P = cfg["plate"]
CW, CH = 1280, 720
GLOW, CORE = tuple(P["eye_color"]), tuple(P["eye_core"]); GLASS = tuple(P["glass"]) + (255,)
HALO, HALO_A, HOT = P["eye_halo"], P["eye_halo_alpha"], P.get("eye_hot", False)
# --opaque-lamp previews a proposed renderer tweak: lamp drawn at alpha 255 with a hot centre.
OPAQUE = "--opaque-lamp" in sys.argv
if OPAQUE:
    HOT = True

def cover_fit(im, w, h):
    s = max(w / im.width, h / im.height)
    im = im.resize((round(im.width * s), round(im.height * s)), Image.LANCZOS)
    x, y = (im.width - w) // 2, (im.height - h) // 2
    return im.crop((x, y, x + w, y + h))

bg = cover_fit(Image.open(assets / cfg["backdrop"]["bg"]).convert("RGBA"), CW, CH)
agent = Image.open(assets / P["agent"]).convert("RGBA")
ah = round(CH * P.get("scale", 1.0)); aw = int(agent.width * ah / agent.height)
agent = agent.resize((aw, ah), Image.LANCZOS)
ax = (CW - aw) // 2; ay = (CH - ah) if P.get("anchor", "bottom") == "bottom" else (CH - ah) // 2
ay += round(P.get("offset_y", 0) * CH)
character = Image.new("RGBA", (CW, CH), (0, 0, 0, 0)); character.alpha_composite(agent, (ax, ay))
L, R, CY, RX, RY = P["eye"]
g = dict(elx=ax + L * aw, erx=ax + R * aw, ecy=ay + CY * ah, rx=RX * aw, ry=RY * ah)

def frame(t, blink=1.0, level=0.0, eyes=True):
    im = bg.copy(); ch = character.copy()
    if eyes:
        face = Image.new("RGBA", (CW, CH), (0, 0, 0, 0)); d = ImageDraw.Draw(face)
        glow = 0.8 + 0.12 * math.sin(t * 1.1) + level * 0.3
        for cx in (g["elx"], g["erx"]):
            cy = g["ecy"]
            d.ellipse([cx - g["rx"] * 1.35, cy - g["ry"] * 1.30, cx + g["rx"] * 1.35, cy + g["ry"] * 1.30], fill=GLASS)
            ry = g["ry"] * 0.95 * max(0.0, blink)
            if ry <= g["ry"] * 0.05:
                continue
            for k in range(14, 0, -1):
                frac = k / 14; sc = 1.0 + (HALO - 1.0) * frac
                a = int(HALO_A * glow * (1.0 - frac) ** 1.6)
                if a > 0:
                    d.ellipse([cx - g["rx"] * sc, cy - ry * sc, cx + g["rx"] * sc, cy + ry * sc], fill=GLOW + (a,))
            d.ellipse([cx - g["rx"] * 0.98, cy - ry, cx + g["rx"] * 0.98, cy + ry], fill=CORE + (255 if OPAQUE else int(235 * min(1, glow)),))
            if HOT:
                hot = (255, 250, 215)
                for k in range(1, 7):
                    frac = k / 7.0; sc = 0.98 - 0.62 * frac
                    col = tuple(int(CORE[i] + (hot[i] - CORE[i]) * frac ** 1.3) for i in range(3))
                    d.ellipse([cx - g["rx"] * sc, cy - ry * sc, cx + g["rx"] * sc, cy + ry * sc], fill=col + (255 if OPAQUE else int(235 * min(1, glow)),))
            d.ellipse([cx - g["rx"] * 0.98, cy - ry, cx + g["rx"] * 0.98, cy + ry], outline=GLOW + (255,), width=2)
        ch.alpha_composite(face)
    im.alpha_composite(ch)
    return im.convert("RGB")

if OPAQUE:
    frame(0).save(out / "bookie-plate-eyes-on-opaque-lamp.png"); sys.exit()
frame(0, eyes=False).save(out / "bookie-plate-eyes-off.png")
frame(0).save(out / "bookie-plate-eyes-on.png")
# 3.5 s GIF at the renderer's 20 fps: one 0.14 s blink at 0.8 s, then a glow pulse (simulated speech level).
frames = []
for i in range(70):
    t = i * 0.05
    level = max(0.0, math.sin((t - 1.4) * 3.0)) * 0.9 if t > 1.4 else 0.0
    bp = (t - 0.8) / 0.14
    blink = abs(math.cos(math.pi * bp)) if 0 <= bp <= 1 else 1.0
    frames.append(frame(t, blink, level).crop((340, 60, 940, 510)).resize((480, 360), Image.LANCZOS))
frames[0].save(out / "bookie-plate-test.gif", save_all=True, append_images=frames[1:], duration=50, loop=0)
print("eye px:", {k: round(v, 1) for k, v in g.items()})
