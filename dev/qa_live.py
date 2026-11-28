"""실배포 QA: https://ssggg0.github.io/reel-studio/ (390×844 아이폰 크기)."""
import json, os
from playwright.sync_api import sync_playwright

BASE = 'https://ssggg0.github.io/reel-studio'
OUT = '/workspace/downloads/reel_studio_qa'
os.makedirs(OUT, exist_ok=True)
INIT = """window.__errs=[];window.addEventListener('error',function(e){try{window.__errs.push(String(e.message||e.type)+' @'+(e.filename||'')+':'+(e.lineno||''))}catch(_){}},true);window.addEventListener('unhandledrejection',function(e){try{window.__errs.push('rejection: '+String(e.reason&&e.reason.stack||e.reason))}catch(_){}});"""

res = {}
with sync_playwright() as pw:
    b = pw.chromium.launch()
    ctx = b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=3,
                        is_mobile=True, has_touch=True,
                        user_agent='Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1')
    p = ctx.new_page()
    p.add_init_script(INIT)
    errs = []
    p.on('pageerror', lambda e: errs.append('pageerror: ' + str(e)))
    p.on('console', lambda m: errs.append('console.' + m.type + ': ' + m.text) if m.type == 'error' else None)
    p.goto(BASE + '/', wait_until='load')
    p.wait_for_timeout(2500)
    res['boot'] = p.evaluate("""()=>{const box=document.getElementById('discoverResults');
      return {cards:box.querySelectorAll('.rcard').length, status:document.getElementById('discoverStatus').innerText,
              orig:document.querySelectorAll('#origGrid .ocard').length,
              origImgs:[...document.querySelectorAll('#origGrid img')].filter(i=>i.complete&&i.naturalWidth>0).length,
              ver:[...document.querySelectorAll('script[src*="app.js"]')].map(s=>s.getAttribute('src'))[0]}}""")

    # 1) 분석 버튼 → 즉시 목록 (스크린샷 = 브리프 지정 파일명)
    p.fill('#dKeyword', '동물')
    p.click('#dSearch')
    p.wait_for_timeout(120)
    res['click120'] = p.evaluate("""()=>{const h=document.getElementById('discoverResultHead');const r=h.getBoundingClientRect();
      return {top:Math.round(r.top), inView:r.top<innerHeight&&r.top>-30, n:document.querySelectorAll('#discoverResults .rcard').length,
              status:document.getElementById('discoverStatus').innerText}}""")
    p.wait_for_timeout(900)
    p.screenshot(path=OUT + '/discover_results_mobile.png')

    # 2) 칩 클릭도 같은 자리로
    p.locator('#dChips .chip[data-kw="꿀팁"]').click()
    p.wait_for_timeout(800)
    res['chip'] = p.evaluate("""()=>({top:Math.round(document.getElementById('discoverResultHead').getBoundingClientRect().top),
      n:document.querySelectorAll('#discoverResults .rcard').length, status:document.getElementById('discoverStatus').innerText})""")

    # 3) 카드 액션 존재/링크
    res['card_acts'] = p.evaluate("""()=>{const c=document.querySelector('#discoverResults .rcard');
      return {labels:[...c.querySelectorAll('.rc-act')].map(a=>a.innerText.trim()),
              href:(c.querySelector('a.rc-act')||{}).href||''}}""")

    # 4) 클린 원본: 다운로드 href 실제 200 + 다운/얹기 버튼
    res['orig'] = p.evaluate("""()=>{const a=document.querySelector('#origGrid a[data-dl]');
      const btn=document.querySelector('#origGrid [data-apply]');
      return {href:a.href, download:a.download, applyLabel:btn.innerText.trim(),
              visible:!document.getElementById('origWrap').hidden}}""")
    r = p.request.get(res['orig']['href'])
    res['orig_dl'] = {'status': r.status, 'len': len(r.body()), 'type': r.headers.get('content-type'),
                      'ftyp': r.body()[:12].hex()}

    p.evaluate("()=>document.getElementById('origWrap').scrollIntoView({block:'start'})")
    p.wait_for_timeout(400)
    p.screenshot(path=OUT + '/originals_mobile.png')

    # 5) 🎬 바로 얹기 → 비디오 세팅 + 2단계 이동
    p.locator('#origGrid [data-apply="meme01_summer_window"]').click()
    ok = False
    for _ in range(80):
        p.wait_for_timeout(250)
        st = p.evaluate("""()=>({tab:RS.state.ui.tab, src:(RS.state.media.video&&RS.state.media.video.src)||'',
            source:RS.state.project.source.type, name:RS.state.media.videoName,
            dur:Math.round(((RS.state.media.video&&RS.state.media.video.duration)||0)*10)/10,
            vw:(RS.state.media.video||{}).videoWidth, vh:(RS.state.media.video||{}).videoHeight})""")
        if st['src'].startswith('blob:') and st['source'] == 'video' and st['dur']:
            ok = True
            break
    res['apply'] = dict(st, ok=ok)
    p.wait_for_timeout(700)
    p.screenshot(path=OUT + '/original_applied_mobile.png')
    res['panel'] = p.evaluate("""()=>({title:document.getElementById('spTitle').innerText,
        meta:document.getElementById('spMeta').innerText, hint:document.getElementById('spHint').innerText.slice(0,26),
        acts:[...document.querySelectorAll('#srcPanel .sp-acts > *')].map(x=>x.innerText.trim())})""")

    res['errs'] = errs + p.evaluate("window.__rsErrors||[]")
    ctx.close(); b.close()
print(json.dumps(res, ensure_ascii=False, indent=1))
