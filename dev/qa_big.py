import json, os
from playwright.sync_api import sync_playwright

INIT = """window.__errs=[];window.addEventListener('error',function(e){try{window.__errs.push(String(e.message||e.type)+' @'+(e.filename||'')+':'+(e.lineno||''))}catch(_){}},true);window.addEventListener('unhandledrejection',function(e){try{window.__errs.push('rejection: '+String(e.reason&&e.reason.stack||e.reason))}catch(_){}});"""

def new_page(ctx):
    page = ctx.new_page()
    page.add_init_script(INIT)
    return page
BASE = 'http://127.0.0.1:8123'
OUT = '/workspace/downloads/reel_studio_qa/cards'
os.makedirs(OUT, exist_ok=True)
with sync_playwright() as pw:
    b = pw.chromium.launch()
    ctx = b.new_context(viewport={'width': 900, 'height': 1000}, device_scale_factor=2)
    p = new_page(ctx)
    errs = []
    p.on('pageerror', lambda e: errs.append(str(e)))
    p.goto(BASE + '/index.html', wait_until='load')
    p.wait_for_timeout(2400)
    for pid in p.evaluate("RS.presets.map(p=>p.id)"):
        p.evaluate("""(pid)=>{
          let c=document.getElementById('big');
          if(!c){c=document.createElement('canvas');c.id='big';c.width=432;c.height=768;
            c.style.cssText='position:fixed;left:0;top:0;z-index:9999;width:432px;height:768px;background:#000';
            document.body.appendChild(c);}
          RS.render.draw(c.getContext('2d'),432,768,RS.stylePreviewProject(RS.presetById(pid)),1.7,{});
        }""", pid)
        p.wait_for_timeout(120)
        p.locator('#big').screenshot(path=f'{OUT}/{pid}.png')
    # 상단 여백 픽셀 분석 (도파민 띠)
    stats = p.evaluate("""()=>{
      const c=document.createElement('canvas');c.width=432;c.height=768;
      RS.render.draw(c.getContext('2d'),432,768,RS.stylePreviewProject(RS.presetById('dopa-band')),1.7,{});
      const d=c.getContext('2d').getImageData(0,0,432,120).data;
      let firstRow=-1,lastRow=-1;
      for(let y=0;y<120;y++){for(let x=0;x<432;x++){const i=(y*432+x)*4;const lum=(d[i]+d[i+1]+d[i+2])/3;const sat=Math.max(d[i],d[i+1],d[i+2])-Math.min(d[i],d[i+1],d[i+2]);if(lum>150&&sat<40){if(firstRow<0)firstRow=y;lastRow=y;break}}}
      return {firstBrightRow:firstRow,lastBrightRow:lastRow};
    }""")
    print(json.dumps({'errs': errs, 'page': p.evaluate("window.__errs"), 'band': stats}, ensure_ascii=False))
    b.close()
