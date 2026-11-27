/* REEL STUDIO — YouTube: 떡상 발굴 + 업로드 */
(function () {
  'use strict';
  const RS = window.RS;
  const T = RS.tube = {};

  const API = 'https://www.googleapis.com/youtube/v3';
  T.token = null;
  T.tokenAt = 0;
  T.tokenClient = null;

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
  T.search = async function (q) {
    const key = RS.state.settings.youtube;
    const minViews = +q.minViews || 0;
    if (!key) return T.demoSearch(q);
    const params = new URLSearchParams({
      part: 'snippet', type: 'video', maxResults: '30',
      order: q.sort === 'date' ? 'date' : 'viewCount',
      publishedAfter: new Date(Date.now() - 1000 * 3600 * 24 * 45).toISOString(),
      key
    });
    if (q.q) params.set('q', q.q);
    if (q.region) params.set('regionCode', q.region);
    if (q.dur === 'short') params.set('videoDuration', 'short');
    if (q.dur === 'long') params.set('videoDuration', 'long');
    const r1 = await fetch(API + '/search?' + params.toString());
    if (!r1.ok) {
      const t = await r1.text();
      if (r1.status === 403) throw new Error('YouTube API 한도 초과이거나 키가 막혔습니다 (403)');
      throw new Error('검색 실패 (' + r1.status + ')' + t.slice(0, 120));
    }
    const d1 = await r1.json();
    const items = (d1.items || []).filter(i => i.id && i.id.videoId);
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
    let out = vids.map(v => {
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
    out = out.filter(v => v.views >= minViews);
    if (q.sort === 'breakout') out.sort((a, b) => b.ratio - a.ratio);
    else if (q.sort === 'date') out.sort((a, b) => a.days - b.days);
    else out.sort((a, b) => b.views - a.views);
    return out;
  };

  T.demoSearch = function (q) {
    const toks = String(q.q || '').split(/\s+/).filter(Boolean);
    let list = RS.demoDiscover.slice();
    if (toks.length) {
      const hit = list.filter(v => toks.some(t => (v.title + v.kw).toLowerCase().includes(t.toLowerCase())));
      if (hit.length >= 3) list = hit;
      else list = list.map(v => Object.assign({}, v, { kwScore: 0 })).sort((a, b) => (b.title.includes(toks[0]) ? 1 : 0) - (a.title.includes(toks[0]) ? 1 : 0));
    }
    if (q.region) {
      const r = list.filter(v => v.region === q.region);
      if (r.length >= 2) list = r;
    }
    list = list.filter(v => v.views >= (+q.minViews || 0));
    if (q.dur === 'short') list = list.filter(v => v.len <= 60);
    if (q.dur === 'long') list = list.filter(v => v.len > 60);
    if (q.sort === 'breakout') list.sort((a, b) => b.ratio - a.ratio);
    else if (q.sort === 'date') list.sort((a, b) => a.days - b.days);
    else list.sort((a, b) => b.views - a.views);
    return list.map(v => Object.assign({}, v, { demo: true, published: new Date(Date.now() - v.days * 86400000).toISOString() }));
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
    return (d2.items || []).map(v => {
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
      .sort((a, b) => b.views - a.views).slice(0, 20);
  };

  T.testKey = async function (key) {
    const url = API + '/search?part=snippet&q=test&maxResults=1&type=video&key=' + encodeURIComponent(key);
    const r = await fetch(url);
    if (!r.ok) throw new Error('키가 거부되었습니다 (' + r.status + ')');
    return true;
  };

  /* ── OAuth (Google Identity Services) ────────────────── */
  T.connect = function () {
    const clientId = RS.state.settings.oauth;
    if (!clientId) return Promise.reject(new Error('OAuth Client ID가 없습니다'));
    if (!window.google || !google.accounts || !google.accounts.oauth2) {
      return Promise.reject(new Error('Google 로그인 스크립트를 아직 못 불러왔습니다. 잠시 후 다시 시도하세요.'));
    }
    return new Promise((resolve, reject) => {
      try {
        T.tokenClient = google.accounts.oauth2.initTokenClient({
          client_id: clientId,
          scope: 'https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.readonly',
          callback: (resp) => {
            if (resp && resp.access_token) {
              T.token = resp.access_token;
              T.tokenAt = Date.now();
              resolve(resp.access_token);
            } else {
              reject(new Error('토큰을 받지 못했습니다'));
            }
          },
          error_callback: (err) => reject(new Error((err && (err.message || err.type)) || '로그인 취소'))
        });
        T.tokenClient.requestAccessToken({ prompt: T.token ? '' : 'consent' });
      } catch (e) { reject(e); }
    });
  };

  T.disconnect = function () {
    try { if (T.token && google.accounts.oauth2.revoke) google.accounts.oauth2.revoke(T.token); } catch (e) {}
    T.token = null; T.tokenAt = 0;
  };
  T.tokenAgeMin = () => T.token ? Math.round((Date.now() - T.tokenAt) / 60000) : -1;

  /* ── upload ──────────────────────────────────────────── */
  T.upload = function (opts) {
    const token = T.token;
    if (!token) return Promise.reject(new Error('먼저 Google 계정을 연결하세요'));
    const { file, title, desc, tags, privacy, madeForKids, onProgress } = opts;
    const meta = {
      snippet: {
        title: String(title || '쇼츠').slice(0, 100),
        description: String(desc || '').slice(0, 4900),
        tags: String(tags || '').split(',').map(s => s.trim()).filter(Boolean).slice(0, 30),
        categoryId: '22'
      },
      status: {
        privacyStatus: privacy || 'private',
        selfDeclaredMadeForKids: !!madeForKids,
        embeddable: true
      }
    };
    const initUrl = 'https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status';
    return fetch(initUrl, {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + token,
        'Content-Type': 'application/json; charset=UTF-8',
        'X-Upload-Content-Length': String(file.size),
        'X-Upload-Content-Type': file.type || 'video/webm'
      },
      body: JSON.stringify(meta)
    }).then(res => {
      if (!res.ok) {
        return res.text().then(t => {
          let msg = '업로드 시작 실패 (' + res.status + ')';
          try { const j = JSON.parse(t); msg = (j.error && j.error.message) || msg; } catch (e) {}
          throw new Error(msg);
        });
      }
      const loc = res.headers.get('Location');
      if (!loc) throw new Error('업로드 주소를 받지 못했습니다');
      return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('PUT', loc, true);
        xhr.setRequestHeader('Content-Type', file.type || 'video/webm');
        xhr.upload.onprogress = e => { if (e.lengthComputable && onProgress) onProgress(Math.round(e.loaded / e.total * 100)); };
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            try { resolve(JSON.parse(xhr.responseText)); } catch (e) { reject(new Error('응답을 해석하지 못했습니다')); }
          } else {
            let msg = '업로드 실패 (' + xhr.status + ')';
            try { const j = JSON.parse(xhr.responseText); msg = (j.error && j.error.message) || msg; } catch (e) {}
            reject(new Error(msg));
          }
        };
        xhr.onerror = () => reject(new Error('네트워크 오류로 업로드가 끊겼습니다'));
        xhr.send(file);
      });
    });
  };

  T.setThumbnail = function (videoId, blob) {
    if (!T.token) return Promise.reject(new Error('로그인 필요'));
    return fetch('https://www.googleapis.com/upload/youtube/v3/thumbnails/set?uploadType=media&videoId=' + videoId, {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + T.token, 'Content-Type': 'image/png' },
      body: blob
    }).then(r => { if (!r.ok) throw new Error('썸네일 설정 실패 (' + r.status + ')'); return r.json(); });
  };

  T.relDate = relDate;
})();
