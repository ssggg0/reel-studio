/* REEL STUDIO — core: utils, state, presets, demo data */
(function () {
  'use strict';
  const RS = window.RS = window.RS || {};

  /* ── utils ───────────────────────────────────────────── */
  const U = RS.util = {
    uid() { return Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-3); },
    clamp(v, a, b) { return Math.min(b, Math.max(a, v)); },
    lerp(a, b, t) { return a + (b - a) * t; },
    clone(o) { try { return structuredClone(o); } catch (e) { return JSON.parse(JSON.stringify(o)); } },
    debounce(fn, ms) { let t; return function (...a) { clearTimeout(t); t = setTimeout(() => fn.apply(this, a), ms); }; },
    fmtTime(sec) {
      sec = Math.max(0, sec || 0);
      const m = Math.floor(sec / 60);
      const s = sec - m * 60;
      return m + ':' + (s < 10 ? '0' : '') + s.toFixed(1);
    },
    fmtClock(sec) {
      sec = Math.max(0, sec || 0);
      const m = Math.floor(sec / 60), s = Math.floor(sec % 60);
      return m + ':' + (s < 10 ? '0' : '') + s;
    },
    fmtNum(n) {
      n = Number(n) || 0;
      if (n >= 100000000) return (n / 100000000).toFixed(n >= 1000000000 ? 0 : 1).replace('.0', '') + '억';
      if (n >= 10000) return Math.round(n / 10000).toLocaleString('ko-KR') + '만';
      if (n >= 1000) return (n / 1000).toFixed(1).replace('.0', '') + '천';
      return String(n);
    },
    esc(s) {
      return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    },
    /* rich text: #단어 → 강조, *단어* → 강조+밑줄 */
    rich(text, autoNumber) {
      text = String(text || '');
      const segs = [];
      const push = (t, em, ul) => { if (t) segs.push({ t, em: !!em, ul: !!ul }); };
      let buf = '', i = 0;
      while (i < text.length) {
        const ch = text[i];
        if (ch === '#' && i + 1 < text.length && !/\s/.test(text[i + 1])) {
          push(buf); buf = '';
          let j = i + 1;
          while (j < text.length && !/[\s]/.test(text[j])) j++;
          push(text.slice(i + 1, j), true);
          i = j; continue;
        }
        if (ch === '*') {
          const end = text.indexOf('*', i + 1);
          if (end > i + 1) { push(buf); buf = ''; push(text.slice(i + 1, end), true, true); i = end + 1; continue; }
        }
        buf += ch; i++;
      }
      push(buf);
      if (!autoNumber) return segs;
      const out = [];
      const re = /\d[\d,.]*(\s?(%|조|억|만|천|배|원|초|명|개|포인트|분|시간))?/g;
      segs.forEach(s => {
        if (s.em) { out.push(s); return; }
        let last = 0, m;
        const str = s.t;
        re.lastIndex = 0;
        while ((m = re.exec(str))) {
          if (m.index > last) out.push({ t: str.slice(last, m.index), em: false });
          out.push({ t: m[0], em: true, num: true });
          last = m.index + m[0].length;
        }
        if (last < str.length) out.push({ t: str.slice(last), em: false });
      });
      return out;
    },
    strip(text) {
      return String(text || '').replace(/#([^\s#]+)/g, '$1').replace(/\*([^*]+)\*/g, '$1');
    },
    download(name, blob) {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = name;
      document.body.appendChild(a); a.click();
      setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
    },
    async copy(text) {
      text = String(text || '');
      try {
        if (navigator.clipboard && window.isSecureContext) { await navigator.clipboard.writeText(text); return true; }
      } catch (e) {}
      try {
        const ta = document.createElement('textarea');
        ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
        document.body.appendChild(ta); ta.focus(); ta.select();
        const ok = document.execCommand('copy');
        ta.remove(); return ok;
      } catch (e) { return false; }
    },
    totalDur(p) {
      const c = (p.cues || []).slice().sort((a, b) => a.start - b.start);
      if (!c.length) return 0;
      return Math.max(...c.map(x => Number(x.end) || 0));
    },
    cueAt(p, t) {
      for (const c of p.cues) if (t >= c.start - 0.001 && t < c.end - 0.001) return c;
      return null;
    },
    srt(p) {
      const f = s => {
        const ms = Math.round(s * 1000);
        const h = Math.floor(ms / 3600000), m = Math.floor(ms / 60000) % 60, sec = Math.floor(ms / 1000) % 60, r = ms % 1000;
        const p2 = n => String(n).padStart(2, '0');
        return p2(h) + ':' + p2(m) + ':' + p2(sec) + ',' + String(r).padStart(3, '0');
      };
      return p.cues.map((c, i) => `${i + 1}\n${f(c.start)} --> ${f(c.end)}\n${U.strip(c.text)}\n`).join('\n');
    }
  };

  /* ── toast / modal ───────────────────────────────────── */
  RS.toast = function (msg, type) {
    const box = document.getElementById('toasts');
    if (!box) return;
    const el = document.createElement('div');
    el.className = 'toast' + (type ? ' ' + type : '');
    el.textContent = msg;
    box.appendChild(el);
    setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity .3s'; setTimeout(() => el.remove(), 320); }, type === 'err' ? 4200 : 2400);
  };
  RS.openModal = function (id) {
    const m = document.getElementById(id + 'Modal') || document.getElementById(id);
    if (m) m.hidden = false;
    document.body.style.overflow = 'hidden';
  };
  RS.closeModal = function (id) {
    const m = document.getElementById(id + 'Modal') || document.getElementById(id);
    if (m) m.hidden = true;
    if (!document.querySelector('.modal:not([hidden])')) document.body.style.overflow = '';
  };
  RS.confirm = function (title, body) {
    return new Promise(resolve => {
      document.getElementById('cfTitle').textContent = title || '확인';
      document.getElementById('cfBody').textContent = body || '';
      RS.openModal('confirm');
      const ok = document.getElementById('cfOk');
      RS._cfResolve = resolve;
      ok.onclick = () => {
        const r = RS._cfResolve; RS._cfResolve = null;
        RS.closeModal('confirm');
        if (r) r(true);
      };
    });
  };

  /* ── presets ─────────────────────────────────────────── */
  const P = RS.presets = [
    {
      id: 'issuehanjan', name: '이슈한잔 스타일', builtin: true,
      desc: '다크 다큐(#0B0D12) · 정중앙 정렬 · 라임 키워드 강조 · 댓글 카드',
      ratio: '9:16',
      hook: { on: true, style: 'plain', color: '#FFFFFF', accent: '#D8FF3E', bg: '#0B0D12', size: 54, font: '"Apple SD Gothic Neo","Malgun Gothic","Noto Sans KR",sans-serif', band: 0.17 },
      sub: { fontSize: 62, weight: 900, accent: '#D8FF3E', box: true, boxColor: 'rgba(8,10,14,.72)', radius: 0, pos: 0.78, font: '"Apple SD Gothic Neo","Malgun Gothic","Noto Sans KR",sans-serif', stroke: 0, autoNumber: true },
      card: { style: 'square', bg: 'rgba(15,17,22,.9)', radius: 2, name: '시청자', handle: '@viewer', x: 0.06, y: 0.60 },
      tag: { on: false, text: '@issuehanjan' },
      grade: 'cine', zoom: 1, offset: 0.5,
      bgm: { id: 'docu', volume: 0.3, duck: 0.55 }, voiceRate: 1.13
    },
    {
      id: 'hipplug', name: '힙플러그 스타일', builtin: true,
      desc: '흰 라운드 제목 카드 · 검정 직각 자막 박스 · 좌측 세로 핸들 · 쨍한 색감',
      ratio: '9:16',
      hook: { on: true, style: 'card', color: '#0A0A0A', accent: '#0A0A0A', bg: '#FFFFFF', size: 50, font: '"Apple SD Gothic Neo","Malgun Gothic","Noto Sans KR",sans-serif', band: 0.14 },
      sub: { fontSize: 60, weight: 900, accent: '#FFE45C', box: true, boxColor: '#000000', radius: 0, pos: 0.705, font: '"Apple SD Gothic Neo","Malgun Gothic","Noto Sans KR",sans-serif', stroke: 0, autoNumber: false },
      card: { style: 'square', bg: 'rgba(0,0,0,.88)', radius: 0, name: '시청자', handle: '@viewer', x: 0.06, y: 0.56 },
      tag: { on: true, text: '@hipplug' },
      grade: 'vivid', zoom: 1.06, offset: 0.5,
      bgm: { id: 'trendy', volume: 0.22, duck: 0.4 }, voiceRate: 1.0
    },
    {
      id: 'zzaljuwoseo', name: '짤주웠어 스타일', builtin: true,
      desc: '상단 검은 띠 제목(156px) · 자막 아래 직각 댓글 카드 · 무난한 색감',
      ratio: '9:16',
      hook: { on: true, style: 'band', color: '#FFFFFF', accent: '#FFFFFF', bg: '#000000', size: 52, font: '"Black Han Sans","Apple SD Gothic Neo","Malgun Gothic","Noto Sans KR",sans-serif', band: 0.081 },
      sub: { fontSize: 54, weight: 900, accent: '#D8FF3E', box: true, boxColor: 'rgba(0,0,0,.78)', radius: 0, pos: 0.635, font: '"Apple SD Gothic Neo","Malgun Gothic","Noto Sans KR",sans-serif', stroke: 0, autoNumber: false },
      card: { style: 'square', bg: 'rgba(15,15,18,.75)', radius: 0, name: '시청자', handle: '@viewer', x: 0.085, y: 0.755 },
      tag: { on: false, text: '@zzaljuwoseo' },
      grade: 'none', zoom: 1, offset: 0.5,
      bgm: { id: 'humor', volume: 0.26, duck: 0.5 }, voiceRate: 1.16
    },
    {
      id: 'raw', name: '날것 도파민', builtin: true,
      desc: '카드 없이 큰 자막만 · 강한 대비 · 빠른 템포',
      ratio: '9:16',
      hook: { on: true, style: 'plain', color: '#FFFFFF', accent: '#FFE45C', bg: '#000000', size: 60, font: '"Gothic A1","Apple SD Gothic Neo","Malgun Gothic","Noto Sans KR",sans-serif', band: 0.2 },
      sub: { fontSize: 70, weight: 900, accent: '#FFE45C', box: false, boxColor: 'rgba(0,0,0,.6)', radius: 0, pos: 0.72, font: '"Gothic A1","Apple SD Gothic Neo","Malgun Gothic","Noto Sans KR",sans-serif', stroke: 3, autoNumber: true },
      card: { style: 'bubble', bg: 'rgba(255,255,255,.1)', radius: 14, name: '시청자', handle: '@viewer', x: 0.05, y: 0.55 },
      tag: { on: false, text: '@reelstudio' },
      grade: 'vivid', zoom: 1.1, offset: 0.5,
      bgm: { id: 'tension', volume: 0.34, duck: 0.45 }, voiceRate: 1.2
    }
  ];

  RS.presetById = id => P.find(p => p.id === id) || P[0];
  RS.hookStyles = { band: '상단 검은 띠', card: '흰 라운드 카드', plain: '민무늬 큰 글씨' };

  /* ── defaults ────────────────────────────────────────── */
  RS.sampleSources = [
    { id: 'docu', name: '다큐 다크', desc: '그리드 · 라이트 · 데이터 바' },
    { id: 'chart', name: '라이브 차트', desc: '그려지는 라인 · 카운터' },
    { id: 'neon', name: '네온 스트리트', desc: '보라 네온 · 스캔라인' },
    { id: 'paper', name: '페이퍼', desc: '종이 질감 · 잉크' }
  ];
  RS.bgmList = [
    { id: 'tension', name: '긴장감', desc: '낮은 드론 · 16분 펄스', bpm: 92 },
    { id: 'docu', name: '다큐', desc: '피아노 아르페지오 · 패드', bpm: 78 },
    { id: 'trendy', name: '트렌디', desc: '포온더플로어 · 플럭', bpm: 112 },
    { id: 'humor', name: '유머', desc: '피치카토 · 우드블록', bpm: 120 },
    { id: 'emotion', name: '감성', desc: '벨 아르페지오 · 웜 패드', bpm: 70 }
  ];
  RS.sfxList = [
    { id: 'pop', name: '팝' }, { id: 'whoosh', name: '휙' },
    { id: 'impact', name: '밑줄' }, { id: 'alert', name: '알림' }
  ];

  RS.newProject = function () {
    const p = RS.presetById('issuehanjan');
    return {
      id: U.uid(), name: '새 쇼츠', ratio: '9:16', topic: '', lang: 'ko', presetId: 'issuehanjan',
      source: { type: 'sample', sample: 'docu', name: '다큐 다크' },
      hook: { on: true, line1: '', line2: '', style: p.hook.style, color: p.hook.color, accent: p.hook.accent, bg: p.hook.bg, size: p.hook.size, font: p.hook.font },
      sub: JSON.parse(JSON.stringify(p.sub)),
      card: JSON.parse(JSON.stringify({ on: true, style: p.card.style, bg: p.card.bg, radius: p.card.radius, name: p.card.name, handle: p.card.handle, x: p.card.x, y: p.card.y })),
      tag: JSON.parse(JSON.stringify(p.tag)),
      grade: p.grade, bright: 0, contrast: 0, sat: 0, zoom: p.zoom, offset: p.offset,
      bgm: JSON.parse(JSON.stringify({ id: p.bgm.id, on: true, volume: p.bgm.volume, duck: p.bgm.duck })),
      voice: { rate: p.voiceRate, voiceURI: '', on: true, volume: 1, file: null, fileName: null },
      orig: { on: true, volume: 1 },
      cues: [],
      meta: { titles: ['', '', ''], selected: 0, desc: '', tags: '' },
      updatedAt: Date.now()
    };
  };

  RS.demoProject = function () {
    const p = RS.newProject();
    p.name = '북한말로 부르면 알아듣는 강아지';
    p.topic = '한국말로 부르면 무시하는 강아지가 북한말에는 바로 반응한 이유';
    p.hook.line1 = '이 강아지, 한국말은 몰라요';
    p.hook.line2 = '북한말로 부르면 바로 반응합니다';
    const cues = [
      ['한국말로 부르면 고개도 안 돌리는 강아지', 0, 3.0],
      ['그런데 #북한말로 부르자', 3.0, 5.6],
      ['귀가 바로 쫑긋 섰습니다', 5.6, 8.0],
      ['처음 듣는 말인데도 반응이 똑같습니다', 8.0, 11.4, '이게 말이 되나'],
      ['강아지는 단어보다 #억양을 먼저 기억합니다', 11.4, 15.0],
      ['말의 뜻이 아니라 소리의 결을 읽는 겁니다', 15.0, 18.2],
      ['그래서 이 영상이 계속 다시 돌아갑니다', 18.2, 21.0, '몇 번을 봐도 웃김'],
      ['결국 통하는 건 말이 아니라 #관심입니다', 21.0, 24.6]
    ];
    p.cues = cues.map((c, i) => ({
      id: U.uid(), text: c[0], start: c[1], end: c[2], sfx: i === 0 ? 'impact' : '',
      comment: { on: !!c[3], text: c[3] || '', name: '시청자' }
    }));
    p.meta.titles = [
      '한국말은 무시, 북한말엔 바로 반응하는 강아지',
      '이 강아지가 알아듣는 말은 딱 하나였습니다',
      '부르는 말보다 중요한 것, 강아지가 먼저 알고 있었습니다'
    ];
    p.meta.desc = '한국말로 부르면 무시하던 강아지가 북한말에는 바로 반응했습니다.\n강아지는 단어의 뜻보다 억양과 리듬을 먼저 기억합니다.\n결국 통하는 건 말이 아니라 관심이었습니다.\n\n#강아지 #반려견 #동물 #쇼츠';
    p.meta.tags = '강아지,반려견,동물,쇼츠,반전';
    return p;
  };

  /* ── 인기 쇼츠 풀 (2026-11-27 YouTube 인기 쇼츠 조회수 기준) ──
     API 키가 없을 때 데모 데이터로 쓰고, 있으면 실제 검색 결과로 대체합니다. */
  RS.viralPool = [
    { id: "eS6ZBwjHoWI", cat: "동물", views: 51570000, title: "북한말로 불러야 알아듣는 강아지" },
    { id: "WRirWdRi5gc", cat: "ASMR", views: 48360000, title: "toast asmr🍞" },
    { id: "t6v6a4Hog0w", cat: "ASMR", views: 42480000, title: "ASMR Tooth Fairy Eats Your Teeth Candy 🦷🍭🧚‍♀️" },
    { id: "p3UsCxQuxeY", cat: "ASMR", views: 39220000, title: "real vs. fake nail polish cracking ASMR🍓" },
    { id: "35yH2r2-4bI", cat: "동물", views: 32530000, title: "잊지 못하는 강아지 모음집 1" },
    { id: "7FgpiYQVXoA", cat: "동물", views: 26490000, title: "찹츄 마스터의 손길에 순식간에 당한 강아지들" },
    { id: "h0FVO_Zn1zY", cat: "여행", views: 25860000, title: "이런 풍경이면 무슨 노래든 명곡이 돼.." },
    { id: "g9TXLAbc-1Q", cat: "해외일상", views: 25180000, title: "일본인 아내와 5살 아이와 걸어서만 홋카이도를 여행해봤습니다" },
    { id: "c94GU4DEkYs", cat: "운동", views: 22510000, title: "요즘 너무 핫한 이 운동, 100번 채우기 도전" },
    { id: "H85ojZSV9lM", cat: "해외일상", views: 20280000, title: "참지 않는 K여친" },
    { id: "A4anjbzpUmI", cat: "요리", views: 18920000, title: "계란을 이렇게 해 보세요, 매 끼니 이걸 먹습니다" },
    { id: "qjHFz00cZrU", cat: "유머", views: 17450000, title: "해변에 아무데나 앉으면 안되는 이유" },
    { id: "xtnq5RinY_A", cat: "요리", views: 16390000, title: "이거 알고 감자 매일 먹어요" },
    { id: "FYYqujTehl0", cat: "유머", views: 15470000, title: "운수 좋은 날" },
    { id: "d6uF-zl7CB0", cat: "반전", views: 14860000, title: "누가 설계했는지 궁금한 미끄럼틀 대참사" },
    { id: "JEqDQyTqKS8", cat: "꿀팁", views: 14350000, title: "생활꿀팁 (샤워기 자가수리 외 다수)" },
    { id: "APHvK7_R7oc", cat: "요리", views: 12520000, title: "밥도둑 류수영 스팸순두부찌개" },
    { id: "KiEVKDr5XlQ", cat: "반전", views: 11340000, title: "감동적인 태국 반전 광고" },
    { id: "Qfb_fB_Gptg", cat: "자연", views: 11230000, title: "자연에게 압도당하는 풍경" },
    { id: "AUhL6uhYi5A", cat: "꿀팁", views: 10910000, title: "평생 써먹는 생활꿀팁" },
    { id: "xSUTtXfO8ZI", cat: "꿀팁", views: 10400000, title: "생활꿀팁 끝판왕, 이건 진짜 저장해야함" },
    { id: "3QwQUCs31nk", cat: "여행", views: 10120000, title: "해외느낌 물씬 풍기는 이국적인 대한민국 여행지TOP 11" },
    { id: "St20bxuLQNo", cat: "운동", views: 8790000, title: "3년 홈트의 결과 아내의 최후" },
    { id: "bwtSrNBnXKI", cat: "유머", views: 8640000, title: "테니스가 위험한 이유" },
    { id: "JQzKVCF-lB0", cat: "반전", views: 8500000, title: "2번 봐야 이해되는 소름돋는 레전드 영상" },
    { id: "P22fW-GBFI4", cat: "CCTV", views: 7910000, title: "고속도로 사고 CCTV 영상! 전방주시 태만" },
    { id: "FrVqsmkEHVQ", cat: "자연", views: 6870000, title: "역대급 비현실적 풍경 명장면 2탄" },
    { id: "3nIElzDpWxo", cat: "운동", views: 6520000, title: "하루 딱 100번만 해보세요❤️" },
    { id: "LySRxG68X10", cat: "해외일상", views: 5500000, title: "(공감)일본인 10명 중 8명은 다 있다는 이것!" },
    { id: "m_M7fkPnE6E", cat: "신기한 현상", views: 5330000, title: "쾌감 쩌는 신기한 자연현상" },
    { id: "V92ZStfB7go", cat: "여행", views: 4630000, title: "세계 비현실적인 장소 TOP5 🌎" },
    { id: "xuIwJjjB73Q", cat: "자연", views: 3540000, title: "신비한 자연 워터파크" },
    { id: "eYr9CAFFQ40", cat: "공감", views: 2480000, title: "오줌싸개가 되면 생기는 충격적인 일..ㄷㄷ" },
    { id: "HGCBA__W7CQ", cat: "CCTV", views: 2410000, title: "[실제상황: 그날의 CCTV] 폭탄이 된 드럼통(쇼츠)" },
    { id: "WAKFEb0thEM", cat: "공감", views: 2190000, title: "그 시절 집 앞에서 즐기는 천연 똥물 워터파크ㄷㄷ" },
    { id: "pqZDcDr4MLE", cat: "공감", views: 2170000, title: "동전 모아서 공짜로 부자 되는 법" },
    { id: "DBCY8oewnbQ", cat: "신기한 현상", views: 1950000, title: "진짜 신기한데 웃긴 순간들ㄷㄷ" },
    { id: "wL9F8GcmyAA", cat: "블랙박스", views: 320000, title: "무지성으로 꺾어버리네, 고속도로 사고" },
  ];
  const POPULAR_IDS = ['eS6ZBwjHoWI','WRirWdRi5gc','35yH2r2-4bI','h0FVO_Zn1zY','g9TXLAbc-1Q','c94GU4DEkYs','A4anjbzpUmI','qjHFz00cZrU','FYYqujTehl0','d6uF-zl7CB0','JEqDQyTqKS8','Qfb_fB_Gptg','P22fW-GBFI4','m_M7fkPnE6E','pqZDcDr4MLE','wL9F8GcmyAA'];
  RS.popularShorts = POPULAR_IDS
    .map(id => RS.viralPool.find(v => v.id === id))
    .filter(Boolean)
    .map(v => Object.assign({}, v, {
      thumb: 'https://i.ytimg.com/vi/' + v.id + '/oar2.jpg',
      url: 'https://www.youtube.com/shorts/' + v.id
    }));

  /* ── demo discovery dataset (API 키 없을 때) ─────────── */
  RS.demoDiscover = RS.viralPool.map((v, i) => Object.assign({}, v, {
    channel: v.cat,
    subs: 0,
    len: 28 + (i * 7) % 34,
    days: (i * 3) % 7,
    region: 'KR',
    kw: v.cat,
    thumb: 'https://i.ytimg.com/vi/' + v.id + '/hqdefault.jpg',
    url: 'https://www.youtube.com/shorts/' + v.id,
    total: v.views,
    demo: true
  }));

  /* ── storage ─────────────────────────────────────────── */
  const K = RS.KEYS = { project: 'reelstudio.project.v1', settings: 'reelstudio.settings.v1', presets: 'reelstudio.presets.v1' };
  const S = RS.store = {
    safeGet(k) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : null; } catch (e) { return null; } },
    safeSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { RS.toast('저장 공간이 부족합니다', 'err'); return false; } },
    saveProject(p) { S.safeSet(K.project, p); },
    loadProject() { return S.safeGet(K.project); },
    saveSettings(s) { S.safeSet(K.settings, s); },
    loadSettings() { return S.safeGet(K.settings) || {}; },
    savePresets(list) { S.safeSet(K.presets, list.map(p => ({ id: p.id, name: p.name, desc: p.desc, ratio: p.ratio, hook: p.hook, sub: p.sub, card: p.card, tag: p.tag, grade: p.grade, zoom: p.zoom, offset: p.offset, bgm: p.bgm, voiceRate: p.voiceRate, builtin: !!p.builtin }))); },
    loadPresets() { const v = S.safeGet(K.presets); return Array.isArray(v) ? v : []; }
  };

  RS.state = {
    project: null,
    settings: {},
    presets: [],
    ui: { tab: 'discover', guide: false, selectedCue: null, exporting: false },
    player: { playing: false, t: 0, duration: 0, startedAt: 0, baseT: 0 },
    media: { video: null, videoURL: null, videoName: null, videoDur: 0, narration: null, narrationName: null, exportBlob: null, exportURL: null, exportName: null }
  };

  RS.bootState = function () {
    const st = RS.state;
    st.settings = S.loadSettings();
    st.presets = RS.presets.concat(S.loadPresets().filter(p => !RS.presets.some(b => b.id === p.id)));
    st.project = S.loadProject() || RS.demoProject();
    if (!st.project.cues) st.project = RS.demoProject();
    return st;
  };
})();
