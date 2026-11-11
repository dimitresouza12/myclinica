#!/usr/bin/env python3
"""Gera, a partir de public/teeth-sprites.original.png (fundo branco, 5x2 dentes fotorrealistas):
  1. public/teeth-sprites.png  -> atlas 5x2 com fundo transparente, células iguais, dente centralizado
  2. public/teeth-sprites.webp -> o mesmo atlas, comprimido (é o que a tela carrega)
  3. src/components/prontuario/odontograma/spriteShapes.ts -> contornos (coroa, raízes, oclusal) das fotos,
     em unidades do viewBox do odontograma, para a camada interativa e as marcações ficarem alinhadas.
Uso: python3 -I scripts/odontograma-sprites.py   (requer Pillow, numpy, scipy; cwebp opcional)
"""
import json, math, os, subprocess, sys
import numpy as np
from PIL import Image
from scipy import ndimage as ndi

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'public', 'teeth-sprites.original.png')
OUT_PNG = os.path.join(ROOT, 'public', 'teeth-sprites.png')
OUT_WEBP = os.path.join(ROOT, 'public', 'teeth-sprites.webp')
OUT_TS = os.path.join(ROOT, 'src', 'components', 'prontuario', 'odontograma', 'spriteShapes.ts')
DEBUG = os.environ.get('ODO_DEBUG')  # pasta para imagens de conferência

K = 0.75                 # escala do atlas em relação à imagem original
U_SRC = 0.17             # unidades do viewBox por pixel da imagem original
UA = U_SRC / K           # unidades do viewBox por pixel do atlas
TW, TH = 252, 436        # célula do atlas (px do atlas)
MT = 8                   # margem superior do dente na vista frontal (px do atlas)
COLS = ['ci', 'ca', 'pm', 'moU', 'moL']

def runs(v):
    r, s = [], None
    for i, x in enumerate(v):
        if x and s is None: s = i
        if not x and s is not None: r.append((s, i - 1)); s = None
    if s is not None: r.append((s, len(v) - 1))
    return r

# ── 1. fundo transparente ───────────────────────────────────────
src = np.array(Image.open(SRC).convert('RGB')).astype(np.float32)
H, W, _ = src.shape
minc = src.min(axis=2)
near_white = minc >= 238
lab, n = ndi.label(near_white)
border = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
bg = np.isin(lab, list(border))
obj = ~bg
obj = ndi.binary_opening(obj, iterations=1)
core = ndi.binary_erosion(obj, iterations=2)
# cor da borda: copia da parte de dentro (tira o halo branco do fundo)
idx = ndi.distance_transform_edt(~core, return_distances=False, return_indices=True)
rgb = src[idx[0], idx[1]]
alpha = ndi.gaussian_filter(ndi.binary_erosion(obj, iterations=1).astype(np.float32), 0.8)
alpha = np.clip(alpha * 1.15, 0, 1)

# ── 2. recorta cada dente e monta as células ────────────────────
cols_ranges = runs(obj.any(axis=0)[:])
# agrupa corridas próximas (o dente pode ter vãos): junta se o vão for < 25 px
merged = []
for a, b in cols_ranges:
    if merged and a - merged[-1][1] < 25: merged[-1] = (merged[-1][0], b)
    else: merged.append((a, b))
assert len(merged) == 5, merged
row_split = 600
atlas = np.zeros((2 * TH, 5 * TW, 4), np.float32)
tiles = {}   # (col,row) -> dict(mask, rgb, ox, oy) no atlas
for c, (x0, x1) in enumerate(merged):
    for r in range(2):
        ys = slice(0, row_split) if r == 0 else slice(row_split, H)
        sub = obj[ys, x0:x1 + 1]
        yy = np.where(sub.any(axis=1))[0]
        y0, y1 = yy[0] + (0 if r == 0 else row_split), yy[-1] + (0 if r == 0 else row_split)
        crop_rgb = rgb[y0:y1 + 1, x0:x1 + 1]
        crop_a = alpha[y0:y1 + 1, x0:x1 + 1]
        # redimensiona em alfa pré-multiplicado
        w = max(1, round(crop_rgb.shape[1] * K)); h = max(1, round(crop_rgb.shape[0] * K))
        pm = np.concatenate([crop_rgb * crop_a[..., None], crop_a[..., None] * 255.0], axis=2)
        chans = [np.array(Image.fromarray(pm[..., i]).resize((w, h), Image.LANCZOS)) for i in range(4)]
        a2 = np.clip(chans[3] / 255.0, 0, 1)
        col = np.stack(chans[:3], axis=2) / np.maximum(a2[..., None], 1e-3)
        col = np.clip(col, 0, 255)
        ox = c * TW + (TW - w) // 2
        oy = r * TH + (MT if r == 0 else (TH - h) // 2)
        atlas[oy:oy + h, ox:ox + w, :3] = col
        atlas[oy:oy + h, ox:ox + w, 3] = a2 * 255
        tiles[(c, r)] = dict(ox=ox - c * TW, oy=oy - r * TH, w=w, h=h)

atlas_u8 = np.clip(atlas + 0.5, 0, 255).astype(np.uint8)
Image.fromarray(atlas_u8, 'RGBA').save(OUT_PNG, optimize=True)
if os.path.exists('/opt/homebrew/bin/cwebp') or subprocess.run(['which', 'cwebp'], capture_output=True).returncode == 0:
    subprocess.run(['cwebp', '-quiet', '-q', '88', '-alpha_q', '100', '-m', '6', OUT_PNG, '-o', OUT_WEBP], check=True)
print('atlas', atlas_u8.shape, os.path.getsize(OUT_PNG), os.path.getsize(OUT_WEBP) if os.path.exists(OUT_WEBP) else None)

if DEBUG:
    os.makedirs(DEBUG, exist_ok=True)
    bgc = np.zeros_like(atlas_u8); bgc[..., :3] = (24, 30, 40); bgc[..., 3] = 255
    a = atlas_u8[..., 3:4] / 255.0
    comp = (atlas_u8[..., :3] * a + bgc[..., :3] * (1 - a)).astype(np.uint8)
    Image.fromarray(comp).save(os.path.join(DEBUG, 'atlas-dark.png'))

# ── 3. contornos ────────────────────────────────────────────────
def tile_mask(c, r):
    return atlas_u8[r * TH:(r + 1) * TH, c * TW:(c + 1) * TW, 3] > 127
def tile_rgb(c, r):
    return atlas_u8[r * TH:(r + 1) * TH, c * TW:(c + 1) * TW, :3].astype(np.float32)

def trace(mask):
    """Contorno externo (Moore-neighbour) de uma máscara conexa, como lista de (x, y)."""
    m = np.pad(mask, 1)
    ys, xs = np.where(m)
    s = (int(ys.min()), int(xs[ys == ys.min()].min()))
    off = [(0, -1), (-1, -1), (-1, 0), (-1, 1), (0, 1), (1, 1), (1, 0), (1, -1)]  # sentido horário a partir do oeste
    pts = [s]; c = s; bdir = 0
    for _ in range(400000):
        n = None; prev = (c[0] + off[bdir][0], c[1] + off[bdir][1])
        for i in range(1, 9):
            d = (bdir + i) % 8
            q = (c[0] + off[d][0], c[1] + off[d][1])
            if m[q]: n = q; break
            prev = q
        if n is None: break
        v = (prev[0] - n[0], prev[1] - n[1])
        bdir = off.index(v)
        c = n
        if c == s and len(pts) > 3: break
        pts.append(c)
    return [(x - 1, y - 1) for y, x in pts]

def rdp(pts, eps):
    if len(pts) < 3: return pts
    a = np.array(pts[0], float); b = np.array(pts[-1], float)
    ab = b - a; L = np.hypot(*ab)
    P = np.array(pts, float)
    d = np.abs(ab[0] * (P[:, 1] - a[1]) - ab[1] * (P[:, 0] - a[0])) / L if L > 0 else np.hypot(*(P - a).T)
    i = int(np.argmax(d))
    if d[i] > eps: return rdp(pts[:i + 1], eps)[:-1] + rdp(pts[i:], eps)
    return [pts[0], pts[-1]]

def simplify_closed(pts, eps):
    # divide o laço em dois pedaços para o RDP não degenerar
    n = len(pts); h = n // 2
    a = rdp(pts[:h + 1], eps); b = rdp(pts[h:] + [pts[0]], eps)
    return a[:-1] + b[:-1]

def smooth_closed(pts, it=2):
    P = np.array(pts, float)
    for _ in range(it): P = (np.roll(P, 1, 0) + 2 * P + np.roll(P, -1, 0)) / 4
    return P

f1 = lambda v: f'{v:.1f}'.rstrip('0').rstrip('.') if abs(v) >= 0.05 else '0'
def cr_path(P, closed=True):
    """Catmull-Rom -> Bézier cúbico, só comandos M, C e Z absolutos."""
    n = len(P); segs = []
    def pt(i): return P[i % n] if closed else P[max(0, min(n - 1, i))]
    out = [f'M {f1(P[0][0])},{f1(P[0][1])}']
    for i in range(n if closed else n - 1):
        p0, p1, p2, p3 = pt(i - 1), pt(i), pt(i + 1), pt(i + 2)
        c1 = p1 + (p2 - p0) / 6; c2 = p2 - (p3 - p1) / 6
        out.append(f'C {f1(c1[0])},{f1(c1[1])} {f1(c2[0])},{f1(c2[1])} {f1(p2[0])},{f1(p2[1])}')
    if closed: out.append('Z')
    return ' '.join(out)

def contour_path(mask, to_local, eps=1.1, smooth=2):
    comp, k = ndi.label(mask)
    if k > 1:
        sizes = ndi.sum(mask, comp, range(1, k + 1)); mask = comp == (1 + int(np.argmax(sizes)))
    mask = ndi.binary_fill_holes(mask)
    pts = trace(mask)
    pts = simplify_closed(pts, eps)
    P = smooth_closed(pts, smooth)
    P = np.array([to_local(x + 0.5, y + 0.5) for x, y in P])
    return cr_path(P), P

def cervical_line(c):
    """y do colo (junção esmalte-raiz) para cada x da célula frontal: onde o amarelo da raiz começa."""
    m = tile_mask(c, 0); im = tile_rgb(c, 0)
    yel = (im[..., 0] + im[..., 1]) / 2 - im[..., 2]
    yel = ndi.gaussian_filter(yel, 4)
    ys, xs = np.where(m)
    cerv = {}
    thr = float(os.environ.get('ODO_THR', 56))
    for x in range(xs.min() + 2, xs.max() - 1):
        col = m[:, x]
        if not col.any(): continue
        top = np.where(col)[0][0]
        for y in range(top + 40, TH):
            if not m[y, x]: break
            if yel[y, x] > thr: cerv[x] = y; break
    return cerv


def to_front(px, py): return (28 + (px - TW / 2) * UA, (py - MT) * UA)
def to_occ(px, py): return (28 + (px - TW / 2) * UA, 28 + (py - TH / 2) * UA)

def cervix_curve(c):
    cerv = cervical_line(c)
    xs = np.array(sorted(cerv)); ys = np.array([cerv[x] for x in xs], float)
    m = tile_mask(c, 0); mx = np.where(m.any(axis=0))[0]
    # ajuste polinomial robusto: as bordas do esmalte têm sombra amarelada que engana o limite
    deg = 6 if COLS[c] in ('moU', 'moL') else 4
    keep = np.ones(len(xs), bool)
    for _ in range(4):
        co = np.polyfit(xs[keep] - 128, ys[keep], deg)
        res = np.abs(np.polyval(co, xs - 128) - ys)
        keep = res < max(8, np.percentile(res, 80))
    full = np.polyval(co, np.arange(mx.min(), mx.max() + 1) - 128)
    return mx.min(), full  # x inicial, y do colo por x

def split_runs(row, minw=5):
    return [(a, b) for a, b in runs(row) if b - a + 1 >= minw]

def label_roots(c, root_mask, kind, x0):
    """Rótulo de cada pixel de raiz: 1..n (da esquerda para a direita; no molar superior 2 = palatina, ao centro)."""
    lab = np.zeros(root_mask.shape, np.uint8)
    ys = np.where(root_mask.any(axis=1))[0]
    if kind == 1:
        lab[root_mask] = 1; return lab
    if kind == 'half':
        yr = min(ys[-1], int(ys[0] + 0.15 * (ys[-1] - ys[0]) + 12)); cols = np.where(root_mask[yr])[0]; xm = (cols.min() + cols.max()) / 2
        X = np.arange(root_mask.shape[1])[None, :]
        lab[root_mask & (X < xm)] = 1; lab[root_mask & (X >= xm)] = 2; return lab
    X = np.arange(root_mask.shape[1])
    rows = {y: split_runs(root_mask[y]) for y in ys}
    if kind == 2:
        xs_all = np.where(root_mask.any(axis=0))[0]; cxm = (xs_all.min() + xs_all.max()) / 2; wd = xs_all.max() - xs_all.min()
        def central_gap(r):
            for a, b in zip(r, r[1:]):
                g = (a[1] + b[0]) / 2
                if abs(g - cxm) < 0.22 * wd: return g
            return None
        yb = next(y for y in ys if central_gap(rows[y]) is not None)
        xd = {}
        last = None
        for y in ys:
            g = central_gap(rows[y])
            if g is not None: last = g
            elif y < yb: last = None
            xd[y] = last
        first = central_gap(rows[yb])
        for y in ys:
            d = xd[y] if xd[y] is not None else first
            lab[y][(root_mask[y]) & (X < d)] = 1; lab[y][(root_mask[y]) & (X >= d)] = 2
        return lab
    # 3 raízes: L, palatina (centro), R
    three = [y for y in ys if len(rows[y]) >= 3]
    ya, yb = three[0], three[-1]
    g1 = {y: (rows[y][0][1] + rows[y][1][0]) / 2 for y in three}
    g2 = {y: (rows[y][-2][1] + rows[y][-1][0]) / 2 for y in three}
    for y in ys:
        r = rows[y]
        if y < ya:
            a, b = g1[ya], g2[ya]
        elif y <= yb:
            k = min(three, key=lambda t: abs(t - y)); a, b = g1[k], g2[k]
        else:
            a = b = (r[0][1] + r[1][0]) / 2 if len(r) >= 2 else (g1[yb] + g2[yb]) / 2
            if len(r) == 1: a = b = (g1[yb] + g2[yb]) / 2
        row = root_mask[y]
        lab[y][row & (X < a)] = 1; lab[y][row & (X >= a) & (X < b)] = 3; lab[y][row & (X >= b)] = 2
    # índice final: 1 = esquerda, 2 = direita, 3 = centro (palatina)
    return lab

def axis_points(mask, n=4):
    ys = np.where(mask.any(axis=1))[0]
    y0, y1 = ys[0], ys[-1]
    cx = {}
    for y in range(y0, y1 + 1):
        xs = np.where(mask[y])[0]
        if len(xs): cx[y] = xs.mean()
    ks = np.array(sorted(cx)); vs = ndi.gaussian_filter1d(np.array([cx[k] for k in ks]), 5, mode='nearest')
    return y0, y1, lambda y: float(np.interp(y, ks, vs))

def root_shape(mask, ytop, behind=False):
    d, _ = contour_path(mask, to_front, eps=1.0, smooth=2)
    _, y1, ax = axis_points(mask)
    y0 = ytop
    H = y1 - y0
    ca = [y0 + 7 + (H * 0.70 - 7) * t for t in (0, 0.33, 0.66, 1)]
    canal = cr_path(np.array([to_front(ax(y), y) for y in ca]), closed=False)
    ya, yb = y0 + 4, y0 + H * 0.60
    p1, p2 = to_front(ax(ya), ya), to_front(ax(yb), yb)
    out = dict(d=d, canal=canal, pin=[round(p1[0], 1), round(p1[1], 1), round(p2[0], 1), round(p2[1], 1)])
    if behind: out['behind'] = True
    return out

def build_front(c, tid):
    m = tile_mask(c, 0)
    x0, cv = cervix_curve(c)
    X = np.arange(m.shape[1])[None, :]; Y = np.arange(m.shape[0])[:, None]
    cerv_img = np.full(m.shape[1], 1e9)
    cerv_img[x0:x0 + len(cv)] = cv
    cerv_img[:x0] = cv[0]; cerv_img[x0 + len(cv):] = cv[-1]
    crown = m & (Y < cerv_img[None, :])
    root = m & (Y >= cerv_img[None, :])
    # tira restos finos do esmalte que ficaram na parte de baixo e raiz que subiu ao lado da coroa
    root = ndi.binary_opening(root, iterations=2)
    crown_d, cP = contour_path(crown, to_front, eps=1.0, smooth=2)
    xs = np.where(m.any(axis=0))[0]
    cx_mid = (xs.min() + xs.max()) // 2
    crownH_px = float(cerv_img[cx_mid])
    cervix_pts = np.array([to_front(x, cerv_img[x]) for x in range(xs.min() + 3, xs.max() - 2, 6)])
    cervix_d = cr_path(cervix_pts, closed=False)
    cxs = np.where(crown.any(axis=0))[0]
    crownBox = [round(to_front(cxs.min(), 0)[0], 1), 0, round(to_front(cxs.max(), 0)[0], 1), round(crownH_px * UA, 1)]
    out = dict(col=c, crown=crown_d, cervix=cervix_d, crownH=round(crownH_px * UA, 1), crownBox=crownBox,
               bracket=[28, round(crownH_px * UA * 0.46, 1)])
    yt = crownH_px
    kinds = {'ci': 1, 'ca': 1, 'pm': 1, 'moU': 3, 'moL': 2}
    lab = label_roots(c, root, kinds[tid], x0)
    if tid == 'moU':
        parts = [(lab == 1), (lab == 3), (lab == 2)]   # distovestibular, palatina, mesiovestibular
        out['roots'] = [root_shape(parts[0], yt), root_shape(parts[1], yt, True), root_shape(parts[2], yt)]
    elif tid == 'moL':
        out['roots'] = [root_shape(lab == 1, yt), root_shape(lab == 2, yt)]
    else:
        out['roots'] = [root_shape(lab == 1, yt)]
        if tid == 'pm':
            lab2 = label_roots(c, root, 'half', x0)
            out['roots2'] = [root_shape(lab2 == 1, yt), root_shape(lab2 == 2, yt)]
    return out, dict(crown=crown, root=root, lab=lab, cerv=cerv_img)

def build_occ(c):
    m = tile_mask(c, 1)
    d, P = contour_path(m, to_occ, eps=1.0, smooth=2)
    ys, xs = np.where(m)
    x0, y0 = to_occ(xs.min(), ys.min()); x1, y1 = to_occ(xs.max() + 1, ys.max() + 1)
    cx, cy = to_occ(xs.mean(), ys.mean())
    return dict(outline=d, box=[round(x0, 1), round(y0, 1), round(x1, 1), round(y1, 1)], center=[round(cx, 1), round(cy, 1)], centerScale=0.5)

FRONT_OUT, OCC_OUT, DBG = {}, {}, {}
for c, tid in enumerate(COLS):
    FRONT_OUT[tid], DBG[tid] = build_front(c, tid)
    OCC_OUT[tid] = build_occ(c)

if DEBUG:
    from PIL import ImageDraw
    big = 2
    for c, tid in enumerate(COLS):
        d = DBG[tid]
        base = Image.fromarray(atlas_u8[0:TH, c * TW:(c + 1) * TW, :3]).convert('RGB')
        arr = np.array(base).astype(np.float32)
        colors = {1: (255, 0, 0), 2: (0, 0, 255), 3: (0, 200, 0)}
        for k, col in colors.items():
            mk = d['lab'] == k
            arr[mk] = arr[mk] * 0.5 + np.array(col) * 0.5
        arr[d['crown']] = arr[d['crown']] * 0.6 + np.array((255, 255, 0)) * 0.4
        im = Image.fromarray(arr.astype(np.uint8)).resize((TW * big, TH * big))
        dr = ImageDraw.Draw(im)
        for x in range(TW):
            if d['cerv'][x] < 1e8: dr.point((x * big, d['cerv'][x] * big), fill=(255, 0, 255))
        im.save(os.path.join(DEBUG, f'front-{tid}.png'))

def ts_dump(obj, indent=0):
    return json.dumps(obj, ensure_ascii=False, indent=2)

with open(OUT_TS, 'w') as f:
    f.write("// ARQUIVO GERADO por scripts/odontograma-sprites.py a partir de public/teeth-sprites.original.png. Não edite à mão.\n")
    f.write("// Contornos das fotos (coroa, raízes, oclusal) em unidades do viewBox do odontograma, no mesmo espaço em que a foto\n")
    f.write("// é posicionada (ver ToothDraw): vista frontal com x=28 no eixo do dente e y=0 na borda incisal/oclusal; vista oclusal\n")
    f.write("// com (28, 28) no centro da célula.\n\n")
    f.write("export type TileId = 'ci' | 'ca' | 'pm' | 'moU' | 'moL'\n")
    f.write("export interface SpriteRoot { d: string; canal: string; pin: [number, number, number, number]; behind?: boolean }\n")
    f.write("export interface FrontTile { col: number; crown: string; cervix: string; crownH: number; crownBox: [number, number, number, number]; bracket: [number, number]; roots: SpriteRoot[]; roots2?: SpriteRoot[] }\n")
    f.write("export interface OccTile { col: number; outline: string; box: [number, number, number, number]; center: [number, number]; centerScale: number }\n\n")
    f.write("export const SPRITE = " + json.dumps(dict(src='/teeth-sprites.webp', cols=5, rows=2, tileW=TW, tileH=TH, frontTop=MT, unit=round(UA, 5)), indent=2) + " as const\n\n")
    f.write("export const TILE_IDS: TileId[] = " + json.dumps(COLS) + "\n\n")
    f.write("export const FRONT_TILES: Record<TileId, FrontTile> = " + ts_dump({k: {kk: vv for kk, vv in v.items()} for k, v in FRONT_OUT.items()}) + "\n\n")
    f.write("export const OCC_TILES: Record<TileId, OccTile> = " + ts_dump({k: dict(col=COLS.index(k), **v) for k, v in OCC_OUT.items()}) + "\n")
print('ts gerado', os.path.getsize(OUT_TS))
