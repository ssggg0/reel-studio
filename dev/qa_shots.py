"""스타일 레일 스크린샷 — 요소 스크린샷 대신 전체 화면을 섹션 경계로 잘라 저장(합성 지연 회피)"""
import json, os
from playwright.sync_api import sync_playwright
from PIL import Image

INIT = """window.__errs=[];window.addEventListener('error',function(e){try{window.__errs.push(String(e.message||e.type))}catch(_){}},true);"""

BASE = os.environ.get('QA_BASE', 'http://127.0.0.1:8123')
OUT = '/workspace/downloads/reel_studio_qa'
os.makedirs(OUT, exist_ok=True)


def shot(pw, mobile):
    key = 'mobile' if mobile else 'desktop'
    dpr = 2 if mobile else 1
    win = {'width': 390, 'height': 844} if mobile else {'width': 1280, 'height': 800}
    b = pw.chromium.launch()
    ctx = b.new_context(viewport=win, device_scale_factor=dpr, is_mobile=mobile, has_touch=mobile)
    p = ctx.new_page(); p.add_init_script(INIT)
    errs = []
    p.on('pageerror', lambda e: errs.append(str(e)))
    p.on('console', lambda m: errs.append('console: ' + m.text) if m.type == 'error' else None)
    p.goto(BASE + '/index.html', wait_until='load')
    p.wait_for_timeout(2400)
    p.locator('.tb-item[data-tab="script"]' if mobile else '.rail-item[data-tab="script"]').first.click()
    p.wait_for_timeout(800)
    p.click('#styleGrid .style-card[data-preset-id="dopa-band"]')
    p.wait_for_timeout(3200)
    p.evaluate("document.getElementById('styleGrid').scrollLeft=0")
    p.wait_for_timeout(400)
    box = p.locator('div.card', has=p.locator('h2', has_text='편집 스타일')).first.bounding_box()
    full = f'/workspace/tmp/qa/full_{key}.png'
    p.screenshot(path=full)
    im = Image.open(full)
    pad = 6
    l = max(0, int((box['x'] - pad) * dpr)); t = max(0, int((box['y'] - pad) * dpr))
    r = min(im.width, int((box['x'] + box['width'] + pad) * dpr))
    bo = min(im.height, int((box['y'] + box['height'] + pad) * dpr))
    crop = im.crop((l, t, r, bo))
    path = os.path.join(OUT, f'style_rail_{key}.png')
    crop.save(path)
    p.screenshot(path=os.path.join(OUT, f'script_tab_{key}.png'))
    b.close()
    return {'shot': path, 'size': crop.size, 'errs': errs}


with sync_playwright() as pw:
    out = {}
    for m in (True, False):
        out['mobile' if m else 'desktop'] = shot(pw, m)
    print(json.dumps(out, ensure_ascii=False, indent=1))
