/* REEL STUDIO — YouTube: 떡상 발굴(검색·인기) */
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

  /* ── discovery ───────────────────────────────────────── */
  /* 검색 1페이지 호출 */
  async function searchPage(params, pageToken) {
    const ps = new URLSearchParams(params);
    if (pageToken) ps.set('pageToken', pageToken);
    const r = await fetch(API + '/search?' + ps.toString());
    if (!r.ok) {
      const t = await r.text();
      if (r.status === 403) throw new Error('YouTube API 한도 초과이거나 키가 막혔습니다 (403)');
      throw new Error('검색 실패 (' + r.status + ')' + t.slice(0, 120));
    }
    const d = await r.json();
    return { items: (d.items || []).filter(i => i.id && i.id.videoId), next: d.nextPageToken || '' };
  }

  /* 검색 결과 → 조회수·구독자·길이까지 채운 카드 데이터 */
  async function hydrate(items, q, key) {
    if (!items.length) return [];
    const ids = items.map(i => i.id.videoId).join(',');
    const r2 = await fetch(API + '/videos?part=snippet,statistics,contentDetails&id=' + ids + '&key=' + key);
    const d2 = await r2.json();
    const vids = d2.items || [];
    const chIds = [...new Set(vids.map(v => v.snippet.channelId))].slice(0, 50).join(',');
    let subs = {};
    if (chIds) {
      const r3 = await fetch(API + '/channels?part=statistics&id=' + chIds + '&key=' + key);
      const d3 = await r3.json();
      (d3.items || []).forEach(c => { subs[c.id] = +((c.statistics || {}).subscriberCount || 0); });
    }
    return vids.map(v => {
      const st = v.statistics || {};
      const views = +st.viewCount || 0;
      const sub = subs[v.snippet.channelId] || 0;
      return {
        id: v.id, title: v.snippet.title, channel: v.snippet.channelTitle,
        views, subs: sub, len: isoDur(v.contentDetails && v.contentDetails.duration),
        days: Math.floor((Date.now() - new Date(v.snippet.publishedAt).getTime()) / 86400000),
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

  T.search = async function (q) {
    const key = RS.state.settings.youtube;
    const minViews = +q.minViews || 0;
    T.lastRelaxed = false;
    T.lastDemoMeta = null;
    T.lastSafe = { active: safety().enabled(), removed: 0, summary: '', hits: [], byKind: {} };
    if (!key) { T.lastFilters = q; return T.demoSearch(q); }
    const params = {
      part: 'snippet', type: 'video', maxResults: '50',
      order: q.sort === 'date' ? 'date' : 'viewCount',
      publishedAfter: new Date(Date.now() - 1000 * 3600 * 24 * 45).toISOString(),
      key
    };
    if (q.q) params.q = q.q;
    if (q.region) params.regionCode = q.region;
    if (q.dur === 'short') params.videoDuration = 'short';
    if (q.dur === 'long') params.videoDuration = 'long';
    const p1 = await searchPage(params);
    if (!p1.items.length) { T.lastFilters = q; T.lastRaw = []; return []; }
    let out = await hydrate(p1.items, q, key);
    let safe = safety().filter(out);
    /* '모음집'·'방송 클립' 키워드처럼 걸러질 게 많은 검색은 한 페이지만 보충해서
       안전한 소재가 너무 적어지지 않게 합니다. */
    if (safe.list.length < 8 && p1.next) {
      try {
        const p2 = await searchPage(params, p1.next);
        const more = await hydrate(p2.items, q, key);
        const seen = new Set(out.map(v => v.id));
        out = out.concat(more.filter(v => !seen.has(v.id)));
        safe = safety().filter(out);
      } catch (e) {}
    }
    noteSafe(out, safe);
    T.lastFilters = q;
    const all = safe.list;
    out = all.filter(v => v.views >= minViews);
    if (!out.length && all.length) { out = all.slice(); T.lastRelaxed = true; }
    if (q.sort === 'breakout') out.sort((a, b) => b.ratio - a.ratio);
    else if (q.sort === 'date') out.sort((a, b) => a.days - b.days);
    else out.sort((a, b) => b.views - a.views);
    /* 🌍 해외 밈·글로벌 동물 클립 우선(약 75%). 최신순은 고른 순서를 지킵니다. */
    if (q.sort !== 'date' && RS.rank) out = RS.rank.mix(out);
    return out;
  };

  /* 키워드 → 비슷한 결의 카테고리 (데모에서 어떤 단어든 결과가 나오게) */
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
    const mix = [];
    const push = (arr, tag) => arr.forEach(v => {
      if (mix.length >= 12) return;
      if (mix.some(x => x.id === v.id)) return;
      mix.push(Object.assign({}, v, { demo: true, sim: tag, published: new Date(Date.now() - (v.days || 0) * 86400000).toISOString() }));
    });
    push(direct, 'match');
    push(related, 'related');
    if (mix.length < 12) push(rest, 'fresh');
    T.lastDemoMeta = { direct: direct.length, related: related.length, fresh: mix.filter(v => v.sim === 'fresh').length, relaxed };
    T.lastRelaxed = !!relaxed;
    /* 샘플 풀에도 방송·아이돌·랭킹 항목이 섞여 들어오면 여기서 한 번 더 막습니다. */
    const safe = safety().filter(mix);
    noteSafe(all, safe);
    T.lastFilters = q;
    return RS.rank ? RS.rank.mix(safe.list) : safe.list;
  };


  /* ── 인기 쇼츠 레일 (키가 있을 때 실시간) ─────────────── */
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
  T.popular = async function () {
    const key = RS.state.settings.youtube;
    if (!key) return [];
    const params = new URLSearchParams({
      part: 'snippet', type: 'video', videoDuration: 'short', order: 'viewCount',
      maxResults: '25', regionCode: 'KR', relevanceLanguage: 'ko',
      publishedAfter: new Date(Date.now() - 1000 * 3600 * 24 * 21).toISOString(), key
    });
    const r1 = await fetch(API + '/search?' + params.toString());
    if (!r1.ok) {
      if (r1.status === 403) throw new Error('YouTube API 한도 초과이거나 키가 막혔습니다 (403)');
      throw new Error('인기 쇼츠 조회 실패 (' + r1.status + ')');
    }
    const d1 = await r1.json();
    const ids = (d1.items || []).filter(i => i.id && i.id.videoId).map(i => i.id.videoId).join(',');
    if (!ids) return [];
    const r2 = await fetch(API + '/videos?part=snippet,statistics,contentDetails&id=' + ids + '&key=' + key);
    if (!r2.ok) throw new Error('영상 정보 조회 실패 (' + r2.status + ')');
    const d2 = await r2.json();
    const raw = (d2.items || []).map(v => {
      const st = v.statistics || {};
      const views = +st.viewCount || 0;
      return {
        id: v.id, title: v.snippet.title, channel: v.snippet.channelTitle,
        views, subs: 0, len: isoDur(v.contentDetails && v.contentDetails.duration),
        cat: catOf(v.snippet.title),
        thumb: 'https://i.ytimg.com/vi/' + v.id + '/oar2.jpg',
        url: 'https://www.youtube.com/shorts/' + v.id,
        published: v.snippet.publishedAt, demo: false
      };
    }).filter(v => v.views >= 100000)
      .sort((a, b) => b.views - a.views).slice(0, 30);
    const safe = safety().filter(raw);
    T.lastPopularRaw = raw;
    T.lastPopularSafe = { active: safe.active, removed: safe.removed.length, summary: safety().summary(safe.removed) };
    if (RS.rank) safe.list = RS.rank.mix(safe.list);
    return safe.list.slice(0, 20);
  };

  T.testKey = async function (key) {
    const url = API + '/search?part=snippet&q=test&maxResults=1&type=video&key=' + encodeURIComponent(key);
    const r = await fetch(url);
    if (!r.ok) throw new Error('키가 거부되었습니다 (' + r.status + ')');
    return true;
  };

  T.relDate = relDate;
})();
