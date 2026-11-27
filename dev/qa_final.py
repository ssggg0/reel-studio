import json, os
from playwright.sync_api import sync_playwright

INIT = """window.__errs=[];window.addEventListener('error',function(e){try{window.__errs.push(String(e.message||e.type)+' @'+(e.filename||'')+':'+(e.lineno||''))}catch(_){}},true);window.addEventListener('unhandledrejection',function(e){try{window.__errs.push('rejection: '+String(e.reason&&e.reason.stack||e.reason))}catch(_){}});"""

def new_page(ctx):
    page = ctx.new_page()
    page.add_init_script(INIT)
    return page

BASE = 'http://127.0.0.1:8123'
OUT = '/workspace/downloads/reel_studio_qa'
BAD = ['이슈한잔', '힙플러그', '짤주웠어', '날것 도파민', 'issuehanjan', 'hipplug', 'zzaljuwoseo']
res = {}

with sync_playwright() as pw:
    b = pw.chromium.launch()

    # ── 1) 모바일 / 데스크톱 레일 ──────────────────────────
    for mobile in (True, False):
        key = 'mobile' if mobile else 'desktop'
        win = {'width': 390, 'height': 844} if mobile else {'width': 1280, 'height': 800}
        ctx = b.new_context(viewport=win, device_scale_factor=2 if mobile else 1,
                            is_mobile=mobile, has_touch=mobile)
        p = new_page(ctx)
        errs = []
        p.on('pageerror', lambda e: errs.append(str(e)))
        p.on('console', lambda m: errs.append('console.' + m.type + ': ' + m.text) if m.type == 'error' else None)
        p.goto(BASE + '/index.html', wait_until='load')
        p.wait_for_timeout(2200)
        p.locator('.tb-item[data-tab="script"]' if mobile else '.rail-item[data-tab="script"]').first.click()
        p.wait_for_timeout(900)
        info = {'win': win}
        info['errs'] = errs + p.evaluate("window.__errs")
        info['n'] = p.evaluate("document.querySelectorAll('#styleGrid .style-card').length")
        info['rail'] = p.evaluate("(()=>{const r=document.getElementById('styleGrid');return {scrollW:r.scrollWidth,clientW:r.clientWidth,scrollH:r.scrollHeight,clientH:r.clientHeight,cardsVisible:+(r.clientWidth/128).toFixed(2)}})()")
        info['bad'] = p.evaluate("(bad)=>bad.filter(b=>document.body.innerText.includes(b))", BAD)
        info['cardSize'] = p.evaluate("(()=>{const r=document.querySelector('#styleGrid .style-card').getBoundingClientRect();return {w:+r.width.toFixed(1),h:+r.height.toFixed(1)}})()")
        # 클릭 → 라벨/카드 활성
        seq = []
        for pid in p.evaluate("RS.presets.map(x=>x.id)"):
            p.click(f'#styleGrid .style-card[data-preset-id="{pid}"]')
            p.wait_for_timeout(260)
            seq.append(p.evaluate("()=>({id:RS.state.project.presetId,label:document.getElementById('aPreset').textContent,on:(document.querySelector('#styleGrid .style-card.on')||{}).dataset&&document.querySelector('#styleGrid .style-card.on').dataset.presetId})"))
        info['seq'] = seq
        # 설정 모달 프리셋 목록
        p.evaluate("RS.openModal('settings')")
        p.wait_for_timeout(400)
        info['settingsOpts'] = p.evaluate("Array.from(document.querySelectorAll('#stPresetSelect option')).map(o=>o.textContent)")
        info['settingsBad'] = p.evaluate("(bad)=>bad.filter(b=>document.getElementById('settingsModal').innerText.includes(b))", BAD)
        p.evaluate("RS.closeModal('settings')")
        # 마지막으로 도파민 선택 후 토스트 사라질 때까지 대기 → 스크린샷
        p.click('#styleGrid .style-card[data-preset-id="dopa-band"]')
        p.wait_for_timeout(3000)
        p.evaluate("document.getElementById('styleGrid').scrollLeft=0")
        p.wait_for_timeout(400)
        sec = p.locator('div.card', has=p.locator('h2', has_text='편집 스타일')).first
        path = os.path.join(OUT, 'style_rail_mobile.png' if mobile else 'style_rail_desktop.png')
        sec.screenshot(path=path)
        # 대본 탭 전체 + 미리보기 스테이지 (시네마틱)
        p.screenshot(path=os.path.join(OUT, 'script_tab_' + key + '.png'))
        res[key] = info
        ctx.close()

    # ── 2) 미리보기 스테이지: 시네마틱 레터박스 / 속보 pill ──
    ctx = b.new_context(viewport={'width': 1280, 'height': 800})
    p = new_page(ctx)
    errs = []
    p.on('pageerror', lambda e: errs.append(str(e)))
    p.goto(BASE + '/index.html', wait_until='load')
    p.wait_for_timeout(2000)
    p.locator('.rail-item[data-tab="script"]').first.click()
    p.wait_for_timeout(600)
    p.click('#styleGrid .style-card[data-preset-id="cinema-cut"]')
    p.wait_for_timeout(600)
    p.locator('.rail-item[data-tab="preview"]').first.click()
    p.wait_for_timeout(1200)
    stage = p.locator('.stage-box canvas, .stage canvas').first
    stage.screenshot(path=os.path.join(OUT, 'stage_cinema.png'))
    lb = p.evaluate("""()=>{
      const c=document.querySelector('.stage canvas')||document.querySelector('.stage-box canvas');
      const g=c.getContext('2d');const x=g.getImageData(0,0,20,20).data;let dark=0;
      for(let i=0;i<x.length;i+=4){if(x[i]<10&&x[i+1]<10&&x[i+2]<10)dark++}
      const n=x.length/4;
      return {canvas:[c.width,c.height],topLeftBlackRatio:+(dark/n).toFixed(2)};
    }""")
    p.locator('.rail-item[data-tab="script"]').first.click()
    p.wait_for_timeout(400)
    p.click('#styleGrid .style-card[data-preset-id="breaking-news"]')
    p.wait_for_timeout(500)
    p.locator('.rail-item[data-tab="preview"]').first.click()
    p.wait_for_timeout(1000)
    stage.screenshot(path=os.path.join(OUT, 'stage_breaking.png'))
    res['stage'] = {'errs': errs + p.evaluate("window.__errs"), 'letterbox': lb}
    ctx.close()

    # ── 3) 새로고침 후 스타일 유지 ───────────────────────────
    ctx = b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, is_mobile=True, has_touch=True)
    p = new_page(ctx)
    p.goto(BASE + '/index.html', wait_until='load')
    p.wait_for_timeout(1800)
    p.locator('.tb-item[data-tab="script"]').first.click()
    p.wait_for_timeout(600)
    p.click('#styleGrid .style-card[data-preset-id="healing-vlog"]')
    p.wait_for_timeout(900)
    p.reload(wait_until='load')
    p.wait_for_timeout(1900)
    res['persist'] = p.evaluate("""()=>({presetId:RS.state.project.presetId,
      label:document.getElementById('aPreset').textContent,
      grade:RS.state.project.grade, rate:RS.state.project.voice.rate,
      onCard:(document.querySelector('#styleGrid .style-card.on')||{dataset:{}}).dataset.presetId})""")
    p.locator('.tb-item[data-tab="script"]').first.click()
    p.wait_for_timeout(600)
    p.screenshot(path=os.path.join(OUT, 'persist_mobile.png'))
    res['persist']['bad'] = p.evaluate("(bad)=>bad.filter(b=>document.body.innerText.includes(b))", BAD)
    ctx.close()
    b.close()

print(json.dumps(res, ensure_ascii=False, indent=1))
