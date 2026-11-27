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
      const done = v => {
        RS.closeModal('confirm');
        ok.onclick = null;
        document.querySelectorAll('#confirmModal [data-close]').forEach(b => b.onclick = null);
        resolve(v);
      };
      ok.onclick = () => done(true);
      document.querySelectorAll('#confirmModal [data-close]').forEach(b => b.onclick = () => done(false));
    });
  };

  /* ── presets ─────────────────────────────────────────── */
  const P = RS.presets = [
    {
      id: 'issuehanjan', name: '이슈한잔 스타일', builtin: true,
      desc: '다크 다큐(#0B0D12) · 정중앙 정렬 · 라임 키워드 강조 · 댓글 카드',
      ratio: '9:16',
      hook: { on: true, style: 'plain', color: '#FFFFFF', accent: '#D8FF3E', bg: '#0B0D12', size: 54, font: '"Apple SD Gothic Neo","Malgun Gothic","Apple SD Gothic Neo","Malgun Gothic","Noto Sans KR",sans-serif', band: 0.17 },
      sub: { fontSize: 62, weight: 900, accent: '#D8FF3E', box: true, boxColor: 'rgba(8,10,14,.72)', radius: 0, pos: 0.78, font: '"Apple SD Gothic Neo","Malgun Gothic","Apple SD Gothic Neo","Malgun Gothic","Noto Sans KR",sans-serif', stroke: 0, autoNumber: true },
      card: { style: 'square', bg: 'rgba(15,17,22,.9)', radius: 2, name: '시청자', handle: '@viewer', x: 0.06, y: 0.60 },
      tag: { on: false, text: '@issuehanjan' },
      grade: 'cine', zoom: 1, offset: 0.5,
      bgm: { id: 'docu', volume: 0.3, duck: 0.55 }, voiceRate: 1.13
    },
    {
      id: 'hipplug', name: '힙플러그 스타일', builtin: true,
      desc: '흰 라운드 제목 카드 · 검정 직각 자막 박스 · 좌측 세로 핸들 · 쨍한 색감',
      ratio: '9:16',
      hook: { on: true, style: 'card', color: '#0A0A0A', accent: '#0A0A0A', bg: '#FFFFFF', size: 50, font: '"Apple SD Gothic Neo","Malgun Gothic","Apple SD Gothic Neo","Malgun Gothic","Noto Sans KR",sans-serif', band: 0.14 },
      sub: { fontSize: 60, weight: 900, accent: '#FFE45C', box: true, boxColor: '#000000', radius: 0, pos: 0.705, font: '"Apple SD Gothic Neo","Malgun Gothic","Apple SD Gothic Neo","Malgun Gothic","Noto Sans KR",sans-serif', stroke: 0, autoNumber: false },
      card: { style: 'square', bg: 'rgba(0,0,0,.88)', radius: 0, name: '시청자', handle: '@viewer', x: 0.06, y: 0.56 },
      tag: { on: true, text: '@hipplug' },
      grade: 'vivid', zoom: 1.06, offset: 0.5,
      bgm: { id: 'trendy', volume: 0.22, duck: 0.4 }, voiceRate: 1.0
    },
    {
      id: 'zzaljuwoseo', name: '짤주웠어 스타일', builtin: true,
      desc: '상단 검은 띠 제목(156px) · 자막 아래 직각 댓글 카드 · 무난한 색감',
      ratio: '9:16',
      hook: { on: true, style: 'band', color: '#FFFFFF', accent: '#FFFFFF', bg: '#000000', size: 52, font: '"Black Han Sans","Apple SD Gothic Neo","Malgun Gothic","Apple SD Gothic Neo","Malgun Gothic","Noto Sans KR",sans-serif', band: 0.081 },
      sub: { fontSize: 54, weight: 900, accent: '#D8FF3E', box: true, boxColor: 'rgba(0,0,0,.78)', radius: 0, pos: 0.635, font: '"Apple SD Gothic Neo","Malgun Gothic","Apple SD Gothic Neo","Malgun Gothic","Noto Sans KR",sans-serif', stroke: 0, autoNumber: false },
      card: { style: 'square', bg: 'rgba(15,15,18,.75)', radius: 0, name: '시청자', handle: '@viewer', x: 0.085, y: 0.755 },
      tag: { on: false, text: '@zzaljuwoseo' },
      grade: 'none', zoom: 1, offset: 0.5,
      bgm: { id: 'humor', volume: 0.26, duck: 0.5 }, voiceRate: 1.16
    },
    {
      id: 'raw', name: '날것 도파민', builtin: true,
      desc: '카드 없이 큰 자막만 · 강한 대비 · 빠른 템포',
      ratio: '9:16',
      hook: { on: true, style: 'plain', color: '#FFFFFF', accent: '#FFE45C', bg: '#000000', size: 60, font: '"Gothic A1","Apple SD Gothic Neo","Malgun Gothic","Apple SD Gothic Neo","Malgun Gothic","Noto Sans KR",sans-serif', band: 0.2 },
      sub: { fontSize: 70, weight: 900, accent: '#FFE45C', box: false, boxColor: 'rgba(0,0,0,.6)', radius: 0, pos: 0.72, font: '"Gothic A1","Apple SD Gothic Neo","Malgun Gothic","Apple SD Gothic Neo","Malgun Gothic","Noto Sans KR",sans-serif', stroke: 3, autoNumber: true },
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
    p.name = '젠슨황 약발 1일 천하';
    p.topic = '젠슨황 한마디에 폭등한 코스피가 하루 만에 4,697까지 무너진 이유';
    p.hook.line1 = '젠슨황 한마디에 폭등한 코스피';
    p.hook.line2 = '하루 만에 4,697… 무슨 일?';
    const cues = [
      ['코스피가 하루 만에 #4,697 까지 무너졌습니다', 0, 3.1],
      ['지난주 젠슨황 한마디에 폭등했던 시장이', 3.1, 6.2],
      ['하루 만에 전부 되돌려졌습니다', 6.2, 9.0],
      ['문제는 반도체였습니다', 9.0, 11.4, '삼전 나만 물렸냐'],
      ['엔비디아가 #3.4% 빠지자', 11.4, 14.0],
      ['외국인은 #1조 2천억 을 팔아치웠습니다', 14.0, 17.4],
      ['개인은 그걸 그대로 받아냈습니다', 17.4, 20.2, '개미가 다 받았네'],
      ['약발이 하루 만에 끝난 걸까요', 20.2, 23.2],
      ['관전 포인트는 이번 주 #FOMC 하나입니다', 23.2, 27.4]
    ];
    p.cues = cues.map((c, i) => ({
      id: U.uid(), text: c[0], start: c[1], end: c[2], sfx: i === 0 ? 'impact' : '',
      comment: { on: !!c[3], text: c[3] || '', name: '시청자' }
    }));
    p.meta.titles = [
      '젠슨황 약발 1일 천하… 코스피 4,697까지 무너진 이유',
      '하루 만에 1조 2천억 판 외국인, 개미는 뭘 받았나',
      '폭등이 하루 만에 끝? 이번 주 FOMC가 답이다'
    ];
    p.meta.desc = '지난주 젠슨황 한마디에 폭등했던 코스피가 하루 만에 4,697까지 밀렸습니다.\n반도체가 흔들리자 외국인은 1조 2천억을 순매도했고, 개인이 그 물량을 받아냈습니다.\n이번 주 FOMC가 다음 방향을 가를 관전 포인트입니다.\n\n#코스피 #증시 #반도체 #외국인 #FOMC';
    p.meta.tags = '코스피,증시,반도체,외국인,개미,엔비디아,FOMC,주식';
    return p;
  };

  /* ── demo discovery dataset (API 키 없을 때) ─────────── */
  RS.demoDiscover = [
    { id: 'd1', title: '하루 만에 4,697까지… 코스피 폭락한 진짜 이유', channel: '이슈한잔', views: 812000, subs: 12400, len: 32, days: 0, region: 'KR', kw: '코스피 폭락' },
    { id: 'd2', title: '외국인이 1조 2천억 팔았다… 개미들은 뭘 샀을까', channel: '주식읽어주는남자', views: 1560000, subs: 210000, len: 48, days: 1, region: 'KR', kw: '코스피 폭락' },
    { id: 'd3', title: '수능 AI 커닝, 실제로 가능했던 세 가지 방법', channel: '과학하는사람', views: 2340000, subs: 410000, len: 52, days: 3, region: 'KR', kw: '수능 AI 커닝' },
    { id: 'd4', title: 'AI가 수능 영어 1등급? 감독관은 몰랐다', channel: '교육이슈', views: 640000, subs: 38000, len: 29, days: 2, region: 'KR', kw: '수능 AI 커닝' },
    { id: 'd5', title: '로또 1등 12명 전원 자동… 이게 가능한 일?', channel: '이슈한잔', views: 1200000, subs: 12400, len: 31, days: 6, region: 'KR', kw: '로또 1등' },
    { id: 'd6', title: '국민연금 두 번 받는 사람들, 152만 명의 비밀', channel: '연금연구소', views: 980000, subs: 87000, len: 44, days: 4, region: 'KR', kw: '국민연금' },
    { id: 'd7', title: 'The 3-second rule that fixes any short', channel: 'CreatorLab', views: 4200000, subs: 820000, len: 40, days: 2, region: 'US', kw: 'shorts hook' },
    { id: 'd8', title: 'Why every phone camera lies to you', channel: 'TechDecoded', views: 6100000, subs: 2100000, len: 58, days: 5, region: 'US', kw: 'camera' },
    { id: 'd9', title: '【衝撃】日本のコンビニが消える日', channel: 'ニュース深掘り', views: 1700000, subs: 96000, len: 36, days: 1, region: 'JP', kw: 'コンビニ' },
    { id: 'd10', title: '홈플러스 배송 중단, 매장은 어떻게 되나', channel: '유통워치', views: 430000, subs: 15000, len: 27, days: 3, region: 'KR', kw: '홈플러스' },
    { id: 'd11', title: '전세사기 당하기 전에 꼭 확인해야 할 3가지', channel: '집주인노트', views: 2900000, subs: 99000, len: 51, days: 8, region: 'KR', kw: '전세사기' },
    { id: 'd12', title: '이 영상 하나로 AI 편집 끝내기 (무료)', channel: '편집하는사람', views: 3500000, subs: 540000, len: 62, days: 4, region: 'KR', kw: 'AI 편집' }
  ].map(d => Object.assign({}, d, { total: d.views, ratio: +(d.views / Math.max(1, d.subs)).toFixed(1), demo: true }));

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
