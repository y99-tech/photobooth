#!/usr/bin/env python3
"""Builds hardware/photobooth-3d-viewer.html — one self-contained file (three.js embedded, works offline).

Needs three.js r160 files:   npm install three@0.160.0   (path via THREE_DIR, default ./node_modules/three)
Optional screen images:      UI_WEDDING / UI_EVENTS = paths to portrait screenshots of the kiosk
"""
import base64
import json
import os

HERE = os.path.dirname(os.path.abspath(__file__))
THREE_DIR = os.environ.get('THREE_DIR', os.path.join(HERE, '..', 'node_modules', 'three'))


def compact(meta):
    r = lambda pts: [[round(x, 1), round(y, 1)] for x, y in pts]  # noqa: E731
    out = {k: meta.get(k) for k in ('style', 'printer', 'thickness', 'sheet', 'usage', 'tower', 'base', 'ring', 'screen', 'printSlot', 'lift', 'cabinet', 'epson')}
    out['sheets'] = [{'size': sh['size'], 'usage': sh['usage']} for sh in meta['sheets']]
    out['parts'] = [{
        'key': p['key'], 'name': p['name'], 'size': p['size'], 'pose': p['pose'],
        'outline': r(p['outline']), 'holes': [r(h) for h in p['holes']], 'doors': [r(d) for d in p['doors']],
        'pockets': [{'outer': r(q['outer']), 'holes': [r(h) for h in q['holes']]} for q in p['pockets']],
        'engrave': [r(e) for e in p['engrave']],
    } for p in meta['parts']]
    return out


def data_url(path):
    if not path or not os.path.exists(path):
        # plain dark screen if no screenshot is supplied
        return 'data:image/svg+xml;base64,' + base64.b64encode(b'<svg xmlns="http://www.w3.org/2000/svg" width="9" height="16"><rect width="9" height="16" fill="#1c1916"/></svg>').decode()
    return 'data:image/jpeg;base64,' + base64.b64encode(open(path, 'rb').read()).decode()


def main():
    data = {s: compact(json.load(open(os.path.join(HERE, s, 'parts.json')))) for s in ('wedding', 'events', 'wedding-epson', 'events-epson')}
    ui = {'wedding': data_url(os.environ.get('UI_WEDDING')), 'events': data_url(os.environ.get('UI_EVENTS'))}
    three = open(os.path.join(THREE_DIR, 'build/three.module.min.js')).read()
    orbit = open(os.path.join(THREE_DIR, 'examples/jsm/controls/OrbitControls.js')).read()
    safe = lambda s: s.replace('</script', '<\\/script')  # noqa: E731
    html = open(os.path.join(HERE, 'viewer.template.html')).read()
    html = html.replace('/*THREE*/', safe(three)).replace('/*ORBIT*/', safe(orbit))
    html = html.replace('/*DATA*/', json.dumps(data, separators=(',', ':'))).replace('/*UIIMG*/', json.dumps(ui))
    out = os.path.join(HERE, 'photobooth-3d-viewer.html')
    open(out, 'w').write(html)
    print(f'{out} ({len(html) / 1e6:.1f} MB)')


if __name__ == '__main__':
    main()
