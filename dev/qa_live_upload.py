"""실배포/로컬 공용 QA — 5단계 마무리(제목 5안·썸네일 3종·3줄 체크·피클 넘기기) + 세이프존.
사용: python3 dev/qa_live_upload.py [local|live]
"""
import json
import sys
from playwright.sync_api import sync_playwright

MODE = sys.argv[1] if len(sys.argv) > 1 else 'live'
BASE = 'http://127.0.0.1:8899/index.html' if MODE == 'local' else 'https://ssggg0.github.io/reel-studio/'
OUT = '/workspace/downloads/reel_studio_qa'
suf = '_local' if MODE == 'local' else ''
res = {'base': BASE, 'console': [], 'errors': []}

with sync_playwright() as pw:
    b = pw.chromium.launch()

    # ── 모바일 390×844 ───────────────────────────────
    ctx = b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2,
                        is_mobile=True, has_touch=True)
    p = ctx.new_page()
    p.on('pageerror', lambda e: res['errors'].append(str(e)))
    p.on('console', lambda m: res['console'].append(m.type + ': ' + m.text[:150]) if m.type == 'error' else None)
    p.goto(BASE, wait_until='load')
    p.wait_for_timeout(2000)
    res['boot'] = p.evaluate("()=>({up:!!RS.up, safe:!!RS.safe, errors:window.__rsErrors.slice(), title:document.title.slice(0,20)})")

    p.evaluate("()=>window.__rsQA.tab('upload')")
    p.wait_for_timeout(1600)
    res['upload'] = p.evaluate("""()=>({
      titles: [...document.querySelectorAll('#uTitleList .title-item .ttext')].map(e=>e.innerText),
      chips: [...document.querySelectorAll('#uThumbStyles .chip')].map(e=>e.innerText),
      check: [...document.querySelectorAll('#uCheckList .audit-item')].map(e=>e.className.split(' ').pop() + ' | ' + e.innerText.split('\\n')[0]),
      badge: document.getElementById('uCheckBadge').innerText,
      title: document.getElementById('uTitle').value,
      descHasSafety: /출처 · 원작자 요청 시 즉시 삭제합니다/.test(document.getElementById('uDesc').value),
      thumbW: document.getElementById('uThumbCanvas').width,
      thumbH: document.getElementById('uThumbCanvas').height,
      handoffVisible: !document.getElementById('uHandoff').hidden,
      hasOAuthUI: !!document.querySelector('[id*=uConnect],[id*=uAuthTag],[id=stOauth]')
    })""")
    p.screenshot(path=OUT + '/upload_pro_mobile' + suf + '.png')

    # 제목 딸깍
    p.locator('#uTitleList .title-item').nth(2).click()
    p.wait_for_timeout(400)
    res['title_click'] = p.evaluate("()=>({title:document.getElementById('uTitle').value, on:document.querySelectorAll('#uTitleList .title-item.on').length})")

    # 썸네일 3종 (픽셀 변화 확인)
    shots = {}
    for i, name in enumerate(['docu', 'dopa', 'card']):
        p.locator('#uThumbStyles .chip').nth(i).click()
        p.wait_for_timeout(650)
        p.locator('#uThumbCanvas').screenshot(path=OUT + f'/thumb_{name}{suf}.png')
        shots[name] = p.evaluate("()=>{const c=document.getElementById('uThumbCanvas');const d=c.getContext('2d').getImageData(540,1300,1,1).data;return [d[0],d[1],d[2]];}")
    res['thumb_px'] = shots

    # 3줄 체크: 금지어 넣었다 빼기
    orig = p.evaluate("()=>document.getElementById('uTitle').value")
    p.fill('#uTitle', '이 장면 씨발 대박')
    p.wait_for_timeout(700)
    res['check_bad'] = p.evaluate("()=>({badge:document.getElementById('uCheckBadge').innerText, first:document.querySelector('#uCheckList .audit-item').innerText.replace(/\\n/g,' : ')})")
    p.fill('#uTitle', orig)
    p.wait_for_timeout(700)
    res['check_ok'] = p.evaluate("()=>document.getElementById('uCheckBadge').innerText")

    # 세이프존(8스타일)
    p.evaluate("()=>window.__rsQA.tab('preview')")
    p.wait_for_timeout(500)
    zone = []
    for sid in p.evaluate("()=>window.__rsQA.styles()"):
        p.evaluate("(id)=>window.__rsQA.style(id)", sid)
        p.wait_for_timeout(320)
        g = p.evaluate("()=>window.__rsQA.geom()")
        zone.append({'id': sid, 'sub': g['subBottom'], 'card': g['cardBottom'], 'ok': g['subBottom'] <= g['safeY'] and g['cardBottom'] <= g['safeY']})
    res['safe_zone'] = zone
    res['overflowX'] = p.evaluate("()=>document.documentElement.scrollWidth - window.innerWidth")

    # 스크롤 부드러움(업로드 패널 40프레임)
    p.evaluate("()=>window.__rsQA.tab('upload')")
    p.wait_for_timeout(700)
    res['scroll'] = p.evaluate("""()=>new Promise(res=>{
        const panel = document.querySelector('.panel[data-panel=upload]');
        panel.scrollTop = 0;
        const deltas = []; let last = performance.now(), n = 0;
        function step(){
          const now = performance.now(); deltas.push(now - last); last = now;
          panel.scrollTop += 80; n++;
          if (n < 40) requestAnimationFrame(step);
          else {
            const avg = deltas.reduce((a,b)=>a+b,0)/deltas.length;
            res({avgMs: Math.round(avg*10)/10, maxMs: Math.round(Math.max(...deltas)), fps: Math.round(1000/avg), scrollTop: panel.scrollTop});
          }
        }
        requestAnimationFrame(step);
    })""")
    p.evaluate("()=>window.__rsQA.tab('upload')")
    p.wait_for_timeout(300)
    p.close()
    ctx.close()

    # ── 데스크톱 1280×900 ────────────────────────────
    ctx = b.new_context(viewport={'width': 1280, 'height': 900})
    p = ctx.new_page()
    p.on('pageerror', lambda e: res['errors'].append('desktop: ' + str(e)))
    p.on('console', lambda m: res['console'].append('desktop ' + m.type + ': ' + m.text[:150]) if m.type == 'error' else None)
    p.goto(BASE, wait_until='load')
    p.wait_for_timeout(2000)
    p.evaluate("()=>window.__rsQA.tab('upload')")
    p.wait_for_timeout(1500)
    p.screenshot(path=OUT + '/upload_pro_desktop' + suf + '.png')
    res['desktop'] = p.evaluate("()=>({titles:document.querySelectorAll('#uTitleList .title-item').length, chips:document.querySelectorAll('#uThumbStyles .chip').length, overflowX:document.documentElement.scrollWidth-window.innerWidth})")
    ctx.close()
    b.close()

print(json.dumps(res, ensure_ascii=False, indent=1))
