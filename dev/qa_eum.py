import json
from playwright.sync_api import sync_playwright
BASE='http://127.0.0.1:8899/index.html'
OUT='/workspace/downloads/reel_studio_qa'
res={}
with sync_playwright() as pw:
    b=pw.chromium.launch(); ctx=b.new_context(viewport={'width':390,'height':844},is_mobile=True,has_touch=True)
    p=ctx.new_page(); errs=[]
    p.on('pageerror', lambda e: errs.append(str(e)))
    p.on('console', lambda m: errs.append('console '+m.type+': '+m.text[:120]) if m.type=='error' else None)
    p.goto(BASE, wait_until='load'); p.wait_for_timeout(1400)
    p.evaluate("()=>window.__rsQA.tab('preview')"); p.wait_for_timeout(400)
    cases=["이 장면은 그냥 지나치면 안 됨","사람들이 다 놀람","그 강아지 정말 귀여움","결국 관심임","마음이 아픔","이름을 부름","처음 보는 장면"]
    out=[]
    for t in cases:
        p.evaluate("(t)=>{const p=RS.state.project; p.cues[0].text=t; window.__rsQA.resync();}", t)
        p.wait_for_timeout(120)
        before = p.evaluate("()=>({flag:window.__rsQA.audit().filter(i=>i.id==='eum').map(i=>({ok:i.ok,detail:i.detail}))[0]})")
        p.evaluate("()=>window.__rsQA.fix()")
        p.wait_for_timeout(220)
        after = p.evaluate("()=>RS.state.project.cues[0].text")
        out.append({'in':t,'audit':before['flag'],'fixed':after})
    res['cases']=out
    ctx.grant_permissions(['clipboard-read','clipboard-write'])
    p.evaluate("()=>window.__rsQA.tab('upload')"); p.wait_for_timeout(900)
    p.click('#uCopyMeta'); p.wait_for_timeout(400)
    res['copy']=p.evaluate("()=>navigator.clipboard.readText()")[:120]
    res['errors']=errs
    ctx.close(); b.close()
print(json.dumps(res,ensure_ascii=False,indent=1))
