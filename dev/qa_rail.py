"""릴 스튜디오 편집 스타일 가로 레일 QA (로컬 http.server 대상)"""
import json, os
from playwright.sync_api import sync_playwright

INIT = """window.__errs=[];window.addEventListener('error',function(e){try{window.__errs.push(String(e.message||e.type)+' @'+(e.filename||'')+':'+(e.lineno||''))}catch(_){}},true);window.addEventListener('unhandledrejection',function(e){try{window.__errs.push('rejection: '+String(e.reason&&e.reason.stack||e.reason))}catch(_){}});"""

def new_page(ctx):
    page = ctx.new_page()
    page.add_init_script(INIT)
    return page

BASE = os.environ.get('QA_BASE', 'http://127.0.0.1:8123')
OUT = '/workspace/downloads/reel_studio_qa'
os.makedirs(OUT, exist_ok=True)
BAD = ['이슈한잔', '힙플러그', '짤주웠어', '날것 도파민', 'issuehanjan', 'hipplug', 'zzaljuwoseo']


def run(pw, mobile=True):
    win = {'width': 390, 'height': 844} if mobile else {'width': 1280, 'height': 800}
    browser = pw.chromium.launch()
    ctx = browser.new_context(viewport=win, device_scale_factor=2 if mobile else 1,
                              is_mobile=mobile, has_touch=mobile)
    page = new_page(ctx)
    errs, console = [], []
    page.on('pageerror', lambda e: errs.append('pageerror: ' + str(e)))
    page.on('console', lambda m: console.append(m.type + ': ' + m.text) if m.type in ('error', 'warning') else None)
    page.goto(BASE + '/index.html', wait_until='load')
    page.wait_for_timeout(1800)

    tab = page.locator('.tb-item[data-tab="script"]' if mobile else '.rail-item[data-tab="script"]')
    tab.first.click()
    page.wait_for_timeout(900)

    info = {'viewport': win}
    info['capture_errs'] = page.evaluate("window.__errs")
    info['page_errs'] = errs
    info['console'] = console
    info['preset_count'] = page.evaluate("RS.presets.length")
    info['preset_ids'] = page.evaluate("RS.presets.map(p=>p.id)")
    info['preset_names'] = page.evaluate("RS.presets.map(p=>p.name)")
    info['current_preset'] = page.evaluate("RS.state.project.presetId")
    info['aPreset_text'] = page.inner_text('#aPreset')
    info['rail'] = page.evaluate("(()=>{const r=document.getElementById('styleGrid');return {scrollW:r.scrollWidth,clientW:r.clientWidth,scrollH:r.scrollHeight,clientH:r.clientHeight,overflowX:getComputedStyle(r).overflowX,visibleCards:+(r.clientWidth/128).toFixed(2)}})()")
    info['cards'] = page.evaluate("""(()=>Array.from(document.querySelectorAll('#styleGrid .style-card')).map(c=>{
        const r=c.getBoundingClientRect();
        const cv=c.querySelector('canvas');
        let sig=null;
        try{const x=cv.getContext('2d');const d=x.getImageData(0,0,cv.width,cv.height).data;let s=0;for(let i=0;i<d.length;i+=997){s=(s*31+d[i])%2147483647}sig=s}catch(e){sig='err'}
        return {id:c.dataset.presetId,w:Math.round(r.width),h:Math.round(r.height),name:c.querySelector('.sc-body b').textContent,sub:c.querySelector('.sc-body i').textContent,canvasSig:sig,clipped:c.scrollWidth>c.clientWidth+1};
    }))()""")

    clicks = []
    for pid in info['preset_ids']:
        page.click(f'#styleGrid .style-card[data-preset-id="{pid}"]')
        page.wait_for_timeout(320)
        clicks.append(page.evaluate("""(pid)=>({
            pid: pid, now: RS.state.project.presetId,
            onCard: document.querySelector('#styleGrid .style-card.on')&&document.querySelector('#styleGrid .style-card.on').dataset.presetId,
            hookStyle: RS.state.project.hook.style, hookBg: RS.state.project.hook.bg,
            subRadius: RS.state.project.sub.radius, subPos: RS.state.project.sub.pos,
            subBox: RS.state.project.sub.box, subStroke: RS.state.project.sub.stroke,
            cardOn: RS.state.project.card.on, grade: RS.state.project.grade,
            letterbox: RS.state.project.letterbox, rate: RS.state.project.voice.rate,
            label: document.getElementById('aPreset').textContent
        })""", pid))
    info['clicks'] = clicks

    # 채널 이름 노출 0건 (본문 전체)
    info['body_bad_names'] = page.evaluate("""(bad)=>{const t=document.body.innerText;return bad.filter(b=>t.includes(b))}""", BAD)

    # 스타일 레일 첫 카드로 되돌리고 토스트가 사라질 때까지 대기 → 스크린샷
    page.click('#styleGrid .style-card[data-preset-id="dopa-band"]')
    page.wait_for_timeout(3000)
    page.evaluate("document.getElementById('styleGrid').scrollLeft=0")
    page.wait_for_timeout(300)
    sec = page.locator('div.card', has=page.locator('h2', has_text='편집 스타일')).first
    path = os.path.join(OUT, 'style_rail_mobile.png' if mobile else 'style_rail_desktop.png')
    sec.screenshot(path=path)
    info['shot'] = path
    page.screenshot(path=os.path.join(OUT, ('full_mobile.png' if mobile else 'full_desktop.png')))
    browser.close()
    return info


def migration(pw):
    """옛 프로젝트·프리셋(localStorage) 이관 검사"""
    browser = pw.chromium.launch()
    ctx = browser.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, is_mobile=True, has_touch=True)
    page = new_page(ctx)
    errs = []
    page.on('pageerror', lambda e: errs.append(str(e)))
    page.goto(BASE + '/index.html', wait_until='load')
    page.wait_for_timeout(1200)
    page.evaluate("""()=>{
      const old = JSON.parse(JSON.stringify(RS.state.project));
      old.presetId='issuehanjan'; old.tag={on:true,text:'@issuehanjan'};
      old.hook=Object.assign({}, old.hook, {style:'plain', bg:'#0B0D12', accent:'#D8FF3E', size:54});
      localStorage.setItem('reelstudio.project.v1', JSON.stringify(old));
      localStorage.setItem('reelstudio.presets.v1', JSON.stringify([
        {id:'issuehanjan', name:'이슈한잔 스타일', desc:'다크 다큐', builtin:true},
        {id:'u_abc', name:'이슈한잔 11월 결', desc:'짤주웠어 느낌', builtin:false}
      ]));
      localStorage.removeItem('reelstudio.migrated.v2');
    }""")
    page.reload(wait_until='load')
    page.wait_for_timeout(1500)
    page.locator('.tb-item[data-tab="script"]').first.click()
    page.wait_for_timeout(700)
    res = page.evaluate("""(bad)=>({
      presetId: RS.state.project.presetId,
      label: document.getElementById('aPreset').textContent,
      tag: RS.state.project.tag,
      hookStyle: RS.state.project.hook.style,
      presets: RS.state.presets.map(p=>p.name),
      customKept: RS.state.presets.filter(p=>!p.builtin).length,
      bodyBad: bad.filter(b=>document.body.innerText.includes(b)),
      storedPresets: JSON.parse(localStorage.getItem('reelstudio.presets.v1')||'[]').map(p=>p.name)
    })""", BAD)
    res['errs'] = errs + page.evaluate("window.__errs")
    browser.close()
    return res


with sync_playwright() as pw:
    res = {}
    for mode in (True, False):
        try:
            res['mobile' if mode else 'desktop'] = run(pw, mode)
        except Exception as e:
            res['mobile' if mode else 'desktop'] = {'fatal': repr(e)}
    try:
        res['migration'] = migration(pw)
    except Exception as e:
        res['migration'] = {'fatal': repr(e)}
    print(json.dumps(res, ensure_ascii=False, indent=1))
