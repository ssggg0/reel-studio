import json
from playwright.sync_api import sync_playwright

BASE = 'http://127.0.0.1:8899/index.html'
OUT = '/workspace/downloads/reel_studio_qa'
MP4 = '/workspace/reel-studio-repo/originals/cat01_kungfu.mp4'
res = {}

with sync_playwright() as pw:
    b = pw.chromium.launch()
    ctx = b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, is_mobile=True, has_touch=True)
    p = ctx.new_page()
    errs = []
    p.on('pageerror', lambda e: errs.append(str(e)))
    p.goto(BASE, wait_until='load')
    p.wait_for_timeout(1400)

    # 실제 영상 원본 올리기
    p.evaluate("()=>window.__rsQA.tab('script')")
    p.wait_for_timeout(300)
    p.set_input_files('#sVideoFile', MP4)
    p.wait_for_timeout(2500)
    res['video'] = p.evaluate("()=>({name:RS.state.media.videoName, dur:RS.state.media.videoDur, w:RS.state.media.video&&RS.state.media.video.videoWidth})")

    p.evaluate("()=>window.__rsQA.tab('upload')")
    p.wait_for_timeout(1600)
    res['thumb_src'] = p.evaluate("()=>document.getElementById('uThumbState').textContent")
    for i, name in enumerate(['docu', 'dopa', 'card']):
        p.locator('#uThumbStyles .chip').nth(i).click()
        p.wait_for_timeout(700)
        p.locator('#uThumbCanvas').screenshot(path=OUT + f'/local_thumb_{name}_video.png')
    res['titles'] = p.evaluate("()=>[...document.querySelectorAll('#uTitleList .title-item')].map(b=>b.innerText.replace(/\\n/g,' | '))")
    p.evaluate("()=>document.getElementById('uTitleList').scrollIntoView({block:'center'})")
    p.wait_for_timeout(400)
    p.screenshot(path=OUT + '/local_upload_titles.png')
    p.evaluate("()=>document.getElementById('uThumbCard').scrollIntoView({block:'start'})")
    p.wait_for_timeout(500)
    p.screenshot(path=OUT + '/local_upload_thumb.png')
    p.evaluate("()=>document.getElementById('uHandoff').scrollIntoView({block:'center'})")
    p.wait_for_timeout(500)
    p.screenshot(path=OUT + '/local_upload_handoff.png')
    res['overflowX'] = p.evaluate("()=>document.documentElement.scrollWidth - window.innerWidth")
    # 탭 순회 속도/에러
    times = {}
    for tab in ['discover', 'script', 'music', 'preview', 'upload']:
        t0 = p.evaluate("()=>performance.now()")
        p.evaluate("(t)=>window.__rsQA.tab(t)", tab)
        p.wait_for_timeout(120)
        times[tab] = p.evaluate("(t0)=>Math.round(performance.now()-t0)", t0)
    res['tab_ms'] = times
    res['errors'] = errs
    ctx.close()
    b.close()

print(json.dumps(res, ensure_ascii=False, indent=1))
