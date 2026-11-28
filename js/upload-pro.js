/* REEL STUDIO — 마무리 도구: 🛡️ 3줄 사전 체크 · 제목 5안 · 고퀄 썸네일 · 피클 넘기기
   app.js보다 먼저 로드되고, 화면 조립은 app.js가 이 모듈(RS.up)의 계산 결과만 받아 씁니다. */
(function () {
  'use strict';
  const RS = window.RS = window.RS || {};
  const UP = RS.up = {};

  const FONT_DISPLAY = '"Black Han Sans","Gothic A1","Noto Sans KR","Apple SD Gothic Neo",sans-serif';
  const FONT_UI = '"Gothic A1","Noto Sans KR","Apple SD Gothic Neo","Malgun Gothic",sans-serif';
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const escRe = s => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  /* ══════════════════════════════════════════════════════════
     설명란 안전 쿠션 — "출처 · 원작자 요청 시 즉시 삭제합니다"
     ══════════════════════════════════════════════════════════ */
  const SAFETY_CORE = '출처 · 원작자 요청 시 즉시 삭제합니다';
  UP.SAFETY_CORE = SAFETY_CORE;
  UP.safetyLine = function (email) {
    const e = String(email || '').trim();
    return '📌 ' + SAFETY_CORE + (e ? ' (문의: ' + e + ')' : ' — 댓글로 알려주시면 바로 내리겠습니다.');
  };
  UP.hasSafety = function (desc) {
    const d = String(desc || '');
    if (!d) return false;
    const hasSource = /출처|원작|원본\s*(링크|영상|채널)|credit|source/i.test(d);
    const hasRemove = /삭제|내리|내립니다|요청\s*시|takedown|remove/i.test(d);
    return hasSource && hasRemove;
  };
  UP.withSafety = function (desc, email) {
    const d = String(desc || '').replace(/\s+$/, '');
    if (UP.hasSafety(d)) return d;
    const line = UP.safetyLine(email);
    return d ? d + '\n\n' + line : line;
  };

  /* ══════════════════════════════════════════════════════════
     1. 🛡️ 올리기 전 3줄 사전 체크 (정밀 검사는 참외가)
     ══════════════════════════════════════════════════════════ */
  const BAD_WORDS = [
    { kind: '비속어·욕설', words: ['씨발', '시발', 'ㅅㅂ', 'ㅆㅂ', '좆', '지랄', '개새끼', '병신', 'ㅂㅅ', '븅신', '미친놈', '미친년', '닥쳐', '꺼져', '엿먹', '뒤져', '썅'] },
    { kind: '성인·선정', words: ['야동', '포르노', '섹스', '자위', '성인영상', '19금', '노출신', '음란'] },
    { kind: '폭력·혐오', words: ['살해', '살인', '시체', '참수', '칼부림', '학살', '자살', '투신', '틀딱', '급식충', '한남', '한녀', '김치녀', '맘충', '짱깨', '쪽바리'] },
    { kind: '도박·대출', words: ['도박', '카지노', '바카라', '토토', '사채', '원금보장', '수익 보장', '주식 리딩'] },
    { kind: '약물·의학 단정', words: ['마약', '대마초', '필로폰', '히로뽕', '만병통치', '완치'] }
  ];

  function findWords(text, words) {
    const hits = [];
    const t = String(text || '');
    if (!t) return hits;
    words.forEach(w => { if (w && new RegExp(escRe(w), 'i').test(t)) hits.push(w); });
    return hits;
  }

  /* project/제목/설명 → 3줄 결과 [{id, ok, title, detail}] */
  UP.precheck = function (ctx) {
    const o = ctx || {};
    const p = o.project || (RS.state && RS.state.project) || {};
    const meta = p.meta || {};
    const title = String(o.title != null ? o.title : (meta.titles && (meta.titles[meta.selected] || meta.titles[0]) || '')).trim();
    const desc = String(o.desc != null ? o.desc : (meta.desc || ''));
    const tags = String(o.tags != null ? o.tags : (meta.tags || ''));
    const cues = (p.cues || []).map(c => String(c.text || '')).filter(Boolean);
    const comments = (p.cues || []).filter(c => c.comment && c.comment.text).map(c => String(c.comment.text));
    const body = cues.join(' ');
    const items = [];

    /* ① 금지어·비속어 */
    const hits = [];
    BAD_WORDS.forEach(g => {
      [['제목', title], ['설명', desc], ['태그', tags], ['대본', body], ['댓글 카드', comments.join(' ')]].forEach(f => {
        findWords(f[1], g.words).forEach(w => hits.push({ label: f[0], word: w, kind: g.kind }));
      });
    });
    items.push(hits.length
      ? {
        id: 'badword', ok: false, title: '① 금지어 · 비속어',
        detail: Array.from(new Set(hits.map(h => h.kind))).join('·') + ' ' + hits.length + '건 — ' +
          hits.slice(0, 3).map(h => h.label + ' “' + h.word + '”').join(' · ') + (hits.length > 3 ? ' 외 ' + (hits.length - 3) + '곳' : '') +
          ' (노란딱지·연령제한 사유)'
      }
      : { id: 'badword', ok: true, title: '① 금지어 · 비속어', detail: '제목·설명·태그·대본·댓글 카드에 금지어가 없습니다' });

    /* ② 저작권 위험 소재 (방송·아이돌·영화·랭킹 모음) */
    let risk = null;
    if (RS.safeFilter && RS.safeFilter.check) {
      const src = p.source || {};
      const fields = [
        ['제목', title], ['훅', [p.hook && p.hook.line1, p.hook && p.hook.line2].filter(Boolean).join(' ')],
        ['대본', body], ['원본 출처', [src.name, src.author, src.channel, src.url, src.title].filter(Boolean).join(' ')]
      ];
      for (const f of fields) {
        if (!f[1]) continue;
        const r = RS.safeFilter.check({ title: f[1], channel: '' });
        if (r) { risk = { field: f[0], kind: r.kindLabel, hit: r.hit }; break; }
      }
    }
    items.push(risk
      ? {
        id: 'copyright', ok: false, title: '② 저작권 위험 소재',
        detail: risk.kind + ' “' + risk.hit + '” 이 ' + risk.field + '에 있습니다 — 방송·아이돌·영화·랭킹 모음은 수익창출이 막힙니다. 다른 원본으로 바꾸는 게 안전합니다'
      }
      : { id: 'copyright', ok: true, title: '② 저작권 위험 소재', detail: '방송·아이돌·영화·랭킹 모음 표현이 잡히지 않았습니다' });

    /* ③ 설명란 삭제 안내 문구 */
    items.push(UP.hasSafety(desc)
      ? { id: 'callback', ok: true, title: '③ 설명란 삭제 안내', detail: '“' + SAFETY_CORE + '” 문구가 설명란에 들어 있습니다' }
      : {
        id: 'callback', ok: false, title: '③ 설명란 삭제 안내',
        detail: '“' + SAFETY_CORE + '” 한 줄이 없습니다 — 원작자가 신고하기 전에 내릴 수 있어 저작권 경고를 크게 줄입니다',
        fix: true
      });

    return { items, warn: items.filter(i => !i.ok).length, title, desc, tags };
  };

  /* ══════════════════════════════════════════════════════════
     2. 제목 추천 5안
     ══════════════════════════════════════════════════════════ */
  UP.TITLE_KINDS = ['호기심형', '숫자·충격형', '반전형', '썰형', '질문형'];

  function plain(s) { return String(s || '').replace(/[#*]/g, '').replace(/\s+/g, ' ').trim(); }
  UP.plain = plain;

  function baseKeyword(p) {
    const meta = p.meta || {};
    const t0 = plain(meta.titles && (meta.titles[meta.selected] || meta.titles[0]));
    const src = t0 || plain(p.topic) || plain(p.hook && p.hook.line1) || plain(p.cues && p.cues[0] && p.cues[0].text) || plain(p.name) || '이 장면';
    let s = src.replace(/[.!?~…]+$/g, '').trim();
    if (s.length > 22) s = s.slice(0, 21).trim();
    return s || '이 장면';
  }
  function pickNumber(p) {
    const all = [(p.meta && p.meta.titles || []).join(' '), (p.cues || []).map(c => c.text).join(' '), p.topic || ''].join(' ');
    const m = String(all).match(/(\d[\d,.]*)\s*(초|분|마리|개|명|번|배|%|억|만|천|년|일|시간)?/);
    return m ? { n: m[1], unit: m[2] || '' } : null;
  }
  UP.clampTitle = function (s) {
    let t = plain(s);
    if (t.length > 100) t = t.slice(0, 99).trim();
    return t;
  };

  UP.titlesSmart = function (p) {
    const kw = baseKeyword(p);
    const num = pickNumber(p);
    const hook2 = plain(p.hook && p.hook.line2);
    return [
      { kind: '호기심형', text: kw + ', 아무도 말해주지 않은 이유', src: 'template' },
      { kind: '숫자·충격형', text: num ? (num.n + (num.unit || '초') + ' 만에 이해되는 ' + kw) : ('딱 3초 만에 끝나는 ' + kw), src: 'template' },
      { kind: '반전형', text: kw + '인 줄 알았는데 반전이 있었습니다', src: 'template' },
      { kind: '썰형', text: (hook2 || kw) + ' — 그 뒤에 벌어진 일', src: 'template' },
      { kind: '질문형', text: kw + ', 진짜 이게 맞을까요?', src: 'template' }
    ].map(t => ({ kind: t.kind, text: UP.clampTitle(t.text), src: t.src }));
  };

  UP.titlesAI = async function (p) {
    if (!(RS.ai && RS.ai.titles5)) return { list: UP.titlesSmart(p), source: 'template' };
    const r = await RS.ai.titles5(p);
    const list = (r || []).filter(x => x && x.text).map(x => ({ kind: x.kind || '추천', text: UP.clampTitle(x.text), src: 'gemini' }));
    if (list.length < 5) {
      UP.titlesSmart(p).forEach(f => { if (list.length < 5 && !list.some(l => l.text === f.text)) list.push(f); });
    }
    return { list: list.slice(0, 5), source: 'gemini' };
  };

  /* ══════════════════════════════════════════════════════════
     3. 고퀄 커스텀 썸네일 (1080×1920)
     ══════════════════════════════════════════════════════════ */
  UP.THUMB_STYLES = [
    { id: 'docu', label: '🔥 다큐 고대비', desc: '사진 위 흰 굵은 글씨 · 노랑 포인트' },
    { id: 'dopa', label: '⚡ 도파민 레드/옐로', desc: '빨강 · 노랑 · 두꺼운 검정 테두리' },
    { id: 'card', label: '🤍 화이트 카드', desc: '흰 카드 패널 · 검정 글씨 · 빨강 포인트' }
  ];

  function wordsOf(segs) {
    const out = [];
    segs.forEach(s => {
      String(s.t || '').split(/(\s+)/).forEach(p => {
        if (!p) return;
        if (/^\s+$/.test(p)) out.push({ sp: true });
        else out.push({ t: p, em: !!s.em, ul: !!s.ul });
      });
    });
    return out;
  }

  function layout(ctx, segs, maxW, fs, weight, family) {
    ctx.font = weight + ' ' + fs + 'px ' + family;
    const words = wordsOf(segs);
    const sp = ctx.measureText(' ').width;
    const lines = [];
    let cur = { items: [], w: 0 };
    const flush = () => { if (cur.items.length) { lines.push(cur); cur = { items: [], w: 0 }; } };
    words.forEach(w => {
      if (w.sp) return;
      const ww = ctx.measureText(w.t).width;
      if (ww > maxW) {
        flush();
        let chunk = '', cw = 0;
        for (const ch of w.t) {
          const cwid = ctx.measureText(ch).width;
          if (cw + cwid > maxW) { lines.push({ items: [{ text: chunk, em: w.em, ul: w.ul }], w: cw }); chunk = ''; cw = 0; }
          chunk += ch; cw += cwid;
        }
        if (chunk) cur = { items: [{ text: chunk, em: w.em, ul: w.ul }], w: cw };
        return;
      }
      const add = (cur.items.length ? sp : 0) + ww;
      if (cur.w + add > maxW) flush();
      cur.items.push({ text: w.t, em: w.em, ul: w.ul });
      cur.w += (cur.items.length > 1 ? sp : 0) + ww;
    });
    flush();
    return { lines, sp };
  }

  function fitLines(ctx, text, maxW, startFs, weight, family, maxLines) {
    let fs = startFs;
    let r = layout(ctx, RS.util.rich(String(text || ''), false), maxW, fs, weight, family);
    let guard = 0;
    while (guard++ < 24) {
      const tooMany = r.lines.length > maxLines;
      const last = r.lines[maxLines - 1];
      const orphan = r.lines.length === maxLines && last && last.w < maxW * 0.24;
      if (!tooMany && !orphan) break;
      fs = Math.round(fs * 0.94);
      if (fs < 54) break;
      r = layout(ctx, RS.util.rich(String(text || ''), false), maxW, fs, weight, family);
    }
    return { fs, lines: r.lines.slice(0, maxLines), sp: r.sp };
  }

  function drawRich(ctx, line, x, y, fs, weight, family, col, accent, sp, opts) {
    const o = opts || {};
    ctx.font = weight + ' ' + fs + 'px ' + family;
    ctx.textBaseline = 'middle';
    let cx = x;
    line.items.forEach((it, i) => {
      if (i > 0) cx += sp;
      const w = ctx.measureText(it.text).width;
      if (o.hardShadow) {
        ctx.fillStyle = o.hardShadowColor || 'rgba(0,0,0,.55)';
        ctx.fillText(it.text, cx + (o.hardShadowDx || 6), y + (o.hardShadowDy || 8));
      }
      if (o.stroke) {
        ctx.lineJoin = 'round'; ctx.miterLimit = 2;
        ctx.lineWidth = o.stroke; ctx.strokeStyle = o.strokeColor || '#000';
        ctx.strokeText(it.text, cx, y);
      }
      ctx.fillStyle = (it.em || it.ul) ? accent : col;
      ctx.fillText(it.text, cx, y);
      cx += w;
    });
    return cx;
  }

  function coverDraw(ctx, W, H, img, zoom) {
    if (img && (img.naturalWidth || img.width)) {
      const iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
      const sc = Math.max(W / iw, H / ih) * (zoom || 1);
      ctx.drawImage(img, (W - iw * sc) / 2, (H - ih * sc) / 2, iw * sc, ih * sc);
      return true;
    }
    return false;
  }

  function rr(ctx, x, y, w, h, r) {
    const rad = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rad, y);
    ctx.arcTo(x + w, y, x + w, y + h, rad);
    ctx.arcTo(x + w, y + h, x, y + h, rad);
    ctx.arcTo(x, y + h, x, y, rad);
    ctx.arcTo(x, y, x + w, y, rad);
    ctx.closePath();
  }

  function backdrop(ctx, W, H, img, sample, t, zoom) {
    let drew = coverDraw(ctx, W, H, img, zoom);
    if (!drew && RS.render && RS.render.drawSample) {
      try { RS.render.drawSample(ctx, W, H, sample || 'docu', t || 0); drew = true; } catch (e) { drew = false; }
    }
    if (!drew) {
      const g = ctx.createLinearGradient(0, 0, W * 0.4, H);
      g.addColorStop(0, '#1b2340'); g.addColorStop(1, '#0a0c14');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    }
    ctx.save();
    ctx.globalCompositeOperation = 'overlay';
    ctx.fillStyle = 'rgba(255,255,255,.07)';
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }

  function vignette(ctx, W, H, strength) {
    const g = ctx.createRadialGradient(W / 2, H * 0.46, W * 0.2, W / 2, H * 0.46, W * 1.05);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,' + (strength == null ? 0.62 : strength) + ')');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }

  function drawBadge(ctx, x, y, text, bg, fg, size) {
    const fs = size || 38;
    ctx.font = '900 ' + fs + 'px ' + FONT_UI;
    const w = ctx.measureText(text).width + fs * 1.5;
    const h = fs * 1.9;
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,.4)'; ctx.shadowBlur = 18; ctx.shadowOffsetY = 6;
    ctx.fillStyle = bg;
    rr(ctx, x, y, w, h, h * 0.28); ctx.fill();
    ctx.restore();
    ctx.fillStyle = fg;
    ctx.textBaseline = 'middle';
    ctx.font = '900 ' + fs + 'px ' + FONT_UI;
    ctx.fillText(text, x + fs * 0.75, y + h / 2 + 1);
    return { w, h };
  }

  UP.drawThumb = function (canvas, o) {
    const opt = o || {};
    const W = 1080, H = 1920;
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, W, H);
    const style = opt.style || 'docu';
    const text = String(opt.text || '').trim() || '제목을 넣으세요';
    const sub = String(opt.sub || '').trim();
    const badge = String(opt.badge || '').trim();
    backdrop(ctx, W, H, opt.img || null, opt.sample || 'docu', opt.t || 0, opt.zoom || 1.02);
    if (style === 'dopa') drawDopa(ctx, W, H, text, sub, badge);
    else if (style === 'card') drawCard(ctx, W, H, text, sub, badge);
    else drawDocu(ctx, W, H, text, sub, badge);
    return canvas;
  };

  function drawDocu(ctx, W, H, text, sub, badge) {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, 'rgba(0,0,0,.55)');
    g.addColorStop(.30, 'rgba(0,0,0,.10)');
    g.addColorStop(.52, 'rgba(0,0,0,.36)');
    g.addColorStop(.78, 'rgba(0,0,0,.86)');
    g.addColorStop(1, 'rgba(0,0,0,.96)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    vignette(ctx, W, H, .5);
    if (badge) drawBadge(ctx, 56, 64, badge, '#FFD400', '#0B0D12');

    const maxW = W * 0.88;
    const fit = fitLines(ctx, text, maxW, 158, 900, FONT_DISPLAY, 3);
    const lh = fit.fs * 1.06;
    const blockH = fit.lines.length * lh;
    let y = (H - 250) - blockH + lh / 2;

    ctx.fillStyle = '#FFD400';
    ctx.fillRect(56, y - lh / 2 - 26, Math.min(fit.lines[0] ? fit.lines[0].w : 0, maxW), 12);

    if (sub) {
      ctx.font = '800 46px ' + FONT_UI;
      ctx.fillStyle = 'rgba(255,255,255,.72)';
      ctx.textBaseline = 'alphabetic';
      const subY = y - lh / 2 - 66;
      if (subY > 200) ctx.fillText(sub.slice(0, 30), 60, subY);
    }

    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,.65)'; ctx.shadowBlur = 26; ctx.shadowOffsetY = 10;
    fit.lines.forEach((l, i) => {
      drawRich(ctx, l, 56, y + i * lh, fit.fs, 900, FONT_DISPLAY, '#FFFFFF', '#FFD400', fit.sp,
        { stroke: Math.max(10, fit.fs * 0.10), strokeColor: 'rgba(0,0,0,.95)' });
    });
    ctx.restore();
  }

  function drawDopa(ctx, W, H, text, sub, badge) {
    const rg = ctx.createRadialGradient(W * 0.5, H * 0.72, W * 0.1, W * 0.5, H * 0.72, W * 0.95);
    rg.addColorStop(0, 'rgba(255,60,0,.55)');
    rg.addColorStop(.55, 'rgba(150,0,0,.35)');
    rg.addColorStop(1, 'rgba(0,0,0,.92)');
    ctx.fillStyle = rg; ctx.fillRect(0, 0, W, H);
    vignette(ctx, W, H, .55);

    ctx.save();
    ctx.translate(W / 2, H * 0.80);
    ctx.rotate(-0.06);
    ctx.fillStyle = 'rgba(0,0,0,.82)';
    ctx.fillRect(-W, -430, W * 2, 860);
    ctx.restore();

    if (badge) drawBadge(ctx, 56, 64, badge, '#FF2D20', '#FFFFFF');

    if (sub) {
      ctx.font = '900 50px ' + FONT_UI;
      ctx.fillStyle = '#FFFFFF';
      ctx.textBaseline = 'alphabetic';
      ctx.fillText(sub.slice(0, 26), 60, H * 0.80 - 470);
    }

    const maxW = W * 0.90;
    const fit = fitLines(ctx, text, maxW, 168, 900, FONT_DISPLAY, 3);
    const lh = fit.fs * 1.04;
    const blockH = fit.lines.length * lh;
    const cy = H * 0.80;
    const y = cy - blockH / 2 + lh / 2;

    fit.lines.forEach((l, i) => {
      const x = (W - l.w) / 2;
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,.55)'; ctx.shadowBlur = 20; ctx.shadowOffsetY = 8;
      drawRich(ctx, l, x, y + i * lh, fit.fs, 900, FONT_DISPLAY, '#FFE600', '#FFFFFF', fit.sp,
        { stroke: Math.max(12, fit.fs * 0.11), strokeColor: '#0B0D12', hardShadow: true, hardShadowDx: 7, hardShadowDy: 9 });
      ctx.restore();
    });

    ctx.fillStyle = '#FFE600';
    ctx.beginPath(); ctx.moveTo(28, cy - 40); ctx.lineTo(28, cy + 40); ctx.lineTo(70, cy); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(W - 28, cy - 40); ctx.lineTo(W - 28, cy + 40); ctx.lineTo(W - 70, cy); ctx.closePath(); ctx.fill();
  }

  function drawCard(ctx, W, H, text, sub, badge) {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, 'rgba(0,0,0,.28)');
    g.addColorStop(.45, 'rgba(0,0,0,.05)');
    g.addColorStop(.62, 'rgba(0,0,0,.20)');
    g.addColorStop(1, 'rgba(0,0,0,.55)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    vignette(ctx, W, H, .38);
    if (badge) drawBadge(ctx, 56, 64, badge, 'rgba(15,17,22,.88)', '#FFFFFF');

    const padX = 64;
    const cardX = 56, cardW = W - 112;
    const maxW = cardW - padX * 2;
    const fit = fitLines(ctx, text, maxW, 128, 900, FONT_UI, 3);
    const lh = fit.fs * 1.14;
    const innerH = fit.lines.length * lh;
    const chipH = 62;
    const cardH = innerH + chipH + 156;
    const cardY = H - 200 - cardH;

    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,.5)'; ctx.shadowBlur = 40; ctx.shadowOffsetY = 16;
    ctx.fillStyle = '#FFFFFF';
    rr(ctx, cardX, cardY, cardW, cardH, 44); ctx.fill();
    ctx.restore();

    const chipText = 'SHORTS';
    ctx.font = '900 34px ' + FONT_UI;
    const cw = ctx.measureText(chipText).width + 46;
    ctx.fillStyle = '#E5322D';
    rr(ctx, cardX + padX, cardY + 44, cw, chipH, 10); ctx.fill();
    ctx.fillStyle = '#FFFFFF';
    ctx.textBaseline = 'middle';
    ctx.fillText(chipText, cardX + padX + 23, cardY + 44 + chipH / 2 + 1);

    const ty = cardY + 44 + chipH + 52 + lh / 2;
    fit.lines.forEach((l, i) => {
      drawRich(ctx, l, cardX + padX, ty + i * lh, fit.fs, 900, FONT_UI, '#0B0D12', '#E5322D', fit.sp, {});
    });

    if (sub) {
      ctx.font = '800 38px ' + FONT_UI;
      ctx.fillStyle = 'rgba(11,13,18,.55)';
      ctx.textBaseline = 'middle';
      const sy = ty + innerH + 34;
      if (sy < cardY + cardH - 24) ctx.fillText(sub.slice(0, 34), cardX + padX, sy);
    }
  }

  /* 업로드 사진 → 현재 영상 프레임 → 샘플 순서로 배경을 고릅니다 */
  UP.frameSource = function (t) {
    return new Promise(resolve => {
      const st = RS.state || {};
      const media = st.media || {};
      const img = media.thumbImg;
      if (img && (img.complete || img.naturalWidth)) { resolve(img); return; }
      const v = media.video;
      if (v && v.readyState >= 2 && v.videoWidth) {
        const target = clamp(typeof t === 'number' ? t : ((st.player && st.player.t) || 0), 0, Math.max(0, (v.duration || 1) - 0.15));
        const shoot = () => {
          try {
            const c = document.createElement('canvas');
            c.width = v.videoWidth; c.height = v.videoHeight;
            c.getContext('2d').drawImage(v, 0, 0);
            resolve(c);
          } catch (e) { resolve(null); }
        };
        if (Math.abs((v.currentTime || 0) - target) < 0.05) { shoot(); return; }
        const done = () => { v.removeEventListener('seeked', done); shoot(); };
        v.addEventListener('seeked', done);
        try { v.currentTime = target; } catch (e) { v.removeEventListener('seeked', done); shoot(); }
        setTimeout(() => { v.removeEventListener('seeked', done); shoot(); }, 700);
        return;
      }
      resolve(null);
    });
  };

  UP.thumbBlob = function (canvas) {
    return new Promise(res => { try { canvas.toBlob(b => res(b), 'image/png'); } catch (e) { res(null); } });
  };

  /* ── 설정 저장(이 브라우저) ─────────────────────────────── */
  const PKEY = 'reelstudio.uploadpro.v1';
  UP.prefs = (function () {
    try { return JSON.parse(localStorage.getItem(PKEY) || '{}') || {}; } catch (e) { return {}; }
  })();
  UP.savePrefs = function (patch) {
    Object.assign(UP.prefs, patch || {});
    try { localStorage.setItem(PKEY, JSON.stringify(UP.prefs)); } catch (e) {}
    return UP.prefs;
  };

  UP.ready = function () {
    if (!document.fonts || !document.fonts.load) return Promise.resolve();
    return Promise.all([
      document.fonts.load('900 100px "Black Han Sans"'),
      document.fonts.load('900 100px "Gothic A1"'),
      document.fonts.load('900 100px "Noto Sans KR"')
    ]).catch(() => {});
  };
})();
