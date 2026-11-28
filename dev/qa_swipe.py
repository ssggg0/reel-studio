import json, sys
from playwright.sync_api import sync_playwright

BASE = 'http://127.0.0.1:8899/index.html'
OUT = '/workspace/downloads/reel_studio_qa'
res = {'errors': [], 'console': []}

with sync_playwright() as pw:
    b = pw.chromium.launch()
    ctx = b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, is_mobile=True, has_touch=True)
    p = ctx.new_page()
    p.on('pageerror', lambda e: res['errors'].append(str(e)))
    p.on('console', lambda m: res['console'].append(m.type + ': ' + m.text[:200]) if m.type == 'error' else None)
    p.goto(BASE, wait_until='load')
    p.wait_for_timeout(1800)
    res['boot'] = p.evaluate("()=>({tab:RS.state.ui.tab, cues:RS.state.project.cues.length, hasStage:!!document.getElementById('stageMedia')})")

    # 2단계로 이동
    p.evaluate("()=>window.__rsQA.tab('script')")
    p.wait_for_timeout(900)
    res['step2'] = p.evaluate("""()=>({
      stageW: document.getElementById('stageMedia').clientWidth,
      stageH: document.getElementById('stageMedia').clientHeight,
      styIdx: document.getElementById('styIdx').textContent,
      styName: document.getElementById('styName').textContent,
      dots: document.querySelectorAll('#styDots .sd').length,
      hook: document.getElementById('ovHook').innerText.slice(0,40),
      sub: document.getElementById('ovSub').innerText.slice(0,40),
      cmt: (document.getElementById('ovCmt').innerText||'').slice(0,30),
      subFont: getComputedStyle(document.getElementById('ovSub')).fontSize,
      removed: {
        styleGrid: !!document.getElementById('styleGrid'),
        srcPanel: !!document.getElementById('srcPanel'),
        sRatio: !!document.getElementById('sRatio'),
        vZoom: !!document.getElementById('vZoom'),
        spFind: !!document.getElementById('spFind'),
        spFile: !!document.getElementById('spFile')
      },
      hScroll: document.documentElement.scrollWidth - document.documentElement.clientWidth
    })""")
    p.screenshot(path=OUT + '/swipe_studio_mobile.png')

    # 스타일 넘기기
    p.click('#styNext')
    p.wait_for_timeout(600)
    res['after_next'] = p.evaluate("""()=>({
      idx: document.getElementById('styIdx').textContent,
      name: document.getElementById('styName').textContent,
      preset: RS.state.project.presetId,
      hookStyle: RS.state.project.hook.style,
      subBox: RS.state.project.sub.box,
      cardOn: RS.state.project.card.on,
      cardBg: RS.state.project.card.bg,
      grade: RS.state.project.grade,
      filter: document.getElementById('stageVideo').style.filter
    })""")
    p.screenshot(path=OUT + '/swipe_studio_style2.png')

    # 큐 수정 → 오버레이 즉시 반영
    p.fill('#cueList .cue:first-child textarea.cue-text', '고친 문장 바로 반영 테스트')
    p.wait_for_timeout(500)
    res['live_edit'] = p.evaluate("""()=>({
      overlay: document.getElementById('ovSub').innerText,
      cue0: RS.state.project.cues[0].text,
      pinned: RS.state.ui.pinnedCue === RS.state.project.cues[0].id
    })""")

    # 다른 추천 대본
    before = p.evaluate("()=>RS.state.project.cues.map(c=>c.text).join('|')")
    p.click('#regenScript')
    p.wait_for_timeout(1200)
    after = p.evaluate("()=>RS.state.project.cues.map(c=>c.text).join('|')")
    res['regen'] = {'changed': before != after,
                    'n': p.evaluate("()=>RS.state.project.cues.length"),
                    'toast': p.evaluate("()=>document.querySelector('.toast')?.innerText||''")}

    # 1단계 카드 미리보기
    p.evaluate("()=>window.__rsQA.tab('discover')")
    p.wait_for_timeout(400)
    p.click('#discoverResults .rcard .rc-play')
    p.wait_for_timeout(700)
    res['preview'] = p.evaluate("""()=>({
      open: !document.getElementById('previewModal').hidden,
      iframe: (document.getElementById('pvIframe').src||'').slice(0,70),
      title: document.getElementById('pvTitle').innerText.slice(0,40),
      pick: document.getElementById('pvPick').innerText
    })""")
    p.screenshot(path=OUT + '/swipe_preview_modal.png')
    p.click('#pvPick')
    p.wait_for_timeout(1500)
    res['after_pick'] = p.evaluate("""()=>({
      tab: RS.state.ui.tab,
      stageKind: (document.getElementById('stageIframe').hidden ? 'video' : 'iframe'),
      iframeSrc: (document.getElementById('stageIframe').src||'').slice(0,80),
      name: document.getElementById('stageSrcName').innerText,
      openShown: !document.getElementById('stageOpen').hidden,
      dlShown: !document.getElementById('stageDl').hidden
    })""")

    # 5단계 작업 세트
    p.evaluate("()=>window.__rsQA.tab('upload')")
    p.wait_for_timeout(1200)
    ctx.grant_permissions(['clipboard-read', 'clipboard-write'])
    p.click('#uCopySet')
    p.wait_for_timeout(600)
    clip = p.evaluate("()=>navigator.clipboard.readText()")
    res['handoff'] = clip[:900]
    p.screenshot(path=OUT + '/swipe_handoff.png')

    res['hscroll_all'] = p.evaluate("()=>['discover','script','music','preview','upload'].map(t=>{window.__rsQA.tab(t);const e=document.querySelector('.panel[data-panel=\"'+t+'\"]');return [t, e.scrollWidth - e.clientWidth];})")
    res['errors2'] = p.evaluate("()=>window.__rsErrors.slice(0,10)")
    b.close()

print(json.dumps(res, ensure_ascii=False, indent=1))
