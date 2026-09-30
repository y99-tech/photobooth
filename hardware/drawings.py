#!/usr/bin/env python3
"""Workshop drawings from hardware/<design>/parts.json:
  <design>/sheet-layout.png|svg   colour-coded cutting layout with part numbers
  <design>/front-drawing.png      dimensioned front / side / back views
  photobooth-cnc-guide.pdf        A3 guide: renders, layouts, drawings, parts, hardware, assembly,
                                  Arabic page for the CNC workshop
Run after generate.py (and after rendering images into hardware/images/ for the cover).
"""
import json
import os
import tempfile

import matplotlib

matplotlib.use('Agg')
import matplotlib.pyplot as plt  # noqa: E402
from matplotlib import font_manager as fm  # noqa: E402
from matplotlib.backends.backend_pdf import PdfPages  # noqa: E402
from matplotlib.patches import Circle, Polygon as MplPolygon  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
IMG = os.path.join(HERE, 'images')

# Arabic-capable font (bundled woff2 → temporary ttf for matplotlib)
_tmp = tempfile.mkdtemp()
try:
    from fontTools.ttLib import TTFont

    for w, name in [('noto-sans-arabic.woff2', 'NotoSansArabic.ttf'), ('noto-sans-arabic-700.woff2', 'NotoSansArabic-Bold.ttf')]:
        f = TTFont(os.path.join(ROOT, 'public/fonts', w))
        f.flavor = None
        f.save(os.path.join(_tmp, name))
        fm.fontManager.addfont(os.path.join(_tmp, name))
    plt.rcParams['font.family'] = ['DejaVu Sans', 'Noto Sans Arabic']
except Exception as e:  # pragma: no cover
    print('Arabic font not available:', e)

COL = {
    'CUT_OUTSIDE': '#d62828', 'CUT_INSIDE': '#1d4ed8', 'CUT_DOOR': '#c026d3', 'DRILL_7': '#16a34a',
    'DRILL_10': '#0891b2', 'POCKET_8': '#f97316', 'ENGRAVE_V': '#b8860b',
}
AR_OPS = {
    'CUT_OUTSIDE': 'قص خارجي كامل (خارج الخط) — مع تابات',
    'CUT_INSIDE': 'قص داخلي كامل (داخل الخط): شبابيك وفتحات وحروف',
    'CUT_DOOR': 'قص على الخط: القطعة الناتجة هي الباب',
    'DRILL_7': 'تخريم 7 مم نافذ (مسامير كونفرمات)',
    'DRILL_10': 'تخريم 10 مم نافذ (صواميل T مقاس M8 / أرجل)',
    'POCKET_8': 'تفريغ جيب بعمق 8 مم (مجرى شريط LED)',
    'ENGRAVE_V': 'حفر زخرفة بسكينة V بعمق 3 مم',
}
MDF = '#ead9bd'


def load(style):
    return json.load(open(os.path.join(HERE, style, 'parts.json')))


def closed(ax, pts, color, lw=0.8, fill=None, ls='-', z=2):
    ax.add_patch(MplPolygon(pts, closed=True, fill=fill is not None, facecolor=fill or 'none', edgecolor=color, lw=lw, ls=ls, zorder=z))


def sheet_offsets(meta):
    """x offset of each sheet when drawn side by side (Epson editions: full sheet + offcut strip)."""
    xs, x = [], 0
    for sh in meta['sheets']:
        xs.append(x)
        x += sh['size'][0] + 220
    return xs


def draw_sheet(ax, meta, numbers=True):
    offs = sheet_offsets(meta)
    for k, sh in enumerate(meta['sheets']):
        L, Wd = sh['size']
        ox = offs[k]
        ax.add_patch(MplPolygon([(ox, 0), (ox + L, 0), (ox + L, Wd), (ox, Wd)], closed=True, facecolor='#f7f3ea', edgecolor='#777', lw=1, zorder=0))
        dim(ax, (ox, -18), (ox + L, -18), f'{int(L)} mm')
        dim(ax, (ox - 18, 0), (ox - 18, Wd), f'{int(Wd)} mm', vertical=True)
        if k:
            ax.text(ox + L / 2, Wd + 18, f'SHEET {k + 1}: offcut\nلوح {k + 1}: بواقي', ha='center', va='bottom', fontsize=8, fontweight='bold')
    for i, p in enumerate(meta['parts'], 1):
        pl = shift(meta['placement'][p['key']], offs[meta['placement'][p['key']].get('sheet', 0)])
        closed(ax, pl['sheet_outline'], COL['CUT_OUTSIDE'], 1.1, fill=MDF)
        for c in pl['cuts']:
            closed(ax, c, COL['CUT_INSIDE'], 0.7, fill='#f7f3ea', z=3)
        for d in pl['doors']:
            closed(ax, d, COL['CUT_DOOR'], 0.9, ls='--', z=3)
        for pk in pl['pockets']:
            closed(ax, pk, COL['POCKET_8'], 0.6, z=3)
        for e in pl['engrave']:
            xs, ys = zip(*e)
            ax.plot(xs, ys, color=COL['ENGRAVE_V'], lw=0.35, zorder=4)
        for x, y, r in pl['drills']:
            ax.add_patch(Circle((x, y), max(r, 4), facecolor='white', edgecolor=COL['DRILL_7'] if r < 4.5 else COL['DRILL_10'], lw=0.8, zorder=5))
        if numbers:
            xs = [q[0] for q in pl['sheet_outline']]
            ys = [q[1] for q in pl['sheet_outline']]
            cx, cy = (min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2
            if p['key'] == 'front':
                cx = min(xs) + 0.62 * (max(xs) - min(xs))
            if p['key'] in ('side1', 'side2', 'back'):
                cx = min(xs) + 0.3 * (max(xs) - min(xs))
            ax.text(cx, cy, str(i), ha='center', va='center', fontsize=9, fontweight='bold', color='white', zorder=6,
                    bbox=dict(boxstyle='circle,pad=0.25', fc='#222', ec='none'))
    ax.set_xlim(-30, offs[-1] + meta['sheets'][-1]['size'][0] + 30)
    ax.set_ylim(-30, max(sh['size'][1] for sh in meta['sheets']) + (90 if len(offs) > 1 else 30))
    ax.set_aspect('equal')
    ax.axis('off')


def shift(pl, ox):
    if not ox:
        return pl
    mv = lambda pts: [(x + ox, y) for x, y in pts]  # noqa: E731
    return dict(pl, sheet_outline=mv(pl['sheet_outline']), cuts=[mv(c) for c in pl['cuts']], doors=[mv(d) for d in pl['doors']],
                pockets=[mv(q) for q in pl['pockets']], engrave=[mv(e) for e in pl['engrave']],
                drills=[(x + ox, y, r) for x, y, r in pl['drills']])


def dim(ax, p1, p2, text, vertical=False, fs=7, color='#333'):
    ax.annotate('', xy=p1, xytext=p2, arrowprops=dict(arrowstyle='<->', lw=0.7, color=color, shrinkA=0, shrinkB=0), zorder=7)
    mx, my = (p1[0] + p2[0]) / 2, (p1[1] + p2[1]) / 2
    ax.text(mx, my, text, fontsize=fs, ha='center', va='center', rotation=90 if vertical else 0, color=color, zorder=8,
            bbox=dict(fc='white', ec='none', pad=0.6))


def legend(ax, x, y, dy=0.055, fs=8, ar_x=0.16):
    for i, (k, c) in enumerate(COL.items()):
        yy = y - i * dy
        ax.plot([x, x + 0.03], [yy, yy], color=c, lw=3, transform=ax.transAxes)
        ax.text(x + 0.04, yy, k, transform=ax.transAxes, fontsize=fs, va='center', fontweight='bold')
        ax.text(x + ar_x, yy, AR_OPS[k], transform=ax.transAxes, fontsize=fs, va='center')


def part_local(ax, p, ox=0, oy=0, mirror=False, fill=MDF, holes_fill='white'):
    def tr(pts):
        return [((-x if mirror else x) + ox, y + oy) for x, y in pts]

    closed(ax, tr(p['outline']), '#222', 1.0, fill=fill)
    for h in p['holes']:
        closed(ax, tr(h), '#1d4ed8', 0.6, fill=holes_fill, z=3)
    for d in p['doors']:
        closed(ax, tr(d), COL['CUT_DOOR'], 0.9, ls='--', z=3)
    for pk in p['pockets']:
        closed(ax, tr(pk['outer']), COL['POCKET_8'], 0.6, fill='#fde2c8', z=3)
    for e in p['engrave']:
        xs, ys = zip(*tr(e))
        ax.plot(xs, ys, color=COL['ENGRAVE_V'], lw=0.45, zorder=4)


def front_drawing(meta, fig):
    P = {p['key']: p for p in meta['parts']}
    W, D, H = meta['tower']
    T = meta['thickness']
    lift = meta.get('lift') or 0          # Epson editions: the tower stands on the printer cabinet
    cab = meta.get('cabinet')
    ax = fig.add_axes([0.02, 0.05, 0.96, 0.86])
    ax.set_aspect('equal')
    ax.axis('off')
    f = P['front']
    fh = f['size'][1]
    gap = 90 if cab else 0                 # extra room on the left for the wider cabinet
    # --- Front view
    part_local(ax, f, oy=lift)
    ring = P['ring']
    closed(ax, [(x, y + lift) for x, y in ring['outline']], '#7a5c1e', 0.8, ls='--', z=5)
    if cab:
        cw, cd, ch = cab
        c0 = (W - cw) / 2
        closed(ax, [(c0, 0), (c0 + cw, 0), (c0 + cw, ch), (c0, ch)], '#222', 0.9, fill=MDF)
        part_local(ax, P['cab_front'], ox=(W - P['cab_front']['size'][0]) / 2, oy=T)
        dim(ax, (c0, -45), (c0 + cw, -45), f'{int(cw)}')
        dim(ax, (c0 - 45, 0), (c0 - 45, ch), f'{int(ch)}', vertical=True)
        ax.text(W / 2, -110, 'FRONT  ·  الواجهة', ha='center', fontsize=10, fontweight='bold')
    else:
        dim(ax, (0, -45), (W, -45), f'{int(W)}')
        ax.text(W / 2, -110, 'FRONT  ·  الواجهة', ha='center', fontsize=10, fontweight='bold')
    dim(ax, (-55 - gap, lift), (-55 - gap, lift + H), f'{int(H)}', vertical=True)
    dim(ax, (-110 - gap, 0), (-110 - gap, lift + fh), f'{int(lift + fh)}', vertical=True)
    r, s, ps = meta['ring'], meta['screen'], meta['printSlot']
    dim(ax, (W + gap + 40, 0), (W + gap + 40, lift + r['cy']), f"camera Ø{int(2 * r['r'])} @ {int(lift + r['cy'])}", vertical=True, fs=6)
    dim(ax, (W + gap + 85, 0), (W + gap + 85, lift + s['y0']), f"screen {int(s['w'])}×{int(s['h'])} @ {int(lift + s['y0'])}", vertical=True, fs=6)
    if ps:
        dim(ax, (W + 130, 0), (W + 130, ps['y0']), f"print slot {int(ps['w'])}×{int(ps['h'])} @ {int(ps['y0'])}", vertical=True, fs=6)
    # --- Side section with shelves and base / cabinet
    sx = W + 330 + gap
    if cab:
        cw, cd, ch = cab
        bx0, bx1 = sx - (cd - D) / 2, sx + D + (cd - D) / 2
        closed(ax, [(bx0, 0), (bx1, 0), (bx1, T), (bx0, T)], '#222', 0.8, fill=MDF)                # cabinet bottom
        closed(ax, [(bx0, ch - T), (bx1, ch - T), (bx1, ch), (bx0, ch)], '#222', 0.8, fill=MDF)    # cabinet top
        closed(ax, [(bx0, T), (bx0 + T, T), (bx0 + T, ch - T), (bx0, ch - T)], '#222', 0.8, fill=MDF)  # cabinet back
        closed(ax, [(bx1 - T, T), (bx1, T), (bx1, ch - T), (bx1 - T, ch - T)], '#222', 0.8, fill=MDF)  # cabinet front
        ep = meta['epson']
        px1 = bx1 - T - 20
        closed(ax, [(px1 - ep['d'], T), (px1, T), (px1, T + ep['h']), (px1 - ep['d'], T + ep['h'])], '#555', 0.8, fill='#e6e6e6')
        ax.text(px1 - ep['d'] / 2, T + ep['h'] / 2, f"Epson L8050\n{int(ep['w'])}×{int(ep['d'])}×{int(ep['h'])}", fontsize=5.5, ha='center', va='center')
        ax.text(bx0 + 30, ch - T - 30, 'printer cabinet\nدولاب الطابعة', fontsize=6, va='top')
        dim(ax, (bx0, -45), (bx1, -45), f'{int(cd)}')
    else:
        base_w, base_d = meta['base']
        bx0, bx1 = sx - (base_d - D) / 2, sx + D + (base_d - D) / 2
        closed(ax, [(bx0, -T), (bx1, -T), (bx1, 0), (bx0, 0)], '#222', 0.8, fill=MDF)  # base plate
        dim(ax, (sx, -45), (sx + D, -45), f'{int(D)}')
    closed(ax, [(sx, lift), (sx + T, lift), (sx + T, lift + H), (sx, lift + H)], '#222', 0.8, fill=MDF)                 # back
    closed(ax, [(sx + D - T, lift), (sx + D, lift), (sx + D, lift + fh), (sx + D - T, lift + fh)], '#222', 0.8, fill=MDF)  # front (with crest)
    for name, y in meta['levels'].items():
        y += lift
        closed(ax, [(sx + T, y), (sx + D - T, y), (sx + D - T, y + T), (sx + T, y + T)], '#222', 0.8, fill='#d8c3a0')
        ax.text(sx + D / 2, y + T + 14, {'bottom': 'floor', 'printer': 'printer shelf', 'camera': 'camera shelf', 'top': 'top'}[name], fontsize=6, ha='center')
        dim(ax, (sx - 40 - (80 if cab else 0), 0), (sx - 40 - (80 if cab else 0), y + T), f'{int(y + T)}', vertical=True, fs=5.5)
    ax.text(sx + D / 2, -110, 'SIDE SECTION  ·  قطاع جانبي', ha='center', fontsize=10, fontweight='bold')
    ax.text(sx + D + (95 if cab else 12), 1150, 'guest side →', fontsize=6, rotation=90, va='center')
    # --- Back view
    bx = sx + D + 320
    part_local(ax, P['back'], ox=bx, oy=lift)
    ax.text(bx + W / 2, -110, 'BACK (outside)  ·  الظهر', ha='center', fontsize=10, fontweight='bold')
    if cab:
        cw, cd, ch = cab
        c0 = bx + (W - cw) / 2
        closed(ax, [(c0, 0), (c0 + cw, 0), (c0 + cw, ch), (c0, ch)], '#222', 0.9, fill=MDF)
        part_local(ax, P['cab_back'], ox=bx + (W - P['cab_back']['size'][0]) / 2, oy=T)
        ax.text(bx + W / 2, lift + H / 2, 'door\nالباب', ha='center', fontsize=7, color=COL['CUT_DOOR'])
        ax.text(bx + W / 2, ch / 2, 'printer door\nباب الطابعة', ha='center', fontsize=7, color=COL['CUT_DOOR'])
    else:
        ax.text(bx + W / 2, 850, 'upper door\nالباب العلوي', ha='center', fontsize=7, color=COL['CUT_DOOR'])
        ax.text(bx + W / 2, 250, 'lower door\nالباب السفلي', ha='center', fontsize=7, color=COL['CUT_DOOR'])
    # --- Side panel
    spx = bx + W + 170 + (60 if cab else 0)
    part_local(ax, P['side1'], ox=spx, oy=lift)
    ax.text(spx + P['side1']['size'][0] / 2, -110, 'SIDE ×2  ·  الجانب', ha='center', fontsize=10, fontweight='bold')
    if cab:
        part_local(ax, P['cab_side2'], ox=spx + (P['side1']['size'][0] - P['cab_side2']['size'][0]) / 2, oy=T)
    ax.set_xlim(-170 - gap, spx + P['side1']['size'][0] + 60 + (80 if cab else 0))
    ax.set_ylim(-170, lift + fh + 60)


def parts_table(ax, meta, x0, y0, fs=7.5):
    rows = [('#', 'Part', 'القطعة', 'Size (mm)')]
    for i, p in enumerate(meta['parts'], 1):
        rows.append((str(i), p['name'], p['name_ar'], f"{p['size'][0]} × {p['size'][1]}"))
    for j, r in enumerate(rows):
        y = y0 - j * 0.042
        w = 'bold' if j == 0 else 'normal'
        ax.text(x0, y, r[0], transform=ax.transAxes, fontsize=fs, fontweight=w)
        ax.text(x0 + 0.03, y, r[1], transform=ax.transAxes, fontsize=fs, fontweight=w)
        ax.text(x0 + 0.52, y, r[2], transform=ax.transAxes, fontsize=fs, fontweight=w, ha='right')
        ax.text(x0 + 0.54, y, r[3], transform=ax.transAxes, fontsize=fs, fontweight=w)


TITLE = {'wedding': ('Wedding — Moorish Arch Totem', 'تصميم الزفاف — القوس المغربي'),
         'events': ('Events — Neon Totem', 'تصميم المناسبات — النيون'),
         'wedding-epson': ('Wedding + Epson cabinet', 'الزفاف + دولاب طابعة إبسون'),
         'events-epson': ('Events + Epson cabinet', 'المناسبات + دولاب طابعة إبسون')}


def name(meta):
    return meta.get('name') or meta['style']


def sheet_text(meta):
    t = int(meta['thickness'])
    if len(meta['sheets']) == 1:
        return f"One MDF sheet {int(meta['sheet'][1])} × {int(meta['sheet'][0])} mm, {t} mm thick · {round(meta['usage'] * 100)}% of the sheet used"
    off = meta['sheets'][1]['size']
    return (f"One full MDF sheet {int(meta['sheet'][1])} × {int(meta['sheet'][0])} mm ({round(meta['usage'] * 100)}% used) "
            f"+ an offcut strip {int(max(off))} × {int(min(off))} mm, {t} mm thick")


def page_layout(pdf, meta):
    style = name(meta)
    fig = plt.figure(figsize=(16.54, 11.69))
    fig.text(0.03, 0.955, f'{TITLE[style][0]} · cutting layout', fontsize=18, fontweight='bold')
    fig.text(0.97, 0.955, f'{TITLE[style][1]} · مخطط القص', fontsize=18, fontweight='bold', ha='right')
    fig.text(0.03, 0.925, f"{sheet_text(meta)} · tool 6 mm · {len(meta['parts'])} parts · DXF units: mm (1:1)", fontsize=10, color='#444')
    ax = fig.add_axes([0.02, 0.33, 0.96, 0.58])
    draw_sheet(ax, meta)
    info = fig.add_axes([0.03, 0.02, 0.94, 0.29])
    info.axis('off')
    legend(info, 0.0, 0.95)
    parts_table(info, meta, 0.44, 0.95, fs=7.2 if len(meta['parts']) < 16 else 6.4)
    pdf.savefig(fig)
    fig.savefig(os.path.join(HERE, style, 'sheet-layout.png'), dpi=110)
    plt.close(fig)
    # clean SVG of the sheet (for laser / other CAM previews)
    fig = plt.figure(figsize=((sheet_offsets(meta)[-1] + meta['sheets'][-1]['size'][0]) / 100, 12.2))
    ax = fig.add_axes([0, 0, 1, 1])
    draw_sheet(ax, meta, numbers=False)
    fig.savefig(os.path.join(HERE, style, 'sheet-layout.svg'))
    plt.close(fig)


def page_drawing(pdf, meta):
    style = name(meta)
    fig = plt.figure(figsize=(16.54, 11.69))
    fig.text(0.03, 0.955, f'{TITLE[style][0]} · drawings (mm)', fontsize=18, fontweight='bold')
    fig.text(0.97, 0.955, f'{TITLE[style][1]} · الرسومات (مم)', fontsize=18, fontweight='bold', ha='right')
    front_drawing(meta, fig)
    pdf.savefig(fig)
    fig.savefig(os.path.join(HERE, style, 'front-drawing.png'), dpi=110)
    plt.close(fig)


def image(ax, path):
    ax.axis('off')
    if os.path.exists(path):
        ax.imshow(plt.imread(path))


def page_cover(pdf):
    fig = plt.figure(figsize=(16.54, 11.69))
    fig.text(0.5, 0.94, 'Photobooth Totem — CNC cut from ONE MDF sheet', fontsize=26, fontweight='bold', ha='center')
    fig.text(0.5, 0.9, 'فوتو بوث — يُقص بالكامل من لوح MDF واحد (122 × 244 سم، 18 مم)', fontsize=20, ha='center')
    for i, (name, style) in enumerate([('Wedding · زفاف', 'wedding'), ('Events · مناسبات', 'events')]):
        ax = fig.add_axes([0.04 + i * 0.47, 0.2, 0.45, 0.66])
        image(ax, os.path.join(IMG, f'{style}-front.png'))
        fig.text(0.265 + i * 0.47, 0.18, name, fontsize=16, ha='center', fontweight='bold')
    specs = ('Tower 360 × 260 mm · 1.85 m tall · base 600 × 480 mm   ·   15.6″ portrait touch screen · 10″ ring light + camera · '
             'Canon SELPHY print slot · 2 service doors · carry handles · knock-down base   ·   Epson L8050 edition: page 2')
    fig.text(0.5, 0.11, specs, fontsize=10.5, ha='center', color='#333', wrap=True)
    fig.text(0.5, 0.075, 'برج 36 × 26 سم بارتفاع 1.85 م · شاشة لمس 15.6 بوصة رأسية · رينج لايت 10 بوصة وكاميرا · فتحة طابعة سيلفي · بابين صيانة · مقابض حمل', fontsize=11, ha='center', color='#333')
    fig.text(0.5, 0.03, 'Runs the open-source Photobooth app (Windows 11 / Raspberry Pi) · github.com/y99-tech/photobooth', fontsize=9, ha='center', color='#777')
    pdf.savefig(fig)
    plt.close(fig)


def page_epson(pdf, metas):
    fig = plt.figure(figsize=(16.54, 11.69))
    fig.text(0.5, 0.94, 'Epson edition — for the Epson L8050 / L805 photo printer', fontsize=24, fontweight='bold', ha='center')
    fig.text(0.5, 0.9, 'نسخة طابعة إبسون L8050 / L805 — الطابعة في دولاب تحت البرج', fontsize=19, ha='center')
    for i, m in enumerate(metas):
        ax = fig.add_axes([0.02 + i * 0.3, 0.13, 0.28, 0.74])
        image(ax, os.path.join(IMG, f'{name(m)}-front.png'))
        off = m['sheets'][1]['size']
        fig.text(0.16 + i * 0.3, 0.11, TITLE[name(m)][0] + '  ·  ' + TITLE[name(m)][1], fontsize=11, ha='center', fontweight='bold')
        fig.text(0.16 + i * 0.3, 0.085, f'1 sheet + offcut {int(max(off))} × {int(min(off))} mm', fontsize=10, ha='center', color='#444')
    m = metas[0]
    cw, cd, ch = m['cabinet']
    ep = m['epson']
    lines = [
        ('Why a cabinet?', True),
        (f"The Epson L8050 is {int(ep['w'])} mm wide (the L805 about 542 mm).", False),
        (f"The tower is only 324 mm wide inside, so the printer", False),
        (f"lives in a {int(cw)} × {int(cd)} × {int(ch)} mm cabinet that", False),
        ('replaces the base. The tower bolts on top of it.', False),
        ('', False),
        ('What changes', True),
        (f"• Tower is shorter ({int(m['tower'][2])} mm) so the camera", False),
        (f"  stays at {int(m['lift'] + m['ring']['cy'])} mm and the total height is the same.", False),
        ('• No print slot and no printer shelf in the tower.', False),
        ('• Wide print window in the cabinet front.', False),
        ('• Big back door to load paper and swap the printer,', False),
        ('  side door for refilling the ink tanks, vents.', False),
        ('• Needs the full sheet + one small offcut strip', False),
        ('  (most workshops have one; or buy a ¼ sheet).', False),
        ('', False),
        ('Check the printer before cutting!', True),
        ('Measure your printer with its trays open. Change', False),
        ("EPSON / CAB_W / CAB_D / CAB_H in generate.py.", False),
        ('', False),
        ('ليه دولاب؟', True),
        ('عرض الطابعة أكبر من عرض البرج، فبنحطها في دولاب', False),
        ('تحت البرج بنفس ارتفاع الكاميرا. يحتاج لوح كامل', False),
        ('وشريحة بواقي صغيرة. قيس الطابعة قبل القص.', False),
    ]
    y = 0.84
    for t, b in lines:
        fig.text(0.62 if not any('\u0600' <= c <= '\u06ff' for c in t) else 0.98, y, t, fontsize=13 if b else 11,
                 fontweight='bold' if b else 'normal', color='#7a5c1e' if b else '#222',
                 ha='left' if not any('\u0600' <= c <= '\u06ff' for c in t) else 'right')
        y -= 0.034 if t else 0.018
    pdf.savefig(fig)
    plt.close(fig)


HARDWARE = [
    ('MDF sheet 18 mm, 122 × 244 cm', 'لوح MDF سمك 18 مم مقاس 122×244', '1'),
    ('Confirmat screws 7 × 50 + cover caps', 'مسامير كونفرمات 7×50 + طواقي', '≈ 50'),
    ('Steel L-brackets 30 mm + 3.5 × 16 screws (front, no visible screws)', 'زوايا حديد 30 مم + مسامير 3.5×16 (لتثبيت الواجهة من الداخل)', '10'),
    ('M8 T-nuts (hammer-in)', 'صواميل T مقاس M8', '8'),
    ('M8 × 40 bolts + washers (tower → base)', 'مسامير قلاووظ M8×40 + وردة', '4'),
    ('M8 levelling feet', 'أرجل تسوية M8', '4'),
    ('Small hinges 35 mm + magnetic catches (2 doors)', 'مفصلات صغيرة 35 مم + مغناطيس للأبواب', '4 + 2'),
    ('Wood glue, filler, MDF primer & paint', 'غراء خشب، معجون، سيلر وبوية', '—'),
    ('Frosted acrylic 3 mm + 12 V LED strip (light box behind crest / SMILE)', 'أكريليك لبني 3 مم + شريط LED 12 فولت (خلف القوس / كلمة SMILE)', '1 + 1–2 m'),
    ('Events: 17 mm aluminium LED profile + 5 m LED strip + 12 V 3 A adapter', 'المناسبات: بروفيل ألومنيوم 17 مم + 5 م شريط LED + محول 12 فولت 3 أمبير', '1 set'),
    ('Ballast 10 kg (sand bag / tiles) in the bottom compartment', 'ثقل 10 كجم (شيكارة رمل) في الدرج السفلي', '1'),
    ('Epson edition: MDF offcut strip ≈ 116 × 35 cm + 3 more hinges & magnets', 'نسخة إبسون: شريحة بواقي ≈ 116×35 سم + 3 مفصلات ومغناطيس زيادة', '1'),
]
ELECTRONICS = [
    ('15.6″ portable touch monitor (portrait, ≤ 225 × 357 mm body)', 'شاشة لمس محمولة 15.6 بوصة (رأسية)'),
    ('10″ (26 cm) ring light', 'رينج لايت 10 بوصة (26 سم)'),
    ('DSLR / mirrorless or 1080p webcam', 'كاميرا DSLR أو ويب كام 1080p'),
    ('Mini PC (Windows 11) or Raspberry Pi 5', 'ميني PC (ويندوز 11) أو راسبيري باي 5'),
    ('Canon SELPHY CP1500, or Epson L8050 / L805 (Epson edition)', 'طابعة كانون سيلفي CP1500 أو إبسون L8050 / L805'),
    ('Power strip, USB speaker, cables', 'مشترك كهرباء، سماعة USB، كابلات'),
]
STEPS = [
    'Cut: engrave → pockets → drills → inside cuts → door cuts → outside cuts (tabs on small parts).',
    'Sand, seal MDF edges with filler/primer (edges drink paint), then paint. Gold-paint the engraving & rosette (wedding).',
    'Glue the two monitor rails behind the front panel, either side of the screen window.',
    'Box: screw the 4 plates (floor, printer, camera, top) between the side panels with confirmat screws (Ø7 holes).',
    'Screw the back panel onto the sides and plates (confirmat). Hang the two doors (the cut-out pieces) with hinges + magnets.',
    'Fix the front panel from the inside with L-brackets — no screws visible on the front.',
    'Glue the rosette / ring on the front, centred on the camera hole (use the cut-out disc as a centring jig).',
    'Hammer T-nuts into the floor plate from inside; bolt the tower to the base from below; fit levelling feet.',
    'Mount ring light behind the round hole, camera on the camera shelf (¼″ screw through the slot), monitor into the window '
    '(clamp bars + foam), printer on its shelf in line with the slot, PC + power strip + 10 kg ballast in the bottom.',
    'LED strip + frosted acrylic light box behind the crest hearts / SMILE letters. Cables exit through the side hole.',
    'Epson edition: build the cabinet box (top, bottom, sides, front, back) with confirmat, bolt the tower onto the cabinet '
    'top, printer inside facing the print window, hang the back and ink doors. The PC can sit in the cabinet too.',
]


def page_assembly(pdf):
    fig = plt.figure(figsize=(16.54, 11.69))
    fig.text(0.03, 0.955, 'Assembly, hardware & electronics', fontsize=18, fontweight='bold')
    fig.text(0.97, 0.955, 'التجميع والخامات والإلكترونيات', fontsize=18, fontweight='bold', ha='right')
    image(fig.add_axes([0.0, 0.3, 0.36, 0.62]), os.path.join(IMG, 'wedding-exploded.png'))
    ax = fig.add_axes([0.37, 0.04, 0.61, 0.88])
    ax.axis('off')
    y = 0.98
    ax.text(0, y, 'Assembly steps', fontsize=13, fontweight='bold')
    for i, s in enumerate(STEPS, 1):
        y -= 0.047
        ax.text(0, y, f'{i}. {s}', fontsize=8.6, wrap=True, va='top')
        if len(s) > 118:
            y -= 0.022
    y -= 0.06
    ax.text(0, y, 'Hardware per booth  ·  الخامات لكل بوث', fontsize=13, fontweight='bold')
    for en, arb, q in HARDWARE:
        y -= 0.032
        ax.text(0, y, f'• {en}', fontsize=8.3)
        ax.text(0.99, y, arb, fontsize=8.3, ha='right')
        ax.text(0.585, y, q, fontsize=8.3, ha='center', fontweight='bold')
    el = fig.add_axes([0.02, 0.03, 0.34, 0.26])
    el.axis('off')
    el.text(0, 0.95, 'Electronics  ·  الإلكترونيات', fontsize=13, fontweight='bold')
    for i, (en, arb) in enumerate(ELECTRONICS):
        el.text(0, 0.8 - i * 0.14, f'• {en}', fontsize=8)
        el.text(0, 0.8 - i * 0.14 - 0.065, arb, fontsize=8, color='#555')
    pdf.savefig(fig)
    plt.close(fig)


AR_PAGE = [
    ('بيانات القص', [
        'الخامة: لوح MDF واحد مقاس 122 × 244 سم وسمك 18 مم (يمكن تعديل السمك في ملف generate.py)',
        'الملف: ملف DXF بالمليمتر بمقياس 1:1، وكل عملية على طبقة (Layer) مستقلة بلون مختلف',
        'البنطة: 6 مم فلات (يُفضل Compression أو Upcut بسلاحين)، وكل الزوايا الداخلية بنصف قطر 3 مم على الأقل',
        'السرعات المقترحة: 18000 لفة/دقيقة، تغذية 2500–3500 مم/دقيقة، نزول 800 مم/دقيقة، على 3 مرات (6 مم كل مرة)',
        'التابات: ضع تابات 8 × 3 مم كل 30 سم تقريبًا، خصوصًا للقطع الصغيرة والأبواب',
    ]),
    ('ترتيب العمليات', [
        'أولًا: حفر الزخارف والكتابة بسكينة V بزاوية 60 أو 90 درجة وعمق 3 مم — طبقة ENGRAVE_V',
        'ثانيًا: تفريغ مجاري شريط LED بعمق 8 مم (تصميم المناسبات فقط) — طبقة POCKET_8',
        'ثالثًا: التخريم النافذ — طبقتا DRILL_7 و DRILL_10',
        'رابعًا: القص الداخلي داخل الخط (الشبابيك والفتحات والقلوب وحروف SMILE) — طبقة CUT_INSIDE',
        'خامسًا: قص الأبواب على الخط، والقطعة الخارجة من الظهر هي الباب نفسه — طبقة CUT_DOOR',
        'سادسًا: القص الخارجي لكل القطع خارج الخط كآخر عملية — طبقة CUT_OUTSIDE',
        'ملحوظة: طبقتا SHEET و LABELS للتوضيح فقط ولا تُقص',
    ]),
    ('قبل القص', [
        'تأكد من مقاس الشاشة والرينج لايت: شباك الشاشة 196 × 346 مم (شاشة 15.6 بوصة رأسية) وفتحة الكاميرا قطر 262 مم (رينج لايت 10 بوصة)',
        'لو المقاسات مختلفة عدّلها في أول ملف generate.py ثم أعد توليد الملفات',
        'راجع أن لوح الـ MDF مستوٍ وثبّته جيدًا بالشفط أو بالمسامير خارج أماكن القطع',
    ]),
    ('نسخة طابعة إبسون L8050 / L805', [
        'الطابعة أعرض من البرج، لذلك توضع في دولاب 60 × 42 × 37 سم تحت البرج بدل القاعدة، والبرج أقصر ليفضل ارتفاع الكاميرا 1.42 م',
        'تحتاج لوح كامل + شريحة بواقي صغيرة (حوالي 116 × 35 سم للزفاف و 108 × 35 سم للمناسبات) — ملفين DXF: sheet1 و sheet2-offcut',
        'قيس الطابعة والأدراج مفتوحة قبل القص، وعدّل المقاسات في generate.py لو مختلفة',
    ]),
    ('التجميع باختصار', [
        'الأرفف الأربعة بين الجانبين بمسامير كونفرمات، ثم الظهر، ثم الواجهة من الداخل بزوايا حديد (بدون مسامير ظاهرة)',
        'الأبواب تتركب بمفصلات صغيرة ومغناطيس، والقاعدة تُربط من تحت بمسامير M8 في صواميل T بالأرضية الداخلية',
        'ضع ثقل 10 كجم في الدرج السفلي لثبات البوث',
    ]),
]


def page_arabic(pdf):
    fig = plt.figure(figsize=(16.54, 11.69))
    fig.text(0.97, 0.94, 'تعليمات ورشة الـ CNC', fontsize=24, fontweight='bold', ha='right')
    fig.text(0.97, 0.905, 'فوتو بوث — تصميمين (زفاف ومناسبات) كل تصميم من لوح MDF واحد، ونسخة لطابعة إبسون', fontsize=14, ha='right', color='#444')
    y = 0.86
    for title, lines in AR_PAGE:
        fig.text(0.97, y, title, fontsize=15, fontweight='bold', ha='right', color='#7a5c1e')
        for ln in lines:
            y -= 0.031
            fig.text(0.97, y, ln, fontsize=11, ha='right')
        y -= 0.045
    ax = fig.add_axes([0.03, 0.05, 0.42, 0.3])
    ax.axis('off')
    ax.text(0, 1.05, 'ألوان الطبقات', fontsize=13, fontweight='bold', color='#7a5c1e', transform=ax.transAxes)
    legend(ax, 0.0, 0.92, dy=0.13, fs=9, ar_x=0.3)
    pdf.savefig(fig)
    plt.close(fig)


def main():
    metas = [load(s) for s in ('wedding', 'events', 'wedding-epson', 'events-epson')]
    out = os.path.join(HERE, 'photobooth-cnc-guide.pdf')
    with PdfPages(out) as pdf:
        page_cover(pdf)
        page_epson(pdf, metas[2:])
        for m in metas:
            page_layout(pdf, m)
            page_drawing(pdf, m)
        page_assembly(pdf)
        page_arabic(pdf)
    print('→', os.path.relpath(out, ROOT))


if __name__ == '__main__':
    main()
