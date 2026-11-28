import json
from playwright.sync_api import sync_playwright

BASE = 'http://127.0.0.1:8899/index.html'
OUT = '/workspace/downloads/reel_studio_qa'
res = {}

with sync_playwright() as pw:
    b = pw.chromium.launch()
    ctx = b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2,
                        is_mobile=True, has_touch=True,
                        user_agent='Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1')
    p = ctx.new_page()
    errs, console = [], []
    p.on('pageerror', lambda e: errs.append(str(e)))
    p.on('console', lambda m: console.append(m.type + ': ' + m.text) if m.type in ('error', 'warning') else None)
    p.goto(BASE, wait_until='load')
    p.wait_for_timeout(1600)
    res['boot'] = p.evaluate("()=>({rsErrors: window.__rsErrors, up: !!RS.up, safe: !!RS.safe, tab: RS.state.ui.tab, cues: RS.state.project.cues.length})")

    # step5
    p.evaluate("()=>window.__rsQA.tab('upload')")
    p.wait_for_timeout(1200)
    res['upload'] = p.evaluate("""()=>({
        titles: [...document.querySelectorAll('#uTitleList .title-item')].map(b=>b.innerText.replace(/\\n/g,' | ')),
        chips: [...document.querySelectorAll('#uThumbStyles .chip')].map(b=>b.innerText),
        thumbW: document.getElementById('uThumbCanvas').width,
        thumbText: document.getElementById('uThumbText').value,
        check: [...document.querySelectorAll('#uCheckList .audit-item')].map(e=>e.innerText.replace(/\\n/g,' : ')),
        badge: document.getElementById('uCheckBadge').innerText,
        desc: document.getElementById('uDesc').value.slice(-90),
        title: document.getElementById('uTitle').value,
        handoffHidden: document.getElementById('uHandoff').hidden
    })""")
    p.screenshot(path=OUT + '/local_upload_top.png')

    # click second title
    p.locator('#uTitleList .title-item').nth(1).click()
    p.wait_for_timeout(400)
    res['title_click'] = p.evaluate("()=>({title: document.getElementById('uTitle').value, on: document.querySelectorAll('#uTitleList .title-item.on').length, thumbText: document.getElementById('uThumbText').value})")

    # style switch
    p.locator('#uThumbStyles .chip').nth(1).click()
    p.wait_for_timeout(600)
    res['style_dopa'] = p.evaluate("()=>({on: document.querySelector('#uThumbStyles .chip.on').innerText, hasBlob: !!document.getElementById('uThumbCanvas').getContext('2d').getImageData(540,1500,1,1).data[3]})")
    p.locator('#uThumbStyles .chip').nth(2).click()
    p.wait_for_timeout(600)
    res['style_card'] = p.evaluate("()=>({on: document.querySelector('#uThumbStyles .chip.on').innerText})")
    p.evaluate("()=>document.getElementById('uThumbCard').scrollIntoView({block:'start'})")
    p.wait_for_timeout(400)
    p.locator('#uThumbCanvas').screenshot(path=OUT + '/local_thumb_card.png')
    p.locator('#uThumbStyles .chip').nth(0).click()
    p.wait_for_timeout(600)
    p.locator('#uThumbCanvas').screenshot(path=OUT + '/local_thumb_docu.png')

    # precheck with bad word
    p.fill('#uTitle', '이거 씨발 진짜 충격');
    p.wait_for_timeout(700)
    res['precheck_bad'] = p.evaluate("()=>({badge:document.getElementById('uCheckBadge').innerText, first:document.querySelector('#uCheckList .audit-item').innerText.replace(/\\n/g,' : ')})")
    p.fill('#uTitle', '한국말은 무시하는 강아지, 북한말엔 바로 반응한 이유')
    p.wait_for_timeout(700)
    res['precheck_ok'] = p.evaluate("()=>document.getElementById('uCheckBadge').innerText")

    # desc fix
    p.fill('#uDesc', '그냥 설명입니다.')
    p.wait_for_timeout(700)
    p.locator('#uDescFix').click()
    p.wait_for_timeout(500)
    res['desc_fix'] = p.evaluate("()=>document.getElementById('uDesc').value")

    res['errors'] = errs
    res['console'] = console[:10]
    ctx.close()
    b.close()

print(json.dumps(res, ensure_ascii=False, indent=1))
