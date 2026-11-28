"""발굴 탭 QA: 즉시 목록·자동 스크롤·클린 원본(다운/바로 얹기)."""
import json, os, sys
from playwright.sync_api import sync_playwright

BASE = os.environ.get('QA_BASE', 'http://127.0.0.1:8123')
OUT = '/workspace/downloads/reel_studio_qa'
os.makedirs(OUT, exist_ok=True)
INIT = """window.__errs=[];window.addEventListener('error',function(e){try{window.__errs.push(String(e.message||e.type)+' @'+(e.filename||'')+':'+(e.lineno||''))}catch(_){}},true);window.addEventListener('unhandledrejection',function(e){try{window.__errs.push('rejection: '+String(e.reason&&e.reason.stack||e.reason))}catch(_){}});"""

res = {}
with sync_playwright() as pw:
    b = pw.chromium.launch()
    ctx = b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2,
                        is_mobile=True, has_touch=True)
    p = ctx.new_page()
    p.add_init_script(INIT)
    errs = []
    p.on('pageerror', lambda e: errs.append('pageerror: ' + str(e)))
    p.on('console', lambda m: errs.append('console.' + m.type + ': ' + m.text) if m.type == 'error' else None)
    p.goto(BASE + '/index.html', wait_until='load')
    p.wait_for_timeout(1200)

    def snap(tag):
        return p.evaluate("""(tag)=>{
          const head=document.getElementById('discoverResultHead');
          const box=document.getElementById('discoverResults');
          const panel=document.getElementById('tab-discover');
          const r=head.getBoundingClientRect();
          return {tag, n:box.querySelectorAll('.rcard:not(.skel)').length, skel:box.querySelectorAll('.rcard.skel').length,
                  headTop:Math.round(r.top), headInView:r.top>-40&&r.top<innerHeight,
                  status:document.getElementById('discoverStatus').innerText.replace(/\\s+/g,' ').trim(),
                  panelScroll:Math.round(panel.scrollTop),
                  firstTitle:((box.querySelector('.rc-title')||{}).innerText||'').slice(0,40),
                  acts:box.querySelector('.rcard')?box.querySelector('.rcard').querySelectorAll('.rc-act').length:0};
        }""", tag)

    res['boot'] = snap('boot')
    res['orig'] = p.evaluate("""()=>{
      const w=document.getElementById('origWrap'), g=document.getElementById('origGrid');
      const cards=[...g.querySelectorAll('.ocard')];
      const a=g.querySelector('a[data-dl]');
      return {hidden:w.hidden, n:cards.length,
              first:{title:cards[0]?cards[0].querySelector('.ocard-title').innerText:'',
                     href:a?a.getAttribute('href'):'', download:a?a.getAttribute('download'):'',
                     hasThumb:a?!!g.querySelector('.ocard-thumb img'):false}};
    }""")

    # 1) 분석 버튼: 동물
    p.fill('#dKeyword', '동물')
    t0 = p.evaluate("performance.now()")
    p.click('#dSearch')
    p.wait_for_timeout(120)
    res['click_immediate'] = snap('click120ms')
    p.wait_for_timeout(900)
    res['after_dongmul'] = snap('after900ms')
    p.screenshot(path=OUT + '/qa_dongmul.png')

    # 2) 임의 단어
    for kw in ['우주', '반전', 'CCTV', '꿀팁']:
        p.fill('#dKeyword', kw)
        p.click('#dSearch')
        p.wait_for_timeout(700)
        res['kw_' + kw] = snap(kw)

    # 3) 칩
    p.locator('#dChips .chip[data-kw="해외일상"]').click()
    p.wait_for_timeout(700)
    res['chip_해외일상'] = snap('chip')

    # 4) 프리셋
    p.locator('#dPresets .preset-chip[data-preset="animal"]').click()
    p.wait_for_timeout(800)
    res['preset_animal'] = snap('preset')
    p.screenshot(path=OUT + '/qa_after_preset.png')

    # 5) 원본 다운 href → 실제 응답
    href = p.evaluate("()=>document.querySelector('#origGrid a[data-dl]').getAttribute('href')")
    resp = p.request.get(BASE + '/' + href.replace('./', ''))
    res['download'] = {'href': href, 'status': resp.status, 'bytes': len(resp.body()),
                       'ctype': resp.headers.get('content-type')}
    res['download_first200'] = resp.body()[:16].hex()

    # 6) 바로 얹기 (가벼운 첫 카드 = meme01 1.6MB)
    p.evaluate("()=>document.getElementById('origWrap').scrollIntoView()")
    p.wait_for_timeout(300)
    p.locator('#origGrid [data-apply="meme01_summer_window"]').click()
    ok = False
    for _ in range(60):
        p.wait_for_timeout(250)
        st = p.evaluate("""()=>({tab:RS.state.ui.tab, src:(RS.state.media.video&&RS.state.media.video.src)||'',
            name:document.getElementById('spTitle').innerText, hidden:document.getElementById('srcPanel').hidden,
            source:RS.state.project.source.type, media:RS.state.media.videoName})""")
        if st['src'].startswith('blob:') and st['source'] == 'video':
            ok = True
            break
    res['apply'] = dict(st, ok=ok)
    p.wait_for_timeout(500)
    res['video'] = p.evaluate("""()=>{const v=RS.state.media.video;
        return {src:(v.src||'').slice(0,24), dur:Math.round((v.duration||0)*10)/10, vw:v.videoWidth, vh:v.videoHeight,
                readyState:v.readyState, paused:v.paused, spMeta:document.getElementById('spMeta').innerText,
                spOpen:document.getElementById('spOpen').getAttribute('href'),
                spCopyHidden:document.getElementById('spCopy').hidden,
                spFindHidden:document.getElementById('spFind').hidden}}""")
    p.screenshot(path=OUT + '/qa_applied.png')

    res['errs'] = errs + p.evaluate("window.__rsErrors||[]")
    ctx.close(); b.close()

print(json.dumps(res, ensure_ascii=False, indent=1))
