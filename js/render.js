/* REEL STUDIO — render: canvas pipeline for stage, export, thumbnail */
(function () {
  'use strict';
  const RS = window.RS;
  const U = RS.util;
  const R = RS.render = {};

  R.baseW = 1080;
  R.hFor = ratio => ratio === '16:9' ? 607.5 : 1920;

  /* ── deterministic pseudo random ────────────────────── */
  const rnd = n => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };

  /* ── noise tile ─────────────────────────────────────── */
  let grainTile = null;
  function grain() {
    if (grainTile) return grainTile;
    const c = document.createElement('canvas'); c.width = c.height = 160;
    const g = c.getContext('2d');
    const img = g.createImageData(160, 160);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = 120 + Math.random() * 135;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = 22;
    }
    g.putImageData(img, 0, 0);
    grainTile = c;
    return c;
  }

  /* ── sample visual sources ──────────────────────────── */
  function sampleDocu(ctx, W, H, t) {
    const g = ctx.createLinearGradient(0, 0, W * 0.3, H);
    g.addColorStop(0, '#111722'); g.addColorStop(.5, '#0A0D13'); g.addColorStop(1, '#05060A');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

    const bx = W * (0.5 + Math.sin(t * 0.18) * 0.06), by = H * 0.34;
    const beam = ctx.createRadialGradient(bx, by, 8, bx, by, W * 0.85);
    beam.addColorStop(0, 'rgba(92,140,180,.24)');
    beam.addColorStop(.5, 'rgba(40,70,110,.10)');
    beam.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = beam; ctx.fillRect(0, 0, W, H);

    // perspective grid
    const horizon = H * 0.60;
    ctx.save();
    ctx.strokeStyle = 'rgba(150,185,215,.075)'; ctx.lineWidth = 1.1;
    for (let i = -10; i <= 10; i++) {
      ctx.beginPath(); ctx.moveTo(W / 2 + i * W * 0.055, horizon);
      ctx.lineTo(W / 2 + i * W * 0.46, H * 1.05); ctx.stroke();
    }
    for (let k = 1; k <= 12; k++) {
      const y = horizon + Math.pow(k / 12, 2.1) * (H * 0.46);
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    }
    ctx.restore();

    // rising data bars
    ctx.save();
    for (let i = 0; i < 26; i++) {
      const x = (i / 26) * W + 12;
      const seed = rnd(i * 3.7);
      const hh = (0.03 + seed * 0.1) * H * (0.7 + 0.3 * Math.sin(t * 0.8 + i));
      const y = H * 0.72 - hh;
      ctx.fillStyle = i % 7 === 0 ? 'rgba(216,255,62,.16)' : 'rgba(190,215,235,.055)';
      ctx.fillRect(x, y, W * 0.022, hh);
    }
    ctx.restore();

    // floating dust
    ctx.save();
    for (let i = 0; i < 40; i++) {
      const x = (rnd(i) * W + t * (6 + rnd(i + 9) * 12)) % W;
      const y = (rnd(i + 3) * H - t * (4 + rnd(i) * 9) + H) % H;
      const r = 0.8 + rnd(i + 7) * 2.2;
      ctx.fillStyle = 'rgba(210,225,240,' + (0.05 + rnd(i + 5) * 0.14) + ')';
      ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
    }
    ctx.restore();

    // top/bottom shade
    const sh = ctx.createLinearGradient(0, 0, 0, H);
    sh.addColorStop(0, 'rgba(0,0,0,.42)'); sh.addColorStop(.28, 'rgba(0,0,0,0)');
    sh.addColorStop(.72, 'rgba(0,0,0,0)'); sh.addColorStop(1, 'rgba(0,0,0,.55)');
    ctx.fillStyle = sh; ctx.fillRect(0, 0, W, H);
  }

  function sampleChart(ctx, W, H, t) {
    ctx.fillStyle = '#0B0D12'; ctx.fillRect(0, 0, W, H);
    const gl = ctx.createLinearGradient(0, 0, 0, H * 0.7);
    gl.addColorStop(0, 'rgba(20,40,60,.55)'); gl.addColorStop(1, 'rgba(11,13,18,0)');
    ctx.fillStyle = gl; ctx.fillRect(0, 0, W, H * 0.7);

    const pad = W * 0.11, top = H * 0.30, bot = H * 0.70, w = W - pad * 2, h = bot - top;
    ctx.strokeStyle = 'rgba(255,255,255,.06)'; ctx.lineWidth = 1;
    for (let i = 0; i <= 5; i++) {
      const y = top + (h / 5) * i;
      ctx.beginPath(); ctx.moveTo(pad, y); ctx.lineTo(pad + w, y); ctx.stroke();
    }

    const prog = 0.55 + 0.45 * Math.sin(t * 0.22);
    const N = 60;
    const pts = [];
    for (let i = 0; i <= N; i++) {
      const x = pad + (w * i) / N;
      const n = Math.sin(i * 0.42 + t * 0.6) * 0.5 + Math.sin(i * 0.13 - t * 0.35) * 0.34 + Math.sin(i * 1.7) * 0.06;
      const y = top + h * (0.52 - n * 0.27 - (i / N) * 0.08);
      pts.push([x, y]);
    }
    // area
    const ag = ctx.createLinearGradient(0, top, 0, bot);
    ag.addColorStop(0, 'rgba(216,255,62,.22)'); ag.addColorStop(1, 'rgba(216,255,62,0)');
    ctx.beginPath(); ctx.moveTo(pts[0][0], bot);
    pts.forEach(p => ctx.lineTo(p[0], p[1]));
    ctx.lineTo(pts[pts.length - 1][0], bot); ctx.closePath();
    ctx.fillStyle = ag; ctx.fill();

    // line
    ctx.save();
    ctx.strokeStyle = '#D8FF3E'; ctx.lineWidth = 5; ctx.lineJoin = 'round'; ctx.shadowColor = 'rgba(216,255,62,.55)'; ctx.shadowBlur = 18;
    ctx.beginPath(); pts.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])); ctx.stroke();
    ctx.restore();

    // head dot
    const hp = pts[Math.floor(prog * N)];
    ctx.fillStyle = '#D8FF3E'; ctx.beginPath(); ctx.arc(hp[0], hp[1], 8, 0, 7); ctx.fill();
    ctx.fillStyle = 'rgba(216,255,62,.25)'; ctx.beginPath(); ctx.arc(hp[0], hp[1], 22, 0, 7); ctx.fill();

    // counter
    const val = 4697 - Math.floor((Math.sin(t * 0.35) * 0.5 + 0.5) * 120);
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = 'rgba(210,220,235,.55)';
    ctx.font = '700 30px "Apple SD Gothic Neo","Malgun Gothic","Noto Sans KR",sans-serif';
    ctx.fillText('KOSPI', pad, top - 42);
    ctx.fillStyle = '#F2F3F5';
    ctx.font = '900 92px "Apple SD Gothic Neo","Malgun Gothic","Noto Sans KR",sans-serif';
    ctx.fillText(val.toLocaleString('ko-KR'), pad, top - 70);

    const rows = ['반도체 -3.4%', '외국인 -1.2조', '개인 +8,400억'];
    ctx.font = '700 26px "Apple SD Gothic Neo","Malgun Gothic","Noto Sans KR",sans-serif';
    rows.forEach((r, i) => {
      const y = bot + 46 + i * 40;
      ctx.fillStyle = i === 2 ? '#D8FF3E' : 'rgba(255,255,255,.42)';
      ctx.fillText(r, pad, y);
    });

    // vignette
    const v = ctx.createRadialGradient(W / 2, H / 2, H * 0.2, W / 2, H / 2, H * 0.75);
    v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,.55)');
    ctx.fillStyle = v; ctx.fillRect(0, 0, W, H);
  }

  function sampleNeon(ctx, W, H, t) {
    const g = ctx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, '#120A2A'); g.addColorStop(.5, '#0A0718'); g.addColorStop(1, '#05030C');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

    for (let i = 0; i < 3; i++) {
      const y = H * (0.22 + i * 0.22) + Math.sin(t * 0.5 + i) * 30;
      const lg = ctx.createLinearGradient(0, y, W, y + 120);
      const col = i === 0 ? '88,120,255' : i === 1 ? '255,64,160' : '64,232,255';
      lg.addColorStop(0, 'rgba(' + col + ',0)');
      lg.addColorStop(.5, 'rgba(' + col + ',.20)');
      lg.addColorStop(1, 'rgba(' + col + ',0)');
      ctx.fillStyle = lg; ctx.fillRect(0, y - 40, W, 100);
    }

    for (let i = 0; i < 16; i++) {
      const x = (rnd(i * 2.1) * W + t * (18 + rnd(i) * 30)) % (W + 200) - 100;
      const y = rnd(i + 4) * H;
      const r = 12 + rnd(i + 2) * 54;
      const cg = ctx.createRadialGradient(x, y, 0, x, y, r);
      cg.addColorStop(0, 'rgba(140,110,255,' + (0.10 + rnd(i) * 0.14) + ')');
      cg.addColorStop(1, 'rgba(140,110,255,0)');
      ctx.fillStyle = cg; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
    }

    ctx.save();
    ctx.strokeStyle = 'rgba(255,80,180,.10)'; ctx.lineWidth = 1;
    for (let y = 0; y < H; y += 4) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
    ctx.restore();

    // floor grid
    const horizon = H * 0.66;
    ctx.strokeStyle = 'rgba(80,200,255,.16)'; ctx.lineWidth = 1.4;
    for (let i = -12; i <= 12; i++) {
      ctx.beginPath(); ctx.moveTo(W / 2 + i * 12, horizon); ctx.lineTo(W / 2 + i * W * 0.5, H * 1.1); ctx.stroke();
    }
    for (let k = 1; k <= 14; k++) {
      const y = horizon + Math.pow(k / 14, 2.4) * H * 0.5;
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    }
    const v = ctx.createRadialGradient(W / 2, H * 0.5, H * 0.1, W / 2, H * 0.55, H * 0.8);
    v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,.62)');
    ctx.fillStyle = v; ctx.fillRect(0, 0, W, H);
  }

  function samplePaper(ctx, W, H, t) {
    ctx.fillStyle = '#EDE4D3'; ctx.fillRect(0, 0, W, H);
    const g = ctx.createRadialGradient(W * 0.35, H * 0.3, 20, W * 0.5, H * 0.5, H * 0.8);
    g.addColorStop(0, 'rgba(255,252,244,.9)'); g.addColorStop(1, 'rgba(206,192,170,.55)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

    // fibers
    ctx.save();
    for (let i = 0; i < 260; i++) {
      const x = rnd(i) * W, y = rnd(i + 11) * H;
      const len = 6 + rnd(i + 2) * 26, ang = rnd(i + 5) * Math.PI;
      ctx.strokeStyle = 'rgba(120,104,82,' + (0.03 + rnd(i + 3) * 0.07) + ')';
      ctx.lineWidth = 0.8 + rnd(i + 7);
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(ang) * len, y + Math.sin(ang) * len); ctx.stroke();
    }
    ctx.restore();

    // big soft ink circle
    const cx = W * (0.5 + Math.sin(t * 0.12) * 0.03), cy = H * 0.42;
    const ig = ctx.createRadialGradient(cx, cy, 10, cx, cy, W * 0.42);
    ig.addColorStop(0, 'rgba(35,30,26,.16)'); ig.addColorStop(.7, 'rgba(35,30,26,.06)'); ig.addColorStop(1, 'rgba(35,30,26,0)');
    ctx.fillStyle = ig; ctx.beginPath(); ctx.arc(cx, cy, W * 0.42, 0, 7); ctx.fill();

    // dust in light
    for (let i = 0; i < 26; i++) {
      const x = (rnd(i * 1.7) * W + t * 8) % W;
      const y = (rnd(i + 4) * H - t * 6 + H) % H;
      ctx.fillStyle = 'rgba(90,78,60,.16)';
      ctx.beginPath(); ctx.arc(x, y, 1 + rnd(i) * 2, 0, 7); ctx.fill();
    }
    const v = ctx.createRadialGradient(W / 2, H / 2, H * 0.25, W / 2, H / 2, H * 0.8);
    v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(60,48,32,.38)');
    ctx.fillStyle = v; ctx.fillRect(0, 0, W, H);
  }

  R.drawSample = function (ctx, W, H, id, t) {
    if (id === 'chart') sampleChart(ctx, W, H, t);
    else if (id === 'neon') sampleNeon(ctx, W, H, t);
    else if (id === 'paper') samplePaper(ctx, W, H, t);
    else sampleDocu(ctx, W, H, t);
  };

  /* ── text helpers ───────────────────────────────────── */
  function fontOf(size, weight, family) { return weight + ' ' + Math.round(size) + 'px ' + (family || '"Apple SD Gothic Neo","Malgun Gothic","Noto Sans KR",sans-serif'); }

  function richWords(segs) {
    const out = [];
    segs.forEach(s => {
      const parts = String(s.t).split(/(\s+)/);
      parts.forEach(p => {
        if (!p) return;
        if (/^\s+$/.test(p)) { if (out.length) out[out.length - 1].spaceAfter = true; return; }
        out.push({ text: p, em: s.em, ul: s.ul, num: s.num, spaceAfter: false });
      });
    });
    return out;
  }

  function layoutLines(ctx, segs, maxW, size, weight, family) {
    ctx.font = fontOf(size, weight, family);
    const words = richWords(segs);
    const spaceW = ctx.measureText(' ').width;
    const lines = [];
    let cur = { items: [], w: 0 };
    const flush = () => { if (cur.items.length) { lines.push(cur); cur = { items: [], w: 0 }; } };
    words.forEach(w => {
      const ww = ctx.measureText(w.text).width;
      if (ww > maxW) { // hard break long token
        flush();
        let chunk = '', cw = 0;
        for (const ch of w.text) {
          const cwid = ctx.measureText(ch).width;
          if (cw + cwid > maxW) { lines.push({ items: [{ text: chunk, em: w.em, ul: w.ul, num: w.num }], w: cw }); chunk = ''; cw = 0; }
          chunk += ch; cw += cwid;
        }
        if (chunk) { cur = { items: [{ text: chunk, em: w.em, ul: w.ul, num: w.num }], w: cw }; }
        return;
      }
      const add = (cur.items.length ? spaceW : 0) + ww;
      if (cur.w + add > maxW) flush();
      cur.items.push({ text: w.text, em: w.em, ul: w.ul, num: w.num });
      cur.w += (cur.items.length > 1 ? spaceW : 0) + ww;
      cur._space = spaceW;
    });
    flush();
    return lines;
  }

  function drawRichLine(ctx, line, x, y, size, weight, family, color, accent, spaceW) {
    ctx.font = fontOf(size, weight, family);
    let cx = x;
    line.items.forEach((it, i) => {
      if (i > 0) cx += spaceW;
      ctx.fillStyle = it.em ? accent : color;
      ctx.fillText(it.text, cx, y);
      const w = ctx.measureText(it.text).width;
      if (it.ul) {
        ctx.fillStyle = accent;
        ctx.fillRect(cx, y + size * 0.08, w, Math.max(3, size * 0.07));
      }
      cx += w;
    });
  }

  function roundRect(ctx, x, y, w, h, r) {
    r = Math.min(r || 0, w / 2, h / 2);
    ctx.beginPath();
    if (r <= 0.5) { ctx.rect(x, y, w, h); return; }
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  /* ── hook ───────────────────────────────────────────── */
  function drawHook(ctx, W, H, p, k) {
    const hk = p.hook || {};
    if (!hk.on || (!hk.line1 && !hk.line2)) return;
    const size = (hk.size || 54) * k;
    const family = hk.font || '"Apple SD Gothic Neo","Malgun Gothic","Noto Sans KR",sans-serif';
    const maxW = W * 0.86;
    const lines = [];
    const l1 = layoutLines(ctx, U.rich(hk.line1, false), maxW, size, 900, family)[0];
    if (l1) lines.push(l1);
    if (hk.line2) layoutLines(ctx, U.rich(hk.line2, false), maxW, size, 900, family).slice(0, 2).forEach(l => lines.push(l));
    if (!lines.length) return;

    const lh = size * 1.26;
    const textH = lines.length * lh;
    const style = hk.style || 'band';

    if (style === 'band') {
      const bandH = Math.max(H * 0.081, textH + H * 0.028);
      ctx.fillStyle = hk.bg || '#000';
      ctx.fillRect(0, 0, W, bandH);
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const startY = bandH / 2 - textH / 2 + lh / 2;
      lines.forEach((l, i) => {
        const y = startY + i * lh;
        let cx = (W - l.w) / 2;
        ctx.font = fontOf(size * (i === 0 ? 1 : 0.9), 900, family);
        const sp = ctx.measureText(' ').width;
        l.items.forEach((it, j) => {
          if (j > 0) cx += sp;
          ctx.fillStyle = i === 0 ? (hk.color || '#fff') : (hk.accent || '#fff');
          ctx.fillText(it.text, cx, y);
          cx += ctx.measureText(it.text).width;
        });
      });
      ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
      return;
    }

    if (style === 'card') {
      const padX = W * 0.038, padY = H * 0.014;
      const boxW = Math.min(maxW + padX * 2, Math.max(...lines.map(l => l.w)) + padX * 2);
      const boxH = textH + padY * 2;
      const x = (W - boxW) / 2, y = H * 0.052;
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,.35)'; ctx.shadowBlur = 18; ctx.shadowOffsetY = 6;
      ctx.fillStyle = hk.bg || '#fff';
      roundRect(ctx, x, y, boxW, boxH, 26 * k); ctx.fill();
      ctx.restore();
      ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      const sp = (ctx.font = fontOf(size, 900, family), ctx.measureText(' ').width);
      lines.forEach((l, i) => {
        const ly = y + padY + lh / 2 + i * lh;
        drawRichLine(ctx, l, x + padX, ly, size, 900, family, hk.color || '#0A0A0A', hk.accent || '#0A0A0A', sp);
      });
      ctx.textBaseline = 'alphabetic';
      return;
    }

    // plain
    const y0 = H * (hk.band ? hk.band * 0.5 : 0.075);
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,.78)'; ctx.shadowBlur = 22; ctx.shadowOffsetY = 4;
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.font = fontOf(size, 900, family);
    const sp = ctx.measureText(' ').width;
    lines.forEach((l, i) => {
      const ly = y0 + (i - (lines.length - 1) / 2) * lh + lh / 2;
      const lx = (W - l.w) / 2;
      ctx.fillStyle = i === 0 ? (hk.color || '#fff') : (hk.accent || '#D8FF3E');
      ctx.fillText(l.items.map(x => x.text).join(' '), lx, ly + 2);
      if (i === lines.length - 1) {
        ctx.shadowBlur = 0;
        ctx.fillStyle = hk.accent || '#D8FF3E';
        ctx.fillRect((W - Math.min(l.w * 0.5, W * 0.3)) / 2, ly + size * 0.66, Math.min(l.w * 0.5, W * 0.3), Math.max(4, size * 0.075));
      }
    });
    ctx.restore();
    ctx.textBaseline = 'alphabetic';
  }

  /* ── subtitle ───────────────────────────────────────── */
  function drawSub(ctx, W, H, p, cue, t, k) {
    if (!p.sub || p.sub.on === false || !cue) return;
    const size = (p.sub.fontSize || 62) * k;
    const family = p.sub.font || '"Apple SD Gothic Neo","Malgun Gothic","Noto Sans KR",sans-serif';
    const weight = p.sub.weight || 900;
    const maxW = W * 0.84;
    let fs = size;
    let lines = layoutLines(ctx, U.rich(cue.text, p.sub.autoNumber), maxW, size, weight, family);
    if (lines.length > 3) {
      fs = size * 0.86;
      lines = layoutLines(ctx, U.rich(cue.text, p.sub.autoNumber), maxW, fs, weight, family);
      if (lines.length > 3) lines = lines.slice(0, 3);
    }
    const lh = fs * 1.24;
    const padX = fs * 0.42, padY = fs * 0.30;
    const boxW = Math.max(...lines.map(l => l.w)) + padX * 2;
    const boxH = lines.length * lh + padY * 2;
    const cx = W / 2;
    const cy = H * (p.sub.pos || 0.78);

    // intro animation
    const playing = !!(RS.state && RS.state.player && RS.state.player.playing);
    const into = playing ? U.clamp((t - cue.start) / 0.18, 0, 1) : 1;
    const ease = 1 - Math.pow(1 - into, 3);
    ctx.save();
    ctx.globalAlpha = 0.15 + 0.85 * ease;
    const yy = cy + (1 - ease) * fs * 0.35;

    if (p.sub.box) {
      ctx.fillStyle = p.sub.boxColor || 'rgba(0,0,0,.7)';
      roundRect(ctx, cx - boxW / 2, yy - boxH / 2, boxW, boxH, p.sub.radius || 0);
      ctx.fill();
    }
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.font = fontOf(fs, weight, family);
    const sp = ctx.measureText(' ').width;
    lines.forEach((l, i) => {
      const ly = yy - boxH / 2 + padY + lh / 2 + i * lh;
      let lx = cx - l.w / 2;
      if (!p.sub.box) {
        ctx.save();
        ctx.shadowColor = 'rgba(0,0,0,.85)'; ctx.shadowBlur = 14; ctx.shadowOffsetY = 3;
        drawRichLine(ctx, l, lx, ly, fs, weight, family, '#FFFFFF', p.sub.accent || '#D8FF3E', sp);
        ctx.restore();
      } else {
        drawRichLine(ctx, l, lx, ly, fs, weight, family, '#FFFFFF', p.sub.accent || '#D8FF3E', sp);
      }
    });
    ctx.restore();
    ctx.textBaseline = 'alphabetic';
  }

  /* ── comment card ───────────────────────────────────── */
  function drawComment(ctx, W, H, p, cue, t, k) {
    if (!p.card || !p.card.on || !cue || !cue.comment || !cue.comment.on || !cue.comment.text) return;
    const playing = !!(RS.state && RS.state.player && RS.state.player.playing);
    const into = playing ? U.clamp((t - cue.start - 0.1) / 0.22, 0, 1) : 1;
    if (into <= 0) return;
    const ease = 1 - Math.pow(1 - into, 3);
    const fs = 30 * k;
    const family = '"Apple SD Gothic Neo","Malgun Gothic","Noto Sans KR",sans-serif';
    const maxW = W * 0.74;
    const lines = layoutLines(ctx, U.rich(cue.comment.text, false), maxW, fs, 700, family).slice(0, 3);
    const lh = fs * 1.35;
    const av = fs * 2.1;
    const padX = fs * 0.62, padY = fs * 0.55;
    const name = cue.comment.name || p.card.name || '시청자';
    const boxW = Math.min(W * 0.84, Math.max(...lines.map(l => l.w)) + av + padX * 2.4);
    const boxH = Math.max(av, lines.length * lh) + padY * 2;
    const x = W * (p.card.x == null ? 0.06 : p.card.x);
    const y = H * (p.card.y == null ? 0.60 : p.card.y) + (1 - ease) * 24 * k;

    ctx.save();
    ctx.globalAlpha = ease;
    ctx.fillStyle = p.card.bg || 'rgba(15,17,22,.88)';
    roundRect(ctx, x, y, boxW, boxH, p.card.style === 'bubble' ? (p.card.radius || 16) * k : (p.card.radius || 0));
    ctx.fill();

    // avatar
    const ax = x + padX * 0.9, ay = y + boxH / 2;
    const hue = Math.floor(rnd(name.length * 7.3 + name.charCodeAt(0)) * 360);
    ctx.fillStyle = 'hsl(' + hue + ',58%,52%)';
    ctx.beginPath(); ctx.arc(ax + av / 2, ay, av / 2, 0, 7); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = fontOf(av * 0.44, 800, family);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(name.slice(0, 1), ax + av / 2, ay + 1);

    const tx = ax + av + padX * 0.7;
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.font = fontOf(fs * 0.66, 700, family);
    ctx.fillStyle = 'rgba(255,255,255,.5)';
    const nameY = y + padY * 0.55 + fs * 0.33;
    ctx.fillText(name, tx, nameY);

    ctx.font = fontOf(fs, 700, family);
    const sp = ctx.measureText(' ').width;
    const startY = nameY + fs * 0.72 + lh * 0.5;
    lines.forEach((l, i) => {
      drawRichLine(ctx, l, tx, startY + i * lh, fs, 700, family, '#FFFFFF', p.sub.accent || '#D8FF3E', sp);
    });
    ctx.restore();
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  }

  /* ── tag / channel ──────────────────────────────────── */
  function drawTag(ctx, W, H, p, k) {
    if (!p.tag || !p.tag.on || !p.tag.text) return;
    const size = 30 * k;
    ctx.save();
    ctx.font = fontOf(size, 800, '"Apple SD Gothic Neo","Malgun Gothic","Noto Sans KR",sans-serif');
    ctx.fillStyle = 'rgba(255,255,255,.5)';
    ctx.translate(W * 0.035, H * 0.30);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText(p.tag.text, 0, 0);
    ctx.restore();
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  }

  /* ── grade ──────────────────────────────────────────── */
  function applyGrade(ctx, W, H, p, t) {
    const g = p.grade || 'none';
    const b = (p.bright || 0) / 100, c = (p.contrast || 0) / 100, s = (p.sat || 0) / 100;
    if (g !== 'none' || b || c || s) {
      if (g === 'cine') {
        ctx.save();
        ctx.globalCompositeOperation = 'overlay';
        const gg = ctx.createLinearGradient(0, 0, 0, H);
        gg.addColorStop(0, 'rgba(70,120,150,.30)');
        gg.addColorStop(.55, 'rgba(20,24,30,0)');
        gg.addColorStop(1, 'rgba(0,0,0,.55)');
        ctx.fillStyle = gg; ctx.fillRect(0, 0, W, H);
        ctx.restore();
      } else if (g === 'warm') {
        ctx.save(); ctx.globalCompositeOperation = 'overlay';
        ctx.fillStyle = 'rgba(255,150,60,.20)'; ctx.fillRect(0, 0, W, H); ctx.restore();
      } else if (g === 'cool') {
        ctx.save(); ctx.globalCompositeOperation = 'overlay';
        ctx.fillStyle = 'rgba(60,120,255,.22)'; ctx.fillRect(0, 0, W, H); ctx.restore();
      } else if (g === 'vivid') {
        ctx.save(); ctx.globalCompositeOperation = 'overlay';
        ctx.fillStyle = 'rgba(255,90,40,.10)'; ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = 'rgba(20,40,80,.14)'; ctx.fillRect(0, 0, W, H); ctx.restore();
      } else if (g === 'mono') {
        ctx.save(); ctx.globalCompositeOperation = 'saturation';
        ctx.fillStyle = 'hsl(0,0%,50%)'; ctx.fillRect(0, 0, W, H); ctx.restore();
      }
    }
    if (b > 0) { ctx.save(); ctx.globalCompositeOperation = 'screen'; ctx.fillStyle = 'rgba(255,255,255,' + (b * 0.5) + ')'; ctx.fillRect(0, 0, W, H); ctx.restore(); }
    if (b < 0) { ctx.save(); ctx.globalCompositeOperation = 'multiply'; ctx.fillStyle = 'rgba(0,0,0,' + (-b * 0.6) + ')'; ctx.fillRect(0, 0, W, H); ctx.restore(); }
    if (c > 0) {
      ctx.save(); ctx.globalCompositeOperation = 'overlay';
      const gg = ctx.createLinearGradient(0, 0, 0, H);
      gg.addColorStop(0, 'rgba(0,0,0,' + (c * 0.3) + ')');
      gg.addColorStop(.5, 'rgba(255,255,255,' + (c * 0.12) + ')');
      gg.addColorStop(1, 'rgba(0,0,0,' + (c * 0.3) + ')');
      ctx.fillStyle = gg; ctx.fillRect(0, 0, W, H); ctx.restore();
    }
    if (s > 0) { ctx.save(); ctx.globalCompositeOperation = 'overlay'; ctx.fillStyle = 'rgba(120,140,255,' + (s * 0.08) + ')'; ctx.fillRect(0, 0, W, H); ctx.restore(); }
    if (s < 0) { ctx.save(); ctx.globalCompositeOperation = 'saturation'; ctx.fillStyle = 'hsl(0,' + (Math.abs(s) * 60) + '%,50%)'; ctx.fillRect(0, 0, W, H); ctx.restore(); }
  }

  function drawVignette(ctx, W, H, p) {
    const v = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.22, W / 2, H / 2, Math.max(W, H) * 0.72);
    v.addColorStop(0, 'rgba(0,0,0,0)');
    v.addColorStop(1, 'rgba(0,0,0,' + (p.grade === 'none' ? '.28' : '.42') + ')');
    ctx.fillStyle = v; ctx.fillRect(0, 0, W, H);
  }

  /* ── main draw ──────────────────────────────────────── */
  R.draw = function (ctx, W, H, p, t, opts) {
    opts = opts || {};
    const ratio = p.ratio || '9:16';
    const outW = W, outH = H;
    const sc = outW / 1080;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, outW, outH);
    ctx.scale(sc, sc);
    W = 1080;
    H = ratio === '16:9' ? 607.5 : 1920;
    const k = p.ratio === '16:9' ? 0.8 : 1;

    // 1. source
    const src = p.source || { type: 'sample', sample: 'docu' };
    if (src.type === 'video' && RS.state.media.video && RS.state.media.video.videoWidth) {
      const v = RS.state.media.video;
      const vw = v.videoWidth, vh = v.videoHeight;
      const scale = Math.max(W / vw, H / vh) * (p.zoom || 1);
      const dw = vw * scale, dh = vh * scale;
      const dx = (W - dw) / 2;
      const dy = (H - dh) * (p.offset == null ? 0.5 : p.offset);
      try {
        if ('filter' in ctx) ctx.filter = 'brightness(' + (1 + (p.bright || 0) / 100) + ') contrast(' + (1 + (p.contrast || 0) / 100) + ') saturate(' + (1 + (p.sat || 0) / 100) + ')';
      } catch (e) {}
      ctx.drawImage(v, dx, dy, dw, dh);
      try { ctx.filter = 'none'; } catch (e) {}
    } else {
      ctx.save();
      const z = p.zoom || 1;
      const off = p.offset == null ? 0.5 : p.offset;
      if (z !== 1) { ctx.translate(W / 2, H * off); ctx.scale(z, z); ctx.translate(-W / 2, -H * off); }
      R.drawSample(ctx, W * 1.02, H * 1.02, src.sample || 'docu', t);
      ctx.restore();
    }

    // 2. grade + vignette + grain
    applyGrade(ctx, W, H, p, t);
    drawVignette(ctx, W, H, p);
    try {
      const gt = grain();
      const ox = (t * 60) % 160, oy = (t * 37) % 160;
      ctx.save(); ctx.globalAlpha = 0.05 * (p.grain == null ? 1 : p.grain);
      for (let x = -160; x < W + 160; x += 160) for (let y = -160; y < H + 160; y += 160) ctx.drawImage(gt, x + ox, y + oy);
      ctx.restore();
    } catch (e) {}

    // 3. tag / hook / comment / subtitle
    drawTag(ctx, W, H, p, k);
    drawHook(ctx, W, H, p, k);
    const cue = U.cueAt(p, t);
    drawComment(ctx, W, H, p, cue, t, k);
    drawSub(ctx, W, H, p, cue, t, k);

    // 4. guide
    if (opts.guide) {
      ctx.save();
      ctx.strokeStyle = 'rgba(216,255,62,.5)'; ctx.lineWidth = 2; ctx.setLineDash([10, 8]);
      ctx.strokeRect(W * 0.05, H * 0.06, W * 0.9, H * 0.88);
      ctx.strokeStyle = 'rgba(255,90,90,.45)';
      ctx.beginPath(); ctx.moveTo(W, H * 0.42); ctx.lineTo(W * 0.84, H * 0.42); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(W * 0.84, H * 0.42); ctx.lineTo(W * 0.84, H); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(216,255,62,.35)';
      ctx.font = '700 24px "Apple SD Gothic Neo","Malgun Gothic","Noto Sans KR",sans-serif';
      ctx.fillText('유튜브 UI 회피', W * 0.06, H * 0.115);
      ctx.restore();
    }
    ctx.restore();
  };

  /* ── thumbnail ──────────────────────────────────────── */
  R.thumbnail = function (canvas, p, t, badge) {
    const W = 1080, H = 1920;
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d');
    const title = (p.meta.titles[p.meta.selected] || p.meta.titles[0] || p.hook.line1 || p.name || '제목을 넣으세요').trim();
    const FAM = '"Apple SD Gothic Neo","Malgun Gothic","Noto Sans KR",sans-serif';
    let fs = 96;
    let ls = layoutLines(ctx, U.rich(title, false), W * 0.86, fs, 900, FAM);
    for (let pass = 0; pass < 4; pass++) {
      const orphan = ls.length === 3 && ls[2].w < W * 0.26;
      if (!orphan && ls.length <= 3) break;
      fs -= 8;
      ls = layoutLines(ctx, U.rich(title, false), W * 0.86, fs, 900, FAM);
    }
    ls = ls.slice(0, 3);

    // background frame
    const src = p.source || {};
    if (src.type === 'video' && RS.state.media.video && RS.state.media.video.videoWidth) {
      const v = RS.state.media.video;
      const scale = Math.max(W / v.videoWidth, H / v.videoHeight) * (p.zoom || 1);
      ctx.drawImage(v, (W - v.videoWidth * scale) / 2, (H - v.videoHeight * scale) * (p.offset == null ? .5 : p.offset), v.videoWidth * scale, v.videoHeight * scale);
    } else {
      R.drawSample(ctx, W, H, src.sample || 'docu', t);
    }
    applyGrade(ctx, W, H, { grade: p.grade, bright: p.bright, contrast: p.contrast, sat: p.sat });
    // dark scrim top and bottom
    let g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, 'rgba(0,0,0,.72)'); g.addColorStop(.34, 'rgba(0,0,0,.10)');
    g.addColorStop(.58, 'rgba(0,0,0,.28)'); g.addColorStop(1, 'rgba(0,0,0,.88)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

    // badge
    const bt = badge || (p.tag && p.tag.text) || (RS.presetById(p.presetId).tag && RS.presetById(p.presetId).tag.text) || 'REEL STUDIO';
    ctx.font = '900 40px "Apple SD Gothic Neo","Malgun Gothic","Noto Sans KR",sans-serif';
    const bw = ctx.measureText(bt).width + 52;
    ctx.fillStyle = '#D8FF3E';
    roundRect(ctx, 64, 96, bw, 72, 10); ctx.fill();
    ctx.fillStyle = '#0B0D12'; ctx.textBaseline = 'middle';
    ctx.fillText(bt, 90, 134);

    // hook line small accent
    if (p.hook.line1) {
      ctx.fillStyle = 'rgba(255,255,255,.62)';
      ctx.font = '800 44px "Apple SD Gothic Neo","Malgun Gothic","Noto Sans KR",sans-serif';
      ctx.fillText(U.strip(p.hook.line1).slice(0, 26), 64, 250);
    }

    // big title bottom
    const lh = fs * 1.22;
    const blockH = ls.length * lh;
    const startY = H - 260 - blockH;
    ctx.textBaseline = 'middle';
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,.55)'; ctx.shadowBlur = 26; ctx.shadowOffsetY = 8;
    ls.forEach((l, i) => {
      let x = 64;
      const y = startY + lh / 2 + i * lh;
      ctx.font = '900 ' + fs + 'px "Apple SD Gothic Neo","Malgun Gothic","Noto Sans KR",sans-serif';
      const sp = ctx.measureText(' ').width;
      l.items.forEach((it, j) => {
        if (j > 0) x += sp;
        ctx.fillStyle = it.em ? '#D8FF3E' : '#FFFFFF';
        ctx.fillText(it.text, x, y);
        x += ctx.measureText(it.text).width;
      });
    });
    ctx.restore();
    // accent bar
    ctx.fillStyle = '#D8FF3E';
    ctx.fillRect(64, startY + blockH + 26, 140, 12);

    // bottom channel
    ctx.font = '800 38px "Apple SD Gothic Neo","Malgun Gothic","Noto Sans KR",sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,.72)';
    ctx.textBaseline = 'alphabetic';
    const ch = (p.tag && p.tag.text) || '@reelstudio';
    ctx.fillText(ch, 64, H - 96);
    ctx.textAlign = 'right';
    ctx.fillStyle = 'rgba(255,255,255,.42)';
    ctx.font = '700 32px "Apple SD Gothic Neo","Malgun Gothic","Noto Sans KR",sans-serif';
    ctx.fillText('SHORTS', W - 64, H - 96);
    ctx.textAlign = 'left';
  };

  R.ratioSize = function (ratio, targetW) {
    const W = targetW || 720;
    return { w: W, h: Math.round(W * (ratio === '16:9' ? 9 / 16 : 16 / 9)) };
  };
})();
