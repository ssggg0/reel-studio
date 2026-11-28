import json
from playwright.sync_api import sync_playwright

BASE = 'http://127.0.0.1:8899/index.html'
OUT = '/workspace/downloads/reel_studio_qa'
res = {'console': [], 'errors': []}

with sync_playwright() as pw:
    b = pw.chromium.launch()
    ctx = b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, is_mobile=True, has_touch=True)
    p = ctx.new_page()
    p.on('pageerror', lambda e: res['errors'].append(str(e)))
    p.on('console', lambda m: res['console'].append(m.type + ': ' + m.text[:160]) if m.type == 'error' else None)
    p.goto(BASE, wait_until='load')
    p.wait_for_timeout(1500)

    # 1) 발굴 → 검색
    p.fill('#dKeyword', '고양이')
    p.click('#dSearch')
    p.wait_for_timeout(1200)
    res['discover'] = p.evaluate("()=>({n:document.querySelectorAll('#discoverResults .rcard').length, status:document.getElementById('discoverStatus').innerText.slice(0,70)})")
    p.locator('#discoverResults .rcard').first.click()
    p.wait_for_timeout(1200)
    res['card_click'] = p.evaluate("()=>({tab:RS.state.ui.tab, cues:RS.state.project.cues.length})")

    # 2) 대본 탭: 음슴체 심고 점검·자동수정
    p.evaluate("()=>window.__rsQA.tab('preview')")
    p.wait_for_timeout(600)
    p.evaluate("()=>{const p=RS.state.project; p.cues[0].text='이 장면은 그냥 지나치면 안 됨'; window.__rsQA.resync();}")
    p.wait_for_timeout(400)
    audit_before = p.evaluate("()=>window.__rsQA.audit().filter(i=>!i.ok).map(i=>i.title)")
    p.evaluate("()=>window.__rsQA.fix()")
    p.wait_for_timeout(700)
    audit_after = p.evaluate("()=>({bad:window.__rsQA.audit().filter(i=>!i.ok).map(i=>i.title), cue0:RS.state.project.cues[0].text})")
    res['eum'] = {'before': audit_before, 'after': audit_after}

    # 4) 미리보기: 점검 카드/렌더 버튼 상태
    p.evaluate("()=>document.getElementById('auditCard').scrollIntoView({block:'start'})")
    p.wait_for_timeout(400)
    p.screenshot(path=OUT + '/local_audit_card.png')

    # 5) 마무리: AI 5안 실패 폴백 (가짜 키)
    p.evaluate("""()=>{RS.state.settings.gemini='fake-key-for-test'; window.__rsQA.tab('upload');}""")
    p.wait_for_timeout(1200)
    p.click('#uTitleAI')
    p.wait_for_timeout(3500)
    res['ai_fallback'] = p.evaluate("()=>({badge:document.getElementById('uTitleTag').innerText, n:document.querySelectorAll('#uTitleList .title-item').length, btn:document.getElementById('uTitleAI').innerText})")
    p.evaluate("()=>{RS.state.settings.gemini='';}")

    # 복사 버튼(클립보드 권한)
    ctx.grant_permissions(['clipboard-read', 'clipboard-write'])
    p.click('#uCopyMeta')
    p.wait_for_timeout(500)
    res['copy_toast'] = p.evaluate("()=>document.querySelector('.toast')?document.querySelector('.toast').innerText:''")

    # 썸네일 저장(다운로드)
    try:
        with p.expect_download(timeout=6000) as dl:
            p.click('#uThumbSave')
        d = dl.value
        res['thumb_download'] = {'name': d.suggested_filename}
        d.save_as(OUT + '/local_download_thumb.png')
    except Exception as e:
        res['thumb_download'] = 'ERR ' + str(e)[:120]

    res['overflow'] = p.evaluate("()=>({x:document.documentElement.scrollWidth-window.innerWidth, viewport:window.innerWidth})")
    res['fonts'] = p.evaluate("()=>document.fonts.check('900 100px \"Black Han Sans\"')")
    res['final_errors'] = p.evaluate("()=>window.__rsErrors.slice()")
    ctx.close()
    b.close()

print(json.dumps(res, ensure_ascii=False, indent=1))
