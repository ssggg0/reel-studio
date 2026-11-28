"""실배포 회귀 QA: 카드 대본 세팅·인기 레일·데스크톱 레이아웃."""
import json, os
from playwright.sync_api import sync_playwright

BASE = 'https://ssggg0.github.io/reel-studio'
OUT = '/workspace/downloads/reel_studio_qa'
res = {}
with sync_playwright() as pw:
    b = pw.chromium.launch()

    # 모바일: 결과 카드 클릭 → 대본 세팅 / 인기 레일 클릭
    ctx = b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, is_mobile=True, has_touch=True)
    p = ctx.new_page()
    errs = []
    p.on('pageerror', lambda e: errs.append(str(e)))
    p.goto(BASE + '/', wait_until='load')
    p.wait_for_timeout(1800)
    p.fill('#dKeyword', '강아지')
    p.click('#dSearch')
    p.wait_for_timeout(800)
    p.locator('#discoverResults .rcard').first.click()
    p.wait_for_timeout(900)
    res['card_to_script'] = p.evaluate("""()=>({tab:RS.state.ui.tab, name:RS.state.project.name,
        cues:RS.state.project.cues.length, panelHidden:document.getElementById('srcPanel').hidden,
        spTitle:document.getElementById('spTitle').innerText.slice(0,30),
        spOpen:document.getElementById('spOpen').getAttribute('href'),
        overflowX:document.documentElement.scrollWidth-window.innerWidth})""")
    p.screenshot(path=OUT + '/qa_card_to_script.png')

    # 인기 레일
    p.locator('.tb-item[data-tab="discover"]').click()
    p.wait_for_timeout(500)
    p.evaluate("()=>document.getElementById('popRail').scrollIntoView({block:'center'})")
    p.wait_for_timeout(400)
    n = p.evaluate("()=>document.querySelectorAll('#popRail .pop-item').length")
    p.locator('#popRail .pop-item').first.click()
    p.wait_for_timeout(800)
    res['pop_rail'] = {'n': n, 'tab': p.evaluate("()=>RS.state.ui.tab"),
                       'spTitle': p.evaluate("()=>document.getElementById('spTitle').innerText.slice(0,30)")}
    res['errs_mobile'] = errs
    ctx.close()

    # 데스크톱
    ctx = b.new_context(viewport={'width': 1280, 'height': 900})
    p = ctx.new_page()
    errs = []
    p.on('pageerror', lambda e: errs.append(str(e)))
    p.goto(BASE + '/', wait_until='load')
    p.wait_for_timeout(1800)
    p.fill('#dKeyword', '반전')
    p.click('#dSearch')
    p.wait_for_timeout(900)
    res['desktop'] = p.evaluate("""()=>({cards:document.querySelectorAll('#discoverResults .rcard').length,
        grid:getComputedStyle(document.getElementById('discoverResults')).gridTemplateColumns.split(' ').length,
        origCols:getComputedStyle(document.getElementById('origGrid')).gridTemplateColumns.split(' ').length,
        acts:[...document.querySelectorAll('#discoverResults .rcard .rc-act')].slice(0,4).map(a=>a.innerText.trim()),
        overflowX:document.documentElement.scrollWidth-window.innerWidth})""")
    p.screenshot(path=OUT + '/qa_desktop.png')
    p.evaluate("()=>document.getElementById('origWrap').scrollIntoView({block:'start'})")
    p.wait_for_timeout(600)
    p.screenshot(path=OUT + '/qa_desktop_originals.png')
    res['errs_desktop'] = errs
    ctx.close(); b.close()
print(json.dumps(res, ensure_ascii=False, indent=1))
