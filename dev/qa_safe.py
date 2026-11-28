"""🛡️ 수익화 위험 영상 자동 제외 QA — 로컬 서버에서 실제 화면을 띄워 검수합니다.

  python3 dev/qa_safe.py            # 작업 폴더의 파일을 그대로 띄워 검수(배포 전)
  python3 dev/qa_safe.py --live     # https://ssggg0.github.io/reel-studio 실배포 검수

검수 항목
  1) 데모 모드: 뱃지 기본 ON, '동물'/'예능'/'모음' 검색, 뱃지 토글 OFF/ON
  2) 실시간 모드(fetch 스텁): 방송·아이돌·영화·랭킹 픽스처가 결과에서 사라지고
     상태줄에 '방송·아이돌·랭킹 등 위험 N건 자동 제외'가 뜨는지
  3) 인기 쇼츠 레일에서도 랭킹·모음집이 빠지는지
"""
import json, os, sys, threading, functools, http.server, socketserver
from playwright.sync_api import sync_playwright

LIVE = '--live' in sys.argv
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = '/workspace/downloads/reel_studio_qa'
os.makedirs(OUT, exist_ok=True)

# ── 픽스처: 절반은 위험(방송·아이돌·영화·랭킹), 절반은 안전(단일 장면) ──
SEARCH_ITEMS = [
    # 위험 6건 (방송·아이돌·영화·랭킹 모음집) — 걸러져야 하는 항목
    ('KBSNOW', '뮤직뱅크 1위 무대 풀영상', 'KBS Kpop'),
    ('SBSNOW1', '런닝맨 레전드 명장면 하이라이트', 'SBS NOW'),
    ('M2STUDIO', 'STUDIO CHOOM 직캠 풀버전', 'M2'),
    ('NFLXKR01', '넷플릭스 신작 공식 예고편', 'Netflix Korea'),
    ('TOPRANK1', '전국 강아지 랭킹 TOP 10 모음집', 'PetRank'),
    ('MBCENT01', '나 혼자 산다 예능 클립', 'MBCentertainment'),
    # 안전 6건 (단일 장면·해외 밈·동물) — 실제 영상 ID라 썸네일도 진짜
    ('eS6ZBwjHoWI', '북한말로 불러야 알아듣는 강아지', '멍멍일기'),
    ('WRirWdRi5gc', 'toast asmr🍞', 'toast'),
    ('p3UsCxQuxeY', 'real vs. fake nail polish cracking ASMR🍓', 'nail.asmr'),
    ('d6uF-zl7CB0', '누가 설계했는지 궁금한 미끄럼틀 대참사', '해외밈창고'),
    ('KiEVKDr5XlQ', '감동적인 태국 반전 광고', 'ThaiAd'),
    ('bwtSrNBnXKI', '테니스가 위험한 이유', 'funny clips'),
]

def build_routes(page):
    def search(route):
        q = route.request.url
        items = [{'id': {'videoId': v[0]}, 'snippet': {'title': v[1], 'channelTitle': v[2],
                  'channelId': 'c_' + v[0], 'publishedAt': '2026-11-20T00:00:00Z',
                  'thumbnails': {'medium': {'url': 'https://i.ytimg.com/vi/%s/hqdefault.jpg' % v[0]}}}}
                 for v in SEARCH_ITEMS]
        route.fulfill(status=200, content_type='application/json',
                      body=json.dumps({'items': items}))
    def videos(route):
        items = []
        for i, v in enumerate(SEARCH_ITEMS):
            items.append({'id': v[0], 'snippet': {'title': v[1], 'channelTitle': v[2],
                          'channelId': 'c_' + v[0], 'publishedAt': '2026-11-20T00:00:00Z',
                          'thumbnails': {'medium': {'url': 'https://i.ytimg.com/vi/%s/hqdefault.jpg' % v[0]}}},
                          'statistics': {'viewCount': str(9000000 - i * 400000)},
                          'contentDetails': {'duration': 'PT0M35S'}})
        route.fulfill(status=200, content_type='application/json', body=json.dumps({'items': items}))
    def channels(route):
        items = [{'id': 'c_' + v[0], 'statistics': {'subscriberCount': '120000'}} for v in SEARCH_ITEMS]
        route.fulfill(status=200, content_type='application/json', body=json.dumps({'items': items}))
    page.route('**/youtube/v3/search**', search)
    page.route('**/youtube/v3/videos**', videos)
    page.route('**/youtube/v3/channels**', channels)

def probe(page):
    return page.evaluate("""()=>({
      status: (document.getElementById('discoverStatus')||{}).innerText||'',
      badge: (document.getElementById('safeToggle')||{}).innerText||'',
      badgeOn: !!(document.getElementById('safeToggle')||{classList:{contains:()=>false}}).classList.contains('on'),
      pressed: document.getElementById('safeToggle') ? document.getElementById('safeToggle').getAttribute('aria-pressed') : null,
      cards: [...document.querySelectorAll('#discoverResults .rcard .rc-title')].map(e=>e.innerText),
      rail: [...document.querySelectorAll('#popRail .pop-title')].map(e=>e.innerText),
      popSafe: document.getElementById('popSafe') && !document.getElementById('popSafe').hidden ? document.getElementById('popSafe').innerText : '',
      safeState: (document.getElementById('safeState')||{}).innerText||'',
      demoRatio: RS.rank ? RS.rank.stats(RS.demoDiscover.slice(0,12)) : null,
      railRatio: RS.rank ? RS.rank.stats(RS.popularShorts) : null,
      railFirst8: RS.rank ? RS.rank.stats(RS.popularShorts.slice(0,8)) : null
    })""")

BAD_WORDS = ['KBS','SBS','MBC','M2','넷플릭스','Netflix','랭킹','TOP','모음집','직캠','예능','명장면','풀영상','예고편']

def leaked(titles):
    return [t for t in titles if any(w in t for w in BAD_WORDS)]

res = {}

# ── 로컬 파일을 그대로 내려주는 라우트(서버 없이) ──
LOCAL_BASE = 'http://reelstudio.test'
CTYPE = {'.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8',
         '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.mp4': 'video/mp4',
         '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webm': 'video/webm',
         '.svg': 'image/svg+xml', '.woff2': 'font/woff2'}

def serve_local(page):
    from urllib.parse import urlparse, unquote
    def handler(route):
        path = unquote(urlparse(route.request.url).path)
        if path in ('', '/'): path = '/index.html'
        fp = os.path.join(ROOT, path.lstrip('/'))
        if not os.path.isfile(fp):
            route.fulfill(status=404, body='not found'); return
        route.fulfill(status=200, content_type=CTYPE.get(os.path.splitext(fp)[1].lower(), 'application/octet-stream'),
                      body=open(fp, 'rb').read())
    page.route(LOCAL_BASE + '/**', handler)

BASE = 'https://ssggg0.github.io/reel-studio' if LIVE else LOCAL_BASE

with sync_playwright() as pw:
    b = pw.chromium.launch()

    # ══ 1) 데모 모드 (키 없음) ══
    ctx = b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2,
                        is_mobile=True, has_touch=True)
    p = ctx.new_page()
    errs = []
    p.on('pageerror', lambda e: errs.append(str(e)))
    if not LIVE: serve_local(p)
    p.goto(BASE + '/', wait_until='load')
    p.wait_for_timeout(1500)
    res['demo_boot'] = probe(p)
    res['errs_demo'] = errs[:3]

    for kw in ['동물', '예능', '모음', '아이돌']:
        p.fill('#dKeyword', kw)
        p.click('#dSearch')
        p.wait_for_timeout(900)
        r = probe(p)
        r['leaked'] = leaked(r['cards'])
        res['demo_' + kw] = r

    # 뱃지 토글 OFF → ON
    p.fill('#dKeyword', '동물'); p.click('#dSearch'); p.wait_for_timeout(800)
    p.locator('#safeToggle').click(); p.wait_for_timeout(700)
    res['toggle_off'] = probe(p)
    p.locator('#safeToggle').click(); p.wait_for_timeout(700)
    res['toggle_on'] = probe(p)

    p.evaluate("()=>document.getElementById('safeToggle').scrollIntoView({block:'center'})")
    p.wait_for_timeout(500)
    p.screenshot(path=OUT + '/safe_filter_badge_mobile.png')

    # 인기 레일 확인 (랭킹·모음집 제외)
    res['rail_ok'] = leaked(res['demo_동물']['rail']) == []
    ctx.close()

    # ══ 2) 실시간 모드 (fetch 스텁) ══
    ctx = b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2,
                        is_mobile=True, has_touch=True)
    p = ctx.new_page()
    errs2 = []
    p.on('pageerror', lambda e: errs2.append(str(e)))
    p.add_init_script("try{localStorage.setItem('reelstudio.settings.v1', JSON.stringify({youtube:'TEST_KEY'}))}catch(e){}")
    build_routes(p)
    if not LIVE: serve_local(p)
    p.goto(BASE + '/', wait_until='load')
    p.wait_for_timeout(1800)
    res['live_boot'] = {'rail': probe(p)['rail'], 'errs': errs2[:3]}

    for kw in ['예능', '아이돌', '동물']:
        p.fill('#dKeyword', kw)
        p.click('#dSearch')
        p.wait_for_timeout(1200)
        r = probe(p)
        r['leaked'] = leaked(r['cards'])
        res['live_' + kw] = r

    # 실시간 상태에서 토글 OFF → 방송·아이돌이 실제로 나오는지
    p.locator('#safeToggle').click(); p.wait_for_timeout(900)
    res['live_toggle_off'] = probe(p)
    p.locator('#safeToggle').click(); p.wait_for_timeout(900)
    res['live_toggle_on'] = probe(p)

    p.evaluate("()=>document.getElementById('discoverResultHead').scrollIntoView({block:'start'})")
    p.wait_for_timeout(2600)   # 토스트가 사라진 뒤 결과만 담기게
    p.screenshot(path=OUT + '/safe_filter_mobile.png')
    res['errs_live'] = errs2[:3]
    ctx.close()

    # 데스크톱 한 장
    ctx = b.new_context(viewport={'width': 1280, 'height': 900})
    p = ctx.new_page()
    p.on('pageerror', lambda e: errs2.append(str(e)))
    p.add_init_script("try{localStorage.setItem('reelstudio.settings.v1', JSON.stringify({youtube:'TEST_KEY'}))}catch(e){}")
    build_routes(p)
    if not LIVE: serve_local(p)
    p.goto(BASE + '/', wait_until='load')
    p.wait_for_timeout(1600)
    p.fill('#dKeyword', '예능'); p.click('#dSearch'); p.wait_for_timeout(1200)
    p.screenshot(path=OUT + '/safe_filter_desktop.png')
    res['desktop'] = probe(p)
    res['overflowX'] = p.evaluate("()=>document.documentElement.scrollWidth-window.innerWidth")
    ctx.close(); b.close()

open(OUT + '/safe_filter_report.json', 'w', encoding='utf-8').write(json.dumps(res, ensure_ascii=False, indent=1))
print(json.dumps(res, ensure_ascii=False, indent=1)[:4000])
