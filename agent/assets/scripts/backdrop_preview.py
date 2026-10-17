#!/usr/bin/env python3
"""Render a short preview of Bookie on a Presence backdrop with the REAL renderer.

Imports RobotAvatar from an agent-presence checkout, so the backdrop motion (stars,
rain, city_lights, flicker_zones) is exactly what a call would show. Bookie's plate and
eyes are composed on the backdrop, the eyes blink once at 2.5 s (the run loop's first
blink), and the mouth stays off the canvas. The HUD, REC dot, PRESENCE badge, logo and
ticker are switched off in this process only, so the preview shows just Bookie and the
scene; Presence itself is not modified.

usage: backdrop_preview.py PRESENCE_MEDIA_DIR ASSETS_DIR BACKDROP_JSON OUT.mp4
           [--still OUT.png] [--seconds 6] [--size 1280x720]

PRESENCE_MEDIA_DIR is agent-presence's src/call-bot/media. ASSETS_DIR holds
bookie-agent.png, bookie-avatar.json and the backdrop PNG. BACKDROP_JSON is a file with
the avatar config's `backdrop` block. The renderer draws at 1920x1080 (its call default)
and ffmpeg scales to --size (H.264, 20 fps).
"""
import json, math, os, subprocess, sys, tempfile
from pathlib import Path


def opt(name, default):
    return sys.argv[sys.argv.index(name) + 1] if name in sys.argv else default


media, assets, bd_json, out = (Path(a).resolve() for a in sys.argv[1:5])
still, seconds, size = opt("--still", None), float(opt("--seconds", "6")), opt("--size", "1280x720")

cfg = json.loads((assets / "bookie-avatar.json").read_text())
cfg["assets_dir"] = str(assets)
cfg["backdrop"] = json.loads(bd_json.read_text())
cfg["hud"] = {"alpha": 0}
tmp = tempfile.NamedTemporaryFile("w", suffix=".json", delete=False)
json.dump(cfg, tmp); tmp.close()
os.environ.update(PRESENCE_AVATAR_CONFIG=tmp.name, AVATAR_TICKER="0", AVATAR_DEV="0", AVATAR_LASHES="off",
                  AVATAR_RES="1080")
sys.path.insert(0, str(media))
import logging  # noqa: E402
logging.basicConfig(level=logging.INFO, format="%(message)s")  # the layers report what they found
import robot_avatar  # noqa: E402  (reads the config at import)

av = robot_avatar.RobotAvatar()
av._compose_base()
av._base_bg = av._base.copy()
# Preview only: no HUD, REC dot, version badge or logo over the scene.
av.hud.draw = lambda *a, **k: None
av.rec.draw = lambda *a, **k: None
av.badge.draw = lambda *a, **k: None
av._logo = None
av.TICKER_ON = False

fps = robot_avatar.FPS
ff = subprocess.Popen(
    ["ffmpeg", "-y", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "rgb24",
     "-s", f"{av.cw}x{av.ch}", "-r", str(fps), "-i", "-",
     "-vf", f"scale={size.replace('x', ':')}:flags=lanczos", "-c:v", "libx264",
     "-preset", "slow", "-crf", "26", "-pix_fmt", "yuv420p", "-movflags", "+faststart",
     str(out)], stdin=subprocess.PIPE)
BLINK_AT, BLINK_LEN = 2.5, 0.14
for i in range(int(seconds * fps)):
    t = i / fps
    bp = (t - BLINK_AT) / BLINK_LEN
    blink = abs(math.cos(math.pi * bp)) if 0.0 <= bp < 1.0 else 1.0
    frame = av._draw_frame(t, blink, 1.0)
    if still and i == int(1.0 * fps):
        from PIL import Image
        Image.fromarray(frame).resize(tuple(map(int, size.split("x"))), Image.LANCZOS).save(still)
    ff.stdin.write(frame.tobytes())
ff.stdin.close(); ff.wait()
os.unlink(tmp.name)
print(f"{out} ({out.stat().st_size // 1024} KB)")
