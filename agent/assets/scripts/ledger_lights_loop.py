#!/usr/bin/env python3
"""Animate the "ledger light installation" backdrop into a seamless, subtle loop.

Procedural, from the still itself (no AI video model, so no new objects and no drift
from the approved plate):

1. Split the plate exactly into a smooth dark BACKGROUND (a grey opening of the image:
   min filter then max filter, then a blur) and a LIGHT layer (the beads, threads and
   floor reflections): plate = background + light, so frame 0 is the original at rest.
2. Animate only the light layer, and only with periodic functions of
   theta = 2*pi*t/T that use whole-number multiples of theta, so the frame at t = T is
   identical to the frame at t = 0 and the loop has no seam:
   - sway: the threads hang from the ceiling and swing very slightly sideways, more at
     the bottom than the top, with a slow phase drift across the room (about 1.5 px at
     1536 wide);
   - breathing: every bead brightens and dims softly on its own phase (two smooth random
     fields, one cycle and two cycles per loop);
   - travelling light: one soft glint per loop runs left to right along the two wave
     curves (weighted to where the beads are dense, so it follows the curves rather
     than sweeping the whole wall), like reading a chart.
3. The background, including the dark centre where Bookie sits, never changes.

usage: ledger_lights_loop.py IN.png OUT.mp4 [--seconds 10] [--fps 24] [--crf 16]
           [--frames-dir DIR]   (also write every frame as PNG, for inspection)

Encoding: H.264 CRF 16 with the I/P/B quantiser ratios at 1.0, so the key frame at the
loop point is coded at the same quality as the rest; otherwise the restart shows as a
faint shimmer of coding noise on the threads. 10 s also gives whole frame counts at 24
fps (240) and at Presence's default 10 fps decode (100).

Requires numpy, Pillow and ffmpeg. Deterministic (fixed random seed).
"""
import argparse
import subprocess
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter

p = argparse.ArgumentParser(description=__doc__.split("\n")[1])
p.add_argument("src", type=Path)
p.add_argument("out", type=Path)
p.add_argument("--seconds", type=float, default=10.0)
p.add_argument("--fps", type=int, default=24)
p.add_argument("--crf", type=int, default=16)
p.add_argument("--frames-dir", type=Path)
p.add_argument("--sway-px", type=float, default=1.6, help="sideways swing at the floor, px at 1536 wide")
p.add_argument("--breathe", type=float, default=0.22, help="bead brightness breathing, +/- fraction")
p.add_argument("--calm-left", type=float, nargs=2, metavar=("FROM", "TO"),
               help="fade the lights out to the left of FROM (fraction of width), full from TO, e.g. 0.30 0.50: "
                    "keeps the left side calm behind the avatar's HUD panels")
p.add_argument("--still-out", type=Path, help="also save frame 0 (the still backdrop/fallback) here")
p.add_argument("--glint", type=float, default=0.45, help="extra brightness of the travelling glint")
a = p.parse_args()

rng = np.random.default_rng(20261017)
im = Image.open(a.src).convert("RGB")
W, H = im.size
k = W / 1536.0  # all pixel sizes below are tuned at 1536x1024
img = np.asarray(im, dtype=np.float32) / 255.0


def blur(arr2d, sigma):
    """Gaussian blur of a float 2-D array (FFT, reflect-padded so the edges don't wrap)."""
    pad = int(3 * sigma) + 1
    x = np.pad(arr2d.astype(np.float32), pad, mode="reflect")
    fy = np.fft.fftfreq(x.shape[0])[:, None]
    fx = np.fft.rfftfreq(x.shape[1])[None, :]
    g = np.exp(-2 * (np.pi * sigma) ** 2 * (fx * fx + fy * fy))
    return np.fft.irfft2(np.fft.rfft2(x) * g, s=x.shape)[pad:-pad, pad:-pad].astype(np.float32)


# 1. background / light split. The opening removes anything narrower than the kernel
#    (beads are ~3-9 px, threads 1-2 px), leaving the smooth navy gradient.
size = int(round(21 * k)) | 1
bg = im.filter(ImageFilter.MinFilter(size)).filter(ImageFilter.MaxFilter(size))
bg = np.asarray(bg.filter(ImageFilter.GaussianBlur(6 * k)), dtype=np.float32) / 255.0
bg = np.minimum(bg, img)
light = img - bg  # >= 0, and bg + light == img exactly
if a.calm_left:
    x0f, x1f = a.calm_left
    ramp = np.clip((np.arange(W, dtype=np.float32) / W - x0f) / max(1e-6, x1f - x0f), 0, 1)
    ramp = ramp * ramp * (3 - 2 * ramp)          # smoothstep: no visible edge
    light = light * ramp[None, :, None]

# Where the floor starts: the reflections below it are treated as hanging from it.
floor_y = int(0.85 * H)

# 2a. sway: horizontal displacement per pixel, scaled by height (anchored at the ceiling).
ys = np.arange(H, dtype=np.float32)[:, None]
xs = np.arange(W, dtype=np.float32)[None, :]
hang = np.clip(ys / floor_y, 0, 1) ** 1.3  # 0 at the ceiling, 1 at the floor (and below)
drift = 2 * np.pi * xs / (1.6 * W)  # the swing reaches the right side a little later

# 2b. breathing: two smooth random fields per harmonic (a*cos + b*sin = a phase and an
#     amplitude that vary bead by bead without the phase singularities of angle()).
def field(sigma):
    f = blur(rng.standard_normal((H, W)).astype(np.float32), sigma * k)
    return f / (f.std() + 1e-6)


bead_sigma = 5.0
br1 = (field(bead_sigma), field(bead_sigma))
br2 = (field(bead_sigma), field(bead_sigma))

# 2c. glint mask: bead density, so the travelling light follows the dense wave curves.
lum = light.mean(axis=2)
dens = blur(lum, 14 * k)
dens = np.clip((dens - np.percentile(dens, 70)) / (np.percentile(dens, 99.5) - np.percentile(dens, 70)), 0, 1)
dens = dens * dens * (3 - 2 * dens)  # smoothstep
cx = W / 2.0


def frame(t):
    th = 2 * np.pi * t / a.seconds
    # sway, one swing per loop plus a smaller second harmonic so it isn't a metronome
    dx = a.sway_px * k * hang * (0.8 * np.sin(th - drift) + 0.2 * np.sin(2 * th - 2 * drift + 1.3))
    src_x = np.clip(xs - dx, 0, W - 1.001)
    x0 = src_x.astype(np.int32)
    fr = (src_x - x0)[..., None]
    rows = np.broadcast_to(np.arange(H)[:, None], (H, W))
    moved = light[rows, x0] * (1 - fr) + light[rows, x0 + 1] * fr

    gain = 1.0 + a.breathe * (
        0.65 * (br1[0] * np.cos(th) + br1[1] * np.sin(th)) + 0.35 * (br2[0] * np.cos(2 * th) + br2[1] * np.sin(2 * th))
    ) / np.sqrt(2)
    # glint: a soft raised-cosine pulse, one pass per loop, left to right on each side
    side = (xs >= cx).astype(np.float32)  # each half gets its own glint, half a loop apart
    phase = (2 * xs / W - side) - t / a.seconds + 0.5 * side  # 0..1 across each half
    pulse = ((1 + np.cos(2 * np.pi * phase)) / 2) ** 6
    gain = gain + a.glint * dens * pulse
    out = bg + moved * np.clip(gain, 0.4, None)[..., None]
    return (np.clip(out, 0, 1) * 255 + 0.5).astype(np.uint8)


n = int(round(a.seconds * a.fps))
if a.frames_dir:
    a.frames_dir.mkdir(parents=True, exist_ok=True)
ff = subprocess.Popen(
    ["ffmpeg", "-y", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}",
     "-r", str(a.fps), "-i", "-", "-c:v", "libx264", "-preset", "slow", "-crf", str(a.crf),
     "-x264-params", "ipratio=1.0:pbratio=1.0", "-pix_fmt", "yuv420p", "-movflags", "+faststart", str(a.out)],
    stdin=subprocess.PIPE)
for i in range(n):
    f = frame(i / a.fps)
    if a.frames_dir:
        Image.fromarray(f).save(a.frames_dir / f"f{i:04d}.png")
    ff.stdin.write(f.tobytes())
ff.stdin.close()
ff.wait()
if a.still_out:
    Image.fromarray(frame(0)).save(a.still_out)
# Seam check: the frame one step past the end must equal frame 0 to the rounding.
seam = np.abs(frame(n / a.fps).astype(np.int16) - frame(0).astype(np.int16)).max()
print(f"{a.out} {n} frames, {a.out.stat().st_size / 1e6:.2f} MB, seam max diff {seam}")
