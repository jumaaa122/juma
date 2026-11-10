"""Matte the supplied chrome Montrez logo (JPEG on white) into a transparent PNG.

The strokes are chrome: dark rims with bright highlights inside, so a plain
luminance key would punch holes in the highlights.  Instead we identify the
true background (the outer field plus the enclosed counters and flourish
loops), then un-mix the anti-aliased boundary pixels against white so no pale
fringe survives on dark paper.  The logo is never cropped: the output keeps a
transparent margin around the full mark.

usage: python3 -I make_logo.py <source.jpg> <out.png> [<preview_dir>]
"""
import sys
import numpy as np
from PIL import Image
from scipy import ndimage as ndi

src, out = sys.argv[1], sys.argv[2]
preview_dir = sys.argv[3] if len(sys.argv) > 3 else None

rgb = np.asarray(Image.open(src).convert("RGB")).astype(np.float64)
L = rgb.mean(axis=2)
H, W = L.shape

# 1. Background = near-white components that are either large (the outer field,
#    big loops) or are compact enclosed counters (o, e, flourish ends).  Small
#    near-white specks along the strokes and the star facets are highlights.
lab, n = ndi.label(L >= 252)
idx = np.arange(1, n + 1)
sizes = ndi.sum(np.ones_like(L), lab, idx)
mean_l = ndi.mean(L, lab, idx)
lab2, _ = ndi.label(L >= 235)
sizes2 = ndi.sum(np.ones_like(L), lab2, np.arange(1, lab2.max() + 1))
objs = ndi.find_objects(lab)
# Enclosed counters, located by eye on the 1536 x 1024 master: the eye of
# the "e", the counter of the "o", the loop beside it and the closed end of
# the right-hand flourish.  Everything else that is near-white but small is a
# highlight on the chrome (for example the bright tip of the "t") and stays.
COUNTERS = [(994, 466), (720, 476), (678, 488), (1313, 508)]
bg_ids = [int(i) for i in idx[sizes >= 900]]
for (x, y) in COUNTERS:
    yy, xx = np.mgrid[y - 12:y + 13, x - 12:x + 13]
    ids = lab[yy, xx]
    ids = ids[ids > 0]
    assert ids.size, f"no counter found near {(x, y)}"
    bg_ids.append(int(np.bincount(ids).argmax()))
bg = np.isin(lab, bg_ids)

# Soften JPEG speckle on the chrome itself (3 x 3 median per channel).
rgb = np.dstack([ndi.median_filter(rgb[..., c], size=3) for c in range(3)])
L = rgb.mean(axis=2)

# 2. Foreground core: anything 2.5 px or more away from background.
dist, (iy, ix) = ndi.distance_transform_edt(~bg, return_indices=True)
core = dist >= 2.5
_, (cy, cx) = ndi.distance_transform_edt(~core, return_indices=True)
F = rgb[cy, cx]                       # nearest core colour for every pixel
LF = F.mean(axis=2)

alpha = np.ones_like(L)
band = (~bg) & (~core)
denom = np.maximum(255.0 - LF, 12.0)
alpha[band] = np.clip((255.0 - L[band]) / denom[band], 0.0, 1.0)
alpha[bg] = 0.0

color = rgb.copy()
color[band] = F[band]                 # pure stroke colour, no white mixed in

# Clean isolated JPEG dust in the open field (tiny islands of low alpha).
solid = alpha > 0.02
lab3, n3 = ndi.label(solid)
s3 = ndi.sum(np.ones_like(L), lab3, np.arange(1, n3 + 1))
dust = np.isin(lab3, np.arange(1, n3 + 1)[s3 < 6])
alpha[dust] = 0.0

# 3. Trim to the mark with a generous transparent margin (never cropping it).
ys, xs = np.where(alpha > 0.01)
pad = 28
x0, x1 = max(xs.min() - pad, 0), min(xs.max() + pad + 1, W)
y0, y1 = max(ys.min() - pad, 0), min(ys.max() + pad + 1, H)
rgba = np.dstack([color, alpha * 255.0])[y0:y1, x0:x1]
img = Image.fromarray(np.clip(rgba + 0.5, 0, 255).astype(np.uint8), "RGBA")
img.save(out, optimize=True)
print("logo", img.size, "bbox", (x0, y0, x1, y1), "bg comps", len(bg_ids))

if preview_dir:
    for name, bgc in (("ink", (11, 12, 15)), ("ivory", (251, 251, 249))):
        a = rgba[..., 3:4] / 255.0
        comp = rgba[..., :3] * a + np.array(bgc) * (1 - a)
        Image.fromarray(np.clip(comp + 0.5, 0, 255).astype(np.uint8)).save(
            f"{preview_dir}/logo_on_{name}.png")
