#!/usr/bin/env python3
"""Turn a still Presence backdrop into a seamless, calm but clearly visible motion loop.

Procedural, from the plate itself (no AI video model, so nothing is invented and the
loop never drifts from the approved still). Every motion is periodic in
theta = 2*pi*t/T with whole-number multiples, or starts and ends out of view, so the
frame after the last is the first again. Effects are switched on per region; nothing
outside a region changes, and nothing left of --still-left ever changes, so the HUD
column stays perfectly still.

Effects (all coordinates are fractions of the plate's width and height):

  --clouds X0 Y0 X1 Y1     clouds in a window drift sideways (a two-phase flow loop:
                           two copies drift by --cloud-px each loop, half a loop apart,
                           cross-faded so neither is seen at its reset).
  --plane Y0 Y1            a distant aircraft light crosses the --clouds window once per
                           loop, from height Y0 to Y1, steady white with a strobe; it
                           enters and leaves behind the window frame (needs --clouds).
  --twinkle X0 Y0 X1 Y1    bright specks (city windows, indicator lights) twinkle
                           softly, each 4 px cell on its own phase.
  --glint CX CY R          a soft gleam travels once per loop round a circular brass rim
                           (centre CX, CY; radius R as a fraction of the height).
  --motes X0 Y0 X1 Y1      dust motes drift on slow closed paths, lit only where the
                           plate is bright (a shaft of light).
  --pulse X Y              a small light (a status LED) breathes; repeatable.
  --sheen X0 Y0 X1 Y1      a soft diagonal reflection glides across glass, entering and
                           leaving out of view, once per loop.
  --breathe X0 Y0 X1 Y1    the bright parts of a region (LED strips) brighten and dim
                           softly on a smooth random field.
  --flow X0 Y0 X1 Y1 DIR   packets of light run along the bright vertical lines of a
                           region (data streams, holographic columns): DIR 1 runs down,
                           -1 runs up; repeatable. Each 6 px column has its own phase.
  --traffic X0 Y0 X1 Y1 N  N small craft (flying cars, shuttles) cross the region with a
                           short light trail, seen only inside it (a window); each makes
                           one or two whole crossings per loop, out of view at the wrap.
  --bob X0 Y0 X1 Y1        the light in a region (holograms) floats gently up and down
                           and flickers softly, as projected light does.

usage: backdrop_motion_loop.py IN.png OUT.mp4 [effects...] [--seconds 10] [--fps 24]
           [--crf 16] [--still-left 0.40] [--frames-dir DIR]

Encoding as ledger_lights_loop.py: H.264, CRF 16, I/P/B quantiser ratios at 1.0 so the
key frame at the loop point matches the rest; 10 s gives whole frame counts at 24 fps
and at Presence's 10 fps decode. Requires numpy, Pillow and ffmpeg. Deterministic.
"""
import argparse
import math
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
p.add_argument("--still-left", type=float, default=0.40,
               help="nothing left of this fraction of the width ever moves (the HUD column)")
p.add_argument("--clouds", type=float, nargs=4)
p.add_argument("--cloud-px", type=float, default=40.0, help="drift per copy per loop, px at 1536 wide")
p.add_argument("--plane", type=float, nargs=2)
p.add_argument("--twinkle", type=float, nargs=4)
p.add_argument("--twinkle-depth", type=float, default=0.55)
p.add_argument("--glint", type=float, nargs=3)
p.add_argument("--glint-gain", type=float, default=0.55)
p.add_argument("--motes", type=float, nargs=4)
p.add_argument("--motes-n", type=int, default=70)
p.add_argument("--pulse", type=float, nargs=2, action="append", default=[])
p.add_argument("--sheen", type=float, nargs=4)
p.add_argument("--sheen-strength", type=float, default=0.10)
p.add_argument("--breathe", type=float, nargs=4)
p.add_argument("--breathe-amp", type=float, default=0.22)
p.add_argument("--flow", type=float, nargs=5, action="append", default=[])
p.add_argument("--flow-gain", type=float, default=1.1)
p.add_argument("--traffic", type=float, nargs=5)
p.add_argument("--bob", type=float, nargs=4, action="append", default=[])
p.add_argument("--bob-px", type=float, default=7.0)
a = p.parse_args()

rng = np.random.default_rng(20261018)
im = Image.open(a.src).convert("RGB")
W, H = im.size
k = W / 1536.0
img = np.asarray(im, dtype=np.float32) / 255.0
yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)


def blur(arr2d, sigma):
    m = float(arr2d.max()) or 1.0
    g = Image.fromarray(np.clip(arr2d / m * 255.0, 0, 255).astype(np.uint8))
    return np.asarray(g.filter(ImageFilter.GaussianBlur(sigma)), dtype=np.float32) / 255.0 * m


def rect_mask(r, feather=10.0):
    x0, y0, x1, y1 = r
    m = ((xx >= x0 * W) & (xx < x1 * W) & (yy >= y0 * H) & (yy < y1 * H)).astype(np.float32)
    # erode by the feather so the soft edge stays inside the rectangle
    f = feather * k
    inner = ((xx >= x0 * W + f) & (xx < x1 * W - f) & (yy >= y0 * H + f) & (yy < y1 * H - f)).astype(np.float32)
    return np.minimum(m, blur(inner, f / 2))


# Smooth dark background and light layer, as in ledger_lights_loop.py: plate = bg + light.
op = (im.filter(ImageFilter.MinFilter(5)).filter(ImageFilter.MaxFilter(5)).filter(ImageFilter.GaussianBlur(3)))
bg = np.minimum(np.asarray(op, dtype=np.float32) / 255.0, img)
light = img - bg
lum = img.mean(2)
T = a.seconds
N = int(round(a.fps * T))

# ---- clouds: two-phase flow loop ------------------------------------------------------
if a.clouds:
    cx0, cy0, cx1, cy1 = a.clouds
    X0, Y0, X1, Y1 = int(cx0 * W), int(cy0 * H), int(cx1 * W), int(cy1 * H)
    cmask = rect_mask(a.clouds, 12)[Y0:Y1, X0:X1, None]
    S = a.cloud_px * k
    pad = int(math.ceil(S)) + 4
    sky = np.pad(img[Y0:Y1, X0:X1], ((0, 0), (pad, pad), (0, 0)), mode="reflect")
    cols = np.arange(X1 - X0, dtype=np.float32)

    def shifted(s):
        src = cols - s + pad
        i0 = np.floor(src).astype(int)
        f = (src - i0)[None, :, None]
        return sky[:, i0] * (1 - f) + sky[:, i0 + 1] * f

# ---- twinkle: per-cell phases -------------------------------------------------------
if a.twinkle:
    tm = rect_mask(a.twinkle, 6)
    specks = (lum > 0.40) * tm
    cell = int(4 * k) or 1
    cw, chh = W // cell + 1, H // cell + 1
    ph = rng.uniform(0, 2 * np.pi, (chh, cw)).astype(np.float32)
    cyc = rng.integers(1, 4, (chh, cw)).astype(np.float32)
    act = (rng.random((chh, cw)) < 0.6).astype(np.float32)
    cy_i, cx_i = (yy // cell).astype(int), (xx // cell).astype(int)
    tw_ph, tw_cyc, tw_act = ph[cy_i, cx_i], cyc[cy_i, cx_i], act[cy_i, cx_i] * specks

# ---- glint round a circle ---------------------------------------------------------------
if a.glint:
    gx, gy, gr = a.glint[0] * W, a.glint[1] * H, a.glint[2] * H
    dist = np.hypot(xx - gx, yy - gy)
    ang = np.arctan2(yy - gy, xx - gx)
    # strongest on the rim, softer across the face, nothing outside the door
    ring = np.exp(-((dist - gr * 0.93) / (gr * 0.09)) ** 2) + 0.35 * (dist < gr * 0.86)
    ring = ring * np.clip((gr * 1.02 - dist) / (6 * k), 0, 1) * np.clip(lum / 0.25, 0, 1)

# ---- motes -------------------------------------------------------------------------------
if a.motes:
    mx0, my0, mx1, my1 = a.motes
    lit = blur(np.clip(lum - 0.05, 0, None), 25 * k)
    lit = lit / (lit[int(my0 * H):int(my1 * H), int(mx0 * W):int(mx1 * W)].max() or 1)
    n = a.motes_n
    m_x = rng.uniform(mx0 * W, mx1 * W, n)
    m_y = rng.uniform(my0 * H, my1 * H, n)
    m_ax, m_ay = rng.uniform(18, 46, n) * k, rng.uniform(24, 60, n) * k
    m_c1, m_c2, m_c3 = rng.integers(1, 3, n), rng.integers(1, 3, n), rng.integers(1, 4, n)
    m_p = rng.uniform(0, 2 * np.pi, (3, n))
    m_r = rng.uniform(1.0, 2.4, n) * k
    m_a = rng.uniform(0.35, 0.9, n)

# ---- pulses ------------------------------------------------------------------------------
pulses = []
for (px, py) in a.pulse:
    d = np.hypot(xx - px * W, yy - py * H)
    pulses.append(np.exp(-(d / (14 * k)) ** 2))

# ---- sheen -------------------------------------------------------------------------------
if a.sheen:
    smask = rect_mask(a.sheen, 14)
    slope = 0.45  # leans like a reflection of a tall window
    u = xx + slope * yy
    sx0, sy0, sx1, sy1 = a.sheen
    u_min, u_max = sx0 * W + slope * sy0 * H, sx1 * W + slope * sy1 * H
    sw = 70 * k
    # brighter where the glass already shows something, never flat paint on black
    sbase = 0.45 + 0.55 * np.clip(blur(lum, 4 * k) / 0.25, 0, 1)

# ---- breathe -----------------------------------------------------------------------------
if a.breathe:
    bmask = rect_mask(a.breathe, 8)
    f1 = blur(rng.standard_normal((H, W)).astype(np.float32), 60 * k)
    f2 = blur(rng.standard_normal((H, W)).astype(np.float32), 60 * k)
    f1 /= np.abs(f1).max() or 1
    f2 /= np.abs(f2).max() or 1
    b_ph = np.arctan2(f2, f1)

# ---- flow: travelling packets of light --------------------------------------------------
flows = []
for (fx0, fy0, fx1, fy1, fdir) in a.flow:
    fm = rect_mask((fx0, fy0, fx1, fy1), 8)
    colw = max(1, int(6 * k))
    ncol = W // colw + 1
    fphase = rng.uniform(0, 1, ncol).astype(np.float32)[(xx[0] // colw).astype(int)]
    fcyc = rng.integers(2, 5, ncol).astype(np.float32)[(xx[0] // colw).astype(int)]
    lam = 150 * k
    flows.append((fm, fphase[None, :], fcyc[None, :], lam, 1.0 if fdir >= 0 else -1.0))

# ---- traffic: craft crossing a window -----------------------------------------------------
if a.traffic:
    tx0, ty0, tx1, ty1, tn = a.traffic
    tmask = rect_mask((tx0, ty0, tx1, ty1), 6)
    tn = int(tn)
    tr_y = rng.uniform(ty0 * H + 12 * k, ty1 * H - 12 * k, tn)
    tr_laps = rng.integers(1, 3, tn)
    tr_dir = rng.choice([-1.0, 1.0], tn)
    tr_off = rng.uniform(0, 1, tn)
    tr_len = rng.uniform(26, 60, tn) * k
    tr_drop = rng.uniform(-14, 14, tn) * k  # a slight climb or descent across the window

# ---- bob: floating holograms ----------------------------------------------------------------
bobs = []
for r in a.bob:
    bx0, by0, bx1, by1 = int(r[0] * W), int(r[1] * H), int(r[2] * W), int(r[3] * H)
    bm = rect_mask(r, 10)[by0:by1, bx0:bx1, None]
    bobs.append((bx0, by0, bx1, by1, bm, light[by0:by1, bx0:bx1].copy(), rng.uniform(0, 2 * np.pi)))


def shift2d(arr, dx, dy):
    """arr (h, w, 3) moved by a sub-pixel (dx, dy), bilinear, edges padded black."""
    out = np.empty_like(arr)
    h, w = arr.shape[:2]
    for c in range(arr.shape[2]):
        out[..., c] = np.asarray(Image.fromarray(arr[..., c], "F").transform(
            (w, h), Image.AFFINE, (1, 0, -dx, 0, 1, -dy), resample=Image.BILINEAR), dtype=np.float32)
    return out


still_x = int(a.still_left * W)


def frame(t):
    th = 2 * np.pi * t / T
    out = img.copy()
    if a.clouds:
        ph1 = (t / T) % 1.0
        ph2 = (t / T + 0.5) % 1.0
        w1, w2 = 1 - abs(2 * ph1 - 1), 1 - abs(2 * ph2 - 1)
        mix = shifted(S * (ph1 - 0.5)) * w1 + shifted(S * (ph2 - 0.5)) * w2
        out[Y0:Y1, X0:X1] = out[Y0:Y1, X0:X1] * (1 - cmask) + mix * cmask
    if a.plane and a.clouds:
        span = (X1 - X0) + 80 * k
        px = X0 - 40 * k + span * (t / T)
        py = (a.plane[0] + (a.plane[1] - a.plane[0]) * (t / T)) * H
        strobe = ((t * 8 / T) % 1.0) < 0.06  # 8 flashes a loop
        r = (1.3 + (0.5 if strobe else 0.0)) * k
        x0_, x1_ = int(max(X0, px - 6 * r)), int(min(X1, px + 6 * r + 1))
        y0_, y1_ = int(max(Y0, py - 6 * r)), int(min(Y1, py + 6 * r + 1))
        if x1_ > x0_ and y1_ > y0_:
            gy_, gx_ = np.mgrid[y0_:y1_, x0_:x1_]
            dot = np.exp(-((gx_ - px) ** 2 + (gy_ - py) ** 2) / (r * r)) * (1.0 if strobe else 0.75)
            dot = dot * cmask[y0_ - Y0:y1_ - Y0, x0_ - X0:x1_ - X0, 0]
            out[y0_:y1_, x0_:x1_] += dot[..., None] * np.array([1.0, 0.97, 0.9], dtype=np.float32)
    if a.twinkle:
        fac = 1 - a.twinkle_depth * tw_act * (0.5 - 0.5 * np.cos(tw_cyc * th + tw_ph))
        out += light * (fac - 1)[..., None]
    if a.glint:
        dth = np.angle(np.exp(1j * (ang - (np.pi + th))))  # starts at 9 o'clock, the visible side
        g = a.glint_gain * ring * np.exp(-(dth / 0.30) ** 2)
        out += img * g[..., None] + 0.04 * g[..., None]
    for pm in pulses:
        out += light * (pm * 0.9 * math.sin(2 * th))[..., None]
    if a.breathe:
        out += light * (bmask * a.breathe_amp * np.sin(th + b_ph))[..., None]
    if a.sheen:
        pos = u_min - 3 * sw + (u_max - u_min + 6 * sw) * (t / T)
        band = np.exp(-((u - pos) / sw) ** 2) + 0.4 * np.exp(-((u - pos + 2.6 * sw) / (0.35 * sw)) ** 2)
        s = (a.sheen_strength * band * smask * sbase)[..., None]
        out += s * np.array([1.0, 0.9, 0.72], dtype=np.float32)
    for (fm, fph, fcyc, lam, fdir) in flows:
        # packets move a whole number (fcyc) of wavelengths per loop, so the loop is exact
        sph = (yy / lam + fph - fdir * fcyc * t / T) % 1.0
        pkt = np.exp(-((sph - 0.5) / 0.09) ** 2)
        out += light * (fm * (a.flow_gain * pkt - 0.45))[..., None]
    for (bx0, by0, bx1, by1, bm, bl, bph) in bobs:
        dy = a.bob_px * k * math.sin(th + bph)
        dx = 0.4 * a.bob_px * k * math.sin(2 * th + bph)
        fl = 1.0 + 0.10 * math.sin(3 * th + bph) + 0.05 * math.sin(7 * th)
        out[by0:by1, bx0:bx1] += (shift2d(bl, dx, dy) * fl - bl) * bm
    if a.traffic:
        tl = np.zeros((H, W), np.float32)
        span = (tx1 - tx0) * W + 160 * k
        for y0c, laps, dr, off, ln, drop in zip(tr_y, tr_laps, tr_dir, tr_off, tr_len, tr_drop):
            u = (laps * t / T + off) % 1.0
            xh = tx0 * W - 80 * k + span * u
            if dr < 0:
                xh = tx1 * W + 80 * k - span * u
            yh = y0c + drop * (u - 0.5)
            nj = int(ln / (0.6 * k)) + 2  # samples closer than the dot size: a smooth streak
            for j in range(nj):  # head plus a fading trail behind it
                xj = xh - dr * ln * j / (nj - 1)
                aj = (1.0 if j == 0 else 0.22 * (1 - j / nj))
                rr = (1.7 if j == 0 else 1.0) * k
                xi0, xi1 = int(max(0, xj - 4 * rr)), int(min(W, xj + 4 * rr + 1))
                yi0, yi1 = int(max(0, yh - 4 * rr)), int(min(H, yh + 4 * rr + 1))
                if xi1 <= xi0 or yi1 <= yi0:
                    continue
                gy_, gx_ = np.mgrid[yi0:yi1, xi0:xi1]
                tl[yi0:yi1, xi0:xi1] += aj * np.exp(-((gx_ - xj) ** 2 + (gy_ - yh) ** 2) / (rr * rr))
        out += (np.minimum(tl, 1.2) * tmask)[..., None] * np.array([1.0, 0.88, 0.62], dtype=np.float32)
    if a.motes:
        layer = np.zeros((H, W), np.float32)
        mxs = m_x + m_ax * np.sin(m_c1 * th + m_p[0])
        mys = m_y + m_ay * np.sin(m_c2 * th + m_p[1])
        al = m_a * (0.55 + 0.45 * np.sin(m_c3 * th + m_p[2]))
        for x, y, r, aa in zip(mxs, mys, m_r, al):
            x0, x1 = int(max(0, x - 4 * r)), int(min(W, x + 4 * r + 1))
            y0, y1 = int(max(0, y - 4 * r)), int(min(H, y + 4 * r + 1))
            if x1 <= x0 or y1 <= y0:
                continue
            gy_, gx_ = np.mgrid[y0:y1, x0:x1]
            layer[y0:y1, x0:x1] += aa * np.exp(-((gx_ - x) ** 2 + (gy_ - y) ** 2) / (r * r))
        out += (0.75 * layer * lit)[..., None] * np.array([1.0, 0.86, 0.6], dtype=np.float32)
    out[:, :still_x] = img[:, :still_x]
    return np.clip(out * 255.0 + 0.5, 0, 255).astype(np.uint8)


ff = subprocess.Popen(
    ["ffmpeg", "-y", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}",
     "-r", str(a.fps), "-i", "-", "-c:v", "libx264", "-preset", "slow", "-crf", str(a.crf),
     "-x264-params", "ipratio=1.0:pbratio=1.0", "-pix_fmt", "yuv420p", "-movflags", "+faststart", str(a.out)],
    stdin=subprocess.PIPE)
if a.frames_dir:
    a.frames_dir.mkdir(parents=True, exist_ok=True)
first = None
peak = np.zeros((H, W), np.float32)
for i in range(N):
    f = frame(i / a.fps)
    if first is None:
        first = f
    peak = np.maximum(peak, np.abs(f.astype(np.float32) - img * 255).max(2))
    ff.stdin.write(f.tobytes())
    if a.frames_dir:
        Image.fromarray(f).save(a.frames_dir / f"f{i:04d}.png")
ff.stdin.close()
ff.wait()
seam = int(np.abs(frame(T).astype(int) - first.astype(int)).max())
left = int(peak[:, :int(W / 3)].max())
moving = float((peak > 8).mean())
print(f"{a.out}: {N} frames, {a.out.stat().st_size / 1e6:.1f} MB; loop seam max diff {seam}; "
      f"left third max change {left}; {moving:.1%} of pixels move by more than 8 levels")
