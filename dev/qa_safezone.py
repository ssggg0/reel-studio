import json
from playwright.sync_api import sync_playwright

BASE = 'http://127.0.0.1:8899/index.html'
OUT = '/workspace/downloads/reel_studio_qa'
res = {'styles': [], 'fix': {}}

with sync_playwright() as pw:
    b = pw.chromium.launch()
    ctx = b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, is_mobile=True, has_touch=True)
    p = ctx.new_page()
    errs = []
    p.on('pageerror', lambda e: errs.append(str(e)))
    p.goto(BASE, wait_until='load')
    p.wait_for_timeout(1400)
    p.evaluate("()=>window.__rsQA.tab('preview')")
    p.wait_for_timeout(500)

    # 각 스타일 적용 → 세이프존/점검
    ids = p.evaluate("()=>window.__rsQA.styles()")
    for sid in ids:
        p.evaluate("(id)=>window.__rsQA.style(id)", sid)
        p.wait_for_timeout(450)
        audit = p.evaluate("()=>window.__rsQA.audit().map(i=>({id:i.id,ok:i.ok,detail:i.detail}))")
        geom = p.evaluate("()=>window.__rsQA.geom()")
        res['styles'].append({'id': sid, 'geom': geom,
                              'safeOk': [a['ok'] for a in audit if a['id'] == 'safe'],
                              'bad': [a['detail'] for a in audit if not a['ok']]})

    # 한 스타일(다큐) 실제 렌더 픽셀 + 안내선 확인
    p.evaluate("()=>window.__rsQA.style('docu-hook')")
    p.wait_for_timeout(400)
    p.evaluate("()=>window.__rsQA.tab('preview')")
    p.wait_for_timeout(400)
    p.locator('#stageMain').screenshot(path=OUT + '/local_safe_docu.png')

    # 원클릭 자동 수정: 음슴체·긴 자막·시간 겹침을 심어놓고 실제로 고치는지
    p.evaluate("""()=>{
        const p = RS.state.project;
        p.cues = [
          {id:'a', text:'이 강아지는 한국말을 전혀 알아듣지 못함', start:0, end:4.0, sfx:'', comment:{on:false,text:'',name:'시청자'}},
          {id:'b', text:'그런데 북한말로 부르자 귀가 바로 쫑긋 서고 반응이 완전히 달라짐', start:3.4, end:8.2, sfx:'', comment:{on:false,text:'',name:'시청자'}},
          {id:'c', text:'사실 강아지는 단어보다 억양과 리듬을 먼저 기억함', start:8.1, end:12.0, sfx:'', comment:{on:false,text:'',name:'시청자'}},
          {id:'d', text:'결국 통하는 건 말이 아니라 관심임', start:11.6, end:15.0, sfx:'', comment:{on:false,text:'',name:'시청자'}}
        ];
        p.hook.line1='이 강아지 한국말은 전혀 알아듣지 못하고 완전히 무시함';
        p.hook.line2='북한말로 부르면 반응이 완전히 달라짐';
        p.sub.pos=0.88;
        window.__rsQA.resync();
    }""")
    p.wait_for_timeout(500)
    before = p.evaluate("()=>({items:window.__rsQA.audit().filter(i=>!i.ok).map(i=>i.title+' :: '+i.detail), geom:window.__rsQA.geom(), subPos:RS.state.project.sub.pos, cues:RS.state.project.cues.map(c=>c.text)})")
    p.evaluate("()=>window.__rsQA.fix()")
    p.wait_for_timeout(900)
    after = p.evaluate("()=>({items:window.__rsQA.audit().filter(i=>!i.ok).map(i=>i.title+' :: '+i.detail), geom:window.__rsQA.geom(), subPos:RS.state.project.sub.pos, cues:RS.state.project.cues.map(c=>c.text), hook:RS.state.project.hook})")
    res['fix'] = {'before': before, 'after': after}
    p.screenshot(path=OUT + '/local_audit_fixed.png')
    res['errors'] = errs
    ctx.close()
    b.close()

print(json.dumps(res, ensure_ascii=False, indent=1))
