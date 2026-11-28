"""QA 2: 클린 원본 섹션 캡처 · 잘못된 API 키 fallback · 필터 0건 처리."""
import json, os
from playwright.sync_api import sync_playwright

BASE = os.environ.get('QA_BASE', 'http://127.0.0.1:8123')
OUT = '/workspace/downloads/reel_studio_qa'

with sync_playwright() as pw:
    b = pw.chromium.launch()
    res = {}

    # ── A) 클린 원본 섹션 (키 없음)
    ctx = b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, is_mobile=True, has_touch=True)
    p = ctx.new_page()
    errs = []
    p.on('pageerror', lambda e: errs.append(str(e)))
    p.goto(BASE + '/index.html', wait_until='load')
    p.wait_for_timeout(1200)
    p.evaluate("()=>document.getElementById('origWrap').scrollIntoView({block:'start'})")
    p.wait_for_timeout(500)
    p.screenshot(path=OUT + '/qa_originals.png')
    res['orig_box'] = p.evaluate("""()=>{const w=document.getElementById('origWrap');
      const r=w.getBoundingClientRect();const imgs=[...w.querySelectorAll('img')];
      return {top:Math.round(r.top),h:Math.round(r.height),imgs:imgs.length,
              loaded:imgs.filter(i=>i.complete&&i.naturalWidth>0).length,
              btnHeights:[...w.querySelectorAll('.ocard-acts .btn')].slice(0,2).map(b=>Math.round(b.getBoundingClientRect().height)),
              clipped:[...w.querySelectorAll('.ocard-title')].map(t=>t.scrollHeight>t.clientHeight+1).filter(Boolean).length}}""")
    # 카드 하나 더 얹어보기 (다른 파일 · 캡션 있는 것)
    p.locator('#origGrid [data-apply="cat06_black_cat"]').click()
    for _ in range(40):
        p.wait_for_timeout(200)
        if p.evaluate("()=>RS.state.project.source.type==='video' && (RS.state.media.video.src||'').startsWith('blob:')"):
            break
    res['apply_cat'] = p.evaluate("""()=>({name:RS.state.media.videoName, dur:Math.round((RS.state.media.video.duration||0)*10)/10,
        spMeta:document.getElementById('spMeta').innerText, spHint:document.getElementById('spHint').innerText.slice(0,30)})""")
    p.wait_for_timeout(600)
    p.screenshot(path=OUT + '/qa_applied2.png')
    res['errs_A'] = errs
    ctx.close()

    # ── B) 잘못된 YouTube 키 → 조용히 데모 fallback
    ctx = b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, is_mobile=True, has_touch=True)
    p = ctx.new_page()
    errs = []
    p.on('pageerror', lambda e: errs.append(str(e)))
    p.add_init_script("""try{localStorage.setItem('reelstudio.settings.v1', JSON.stringify({youtube:'AIzaFAKE_KEY_FOR_QA'}))}catch(e){}""")
    p.goto(BASE + '/index.html', wait_until='load')
    p.wait_for_timeout(1500)
    res['mode_pill'] = p.evaluate("()=>document.getElementById('modeText').innerText")
    p.fill('#dKeyword', '고양이')
    p.click('#dSearch')
    p.wait_for_timeout(4000)
    res['fallback'] = p.evaluate("""()=>{const head=document.getElementById('discoverResultHead');
      const box=document.getElementById('discoverResults');
      return {status:document.getElementById('discoverStatus').innerText, n:box.querySelectorAll('.rcard').length,
              headTop:Math.round(head.getBoundingClientRect().top),
              toasts:[...document.querySelectorAll('.toast')].map(t=>t.innerText.slice(0,60))}}""")
    p.screenshot(path=OUT + '/qa_fallback.png')

    # ── C) 필터 0건 (최소 조회수 100만+ · 롱폼)
    p.click('.filters > summary')
    p.wait_for_timeout(300)
    p.select_option('#dMin', '1000000')
    p.select_option('#dDur', 'long')
    p.fill('#dKeyword', '뉴스')
    p.click('#dSearch')
    p.wait_for_timeout(3000)
    res['empty_try'] = p.evaluate("""()=>({status:document.getElementById('discoverStatus').innerText,
        n:document.querySelectorAll('#discoverResults .rcard').length,
        empty:!!document.getElementById('dRelax')})""")
    res['errs_B'] = errs
    ctx.close(); b.close()

print(json.dumps(res, ensure_ascii=False, indent=1))
