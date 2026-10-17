#!/usr/bin/env python3
"""Pulse Bookie's eye glow with his narration, on generated video (no lip-sync, eyes only).

Each frame: find the two warm gold-white eye discs that sit on the dark visor (bright warm
blobs with a dark surround, paired side by side), then add a soft gold bloom whose strength
follows the narration's amplitude envelope. Frames where no confident pair is found are left
untouched. Writes a silent H.264 video; mux the audio afterwards with ffmpeg.

usage: eye_glow_sync.py in.mp4 narration.wav out.mp4 [--offset 1.0] [--strength 90] [--debug dir]
"""
import argparse, subprocess, wave
import numpy as np

ap = argparse.ArgumentParser()
ap.add_argument("src"); ap.add_argument("wav"); ap.add_argument("out")
ap.add_argument("--offset", type=float, default=1.0, help="narration start in the video, seconds")
ap.add_argument("--strength", type=float, default=90.0, help="peak additive glow, 0-255")
ap.add_argument("--fps", type=float, default=24.0); ap.add_argument("--debug")
a = ap.parse_args()
W, H, FPS = 1280, 720, a.fps

with wave.open(a.wav) as w:
    sr = w.getframerate(); pcm = np.frombuffer(w.readframes(w.getnframes()), np.int16).astype(float) / 32768
hop = int(sr / FPS)
rms = np.array([np.sqrt((pcm[i:i + hop] ** 2).mean()) for i in range(0, len(pcm) - hop, hop)])
env, e = [], 0.0
for r in rms:  # fast attack, slower release, so the glow breathes with the phrases
    e = r if r > e else e * 0.82 + r * 0.18
    env.append(e)
env = np.clip(np.array(env) / np.percentile(env, 95), 0, 1) ** 0.8

def find_eyes(f):
    s = f[::4, ::4].astype(int); R, G, B = s[..., 0], s[..., 1], s[..., 2]
    lum = (R + G + B) / 3
    m = (R > 200) & (G > 150) & (B < 175) & (R - B > 55) & (lum > 160)
    h, w = m.shape; lab = np.zeros((h, w), int); comps = []; n = 0
    for y0, x0 in zip(*np.nonzero(m)):
        if lab[y0, x0]:
            continue
        n += 1; st = [(y0, x0)]; lab[y0, x0] = n; pts = []
        while st:
            y, x = st.pop(); pts.append((y, x))
            for yy, xx in ((y + 1, x), (y - 1, x), (y, x + 1), (y, x - 1)):
                if 0 <= yy < h and 0 <= xx < w and m[yy, xx] and not lab[yy, xx]:
                    lab[yy, xx] = n; st.append((yy, xx))
        if not 4 <= len(pts) <= 400:
            continue
        p = np.array(pts); cy, cx = p.mean(0); ry = np.ptp(p[:, 0]) / 2 + 0.5; rx = np.ptp(p[:, 1]) / 2 + 0.5
        y1, y2 = int(max(0, cy - ry * 2.2)), int(min(h, cy + ry * 2.2 + 1))
        x1, x2 = int(max(0, cx - rx * 2.0)), int(min(w, cx + rx * 2.0 + 1))
        ring = lum[y1:y2, x1:x2][~m[y1:y2, x1:x2]]
        if ring.size and np.median(ring) < 80:
            comps.append((cx, cy, rx, ry, len(pts), np.median(ring)))
    best = None
    for i in range(len(comps)):
        for j in range(i + 1, len(comps)):
            A, Bc = sorted((comps[i], comps[j]))
            dx, dy = Bc[0] - A[0], abs(Bc[1] - A[1]); r = max(A[2], Bc[2])
            if 2.0 * r < dx < 7.5 * r and dy < 1.2 * max(A[3], Bc[3]) and 0.4 < A[4] / Bc[4] < 2.5:
                score = A[5] + Bc[5]
                if best is None or score < best[0]:
                    best = (score, A, Bc)
    if not best:
        return None
    return [(c[0] * 4 + 2, c[1] * 4 + 2, max(c[2], c[3]) * 4) for c in best[1:]]

yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
GOLD = np.array([255, 196, 104], np.float32)
dec = subprocess.Popen(["ffmpeg", "-v", "error", "-i", a.src, "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], stdout=subprocess.PIPE)
enc = subprocess.Popen(["ffmpeg", "-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-r", str(FPS),
                        "-i", "-", "-c:v", "libx264", "-crf", "14", "-preset", "medium", "-pix_fmt", "yuv420p", a.out], stdin=subprocess.PIPE)
k = found = 0
while True:
    buf = dec.stdout.read(W * H * 3)
    if len(buf) < W * H * 3:
        break
    f = np.frombuffer(buf, np.uint8).reshape(H, W, 3)
    i = int(round((k / FPS - a.offset) * FPS)); lvl = env[i] if 0 <= i < len(env) else 0.0
    eyes = find_eyes(f) if lvl > 0.02 or a.debug else None
    if eyes and lvl > 0.02:
        found += 1; g = np.zeros((H, W), np.float32)
        for cx, cy, r in eyes:
            sig = r * 1.25
            x1, x2, y1, y2 = int(max(0, cx - 4 * sig)), int(min(W, cx + 4 * sig)), int(max(0, cy - 4 * sig)), int(min(H, cy + 4 * sig))
            d2 = (xx[y1:y2, x1:x2] - cx) ** 2 + (yy[y1:y2, x1:x2] - cy) ** 2
            g[y1:y2, x1:x2] = np.maximum(g[y1:y2, x1:x2], np.exp(-d2 / (2 * sig * sig)))
        add = g[..., None] * (GOLD / 255.0) * a.strength * lvl
        f = np.clip(f.astype(np.float32) + add, 0, 255).astype(np.uint8)
    if a.debug and k % 24 == 0:
        from PIL import Image, ImageDraw
        im = Image.fromarray(f); d = ImageDraw.Draw(im)
        for cx, cy, r in eyes or []:
            d.ellipse([cx - r, cy - r, cx + r, cy + r], outline=(255, 0, 255), width=2)
        im.resize((640, 360)).save(f"{a.debug}/{k // 24:02d}.jpg")
    enc.stdin.write(f.tobytes()); k += 1
enc.stdin.close(); enc.wait()
print(f"frames {k}, glow applied on {found}")
