import json, os
from playwright.sync_api import sync_playwright

INIT = """window.__errs=[];window.addEventListener('error',function(e){try{window.__errs.push(String(e.message||e.type)+' @'+(e.filename||'')+':'+(e.lineno||''))}catch(_){}},true);window.addEventListener('unhandledrejection',function(e){try{window.__errs.push('rejection: '+String(e.reason&&e.reason.stack||e.reason))}catch(_){}});"""

def new_page(ctx):
    page = ctx.new_page()
    page.add_init_script(INIT)
    return page
BASE = 'http://127.0.0.1:8123'
OUT = '/workspace/downloads/reel_studio_qa'
with sync_playwright() as pw:
    b = pw.chromium.launch()
    ctx = b.new_context(viewport={'width': 1240, 'height': 900}, device_scale_factor=2)
    p = new_page(ctx)
    errs = []
    p.on('pageerror', lambda e: errs.append(str(e)))
    p.goto(BASE + '/index.html', wait_until='load')
    p.wait_for_timeout(2400)
    p.locator('.rail-item[data-tab="script"]').first.click()
    p.wait_for_timeout(800)
    p.evaluate("""()=>{
      const box = document.createElement('div');
      box.id='sheet';
      box.style.cssText='position:fixed;left:0;top:0;z-index:9999;background:#EEF1F6;padding:16px;display:grid;grid-template-columns:repeat(4,264px);gap:14px;font-family:\\"Apple SD Gothic Neo\\",\\"Noto Sans CJK KR\\",sans-serif';
      document.querySelectorAll('#styleGrid .style-card').forEach(card=>{
        const src=card.querySelector('canvas');
        const cell=document.createElement('div');
        cell.style.cssText='background:#fff;border:1px solid #dfe4ec;border-radius:14px;padding:10px';
        const cv=document.createElement('canvas');
        cv.width=248; cv.height=441;
        cv.style.cssText='width:248px;height:441px;display:block;border-radius:9px;background:#0F172A';
        cv.getContext('2d').drawImage(src,0,0,248,441);
        const t=document.createElement('div');
        t.style.cssText='font-size:13px;font-weight:800;margin-top:8px;color:#0F172A;white-space:nowrap;overflow:hidden;text-overflow:ellipsis';
        t.textContent=card.querySelector('.sc-body b').textContent;
        const s=document.createElement('div');
        s.style.cssText='font-size:11px;color:#64748B;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis';
        s.textContent=card.querySelector('.sc-body i').textContent;
        cell.appendChild(cv); cell.appendChild(t); cell.appendChild(s); box.appendChild(cell);
      });
      document.body.appendChild(box);
    }""")
    p.wait_for_timeout(600)
    p.locator('#sheet').screenshot(path=OUT + '/style_sheet.png')
    print(json.dumps({'errs': errs, 'page': p.evaluate("window.__errs")}, ensure_ascii=False))
    b.close()
