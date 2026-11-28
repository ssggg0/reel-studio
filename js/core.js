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

  /* ── presets: 실제 인기 쇼츠에서 검증된 편집 스타일 8종 ── */
  const SDG = '"Apple SD Gothic Neo","Malgun Gothic","Noto Sans KR",sans-serif';
  const BLACK = '"Black Han Sans","Apple SD Gothic Neo","Malgun Gothic","Noto Sans KR",sans-serif';
  const P = RS.presets = [
    {
      id: 'dopa-band', name: '🔥 도파민 2줄 띠', builtin: true,
      short: '상단 검정 띠 · 흰/노랑 훅',
      desc: '상단 풀블랙 띠(약 180px)에 흰색·노랑 2줄 훅, 하단 직각 베댓 카드, 쨍한 색감 · 말속도 1.15x',
      ratio: '9:16', sample: 'neon',
      hook: { on: true, style: 'band', color: '#FFFFFF', accent: '#FFD93D', bg: '#000000', size: 48, font: BLACK, band: 0.0813, pad: 0.04, lh: 1.1 },
      sub: { fontSize: 56, weight: 900, accent: '#FFD93D', box: true, boxColor: 'rgba(0,0,0,.88)', radius: 0, pos: 0.665, font: SDG, stroke: 0, autoNumber: true },
      card: { on: true, style: 'square', bg: 'rgba(0,0,0,.92)', radius: 0, name: '시청자', handle: '@viewer', x: 0.07, y: 0.395 },
      tag: { on: false, text: '' },
      grade: 'vivid', bright: 0, contrast: 6, sat: 8, zoom: 1.04, offset: 0.5, letterbox: 0,
      bgm: { id: 'trendy', volume: 0.24, duck: 0.45 }, voiceRate: 1.15
    },
    {
      id: 'docu-hook', name: '🎬 3초 훅 다큐', builtin: true,
      short: '다크 비네팅 · 라임 강조',
      desc: '어두운 시네마 톤 + 비네팅, 라임(#D9FF4A) 핵심어 강조, 하단 반투명 바 · 말속도 1.13x',
      ratio: '9:16', sample: 'docu',
      hook: { on: true, style: 'plain', color: '#FFFFFF', accent: '#D9FF4A', bg: '#0B0D12', size: 58, font: SDG, band: 0.185 },
      sub: { fontSize: 58, weight: 900, accent: '#D9FF4A', box: true, boxColor: 'rgba(9,12,17,.68)', radius: 12, pos: 0.80, font: SDG, stroke: 0, autoNumber: true },
      card: { on: false, style: 'square', bg: 'rgba(0,0,0,.6)', radius: 10, name: '시청자', handle: '@viewer', x: 0.07, y: 0.40 },
      tag: { on: false, text: '' },
      grade: 'cine', bright: 0, contrast: 6, sat: -4, zoom: 1.0, offset: 0.5, letterbox: 0,
      bgm: { id: 'docu', volume: 0.30, duck: 0.55 }, voiceRate: 1.13
    },
    {
      id: 'white-meme', name: '🤍 화이트 밈 카드', builtin: true,
      short: '흰 제목 카드 · 검정 자막',
      desc: '상단 흰 라운드 제목 카드 + 검정 자막 박스, 깔끔한 밈 톤 · 말속도 1.15x',
      ratio: '9:16', sample: 'chart',
      hook: { on: true, style: 'card', color: '#0A0A0A', accent: '#0A0A0A', bg: '#FFFFFF', size: 48, font: SDG, band: 0.14 },
      sub: { fontSize: 58, weight: 900, accent: '#FFD84D', box: true, boxColor: '#000000', radius: 2, pos: 0.705, font: SDG, stroke: 0, autoNumber: false },
      card: { on: true, style: 'square', bg: 'rgba(0,0,0,.9)', radius: 0, name: '시청자', handle: '@viewer', x: 0.075, y: 0.545 },
      tag: { on: false, text: '' },
      grade: 'none', bright: 4, contrast: 4, sat: 0, zoom: 1.05, offset: 0.5, letterbox: 0,
      bgm: { id: 'humor', volume: 0.24, duck: 0.5 }, voiceRate: 1.15
    },
    {
      id: 'punch-cut', name: '⚡ 1초 컷 펀치', builtin: true,
      short: '레드 강조 · 큰 타격 자막',
      desc: '선명한 레드/오렌지 강조와 큰 1줄 타격 자막, 카드 없이 속도로 밀어붙임 · 말속도 1.22x',
      ratio: '9:16', sample: 'neon',
      hook: { on: true, style: 'plain', color: '#FFFFFF', accent: '#FF3B2F', bg: '#000000', size: 64, font: BLACK, band: 0.16 },
      sub: { fontSize: 78, weight: 900, accent: '#FF3B2F', box: false, boxColor: 'rgba(0,0,0,.5)', radius: 0, pos: 0.70, font: BLACK, stroke: 6, autoNumber: false },
      card: { on: false, style: 'bubble', bg: 'rgba(255,255,255,.12)', radius: 14, name: '시청자', handle: '@viewer', x: 0.05, y: 0.46 },
      tag: { on: false, text: '' },
      grade: 'vivid', bright: 0, contrast: 14, sat: 12, zoom: 1.08, offset: 0.5, letterbox: 0,
      bgm: { id: 'tension', volume: 0.30, duck: 0.45 }, voiceRate: 1.22
    },
    {
      id: 'comment-flood', name: '💬 댓글 폭주형', builtin: true,
      short: '굵은 베댓 카드 · 거품 효과음',
      desc: '상단 짧은 훅 + 굵은 베댓 카드를 화면 위쪽에 크게, 베댓 큐에 거품 효과음 자동 매칭 · 말속도 1.15x',
      ratio: '9:16', sample: 'chart', sfx: 'p061',
      hook: { on: true, style: 'plain', color: '#FFFFFF', accent: '#FFE45C', bg: '#000000', size: 46, font: SDG, band: 0.115 },
      sub: { fontSize: 54, weight: 900, accent: '#FFE45C', box: true, boxColor: 'rgba(14,16,22,.86)', radius: 4, pos: 0.755, font: SDG, stroke: 0, autoNumber: false },
      card: { on: true, style: 'square', bg: 'rgba(16,18,24,.94)', radius: 14, scale: 1.18, name: '시청자', handle: '@viewer', x: 0.06, y: 0.315 },
      tag: { on: false, text: '' },
      grade: 'vivid', bright: 0, contrast: 8, sat: 4, zoom: 1.03, offset: 0.5, letterbox: 0,
      bgm: { id: 'trendy', volume: 0.26, duck: 0.45 }, voiceRate: 1.15
    },
    {
      id: 'breaking-news', name: '📰 속보 브리핑', builtin: true,
      short: '네이비 뱃지 · 고대비 자막',
      desc: '네이비 뱃지 띠에 레드 포인트, 고대비 흰 자막 바, 차분한 뉴스 톤 · 말속도 1.12x',
      ratio: '9:16', sample: 'docu',
      hook: { on: true, style: 'pill', color: '#FFFFFF', accent: '#FF6B5E', bg: '#101B36', size: 50, font: SDG, band: 0.13 },
      sub: { fontSize: 56, weight: 900, accent: '#FFD429', box: true, boxColor: 'rgba(7,11,22,.90)', radius: 6, pos: 0.775, font: SDG, stroke: 0, autoNumber: true },
      card: { on: true, style: 'square', bg: 'rgba(9,14,28,.92)', radius: 4, name: '시청자', handle: '@viewer', x: 0.06, y: 0.42 },
      tag: { on: false, text: '' },
      grade: 'cool', bright: 0, contrast: 10, sat: 4, zoom: 1.02, offset: 0.5, letterbox: 0,
      bgm: { id: 'docu', volume: 0.26, duck: 0.55 }, voiceRate: 1.12
    },
    {
      id: 'healing-vlog', name: '🐾 힐링·브이로그', builtin: true,
      short: '따뜻한 톤 · 둥근 자막',
      desc: '따뜻한 색온도와 둥근 소프트 자막 박스, 느린 호흡 · 말속도 1.05x',
      ratio: '9:16', sample: 'docu',
      hook: { on: true, style: 'plain', color: '#FFFFFF', accent: '#FFD9A6', bg: '#000000', size: 46, font: SDG, band: 0.135 },
      sub: { fontSize: 50, weight: 700, accent: '#FFC978', box: true, boxColor: 'rgba(32,22,14,.55)', radius: 24, pos: 0.82, font: SDG, stroke: 0, autoNumber: false },
      card: { on: true, style: 'bubble', bg: 'rgba(255,255,255,.18)', radius: 18, name: '시청자', handle: '@viewer', x: 0.08, y: 0.46 },
      tag: { on: false, text: '' },
      grade: 'warm', bright: 10, contrast: 2, sat: 6, zoom: 1.0, offset: 0.5, letterbox: 0,
      bgm: { id: 'emotion', volume: 0.26, duck: 0.5 }, voiceRate: 1.05
    },
    {
      id: 'cinema-cut', name: '🎞️ 시네마틱 컷', builtin: true,
      short: '상하 여백 · 금색 자막',
      desc: '상하 레터박스 여백에 깔끔한 흰/금색 자막, 담백한 시네마 톤 · 말속도 1.08x',
      ratio: '9:16', sample: 'docu',
      hook: { on: true, style: 'plain', color: '#F6F6F6', accent: '#E7C778', bg: '#000000', size: 44, font: SDG, band: 0.175 },
      sub: { fontSize: 52, weight: 600, accent: '#E7C778', box: false, boxColor: 'rgba(0,0,0,.40)', radius: 0, pos: 0.855, font: SDG, stroke: 0, autoNumber: false },
      card: { on: true, style: 'bubble', bg: 'rgba(0,0,0,.45)', radius: 8, name: '시청자', handle: '@viewer', x: 0.09, y: 0.46 },
      tag: { on: false, text: '' },
      grade: 'cine', bright: 0, contrast: 4, sat: -8, zoom: 1.02, offset: 0.5, letterbox: 0.055,
      bgm: { id: 'emotion', volume: 0.28, duck: 0.5 }, voiceRate: 1.08
    }
  ];

  /* ── 유튜브 쇼츠 세이프존 (1080×1920 기준) ────────────────
     우측 아이콘 열(좋아요·댓글·공유·리믹스)과 하단 UI(제목·채널명)를 침범하지 않는
     자막·카드 안전 영역. 렌더와 오류 점검이 같은 값을 씁니다. */
  RS.safe = {
    bottomY: 1400,      /* 자막·카드 하단 한계 */
    topY: 190,          /* 상단 훅 띠 아래 시작선 */
    subMaxW: 0.76,      /* 자막 최대 폭(좌우 12% 여백 확보) */
    cardMaxW: 0.70,     /* 댓글 카드 최대 폭 */
    cardRight: 0.88,    /* 카드 오른쪽 끝 한계(우측 아이콘 열 회피) */
    scale: H => (H && H > 1000 ? H / 1920 : 1),
    /* 세로 중심 cy를 안전 영역 안으로 */
    clampY(cy, boxH, H) {
      if (!H || H <= 1000) return cy;
      const k = this.scale(H);
      const maxCy = this.bottomY * k - boxH / 2;
      const minCy = this.topY * k + boxH / 2;
      return Math.max(minCy, Math.min(cy, maxCy));
    },
    /* 상단 y(카드처럼 위에서 시작하는 박스)를 안전 영역 안으로 */
    clampTop(y, boxH, H) {
      if (!H || H <= 1000) return y;
      const k = this.scale(H);
      const minY = this.topY * k;
      const maxY = this.bottomY * k - boxH;
      return Math.max(minY, Math.min(y, Math.max(minY, maxY)));
    }
  };

  RS.presetById = id => P.find(p => p.id === id) || P[0];
  RS.hookStyles = { band: '상단 검은 띠', card: '흰 라운드 카드', pill: '뱃지 알약 띠', plain: '민무늬 큰 글씨' };

  /* ── 옛 프리셋 id → 새 스타일 id (저장된 프로젝트·프리셋 이관) ── */
  RS.legacyPresetMap = { issuehanjan: 'docu-hook', hipplug: 'white-meme', zzaljuwoseo: 'dopa-band', raw: 'punch-cut' };
  RS.legacyNameMap = { '이슈한잔': '다큐', '힙플러그': '밈 카드', '짤주웠어': '도파민', '날것 도파민': '펀치', 'issuehanjan': '', 'hipplug': '', 'zzaljuwoseo': '', 'reelstudio': '' };
  RS.sanitizeLegacyText = function (s) {
    s = String(s == null ? '' : s);
    Object.keys(RS.legacyNameMap).forEach(k => {
      s = s.split(k).join(RS.legacyNameMap[k]);
    });
    return s.replace(/\s{2,}/g, ' ').replace(/^\s*[·,]\s*/, '').trim();
  };

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

  /* 새 효과음 100종 — js/sfx-pack.js가 먼저 로드됩니다 */
  RS.sfxPack = (window.RS_SFX_PACK && Array.isArray(window.RS_SFX_PACK.items))
    ? window.RS_SFX_PACK : { base: 'sfx/', categories: [], items: [] };
  RS.sfxCats = (RS.sfxPack.categories && RS.sfxPack.categories.length) ? RS.sfxPack.categories : [
    { id: 'all', name: '전체' }, { id: 'hit', name: '타격·폭발' }, { id: 'meme', name: '웃음·밈' },
    { id: 'ui', name: 'UI·알림' }, { id: 'trans', name: '전환' }, { id: 'etc', name: '기타' }
  ];
  RS.sfxItem = id => RS.sfxPack.items.find(s => s.id === id) || null;
  RS.sfxCatName = id => (RS.sfxCats.find(c => c.id === id) || {}).name || '기타';
  RS.sfxName = id => {
    if (!id) return '없음';
    const b = RS.sfxList.find(s => s.id === id);
    if (b) return b.name;
    const it = RS.sfxItem(id);
    return it ? it.n : String(id);
  };

  RS.newProject = function () {
    const p = RS.presetById('dopa-band');
    return {
      id: U.uid(), name: '새 쇼츠', ratio: '9:16', topic: '', lang: 'ko', presetId: p.id,
      source: { type: 'sample', sample: 'docu', name: '다큐 다크' },
      hook: { on: true, line1: '', line2: '', style: p.hook.style, color: p.hook.color, accent: p.hook.accent, bg: p.hook.bg, size: p.hook.size, font: p.hook.font, band: p.hook.band, pad: p.hook.pad },
      sub: JSON.parse(JSON.stringify(p.sub)),
      card: JSON.parse(JSON.stringify({ on: p.card.on !== false, style: p.card.style, bg: p.card.bg, radius: p.card.radius, scale: p.card.scale, name: p.card.name, handle: p.card.handle, x: p.card.x, y: p.card.y })),
      tag: JSON.parse(JSON.stringify(p.tag)),
      grade: p.grade, bright: p.bright || 0, contrast: p.contrast || 0, sat: p.sat || 0,
      zoom: p.zoom, offset: p.offset, letterbox: p.letterbox || 0,
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

  /* ── 🌍 해외 밈·글로벌 클립 우선 노출 (기본 75%) ──────────
     해외 바이럴을 한국어로 재가공하는 게 성현님 주력이라, 발굴 기본 추천·
     인기 레일·검색 결과에서 해외 밈/글로벌 동물 클립을 앞쪽 70~80%로 올립니다. */
  const OVERSEAS_HINT = /해외|외국|글로벌|미국|영국|일본|호주|유럽|태국|베트남|인도|meme|memes|viral|funny|asmr|satisfying|cats?|dogs?|puppy|kitten|animal|toast|cctv|blackbox|fail|try not to laugh/i;
  RS.rank = {
    isGlobal(v) {
      if (!v) return false;
      if (v.gl === 1 || v.gl === true) return true;
      const t = String(v.title || '');
      if (!t) return false;
      if (!/[가-힣]/.test(t)) return true;                       // 제목이 전부 외국어
      if (OVERSEAS_HINT.test(t)) return true;
      const side = String(v.channel || '') + ' ' + String(v.cat || '');
      if (OVERSEAS_HINT.test(side)) return true;
      return false;
    },
    /* list의 상대 순서는 지키면서, 4칸 중 3칸(기본 75%)을 해외·글로벌로 채웁니다 */
    mix(list, pct) {
      const arr = (list || []).slice();
      const g = [], l = [];
      arr.forEach(v => { (RS.rank.isGlobal(v) ? g : l).push(v); });
      if (!g.length || !l.length) return arr;
      const p = typeof pct === 'number' ? pct : 0.75;
      const step = Math.max(2, Math.round(1 / Math.max(0.05, 1 - p)));
      const out = [];
      let gi = 0, li = 0, i = 0;
      while (out.length < arr.length) {
        const wantGlobal = ((i + 1) % step !== 0) || li >= l.length;
        if (wantGlobal && gi < g.length) out.push(g[gi++]);
        else if (li < l.length) out.push(l[li++]);
        else if (gi < g.length) out.push(g[gi++]);
        else break;
        i++;
      }
      return out;
    },
    stats(list) {
      const arr = list || [];
      const g = arr.filter(v => RS.rank.isGlobal(v)).length;
      return { global: g, local: arr.length - g, pct: arr.length ? Math.round(g / arr.length * 100) : 0 };
    }
  };

  /* ── 인기 쇼츠 풀 (2026-11-27 YouTube 인기 쇼츠 조회수 기준) ──
     API 키가 없을 때 데모 데이터로 쓰고, 있으면 실제 검색 결과로 대체합니다.
     🛡️ 방송·예능·아이돌·영화·랭킹/모음집 항목은 넣지 않습니다 — 단일 장면·단일 원본만. */
  RS.viralPool = [
    { id: "eS6ZBwjHoWI", cat: "동물", views: 51570000, title: "북한말로 불러야 알아듣는 강아지" },
    { id: "WRirWdRi5gc", cat: "ASMR", views: 48360000, title: "toast asmr🍞", gl: 1 },
    { id: "t6v6a4Hog0w", cat: "ASMR", views: 42480000, title: "ASMR Tooth Fairy Eats Your Teeth Candy 🦷🍭🧚‍♀️", gl: 1 },
    { id: "p3UsCxQuxeY", cat: "ASMR", views: 39220000, title: "real vs. fake nail polish cracking ASMR🍓", gl: 1 },
    { id: "7FgpiYQVXoA", cat: "동물", views: 26490000, title: "찹츄 마스터의 손길에 순식간에 당한 강아지들" },
    { id: "h0FVO_Zn1zY", cat: "여행", views: 25860000, title: "이런 풍경이면 무슨 노래든 명곡이 돼.." },
    { id: "g9TXLAbc-1Q", cat: "해외일상", views: 25180000, title: "일본인 아내와 5살 아이와 걸어서만 홋카이도를 여행해봤습니다", gl: 1 },
    { id: "c94GU4DEkYs", cat: "운동", views: 22510000, title: "요즘 너무 핫한 이 운동, 100번 채우기 도전" },
    { id: "H85ojZSV9lM", cat: "해외일상", views: 20280000, title: "참지 않는 K여친", gl: 1 },
    { id: "A4anjbzpUmI", cat: "요리", views: 18920000, title: "계란을 이렇게 해 보세요, 매 끼니 이걸 먹습니다" },
    { id: "qjHFz00cZrU", cat: "유머", views: 17450000, title: "해변에 아무데나 앉으면 안되는 이유", gl: 1 },
    { id: "xtnq5RinY_A", cat: "요리", views: 16390000, title: "이거 알고 감자 매일 먹어요" },
    { id: "FYYqujTehl0", cat: "유머", views: 15470000, title: "운수 좋은 날", gl: 1 },
    { id: "d6uF-zl7CB0", cat: "반전", views: 14860000, title: "누가 설계했는지 궁금한 미끄럼틀 대참사", gl: 1 },
    { id: "KiEVKDr5XlQ", cat: "반전", views: 11340000, title: "감동적인 태국 반전 광고", gl: 1 },
    { id: "Qfb_fB_Gptg", cat: "자연", views: 11230000, title: "자연에게 압도당하는 풍경", gl: 1 },
    { id: "AUhL6uhYi5A", cat: "꿀팁", views: 10910000, title: "평생 써먹는 생활꿀팁" },
    { id: "xSUTtXfO8ZI", cat: "꿀팁", views: 10400000, title: "생활꿀팁 끝판왕, 이건 진짜 저장해야함" },
    { id: "St20bxuLQNo", cat: "운동", views: 8790000, title: "3년 홈트의 결과 아내의 최후" },
    { id: "bwtSrNBnXKI", cat: "유머", views: 8640000, title: "테니스가 위험한 이유", gl: 1 },
    { id: "JQzKVCF-lB0", cat: "반전", views: 8500000, title: "2번 봐야 이해되는 소름돋는 레전드 영상", gl: 1 },
    { id: "P22fW-GBFI4", cat: "CCTV", views: 7910000, title: "고속도로 사고 CCTV 영상! 전방주시 태만" },
    { id: "3nIElzDpWxo", cat: "운동", views: 6520000, title: "하루 딱 100번만 해보세요❤️" },
    { id: "LySRxG68X10", cat: "해외일상", views: 5500000, title: "(공감)일본인 10명 중 8명은 다 있다는 이것!", gl: 1 },
    { id: "m_M7fkPnE6E", cat: "신기한 현상", views: 5330000, title: "쾌감 쩌는 신기한 자연현상", gl: 1 },
    { id: "xuIwJjjB73Q", cat: "자연", views: 3540000, title: "신비한 자연 워터파크" },
    { id: "eYr9CAFFQ40", cat: "공감", views: 2480000, title: "오줌싸개가 되면 생기는 충격적인 일..ㄷㄷ" },
    { id: "WAKFEb0thEM", cat: "공감", views: 2190000, title: "그 시절 집 앞에서 즐기는 천연 똥물 워터파크ㄷㄷ" },
    { id: "pqZDcDr4MLE", cat: "공감", views: 2170000, title: "동전 모아서 공짜로 부자 되는 법" },
    { id: "DBCY8oewnbQ", cat: "신기한 현상", views: 1950000, title: "진짜 신기한데 웃긴 순간들ㄷㄷ", gl: 1 },
    { id: "wL9F8GcmyAA", cat: "블랙박스", views: 320000, title: "무지성으로 꺾어버리네, 고속도로 사고" },
  ];
  /* 🛡️ 위험 항목(모음집·랭킹·방송)이 다시 섞여 들어와도 화면에는 안전한 것만 */
  const poolSafe = () => (RS.safeFilter ? RS.safeFilter.filter(RS.viralPool).list : RS.viralPool.slice());
  /* 해외 밈·글로벌 동물 클립 12 + 한국 단일 장면 4 = 75% 해외 */
  const POPULAR_IDS = ['WRirWdRi5gc','t6v6a4Hog0w','H85ojZSV9lM','eS6ZBwjHoWI','p3UsCxQuxeY','g9TXLAbc-1Q','d6uF-zl7CB0','7FgpiYQVXoA','KiEVKDr5XlQ','bwtSrNBnXKI','FYYqujTehl0','A4anjbzpUmI','JQzKVCF-lB0','LySRxG68X10','m_M7fkPnE6E','P22fW-GBFI4'];
  RS.popularShorts = POPULAR_IDS
    .map(id => RS.viralPool.find(v => v.id === id))
    .filter(Boolean)
    .map(v => Object.assign({}, v, {
      thumb: 'https://i.ytimg.com/vi/' + v.id + '/oar2.jpg',
      url: 'https://www.youtube.com/shorts/' + v.id
    }));
  if (RS.safeFilter) RS.popularShorts = RS.safeFilter.filter(RS.popularShorts).list;
  RS.popularShorts = RS.rank.mix(RS.popularShorts);

  /* ── demo discovery dataset (API 키 없을 때) ─────────── */
  RS.demoDiscover = poolSafe().map((v, i) => Object.assign({}, v, {
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
  /* 발굴 기본 추천도 해외 밈·글로벌 클립이 앞에 오도록 */
  RS.demoDiscover = RS.rank.mix(RS.demoDiscover);

  /* ── storage ─────────────────────────────────────────── */
  const K = RS.KEYS = { project: 'reelstudio.project.v1', settings: 'reelstudio.settings.v1', presets: 'reelstudio.presets.v1', migrated: 'reelstudio.migrated.v2' };
  const S = RS.store = {
    safeGet(k) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : null; } catch (e) { return null; } },
    safeSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { RS.toast('저장 공간이 부족합니다', 'err'); return false; } },
    saveProject(p) { S.safeSet(K.project, p); },
    loadProject() { return S.safeGet(K.project); },
    saveSettings(s) { S.safeSet(K.settings, s); },
    loadSettings() { return S.safeGet(K.settings) || {}; },
    savePresets(list) { S.safeSet(K.presets, list.map(p => ({ id: p.id, name: p.name, short: p.short || '', desc: p.desc, ratio: p.ratio, sample: p.sample, sfx: p.sfx, hook: p.hook, sub: p.sub, card: p.card, tag: p.tag, grade: p.grade, bright: p.bright, contrast: p.contrast, sat: p.sat, zoom: p.zoom, offset: p.offset, letterbox: p.letterbox, bgm: p.bgm, voiceRate: p.voiceRate, builtin: !!p.builtin }))); },
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
    /* 예전에 잘못 붙여넣은 키(모양이 다른 값)는 무시하고 기본 키로 돌립니다 */
    if (st.settings && st.settings.youtube && !/^AIza[0-9A-Za-z_\-]{30,}$/.test(String(st.settings.youtube).replace(/\s+/g, ''))) {
      st.settings.youtubeBad = st.settings.youtube;
      st.settings.youtube = '';
      try { S.saveSettings(st.settings); } catch (e) {}
    }
    /* 저장된 내 프리셋에서 옛 기본 프리셋 사본·채널 이름을 걷어냅니다 */
    const stored = S.loadPresets();
    const cleaned = stored
      .filter(p => p && !RS.legacyPresetMap[p.id])
      .map(p => {
        const o = Object.assign({}, p);
        o.name = RS.sanitizeLegacyText(o.name) || '내 프리셋';
        o.desc = RS.sanitizeLegacyText(o.desc);
        o.short = RS.sanitizeLegacyText(o.short);
        if (o.tag) {
          const t = RS.sanitizeLegacyText(o.tag.text);
          o.tag = Object.assign({}, o.tag, { text: t, on: !!t && !!o.tag.on });
        }
        return o;
      });
    if (cleaned.length !== stored.length) { try { S.savePresets(cleaned); } catch (e) {} }
    st.presets = RS.presets.concat(cleaned.filter(p => !RS.presets.some(b => b.id === p.id)));
    st.project = S.loadProject() || RS.demoProject();
    if (!st.project.cues) st.project = RS.demoProject();

    /* 옛 스타일 id를 새 표준 스타일로 옮기고, 태그에 남은 옛 채널 이름을 비웁니다 */
    const p = st.project;
    if (p.tag && p.tag.text) {
      const t = RS.sanitizeLegacyText(p.tag.text);
      p.tag.text = t;
      if (!t) p.tag.on = false;
    }
    const mapped = RS.legacyPresetMap[p.presetId];
    const done = S.safeGet(RS.KEYS.migrated);
    if (mapped) p.presetId = mapped;
    if (!done) {
      if (mapped) {
        const pr = RS.presetById(mapped);
        ['hook', 'sub', 'card', 'tag', 'bgm'].forEach(k => { if (pr[k]) p[k] = Object.assign({}, p[k], U.clone(pr[k])); });
        ['grade', 'bright', 'contrast', 'sat', 'zoom', 'offset', 'letterbox'].forEach(k => { if (pr[k] != null) p[k] = pr[k]; });
        if (p.voice) p.voice.rate = pr.voiceRate;
      }
      S.safeSet(RS.KEYS.migrated, 1);
    }
    return st;
  };
})();
