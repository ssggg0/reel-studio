"""comment-flood 효과음 매칭 + 최종 무오류 확인"""
import json
from playwright.sync_api import sync_playwright

INIT = """window.__errs=[];window.addEventListener('error',function(e){window.__errs.push(String(e.message||e.type))},true);"""
BASE = 'http://127.0.0.1:8123'

with sync_playwright() as pw:
    b = pw.chromium.launch()
    ctx = b.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True, device_scale_factor=2)
    p = ctx.new_page(); p.add_init_script(INIT)
    errs = []
    p.on('pageerror', lambda e: errs.append(str(e)))
    p.goto(BASE + '/index.html', wait_until='load')
    p.wait_for_timeout(2000)
    p.locator('.tb-item[data-tab="script"]').first.click()
    p.wait_for_timeout(700)
    p.click('#styleGrid .style-card[data-preset-id="comment-flood"]')
    p.wait_for_timeout(700)
    out = p.evaluate("""()=>({
      preset: RS.state.project.presetId,
      cueSfx: RS.state.project.cues.map(c=>({hasComment: !!(c.comment&&c.comment.on), sfx:c.sfx})),
      sfxName: RS.state.project.cues.filter(c=>c.sfx).map(c=>RS.sfxName(c.sfx)),
      errs: window.__errs
    })""")
    out['pageErrs'] = errs
    print(json.dumps(out, ensure_ascii=False, indent=1))
    b.close()
