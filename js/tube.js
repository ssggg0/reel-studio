/* REEL STUDIO — YouTube: 떡상 발굴(검색·인기)
   ─ 키가 저장돼 있지 않아도 기본 키로 바로 실시간 조회합니다.
   ─ 키 문제·한도 초과·네트워크 오류가 나도 '실패'로 멈추지 않고
     공개 트렌드 → 샘플 순서로 이어서 보여줍니다.
   ─ 🔄 새로고침(more)은 페이지 토큰·기간·정렬·지역을 돌려 가며
     이미 보여준 영상 ID는 빼고 새 영상만 가져옵니다. */
(function () {
  'use strict';
  const RS = window.RS;
  const T = RS.tube = {};

  const API = 'https://www.googleapis.com/youtube/v3';

  /* ── helpers ─────────────────────────────────────────── */
  function isoDur(s) {
    if (!s) return 0;
    const m = /PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/.exec(s);
    if (!m) return 0;
    return (+m[1] || 0) * 3600 + (+m[2] || 0) * 60 + (+m[3] || 0);
  }
  function relDate(iso) {
    const d = new Date(iso);
    const days = Math.floor((Date.now() - d.getTime()) / 86400000);
    if (days <= 0) return '오늘';
    if (days === 1) return '어제';
    if (days < 7) return days + '일 전';
    if (days < 30) return Math.floor(days / 7) + '주 전';
    if (days < 365) return Math.floor(days / 30) + '개월 전';
    return Math.floor(days / 365) + '년 전';
  }
  const daysAgo = iso => Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86400000));

  /* ── 키 (저장된 키 → 기본 키 순서) ───────────────────── */
  function cleanKey(k) { return String(k || '').replace(/[\s\u200b-\u200d]+/g, '').trim(); }
  function looksKey(k) { return /^AIza[0-9A-Za-z_\-]{30,}$/.test(k); }
  function savedKey() {
    const k = cleanKey(RS.state && RS.state.settings && RS.state.settings.youtube);
    return looksKey(k) ? k : '';
  }
  function builtinKey() { return cleanKey(RS.DEFAULTS && RS.DEFAULTS.youtube); }
  function keyList() {
    const out = [], u = savedKey(), d = builtinKey();
    if (u) out.push(u);
    if (d && d !== u) out.push(d);
    return out;
  }
  T.keySource = () => savedKey() ? 'saved' : (builtinKey() ? 'builtin' : 'none');
  T.hasKey = () => keyList().length > 0;

  /* ── 응답 캐시 (한도 아끼기 · 새로고침 연타 방지) ─────── */
  const CACHE_MS = 20 * 60 * 1000;
  const cache = new Map();
  function cacheGet(k) {
    const v = cache.get(k);
    if (!v) return null;
    if (Date.now() - v.t > CACHE_MS) { cache.delete(k); return null; }
    return v.d;
  }
  function cacheSet(k, d) {
    if (cache.size > 80) cache.clear();
    cache.set(k, { t: Date.now(), d });
  }

  async function getJSON(path, params) {
    const ks = keyList();
    if (!ks.length) { const e = new Error('YouTube 키가 없습니다'); e.noKey = true; throw e; }
    let lastErr = null;
    for (let i = 0; i < ks.length; i++) {
      for (let attempt = 0; attempt < 3; attempt++) {
        const ps = new URLSearchParams(params);
        ps.set('key', ks[i]);
        try {
          const r = await fetch(API + path + '?' + ps.toString());
          if (!r.ok) {
            let reason = '', msg = '';
            try {
              const j = await r.json();
              const e0 = j && j.error;
              reason = (e0 && e0.errors && e0.errors[0] && e0.errors[0].reason) || (e0 && e0.status) || '';
              msg = (e0 && e0.message) || '';
            } catch (e) {}
            /* 429(순간 요청 폭주)는 잠깐 쉬었다 두 번까지만 다시 */
            if (r.status === 429 && attempt < 2) { await sleep(attempt ? 2500 : 1100); continue; }
            if (r.status === 429) cooldownUntil = Date.now() + 20000;
            const err = new Error('YouTube ' + r.status + (reason ? ' · ' + reason : ''));
            err.status = r.status;
            err.reason = reason;
            err.quota = r.status === 429 || /quotaExceeded|dailyLimitExceeded|rateLimitExceeded/i.test(reason + ' ' + msg);
            err.keyInvalid = r.status === 400 || /keyInvalid|API_KEY_INVALID|keyNotValid/i.test(reason + ' ' + msg);
            /* 저장된 키가 잘못됐으면(400·키 무효) 기본 키로 한 번 더 시도 */
            err.tryNext = err.keyInvalid && i < ks.length - 1;
            throw err;
          }
          return await r.json();
        } catch (e) {
          lastErr = e;
          if (e && e.tryNext) break;          /* 다음 키로 */
          throw e;
        }
      }
    }
    throw lastErr;
  }

  const sleep = ms => new Promise(r => setTimeout(r, ms));
  /* 검색은 분당 한도가 빡빡해서 연달아 눌렀을 때 429가 납니다 — 최소 1.1초 텀 */
  let lastSearchAt = 0;
  let cooldownUntil = 0;
  async function searchGap() {
    if (Date.now() < cooldownUntil) {
      const e = new Error('YouTube 429 · 잠시 쉬는 중');
      e.quota = true;
      throw e;
    }
    const w = lastSearchAt + 1100 - Date.now();
    if (w > 0) await sleep(w);
    lastSearchAt = Date.now();
  }

  /* ── 검색 ─────────────────────────────────────────────── */
  async function searchPage(params, pageToken) {
    const ps = Object.assign({}, params);
    if (pageToken) ps.pageToken = pageToken;
    const ck = 's|' + JSON.stringify(ps);
    const hit = cacheGet(ck);
    if (hit) return hit;
    await searchGap();
    const d = await getJSON('/search', ps);
    const out = {
      items: (d.items || []).filter(i => i.id && i.id.videoId),
      next: d.nextPageToken || ''
    };
    cacheSet(ck, out);
    return out;
  }

  /* 검색 결과 → 조회수·구독자·길이까지 채운 카드 데이터 */
  async function hydrate(items, q) {
    const vids = [];
    for (let i = 0; i < items.length; i += 50) {
      const ids = items.slice(i, i + 50).map(x => x.id.videoId).join(',');
      const ck = 'v|' + ids;
      let d2 = cacheGet(ck);
      if (!d2) { d2 = await getJSON('/videos', { part: 'snippet,statistics,contentDetails', id: ids, maxResults: '50' }); cacheSet(ck, d2); }
      (d2.items || []).forEach(v => vids.push(v));
    }
    if (!vids.length) return [];
    const chIds = [...new Set(vids.map(v => v.snippet.channelId))].slice(0, 50).join(',');
    let subs = {};
    if (chIds) {
      const ck = 'c|' + chIds;
      let d3 = cacheGet(ck);
      if (!d3) { try { d3 = await getJSON('/channels', { part: 'statistics', id: chIds }); cacheSet(ck, d3); } catch (e) { d3 = { items: [] }; } }
      (d3.items || []).forEach(c => { subs[c.id] = +((c.statistics || {}).subscriberCount || 0); });
    }
    return vids.map(v => {
      const st = v.statistics || {};
      const views = +st.viewCount || 0;
      const sub = subs[v.snippet.channelId] || 0;
      return {
        id: v.id, title: v.snippet.title, channel: v.snippet.channelTitle,
        views, subs: sub, len: isoDur(v.contentDetails && v.contentDetails.duration),
        days: daysAgo(v.snippet.publishedAt),
        published: v.snippet.publishedAt, region: q.region || '',
        thumb: (v.snippet.thumbnails && (v.snippet.thumbnails.medium || v.snippet.thumbnails.default) || {}).url || '',
        url: 'https://www.youtube.com/watch?v=' + v.id,
        ratio: sub ? +(views / sub).toFixed(1) : 0,
        kw: q.q
      };
    });
  }

  /* 🛡️ 위험 영상(방송·아이돌·영화·랭킹 모음집) 자동 제외 */
  const safety = () => RS.safeFilter;
  function noteSafe(raw, safe) {
    T.lastRaw = raw.slice();
    T.lastSafe = {
      active: safe.active,
      removed: safe.removed.length,
      summary: safety().summary(safe.removed),
      hits: safe.removed.slice(0, 8).map(r => r.item.title + ' — ' + r.reason.kindLabel + ' (' + r.reason.hit + ')'),
      byKind: safe.removed.reduce((m, r) => { const k = r.reason.kindLabel; m[k] = (m[k] || 0) + 1; return m; }, {})
    };
  }

  /* ── 조회 조건 만들기 ────────────────────────────────── */
  function baseParams(q, v, pageToken) {
    v = v || {};
    const params = {
      part: 'snippet', type: 'video', maxResults: '50',
      order: v.order || (q.sort === 'date' ? 'date' : 'viewCount'),
      publishedAfter: new Date(Date.now() - 1000 * 3600 * 24 * (v.days || 45)).toISOString()
    };
    const query = (v.q || q.q || '').trim();
    if (query) params.q = query;
    const region = v.region !== undefined ? v.region : q.region;
    if (region) params.regionCode = region;
    if (q.dur === 'short') params.videoDuration = 'short';
    if (q.dur === 'long') params.videoDuration = 'long';
    if (pageToken) params.pageToken = pageToken;
    return params;
  }

  /* 새로고침마다 돌려 쓰는 조건들 — 같은 조건은 2페이지까지만 봅니다 */
  const VARIANTS = [
    { tag: '인기순' },
    { tag: '최근 7일', days: 7 },
    { tag: '연관도순', order: 'relevance' },
    { tag: '최근 2주', days: 14 },
    { tag: '미국 인기', region: 'US', days: 14 },
    { tag: '최신순', order: 'date', days: 10 },
    { tag: '일본 인기', region: 'JP', days: 14 },
    { tag: '최근 3일', days: 3 },
    { tag: '영국 인기', region: 'GB', days: 21 },
    { tag: '한 달 인기순', days: 30 },
    { tag: '연관도 · 최근 달', order: 'relevance', days: 30 }
  ];

  function newSession(q) {
    return { q: JSON.stringify([q.q, q.region, q.dur, q.minViews, q.sort]), seen: new Set(), vi: -1, pages: 0, token: '', shots: 0 };
  }
  function ensureSession(q) {
    if (!T.sess || T.sess.q !== JSON.stringify([q.q, q.region, q.dur, q.minViews, q.sort])) T.sess = newSession(q);
    return T.sess;
  }

  /* 안전 필터 + 최소 조회수 (0건이면 완화) */
  function refine(list, q) {
    const safe = safety().filter(list);
    const min = +q.minViews || 0;
    let out = safe.list.filter(v => v.views >= min);
    let relaxed = false;
    if (!out.length && safe.list.length) { out = safe.list.slice(); relaxed = true; }
    if (q.sort === 'date') out.sort((a, b) => (a.days || 0) - (b.days || 0));
    else if (q.sort === 'breakout') out.sort((a, b) => (b.ratio || 0) - (a.ratio || 0));
    else out.sort((a, b) => (b.views || 0) - (a.views || 0));
    if (q.sort !== 'date' && RS.rank) out = RS.rank.mix(out);
    return { list: out, relaxed, removed: safe.removed.length };
  }

  /* ── 첫 분석 ─────────────────────────────────────────── */
  T.search = async function (q) {
    T.lastRelaxed = false;
    T.lastDemoMeta = null;
    T.lastError = null;
    T.lastMode = 'live';
    T.lastSource = 'YouTube 실시간';
    T.lastSafe = { active: safety().enabled(), removed: 0, summary: '', hits: [], byKind: {} };
    T.sess = newSession(q);
    T.lastFilters = q;
    if (!T.hasKey()) return T.fallbackSearch(q, 'nokey');

    const s = T.sess;
    try {
      const params = baseParams(q, VARIANTS[0]);
      s.vi = 0;
      let p1 = await searchPage(params);
      /* 0건이면 다음 페이지까지 한 번 더 */
      if (!p1.items.length && p1.next) { p1 = await searchPage(params, p1.next); s.pages = 2; }
      s.token = p1.next || '';
      if (!p1.items.length) {
        /* 조회 결과 자체가 없으면 기간을 늘려 한 번 더 */
        const wide = baseParams(q, { days: 90 });
        p1 = await searchPage(wide);
        s.token = p1.next || '';
      }
      if (!p1.items.length) return T.fallbackSearch(q, 'empty');
      const out = await hydrate(p1.items, q);
      out.forEach(v => s.seen.add(v.id));
      const r = refine(out, q);
      noteSafe(out, safety().filter(out));
      T.lastRelaxed = r.relaxed;
      T.lastVariant = VARIANTS[0].tag;
      T.lastMode = 'live';
      if (!r.list.length) return T.fallbackSearch(q, 'filtered');
      return r.list;
    } catch (e) {
      console.warn('[tube] 실시간 검색 실패 → 대체 경로', e && e.message);
      return T.fallbackSearch(q, e);
    }
  };

  /* ── 🔄 다른 영상 (새로고침) ──────────────────────────── */
  T.more = async function (q) {
    const key = JSON.stringify([q.q, q.region, q.dur, q.minViews, q.sort]);
    /* 아직 한 번도 분석한 적이 없으면 그냥 새로 분석 */
    if (!T.sess || T.sess.q !== key) return T.search(q);
    const s = T.sess;
    T.lastError = null;
    if (!T.hasKey()) {
      s.shots++;
      return T.fallbackSearch(q, T.lastError || 'fallback');
    }
    const collected = [];
    const push = arr => arr.forEach(v => { if (!s.seen.has(v.id) && !collected.some(x => x.id === v.id)) collected.push(v); });

    for (let attempt = 0; attempt < 5; attempt++) {
      /* 지금 조건으로 다음 페이지가 있으면 그걸 먼저 */
      if (!s.token || s.pages >= 2) {
        s.vi = (s.vi + 1) % VARIANTS.length;
        s.pages = 0;
        s.token = '';
        if (s.vi === 0) s.shots++;                    // 조건을 한 바퀴 다 돌았음
      }
      const v = VARIANTS[s.vi];
      try {
        const p = await searchPage(baseParams(q, v), s.token);
        s.pages++;
        s.token = p.next || '';
        if (!p.items.length) continue;
        const fresh = await hydrate(p.items, q);
        push(fresh);                                  /* seen에 없는 것만 collected로 */
        fresh.forEach(x => s.seen.add(x.id));
        T.lastVariant = v.tag;
        if (collected.length >= 8) break;
      } catch (e) {
        T.lastError = e;
        if (e && (e.quota || e.noKey)) return T.fallbackSearch(q, e);
        continue;
      }
    }
    if (!collected.length) {
      /* 모든 조건을 다 돌았는데 새 게 없음 → 보여준 기록을 비우고 처음부터 */
      s.seen.clear();
      T.lastExhausted = true;
      return T.fallbackSearch(q, 'exhausted');
    }
    T.lastExhausted = false;
    T.lastMode = 'live';
    T.lastSource = 'YouTube 실시간';
    const safe = safety().filter(collected);
    noteSafe(collected, safe);
    const r = refine(collected, q);
    T.lastRelaxed = r.relaxed;
    return r.list;
  };

  /* ── 키가 없거나 API가 막혔을 때 ──────────────────────── */
  /* ── 유튜브 인기 차트 (검색 한도와 무관 · videos.list 1유닛) ──
     검색(search) 한도가 차도 공식 API로 진짜 인기 영상을 계속 보여줄 수 있습니다.
     새로고침마다 나라·카테고리를 바꿔 새 영상이 나옵니다. */
  const CHART_REGIONS = ['KR', 'US', 'JP', 'GB'];
  const CHART_CATS = [
    { id: '', tag: '전체' }, { id: '15', tag: '동물' }, { id: '23', tag: '코미디' },
    { id: '24', tag: '엔터' }, { id: '20', tag: '게임' }, { id: '26', tag: '노하우' }, { id: '22', tag: '인물' }
  ];
  let chartTurn = 0;
  T.chart = async function (q, opts) {
    opts = opts || {};
    const n = chartTurn++;
    const wantRegion = (q && q.region) || CHART_REGIONS[n % CHART_REGIONS.length];
    const cat = CHART_CATS[(opts.catIdx != null ? opts.catIdx : n) % CHART_CATS.length];
    const params = { part: 'snippet,statistics,contentDetails', chart: 'mostPopular', maxResults: '50', regionCode: wantRegion };
    if (cat.id) params.videoCategoryId = cat.id;
    const ck = 'ch|' + JSON.stringify(params);
    let d = cacheGet(ck);
    if (!d) { d = await getJSON('/videos', params); cacheSet(ck, d); }
    const shorts = (d.items || []).map(v => {
      const st = v.statistics || {};
      return {
        id: v.id, title: v.snippet.title, channel: v.snippet.channelTitle,
        views: +st.viewCount || 0, subs: 0, len: isoDur(v.contentDetails && v.contentDetails.duration),
        days: daysAgo(v.snippet.publishedAt), published: v.snippet.publishedAt, region: wantRegion,
        thumb: 'https://i.ytimg.com/vi/' + v.id + '/mqdefault.jpg',
        url: 'https://www.youtube.com/shorts/' + v.id,
        ratio: 0, kw: '', cat: catOf(v.snippet.title)
      };
    }).filter(v => v.len > 0 && v.len <= 61);
    const seen = opts.seen || (T.sess && T.sess.seen) || new Set();
    const fresh = shorts.filter(v => !seen.has(v.id));
    const pick = (fresh.length ? fresh : shorts).sort((a, b) => b.views - a.views).slice(0, 24);
    pick.forEach(v => seen.add(v.id));
    T.lastChart = { region: wantRegion, cat: cat.tag };
    return pick;
  };

  T.fallbackSearch = async function (q, reason) {
    const err = reason && reason.message ? reason : null;
    if (err) T.lastError = err;
    /* ① 공식 인기 차트 (검색 한도·키 문제와 무관하게 동작) */
    if (T.hasKey()) {
      try {
        const chart = await T.chart(q);
        if (chart.length) {
          /* 검색어와 제목이 맞는 게 있으면 먼저 */
          const toks = String((q && q.q) || '').toLowerCase().split(/\s+/).filter(Boolean);
          const hit = toks.length ? chart.filter(v => toks.some(t => String(v.title).toLowerCase().includes(t))) : [];
          const base = hit.length >= 4 ? hit : chart;
          const safe = safety().filter(base);
          noteSafe(base, safe);
          const r = refine(safe.list, Object.assign({}, q || {}, { sort: 'views' }));
          if (r.list.length) {
            T.lastMode = 'chart';
            T.lastSource = '유튜브 인기';
            T.lastDemoMeta = null;
            T.lastRelaxed = r.relaxed;
            return r.list;
          }
        }
      } catch (e) {}
    }
    /* ② 공개 트렌드(키 없이) — 실제 유튜브 영상. 새로고침마다 나라를 바꿔 새 영상을 찾습니다 */
    const REGIONS = ['KR', 'US', 'JP', 'GB'];
    if (typeof T.fbRegion !== 'number') T.fbRegion = Math.max(0, REGIONS.indexOf((q && q.region) || 'KR'));
    for (let i = 0; i < REGIONS.length; i++) {
      const region = REGIONS[(T.fbRegion + i) % REGIONS.length];
      try {
        const trend = await pipedTrending(region);
        if (!trend.length) continue;
        const seen = new Set((T.sess && [...T.sess.seen]) || []);
        let list = trend.filter(v => !seen.has(v.id));
        if (!list.length) continue;
        const safe = safety().filter(list);
        noteSafe(list, safe);
        const r = refine(safe.list, q || {});
        if (r.list.length) {
          r.list.forEach(v => { if (T.sess) T.sess.seen.add(v.id); });
          T.fbRegion = (T.fbRegion + i + 1) % REGIONS.length;   /* 다음엔 다른 나라 */
          T.lastMode = 'public';
          T.lastSource = '공개 트렌드';
          T.lastDemoMeta = null;
          T.lastRelaxed = r.relaxed;
          return r.list;
        }
      } catch (e) {}
    }
    /* ③ 준비된 샘플 (새로고침마다 다른 묶음) */
    const list = T.demoSearch(q || {});
    T.lastMode = 'demo';
    T.lastSource = '샘플 떡상 데이터';
    return list;
  };

  /* 공개 Piped 인스턴스의 트렌드 (키 없이 CORS 허용) */
  const PIPED = ['https://pipedapi.ducks.party', 'https://api.piped.private.coffee'];
  function mapPiped(o) {
    const m = /[?&]v=([\w-]{6,})/.exec(o.url || '');
    if (!m) return null;
    const id = m[1];
    return {
      id, title: o.title || '', channel: o.uploaderName || '',
      views: +o.views || 0, subs: 0,
      len: +o.duration > 0 ? +o.duration : null,
      days: +o.uploaded > 0 ? Math.floor(+o.uploaded / 86400000) : null,
      published: '', region: '', cat: catOf(o.title),
      thumb: 'https://i.ytimg.com/vi/' + id + '/mqdefault.jpg',
      url: 'https://www.youtube.com/shorts/' + id, ratio: 0, kw: ''
    };
  }
  async function pipedTrending(region) {
    for (const host of PIPED) {
      try {
        const ctl = new AbortController();
        const to = setTimeout(() => ctl.abort(), 6000);
        const r = await fetch(host + '/trending?region=' + encodeURIComponent(region || 'KR'), { signal: ctl.signal });
        clearTimeout(to);
        if (!r.ok) continue;
        const j = await r.json();
        const arr = Array.isArray(j) ? j : (j.items || []);
        const items = arr.map(mapPiped).filter(Boolean);
        if (items.length) return items;
      } catch (e) {}
    }
    return [];
  }

  /* ── 키워드 → 비슷한 결의 카테고리 (데모에서 어떤 단어든 결과가 나오게) */
  const DEMO_SYNONYMS = [
    [/(동물|강아지|고양이|댕댕|냥|멍|반려|애완|puppy|cat|dog|animal|힐링)/i, ['동물', '자연', 'ASMR']],
    [/(반전|밈|웃긴|유머|개그|드립|meme|funny|해외밈|초월번역|영상)/i, ['반전', '유머', '공감', '해외일상']],
    [/(cctv|사고|블박|블랙박스|교통|아찔|사건)/i, ['CCTV', '블랙박스', '신기한 현상']],
    [/(꿀팁|생활|살림|청소|정리|자취|tip|hack)/i, ['꿀팁', '요리']],
    [/(요리|음식|레시피|먹방|간식|food|cook|recipe)/i, ['요리', '꿀팁']],
    [/(운동|홈트|다이어트|헬스|스쿼트|workout|gym|몸짱)/i, ['운동']],
    [/(여행|풍경|감성|꽃|travel|trip|휴가)/i, ['여행', '자연']],
    [/(일본|해외|외국|브이로그|japan|vlog|일상)/i, ['해외일상', '여행']],
    [/(asmr|소리|사운드|만족|satisfying)/i, ['ASMR']],
    [/(신기|놀라|현상|마술|amazing|자연|과학)/i, ['신기한 현상', '자연']],
    [/(ai|테크|기술|로봇|인공지능|미래)/i, ['신기한 현상', '유머']],
    [/(웃프|눈물|감동|사연|이야기|공감)/i, ['공감', '유머', '반전']]
  ];
  T.demoSearch = function (q) {
    q = q || {};
    const raw = String(q.q || '').trim();
    const toks = raw.split(/\s+/).filter(Boolean).map(t => t.toLowerCase());
    const all = RS.demoDiscover.slice();
    const hitText = v => toks.some(t => (v.title + ' ' + (v.kw || '') + ' ' + (v.cat || '')).toLowerCase().includes(t));
    const cats = new Set();
    if (raw) DEMO_SYNONYMS.forEach(([re, cs]) => { if (re.test(raw)) cs.forEach(c => cats.add(c)); });
    const sortFn = q.sort === 'date' ? (a, b) => (a.days || 0) - (b.days || 0)
      : q.sort === 'views' ? (a, b) => (b.views || 0) - (a.views || 0)
      : (a, b) => ((b.ratio || 0) - (a.ratio || 0)) || ((b.views || 0) - (a.views || 0));
    const pass = v => {
      if (q.region && v.region !== q.region) return false;
      if (q.dur === 'short' && !(v.len <= 60)) return false;
      if (q.dur === 'long' && !(v.len > 60)) return false;
      if (+q.minViews && v.views < +q.minViews) return false;
      return true;
    };
    let tier = pass, relaxed = '';
    let direct = [], related = [], rest = [];
    const build = () => {
      direct = all.filter(v => tier(v) && hitText(v)).sort(sortFn);
      related = all.filter(v => tier(v) && !hitText(v) && cats.has(v.cat)).sort(sortFn);
      rest = all.filter(v => tier(v) && !hitText(v) && !cats.has(v.cat)).sort(sortFn);
    };
    build();
    if (!direct.length && !related.length) {
      tier = v => (!q.dur || (q.dur === 'short' ? v.len <= 60 : v.len > 60));
      relaxed = '필터를 조금 풀어';
      build();
    }
    if (!direct.length && !related.length) {
      tier = () => true; relaxed = '조건에 맞는 샘플이 없어 인기순으로';
      build();
    }
    const seen = new Set((T.sess && [...T.sess.seen]) || []);
    const mix = [];
    const push = (arr, tag) => arr.forEach(v => {
      if (mix.length >= 12) return;
      if (mix.some(x => x.id === v.id)) return;
      if (seen.has(v.id)) return;                       // 새로고침에서는 이미 본 샘플 제외
      mix.push(Object.assign({}, v, { demo: true, sim: tag, published: new Date(Date.now() - (v.days || 0) * 86400000).toISOString() }));
    });
    push(direct, 'match');
    push(related, 'related');
    if (mix.length < 12) push(rest, 'fresh');
    /* 샘플을 한 바퀴 다 봤으면 기록을 비우고 다시 채웁니다 */
    if (!mix.length && seen.size) {
      if (T.sess) T.sess.seen.clear();
      return T.demoSearch(q);
    }
    mix.forEach(v => { if (T.sess) T.sess.seen.add(v.id); });
    T.lastDemoMeta = { direct: direct.length, related: related.length, fresh: mix.filter(v => v.sim === 'fresh').length, relaxed };
    T.lastRelaxed = !!relaxed;
    const safe = safety().filter(mix);
    noteSafe(all, safe);
    T.lastFilters = q;
    return RS.rank ? RS.rank.mix(safe.list) : safe.list;
  };

  /* ── 인기 쇼츠 레일 ─────────────────────────────────── */
  const CAT_RULES = [
    ['CCTV', /cctv|폐쇄회로/i], ['블랙박스', /블랙박스|블박/i],
    ['동물', /강아지|고양이|댕댕|냥|멍|동물|puppy|cat|dog|animal/i],
    ['ASMR', /asmr|사운드|소리/i], ['요리', /레시피|요리|먹방|간식|recipe|food/i],
    ['운동', /홈트|운동|다이어트|스쿼트|workout|gym/i], ['여행', /여행|풍경|travel|trip/i],
    ['해외일상', /일본|도쿄|해외|외국|브이로그|vlog|japan/i],
    ['꿀팁', /꿀팁|생활|청소|정리|tip|hack/i], ['자연', /자연|바다|하늘|산|숲|nature/i],
    ['신기한 현상', /신기|현상|놀라|amazing|satisfying/i],
    ['반전', /반전|뒤집|역전|twist/i], ['공감', /공감|일상|직장|학교/i]
  ];
  function catOf(title) {
    const t = String(title || '');
    for (const [name, re] of CAT_RULES) if (re.test(t)) return name;
    return '유머';
  }

  const POP_REGIONS = ['KR', 'US', 'JP', 'GB'];
  const POP_WINDOWS = [21, 7, 14, 30];
  const pop = { seen: new Set(), ri: 0, wi: 0, token: '', pages: 0, shots: 0 };

  T.popular = async function (opts) {
    opts = opts || {};
    if (!opts.more) { pop.seen.clear(); pop.ri = 0; pop.wi = 0; pop.token = ''; pop.pages = 0; pop.shots = 0; }
    if (!T.hasKey()) return [];
    /* ① 공식 인기 차트 — 검색 한도와 무관하게 항상 동작 */
    try {
      const region = POP_REGIONS[pop.ri % POP_REGIONS.length];
      const chart = await T.chart({ region }, { catIdx: pop.wi, seen: pop.seen });
      if (chart && chart.length) {
        pop.ri++; if (pop.ri % POP_REGIONS.length === 0) pop.wi++;
        T.lastPopularRaw = chart;
        const safe = safety().filter(chart);
        T.lastPopularSafe = { active: safe.active, removed: safe.removed.length, summary: safety().summary(safe.removed) };
        T.lastPopularRegion = region;
        T.lastPopularSource = '유튜브 인기';
        return (RS.rank ? RS.rank.mix(safe.list) : safe.list).slice(0, 20);
      }
    } catch (e) {}
    const region = POP_REGIONS[pop.ri % POP_REGIONS.length];
    const days = POP_WINDOWS[pop.wi % POP_WINDOWS.length];
    try {
      const params = {
        part: 'snippet', type: 'video', videoDuration: 'short', order: 'viewCount',
        maxResults: '25', regionCode: region,
        publishedAfter: new Date(Date.now() - 1000 * 3600 * 24 * days).toISOString()
      };
      if (pop.token) params.pageToken = pop.token;
      const pck = 's|' + JSON.stringify(params);
      let d1 = cacheGet(pck);
      if (!d1) { await searchGap(); d1 = await getJSON('/search', params); cacheSet(pck, d1); }
      pop.pages++;
      pop.token = d1.nextPageToken || '';
      if (!pop.token && pop.pages >= 1) { /* 다음 새로고침 때 지역·기간을 바꿉니다 */ }
      const ids = (d1.items || []).filter(i => i.id && i.id.videoId).map(i => i.id.videoId);
      if (!ids.length) throw new Error('결과 없음');
      const ck = 'pv|' + ids.join(',');
      let d2 = cacheGet(ck);
      if (!d2) {
        d2 = await getJSON('/videos', { part: 'snippet,statistics,contentDetails', id: ids.join(','), maxResults: '50' });
        cacheSet(ck, d2);
      }
      const raw = (d2.items || []).map(v => {
        const st = v.statistics || {};
        return {
          id: v.id, title: v.snippet.title, channel: v.snippet.channelTitle,
          views: +st.viewCount || 0, subs: 0, len: isoDur(v.contentDetails && v.contentDetails.duration),
          cat: catOf(v.snippet.title), days: daysAgo(v.snippet.publishedAt),
          thumb: 'https://i.ytimg.com/vi/' + v.id + '/oar2.jpg',
          url: 'https://www.youtube.com/shorts/' + v.id,
          published: v.snippet.publishedAt, demo: false
        };
      }).filter(v => v.views >= 100000)
        .sort((a, b) => b.views - a.views);
      T.lastPopularRaw = raw;
      const safe = safety().filter(raw);
      T.lastPopularSafe = { active: safe.active, removed: safe.removed.length, summary: safety().summary(safe.removed) };
      const fresh = safe.list.filter(v => !pop.seen.has(v.id));
      const list = (fresh.length ? fresh : safe.list).slice(0, 20);
      list.forEach(v => pop.seen.add(v.id));
      if (!list.length) throw new Error('결과 없음');
      T.lastPopularRegion = region;
      pop.shots = opts.more ? pop.shots + 1 : 0;
      if (!pop.token) { pop.ri++; pop.pages = 0; if (pop.ri % POP_REGIONS.length === 0) pop.wi++; }
      const out = RS.rank ? RS.rank.mix(list) : list;
      return out.slice(0, 20);
    } catch (e) {
      T.lastPopularError = e;
      /* 키 없이도 볼 수 있게 공개 트렌드로 */
      const trend = await pipedTrending(region);
      if (!trend.length) throw e;
      const safe = safety().filter(trend);
      T.lastPopularSafe = { active: safe.active, removed: safe.removed.length, summary: safety().summary(safe.removed) };
      T.lastPopularRaw = trend;
      const fresh = safe.list.filter(v => !pop.seen.has(v.id));
      const list = (fresh.length ? fresh : safe.list).slice(0, 20);
      list.forEach(v => pop.seen.add(v.id));
      T.lastPopularRegion = region;
      T.lastPopularSource = '공개 트렌드';
      return list;
    }
  };

  T.testKey = async function (key) {
    const k = cleanKey(key) || builtinKey();
    if (!k) throw new Error('키가 없습니다');
    const url = API + '/search?part=snippet&q=test&maxResults=1&type=video&key=' + encodeURIComponent(k);
    const r = await fetch(url);
    if (!r.ok) {
      let reason = '';
      try { const j = await r.json(); reason = (j.error && j.error.errors && j.error.errors[0] && j.error.errors[0].reason) || ''; } catch (e) {}
      throw new Error('키가 거부되었습니다 (' + r.status + (reason ? ' · ' + reason : '') + ')');
    }
    return true;
  };

  T.relDate = relDate;
})();
