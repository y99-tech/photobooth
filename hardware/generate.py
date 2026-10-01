#!/usr/bin/env python3
"""
Photobooth "totem" enclosures for CNC routers.

  SELPHY editions  (wedding / events)            : ONE MDF sheet each
  Epson editions   (wedding-epson / events-epson): the totem stands on an open-back printer
                   cabinet for an Epson L8050 → also ONE MDF sheet each (the monitor rails and
                   clamp bars are nested inside window cut-outs, see CUT_NESTED)

  Sheet : 1220 x 2440 mm (standard MDF sheet sold in Egypt, 122 x 244 cm)
  Board : 18 mm MDF (change T for 16 mm)
  Tool  : 6 mm flat end mill (all inside corners have >= 3 mm radius)

Outputs per design (hardware/<design>/):
  *.dxf        cut file, 1:1 mm, layers per operation (see LAYERS)
  parts.json   part outlines + 3D placement (used by the 3D viewer)

Run:  python3 hardware/generate.py
"""
import io
import json
import math
import os

import ezdxf
from fontTools.pens.basePen import BasePen
from fontTools.ttLib import TTFont
from shapely import affinity
from shapely.geometry import LineString, MultiPolygon, Point, Polygon, box
from shapely.ops import unary_union

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)

# ---------------------------------------------------------------- dimensions
T = 18.0                      # board thickness
SHEET_L, SHEET_W = 2440.0, 1220.0
MARGIN, GAP = 8.0, 10.0       # sheet edge margin, spacing between parts (6 mm tool + 4 mm web)

W, D = 360.0, 260.0              # tower outside width, depth
IW, ID = W - 2 * T, D - 2 * T    # inside width (324) / depth (224)
BASE_W, BASE_D = 600.0, 480.0    # floor plate (SELPHY editions)
MONITOR = dict(w=225.0, h=357.0)  # monitor body (portrait) for the holder rails
CAMERA_Y = 1420.0                # camera / ring-light centre above the FLOOR (both editions)

# Epson printer cabinet (the totem stands on it). Inside 504 x 362 x 334 mm fits an
# Epson L8050 (418 x 305 x 179) with the rear paper feeder up; prints come out through the
# front window. The back is open (one stretcher rail at the top): paper, ink, cables and the
# PC are reached from behind, and the cabinet top doubles as the tower floor.
# The older, wider L805 (542 mm) needs CAB_W = 600 and then no longer fits one sheet.
CAB_W, CAB_D, CAB_H = 540.0, 380.0, 370.0
EPSON = dict(w=418.0, d=305.0, h=179.0)

# Set by setup(printer): body height, openings and shelf levels (measured from the tower floor)
PRINTER = H = RING = SCREEN = PRINT_SLOT = SPEAKER = LEVELS = TEXT_Y = PLATE_Y = LIFT = None


def setup(printer):
    """SELPHY: 1600 mm tower on a floor plate. Epson: shorter tower on a 370 mm printer cabinet,
    so the camera, screen and total height stay where guests expect them."""
    global PRINTER, H, RING, SCREEN, PRINT_SLOT, SPEAKER, LEVELS, TEXT_Y, PLATE_Y, LIFT
    PRINTER = printer
    LIFT = CAB_H if printer == 'epson' else 0.0            # tower floor height above the ground
    cy = CAMERA_Y - LIFT
    H = cy + 180.0
    RING = dict(cx=W / 2, cy=cy, r=131.0)                 # 10" ring light (254 mm OD); camera looks through it
    SCREEN = dict(x0=82.0, y0=cy - 535.0, w=196.0, h=346.0)  # 15.6" portrait touch monitor, viewable area
    SPEAKER = dict(cx=W / 2, cy=cy - 620.0)
    if printer == 'selphy':
        PRINT_SLOT = dict(x0=80.0, y0=385.0, w=200.0, h=70.0)  # Canon SELPHY prints come out here
        LEVELS = dict(bottom=0.0, printer=362.0, camera=cy - 93.0, top=H - T)
        TEXT_Y = dict(wedding=(668.0, 565.0), events=(660.0, 575.0))   # (Arabic line, Latin line)
    else:
        PRINT_SLOT = None                                   # prints come out of the cabinet
        LEVELS = dict(camera=cy - 93.0, top=H - T)          # no floor plate: the cabinet top is the floor
        TEXT_Y = dict(wedding=(292.0, 190.0), events=(300.0, 215.0))
    PLATE_Y = [v + T / 2 for v in LEVELS.values()]

LAYERS = {
    # name: (DXF colour, description)
    'CUT_OUTSIDE': (1, 'Profile cut, OUTSIDE the line, through 18 mm (add tabs)'),
    'CUT_NESTED': (140, 'Small parts nested inside a window: cut OUTSIDE the line, BEFORE CUT_INSIDE (add tabs)'),
    'CUT_INSIDE': (5, 'Profile cut, INSIDE the line, through 18 mm (windows, holes, slots, letters)'),
    'CUT_DOOR': (6, 'Door openings: cut ON the line, through — the loose piece becomes the door'),
    'DRILL_7': (3, 'Drill 7 mm through (confirmat screw shank holes)'),
    'DRILL_10': (4, 'Drill 10 mm through (M8 T-nuts / bolts / levelling feet)'),
    'POCKET_8': (30, 'Pocket 8 mm deep (LED strip channels)'),
    'ENGRAVE_V': (2, 'V-bit engrave 3 mm deep, 60/90 deg (decoration, text)'),
    'SHEET': (8, 'Sheet outline 1220 x 2440 — do not cut'),
    'LABELS': (7, 'Part names — do not cut'),
}


# ---------------------------------------------------------------- geometry helpers
def rect(x0, y0, w, h, r=0.0):
    b = box(x0, y0, x0 + w, y0 + h)
    if r <= 0:
        return b
    if r >= min(w, h) / 2 - 0.01:  # slot / capsule
        r = min(w, h) / 2
        if w >= h:
            line = LineString([(x0 + r, y0 + r), (x0 + w - r, y0 + r)])
        else:
            line = LineString([(x0 + r, y0 + r), (x0 + r, y0 + h - r)])
        return line.buffer(r, quad_segs=12)
    return b.buffer(-r, join_style=2).buffer(r, quad_segs=12)


def circle(cx, cy, r, n=64):
    return Point(cx, cy).buffer(r, quad_segs=n // 4)


def bezier(p0, p1, p2, p3, n=40):
    pts = []
    for i in range(n + 1):
        t = i / n
        a, b, c, d = (1 - t) ** 3, 3 * t * (1 - t) ** 2, 3 * t * t * (1 - t), t ** 3
        pts.append((a * p0[0] + b * p1[0] + c * p2[0] + d * p3[0], a * p0[1] + b * p1[1] + c * p2[1] + d * p3[1]))
    return pts


def heart(cx, cy, w, n=90):
    pts = []
    for i in range(n):
        t = 2 * math.pi * i / n
        x = 16 * math.sin(t) ** 3
        y = 13 * math.cos(t) - 5 * math.cos(2 * t) - 2 * math.cos(3 * t) - math.cos(4 * t)
        pts.append((cx + x * w / 32, cy + (y + 2) * w / 32))
    # soften the bottom point so a 6 mm tool can follow it
    return Polygon(pts).buffer(-2).buffer(2)


def rings(geom):
    """All boundary rings of a (multi)polygon as coordinate lists."""
    out = []
    polys = geom.geoms if isinstance(geom, MultiPolygon) else [geom]
    for p in polys:
        out.append(list(p.exterior.coords))
        out += [list(i.coords) for i in p.interiors]
    return out


# ---------------------------------------------------------------- text → CNC paths
class _FlatPen(BasePen):
    def __init__(self, glyphset, dx, dy, scale):
        super().__init__(glyphset)
        self.dx, self.dy, self.s = dx, dy, scale
        self.contours, self.cur = [], []

    def _p(self, pt):
        return (self.dx + pt[0] * self.s, self.dy + pt[1] * self.s)

    def _moveTo(self, pt):
        self.cur = [self._p(pt)]

    def _lineTo(self, pt):
        self.cur.append(self._p(pt))

    def _curveToOne(self, p1, p2, p3):
        a = self.cur[-1]
        for q in bezier(a, self._p(p1), self._p(p2), self._p(p3), 10)[1:]:
            self.cur.append(q)

    def _qCurveToOne(self, p1, p2):
        a, c, b = self.cur[-1], self._p(p1), self._p(p2)
        for i in range(1, 9):
            t = i / 8
            self.cur.append(((1 - t) ** 2 * a[0] + 2 * t * (1 - t) * c[0] + t * t * b[0], (1 - t) ** 2 * a[1] + 2 * t * (1 - t) * c[1] + t * t * b[1]))

    def _closePath(self):
        if len(self.cur) > 2:
            if self.cur[0] != self.cur[-1]:
                self.cur.append(self.cur[0])
            self.contours.append(self.cur)
        self.cur = []

    _endPath = _closePath


_font_cache = {}


def _font(path):
    if path not in _font_cache:
        tt = TTFont(path)
        tt.flavor = None  # woff2 → plain sfnt for HarfBuzz
        buf = io.BytesIO()
        tt.save(buf)
        _font_cache[path] = (TTFont(io.BytesIO(buf.getvalue())), buf.getvalue())
    return _font_cache[path]


def text_contours(text, font_path, height, cx, cy, max_width=None):
    """Shaped text (Latin or Arabic, via HarfBuzz) as closed contours, centred on (cx, cy)."""
    import uharfbuzz as hb

    tt, data = _font(font_path)
    hbfont = hb.Font(hb.Face(hb.Blob(data)))
    buf = hb.Buffer()
    buf.add_str(text)
    buf.guess_segment_properties()
    hb.shape(hbfont, buf, {'kern': True, 'liga': True})
    order = tt.getGlyphOrder()
    gs = tt.getGlyphSet()
    pen = _FlatPen(gs, 0, 0, 1.0)
    x = 0
    for info, pos in zip(buf.glyph_infos, buf.glyph_positions):
        pen.dx, pen.dy = x + pos.x_offset, pos.y_offset
        gs[order[info.codepoint]].draw(pen)
        x += pos.x_advance
    pts = [p for c in pen.contours for p in c]
    minx, maxx = min(p[0] for p in pts), max(p[0] for p in pts)
    miny, maxy = min(p[1] for p in pts), max(p[1] for p in pts)
    s = height / (maxy - miny)
    if max_width and (maxx - minx) * s > max_width:
        s = max_width / (maxx - minx)
    ox, oy = (minx + maxx) / 2, (miny + maxy) / 2
    return [[(cx + (px - ox) * s, cy + (py - oy) * s) for px, py in c] for c in pen.contours]


def contours_to_polygons(contours):
    """Outer contours → polygons (used for cut-through letters in the 3D model)."""
    polys = [Polygon(c).buffer(0) for c in contours if len(c) > 3]
    polys.sort(key=lambda p: -p.area)
    outers = []
    for p in polys:
        if not any(o.contains(p) for o in outers):
            outers.append(p)
    return outers


FONT_SCRIPT = os.path.join(ROOT, 'public/fonts/great-vibes.woff2')
FONT_ARABIC = os.path.join(ROOT, 'public/fonts/aref-ruqaa.woff2')
FONT_ARABIC_BOLD = os.path.join(ROOT, 'public/fonts/noto-sans-arabic-700.woff2')
import matplotlib  # noqa: E402  (only for its bundled DejaVu font)

FONT_BOLD = os.path.join(matplotlib.get_data_path(), 'fonts/ttf/DejaVuSans-Bold.ttf')


# ---------------------------------------------------------------- parts
class Part:
    def __init__(self, key, name, name_ar, outline, note=''):
        self.key, self.name, self.name_ar, self.note = key, name, name_ar, note
        self.outline = outline
        self.cuts = []      # shapely polygons or ('circle', cx, cy, r)
        self.doors = []     # shapely polygons (slug becomes a door)
        self.drills = []    # (cx, cy, dia)
        self.pockets = []   # shapely polygons
        self.engrave = []   # coordinate lists
        self.place = None   # (X, Y, rot) on the sheet
        self.nest = None    # (host key, outline in host coords, extra rotation) for parts cut inside a window
        self.pose = None    # 3D placement for the viewer

    def bbox(self):
        return self.outline.bounds


def confirmat_rows(part, xs, ys):
    for y in ys:
        for x in xs:
            part.drills.append((x, y, 7.0))


# ---- front panels (the part that makes each design) -------------------------
def front_common(p):
    p.cuts.append(('circle', RING['cx'], RING['cy'], RING['r']))
    s = SCREEN
    p.cuts.append(rect(s['x0'], s['y0'], s['w'], s['h'], 3))
    ps = PRINT_SLOT
    if ps:
        p.cuts.append(rect(ps['x0'], ps['y0'], ps['w'], ps['h'], 10))


def front_wedding():
    # Body + Moorish ogee arch crest (H → H + 250 mm)
    L = [(0, H), (0, H + 40)]
    L += bezier((0, H + 40), (0, H + 130), (60, H + 145), (110, H + 170))[1:]
    L += bezier((110, H + 170), (160, H + 195), (178, H + 220), (180, H + 250))[1:]
    R = [(W - x, y) for x, y in reversed(L)]
    crest = Polygon(L + R[1:] + [(W, H)])
    outline = unary_union([box(0, 0, W, H), crest]).buffer(1).buffer(-1)
    p = Part('front', 'Front panel — Arch', 'الواجهة الأمامية — قوس', outline)
    front_common(p)
    # Hearts cut through the crest (backlight them with a warm LED strip)
    p.cuts.append(heart(W / 2, H + 88, 92))
    p.cuts.append(heart(100, H + 46, 34))
    p.cuts.append(heart(W - 100, H + 46, 34))
    # Speaker grille: holes laid out in a heart
    for i in range(24):
        t = 2 * math.pi * i / 24
        x = 16 * math.sin(t) ** 3
        y = 13 * math.cos(t) - 5 * math.cos(2 * t) - 2 * math.cos(3 * t) - math.cos(4 * t)
        p.cuts.append(('circle', SPEAKER['cx'] + x * 3.4, SPEAKER['cy'] + y * 3.4, 3.5))
    # Engraved double border following the whole outline (including the arch)
    for off in (20, 28):
        p.engrave += rings(outline.buffer(-off, quad_segs=12))
    # Engraved frame around the screen
    s = SCREEN
    p.engrave += rings(rect(s['x0'] - 12, s['y0'] - 12, s['w'] + 24, s['h'] + 24, 14))
    # Texts (edit here for the couple's names)
    ya, yl = TEXT_Y['wedding']
    p.engrave += text_contours('ألف مبروك', FONT_ARABIC, 44, W / 2, ya, max_width=270)
    p.engrave += text_contours('Just Married', FONT_SCRIPT, 58, W / 2, yl, max_width=290)
    return p


def front_events():
    outline = box(0, 0, W, H + 100).union(rect(0, H - 40, W, 260, 70))
    p = Part('front', 'Front panel — Neon', 'الواجهة الأمامية — نيون', outline)
    front_common(p)
    # "SMILE" cut through the topper — back it with frosted acrylic + LED strip
    letters = text_contours('SMILE', FONT_BOLD, 96, W / 2, H + 112, max_width=292)
    for poly in contours_to_polygons(letters):
        p.cuts.append(poly)
    # LED channel: 17 x 8 mm pocket for aluminium LED profile, following the outline
    # (inset 22 mm from the edge; around the rounded top corners the channel follows a 48 mm radius)
    top, rr = H + 220 - 22, 48
    arc_l = [(70 - rr * math.cos(a), top - rr + rr * math.sin(a)) for a in [i * math.pi / 2 / 12 for i in range(13)]]
    arc_r = [(W - 70 + rr * math.sin(a), top - rr + rr * math.cos(a)) for a in [i * math.pi / 2 / 12 for i in range(13)]]
    path = LineString([(22, 90)] + arc_l + arc_r + [(W - 22, 90)])
    p.pockets.append(path.buffer(8.5, cap_style=1, quad_segs=8))
    # Speaker grille: hexagon cutouts
    hexes = []
    for row in range(-3, 4):
        for col in range(-3, 4):
            cx = SPEAKER['cx'] + col * 17 + (8.5 if row % 2 else 0)
            cy = SPEAKER['cy'] + row * 14.7
            if math.hypot(cx - SPEAKER['cx'], cy - SPEAKER['cy']) < 52:
                hexes.append(Polygon([(cx + 7 * math.cos(math.pi / 6 + k * math.pi / 3), cy + 7 * math.sin(math.pi / 6 + k * math.pi / 3)) for k in range(6)]))
    p.cuts += hexes
    # Engraving: twin rings round the camera, screen frame, texts
    for r in (RING['r'] + 12, RING['r'] + 20):
        p.engrave += rings(circle(RING['cx'], RING['cy'], r, 128))
    s = SCREEN
    p.engrave += rings(rect(s['x0'] - 12, s['y0'] - 12, s['w'] + 24, s['h'] + 24, 20))
    ya, yl = TEXT_Y['events']
    p.engrave += text_contours('PHOTO BOOTH', FONT_BOLD, 30, W / 2, yl, max_width=270)
    p.engrave += text_contours('ابتسم', FONT_ARABIC_BOLD, 50, W / 2, ya, max_width=200)
    return p


# ---- shared body ----------------------------------------------------------
def back_panel():
    door_top = LEVELS['camera'] - 15
    if PRINTER == 'selphy':
        p = Part('back', 'Back panel (with 2 doors)', 'الظهر (ببابين)', box(0, 0, W, H))
        p.doors.append(rect(40, 395, W - 80, door_top - 395, 0))   # upper service door (screen, camera, PC)
        p.doors.append(rect(40, 40, W - 80, 300, 0))                # lower door (printer paper, power, ballast)
        p.cuts.append(('circle', W - 70, 850, 14))                  # finger holes
        p.cuts.append(('circle', W - 70, 190, 14))
    else:
        p = Part('back', 'Back panel (with door)', 'الظهر (بباب)', box(0, 0, W, H))
        p.doors.append(rect(40, 40, W - 80, door_top - 40, 0))      # one tall service door
        p.cuts.append(('circle', W - 70, 490, 14))
    for i in range(5):                                              # vents: top of the back + in the (lower) door
        p.cuts.append(rect(88 + i * 45 - 5, H - 120, 10, 80, 5))
        p.cuts.append(rect(88 + i * 45 - 5, 90, 10, 70, 5))
    # Confirmat screws into the side panels' edges and the plates' edges
    edge_rows = [60, 250] + [y for y in range(480, int(H) - 250, 240)] + [H - 180, H - 60]
    confirmat_rows(p, [T / 2, W - T / 2], edge_rows)
    confirmat_rows(p, [70, W - 70], PLATE_Y)
    confirmat_rows(p, [W / 2], PLATE_Y[1:])
    return p


def side_panel(n, cable=False):
    p = Part(f'side{n}', f'Side panel {n}', f'الجانب {n}', box(0, 0, ID, H))
    p.cuts.append(rect(ID / 2 - 60, H - 520, 120, 34, 17))   # carry handle
    if cable:
        p.cuts.append(('circle', ID / 2, 70, 22))          # power cable exit
    confirmat_rows(p, [45, ID / 2, ID - 45], PLATE_Y)
    return p


def plate(key, name, name_ar, notch=True):
    outline = box(0, 0, IW, ID)
    if notch:  # cable pass-through at the back-left corner
        outline = outline.difference(rect(-10, ID - 40, 60, 50, 0)).buffer(-3).buffer(3)
    p = Part(key, name, name_ar, outline)
    return p


def plates():
    bottom = plate('bottom', 'Floor plate', 'القاعدة الداخلية', notch=False)
    for x, y in [(40, 40), (IW - 40, 40), (40, ID - 40), (IW - 40, ID - 40)]:
        bottom.drills.append((x, y, 10.0))            # M8 T-nuts: tower → base plate
    camera = plate('camera', 'Camera shelf', 'رف الكاميرا')
    camera.cuts.append(rect(IW / 2 - 3.5, 45, 7, 110, 3.5))   # 1/4" tripod screw slot (adjust depth)
    top = plate('top', 'Top plate', 'السقف', notch=False)
    for x in (IW / 4, IW / 2, 3 * IW / 4):
        top.cuts.append(('circle', x, ID / 2, 14))           # warm-air vents
    if PRINTER == 'epson':
        return [camera, top]                              # the cabinet top is the tower floor
    return [bottom, plate('printer', 'Printer shelf', 'رف الطابعة'), camera, top]


def base_plate(style):
    if style == 'wedding':
        core = rect(30, 30, BASE_W - 60, BASE_D - 60, 0)
        ring = core.exterior  # scalloped "cloud" edge: circles every 60 mm along the inset outline
        bumps = [circle(*ring.interpolate(d).coords[0], 30, 32) for d in range(0, int(ring.length), 60)]
        outline = unary_union([core] + bumps)
        name = 'Base plate — scalloped'
    else:
        outline = rect(0, 0, BASE_W, BASE_D, 60)
        name = 'Base plate — rounded'
    p = Part('base', name, 'قاعدة الأرضية', outline)
    tx, tz = (BASE_W - W) / 2 + T, (BASE_D - D) / 2 + T   # inside of tower walls on the base
    for x, y in [(40, 40), (IW - 40, 40), (40, ID - 40), (IW - 40, ID - 40)]:
        p.drills.append((tx + x, tz + y, 10.0))             # M8 bolts up into the floor plate
    for x, y in [(55, 55), (BASE_W - 55, 55), (55, BASE_D - 55), (BASE_W - 55, BASE_D - 55)]:
        p.drills.append((x, y, 10.0))                       # M8 levelling feet (T-nuts)
    if style == 'events':
        groove = rect(28, 28, BASE_W - 56, BASE_D - 56, 40).exterior
        p.pockets.append(LineString(groove.coords).buffer(6, quad_segs=6))   # glowing LED edge
    else:
        p.engrave += rings(outline.buffer(-16, quad_segs=10))
    return p


def ring_overlay(style):
    if style == 'wedding':
        core = circle(RING['cx'], RING['cy'], 143, 128)
        bumps = [circle(RING['cx'] + 141 * math.cos(a), RING['cy'] + 141 * math.sin(a), 13, 24) for a in [i * 2 * math.pi / 20 for i in range(20)]]
        outline = unary_union([core] + bumps)
        p = Part('ring', 'Camera rosette (glue on front)', 'وردة إطار الكاميرا', outline)
    else:
        outline = circle(RING['cx'], RING['cy'], 155, 128)
        p = Part('ring', 'Camera ring (glue on front)', 'حلقة إطار الكاميرا', outline)
        p.engrave += rings(circle(RING['cx'], RING['cy'], 146, 128))
    p.cuts.append(('circle', RING['cx'], RING['cy'], RING['r']))
    return p


# ---- Epson printer cabinet (replaces the base in the Epson editions) --------
CIW, CIH = CAB_W - 2 * T, CAB_H - 2 * T      # inside width 504, inside height 334
CAB_RAIL = 100.0                             # back stretcher rail under the top


def cabinet(style):
    """Top & bottom full size; sides between them; front and the back rail between the sides.
    Part coordinates: y = 0 (top/bottom) and x = 0 (sides) is the guest side."""
    parts = []
    tx, tz = (CAB_W - W) / 2, (CAB_D - D) / 2          # tower footprint on the cabinet top
    for key, name, name_ar in [('cab_top', 'Cabinet top = tower floor', 'سطح الدولاب = أرضية البرج'),
                               ('cab_bottom', 'Cabinet bottom', 'أرضية دولاب الطابعة')]:
        outline = rect(0, 0, CAB_W, CAB_D, 20 if style == 'events' else 6)
        p = Part(key, name, name_ar, outline)
        # confirmat into the sides (x), the front (y = 0) and, for the top, the back rail
        confirmat_rows(p, [T / 2, CAB_W - T / 2], [60, CAB_D / 2, CAB_D - 60])
        confirmat_rows(p, [90, CAB_W / 2, CAB_W - 90], [T / 2] + ([CAB_D - T / 2] if key == 'cab_top' else []))
        if key == 'cab_top':
            # 4 steel L-brackets in the tower's inside corners, M8 bolts + wing nuts from below
            for x, y in [(T + 30, T + 30), (W - T - 30, T + 30), (T + 30, D - T - 30), (W - T - 30, D - T - 30)]:
                p.drills.append((tx + x, tz + y, 10.0))
            p.cuts.append(rect(tx + W / 2 - 100, tz + D / 2 - 45, 200, 90, 45))   # cables + warm air into the tower
            if style == 'events':
                p.pockets.append(LineString(rect(28, 28, CAB_W - 56, CAB_D - 56, 30).exterior.coords).buffer(6, quad_segs=6))
            else:
                p.engrave += rings(outline.buffer(-16, quad_segs=10))
        else:
            for x, y in [(55, 55), (CAB_W - 55, 55), (55, CAB_D - 55), (CAB_W - 55, CAB_D - 55)]:
                p.drills.append((x, y, 10.0))                      # M8 levelling feet
        parts.append(p)
    for n in (1, 2):
        p = Part(f'cab_side{n}', f'Cabinet side {n}', f'جانب الدولاب {n}', box(0, 0, CAB_D, CIH))
        p.cuts.append(rect(CAB_D / 2 - 60, CIH - 64, 120, 34, 17))       # carry handle
        for i in range(5):
            p.cuts.append(rect(110 + i * 40, 60, 10, 140, 5))           # vents (printer + PC heat)
        confirmat_rows(p, [T / 2], [60, CIH / 2, CIH - 60])               # into the front
        confirmat_rows(p, [CAB_D - T / 2], [CIH - CAB_RAIL / 2])          # into the back rail
        parts.append(p)
    # Front: the window where guests take their prints (the monitor rails are cut out of it)
    front = Part('cab_front', 'Cabinet front (print window)', 'واجهة الدولاب (شباك الصور)', box(0, 0, CIW, CIH))
    if style == 'wedding':
        L = [(48, 20), (48, 170)] + bezier((48, 170), (48, 215), (190, 215), (CIW / 2, 250))[1:]
        R = [(CIW - x, y) for x, y in reversed(L)]
        window = Polygon(L + R[1:]).buffer(-1).buffer(1)            # arched window, matching the crest
        front.cuts.append(window)
        front.engrave += rings(box(0, 0, CIW, CIH).buffer(-14, join_style=2))
        front.engrave += rings(window.buffer(12, quad_segs=12))
        front.engrave += text_contours('خذ صورتك', FONT_ARABIC, 32, CIW / 2 - 140, 292, max_width=110)
        front.engrave += text_contours('Your photo', FONT_SCRIPT, 36, CIW / 2 + 140, 292, max_width=120)
        front.cuts.append(heart(CIW / 2, 292, 28))
    else:
        window = rect(48, 20, CIW - 96, 205, 30)
        front.cuts.append(window)
        front.pockets.append(LineString(rect(24, 24, CIW - 48, CIH - 48, 24).exterior.coords).buffer(8.5, quad_segs=8))
        front.engrave += text_contours('PRINTS', FONT_BOLD, 26, CIW / 2 - 85, 274, max_width=140)
        front.engrave += text_contours('الصور', FONT_ARABIC_BOLD, 38, CIW / 2 + 85, 274, max_width=110)
        front.cuts.append(('circle', CIW / 2, 274, 8))
    front.window = window
    parts.append(front)
    # Back: open, with one stretcher rail under the top (keeps the box square)
    rail = Part('cab_rail', 'Cabinet back rail', 'عارضة ظهر الدولاب', rect(0, 0, CIW, CAB_RAIL, 0))
    rail.cuts.append(('circle', CIW / 2, CAB_RAIL / 2, 14))           # finger hole to lift the cabinet
    parts.append(rail)
    return parts


def nest_in(part, host, window, cx, cy, rot=0):
    """Cut `part` out of the slug of `host`'s window (centred on cx, cy, rotated by rot)."""
    g = affinity.rotate(part.outline, rot, origin=(0, 0))
    b = g.bounds
    g = affinity.translate(g, cx - (b[0] + b[2]) / 2, cy - (b[1] + b[3]) / 2)
    assert window.buffer(-(GAP - 0.5)).contains(g), f'{part.key} does not fit inside the {host.key} window'
    part.nest = (host.key, g, rot)


def monitor_holders():
    """Two rails glued behind the front + two clamp bars that press the monitor against the window."""
    out = []
    for i in (1, 2):
        out.append(Part(f'rail{i}', f'Monitor rail {i}', f'مجرى الشاشة {i}', box(0, 0, 380, 40)))
    for i in (1, 2):
        b = Part(f'bar{i}', f'Monitor clamp bar {i}', f'مشبك الشاشة {i}', rect(0, 0, 300, 55, 8))
        b.cuts.append(rect(8, 20, 30, 15, 7.5))       # slotted screw holes → adjustable
        b.cuts.append(rect(300 - 38, 20, 30, 15, 7.5))
        out.append(b)
    return out


# ---------------------------------------------------------------- nesting (one sheet)
def place_all(parts):
    P = {p.key: p for p in parts}
    hf = P['front'].bbox()[3]
    y0 = MARGIN
    lay = [
        ('front', MARGIN, y0, 90),
        ('back', MARGIN, y0 + W + GAP, 90),
        ('side1', MARGIN, y0 + 2 * (W + GAP), 90),
        ('side2', MARGIN, y0 + 2 * (W + GAP) + ID + GAP, 90),
    ]
    ax = MARGIN + H + GAP                          # region behind the 1600 mm panels
    ay = y0 + W + GAP
    lay.append(('base', ax, ay, 90))
    px = ax + BASE_D + GAP
    lay += [('bottom', px, ay, 0), ('printer', px, ay + ID + GAP, 0), ('camera', px, ay + 2 * (ID + GAP), 0)]
    bx = MARGIN + hf + GAP                         # region behind the front panel
    lay += [('top', bx, MARGIN, 90), ('ring', bx + ID + GAP, MARGIN, 0)]
    ry = ay + BASE_W + GAP
    lay += [('rail1', ax, ry, 0), ('rail2', ax, ry + 40 + GAP, 0)]
    by = ay + 3 * (ID + GAP)
    lay += [('bar1', px, by, 0), ('bar2', px, by + 55 + GAP, 0)]
    for key, X, Y, rot in lay:
        P[key].place = (X, Y, rot)
    return lay


def pack(parts, sheets_fixed, order=None, heuristic='bssf'):
    """MaxRects (best short side fit, rotation allowed). Long panels are pre-placed on sheet 0;
    everything else goes to sheet 0 if it fits, otherwise to sheet 1 (the offcut)."""
    def rsize(p, rot):
        b = affinity.rotate(p.outline, rot, origin=(0, 0)).bounds
        return b[2] - b[0] + GAP, b[3] - b[1] + GAP

    bins = []
    for fixed in sheets_fixed:
        free = [(MARGIN, MARGIN, SHEET_L - 2 * MARGIN + GAP, SHEET_W - 2 * MARGIN + GAP)]
        for (x, y, w, h) in fixed:
            free = _cut(free, (x, y, w + GAP, h + GAP))
        bins.append(free)
    for p in (order or sorted(parts, key=lambda q: -q.outline.area)):
        for bi, free in enumerate(bins):
            best = None
            for rot in (0, 90):
                w, h = rsize(p, rot)
                for (fx, fy, fw, fh) in free:
                    if w <= fw + 1e-6 and h <= fh + 1e-6:
                        if heuristic == 'bssf':
                            score = (min(fw - w, fh - h), max(fw - w, fh - h), fx + fy * 0.01)
                        elif heuristic == 'baf':
                            score = (fw * fh - w * h, min(fw - w, fh - h), fx)
                        else:  # bottom-left
                            score = (fy + h, fx)
                        if best is None or score < best[0]:
                            best = (score, fx, fy, rot, w, h)
            if best:
                _, fx, fy, rot, w, h = best
                p.place, p.sheet = (fx, fy, rot), bi
                bins[bi] = _cut(free, (fx, fy, w, h))
                break
        else:
            raise SystemExit(f'{p.key} does not fit on any sheet')


def _cut(free, r):
    x, y, w, h = r
    out = []
    for (fx, fy, fw, fh) in free:
        if x >= fx + fw or x + w <= fx or y >= fy + fh or y + h <= fy:
            out.append((fx, fy, fw, fh))
            continue
        if x > fx:
            out.append((fx, fy, x - fx, fh))
        if x + w < fx + fw:
            out.append((x + w, fy, fx + fw - x - w, fh))
        if y > fy:
            out.append((fx, fy, fw, y - fy))
        if y + h < fy + fh:
            out.append((fx, y + h, fw, fy + fh - y - h))
    # prune rectangles contained in others
    return [a for i, a in enumerate(out) if not any(
        j != i and a[0] >= b[0] and a[1] >= b[1] and a[0] + a[2] <= b[0] + b[2] and a[1] + a[3] <= b[1] + b[3] and (a != b or j < i)
        for j, b in enumerate(out))]


def place_epson(parts):
    """Nest everything on one sheet (MaxRects over many part orders / heuristics). If a layout
    ever needs more room, the rest goes on a second, smallest-possible offcut."""
    import random
    free = [p for p in parts if not p.nest]
    rng = random.Random(7)
    orders = [sorted(free, key=lambda q: -q.outline.area), sorted(free, key=lambda q: -max(q.bbox()[2] - q.bbox()[0], q.bbox()[3] - q.bbox()[1]))]
    orders += [rng.sample(free, len(free)) for _ in range(600)]
    best = None
    for order in orders:
        for heur in ('bssf', 'baf', 'bl'):
            try:
                pack(free, [[], []], order, heur)
            except SystemExit:
                continue
            spill = [p for p in free if p.sheet == 1]
            if spill:
                x0, y0, x1, y1 = unary_union([placed(p, p.outline) for p in spill]).bounds
                cost = (x1 + MARGIN) * (y1 + MARGIN)
            else:
                # one sheet: prefer the layout that leaves the biggest clean offcut (rightmost part edge smallest)
                cost = -1e9 + max(placed(p, p.outline).bounds[2] for p in free)
            if best is None or cost < best[0]:
                best = (cost, {p.key: (p.place, p.sheet) for p in free})
    for p in free:
        p.place, p.sheet = best[1][p.key]
    place_nested(parts)


def place_nested(parts):
    P = {p.key: p for p in parts}
    for p in parts:
        if p.nest:
            host_key, g, rot = p.nest
            host = P[host_key]
            G = placed(host, g)
            p.place, p.sheet = (G.bounds[0], G.bounds[1], (host.place[2] + rot) % 360), host.sheet


def placed(p, geom_or_circle):
    """Part-local geometry → sheet coordinates."""
    X, Y, rot = p.place
    minx, miny, _, _ = affinity.rotate(p.outline, rot, origin=(0, 0)).bounds
    if isinstance(geom_or_circle, tuple):
        _, cx, cy, r = geom_or_circle
        q = affinity.rotate(Point(cx, cy), rot, origin=(0, 0))
        return ('circle', q.x - minx + X, q.y - miny + Y, r)
    if isinstance(geom_or_circle, list):  # coordinate list
        g = affinity.rotate(LineString(geom_or_circle), rot, origin=(0, 0))
        return [(x - minx + X, y - miny + Y) for x, y in g.coords]
    g = affinity.rotate(geom_or_circle, rot, origin=(0, 0))
    return affinity.translate(g, X - minx, Y - miny)


def check_sheet(parts):
    if not parts:
        return 0
    geoms = [placed(p, p.outline) for p in parts]
    for p, g in zip(parts, geoms):
        x0, y0, x1, y1 = g.bounds
        assert x0 >= MARGIN - 0.01 and y0 >= MARGIN - 0.01 and x1 <= SHEET_L - MARGIN + 0.01 and y1 <= SHEET_W - MARGIN + 0.01, f'{p.key} leaves the sheet: {g.bounds}'
    for i in range(len(geoms)):
        for j in range(i + 1, len(geoms)):
            a, b = parts[i], parts[j]
            if (a.nest and a.nest[0] == b.key) or (b.nest and b.nest[0] == a.key):
                host, guest = (b, a) if a.nest else (a, b)
                hole = placed(host, host.window)
                d = hole.exterior.distance(placed(guest, guest.outline))
                assert hole.contains(placed(guest, guest.outline)) and d >= GAP - 0.5, f'{guest.key} is too close to the edge of the {host.key} window'
                continue
            d = geoms[i].distance(geoms[j])
            assert d >= GAP - 0.5, f'{a.key} and {b.key} are only {d:.1f} mm apart'
    used = sum(p.outline.area for p in parts if not p.nest)
    return used / (SHEET_L * SHEET_W)


def offcut_size(parts):
    """Smallest board (rounded up to 10 mm, with margins) that holds these parts."""
    geoms = [placed(p, p.outline) for p in parts]
    x1 = max(g.bounds[2] for g in geoms) + MARGIN
    y1 = max(g.bounds[3] for g in geoms) + MARGIN
    return [math.ceil(x1 / 10) * 10, math.ceil(y1 / 10) * 10]


# ---------------------------------------------------------------- DXF export
def write_dxf(parts, path, title, size=(SHEET_L, SHEET_W)):
    doc = ezdxf.new('R2010', setup=True)
    doc.units = ezdxf.units.MM
    doc.header['$INSUNITS'] = 4
    for name, (color, desc) in LAYERS.items():
        doc.layers.add(name, color=color).description = desc
    msp = doc.modelspace()

    def poly(coords, layer):
        msp.add_lwpolyline([(round(x, 3), round(y, 3)) for x, y in coords], close=True, dxfattribs={'layer': layer})

    def geom(g, layer):
        if isinstance(g, tuple):
            msp.add_circle((g[1], g[2]), g[3], dxfattribs={'layer': layer})
            return
        for ring in rings(g):
            poly(ring[:-1] if ring[0] == ring[-1] else ring, layer)

    poly([(0, 0), (size[0], 0), (size[0], size[1]), (0, size[1])], 'SHEET')
    for p in parts:
        o = placed(p, p.outline)
        poly(list(o.exterior.coords)[:-1], 'CUT_NESTED' if p.nest else 'CUT_OUTSIDE')
        for c in p.cuts:
            geom(placed(p, c), 'CUT_INSIDE')
        for d in p.doors:
            geom(placed(p, d), 'CUT_DOOR')
        for x, y, dia in p.drills:
            geom(placed(p, ('circle', x, y, dia / 2)), 'DRILL_7' if dia < 9 else 'DRILL_10')
        for pk in p.pockets:
            geom(placed(p, pk), 'POCKET_8')
        for e in p.engrave:
            msp.add_lwpolyline([(round(x, 3), round(y, 3)) for x, y in placed(p, e)], close=e[0] == e[-1], dxfattribs={'layer': 'ENGRAVE_V'})
        c = o.representative_point()
        msp.add_text(p.name, height=14, dxfattribs={'layer': 'LABELS'}).set_placement((c.x, c.y), align=ezdxf.enums.TextEntityAlignment.MIDDLE_CENTER)
    msp.add_text(title, height=16, dxfattribs={'layer': 'LABELS'}).set_placement((20, size[1] + 20))
    doc.saveas(path)


# ---------------------------------------------------------------- 3D placement for the viewer
def poses(parts):
    """World coords (mm): x right, y up, z towards the guest. Tower centred on x=0, z=0; floor y=0."""
    P = {p.key: p for p in parts}
    zf = D / 2
    L = LIFT   # tower floor height (0, or on top of the printer cabinet)
    P['front'].pose = dict(plane='xy', x=-W / 2, y=L, z=zf - T, flip=False)
    P['back'].pose = dict(plane='xy', x=W / 2, y=L, z=-zf, flip=True)          # seen from behind
    P['side1'].pose = dict(plane='zy', x=-W / 2, y=L, z=zf - T, flip=False)
    P['side2'].pose = dict(plane='zy', x=W / 2 - T, y=L, z=zf - T, flip=False)
    for k in LEVELS:
        P[k].pose = dict(plane='xz', x=-IW / 2, y=L + LEVELS[k], z=zf - T, flip=False)
    if 'base' in P:
        P['base'].pose = dict(plane='xz', x=-BASE_W / 2, y=-T, z=BASE_D / 2, flip=False)
    P['ring'].pose = dict(plane='xy', x=-W / 2, y=L, z=zf, flip=False)
    for i, k in enumerate(('rail1', 'rail2')):
        x = SCREEN['x0'] + SCREEN['w'] / 2 + (-1 if i == 0 else 1) * (MONITOR['w'] / 2 + 20) - W / 2
        P[k].pose = dict(plane='xy', x=x - 20, y=L + SCREEN['y0'] + SCREEN['h'] / 2 - 190, z=zf - 2 * T, rot90=True)
    for i, k in enumerate(('bar1', 'bar2')):
        y = SCREEN['y0'] + SCREEN['h'] / 2 + (-1 if i == 0 else 1) * 110
        P[k].pose = dict(plane='xy', x=-150, y=L + y - 27, z=zf - 3 * T, flip=False)
    if 'cab_top' in P:
        cz = CAB_D / 2
        P['cab_bottom'].pose = dict(plane='xz', x=-CAB_W / 2, y=0, z=cz)
        P['cab_top'].pose = dict(plane='xz', x=-CAB_W / 2, y=CAB_H - T, z=cz)
        P['cab_side1'].pose = dict(plane='zy', x=-CAB_W / 2, y=T, z=cz)
        P['cab_side2'].pose = dict(plane='zy', x=CAB_W / 2 - T, y=T, z=cz)
        P['cab_front'].pose = dict(plane='xy', x=-CIW / 2, y=T, z=cz - T)
        P['cab_rail'].pose = dict(plane='xy', x=CIW / 2, y=CAB_H - T - CAB_RAIL, z=-cz, flip=True)


def part_json(p):
    def g2j(g):
        if isinstance(g, tuple):
            g = circle(g[1], g[2], g[3], 48)
        polys = g.geoms if isinstance(g, MultiPolygon) else [g]
        return [{'outer': list(q.exterior.coords), 'holes': [list(i.coords) for i in q.interiors]} for q in polys]

    holes = []
    for c in p.cuts:  # doors stay closed in the 3D model (their outline is drawn as a line)
        for q in g2j(c):
            holes.append(q['outer'])
    for x, y, d in p.drills:
        holes.append(list(circle(x, y, d / 2, 12).exterior.coords))
    return {
        'key': p.key, 'name': p.name, 'name_ar': p.name_ar,
        'outline': list(p.outline.exterior.coords), 'holes': holes,
        'doors': [list(d.exterior.coords) for d in p.doors],
        'pockets': [q for pk in p.pockets for q in g2j(pk)],
        'engrave': p.engrave, 'pose': p.pose,
        'size': [round(p.outline.bounds[2] - p.outline.bounds[0]), round(p.outline.bounds[3] - p.outline.bounds[1])],
    }


# ---------------------------------------------------------------- build
def placement_json(p):
    return {'place': p.place, 'sheet': getattr(p, 'sheet', 0), 'nested': bool(p.nest), 'sheet_outline': list(placed(p, p.outline).exterior.coords),
            'cuts': [list(placed(p, circle(c[1], c[2], c[3], 32) if isinstance(c, tuple) else c).exterior.coords) for c in p.cuts],
            'doors': [list(placed(p, d).exterior.coords) for d in p.doors],
            'drills': [placed(p, ('circle', x, y, dd / 2))[1:] for x, y, dd in p.drills],
            'pockets': [list(r) for pk in p.pockets for r in rings(placed(p, pk))],
            'engrave': [placed(p, e) for e in p.engrave]}


def build(style, printer='selphy'):
    setup(printer)
    front = front_wedding() if style == 'wedding' else front_events()
    parts = [front, back_panel(), side_panel(1, cable=True), side_panel(2)] + plates()
    if printer == 'selphy':
        parts += [base_plate(style), ring_overlay(style)] + monitor_holders()
        place_all(parts)
        for p in parts:
            p.sheet = 0
    else:
        holders = monitor_holders()
        cab = cabinet(style)
        parts += [ring_overlay(style)] + holders + cab
        # monitor clamp bars come out of the screen window, the rails out of the print window
        s = SCREEN
        for i, b in enumerate(holders[2:]):
            nest_in(b, front, rect(s['x0'], s['y0'], s['w'], s['h'], 3), s['x0'] + s['w'] / 2 + (i - 0.5) * 65, s['y0'] + s['h'] / 2, 90)
        cf = next(p for p in cab if p.key == 'cab_front')
        for i, r in enumerate(holders[:2]):
            nest_in(r, cf, cf.window, CIW / 2, 65 + i * 50)
        front.window = rect(s['x0'], s['y0'], s['w'], s['h'], 3)
        place_epson(parts)
    poses(parts)
    name = style if printer == 'selphy' else f'{style}-epson'
    out = os.path.join(HERE, name)
    os.makedirs(out, exist_ok=True)
    sheets = []
    for si in sorted({p.sheet for p in parts}):
        sp = [p for p in parts if p.sheet == si]
        usage = check_sheet(sp)
        size = [SHEET_L, SHEET_W] if si == 0 else offcut_size(sp)
        n_sheets = len({p.sheet for p in parts})
        if si == 0:
            fname = f'photobooth-{name}-mdf{int(T)}mm.dxf' if n_sheets == 1 else f'photobooth-{name}-mdf{int(T)}mm-sheet1.dxf'
            title = f'PHOTOBOOTH {name.upper()} - sheet 1 - MDF {int(T)} mm 1220x2440 - tool 6 mm'
        else:
            fname = f'photobooth-{name}-mdf{int(T)}mm-sheet2-offcut.dxf'
            title = f'PHOTOBOOTH {name.upper()} - sheet 2: offcut at least {int(size[1])} x {int(size[0])} mm - MDF {int(T)} mm'
        write_dxf(sp, os.path.join(out, fname), title, size)
        sheets.append({'file': fname, 'size': size, 'usage': round(usage, 3), 'parts': [p.key for p in sp]})
    meta = {
        'style': style, 'printer': printer, 'name': name, 'thickness': T, 'sheet': [SHEET_L, SHEET_W], 'sheets': sheets,
        'usage': sheets[0]['usage'], 'tower': [W, D, H], 'lift': LIFT, 'base': [BASE_W, BASE_D] if printer == 'selphy' else [CAB_W, CAB_D],
        'cabinet': [CAB_W, CAB_D, CAB_H] if printer == 'epson' else None, 'epson': EPSON,
        'ring': RING, 'screen': SCREEN, 'printSlot': PRINT_SLOT, 'levels': LEVELS,
        'layers': {k: v[1] for k, v in LAYERS.items()},
        'parts': [part_json(p) for p in parts],
        'placement': {p.key: placement_json(p) for p in parts},
    }
    with open(os.path.join(out, 'parts.json'), 'w') as f:
        json.dump(meta, f)
    desc = ' + '.join(f"sheet {i + 1} {int(sh['size'][1])}x{int(sh['size'][0])} ({sh['usage'] * 100:.0f}%)" for i, sh in enumerate(sheets))
    print(f'{name}: {len(parts)} parts → {desc}')
    return meta


if __name__ == '__main__':
    for printer in ('selphy', 'epson'):
        for s in ('wedding', 'events'):
            build(s, printer)
