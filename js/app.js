/* REEL STUDIO — app: UI wiring, playback, export, upload */
(function () {
  'use strict';
  const RS = window.RS;
  const U = RS.util, S = RS.state, A = RS.audio, R = RS.render;
  const $ = s => document.querySelector(s);
  const $$ = s => Array.from(document.querySelectorAll(s));
  const el = id => document.getElementById(id);

  /* ── QA error log ───────────────────────────────────── */
  window.__rsErrors = [];
  window.addEventListener('error', e => window.__rsErrors.push(String(e.message || e)));
  window.addEventListener('unhandledrejection', e => window.__rsErrors.push('rejection: ' + ((e.reason && e.reason.message) || e.reason)));

  let saveTimer = null;
  const save = U.debounce(() => {
    S.project.updatedAt = Date.now();
    RS.store.saveProject(S.project);
  }, 350);
  const touch = () => { save(); updateMetaLine(); };

  /* ── boot ───────────────────────────────────────────── */
  document.addEventListener('DOMContentLoaded', init);

  function init() {
    RS.bootState();
    el('projName').value = S.project.name || '내 첫 쇼츠';
    setupVideoEl();
    bindTabs();
    bindTop();
    bindSource();
    bindSourcePanel();
    bindStage();
    bindPreviewModal();
    bindScript();
    bindQuickTools();
    bindMusic();
    bindTransport();
    bindPreview();
    bindUpload();
    bindSettings();
    bindSfxPack();
    renderSfxPack();
    bindVoiceLib();
    syncProjectToUI(true);
    bindSafeBadge();
    const demoList = safeList(RS.demoDiscover).slice(0, 12);
    renderDiscover(demoList, { mode: 'demo' });
    if (el('discoverStatus')) el('discoverStatus').innerHTML = '<i class="dot"></i>샘플 떡상 데이터 · ' + demoList.length + '건 (검색하면 키워드로 다시 찾습니다)';
    loadPopularRail();
    voiceLibInit();
    loop();
    if (!RS.store.loadProject()) {
      setTimeout(() => RS.toast('데모 프로젝트로 열었어요 · 설정에서 API 키를 넣으면 실데이터로 바뀝니다'), 700);
    }
    document.fonts && document.fonts.ready.then(() => { drawStatic(); });
  }

  /* ── mode / meta ────────────────────────────────────── */
  function updateMode() {
    const n = (RS.ai.hasGemini() ? 1 : 0) + (RS.ai.hasYouTube() ? 1 : 0);
    const pill = el('modePill'), txt = el('modeText');
    pill.classList.toggle('live', n > 0);
    txt.textContent = n === 0 ? '데모 모드' : n >= 2 ? 'API 연결됨' : '일부 연결';
    const src = RS.tube && RS.tube.keySource ? RS.tube.keySource() : 'none';
    pill.title = src === 'saved' ? '내 키로 유튜브 실시간 연결됨'
      : src === 'builtin' ? '기본 키로 유튜브 실시간 연결됨 · 설정에서 내 키로 바꿀 수 있어요'
      : '키가 없어 샘플로 보여줍니다';
    const db = el('demoBanner'); if (db) db.hidden = RS.ai.hasYouTube();
    const am = el('aiMode'); if (am) am.textContent = RS.ai.hasGemini() ? 'Gemini 연결' : '데모 생성';
  }

  function updateMetaLine() {
    const p = S.project, dur = U.totalDur(p);
    el('projMeta').textContent = p.ratio + ' · ' + dur.toFixed(1) + '초 · ' + (p.cues || []).length + '큐';
    el('pRatioTag').textContent = p.ratio;
    el('aRatioTag').textContent = p.ratio;
    el('xLen').textContent = dur.toFixed(1);
    const cs = el('cueSummary'); if (cs) cs.textContent = (p.cues || []).length + '줄 · ' + dur.toFixed(1) + '초';
    const hs2 = el('hookSummary'); if (hs2) hs2.textContent = [p.hook.line1, p.hook.line2].filter(Boolean).length + '줄';
    const ms2 = el('metaSummary'); if (ms2) ms2.textContent = (p.meta.titles || []).filter(Boolean).length + '안';
    const ss = el('sourceSummary'); if (ss) ss.textContent = p.source.type === 'video' ? ('영상 · ' + (S.media.videoName || '')) : '영상 스테이지';
    el('aPreset').textContent = (RS.presetById(p.presetId) || {}).name || '커스텀';
    el('bgmNow').textContent = p.bgm.on && p.bgm.id ? (RS.bgmList.find(b => b.id === p.bgm.id) || {}).name + ' · ' + Math.round(p.bgm.volume * 100) + '%' : '없음';
    updateMode();
  }

  /* ── tabs ───────────────────────────────────────────── */
  function setTab(name) {
    S.ui.tab = name;
    $$('.panel').forEach(p => { p.hidden = p.dataset.panel !== name; });
    $$('.rail-item[data-tab]').forEach(b => b.classList.toggle('is-active', b.dataset.tab === name));
    $$('.tb-item[data-tab]').forEach(b => b.classList.toggle('is-active', b.dataset.tab === name));
    if (name === 'preview') { resizeStage(); drawStatic(); }
    if (name === 'music') { renderSfxPack(); preloadSfxPack(); }
    if (name === 'upload') syncUploadFields();
    if (name === 'script') {
      renderCues();
      restoreStage();
      stage.last = performance.now();
      syncStyleBar();
      paintStageMedia();
      lastOverlayKey = '';
      paintOverlay(true);
      updateScriptStatus();
    }
    const main = el('main');
    if (main) main.scrollTop = 0;
    const panel = $('.panel[data-panel="' + name + '"]');
    if (panel) panel.scrollTop = 0;
  }
  function bindTabs() {
    $$('[data-tab]').forEach(b => b.addEventListener('click', () => { A.resume(); setTab(b.dataset.tab); }));
    $$('[data-go="settings"]').forEach(b => b.addEventListener('click', openSettings));
  }

  /* ── topbar ─────────────────────────────────────────── */
  function bindTop() {
    el('projName').addEventListener('input', e => { S.project.name = e.target.value || '내 쇼츠'; touch(); });
    $$('[data-close]').forEach(b => b.addEventListener('click', () => {
      const id = b.dataset.close;
      RS.closeModal(id);
      if (id === 'confirm' && RS._cfResolve) { const r = RS._cfResolve; RS._cfResolve = null; r(false); }
    }));
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') {
        $$('.modal:not([hidden])').forEach(m => {
          const id = m.id.replace('Modal', '');
          RS.closeModal(id);
          if (id === 'confirm' && RS._cfResolve) { const r = RS._cfResolve; RS._cfResolve = null; r(false); }
        });
      }
      if (e.key === ' ' && !/input|textarea|select/i.test((document.activeElement || {}).tagName || '')) {
        e.preventDefault(); togglePlay();
      }
    });
    window.addEventListener('resize', U.debounce(() => { resizeStage(); drawStatic(); }, 150));
  }

  /* ── video element ──────────────────────────────────── */
  function setupVideoEl() {
    const v = document.createElement('video');
    v.playsInline = true; v.setAttribute('playsinline', ''); v.preload = 'auto';
    v.muted = false; v.volume = 1; v.loop = false;
    v.style.position = 'fixed'; v.style.left = '-9999px'; v.style.width = '1px'; v.style.height = '1px';
    v.style.opacity = '0'; v.style.pointerEvents = 'none';
    document.body.appendChild(v);
    S.media.video = v;
    v.addEventListener('loadedmetadata', () => {
      S.media.videoDur = v.duration || 0;
      if (v.duration > 90) RS.toast('90초가 넘어 앞 90초까지만 씁니다');
    });
    v.addEventListener('error', () => RS.toast('이 영상 파일은 브라우저가 읽지 못했습니다 (코덱 확인)', 'err'));
  }

  /* ── source ─────────────────────────────────────────── */
  /* 2단계는 9:16 스테이지가 원본을 직접 다룹니다 (슬라이더·비율·샘플 소스 UI 폐기) */
  function bindSource() { /* no-op: 원본 소스 설정 UI 제거 */ }

  function loadVideoFile(f) {
    if (!f) return;
    if (S.media.videoURL) URL.revokeObjectURL(S.media.videoURL);
    const url = URL.createObjectURL(f);
    S.media.videoURL = url;
    S.media.videoName = f.name;
    const v = S.media.video;
    v.src = url;
    v.load();
    S.project.source = { type: 'video', sample: 'docu', name: f.name };
    S.project.zoom = 1; S.project.offset = 0.5;
    A.bindVideo(v);
    syncSourceUI();
    openStageVideo(url, f.name, f.size);
    paintOverlay(true);
    touch();
    if (!el('previewModal').hidden) closePreview();
    setTab('script');
    const st = el('scriptStatus');
    if (st) st.textContent = 'MP4 연결됨 · 이 기기에서 자막 굽기·MP4 내보내기 가능';
    RS.toast('원본 넣음 · ' + f.name + ' — 영상 위에서 바로 자막·내보내기 됩니다', 'ok');
    v.play().then(() => v.pause()).catch(() => {});
  }

  function clearVideo() {
    const v = S.media.video;
    try { v.pause(); } catch (e) {}
    v.removeAttribute('src'); v.load();
    if (S.media.videoURL) URL.revokeObjectURL(S.media.videoURL);
    S.media.videoURL = null; S.media.videoName = null; S.media.videoDur = 0;
    S.project.source = { type: 'sample', sample: 'docu', name: '다큐 다크' };
    syncSourceUI(); touch();
  }

  function syncSourceUI() {
    const p = S.project;
    const sm = RS.sampleSources.find(s => s.id === (p.source.sample || 'docu'));
    const badge = el('stageBadge');
    if (badge) badge.textContent = p.source.type === 'video' ? '내 영상' : ('샘플 · ' + (sm ? sm.name : '다큐 다크'));
  }

  /* ── script tab ─────────────────────────────────────── */
  function bindScript() {
    el('sNewProject').addEventListener('click', async () => {
      if (!(await RS.confirm('새 프로젝트', '지금 대본과 큐를 지우고 새로 시작할까요? 저장된 프리셋은 그대로 남습니다.'))) return;
      S.project = RS.newProject();
      S.player.t = 0; S.ui.pinnedCue = null; pause();
      resetStage();
      syncProjectToUI(true);
      RS.toast('새 프로젝트 시작');
    });

    el('regenScript').addEventListener('click', () => regenScript());

    ['hook1', 'hook2'].forEach(id => el(id).addEventListener('input', e => {
      S.project.hook[id === 'hook1' ? 'line1' : 'line2'] = e.target.value;
      touch(); drawStatic(); paintOverlay(true);
    }));
    el('hookStyle').addEventListener('change', e => { S.project.hook.style = e.target.value; touch(); paintOverlay(true); });
    el('hookOn').addEventListener('change', e => { S.project.hook.on = e.target.checked; touch(); paintOverlay(true); });

    el('cueAdd').addEventListener('click', () => {
      const p = S.project;
      const last = p.cues[p.cues.length - 1];
      const start = last ? +last.end : 0;
      const c = { id: U.uid(), text: '새 자막', start, end: +(start + 2.4).toFixed(1), sfx: '', comment: { on: false, text: '', name: '시청자' } };
      p.cues.push(c);
      renderCues(); touch(); selectCue(c.id); paintOverlay(true);
    });
    el('cueFit').addEventListener('click', () => {
      const p = S.project;
      if (!p.cues.length) return;
      const total = Math.max(U.totalDur(p), p.cues.length * 2.2);
      const weights = p.cues.map(c => Math.max(6, U.strip(c.text).length));
      const sum = weights.reduce((a, b) => a + b, 0);
      let acc = 0;
      p.cues.forEach((c, i) => {
        const d = (weights[i] / sum) * total;
        c.start = +acc.toFixed(1); acc += d; c.end = +acc.toFixed(1);
      });
      p.cues[p.cues.length - 1].end = +total.toFixed(1);
      renderCues(); touch(); drawStatic(); paintOverlay(true);
      RS.toast('시간을 글자 수에 맞춰 다시 배분했습니다');
    });
    el('cueSrt').addEventListener('click', async () => {
      const ok = await U.copy(U.srt(S.project));
      RS.toast(ok ? 'SRT를 복사했습니다 (캡컷에 붙여넣기)' : '복사 실패', ok ? 'ok' : 'err');
    });
    el('cueCommentAll').addEventListener('click', () => {
      const p = S.project;
      const allOn = p.cues.every(c => c.comment.on);
      p.cues.forEach(c => c.comment.on = !allOn);
      renderCues(); touch();
      RS.toast(allOn ? '댓글 카드 전체 끔' : '댓글 카드 전체 켬');
    });

    const metaIds = { metaDesc: 'desc', metaTags: 'tags' };
    Object.entries(metaIds).forEach(([id, key]) => el(id).addEventListener('input', e => {
      S.project.meta[key] = e.target.value; touch(); syncUploadFields();
    }));
    el('metaCopyTitle').addEventListener('click', async () => { const t = S.project.meta.titles[S.project.meta.selected] || S.project.meta.titles[0] || ''; RS.toast(await U.copy(t) ? '제목을 복사했습니다' : '복사 실패', 'ok'); });
    el('metaCopyDesc').addEventListener('click', async () => { RS.toast(await U.copy(S.project.meta.desc) ? '설명을 복사했습니다' : '복사 실패', 'ok'); });
    el('metaCopyTags').addEventListener('click', async () => { RS.toast(await U.copy(S.project.meta.tags) ? '태그를 복사했습니다' : '복사 실패', 'ok'); });
    el('metaCopyAll').addEventListener('click', async () => {
      const p = S.project;
      const t = p.meta.titles[p.meta.selected] || p.meta.titles[0] || '';
      const all = '제목: ' + t + '\n\n' + p.meta.desc + '\n\n태그: ' + p.meta.tags;
      RS.toast(await U.copy(all) ? '제목·설명·태그를 전부 복사했습니다' : '복사 실패', 'ok');
    });

    el('cueList').addEventListener('input', e => {
      const row = e.target.closest('.cue'); if (!row) return;
      const c = S.project.cues.find(x => x.id === row.dataset.id); if (!c) return;
      if (e.target.classList.contains('cue-text')) {
        c.text = e.target.value;
        autoGrow(e.target);
        updateCueDuration(row, c);
        drawStatic(); touch(); renderScrubCues(); paintOverlay(true);
      } else if (e.target.classList.contains('cmt-text')) {
        c.comment.text = e.target.value; updateCueDuration(row, c); touch(); drawStatic(); paintOverlay(true);
      } else if (e.target.classList.contains('cue-start')) {
        c.start = Math.max(0, +e.target.value || 0);
        updateCueDuration(row, c); touch(); renderScrubCues();
      } else if (e.target.classList.contains('cue-end')) {
        c.end = Math.max(c.start + 0.2, +e.target.value || 0);
        updateCueDuration(row, c); touch(); renderScrubCues();
      }
    });
    el('cueList').addEventListener('change', e => {
      const row = e.target.closest('.cue'); if (!row) return;
      const c = S.project.cues.find(x => x.id === row.dataset.id); if (!c) return;
      if (e.target.classList.contains('cue-sfx')) { c.sfx = e.target.value; if (c.sfx) A.playSfx(c.sfx); updateCueDuration(row, c); touch(); }
      if (e.target.classList.contains('cue-cmt-on')) { c.comment.on = e.target.checked; updateCueDuration(row, c); touch(); drawStatic(); paintOverlay(true); }
    });
    el('cueList').addEventListener('click', e => {
      const row = e.target.closest('.cue'); if (!row) return;
      const c = S.project.cues.find(x => x.id === row.dataset.id); if (!c) return;
      if (e.target.classList.contains('cue-del')) {
        S.project.cues = S.project.cues.filter(x => x.id !== c.id);
        renderCues(); touch(); drawStatic(); paintOverlay(true); return;
      }
      if (e.target.classList.contains('cue-play')) { jumpStageToCue(c.start); drawStatic(); A.playSfx(c.sfx || 'pop'); return; }
      if (e.target.classList.contains('cue-no')) { jumpStageToCue(c.start); drawStatic(); return; }
      if (e.target.closest('.cue-more') || e.target.closest('.cue-meta')) {
        const extra = row.querySelector('.cue-extra');
        const more = row.querySelector('.cue-more');
        const willOpen = extra.hidden;
        extra.hidden = !willOpen;
        row.classList.toggle('is-open', willOpen);
        if (more) { more.classList.toggle('on', willOpen); more.setAttribute('aria-expanded', String(willOpen)); }
        selectCue(c.id, true);
        if (willOpen) {
          const t = row.querySelector('.cue-start');
          if (t && window.matchMedia('(min-width: 1001px)').matches) setTimeout(() => t.focus(), 30);
        }
        return;
      }
      selectCue(c.id);
    });
    el('cueList').addEventListener('focusin', e => {
      const row = e.target.closest('.cue'); if (row) selectCue(row.dataset.id, true);
    });
  }

  /* ══ STEP 2 스테이지: 즉시 재생 + 스와이프 스타일 레이어 ════
     영상은 <video>/유튜브 임베드로 그대로 재생하고, 자막·댓글·훅은
     영상 위에 HTML/CSS 투명 레이어로만 겹칩니다(굽지 않음). */
  const stage = { kind: 'none', ytId: '', videoURL: '', capT: 0, last: 0, big: false };
  let lastOverlayKey = '';

  function builtinPresets() { return S.presets.filter(p => p.builtin); }
  function stageIndex() {
    const list = builtinPresets();
    const i = list.findIndex(p => p.id === S.project.presetId);
    return i < 0 ? 0 : i;
  }
  function ytIdOf(url) {
    const m = /(?:youtu\.be\/|v=|shorts\/|embed\/)([A-Za-z0-9_-]{6,})/.exec(String(url || ''));
    return m ? m[1] : '';
  }
  function richHTML(text, accent, autoNumber) {
    const col = accent || '#FFD93D';
    return U.rich(text, !!autoNumber).map(s => {
      const t = U.esc(s.t).replace(/\n/g, '<br>');
      if (!s.em) return t;
      return '<b style="color:' + U.esc(col) + (s.ul ? ';text-decoration:underline' : '') + '">' + t + '</b>';
    }).join('');
  }

  function stageMediaBox() {
    const m = el('stageMedia');
    if (!m) return null;
    const W = m.clientWidth || 0, H = m.clientHeight || 0;
    if (!W || !H) return null;
    return { W, H, k: H / 1920 };
  }

  function overlayCue() {
    const p = S.project;
    if (!p.cues || !p.cues.length) return null;
    if (S.ui.pinnedCue) {
      const c = p.cues.find(x => x.id === S.ui.pinnedCue);
      if (c) return c;
    }
    const dur = U.totalDur(p) || 1;
    const t = (stage.capT % dur + dur) % dur;
    return U.cueAt(p, t) || p.cues[0];
  }

  function paintOverlay(force) {
    const box = stageMediaBox();
    const ov = el('ov');
    if (!box || !ov) return;
    const p = S.project, W = box.W, H = box.H, k = box.k;
    const cue = overlayCue();
    const cKey = cue ? [cue.id, cue.text, cue.comment && cue.comment.on, cue.comment && cue.comment.text, cue.comment && cue.comment.name].join('~') : '';
    const key = [p.presetId, cKey, S.ui.pinnedCue || '', p.hook.line1, p.hook.line2, p.hook.style, p.hook.on,
      p.sub.fontSize, p.sub.box, p.card.on, p.card.style, Math.round(W), Math.round(H)].join('|');
    if (!force && key === lastOverlayKey) return;
    lastOverlayKey = key;

    /* 1) 상단 제목 띠 */
    const hk = p.hook || {};
    const ovHook = el('ovHook');
    if (ovHook) {
      const l1 = ovHook.querySelector('.ovh-l1'), l2 = ovHook.querySelector('.ovh-l2');
      const hs = hk.style || 'band';
      const on = hk.on !== false && !!(hk.line1 || hk.line2);
      ovHook.className = 'ov-hook' + (on ? ' is-on hs-' + hs : '');
      if (!on) { ovHook.style.cssText = 'display:none'; }
      else {
        const size = (hk.size || 54) * k;
        const lh = size * (hk.lh || 1.26);
        const lines = (hk.line1 ? 1 : 0) + (hk.line2 ? 1 : 0);
        const textH = lines * lh;
        const padH = (hk.pad == null ? 0.028 : hk.pad) * H;
        l1.innerHTML = richHTML(hk.line1, hk.accent);
        l2.innerHTML = richHTML(hk.line2, hk.accent);
        l1.style.cssText = 'display:' + (hk.line1 ? 'block' : 'none') + ';color:' + (hk.color || '#FFFFFF')
          + ';font-family:' + (hk.font || 'inherit') + ';font-size:' + size + 'px;line-height:' + lh + 'px;font-weight:900';
        l2.style.cssText = 'display:' + (hk.line2 ? 'block' : 'none') + ';color:' + (hk.accent || '#FFFFFF')
          + ';font-family:' + (hk.font || 'inherit') + ';font-size:' + (size * 0.9) + 'px;line-height:' + (lh * 0.9) + 'px;font-weight:900';
        let s = 'display:flex;flex-direction:column;justify-content:center;position:absolute;';
        if (hs === 'band') {
          s += 'left:0;right:0;top:0;height:' + Math.max(H * 0.081, textH + padH) + 'px;text-align:center;'
            + 'padding:0 ' + (W * 0.07) + 'px;background:' + (hk.bg || '#000000') + ';';
        } else if (hs === 'pill') {
          const padX = W * 0.05, padY = H * 0.014;
          const stripe = Math.max(9, W * 0.017);
          s += 'left:50%;top:' + (H * 0.048) + 'px;transform:translateX(-50%);width:max-content;max-width:90%;text-align:left;'
            + 'padding:' + padY + 'px ' + padX + 'px;background:' + (hk.bg || '#101B36') + ';'
            + 'border-left:' + stripe + 'px solid ' + (hk.accent || '#FF4B3E') + ';'
            + 'border-radius:' + Math.min((textH + padY * 2) / 2, 34 * k) + 'px;box-shadow:0 8px 20px rgba(0,0,0,.45);';
        } else if (hs === 'card') {
          const padX = W * 0.038, padY = H * 0.014;
          s += 'left:50%;top:' + (H * 0.052) + 'px;transform:translateX(-50%);width:max-content;max-width:86%;text-align:left;'
            + 'padding:' + padY + 'px ' + padX + 'px;background:' + (hk.bg || '#FFFFFF') + ';'
            + 'border-radius:' + (26 * k) + 'px;box-shadow:0 8px 22px rgba(0,0,0,.35);';
        } else {
          const center = H * (hk.band ? hk.band * 0.5 : 0.075);
          s += 'left:0;right:0;top:' + Math.max(0, center - textH / 2) + 'px;text-align:center;'
            + 'padding:0 ' + (W * 0.07) + 'px;text-shadow:0 3px 14px rgba(0,0,0,.85);';
        }
        ovHook.style.cssText = s;
      }
    }

    /* 2) 자막 (별도 레이어) */
    const sb = p.sub || {};
    const ovSub = el('ovSub');
    if (ovSub) {
      if (!cue) { ovSub.style.cssText = 'display:none'; ovSub.innerHTML = ''; }
      else {
        const fs = (sb.fontSize || 62) * k;
        let s = 'display:block;position:absolute;left:50%;transform:translateX(-50%);'
          + 'width:max-content;max-width:' + (W * 0.86) + 'px;text-align:center;'
          + 'font-size:' + fs + 'px;font-weight:' + (sb.weight || 900) + ';line-height:1.24;'
          + 'font-family:' + (sb.font || 'inherit') + ';color:#FFFFFF;';
        if (sb.box) {
          s += 'background:' + (sb.boxColor || 'rgba(0,0,0,.7)') + ';'
            + 'border-radius:' + ((sb.radius || 0) * k) + 'px;'
            + 'padding:' + (fs * 0.3) + 'px ' + (fs * 0.42) + 'px;';
        } else if (sb.stroke) {
          s += '-webkit-text-stroke:' + (sb.stroke * k * 0.75) + 'px #000;paint-order:stroke fill;';
        } else {
          s += 'text-shadow:0 3px 12px rgba(0,0,0,.9),0 1px 3px rgba(0,0,0,.9);';
        }
        ovSub.innerHTML = richHTML(cue.text, sb.accent, sb.autoNumber);
        ovSub.style.cssText = s + 'top:0px;opacity:0';
        const h = ovSub.offsetHeight || fs * 1.4;
        const cy = U.clamp(H * (sb.pos || 0.78), h / 2 + H * 0.04, H - h / 2 - H * 0.03);
        ovSub.style.top = (cy - h / 2) + 'px';
        ovSub.style.opacity = '1';
      }
    }

    /* 3) 댓글 박스 */
    const cd = p.card || {};
    const ovCmt = el('ovCmt');
    if (ovCmt) {
      const on = !!(cd.on && cue && cue.comment && cue.comment.on && String(cue.comment.text || '').trim());
      if (!on) { ovCmt.style.cssText = 'display:none'; ovCmt.innerHTML = ''; }
      else {
        const fs2 = 30 * k * (cd.scale || 1);
        const av = fs2 * 2.1;
        const name = cue.comment.name || cd.name || '시청자';
        const hue = (name.length * 7.3 + name.charCodeAt(0)) % 360;
        let s = 'display:flex;align-items:center;position:absolute;gap:' + (fs2 * 0.7) + 'px;'
          + 'left:' + (W * (cd.x == null ? 0.06 : cd.x)) + 'px;top:' + (H * (cd.y == null ? 0.6 : cd.y)) + 'px;'
          + 'max-width:' + (W * 0.76) + 'px;padding:' + (fs2 * 0.55) + 'px ' + (fs2 * 0.62) + 'px;'
          + 'background:' + (cd.bg || 'rgba(15,17,22,.88)') + ';'
          + 'border-radius:' + ((cd.radius || 0) * (cd.style === 'bubble' ? k : 1)) + 'px;'
          + 'box-shadow:0 6px 18px rgba(0,0,0,.35);';
        ovCmt.style.cssText = s;
        ovCmt.innerHTML = '<span class="ovc-av" style="width:' + av + 'px;height:' + av + 'px;font-size:' + (av * 0.44)
          + 'px;background:hsl(' + Math.round(hue) + ',58%,52%)">' + U.esc(String(name).slice(0, 1)) + '</span>'
          + '<span class="ovc-body"><b class="ovc-name" style="font-size:' + (fs2 * 0.66) + 'px">' + U.esc(name) + '</b>'
          + '<span class="ovc-text" style="font-size:' + fs2 + 'px;line-height:1.35">'
          + richHTML(cue.comment.text, sb.accent, false) + '</span></span>';
      }
    }
  }

  /* 색감·확대는 '필터'처럼 영상에만 입힙니다 (레이어는 그대로) */
  function paintStageMedia() {
    const p = S.project;
    const grade = {
      none: '', vivid: 'contrast(1.14) saturate(1.26)',
      cine: 'contrast(1.1) saturate(.92) brightness(.95) sepia(.06)',
      warm: 'sepia(.16) saturate(1.1) brightness(1.06)',
      cool: 'hue-rotate(8deg) saturate(1.04) brightness(.98)',
      mono: 'grayscale(1) contrast(1.08)'
    }[p.grade || 'none'] || '';
    const b = 1 + (p.bright || 0) / 100, c = 1 + (p.contrast || 0) / 100, s = 1 + (p.sat || 0) / 100;
    const filter = 'brightness(' + b.toFixed(3) + ') contrast(' + c.toFixed(3) + ') saturate(' + s.toFixed(3) + ')' + (grade ? ' ' + grade : '');
    const zoom = p.zoom || 1;
    const off = p.offset == null ? 0.5 : p.offset;
    ['stageVideo', 'stageIframe'].forEach(id => {
      const e = el(id); if (!e) return;
      e.style.filter = filter;
      e.style.transform = 'scale(' + zoom.toFixed(3) + ') translateY(' + ((0.5 - off) * 100).toFixed(2) + '%)';
    });
    const lb = p.letterbox || 0;
    const t = el('ovLbT'), bo = el('ovLbB');
    if (t && bo) {
      t.style.display = bo.style.display = lb ? 'block' : 'none';
      t.style.height = (lb * 100) + '%';
      bo.style.height = (lb * 100) + '%';
    }
  }

  function updateStageFoot(v) {
    const n = el('stageSrcName'), m = el('stageSrcMeta'), o = el('stageOpen'), dl = el('stageDl');
    if (!n) return;
    if (v && v.kind === 'youtube') {
      n.textContent = v.title || '유튜브 쇼츠';
      m.textContent = [v.channel, v.views ? '조회 ' + U.fmtNum(v.views) + '회' : '', '유튜브 쇼츠'].filter(Boolean).join(' · ');
      if (o) { o.href = v.url || '#'; o.hidden = false; }
      if (dl) dl.hidden = false;
    } else if (v && v.kind === 'video') {
      n.textContent = v.name || '내 영상';
      m.textContent = [v.size ? fmtMB(v.size) : '', 'MP4 · 이 기기에서 바로 내보내기 가능'].filter(Boolean).join(' · ');
      if (o) o.hidden = true;
      if (dl) dl.hidden = true;
    } else {
      n.textContent = '영상 없음';
      m.textContent = '1단계에서 영상을 고르면 여기서 바로 재생됩니다';
      if (o) o.hidden = true;
      if (dl) dl.hidden = true;
    }
  }

  function openStageYoutube(v) {
    const fr = el('stageIframe'), vd = el('stageVideo'), sh = el('stageShield'), em = el('stageEmpty');
    if (!fr) return;
    const id = (v.id && /^[A-Za-z0-9_-]{6,}$/.test(String(v.id))) ? String(v.id) : ytIdOf(v.url);
    if (!id) { updateStageFoot(null); return; }
    fr.src = 'https://www.youtube.com/embed/' + id + '?playsinline=1&autoplay=1&mute=1&loop=1&playlist=' + id + '&controls=0&modestbranding=1&rel=0';
    fr.hidden = false;
    if (vd) { vd.hidden = true; try { vd.pause(); } catch (e) {} }
    if (sh) sh.hidden = false;
    if (em) em.hidden = true;
    stage.kind = 'youtube'; stage.ytId = id; stage.capT = 0; stage.last = performance.now();
    updateStageFoot({ kind: 'youtube', title: v.title || S.project.name, channel: v.channel, views: v.views, url: v.url || ('https://www.youtube.com/shorts/' + id) });
    paintStageMedia();
    paintOverlay(true);
  }

  function openStageVideo(url, name, size) {
    const fr = el('stageIframe'), vd = el('stageVideo'), sh = el('stageShield'), em = el('stageEmpty');
    if (!vd) return;
    if (fr) { fr.hidden = true; fr.removeAttribute('src'); }
    if (sh) sh.hidden = true;
    if (em) em.hidden = true;
    if (url && url !== stage.videoURL) {
      vd.src = url;
      try { vd.load(); } catch (e) {}
      stage.videoURL = url; stage.capT = 0; stage.last = performance.now();
    }
    vd.hidden = false;
    vd.muted = true;
    const snd = el('stageSound');
    if (snd) { snd.hidden = false; snd.textContent = '🔇 소리'; }
    try { const pr = vd.play(); if (pr && pr.catch) pr.catch(() => {}); } catch (e) {}
    stage.kind = 'video';
    updateStageFoot({ kind: 'video', name: name || S.media.videoName, size });
    paintStageMedia();
    paintOverlay(true);
  }

  function resetStage() {
    stage.kind = 'none'; stage.videoURL = ''; stage.capT = 0;
    const fr = el('stageIframe'); if (fr) { fr.hidden = true; fr.removeAttribute('src'); }
    const vd = el('stageVideo'); if (vd) { vd.hidden = true; try { vd.pause(); } catch (e) {} vd.removeAttribute('src'); try { vd.load(); } catch (e) {} }
    const sh = el('stageShield'); if (sh) sh.hidden = true;
    const em = el('stageEmpty'); if (em) em.hidden = false;
    const snd = el('stageSound'); if (snd) snd.hidden = true;
    updateStageFoot(null);
    lastOverlayKey = '';
    paintOverlay(true);
  }

  function applyStageStyle(i) {
    const list = builtinPresets();
    if (!list.length) return;
    const pr = list[((i % list.length) + list.length) % list.length];
    if (!pr) return;
    applyPreset(pr);
    lastOverlayKey = '';
    paintStageMedia();
    paintOverlay(true);
    syncStyleBar();
    try { if (navigator.vibrate) navigator.vibrate(5); } catch (e) {}
  }
  function stepStyle(dir) { applyStageStyle(stageIndex() + dir); }

  function syncStyleBar() {
    const list = builtinPresets();
    const i = stageIndex();
    const pr = list[i] || {};
    const idx = el('styIdx'), nm = el('styName');
    if (idx) idx.textContent = (i + 1) + '/' + list.length;
    if (nm) nm.textContent = pr.name || '스타일';
    const dots = el('styDots');
    if (dots) Array.from(dots.querySelectorAll('button')).forEach((b, k) => b.classList.toggle('on', k === i));
  }

  function renderStyleDots() {
    const box = el('styDots');
    if (!box) return;
    box.innerHTML = builtinPresets().map((p, i) =>
      `<button class="sd" data-i="${i}" type="button" title="${U.esc(p.name)}" aria-label="${U.esc(p.name)}"></button>`).join('');
    box.querySelectorAll('button').forEach(b => b.addEventListener('click', () => applyStageStyle(+b.dataset.i)));
    syncStyleBar();
  }

  function stagePlaying() {
    if (stage.kind === 'video') { const v = el('stageVideo'); return !!(v && !v.paused && !v.ended); }
    return stage.kind === 'youtube';
  }
  function tickStage() {
    const now = performance.now();
    const dt = Math.min(0.5, (now - (stage.last || now)) / 1000);
    stage.last = now;
    const dur = U.totalDur(S.project) || 1;
    if (stagePlaying() && !S.ui.pinnedCue) stage.capT = (stage.capT + dt) % dur;
    paintOverlay(false);
  }
  function jumpStageToCue(t) {
    pause();
    S.player.t = t;
    stage.capT = t;
    stage.last = performance.now();
    S.ui.pinnedCue = null;
    const v = el('stageVideo');
    if (stage.kind === 'video' && v && v.duration) { try { v.currentTime = t % v.duration; } catch (e) {} }
    paintOverlay(true);
    updateTransport(t);
  }

  /* 유튜브 → MP4 2단 폴백
     ① 공개 Cobalt 인스턴스로 바로 받아 스테이지에 꽂기
     ② 실패하면 링크 복사 + cobalt.tools 열기 + '받은 파일 넣기' 안내 */
  const COBALT_APIS = [
    'https://api.cobalt.tools/api/json',
    'https://co.wuk.sh/api/json',
    'https://cobalt-api.kwiatekmiki.com/api/json',
    'https://cobalt-backend.canine.tools/api/json'
  ];
  function fetchT(url, opts, ms) {
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), ms);
    return fetch(url, Object.assign({}, opts, { signal: ctrl.signal })).finally(() => clearTimeout(to));
  }
  async function cobaltGrab(url, budgetMs) {
    const deadline = Date.now() + (budgetMs || 4200);
    for (const api of COBALT_APIS) {
      const left = deadline - Date.now();
      if (left < 800) break;
      const ms = Math.min(2200, left);
      try {
        const res = await fetchT(api, {
          method: 'POST',
          headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: url, vQuality: '1080', filenameStyle: 'basic', downloadMode: 'auto' })
        }, ms);
        if (!res.ok) continue;
        const j = await res.json();
        const link = j.url || j.tunnel || (Array.isArray(j.picker) && j.picker[0] && j.picker[0].url);
        if (!link) continue;
        const vr = await fetchT(link, { method: 'GET' }, Math.max(3000, deadline - Date.now()));
        if (!vr.ok) continue;
        const blob = await vr.blob();
        if (blob && blob.size > 60000) return blob;
      } catch (e) { /* 다음 인스턴스 */ }
    }
    return null;
  }
  let grabbing = false;
  async function grabVideo(url, btn) {
    if (!url) { RS.toast('받을 링크가 없습니다', 'err'); return; }
    if (grabbing) return;
    const label = btn ? btn.textContent : '';
    grabbing = true;
    if (btn) { btn.setAttribute('disabled', 'disabled'); btn.textContent = '⬇ 받는 중…'; }
    /* 사용자 손가락 안에서 탭을 미리 열어 둡니다 (다운로드 시도 뒤에는 팝업이 막힘) */
    let pre = null;
    try { pre = window.open('https://cobalt.tools/', '_blank'); } catch (e) { pre = null; }
    if (pre) { try { pre.opener = null; } catch (e) {} }
    let blob = null;
    try { blob = await cobaltGrab(url, 4200); } catch (e) { blob = null; }
    grabbing = false;
    if (btn) { btn.removeAttribute('disabled'); btn.textContent = label || '⬇ 영상 받기'; }
    if (blob) {
      try { if (pre) pre.close(); } catch (e) {}
      const id = ytIdOf(url) || 'short';
      const file = new File([blob], id + '.mp4', { type: blob.type && /mp4/.test(blob.type) ? blob.type : 'video/mp4' });
      loadVideoFile(file);
      const st = el('scriptStatus');
      if (st) updateScriptStatus('MP4 받아서 영상에 세팅 완료 · 자막 굽기·내보내기 가능');
      RS.toast('MP4를 바로 받아 영상에 세팅했습니다 (' + fmtMB(blob.size) + ') — 이제 자막 굽기·MP4 내보내기 됩니다', 'ok');
      return;
    }
    const ok = await U.copy(url);
    if (!pre) pre = window.open('https://cobalt.tools/', '_blank');
    if (!pre) RS.toast("링크는 복사했습니다 · cobalt.tools를 열어 붙여넣고, 받은 파일은 '📂 받은 파일 넣기'로 넣어주세요", ok ? 'ok' : 'err');
    else RS.toast("링크 복사 완료 · cobalt에서 받은 뒤 '📂 받은 파일 넣기'를 눌러주세요", ok ? 'ok' : 'err');
  }

  /* 새로고침해도 고른 유튜브 원본은 다시 세팅 (MP4 blob은 세션에만 남음) */
  function restoreStage() {
    const p = S.project, src = p.source || {};
    if (stage.kind !== 'none') return;
    if (src.type === 'youtube' && src.id) {
      if (!S.ui.picked || !S.ui.picked.id) S.ui.picked = { id: src.id, url: src.url, title: src.title, channel: src.channel, views: src.views, cat: src.cat };
      openStageYoutube({ id: src.id, url: src.url, title: src.title || p.name, channel: src.channel, views: src.views });
    }
  }

  function bindStage() {
    const prev = el('styPrev'), next = el('styNext');
    if (prev) prev.addEventListener('click', () => stepStyle(-1));
    if (next) next.addEventListener('click', () => stepStyle(1));
    renderStyleDots();

    const wrap = el('stageWrap');
    if (wrap) {
      let sx = 0, sy = 0, st = 0, tracking = false;
      wrap.addEventListener('touchstart', e => {
        if (e.touches.length !== 1) return;
        const t = e.touches[0]; sx = t.clientX; sy = t.clientY; st = Date.now(); tracking = true;
      }, { passive: true });
      wrap.addEventListener('touchcancel', () => { tracking = false; }, { passive: true });
      wrap.addEventListener('touchend', e => {
        if (!tracking) return;
        tracking = false;
        const t = e.changedTouches && e.changedTouches[0]; if (!t) return;
        const dx = t.clientX - sx, dy = t.clientY - sy;
        if (Math.abs(dx) > 38 && Math.abs(dx) > Math.abs(dy) * 1.2 && Date.now() - st < 900) stepStyle(dx < 0 ? 1 : -1);
      }, { passive: true });
    }

    const media = el('stageMedia');
    if (media) media.addEventListener('click', e => {
      if (e.target.closest('.stage-empty') || e.target.closest('a')) return;
      S.ui.pinnedCue = null;
      stage.last = performance.now();
      paintOverlay(true);
    });

    const big = el('stageBig');
    if (big) big.addEventListener('click', () => {
      stage.big = !stage.big;
      const dock = el('stageDock');
      if (dock) dock.classList.toggle('is-big', stage.big);
      big.textContent = stage.big ? '⤡ 줄이기' : '⤢ 크게';
      setTimeout(() => { lastOverlayKey = ''; paintOverlay(true); }, 80);
    });

    const snd = el('stageSound');
    if (snd) snd.addEventListener('click', () => {
      const v = el('stageVideo');
      if (!v || stage.kind !== 'video') return;
      v.muted = !v.muted;
      if (!v.muted) { try { v.play(); } catch (e) {} }
      snd.textContent = v.muted ? '🔇 소리' : '🔊 소리';
    });

    const fi = el('stageFile');
    if (fi) fi.addEventListener('change', e => {
      const f = e.target.files && e.target.files[0];
      e.target.value = '';
      if (f) loadVideoFile(f);
    });

    const dl = el('stageDl');
    if (dl) dl.addEventListener('click', () => {
      const v = S.ui.picked || {};
      if (v.url) grabVideo(v.url, dl);
      else RS.toast('1단계에서 영상을 먼저 고르세요', 'err');
    });

    /* 스크롤하면 스테이지를 살짝 접어 대본 자리를 확보 (자막은 계속 위에서 보임) */
    const panel = el('tab-script');
    if (panel) {
      panel.addEventListener('scroll', () => {
        const y = panel.scrollTop;
        const dock = el('stageDock');
        if (!dock) return;
        if (y > 90 && !dock.classList.contains('is-compact')) dock.classList.add('is-compact');
        else if (y < 30 && dock.classList.contains('is-compact')) dock.classList.remove('is-compact');
      }, { passive: true });
    }

    if (window.ResizeObserver) {
      const ro = new ResizeObserver(() => {
        lastOverlayKey = '';
        paintOverlay(true);
        /* 스티키 스테이지 높이만큼 스크롤 여백을 잡아 입력칸이 가려지지 않게 */
        const dock = el('stageDock');
        if (dock && panel) panel.style.setProperty('--dock-h', Math.round(dock.getBoundingClientRect().height + 8) + 'px');
      });
      if (el('stageMedia')) ro.observe(el('stageMedia'));
      if (el('stageDock')) ro.observe(el('stageDock'));
    }
  }

  function updateScriptStatus(txt) {
    const s = el('scriptStatus');
    if (!s) return;
    s.textContent = txt || ('영상 흐름에 맞춘 ' + (S.project.cues || []).length + '줄');
  }

  /* 외국어 제목이면 Gemini로 자연스러운 한국어 제목·대본을 새로 뽑습니다 */
  function isForeignTitle(t) {
    const s = String(t || '').replace(/[\s\d#@.,!?~'"(){}\[\]·…\-_/|]/g, '');
    if (s.length < 4) return false;
    const hangul = (s.match(/[가-힣]/g) || []).length;
    return hangul / s.length < 0.25;
  }
  async function autoTranslateForeign(v) {
    if (!isForeignTitle(v && v.title)) return;
    if (!RS.ai.hasGemini()) {
      updateScriptStatus('외국어 영상 · 한국어 기본 대본 (키를 넣으면 자동 번역)');
      return;
    }
    const st = el('scriptStatus');
    if (st) st.innerHTML = '<span class="spin"></span> 외국 밈 자동 번역 중…';
    try {
      const res = await RS.ai.translateShort({ title: v.title, channel: v.channel, cat: v.cat });
      if (res.title_ko) {
        const tk = String(res.title_ko).replace(/^[\s"'“”‘’]+|[\s"'“”‘’]+$/g, '').slice(0, 34);
        S.project.name = tk;
        S.project.topic = tk;
        el('aiTopic').value = tk;
        el('projName').value = tk;
        const nm = el('stageSrcName'); if (nm) nm.textContent = tk;
      }
      S.ui.pinnedCue = null;
      applyScript(res, 'ko');
      stage.capT = 0; stage.last = performance.now();
      RS.toast('🌐 외국 밈을 한국어로 번역해 영상 흐름에 맞는 대본을 새로 썼습니다', 'ok');
    } catch (e) {
      RS.toast('자동 번역 실패 — ' + e.message + ' (한국어 기본 대본으로 둡니다)', 'err');
    } finally {
      updateScriptStatus();
    }
  }

  /* 🔄 다른 추천 대본 — 누를 때마다 새 각도 */
  let regenN = 0;
  async function regenScript() {
    const p = S.project;
    const topic = ((el('aiTopic') && el('aiTopic').value) || '').trim() || p.topic || p.name;
    if (!topic) { RS.toast('주제를 한 줄 넣어주세요', 'err'); el('aiTopic').focus(); return; }
    const btn = el('regenScript');
    const label = btn ? btn.textContent : '';
    if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spin"></span> 새 대본 쓰는 중'; }
    const st = el('scriptStatus');
    if (st) st.textContent = '새 각도로 쓰는 중…';
    regenN++;
    try {
      const res = await RS.ai.regen(p, {
        topic, tone: el('aiTone').value, lang: el('aiLang').value,
        lengthSec: +el('aiLen').value, attempt: regenN
      });
      S.ui.pinnedCue = null;
      applyScript(res, el('aiLang').value);
      stage.capT = 0; stage.last = performance.now();
      paintOverlay(true);
      RS.toast(res.source === 'gemini'
        ? '추천 대본 ' + regenN + '번째 · ' + res.cues.length + '줄 (음슴체 0%)'
        : '새 각도 대본 ' + res.cues.length + '줄 · Gemini 키를 넣으면 누를 때마다 새로 씁니다', 'ok');
    } catch (e) {
      RS.toast('새 대본 실패: ' + e.message, 'err');
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = label || '🔄 다른 추천 대본'; }
      updateScriptStatus();
    }
  }

  /* ── 1단계 미리보기 모달 ─────────────────────────────── */
  const PV = { item: null, kind: '' };
  function openPreview(item, kind) {
    if (!item) return;
    PV.item = item; PV.kind = kind || 'short';
    const fr = el('pvIframe'), vd = el('pvVideo'), sk = el('pvSkel');
    const title = el('pvTitle'), meta = el('pvMeta');
    if (!title) return;
    title.textContent = item.title || '미리보기';
    meta.textContent = (kind === 'original'
      ? [item.cat || '무가공 원본', item.len ? Math.round(item.len) + '초' : '', item.w && item.h ? item.w + '×' + item.h : '']
      : [item.channel, item.views ? '조회 ' + U.fmtNum(item.views) + '회' : '', item.cat]).filter(Boolean).join(' · ');
    if (sk) sk.hidden = false;
    const dl = el('pvDl'), op = el('pvOpen'), co = el('pvCobalt'), pick = el('pvPick');
    if (dl) dl.hidden = true;
    if (op) op.hidden = true;
    if (co) { co.hidden = true; co.textContent = '⬇ 영상 받기'; }
    if (pick) pick.textContent = kind === 'original' ? '🎬 이 원본으로 편집 →' : '이걸로 대본·편집 →';

    if (kind === 'original') {
      const url = origUrl(item);
      if (fr) { fr.hidden = true; fr.removeAttribute('src'); }
      if (vd) {
        vd.hidden = false;
        if (vd.src !== new URL(url, location.href).href) vd.src = url;
        try { const pr = vd.play(); if (pr && pr.catch) pr.catch(() => {}); } catch (e) {}
      }
      if (dl) { dl.href = url; dl.download = String(item.file || '').split('/').pop(); dl.hidden = false; }
    } else {
      const id = (item.id && /^[A-Za-z0-9_-]{6,}$/.test(String(item.id))) ? String(item.id) : ytIdOf(item.url);
      if (vd) { vd.hidden = true; try { vd.pause(); } catch (e) {} vd.removeAttribute('src'); }
      if (fr) {
        fr.hidden = false;
        fr.src = 'https://www.youtube.com/embed/' + id + '?playsinline=1&autoplay=1&rel=0&modestbranding=1';
      }
      if (op) { op.href = item.url || ('https://www.youtube.com/shorts/' + id); op.hidden = false; }
      if (co) co.hidden = false;
    }
    RS.openModal('preview');
    setTimeout(() => { if (sk) sk.hidden = true; }, 1200);
  }
  function closePreview() {
    const vd = el('pvVideo');
    if (vd) { try { vd.pause(); } catch (e) {} vd.removeAttribute('src'); try { vd.load(); } catch (e) {} vd.hidden = true; }
    const fr = el('pvIframe');
    if (fr) { fr.removeAttribute('src'); fr.hidden = true; }
    RS.closeModal('preview');
  }
  function bindPreviewModal() {
    $$('[data-close="preview"]').forEach(b => b.addEventListener('click', () => closePreview()));
    const pick = el('pvPick');
    if (pick) pick.addEventListener('click', () => {
      const it = PV.item; if (!it) return;
      closePreview();
      if (PV.kind === 'original') applyOriginal(it.id);
      else selectShort(it);
    });
    const co = el('pvCobalt');
    if (co) co.addEventListener('click', () => {
      const it = PV.item || {};
      const url = it.url || (it.id ? 'https://www.youtube.com/shorts/' + it.id : '');
      grabVideo(url, co);
    });
    const pf = el('pvFile');
    if (pf) pf.addEventListener('change', e => {
      const f = e.target.files && e.target.files[0];
      e.target.value = '';
      if (f) loadVideoFile(f);
    });
  }

  function cleanLine(t) {
    return String(t == null ? '' : t).replace(/^[\s"'“”‘’「」]+|[\s"'“”‘’「」]+$/g, '').trim();
  }
  function applyScript(res, lang, keepComments) {
    const p = S.project;
    p.hook.line1 = cleanLine(res.hook1) || p.hook.line1;
    p.hook.line2 = cleanLine(res.hook2) || p.hook.line2;
    p.lang = lang || 'ko';
    const old = p.cues;
    p.cues = res.cues.map((c, i) => ({
      id: U.uid(), text: cleanLine(c.text), start: c.start, end: c.end, sfx: i === 0 ? 'impact' : '',
      comment: keepComments && old[i] ? old[i].comment : { on: false, text: '', name: '시청자' }
    }));
    if (res.titles) p.meta.titles = res.titles.map(t => cleanLine(t).slice(0, 100));
    if (res.desc != null) p.meta.desc = res.desc;
    if (res.tags != null) p.meta.tags = res.tags;
    p.topic = el('aiTopic').value.trim() || p.topic;
    S.player.t = 0;
    syncProjectToUI(true);
    renderCues();
    touch();
  }

  /* ── one-click: style preset rail ───────────────────── */
  function previewProject(pr) {
    const pill = pr.hook && pr.hook.style === 'pill';
    return {
      ratio: '9:16', presetId: pr.id,
      hook: Object.assign({ on: true, line1: pill ? '속보' : '이거 실화냐', line2: pill ? '방금 확정됐다' : '3초 만에 벌어졌다', style: 'plain', color: '#FFFFFF', accent: '#FFFFFF', bg: '#000000', size: 54, band: 0.17 }, U.clone(pr.hook)),
      sub: Object.assign({ fontSize: 56, weight: 900, accent: '#FFFFFF', box: true, boxColor: 'rgba(0,0,0,.72)', radius: 0, pos: 0.78, autoNumber: true }, U.clone(pr.sub)),
      card: Object.assign({ on: true, style: 'square', bg: 'rgba(0,0,0,.85)', radius: 0, x: 0.07, y: 0.42, name: '베댓' }, U.clone(pr.card)),
      tag: Object.assign({ on: false, text: '' }, U.clone(pr.tag)),
      grade: pr.grade || 'none', bright: pr.bright || 0, contrast: pr.contrast || 0, sat: pr.sat || 0,
      zoom: pr.zoom || 1, offset: pr.offset == null ? 0.5 : pr.offset, letterbox: pr.letterbox || 0,
      grain: 1, source: { type: 'sample', sample: pr.sample || 'docu' },
      cues: [{ id: 'pv', text: '핵심 #한마디', start: 0, end: 4, sfx: '', comment: { on: true, text: '이건 못 참지', name: '베댓' } }]
    };
  }

  function paintStylePreview(canvas, pr) {
    try {
      const ctx = canvas.getContext('2d');
      if (!ctx || !RS.render || !RS.render.draw) return;
      RS.render.draw(ctx, canvas.width, canvas.height, previewProject(pr), 1.7, {});
    } catch (e) {}
  }
  /* 검수용: 카드 미리보기와 같은 프로젝트를 다른 크기로도 그려볼 수 있게 */
  RS.stylePreviewProject = previewProject;
  RS.paintStylePreview = paintStylePreview;

  function renderStyleCards() {
    const box = el('styleGrid'); if (!box) return;   /* 2단계 가로 레일 폐기 — 스타일은 스테이지 스와이프로 */
    const builtin = S.presets.filter(p => p.builtin);
    box.innerHTML = builtin.map(pr => {
      const on = S.project.presetId === pr.id;
      const rate = (pr.voiceRate || 1).toFixed(2).replace(/0$/, '').replace(/\.$/, '');
      return `<button class="style-card${on ? ' on' : ''}" data-preset-id="${U.esc(pr.id)}" aria-pressed="${on}" aria-label="${U.esc(pr.name)} 적용">
        <span class="sc-preview">
          <canvas class="sc-canvas" width="216" height="384" data-preset-id="${U.esc(pr.id)}" aria-hidden="true"></canvas>
          <span class="sc-speed">${rate}x</span>
          ${on ? '<span class="sc-check">✓</span>' : ''}
        </span>
        <span class="sc-body"><b>${U.esc(pr.name)}</b><i>${U.esc(pr.short || pr.desc || '')}</i></span>
      </button>`;
    }).join('');
    const paint = () => $$('#styleGrid canvas.sc-canvas').forEach(cv => {
      const pr = S.presets.find(x => x.id === cv.dataset.presetId);
      if (pr) paintStylePreview(cv, pr);
    });
    paint();
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(paint);
  }

  /* ── one-click: script tools ────────────────────────── */
  /* 음슴체(~함·~임·~됨·~모름) 검출: 어미로 판단하되 명사는 제외 */
  const EUM_SPECIAL = [['어려움', '어렵습니다'], ['쉬움', '쉽습니다'], ['나쁨', '나쁩니다'], ['다름', '다릅니다'], ['느림', '느립니다'], ['빠름', '빠릅니다'], ['아님', '아닙니다'], ['모름', '모릅니다']];
  const EUM_NOUN = ['처음', '마음', '이름', '가슴', '모음', '자음', '소음', '잡음', '녹음', '방음', '고음', '저음', '단음', '장음', '중음', '여음', '흡음', '차음', '위임', '수임', '전임', '겸임', '상임', '생김', '움직임', '줄임', '다정함', '강함', '약함', '건강', '느낌', '다음', '구름', '보름', '주름', '고름', '노름', '서름', '모름'];
  const EUM_RE = /(했음|됐음|었음|았음|였음|겠음|함|됨|임|짐|김|뀜|침|힘|림|남|듦|쁨|큼|끔|음|움|픔|름)$/;
  function lastToken(text) {
    const words = String(text || '').replace(/[.!?~…"'”’]+$/g, '').trim().split(/\s+/);
    return words.length ? words[words.length - 1].replace(/[,.!?~…"'”’]+$/g, '') : '';
  }
  function eumWord(text) {
    const t = String(text || '').replace(/[.!?~…"'”’]+$/g, '').trim();
    const words = t.split(/\s+/).filter(Boolean);
    if (!words.length) return '';
    let w = words[words.length - 1].replace(/[,.!?~…"'”’]+$/g, '');
    /* “안 됨”처럼 한 글자 어미로 끝나면 앞말과 붙여서 판단 */
    if (w.length < 2 && words.length > 1) {
      const prev = words[words.length - 2].replace(/[^가-힣]/g, '');
      if (prev) w = prev + w;
    }
    return w;
  }
  function hasEumSum(text) {
    const w = eumWord(text);
    if (!w || w.length < 2) return false;
    if (EUM_NOUN.indexOf(w) >= 0) return false;
    return EUM_RE.test(w);
  }
  function eumConvert(text) {
    const src = String(text);
    const m = /([가-힣]+)(\s*[.!?~…"'”’]*)$/.exec(src);
    if (!m) return src;
    const word = m[1], tail = m[2];
    if (EUM_NOUN.indexOf(word) >= 0) return src;
    /* 한 글자 어미(안 됨 → 안 됩니다) */
    if (word.length === 1) {
      const one = { '됨': '됩니다', '함': '합니다', '임': '입니다', '짐': '집니다', '김': '깁니다', '음': '습니다' }[word];
      if (!one) return src;
      return src.slice(0, src.length - (word + tail).length) + one + tail;
    }
    if (word.length < 2) return src;
    let rep = null;
    for (const [a2, b2] of EUM_SPECIAL) if (word.endsWith(a2)) { rep = word.slice(0, -a2.length) + b2; break; }
    if (!rep) {
      if (/했음$/.test(word)) rep = word.replace(/했음$/, '했습니다');
      else if (/됐음$/.test(word)) rep = word.replace(/됐음$/, '됐습니다');
      else if (/(었|았|였)음$/.test(word)) rep = word.replace(/음$/, '습니다');
      else if (/겠음$/.test(word)) rep = word.replace(/겠음$/, '겠습니다');
      else if (/함$/.test(word)) rep = word.replace(/함$/, '합니다');
      else if (/됨$/.test(word)) rep = word.replace(/됨$/, '됩니다');
      else if (/임$/.test(word)) rep = word.replace(/임$/, '입니다');
      else if (/짐$/.test(word)) rep = word.replace(/짐$/, '집니다');
      else if (/김$/.test(word)) rep = word.replace(/김$/, '깁니다');
      else if (/뀜$/.test(word)) rep = word.replace(/뀜$/, '뀝니다');
      else if (/침$/.test(word)) rep = word.replace(/침$/, '칩니다');
      else if (/힘$/.test(word)) rep = word.replace(/힘$/, '힙니다');
      else if (/림$/.test(word)) rep = word.replace(/림$/, '립니다');
      else if (/남$/.test(word)) rep = word.replace(/남$/, '납니다');
      else if (/듦$/.test(word)) rep = word.replace(/듦$/, '듭니다');
      else if (/쁨$/.test(word)) rep = word.replace(/쁨$/, '뿝니다');
      else if (/큼$/.test(word)) rep = word.replace(/큼$/, '큽니다');
      else if (/끔$/.test(word)) rep = word.replace(/끔$/, '낍니다');
      else if (/음$/.test(word)) rep = word.replace(/음$/, '습니다');
      else if (/움$/.test(word)) rep = word.replace(/움$/, '웁니다');
      else if (/픔$/.test(word)) rep = word.replace(/픔$/, '픕니다');
      else if (/름$/.test(word)) rep = word.replace(/름$/, '릅니다');
    }
    if (!rep) return src;
    return src.slice(0, src.length - (word + tail).length) + rep + tail;
  }

  const KEY_TERMS = ['강아지','고양이','동물','반전','CCTV','블랙박스','꿀팁','레시피','요리','운동','여행','자연','일본','해외','신기한','웃긴','공감','AI','Gemini','아이폰','유튜브','쇼츠','구독자','조회수','역대급','레전드','충격','소름','처음'];
  function emphasizeText(text) {
    const p = S.project;
    const topicKeys = String(p.topic || '').split(/[\s,·.!?~]+/).filter(w => w.length >= 2).slice(0, 8);
    const keys = KEY_TERMS.concat(topicKeys);
    let count = 0;
    const out = String(text).split(/(\s+)/).map(tok => {
      if (!tok || /^\s+$/.test(tok)) return tok;
      if (count >= 3) return tok;
      if (/^[#*]/.test(tok) || /[#*]/.test(tok)) return tok;
      const core = tok.replace(/[,.!?~…"'”’]+$/, '');
      const tail = tok.slice(core.length);
      if (!core) return tok;
      if (/^\d[\d,.]*(%|조|억|만|천|배|원|초|명|개|분|시간|포인트)?$/.test(core)) { count++; return '#' + core + tail; }
      if (keys.some(k => k === core || (core.length > 1 && core === k + '는') )) { count++; return '#' + core + tail; }
      if (/^\d[\d,.]*(%|조|억|만|천|배|원|초|명|개|분|시간)/.test(core)) { count++; return '#' + core + tail; }
      if (keys.includes(core)) { count++; return '#' + core + tail; }
      return tok;
    }).join('');
    return { text: out, added: count };
  }

  function bindQuickTools() {
    const sg = el('styleGrid');
    if (sg) sg.addEventListener('click', e => {
      const b = e.target.closest('.style-card'); if (!b) return;
      const pr = S.presets.find(x => x.id === b.dataset.presetId);
      if (!pr) return;
      applyPreset(pr);
      RS.toast(pr.name + ' 적용 — 띠·자막·강조색·배속·댓글 카드까지 한 번에 바뀌었습니다', 'ok');
    });
    el('toneFix').addEventListener('click', () => {
      const p = S.project; let n = 0;
      p.cues.forEach(c => { if (hasEumSum(c.text)) { c.text = eumConvert(c.text); n++; } });
      renderCues(); touch(); drawStatic();
      RS.toast(n ? '음슴체 ' + n + '곳을 구어체로 바꿨습니다' : '음슴체가 없습니다 — 이미 구어체입니다', n ? 'ok' : '');
    });
    el('emphFix').addEventListener('click', () => {
      const p = S.project; let n = 0, marks = 0;
      p.cues.forEach(c => {
        const r = emphasizeText(c.text);
        if (r.added) { c.text = r.text; n++; marks += r.added; }
      });
      renderCues(); touch(); drawStatic();
      RS.toast(n ? n + '개 큐에 강조 ' + marks + '곳을 넣었습니다 (#단어 는 강조색)' : '이미 강조가 충분합니다', n ? 'ok' : '');
    });
    el('tempoFix').addEventListener('click', () => {
      const p = S.project;
      if (!p.cues.length) { RS.toast('큐가 없습니다', 'err'); return; }
      const total = U.totalDur(p);
      if (!total) { RS.toast('큐 시간이 비어 있습니다', 'err'); return; }
      const k = 25 / total;
      let acc = 0;
      p.cues.sort((a, b) => a.start - b.start).forEach(c => {
        const d = Math.max(0.4, (c.end - c.start) * k);
        c.start = +acc.toFixed(1); acc += d; c.end = +acc.toFixed(1);
      });
      p.cues[p.cues.length - 1].end = 25.0;
      seekTo(0); renderCues(); touch(); drawStatic();
      RS.toast('전체 ' + total.toFixed(1) + '초 → 25.0초로 템포를 맞췄습니다', 'ok');
    });
  }

  /* ── 인기 쇼츠 가로 레일 ─────────────────────────────── */
  const SHORT_CFG = {
    '동물': { preset: 'healing-vlog', bgm: 'emotion', emoji: '🐾', comments: ['심장 쫄깃했다', '이건 못 참지', '몇 번을 봐도 웃김', '혹시 우리 집 애인가요'] },
    'ASMR': { preset: 'healing-vlog', bgm: 'emotion', emoji: '🎧', comments: ['소리만 들어도 힐링', '이거 무한반복임', '귀가 녹는다'] },
    '여행': { preset: 'cinema-cut', bgm: 'docu', emoji: '🌄', comments: ['여기 어디야', '저장해둠', '가고 싶다 진짜'] },
    '해외일상': { preset: 'white-meme', bgm: 'trendy', emoji: '🗾', comments: ['이런 일상 좋다', '일본 가고 싶다', '디테일 미쳤다'] },
    '운동': { preset: 'punch-cut', bgm: 'trendy', emoji: '🏃', comments: ['오늘부터 한다', '100번 가능?', '무릎 조심하세요'] },
    '요리': { preset: 'white-meme', bgm: 'humor', emoji: '🍳', comments: ['이건 저장', '해먹어야지', '재료가 뭐야'] },
    '유머': { preset: 'comment-flood', bgm: 'humor', emoji: '😂', comments: ['이거 실화냐', '빵 터졌다', '몇 번 봐도 웃김'] },
    '반전': { preset: 'punch-cut', bgm: 'tension', emoji: '🎭', comments: ['2번 봐야 이해됨', '소름 돋았다', '이게 반전이지'] },
    '꿀팁': { preset: 'white-meme', bgm: 'trendy', emoji: '💡', comments: ['이건 진짜 유용', '바로 저장함', '오늘 해봐야지'] },
    '자연': { preset: 'cinema-cut', bgm: 'docu', emoji: '🌿', comments: ['압도된다', '이게 한국이야?', '영상미 미쳤다'] },
    'CCTV': { preset: 'breaking-news', bgm: 'tension', emoji: '📹', comments: ['아찔하다', '전방주시 필수', '3초 만에 벌어짐'] },
    '블랙박스': { preset: 'breaking-news', bgm: 'tension', emoji: '🚗', comments: ['아찔하다', '저건 좀 심했다', '다들 조심하세요'] },
    '신기한 현상': { preset: 'docu-hook', bgm: 'tension', emoji: '✨', comments: ['이게 가능해?', '소름 돋았다', '과학적으로 설명되나'] },
    '공감': { preset: 'comment-flood', bgm: 'humor', emoji: '🙂', comments: ['완전 내 얘기', '이거 나잖아', '공감 100%'] }
  };
  const shortCfg = cat => SHORT_CFG[cat] || SHORT_CFG['유머'];

  function renderPopRail(list) {
    const box = el('popRail'); if (!box) return;
    box.innerHTML = (list || []).map(v => {
      const cfg = shortCfg(v.cat);
      return `<button class="pop-item" data-id="${U.esc(v.id)}" aria-label="${U.esc(v.title)} · ${U.fmtNum(v.views)}회">
        <div class="pop-thumb">
          <span class="pop-ph" aria-hidden="true">${cfg.emoji}</span>
          ${v.thumb ? `<img src="${U.esc(v.thumb)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.style.display='none'">` : ''}
          <span class="pop-play" data-prev="1" role="button" aria-label="미리보기 재생">▶</span>
          <span class="pop-views">${U.fmtNum(v.views)}</span>
          <span class="pop-cat">${U.esc(v.cat || '인기')}</span>
        </div>
        <div class="pop-title">${U.esc(v.title)}</div>
      </button>`;
    }).join('');
    box.querySelectorAll('.pop-item').forEach(b => b.addEventListener('click', e => {
      const item = (list || []).find(x => String(x.id) === b.dataset.id);
      if (!item) return;
      if (e.target.closest('[data-prev]')) { openPreview(item, 'short'); return; }
      selectShort(item);
    }));
  }

  /* 받아둔 실시간 목록이 있으면 재조회 없이 지금 설정으로 다시 그림 */
  function refreshPopular() {
    const raw = RS.tube.lastPopularRaw;
    if (raw && raw.length) {
      renderPopRail(RS.safeFilter.filter(raw).list);
      RS.tube.lastPopularSafe = Object.assign({}, RS.tube.lastPopularSafe,
        { active: safeOn(), removed: RS.safeFilter.filter(raw).removed.length });
      return true;
    }
    const sample = safeList(RS.popularShorts);
    renderPopRail(sample);
    return false;
  }
  async function loadPopularRail() {
    if (refreshPopular()) {
      const t = el('popSource'); if (t) { t.textContent = 'YouTube 실시간'; t.className = 'tag lime'; }
      refreshPopSafeChip();
      return;
    }
    const tag = el('popSource'); if (tag) tag.textContent = '샘플 · 11.27 조회수';
    refreshPopSafeChip();
    if (!RS.ai.hasYouTube()) return;
    try {
      const list = await RS.tube.popular();
      if (list && list.length) {
        renderPopRail(list);
        if (tag) { tag.textContent = RS.tube.lastPopularSource === '공개 트렌드' ? '공개 트렌드' : 'YouTube 실시간'; tag.className = 'tag lime'; }
      }
      refreshPopSafeChip();
    } catch (e) {
      if (tag) tag.textContent = '샘플 · 11.27 조회수';
      refreshPopSafeChip();
    }
  }

  /* 🔄 인기 쇼츠도 다른 영상으로 */
  let popMoreBusy = false;
  async function loadPopularMore() {
    if (popMoreBusy) return;
    popMoreBusy = true;
    const btn = el('popMore');
    if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spin"></span>'; }
    const tag = el('popSource');
    try {
      const list = await RS.tube.popular({ more: true });
      if (list && list.length) {
        renderPopRail(list);
        if (tag) { tag.textContent = RS.tube.lastPopularSource === '공개 트렌드' ? '공개 트렌드' : 'YouTube 실시간'; tag.className = 'tag lime'; }
      }
      refreshPopSafeChip();
    } catch (e) {
      RS.toast('인기 영상은 잠시 후 다시 시도해 주세요');
    } finally {
      popMoreBusy = false;
      if (btn) { btn.disabled = false; btn.innerHTML = '🔄'; }
    }
  }

  function showSourcePanel(v) {
    S.ui.picked = v;
    if (!v) return;
    const local = !!v.local;
    updateStageFoot(local
      ? { kind: 'video', name: S.media.videoName || String(v.file || '').split('/').pop(), size: v.bytes }
      : { kind: 'youtube', title: v.title, channel: v.channel, views: v.views, url: v.url });
  }

  function selectShort(v) {
    if (!v) return;
    const p = S.project, cfg = shortCfg(v.cat);
    p.name = String(v.title || '인기 쇼츠').slice(0, 34);
    p.topic = v.title || '';
    el('aiTopic').value = p.topic;
    el('aiLang').value = 'ko';
    el('aiLen').value = '28';
    applyScript(RS.ai.viral(v.title || '', v.cat || '유머'), 'ko');
    if (p.cues[0]) p.cues[0].sfx = 'impact';
    const seed = String(v.title || '').length;
    [2, 5].forEach((idx, k) => {
      const c = p.cues[idx]; if (!c) return;
      c.comment = { on: true, text: cfg.comments[(seed + k * 2) % cfg.comments.length], name: '시청자' };
    });
    const pr = S.presets.find(x => x.id === cfg.preset);
    if (pr) applyPreset(pr);
    p.bgm = Object.assign({}, p.bgm, { id: cfg.bgm, on: true });
    S.ui.picked = v;
    S.ui.pinnedCue = null;
    if (S.media.videoURL) clearVideo();
    const ytId = (v.id && /^[A-Za-z0-9_-]{6,}$/.test(String(v.id))) ? String(v.id) : ytIdOf(v.url);
    p.source = { type: 'youtube', id: ytId, url: v.url || ('https://www.youtube.com/shorts/' + ytId), title: v.title || '', channel: v.channel || '', views: v.views || 0, cat: v.cat || '' };
    openStageYoutube(v);
    renderCues(); syncProjectToUI(true); drawStatic(); touch();
    setTab('script');
    stage.capT = 0; stage.last = performance.now();
    paintStageMedia(); paintOverlay(true); syncStyleBar();
    updateScriptStatus();
    RS.toast((v.cat || '인기') + ' 쇼츠 · 영상이 위에서 바로 재생됩니다 — 옆으로 넘겨 스타일을 고르세요', 'ok');
    autoTranslateForeign(v);
  }

  function bindSourcePanel() { /* 원본 패널은 2단계 스테이지로 흡수 */ }

  /* ── 내 보이스 보관함 ───────────────────────────────── */
  const VL = { items: [], db: null, preview: null, previewURL: null, curId: null };
  const fmtMB = n => n < 1048576 ? Math.max(1, Math.round(n / 1024)) + 'KB' : (n / 1048576).toFixed(1) + 'MB';

  function vlOpen() {
    return new Promise(resolve => {
      try {
        const r = indexedDB.open('reelstudio.voices', 1);
        r.onupgradeneeded = () => { try { r.result.createObjectStore('voices', { keyPath: 'id' }); } catch (e) {} };
        r.onsuccess = () => { VL.db = r.result; resolve(r.result); };
        r.onerror = () => resolve(null);
      } catch (e) { resolve(null); }
    });
  }
  function vlStore(mode) { return VL.db.transaction('voices', mode).objectStore('voices'); }
  function vlAll() {
    return new Promise(resolve => {
      if (!VL.db) return resolve([]);
      const req = vlStore('readonly').getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => resolve([]);
    });
  }
  function vlPut(item) { if (!VL.db) return; try { vlStore('readwrite').put(item); } catch (e) {} }
  function vlDelete(id) { if (!VL.db) return; try { vlStore('readwrite').delete(id); } catch (e) {} }

  function probeDur(blob) {
    return new Promise(res => {
      let u = URL.createObjectURL(blob), a = new Audio();
      const done = v => { URL.revokeObjectURL(u); res(v); };
      a.preload = 'metadata';
      a.onloadedmetadata = () => done(a.duration || 0);
      a.onerror = () => done(0);
      a.src = u;
    });
  }

  async function voiceLibInit() {
    await vlOpen();
    VL.items = await vlAll();
    renderVoiceLib();
    if (S.project.voice.itemId) {
      const it = VL.items.find(x => x.id === S.project.voice.itemId);
      if (it) applyVoice(it, true);
    }
  }

  function renderVoiceLib() {
    const box = el('voiceLib'); if (!box) return;
    el('voiceLibCount').textContent = VL.items.length + '개';
    VL.items.sort((a, b) => b.addedAt - a.addedAt);
    if (!VL.items.length) {
      box.innerHTML = '<div class="voice-empty">아직 담긴 보이스가 없습니다. 타입캐스트에서 받은 mp3를 올려두면 여기서 딸깍 교체됩니다.</div>';
    } else {
      box.innerHTML = VL.items.map(it => {
        const on = VL.curId === it.id;
        return `<div class="vcard${on ? ' on' : ''}" data-id="${it.id}" role="button" tabindex="0" aria-label="${U.esc(it.name)} 적용">
          <button class="vdel" data-del="${it.id}" title="삭제">✕</button>
          <div class="vn">${U.esc(it.name)}</div>
          <div class="vs">${fmtMB(it.size)}${it.dur ? ' · ' + it.dur.toFixed(1) + '초' : ''}${on ? ' · <span class="von">적용됨</span>' : ''}</div>
          <div class="vacts"><button class="vplay" data-play="${it.id}">▶ 미리듣기</button><button class="vplay" data-edit="${it.id}">✎ 이름</button></div>
        </div>`;
      }).join('');
    }
    const name = S.project.voice.fileName;
    if (el('voiceNow')) el('voiceNow').textContent = name
      ? ('지금 나레이션: ' + name + ' · ' + S.project.voice.rate.toFixed(2) + 'x · 미리보기와 MP4에 섞입니다')
      : '지금 나레이션: 없음 (보관함에서 mp3를 딸깍)';
  }

  function stopVoicePreview() {
    if (VL.preview) { try { VL.preview.pause(); } catch (e) {} VL.preview = null; }
    if (VL.previewURL) { URL.revokeObjectURL(VL.previewURL); VL.previewURL = null; }
  }
  function previewVoice(it) {
    stopVoicePreview();
    const url = URL.createObjectURL(it.blob);
    const a = new Audio(url);
    VL.previewURL = url; VL.preview = a;
    a.onended = stopVoicePreview;
    a.play().then(() => RS.toast('▶ ' + it.name)).catch(err => RS.toast('재생 실패: ' + err.message, 'err'));
  }

  async function applyVoice(it, silent) {
    try {
      await A.loadNarration(it.blob);
      S.project.voice.file = it.name;
      S.project.voice.fileName = it.name;
      S.project.voice.itemId = it.id;
      S.media.narrationName = it.name;
      VL.curId = it.id;
      if (el('voiceFileName')) el('voiceFileName').textContent = it.name;
      if (el('voiceFileClear')) el('voiceFileClear').hidden = false;
      renderVoiceLib(); touch();
      if (!silent) RS.toast('딸깍 교체 · ' + it.name + ' · ' + S.project.voice.rate.toFixed(2) + 'x로 바로 섞입니다', 'ok');
    } catch (e) {
      RS.toast('이 파일은 읽지 못했습니다: ' + e.message, 'err');
    }
  }

  async function addVoiceFiles(files) {
    const list = Array.from(files || []).filter(f => /^audio\//.test(f.type) || /\.(mp3|wav|m4a|aac|ogg|flac)$/i.test(f.name));
    if (!list.length) { RS.toast('mp3 · wav · m4a 파일을 올려주세요', 'err'); return; }
    let added = 0;
    for (const f of list) {
      const it = {
        id: U.uid(), name: f.name.replace(/\.[^.]+$/, ''), blob: f, size: f.size,
        type: f.type, addedAt: Date.now(), source: 'file', dur: 0
      };
      try { it.dur = await probeDur(f); } catch (e) {}
      VL.items.push(it); vlPut(it); added++;
    }
    renderVoiceLib();
    RS.toast(added + '개 보이스를 담았습니다 · 카드를 누르면 바로 교체됩니다', 'ok');
  }

  function renameVoice(it) {
    const next = window.prompt('보이스 이름', it.name);
    if (next == null) return;
    const name = String(next).trim().slice(0, 60);
    if (!name || name === it.name) return;
    const wasApplied = VL.curId === it.id;
    it.name = name;
    vlPut(it);
    if (wasApplied) {
      S.project.voice.file = name;
      S.project.voice.fileName = name;
      S.media.narrationName = name;
      if (el('voiceFileName')) el('voiceFileName').textContent = name;
      touch();
    }
    renderVoiceLib();
    RS.toast('이름을 바꿨습니다 · ' + name, 'ok');
  }

  async function removeVoice(it) {
    if (!(await RS.confirm('보이스 삭제', '"' + it.name + '" 을(를) 보관함에서 지울까요?'))) return;
    vlDelete(it.id);
    if (VL.curId === it.id) {
      VL.curId = null;
      A.stopNarration(); A.narrationBuf = null;
      S.project.voice.file = null; S.project.voice.fileName = null; S.project.voice.itemId = null;
      S.media.narrationName = null;
      if (el('voiceFileName')) el('voiceFileName').textContent = '없음 (타입캐스트 mp3 등)';
      if (el('voiceFileClear')) el('voiceFileClear').hidden = true;
      touch();
    }
    VL.items = VL.items.filter(x => x.id !== it.id);
    renderVoiceLib();
    RS.toast('삭제했습니다');
  }

  function bindVoiceLib() {
    if (!el('voiceLibInput')) return;
    el('voiceLibInput').addEventListener('change', e => { addVoiceFiles(e.target.files); e.target.value = ''; });
    const drop = el('voiceDrop');
    if (drop) {
      drop.addEventListener('click', () => el('voiceLibInput').click());
      ['dragenter', 'dragover'].forEach(t => drop.addEventListener(t, e => { e.preventDefault(); drop.classList.add('dragover'); }));
      ['dragleave', 'dragend'].forEach(t => drop.addEventListener(t, () => drop.classList.remove('dragover')));
      drop.addEventListener('drop', e => { e.preventDefault(); drop.classList.remove('dragover'); addVoiceFiles(e.dataTransfer && e.dataTransfer.files); });
    }
    const box = el('voiceLib');
    box.addEventListener('click', e => {
      const card = e.target.closest('.vcard'); if (!card) return;
      const it = VL.items.find(x => x.id === card.dataset.id); if (!it) return;
      const del = e.target.closest('[data-del]');
      const play = e.target.closest('[data-play]');
      const edit = e.target.closest('[data-edit]');
      if (del) { e.stopPropagation(); removeVoice(it); return; }
      if (play) { e.stopPropagation(); previewVoice(it); return; }
      if (edit) { e.stopPropagation(); renameVoice(it); return; }
      applyVoice(it);
    });
    box.addEventListener('keydown', e => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      const card = e.target.closest('.vcard'); if (!card) return;
      const it = VL.items.find(x => x.id === card.dataset.id);
      if (it) { e.preventDefault(); applyVoice(it); }
    });
    el('voiceLibClear').addEventListener('click', async () => {
      if (!VL.items.length) { RS.toast('보관함이 비어 있습니다'); return; }
      if (!(await RS.confirm('보관함 비우기', '담긴 보이스 ' + VL.items.length + '개를 모두 지울까요? 되돌릴 수 없습니다.'))) return;
      VL.items.forEach(it => vlDelete(it.id));
      VL.items = [];
      stopVoicePreview();
      renderVoiceLib();
      RS.toast('보관함을 비웠습니다');
    });
    el('copyVoiceScript').addEventListener('click', async () => {
      const lines = S.project.cues.map(c => U.strip(c.text).replace(/\s+/g, ' ').trim()).filter(Boolean);
      const text = lines.join('\n');
      if (!text) { RS.toast('먼저 대본을 만들어 주세요', 'err'); return; }
      const ok = await U.copy(text);
      window.open('https://typecast.ai', '_blank', 'noopener');
      RS.toast(ok
        ? '대본 ' + S.project.cues.length + '줄 복사 · 타입캐스트를 새 탭에서 열었습니다'
        : '복사 실패 — 대본을 직접 선택해 복사한 뒤 타입캐스트에서 생성하세요', ok ? 'ok' : 'err');
    });
  }

  /* ── 음원 탭: 새 효과음 100종 ───────────────────────── */
  const SP = { cat: 'all', q: '', targetId: null, preloaded: false, preloading: null };
  const packItems = () => (RS.sfxPack && RS.sfxPack.items) || [];

  function sfxTargetCue() {
    const p = S.project;
    if (!p.cues.length) return null;
    let c = p.cues.find(x => x.id === SP.targetId);
    if (!c) {
      c = (S.ui.selectedCue && p.cues.find(x => x.id === S.ui.selectedCue)) || p.cues[0];
      SP.targetId = c.id;
    }
    return c;
  }

  function renderSfxTargets() {
    const box = el('sfxQChips'); if (!box) return;
    const p = S.project;
    const cur = sfxTargetCue();
    const total = p.cues.length;
    if (!total) { box.innerHTML = '<span class="sfx-none">큐가 없습니다 — 대본 탭에서 큐를 먼저 만드세요</span>'; return; }
    box.innerHTML = p.cues.map((c, i) => {
      const on = cur && c.id === cur.id;
      const name = RS.sfxName(c.sfx);
      return `<button class="sfx-qchip${on ? ' on' : ''}" data-id="${c.id}" title="${i + 1}번 큐 · ${U.esc(U.strip(c.text).slice(0, 30))}${c.sfx ? ' · 효과음 ' + U.esc(name) : ''}">${i + 1}${c.sfx ? '<i></i>' : ''}</button>`;
    }).join('');
  }

  function renderSfxCats() {
    const box = el('sfxCats'); if (!box) return;
    const counts = {};
    packItems().forEach(it => { counts[it.c] = (counts[it.c] || 0) + 1; });
    box.innerHTML = RS.sfxCats.map(c => {
      const n = c.id === 'all' ? packItems().length : (counts[c.id] || 0);
      return `<button class="sfx-cat${SP.cat === c.id ? ' on' : ''}" data-cat="${c.id}">${U.esc(c.name)}<i>${n}</i></button>`;
    }).join('');
  }

  function renderSfxPack() {
    const box = el('sfxPack'); if (!box) return;
    renderSfxTargets();
    renderSfxCats();
    const cur = sfxTargetCue();
    const q = SP.q.trim().toLowerCase();
    const items = packItems().filter(it => (SP.cat === 'all' || it.c === SP.cat) &&
      (!q || (it.n + ' ' + it.en + ' ' + it.f).toLowerCase().includes(q)));
    const builtinOn = SP.cat === 'all' && !q;
    const builtin = builtinOn ? RS.sfxList.map(s => `
      <button class="sfx-card is-builtin${cur && cur.sfx === s.id ? ' on' : ''}" data-id="${s.id}" title="기본 합성 효과음 · 누르면 큐에 삽입">
        <span class="sc-cat">기본</span>
        <span class="sc-play" data-play="${s.id}" title="미리듣기">▶</span>
        <span class="sc-n">${U.esc(s.name)}</span>
        <span class="sc-en">합성음</span>
      </button>`).join('') : '';
    const cards = items.map(it => `
      <button class="sfx-card${cur && cur.sfx === it.id ? ' on' : ''}" data-id="${it.id}" title="${U.esc(it.n)} (${U.esc(it.en)}) · ${it.d.toFixed(2)}초 · 누르면 큐에 삽입">
        <span class="sc-cat c-${it.c}">${U.esc(RS.sfxCatName(it.c))}</span>
        <span class="sc-play" data-play="${it.id}" title="미리듣기">▶</span>
        <span class="sc-n">${U.esc(it.n)}</span>
        <span class="sc-en">${U.esc(it.en)} · ${it.d.toFixed(1)}s</span>
      </button>`).join('');
    const head = builtinOn ? `<div class="sfx-group-lab">기본 효과음 4종 (합성 · 렌더 즉시)</div>` : '';
    const mid = (builtinOn && items.length) ? `<div class="sfx-group-lab">새 효과음 100종 · ${U.esc(RS.sfxCatName(SP.cat))}</div>` : '';
    const empty = (!items.length && !builtinOn)
      ? `<div class="sfx-empty">‘${U.esc(SP.q || RS.sfxCatName(SP.cat))}’에 맞는 효과음이 없습니다. 검색어를 줄이거나 ‘전체’로 돌아가세요.</div>` : '';
    box.innerHTML = `<div class="sfx-group">${head}${builtin}${mid}${cards}${empty}</div>`;
    const hint = el('sfxPackHint');
    if (hint) hint.hidden = false;
  }

  function setSfxState(txt, ok) {
    const t = el('sfxPackState');
    if (!t) return;
    t.textContent = txt;
    t.className = 'tag' + (ok ? ' lime' : '');
  }

  function preloadSfxPack() {
    if (SP.preloaded) return Promise.resolve();
    if (SP.preloading) return SP.preloading;
    setSfxState('불러오는 중…');
    SP.preloading = A.preloadSfxPack(null, (done, total) => {
      if (done < total) setSfxState(done + ' / ' + total);
    }).then(() => {
      SP.preloaded = true; SP.preloading = null;
      setSfxState('100종 준비됨', true);
    }).catch(() => {
      SP.preloading = null;
      setSfxState('일부 실패');
    });
    return SP.preloading;
  }

  function insertSfxInto(id) {
    const p = S.project;
    const cue = sfxTargetCue();
    if (!cue) { RS.toast('먼저 대본 큐를 만들어 주세요', 'err'); return; }
    A.resume();
    const idx = p.cues.indexOf(cue) + 1;
    if (cue.sfx === id) {
      cue.sfx = '';
      renderCues(); renderSfxPack(); touch();
      RS.toast(idx + '번 큐에서 효과음을 뺐습니다');
      return;
    }
    cue.sfx = id;
    A.playSfx(id);
    renderCues(); renderSfxPack(); touch();
    RS.toast(idx + '번 큐 시작에 ‘' + RS.sfxName(id) + '’ 박았습니다 · 미리보기와 MP4에 섞입니다', 'ok');
  }

  function bindSfxPack() {
    const box = el('sfxPack'); if (!box) return;
    box.addEventListener('click', e => {
      const play = e.target.closest('[data-play]');
      if (play) {
        A.resume(); A.playSfx(play.dataset.play);
        play.classList.add('hit'); setTimeout(() => play.classList.remove('hit'), 240);
        return;
      }
      const card = e.target.closest('.sfx-card'); if (!card) return;
      insertSfxInto(card.dataset.id);
    });
    const chips = el('sfxQChips');
    if (chips) chips.addEventListener('click', e => {
      const b = e.target.closest('.sfx-qchip'); if (!b) return;
      SP.targetId = b.dataset.id;
      renderSfxPack();
    });
    const cats = el('sfxCats');
    if (cats) cats.addEventListener('click', e => {
      const b = e.target.closest('.sfx-cat'); if (!b) return;
      SP.cat = b.dataset.cat;
      renderSfxPack();
    });
    const search = el('sfxSearch');
    if (search) search.addEventListener('input', U.debounce(e => {
      SP.q = e.target.value || '';
      renderSfxPack();
    }, 120));
  }

  /* ── discover → script ────────────────────────────── */
  const COMMENTS = {
    animal: ['심장 쫄깃했다', '이건 못 참지', '눈물 나네', '와 이건 좀', '혼자 보기 아깝다'],
    tech: ['이거 실화냐', '바로 써봐야지', '미래 온다', '소름 돋았다', '일자리 걱정된다'],
    issue: ['이거 실화냐', '나만 몰랐네', '이건 좀 무섭다', '바로 저장함', '조회수 실화?', '개미 또 물렸네', '이게 진짜라고?', '소름 돋았다']
  };
  function oneClickImport(title) {
    const p = S.project;
    p.name = String(title).slice(0, 34);
    el('aiTopic').value = title;
    el('aiLang').value = 'ko';
    el('aiLen').value = '28';
    const res = RS.ai.demo(title, 'ko', 30);
    applyScript(res, 'ko');
    const t = String(title);
    const animalish = /(동물|고양이|강아지|코끼리|냥|멍|야생|puppy|cat|dog|animal)/i.test(t);
    const techish = /(AI|테크|아이폰|갤럭시|gemini|기술|로봇|tech)/i.test(t);
    const pool = animalish ? COMMENTS.animal : techish ? COMMENTS.tech : COMMENTS.issue;
    const mix = t.length;
    [2, 5].forEach((i, k) => {
      const c = p.cues[i]; if (!c) return;
      c.comment = { on: true, text: pool[(mix + k * 3) % pool.length], name: '시청자' };
    });
    if (p.cues[0]) p.cues[0].sfx = 'impact';
    const bgm = animalish ? 'emotion' : techish ? 'trendy' : 'tension';
    if (animalish) applyPreset(S.presets.find(x => x.id === 'healing-vlog') || S.presets[0]);
    p.bgm = Object.assign({}, p.bgm, { id: bgm, on: true });
    syncProjectToUI(true);
    drawStatic();
    touch();
    setTab('script');
    stage.capT = 0; stage.last = performance.now();
    paintOverlay(true);
    RS.toast('훅 2줄 · 대본 ' + p.cues.length + '큐 · 댓글 카드 2개까지 한 번에 세팅했습니다', 'ok');
  }

  /* ── cues ───────────────────────────────────────────── */
  function autoGrow(t) { t.style.height = 'auto'; t.style.height = Math.min(160, t.scrollHeight) + 'px'; }
  function cueMetaText(c) {
    const sfx = c.sfx ? RS.sfxName(c.sfx) : '없음';
    const cmt = c.comment && c.comment.on ? ('댓글: ' + (c.comment.text || '내용 없음')) : '댓글 없음';
    return (+c.start).toFixed(1) + '~' + (+c.end).toFixed(1) + 's · 효과음: ' + sfx + ' · ' + cmt;
  }
  function updateCueDuration(row, c) {
    const d = row.querySelector('.cue-dur');
    if (d) d.textContent = (c.end - c.start).toFixed(1) + '초';
    const m = row.querySelector('.cue-meta');
    if (m) m.textContent = cueMetaText(c);
    updateMetaLine();
  }
  function selectCue(id, noScroll) {
    S.ui.selectedCue = id;
    S.ui.pinnedCue = id;
    $$('#cueList .cue').forEach(r => r.classList.toggle('is-active', r.dataset.id === id));
    if (!noScroll) {
      const row = $(`#cueList .cue[data-id="${id}"]`);
      if (row) row.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
    paintOverlay(true);
  }

  function renderCues() {
    const p = S.project;
    const list = el('cueList');
    const openIds = new Set(Array.from(list.querySelectorAll('.cue.is-open')).map(r => r.dataset.id));
    list.innerHTML = '';
    p.cues.forEach((c, i) => {
      const open = openIds.has(c.id);
      const row = document.createElement('div');
      row.className = 'cue' + (S.ui.selectedCue === c.id ? ' is-active' : '') + (open ? ' is-open' : '');
      row.dataset.id = c.id;
      row.innerHTML = `
        <div class="cue-main">
          <button class="cue-no" title="이 큐로 이동">${i + 1}</button>
          <textarea class="cue-text" rows="1" spellcheck="false" placeholder="자막 문장">${U.esc(c.text)}</textarea>
          <button class="cue-ic cue-play" title="이 구간 재생">▶</button>
          <button class="cue-ic cue-more${open ? ' on' : ''}" aria-expanded="${open}" title="시작·끝·효과음·댓글">⚙</button>
          <button class="cue-ic cue-del" title="큐 삭제">✕</button>
        </div>
        <button class="cue-meta" title="눌러서 세부 설정">${U.esc(cueMetaText(c))}</button>
        <div class="cue-extra"${open ? '' : ' hidden'}>
          <div class="cue-times">
            <input class="cue-start" type="number" step="0.1" min="0" value="${(+c.start).toFixed(1)}" aria-label="시작">
            <span class="to">→</span>
            <input class="cue-end" type="number" step="0.1" min="0" value="${(+c.end).toFixed(1)}" aria-label="끝">
            <span class="hint cue-dur">${(c.end - c.start).toFixed(1)}초</span>
          </div>
          <div class="cue-tools">
            <select class="mini cue-sfx" aria-label="효과음">
              <option value="">효과음 없음</option>
              <optgroup label="기본 (합성)">
                ${RS.sfxList.map(s => `<option value="${s.id}"${c.sfx === s.id ? ' selected' : ''}>${U.esc(s.name)}</option>`).join('')}
              </optgroup>
              ${RS.sfxCats.filter(cat => cat.id !== 'all').map(cat => {
                const opts = RS.sfxPack.items.filter(it => it.c === cat.id);
                if (!opts.length) return '';
                return `<optgroup label="${U.esc(cat.name)}">` + opts.map(it => `<option value="${it.id}"${c.sfx === it.id ? ' selected' : ''}>${U.esc(it.n)}${it.en ? ' · ' + U.esc(it.en) : ''}</option>`).join('') + `</optgroup>`;
              }).join('')}
            </select>
            <label class="cmt-toggle"><input type="checkbox" class="cue-cmt-on"${c.comment.on ? ' checked' : ''}> 댓글</label>
            <input class="cmt-text" placeholder="댓글 내용" value="${U.esc(c.comment.text || '')}">
          </div>
        </div>`;
      list.appendChild(row);
      autoGrow(row.querySelector('.cue-text'));
    });
    renderScrubCues();
    renderSfxTargets();
  }

  function renderTitles() {
    const p = S.project, box = el('titleList');
    box.innerHTML = '';
    p.meta.titles.forEach((t, i) => {
      const row = document.createElement('div');
      row.className = 'trow';
      row.innerHTML = `<input type="radio" name="pickTitle" ${p.meta.selected === i ? 'checked' : ''} aria-label="이 제목 선택">
        <input class="title-in" data-i="${i}" value="${U.esc(t)}" placeholder="제목 안 ${i + 1}">`;
      box.appendChild(row);
    });
    box.oninput = e => {
      if (e.target.classList.contains('title-in')) {
        S.project.meta.titles[+e.target.dataset.i] = e.target.value; touch(); syncUploadFields();
      }
    };
    box.onchange = e => {
      if (e.target.name === 'pickTitle') {
        S.project.meta.selected = +[...box.querySelectorAll('input[type=radio]')].indexOf(e.target);
        touch(); syncUploadFields();
      }
    };
  }

  /* ── music tab ──────────────────────────────────────── */
  function bindMusic() {
    el('bgmGrid').addEventListener('click', e => {
      const card = e.target.closest('.bgm'); if (!card) return;
      const id = card.dataset.id;
      if (e.target.closest('.bplay')) { previewBgm(id); return; }
      chooseBgm(id);
    });
    el('bgmVol').addEventListener('input', e => {
      S.project.bgm.volume = +e.target.value / 100;
      el('bgmVolVal').textContent = e.target.value + '%';
      A.setBgmVolume(S.project.bgm.volume); touch(); renderBgm();
    });
    el('bgmDuck').addEventListener('input', e => {
      S.project.bgm.duck = +e.target.value / 100;
      el('bgmDuckVal').textContent = e.target.value + '%';
      A.setDuckAmount(S.project.bgm.duck); touch();
    });
    el('mStopAll').addEventListener('click', () => {
      A.stopAll();
      previewing = null; renderBgm();
      RS.toast('소리를 껐습니다');
    });
    el('voiceRate').addEventListener('input', e => {
      S.project.voice.rate = +e.target.value / 100;
      el('voiceRateVal').textContent = S.project.voice.rate.toFixed(2) + 'x';
      if (el('voiceNow')) renderVoiceLib();
      touch();
    });
    el('voiceVol').addEventListener('input', e => {
      S.project.voice.volume = +e.target.value / 100;
      el('voiceVolVal').textContent = e.target.value + '%';
      A.setVoiceVolume(S.project.voice.volume); touch();
    });
    el('origOn').addEventListener('change', e => {
      S.project.orig.on = e.target.checked;
      A.setOrigVolume(e.target.checked ? S.project.orig.volume : 0);
      if (S.media.video) S.media.video.muted = false;
      touch();
    });
    el('origVol').addEventListener('input', e => {
      S.project.orig.volume = +e.target.value / 100;
      el('origVolVal').textContent = e.target.value + '%';
      A.setOrigVolume(S.project.orig.on ? S.project.orig.volume : 0); touch();
    });
    el('voiceClarity').addEventListener('click', () => {
      const p = S.project;
      p.bgm.on = true;
      if (!p.bgm.id) p.bgm.id = 'docu';
      p.bgm.volume = 0.2; p.bgm.duck = 0.85;
      p.voice.volume = 1; p.voice.on = true;
      p.orig.volume = 0.5;
      A.resume();
      A.setBgmVolume(p.bgm.volume); A.setDuckAmount(p.bgm.duck);
      A.setVoiceVolume(1); A.setOrigVolume(p.orig.on ? 0.5 : 0);
      A.startBgm(p.bgm.id, 0, p.bgm.volume);
      previewing = p.bgm.id;
      clearTimeout(previewBgm._t);
      previewBgm._t = setTimeout(() => { if (previewing === p.bgm.id && !S.player.playing) { A.stopBgm(); previewing = null; renderBgm(); } }, 9000);
      syncProjectToUI();
      touch();
      RS.toast('목소리 또렷 — BGM 20% · 말할 때 85% 덕킹 · 원본 50%', 'ok');
    });
  }

  let previewing = null;
  function renderBgm() {
    const p = S.project;
    const box = el('bgmGrid');
    box.innerHTML = RS.bgmList.map(b => {
      const on = p.bgm.on && p.bgm.id === b.id;
      const playing = previewing === b.id;
      return `<button class="bgm${on ? ' on' : ''}${playing ? ' playing' : ''}" data-id="${b.id}">
        <span class="bn">${b.name}</span><span class="bd">${b.desc}</span>
        <span class="bplay" title="${playing ? '정지' : '미리듣기'}">${playing ? '■' : '▶'}</span>
        <span class="bar">${'<i></i>'.repeat(6)}</span>
      </button>`;
    }).join('') + `<button class="bgm${!p.bgm.on || !p.bgm.id ? ' on' : ''}" data-id="">
        <span class="bn">선택 안 함</span><span class="bd">무음으로 내보내기</span>
        <span class="bplay">×</span></button>`;
  }

  function chooseBgm(id) {
    A.resume();
    const p = S.project;
    if (!id) { p.bgm.on = false; p.bgm.id = ''; A.stopBgm(); previewing = null; renderBgm(); touch(); RS.toast('BGM 없이 갑니다'); return; }
    p.bgm.id = id; p.bgm.on = true;
    previewing = null;
    A.setBgmVolume(p.bgm.volume);
    if (S.player.playing) A.startBgm(id, nowT(), p.bgm.volume);
    else { A.startBgm(id, 0, p.bgm.volume); previewing = id; setTimeout(() => { if (previewing === id && !S.player.playing) { A.stopBgm(); previewing = null; renderBgm(); } }, 9000); }
    renderBgm(); touch();
    RS.toast((RS.bgmList.find(b => b.id === id) || {}).name + ' BGM을 넣었습니다', 'ok');
  }
  function previewBgm(id) {
    A.resume();
    if (previewing === id) { A.stopBgm(); previewing = null; renderBgm(); return; }
    if (S.player.playing) pause();
    A.setBgmVolume(S.project.bgm.volume);
    A.startBgm(id, 0, S.project.bgm.volume);
    previewing = id;
    renderBgm();
    clearTimeout(previewBgm._t);
    previewBgm._t = setTimeout(() => { if (previewing === id && !S.player.playing) { A.stopBgm(); previewing = null; renderBgm(); } }, 12000);
  }

  /* ── playback ───────────────────────────────────────── */
  function nowT() {
    const pl = S.player;
    if (!pl.playing) return pl.t;
    if (pl.audioStart != null && A.ctx) return Math.min(pl.baseT + (A.ctx.currentTime - pl.audioStart), U.totalDur(S.project) + 0.2);
    return pl.baseT + (performance.now() - pl.wallStart) / 1000;
  }
  function togglePlay() { S.player.playing ? pause() : play(); }

  async function play() {
    const p = S.project, dur = U.totalDur(p);
    if (!p.cues.length) { RS.toast('대본 큐가 없습니다 — AI 대본을 먼저 만들어보세요', 'err'); setTab('script'); return; }
    A.resume();
    if (S.player.t >= dur - 0.08) S.player.t = 0;
    const ctx = A.ctx;
    S.player.baseT = S.player.t;
    S.player.wallStart = performance.now();
    S.player.audioStart = ctx && ctx.state === 'running' ? ctx.currentTime : null;
    S.player.playing = true;
    firedSfx.clear();
    if (p.bgm.on && p.bgm.id) A.startBgm(p.bgm.id, S.player.t, p.bgm.volume);
    if (p.source.type === 'video' && S.media.video && S.media.video.src) {
      A.bindVideo(S.media.video);
      try { S.media.video.currentTime = Math.min(S.player.t, Math.max(0, S.media.video.duration - 0.1)); } catch (e) {}
      S.media.video.play().catch(() => {});
    }
    A.setVoiceVolume(p.voice.volume == null ? 1 : p.voice.volume);
    if (p.voice.file && A.narrationBuf) A.startNarration(S.player.t, p.voice.rate);
    updatePlayBtns();
  }

  function pause() {
    if (!S.player.playing) { updatePlayBtns(); return; }
    const t = nowT();
    S.player.playing = false;
    S.player.t = U.clamp(t, 0, U.totalDur(S.project));
    A.stopBgm(); A.stopNarration();
    previewing = null; renderBgm();
    if (S.media.video && S.media.video.src) { try { S.media.video.pause(); } catch (e) {} }
    updatePlayBtns();
    updateTransport(S.player.t);
  }

  function seekTo(t) {
    const dur = U.totalDur(S.project);
    t = U.clamp(t, 0, dur);
    const was = S.player.playing;
    if (was) pause();
    S.player.t = t;
    if (S.project.source.type === 'video' && S.media.video && S.media.video.src) {
      try { S.media.video.currentTime = Math.max(0, Math.min(t, (S.media.video.duration || 0) - 0.05)); } catch (e) {}
    }
    firedSfx.clear();
    updateTransport(t);
    drawStatic();
    if (was) play();
  }

  const firedSfx = new Set();
  function updateDuckAndTts() {
    const p = S.project;
    if (!S.player.playing) return;
    const t = nowT();
    const cue = U.cueAt(p, t);
    const narrating = !!(p.voice.file && A.narrationBuf && t < (A.narrationBuf.duration || 0));
    A.duck(narrating);
    if (cue && cue.sfx && !firedSfx.has(cue.id)) { firedSfx.add(cue.id); A.playSfx(cue.sfx); }
  }

  function updatePlayBtns() {
    const on = S.player.playing;
    [el('pPlay'), el('aPlay')].forEach(b => { if (b) b.innerHTML = on ? '❚❚' : '▶'; });
  }

  /* ── canvases & transport ───────────────────────────── */
  const stages = {};
  function resizeStage() {
    const p = S.project;
    const ratio = p.ratio || '9:16';
    const set = (cv, w) => {
      if (!cv) return;
      cv.width = w;
      cv.height = Math.round(w * (ratio === '16:9' ? 9 / 16 : 16 / 9));
      cv.dataset.w = cv.width; cv.dataset.h = cv.height;
    };
    set(el('stageMain'), 720);
    set(el('stageAside'), 540);
  }

  function drawStatic() {
    const p = S.project, t = S.player.t;
    [[el('stageMain'), 720], [el('stageAside'), 540]].forEach(([cv, w]) => {
      if (!cv || cv.offsetParent === null) return;
      const ratio = p.ratio || '9:16';
      const H = Math.round(w * (ratio === '16:9' ? 9 / 16 : 16 / 9));
      if (cv.width !== w || cv.height !== H) { cv.width = w; cv.height = H; }
      const ctx = cv.getContext('2d');
      R.draw(ctx, w, H, p, t, { guide: S.ui.guide });
    });
  }

  let lastPaint = 0, lastText = 0;
  function loop() {
    requestAnimationFrame(loop);
    const p = S.project;
    const t = nowT();
    const dur = U.totalDur(p);
    if (S.player.playing && t >= dur) { pause(); S.player.t = dur; }

    const now = performance.now();
    if (now - lastPaint > 28) {
      lastPaint = now;
      [el('stageMain'), el('stageAside')].forEach(cv => {
        if (!cv || cv.offsetParent === null) return;
        const W = cv.width || 720;
        const ratio = p.ratio || '9:16';
        const H = cv.height || Math.round(W * (ratio === '16:9' ? 9 / 16 : 16 / 9));
        try { R.draw(cv.getContext('2d'), W, H, p, t, { guide: S.ui.guide }); } catch (e) { window.__rsErrors.push('draw: ' + e.message); }
      });
    }
    if (now - lastText > 100) {
      lastText = now;
      updateTransport(t);
      if (S.player.playing) updateDuckAndTts();
      if (S.ui.tab === 'script') tickStage();
    }
  }

  let lastActiveCue = null;
  function updateTransport(t) {
    const p = S.project, dur = U.totalDur(p);
    if (S.player.playing && p.source.type === 'video' && S.media.video && S.media.video.src && S.media.video.readyState > 2) {
      if (Math.abs(S.media.video.currentTime - t) > 0.3) { try { S.media.video.currentTime = t; } catch (e) {} }
    }
    el('pCur').textContent = U.fmtTime(t);
    el('pDur').textContent = U.fmtTime(dur);
    el('aTime').textContent = U.fmtTime(t) + ' / ' + U.fmtTime(dur);
    el('pFill').style.width = (dur ? (t / dur) * 100 : 0) + '%';
    el('pHead').style.left = (dur ? (t / dur) * 100 : 0) + '%';
    const cue = U.cueAt(p, t);
    const id = cue ? cue.id : null;
    if (id !== lastActiveCue) {
      lastActiveCue = id;
      $$('#cueList .cue').forEach(r => r.classList.toggle('is-active', r.dataset.id === id));
      $$('#aQueue .pq').forEach(q => q.classList.toggle('on', q.dataset.id === id));
      el('aCueNum').textContent = cue ? (p.cues.indexOf(cue) + 1) : '–';
    }
  }

  function renderScrubCues() {
    const p = S.project, dur = U.totalDur(p) || 1;
    el('pCues').innerHTML = p.cues.map(c => `<div class="scrub-cue" style="width:${((c.end - c.start) / dur) * 100}%"></div>`).join('');
    el('aQueue').innerHTML = p.cues.map((c, i) => `<span class="pq" data-id="${c.id}" title="${U.esc(U.strip(c.text).slice(0, 40))}">${i + 1}</span>`).join('');
  }
  el('aQueue') && el('aQueue').addEventListener('click', e => {
    const q = e.target.closest('.pq'); if (!q) return;
    const c = S.project.cues.find(x => x.id === q.dataset.id);
    if (c) { seekTo(c.start); }
  });

  function bindTransport() {
    el('pPlay').addEventListener('click', () => { A.resume(); togglePlay(); });
    el('aPlay').addEventListener('click', () => { A.resume(); togglePlay(); });
    el('pPrev').addEventListener('click', () => {
      const t = nowT(), cues = S.project.cues;
      const prev = [...cues].reverse().find(c => c.start < t - 0.35) || cues[0];
      if (prev) seekTo(prev.start);
    });
    el('pNext').addEventListener('click', () => {
      const t = nowT();
      const next = S.project.cues.find(c => c.start > t + 0.15);
      if (next) seekTo(next.start);
    });
    const g = () => { S.ui.guide = !S.ui.guide; drawStatic(); RS.toast(S.ui.guide ? '유튜브 UI 안전영역 표시' : '가이드 끔'); };
    el('pGuide').addEventListener('click', g);
    el('aGuide').addEventListener('click', g);

    let dragging = false;
    const scrub = el('pScrub');
    const pos = e => {
      const r = scrub.getBoundingClientRect();
      const x = (e.touches ? e.touches[0].clientX : e.clientX) - r.left;
      return U.clamp(x / r.width, 0, 1) * U.totalDur(S.project);
    };
    const down = e => { dragging = true; scrub.setPointerCapture && e.pointerId != null && scrub.setPointerCapture(e.pointerId); seekTo(pos(e)); };
    const move = e => { if (dragging) seekTo(pos(e)); };
    const up = () => { dragging = false; };
    scrub.addEventListener('pointerdown', down);
    scrub.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  }

  /* ── preview / export / thumbnail ───────────────────── */
  function bindPreview() {
    el('xStart').addEventListener('click', startExport);
    el('xToUpload').addEventListener('click', () => setTab('upload'));
    el('auditRun').addEventListener('click', auditClick);
    el('auditQuick').addEventListener('click', auditClick);
    el('auditFix').addEventListener('click', auditFix);
    el('thumbMake').addEventListener('click', function () { makeThumb(); });
    el('thumbBgImg').addEventListener('change', e => {
      const f = e.target.files && e.target.files[0];
      if (!f) return;
      const img = new Image();
      img.onload = () => {
        S.media.thumbImg = img;
        el('thumbBgName').textContent = f.name;
        el('thumbBgClear').hidden = false;
        makeThumb();
      };
      img.onerror = () => RS.toast('이미지를 읽지 못했습니다', 'err');
      img.src = URL.createObjectURL(f);
      e.target.value = '';
    });
    el('thumbBgClear').addEventListener('click', () => {
      S.media.thumbImg = null;
      el('thumbBgName').textContent = '현재 프레임 사용';
      el('thumbBgClear').hidden = true;
    });
    el('thumbSave').addEventListener('click', () => {
      const c = el('thumbCanvas');
      c.toBlob(b => { if (b) U.download(fileBase() + '_thumb.png', b); }, 'image/png');
      RS.toast('썸네일 PNG 저장', 'ok');
    });
    el('thumbCopyTitle').addEventListener('click', async () => { RS.toast(await U.copy(S.project.meta.titles[S.project.meta.selected] || S.project.meta.titles[0] || '') ? '제목 복사' : '복사 실패', 'ok'); });
    el('thumbCopyDesc').addEventListener('click', async () => { RS.toast(await U.copy(S.project.meta.desc) ? '설명 복사' : '복사 실패', 'ok'); });
    el('thumbCopyTags').addEventListener('click', async () => { RS.toast(await U.copy(S.project.meta.tags) ? '태그 복사' : '복사 실패', 'ok'); });
  }

  /* ── 0오류 자동 점검 ───────────────────────────────── */
  const AUDIT_SAFE_Y = 1400;
  const SUB_FAMILY = '"Apple SD Gothic Neo","Malgun Gothic","Noto Sans KR",sans-serif';
  let measureCanvas = null;
  function textCtx() {
    if (!measureCanvas) measureCanvas = document.createElement('canvas');
    return measureCanvas.getContext('2d');
  }
  function wrapLineCount(text, fs, weight, family, maxW) {
    const ctx = textCtx();
    ctx.font = weight + ' ' + fs + 'px ' + (family || SUB_FAMILY);
    const words = U.strip(text).split(/\s+/).filter(Boolean);
    if (!words.length) return 0;
    const sp = ctx.measureText(' ').width;
    let lines = 1, cur = 0;
    words.forEach(w => {
      const ww = ctx.measureText(w).width;
      if (ww > maxW) {
        const n = Math.max(1, Math.ceil(ww / maxW));
        if (cur > 0) { lines++; cur = 0; }
        lines += n - 1; cur = ww - (n - 1) * maxW;
        return;
      }
      if (cur === 0) { cur = ww; return; }
      if (cur + sp + ww > maxW) { lines++; cur = ww; }
      else cur += sp + ww;
    });
    return lines;
  }
  function subGeom(p, cue, W, H) {
    const family = p.sub.font || SUB_FAMILY;
    const weight = p.sub.weight || 900;
    const maxW = W * ((RS.safe && RS.safe.subMaxW) || 0.76);
    let fs = p.sub.fontSize || 62;
    let lines = wrapLineCount(cue.text, fs, weight, family, maxW);
    if (lines > 3) { fs = fs * 0.86; lines = wrapLineCount(cue.text, fs, weight, family, maxW); }
    const lh = fs * 1.24, padY = fs * 0.3;
    const boxH = Math.min(lines, 3) * lh + padY * 2;
    const raw = H * (p.sub.pos || 0.78);
    const cy = (RS.safe && RS.safe.clampY) ? RS.safe.clampY(raw, boxH + fs * 0.4, H) : raw;
    return { lines, fs, boxH, top: cy - boxH / 2, bottom: cy + boxH / 2, cy, moved: Math.abs(cy - raw) > 1 };
  }
  function cardGeom(p, cue, W, H) {
    if (!p.card || !p.card.on || !cue || !cue.comment || !cue.comment.on || !cue.comment.text) return null;
    const fs = 30, lh = fs * 1.35, av = fs * 2.1, padY = fs * 0.55;
    const lines = Math.min(3, wrapLineCount(cue.comment.text, fs, 700, SUB_FAMILY, W * ((RS.safe && RS.safe.cardMaxW) || 0.7)));
    const boxH = Math.max(av, lines * lh) + padY * 2;
    const raw = H * (p.card.y == null ? 0.6 : p.card.y);
    const y = (RS.safe && RS.safe.clampTop) ? RS.safe.clampTop(raw, boxH, H) : raw;
    return { top: y, bottom: y + boxH, boxH, moved: Math.abs(y - raw) > 1 };
  }

  function auditOnce() {
    const p = S.project, items = [];
    const W = 1080, H = p.ratio === '16:9' ? 607.5 : 1920;
    const vertical = p.ratio !== '16:9';

    /* ① 하단 유튜브 UI 세이프존 */
    if (!vertical) {
      items.push({ id: 'safe', ok: true, title: '하단 유튜브 UI 세이프존', detail: '16:9 롱폼은 세로 쇼츠 UI 세이프존을 적용하지 않습니다' });
    } else {
      let worstSub = 0, worstCard = 0, wi = -1, ci = -1;
      p.cues.forEach((c, i) => {
        const g = subGeom(p, c, W, H);
        if (g.bottom > worstSub) { worstSub = g.bottom; wi = i; }
        const cg = cardGeom(p, c, W, H);
        if (cg && cg.bottom > worstCard) { worstCard = cg.bottom; ci = i; }
      });
      const worst = Math.max(worstSub, worstCard);
      const src = worstCard > worstSub ? '댓글 카드(' + (ci + 1) + '번 큐)' : '자막(' + (wi + 1) + '번 큐)';
      items.push(worst <= AUDIT_SAFE_Y
        ? { id: 'safe', ok: true, title: '하단 유튜브 UI 세이프존', detail: '자막·카드 모두 y ' + Math.round(Math.max(worst, 0)) + ' (기준 1,400) 안쪽 · 우측 아이콘 열도 비켜섰습니다' }
        : { id: 'safe', ok: false, title: '하단 유튜브 UI 세이프존', detail: src + '가 y ' + Math.round(worst) + '까지 내려갑니다 — 유튜브 제목·채널 영역과 겹칩니다' });
    }

    /* ② 자막 줄 수·잘림 */
    const over = [], three = [];
    p.cues.forEach((c, i) => {
      const g = subGeom(p, c, W, H);
      if (g.lines > 3) over.push(i + 1);
      else if (g.lines === 3) three.push(i + 1);
    });
    if (over.length) items.push({ id: 'sub', ok: false, title: '자막 길이·잘림', detail: '큐 ' + over.join(', ') + '번이 4줄 이상이라 3줄에서 잘립니다 (뒷부분 손실)' });
    else if (three.length) items.push({ id: 'sub', ok: false, title: '자막 길이·잘림', detail: '큐 ' + three.join(', ') + '번이 3줄입니다 — 2줄 이하가 읽기 좋습니다' });
    else items.push({ id: 'sub', ok: true, title: '자막 길이·잘림', detail: '모든 큐가 2줄 이하로 들어갑니다' });

    /* ③ 상단 훅 2줄 길이 */
    const hk = p.hook || {};
    if (!hk.on || (!hk.line1 && !hk.line2)) {
      items.push({ id: 'hook', ok: true, title: '상단 훅 길이', detail: '훅을 쓰지 않았습니다' });
    } else {
      const fam = hk.font || SUB_FAMILY;
      const l1 = wrapLineCount(hk.line1, hk.size || 54, 900, fam, W * 0.86);
      const l2 = hk.line2 ? wrapLineCount(hk.line2, hk.size || 54, 900, fam, W * 0.86) : 0;
      if (l1 > 1 || l2 > 2) items.push({ id: 'hook', ok: false, title: '상단 훅 길이', detail: '1줄이 ' + l1 + '줄, 2줄이 ' + l2 + '줄로 넘쳐 일부가 잘립니다' });
      else items.push({ id: 'hook', ok: true, title: '상단 훅 길이', detail: '훅 2줄이 화면 폭 안에 들어갑니다' });
    }

    /* ④ 음슴체 잔여 */
    const eum = [];
    p.cues.forEach((c, i) => { if (hasEumSum(c.text)) eum.push((i + 1) + '번 “' + lastToken(c.text) + '”'); });
    items.push(eum.length
      ? { id: 'eum', ok: false, title: '내레이션 음슴체', detail: eum.slice(0, 4).join(' · ') + (eum.length > 4 ? ' 외 ' + (eum.length - 4) + '곳' : '') + ' — 구어체가 시청 유지에 유리합니다' }
      : { id: 'eum', ok: true, title: '내레이션 음슴체', detail: '음슴체(~함·~임)가 없습니다' });

    /* ⑤ 큐 시간 겹침·공백 */
    const sorted = p.cues.slice().sort((a, b) => a.start - b.start);
    let overlaps = 0, gaps = 0, bad = 0;
    for (let i = 0; i < sorted.length; i++) {
      const c = sorted[i];
      if (!(c.end > c.start) || c.start < 0) bad++;
      if (i) {
        const prev = sorted[i - 1];
        if (c.start < prev.end - 0.06) overlaps++;
        else if (c.start - prev.end > 0.6) gaps++;
      }
    }
    const timeBad = overlaps + gaps + bad > 0;
    items.push(timeBad
      ? { id: 'time', ok: false, title: '큐 시간 겹침·공백', detail: '겹침 ' + overlaps + '곳 · 빈 구간 ' + gaps + '곳 · 잘못된 시간 ' + bad + '곳' }
      : { id: 'time', ok: true, title: '큐 시간 겹침·공백', detail: p.cues.length + '개 큐가 ' + U.totalDur(p).toFixed(1) + '초로 매끄럽게 이어집니다' });

    return items;
  }

  function renderAudit(items) {
    const box = el('auditList'), badge = el('auditBadge'), acts = el('auditActions'), sum = el('auditSummary');
    if (!box) return;
    box.hidden = false;
    box.innerHTML = items.map(it => `<div class="audit-item ${it.ok ? 'ok' : 'warn'}">
      <span class="ai-ico">${it.ok ? '✓' : '!'}</span>
      <div class="ai-body"><b>${U.esc(it.title)}</b><span>${U.esc(it.detail)}</span></div>
    </div>`).join('');
    const bad = items.filter(i => !i.ok).length;
    badge.textContent = bad ? '경고 ' + bad + '건' : items.length + '/' + items.length + ' 통과';
    badge.className = 'tag ' + (bad ? 'audit-badge-warn' : 'audit-badge-ok');
    acts.hidden = !bad;
    el('auditFix').textContent = '🛠 원클릭 자동 수정' + (bad ? ' (' + bad + ')' : '');
    if (bad) sum.textContent = '경고 ' + bad + '건을 한 번에 교정합니다';
    S.ui.auditBad = bad;
    const card = el('auditCard');
    if (card) { card.classList.remove('audit-fixed'); void card.offsetWidth; card.classList.add('audit-fixed'); }
  }

  function runAudit() {
    const items = auditOnce();
    renderAudit(items);
    return items;
  }

  function auditFix() {
    const p = S.project, notes = [];
    if (!p.cues.length) { RS.toast('큐가 없습니다', 'err'); return; }

    /* 음슴체 → 구어체 */
    let eum = 0;
    p.cues.forEach(c => { if (hasEumSum(c.text)) { c.text = eumConvert(c.text); eum++; } });
    if (eum) notes.push('음슴체 ' + eum + '곳');

    /* 긴 자막을 2줄 이하가 될 때까지 분리 */
    let split = 0;
    for (let i = 0; i < p.cues.length; i++) {
      let guard = 0;
      while (guard++ < 4) {
        const c = p.cues[i];
        const g = subGeom(p, c, 1080, 1920);
        if (g.lines <= 2) break;
        const dur = c.end - c.start;
        if (dur < 0.9) break;
        const words = String(c.text).trim().split(/\s+/);
        if (words.length < 2) break;
        const totalLen = U.strip(c.text).length || 1;
        const fam = p.sub.font || SUB_FAMILY, weight = p.sub.weight || 900;
        let k = Math.max(1, Math.min(words.length - 1, Math.round(words.length / 2)));
        while (k > 1 && wrapLineCount(words.slice(0, k).join(' '), g.fs, weight, fam, 1080 * 0.84) > 2) k--;
        const a = words.slice(0, k).join(' '), b = words.slice(k).join(' ');
        if (!a || !b) break;
        const ratio = Math.max(0.25, Math.min(0.75, U.strip(a).length / totalLen));
        const mid = +(c.start + Math.max(0.5, Math.min(dur - 0.5, dur * ratio))).toFixed(1);
        const c2 = { id: U.uid(), text: b, start: mid, end: Math.max(mid + 0.4, +c.end.toFixed(1)), sfx: '', comment: { on: false, text: '', name: '시청자' } };
        c.text = a;
        c.end = mid;
        p.cues.splice(i + 1, 0, c2);
        split++;
      }
    }
    if (split) notes.push('긴 자막 ' + split + '개 분리');

    /* 훅 크기 줄이기 */
    const hk = p.hook;
    if (hk && hk.on !== false && (hk.line1 || hk.line2)) {
      const before = hk.size || 54;
      let guard = 0;
      while (guard++ < 24) {
        const fam = hk.font || SUB_FAMILY;
        const l1 = wrapLineCount(hk.line1, hk.size || 54, 900, fam, 1080 * 0.86);
        const l2 = hk.line2 ? wrapLineCount(hk.line2, hk.size || 54, 900, fam, 1080 * 0.86) : 0;
        if (l1 <= 1 && l2 <= 2) break;
        hk.size = Math.max(32, (hk.size || 54) - 2);
      }
      if ((hk.size || 54) !== before) notes.push('훅 글자 ' + before + '→' + hk.size);
    }

    /* 세이프존: 자막·카드를 위로 */
    const beforeSubPos = p.sub.pos, beforeCardY = p.card.y;
    let guard = 0;
    while (guard++ < 60) {
      let subMax = 0, cardMax = 0;
      p.cues.forEach(c => {
        const g = subGeom(p, c, 1080, 1920);
        if (g.bottom > subMax) subMax = g.bottom;
        const cg = cardGeom(p, c, 1080, 1920);
        if (cg && cg.bottom > cardMax) cardMax = cg.bottom;
      });
      if (subMax <= 1400 && cardMax <= 1400) break;
      if (subMax > 1400) p.sub.pos = Math.max(0.46, +(((p.sub.pos || 0.78) - 0.01)).toFixed(2));
      else p.card.y = Math.max(0.36, +(((p.card.y == null ? 0.6 : p.card.y) - 0.01)).toFixed(2));
    }
    if (p.sub.pos !== beforeSubPos || p.card.y !== beforeCardY) notes.push('세이프존 위로 이동');

    /* 큐 시간 정리 */
    const sorted = p.cues.slice().sort((a, b) => a.start - b.start);
    let acc = 0, moved = 0;
    sorted.forEach(c => {
      const d = Math.max(0.4, +(c.end - c.start).toFixed(2));
      if (Math.abs(c.start - acc) > 0.06) moved++;
      c.start = +acc.toFixed(1);
      acc = +(acc + d).toFixed(1);
      c.end = acc;
    });
    p.cues = sorted;
    if (moved) notes.push('시간 정리 ' + moved + '큐');

    S.player.t = 0; pause();
    syncProjectToUI(true);
    renderCues();
    drawStatic();
    touch();
    runAudit();
    RS.toast(notes.length ? '자동 수정 완료 — ' + notes.join(' · ') : '이미 고칠 것이 없습니다', notes.length ? 'ok' : '');
  }

  function auditClick() {
    const items = runAudit();
    const bad = items.filter(i => !i.ok).length;
    RS.toast(bad ? '점검 완료 — 경고 ' + bad + '건' : '점검 완료 — ' + items.length + '/' + items.length + ' 통과', bad ? '' : 'ok');
    const card = el('auditCard');
    if (card) setTimeout(() => card.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
  }

  function fileBase() {
    const n = (S.project.name || 'reel').replace(/[^\w가-힣\-]+/g, '_').slice(0, 40);
    const d = new Date();
    const ts = d.getFullYear() + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0') + '_' + String(d.getHours()).padStart(2, '0') + String(d.getMinutes()).padStart(2, '0');
    return 'reel_' + n + '_' + ts;
  }

  function pickMime() {
    const cands = ['video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];
    for (const m of cands) {
      try { if (window.MediaRecorder && MediaRecorder.isTypeSupported(m)) return m; } catch (e) {}
    }
    return '';
  }

  async function startExport() {
    if (S.ui.exporting) return;
    const p = S.project;
    const dur = U.totalDur(p);
    if (dur < 0.5) { RS.toast('내보낼 큐가 없습니다', 'err'); return; }
    if (!window.MediaRecorder) { RS.toast('이 브라우저는 영상 녹화를 지원하지 않습니다. 크롬이나 사파리 17+에서 열어주세요', 'err'); return; }
    const res = +el('xRes').value;
    const fps = +el('xFps').value;
    const W = p.ratio === '16:9' ? (res === 1080 ? 1920 : 1280) : res;
    const H = p.ratio === '16:9' ? (res === 1080 ? 1080 : 720) : Math.round(res * 16 / 9);
    const canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d');
    const mime = pickMime();

    S.ui.exporting = true;
    el('xStart').disabled = true; el('xStart').innerHTML = '<span class="spin"></span> 렌더중';
    el('xProgWrap').hidden = false; el('xProgBar').style.width = '0%'; el('xProgTxt').textContent = '0%';
    pause(); seekTo(0);
    await new Promise(r => setTimeout(r, 120));
    if (document.fonts) {
      try {
        await document.fonts.ready;
      } catch (e) {}
    }

    // 효과음 100종 중 큐에 걸린 것은 렌더 전에 모두 디코딩해 둔다 (첫 소리 력 방지)
    try { await A.ensureSfxReady(p.cues); } catch (e) {}

    let stream;
    try {
      stream = canvas.captureStream(fps);
      const aStream = A.recordStream();
      if (aStream) aStream.getAudioTracks().forEach(t => stream.addTrack(t));
    } catch (e) { S.ui.exporting = false; el('xStart').disabled = false; el('xStart').textContent = '영상 렌더'; RS.toast('캔버스 캡처 실패: ' + e.message, 'err'); return; }

    const chunks = [];
    let rec;
    try {
      rec = new MediaRecorder(stream, mime ? { mimeType: mime, videoBitsPerSecond: res >= 1080 ? 9000000 : 5000000, audioBitsPerSecond: 128000 } : undefined);
    } catch (e) {
      try { rec = new MediaRecorder(stream); } catch (e2) {
        S.ui.exporting = false; el('xStart').disabled = false; el('xStart').textContent = '영상 렌더';
        RS.toast('녹화기를 시작하지 못했습니다: ' + e2.message, 'err'); return;
      }
    }
    rec.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };

    const stopped = new Promise(resolve => { rec.onstop = resolve; });
    rec.start(500);

    // audio & video start
    A.resume();
    const ctxA = A.ctx;
    const wallStart = performance.now();
    if (p.bgm.on && p.bgm.id) A.startBgm(p.bgm.id, 0, p.bgm.volume);
    if (p.voice.file && A.narrationBuf) A.startNarration(0, p.voice.rate);
    if (p.source.type === 'video' && S.media.video && S.media.video.src) {
      A.bindVideo(S.media.video);
      try { S.media.video.currentTime = 0; await S.media.video.play().catch(() => {}); } catch (e) {}
    }
    const fired = new Set();
    let raf = null, done = false;

    const tick = () => {
      if (done) return;
      const t = (performance.now() - wallStart) / 1000;
      try { R.draw(ctx, W, H, p, t, { guide: false }); } catch (e) { window.__rsErrors.push('export draw: ' + e.message); }
      p.cues.forEach(c => { if (c.sfx && !fired.has(c.id) && t >= c.start && t < c.end) { fired.add(c.id); A.playSfx(c.sfx); } });
      const pct = Math.min(99, Math.round((t / dur) * 100));
      el('xProgBar').style.width = pct + '%';
      el('xProgTxt').textContent = pct + '%';
      el('xStart').innerHTML = '<span class="spin"></span> ' + pct + '%';
      if (t >= dur) { finish(); return; }
      raf = requestAnimationFrame(tick);
    };
    const finish = async () => {
      done = true;
      if (raf) cancelAnimationFrame(raf);
      try { rec.stop(); } catch (e) {}
      A.stopBgm(); A.stopNarration();
      if (S.media.video && S.media.video.src) { try { S.media.video.pause(); } catch (e) {} }
      await stopped;
      const actual = (rec.mimeType || mime || 'video/mp4');
      const blob = new Blob(chunks, { type: actual.split(';')[0] });
      const ext = actual.includes('mp4') ? 'mp4' : 'webm';
      if (blob.size < 800) {
        el('xProgBar').style.width = '0%'; el('xProgTxt').textContent = '0%';
        el('xStart').disabled = false; el('xStart').textContent = '영상 렌더';
        S.ui.exporting = false;
        RS.toast('녹화기가 프레임을 만들지 못했습니다. 사파리는 mp4, 크롬은 webm으로 다시 시도해 주세요.', 'err');
        return;
      }
      if (S.media.exportURL) URL.revokeObjectURL(S.media.exportURL);
      S.media.exportBlob = blob;
      S.media.exportURL = URL.createObjectURL(blob);
      S.media.exportName = fileBase() + '.' + ext;
      const v = el('xVideo');
      v.src = S.media.exportURL;
      el('xOut').hidden = false;
      const dl = el('xDownload');
      dl.href = S.media.exportURL; dl.download = S.media.exportName;
      el('xInfo').textContent = (blob.size / 1048576).toFixed(1) + 'MB · ' + W + '×' + H + ' · ' + fps + 'fps · ' + ext;
      el('xProgBar').style.width = '100%'; el('xProgTxt').textContent = '100%';
      el('xStart').disabled = false; el('xStart').textContent = '영상 렌더';
      S.ui.exporting = false;
      syncUploadFields();
      RS.toast('렌더 완료 · ' + (blob.size / 1048576).toFixed(1) + 'MB', 'ok');
      setTab('preview');
    };
    tick();
    // safety stop
    setTimeout(() => { if (!done && S.ui.exporting) { RS.toast('렌더가 예상보다 오래 걸려 마무리합니다', 'err'); finish(); } }, (dur + 25) * 1000);
  }

  async function makeThumb() {
    const c = el('thumbCanvas');
    try {
      if (document.fonts && document.fonts.load) {
        await document.fonts.ready;
      }
    } catch (e) {}
    R.thumbnail(c, S.project, S.player.t, el('thumbBadge').value.trim(), S.media.thumbImg || null);
    el('thumbWrap').hidden = false;
    RS.toast('썸네일 생성 · 1080×1920', 'ok');
  }

  /* ── discover ───────────────────────────────────────── */
  function bindDiscover() {}
  const DISCOVER_PRESETS = {
    kr: { q: '일상', region: 'KR', dur: 'short', min: '100000', sort: 'breakout' },
    us: { q: 'viral', region: 'US', dur: 'short', min: '100000', sort: 'breakout' },
    jp: { q: 'ニュース', region: 'JP', dur: 'short', min: '100000', sort: 'breakout' },
    animal: { q: '동물', region: '', dur: 'short', min: '100000', sort: 'breakout' },
    ai: { q: 'AI 기술', region: '', dur: 'short', min: '100000', sort: 'breakout' }
  };
  function syncFilterLabel() {
    const box = el('filterNow'); if (!box) return;
    const txt = id => { const s = el(id); const o = s && s.options[s.selectedIndex]; return o ? o.text : ''; };
    box.textContent = [txt('dRegion') || '전체', txt('dDur'), txt('dMin'), txt('dSort')].filter(Boolean).join(' · ');
  }
  function applyDiscoverPreset(key) {
    const pr = DISCOVER_PRESETS[key]; if (!pr) return;
    el('dKeyword').value = pr.q;
    el('dRegion').value = pr.region;
    el('dDur').value = pr.dur;
    el('dMin').value = pr.min;
    el('dSort').value = pr.sort;
    $$('#dChips .chip').forEach(x => x.classList.remove('on'));
    $$('#dPresets .preset-chip').forEach(b => b.classList.toggle('on', b.dataset.preset === key));
    syncFilterLabel();
    runDiscover();
  }
  function readFilters() {
    return {
      q: el('dKeyword').value.trim(), region: el('dRegion').value,
      dur: el('dDur').value, minViews: el('dMin').value, sort: el('dSort').value
    };
  }

  /* 링크 복사 · 원작자 찾기 */
  function legacyCopy(text, done) {
    try {
      const ta = document.createElement('textarea');
      ta.value = text; ta.setAttribute('readonly', '');
      ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0';
      document.body.appendChild(ta);
      ta.select(); ta.setSelectionRange(0, text.length);
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      done(!!ok);
    } catch (e) { done(false); }
  }
  function copyText(text) {
    const done = ok => RS.toast(ok ? '🔗 링크 복사됨 — 붙여넣기 하세요' : '복사가 막혔습니다 — 링크를 길게 눌러 복사해 주세요', ok ? 'ok' : 'err');
    if (!text) { RS.toast('복사할 링크가 없습니다', 'err'); return; }
    if (navigator.clipboard && navigator.clipboard.writeText && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(() => done(true), () => legacyCopy(text, done));
    } else legacyCopy(text, done);
  }
  const ytSearchUrl = t => 'https://www.youtube.com/results?search_query=' + encodeURIComponent(String(t || '').slice(0, 90));
  const ttSearchUrl = t => 'https://www.tiktok.com/search?q=' + encodeURIComponent(
    String(t || '').replace(/[^\w가-힣\s]/g, ' ').trim().split(/\s+/).slice(0, 6).join(' '));
  function findOriginal(title, where, href) {
    const t = String(title || '').replace(/#[\w가-힣]+/g, '').trim();
    if (!t && !href) { RS.toast('검색할 제목이 없습니다', 'err'); return; }
    const url = where === 'tiktok' ? ttSearchUrl(t) : ytSearchUrl(t);
    const w = window.open(url, '_blank');
    if (w) { try { w.opener = null; } catch (e) {} }
    if (!w) RS.toast('새 탭이 막혔습니다 — 팝업을 허용해 주세요', 'err');
    else RS.toast(where === 'tiktok' ? '틱톡에서 원작자를 찾습니다 ↗' : '유튜브에서 원작자를 찾습니다 ↗');
  }

  /* 결과 자리로 스크롤 (패널이 스크롤 컨테이너) */
  function scrollPanelTo(node, smooth) {
    if (!node) return;
    const scroller = node.closest('.panel');
    if (!scroller) { node.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto', block: 'start' }); return; }
    const top = node.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop - 10;
    try { scroller.scrollTo({ top: Math.max(0, top), behavior: smooth ? 'smooth' : 'auto' }); }
    catch (e) { scroller.scrollTop = Math.max(0, top); }
  }
  function focusResults(smooth) { scrollPanelTo(el('discoverResultHead'), smooth); }

  const SKELETON = `<div class="rcard skel" aria-hidden="true"><div class="thumb"></div>
    <div class="rc-body"><div class="sk-line w90"></div><div class="sk-line w65"></div><div class="sk-line w40"></div></div></div>`;
  function showSkeletons(n) {
    const box = el('discoverResults'); if (!box) return;
    box.innerHTML = new Array(n || 12).fill(SKELETON).join('');
  }

  /* ── 🛡️ 수익화 위험 영상 자동 제외 (방송·아이돌·영화·랭킹 모음집) ── */
  function safeOn() { return !!(RS.safeFilter && RS.safeFilter.enabled()); }
  function safeList(list) { return RS.safeFilter ? RS.safeFilter.filter(list).list : (list || []); }
  function safeRemoved() { return (RS.tube.lastSafe && RS.tube.lastSafe.removed) || 0; }
  function syncSafeBadge() {
    const b = el('safeToggle'); if (!b) return;
    const on = safeOn();
    b.classList.toggle('on', on);
    b.setAttribute('aria-pressed', on ? 'true' : 'false');
    b.title = on
      ? '방송·아이돌·영화·랭킹 모음집을 자동으로 뺍니다 — 누르면 끕니다'
      : '자동 제외가 꺼져 있습니다 — 누르면 방송·아이돌·랭킹 영상도 함께 봅니다';
    const st = el('safeState'); if (st) st.textContent = on ? 'ON' : 'OFF';
  }
  function refreshPopSafeChip() {
    const chip = el('popSafe'); if (!chip) return;
    const n = (RS.tube.lastPopularSafe && RS.tube.lastPopularSafe.removed) || 0;
    if (!safeOn() || !n) { chip.hidden = true; return; }
    chip.hidden = false;
    chip.textContent = '🛡️ 위험 ' + n + '건 제외';
  }
  function applySafeToggle() {
    const on = RS.safeFilter.toggle();
    syncSafeBadge();
    RS.toast(on
      ? '🛡️ 방송·아이돌·랭킹 자동 제외 켜짐 — 안전한 소재만 보여드립니다'
      : '자동 제외 꺼짐 — 방송·아이돌·랭킹 영상도 함께 나옵니다', on ? 'ok' : 'err');
    if (!rerenderFromCache()) runDiscover();   // 받아둔 결과가 있으면 재검색 없이 다시 그림
    refreshPopular();
    refreshPopSafeChip();
  }
  function bindSafeBadge() {
    syncSafeBadge();
    const b = el('safeToggle');
    if (b && !b.dataset.bound) { b.dataset.bound = '1'; b.addEventListener('click', applySafeToggle); }
  }
  /* 받아둔 원본 결과(자동 제외 전)를 지금 설정으로 다시 그립니다 — API 재호출 없음 */
  function rerenderFromCache() {
    const raw = RS.tube.lastRaw || [];
    const f = RS.tube.lastFilters || readFilters();
    if (!raw.length) return false;
    const removedNow = RS.safeFilter.filter(raw).removed.length;
    const safe = RS.safeFilter.filter(raw).list;
    const min = +f.minViews || 0;
    let shown = safe.filter(v => v.views >= min);
    if (!shown.length) shown = safe.slice();
    if (RS.rank && f.sort !== 'date') shown = RS.rank.mix(shown);   // 해외 밈·글로벌 클립 우선 유지
    if (!RS.ai.hasYouTube()) shown = shown.slice(0, 12);   // 데모는 처음 화면과 같은 12건
    const mode = RS.tube.lastMode || (RS.ai.hasYouTube() ? 'live' : 'demo');
    renderDiscover(shown, { mode, q: f.q, removed: removedNow });
    setDiscoverStatus(mode, f.q, shown.length, { meta: null, relaxed: false, removed: removedNow });
    return true;
  }
  function setDiscoverStatus(mode, q, count, opts) {
    const st = el('discoverStatus'); if (!st) return;
    opts = opts || {};
    const label = mode === 'live' ? 'YouTube 실시간' : mode === 'public' ? '공개 트렌드' : mode === 'fallback' ? '샘플로 대체' : '샘플 떡상 데이터';
    st.classList.toggle('off', mode !== 'live');
    const meta = opts.meta;
    let note = '';
    if (meta) {
      const bits = [];
      if (meta.direct) bits.push('일치 ' + meta.direct);
      if (meta.related) bits.push('비슷한 결 ' + meta.related);
      if (meta.fresh) bits.push('추천 ' + meta.fresh);
      note = bits.length ? ' · ' + bits.join(' · ') : (q ? ' · 연관 0건 → 인기순' : '');
    }
    if (opts.refresh) note += ' · 🔄 ' + opts.refresh + '번째 새 목록' + (opts.variant ? ' · ' + opts.variant : '');
    else if (opts.variant) note += ' · ' + opts.variant;
    if (opts.relaxed && !meta) note += ' · 필터 완화';
    if (mode === 'public') note += ' · 잠시 후 실시간으로 자동 복귀';
    const removed = (typeof opts.removed === 'number') ? opts.removed : safeRemoved();
    /* 검색어 자체가 방송·아이돌·랭킹 위험 키워드면 그 사실을 짚어 줍니다
       (샘플 모드에서는 걸러질 원본이 없어 제외 0건으로 보이기 때문) */
    const qHit = (safeOn() && !removed && q && RS.safeFilter) ? RS.safeFilter.check({ title: q }) : null;
    const shield = (safeOn() && removed)
      ? '<b class="safe-note">🛡️ 방송·아이돌·랭킹 등 위험 ' + removed + '건 자동 제외</b>'
      : qHit
        ? '<b class="safe-note">🛡️ ' + U.esc(q) + '은 ' + U.esc(qHit.kindLabel) + ' 위험 키워드 — 안전한 소재만</b>'
        : (safeOn() ? '' : '<b class="safe-note">🛡️ 자동 제외 꺼짐</b>');
    st.innerHTML = '<i class="dot"></i>' + label + " · '" + U.esc(q) + "' " + count + '건' + note + shield;
  }

  let discoverSeq = 0;
  let moreCount = 0;
  function setMoreBusy(on) {
    const b = el('dMore'); if (!b) return;
    b.disabled = !!on;
    b.innerHTML = on ? '<span class="spin"></span> 찾는 중' : '🔄 다른 영상';
  }
  async function runDiscover() {
    const btn = el('dSearch');
    const st = el('discoverStatus');
    const filters = readFilters();
    if (!filters.q) { filters.q = '동물'; if (el('dKeyword')) el('dKeyword').value = '동물'; }
    const seq = ++discoverSeq;
    moreCount = 0;
    if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spin"></span>'; }
    if (st) { st.classList.remove('off'); st.innerHTML = '<span class="spin"></span> 유튜브에서 찾는 중…'; }
    showSkeletons(12);
    focusResults(false);                       // 누르자마자 결과 자리로 — 빈 화면으로 보이지 않게
    let list = [], mode = 'live', err = '', meta = null, relaxed = false;
    try {
      list = await RS.tube.search(filters);
      mode = RS.tube.lastMode || 'live';
      meta = RS.tube.lastDemoMeta || null;
      relaxed = !!RS.tube.lastRelaxed;
      err = (RS.tube.lastError && RS.tube.lastError.message) || '';
    } catch (e) {
      err = e.message;
      list = RS.tube.demoSearch(filters);
      meta = RS.tube.lastDemoMeta || null;
      relaxed = !!RS.tube.lastRelaxed;
      mode = 'demo';
    }
    if (seq !== discoverSeq) return;           // 늦게 도착한 이전 요청은 버림
    renderDiscover(list, { mode, q: filters.q, meta, err, removed: safeRemoved() });
    setDiscoverStatus(mode, filters.q, list.length, { meta, relaxed });
    if (btn) { btn.disabled = false; btn.textContent = '분석'; }
    setMoreBusy(false);
    focusResults(true);
  }

  /* 🔄 다른 영상 — 이미 본 영상은 빼고 새 목록을 가져옵니다 */
  async function runMore() {
    const filters = readFilters();
    if (!filters.q) { filters.q = '동물'; if (el('dKeyword')) el('dKeyword').value = '동물'; }
    const st = el('discoverStatus');
    const hadResults = document.querySelectorAll('#discoverResults .rcard').length > 0;
    const seq = ++discoverSeq;
    setMoreBusy(true);
    if (st) { st.classList.remove('off'); st.innerHTML = '<span class="spin"></span> 새로운 영상 찾는 중…'; }
    let list = [], mode = 'live';
    try {
      list = await RS.tube.more(filters);
      mode = RS.tube.lastMode || 'live';
    } catch (e) {
      list = RS.tube.demoSearch(filters);
      mode = 'demo';
    }
    if (seq !== discoverSeq) { setMoreBusy(false); return; }
    if (!list || !list.length) {
      setMoreBusy(false);
      setDiscoverStatus(mode, filters.q, 0, { variant: RS.tube.lastVariant });
      RS.toast('새 영상이 없어요 — 한 번 더 누르면 처음부터 다시 보여드려요');
      return;
    }
    if (!hadResults) moreCount = 0; else moreCount++;
    renderDiscover(list, { mode, q: filters.q, removed: safeRemoved() });
    setDiscoverStatus(mode, filters.q, list.length, { relaxed: !!RS.tube.lastRelaxed, refresh: moreCount || 0, variant: RS.tube.lastVariant });
    setMoreBusy(false);
    RS.toast('🔄 새 영상 ' + list.length + '건 도착', 'ok');
  }

  function renderDiscover(list, info) {
    const box = el('discoverResults');
    if (!box) return;
    list = list || RS.demoDiscover;
    if (!list.length) {
      const rem = (info && info.removed) || 0;
      box.innerHTML = rem
        ? `<div class="note rcard-empty">🛡️ 방송·아이돌·영화·랭킹 영상 <b>${rem}건이 전부 자동 제외</b>되어 남은 게 없습니다.<br>단일 장면 키워드(동물·일상·꿀팁·해외밈)로 다시 찾아보세요.
            <button class="btn primary sm" id="dRelax">필터 풀고 다시</button>
            <button class="btn outline sm" id="dSafeOff">🛡️ 자동 제외 끄고 보기</button></div>`
        : `<div class="note rcard-empty">조건에 맞는 영상이 없습니다. 필터를 풀면 바로 다시 찾아봅니다.
            <button class="btn primary sm" id="dRelax">필터 풀고 다시</button></div>`;
      const rb = el('dRelax');
      if (rb) rb.addEventListener('click', () => {
        el('dMin').value = '10000'; el('dDur').value = 'short'; el('dRegion').value = '';
        syncFilterLabel(); runDiscover();
      });
      const sb = el('dSafeOff');
      if (sb) sb.addEventListener('click', applySafeToggle);
      return;
    }
    box.innerHTML = list.map((v, i) => {
      const views = U.fmtNum(v.views || 0);
      const hasSubs = v.subs > 0;
      const ratio = hasSubs ? (v.ratio >= 1 ? v.ratio.toFixed(1) + '×' : (v.views / Math.max(1, v.subs)).toFixed(2)) : '';
      const hot = hasSubs && v.ratio >= 3;
      const hue = 196 + (i * 29) % 90;
      const badge = hasSubs ? `${hot ? '🔥 ' : ''}${ratio}` : `🔥 ${views}`;
      const tag = v.sim === 'related' ? '<span class="rc-tag">비슷한 결</span>' : v.sim === 'fresh' ? '<span class="rc-tag">추천</span>' : '';
      const url = v.url || '';
      return `<article class="rcard" data-id="${U.esc(v.id || i)}" data-title="${U.esc(v.title)}" tabindex="0" role="button" aria-label="${U.esc(v.title)} — 눌러서 대본 세팅">
        <div class="thumb">
          ${v.thumb ? `<img src="${U.esc(v.thumb)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : `<div class="ph" style="background:linear-gradient(150deg,hsl(${hue} 32% 16%),#0b0d12 70%)">▶</div>`}
          <button class="rc-play" data-act="preview" aria-label="미리보기 재생" title="미리보기 재생">▶</button>
          <span class="ratio">${badge}</span>
          <span class="len">${v.len ? U.fmtClock(v.len) : ''}</span>
          ${tag}
        </div>
        <div class="rc-body">
          <div class="rc-title">${U.esc(v.title)}</div>
          <div class="rc-meta"><span>${U.esc(v.channel || v.cat || '')}</span><span><b>${views}</b>회</span>${hasSubs ? `<span>구독 ${U.fmtNum(v.subs)}</span>` : ''}${v.days == null ? '' : `<span>${v.days === 0 ? '오늘' : v.days + '일 전'}</span>`}</div>
          <div class="rc-acts">
            <button class="rc-act main" data-act="pick">대본 세팅 →</button>
            ${url ? `<a class="rc-act" href="${U.esc(url)}" target="_blank" rel="noopener" data-act="open"><span class="lab-full">원본 열기 ↗</span><span class="lab-short">원본 ↗</span></a>` : ''}
            ${url ? '<button class="rc-act" data-act="copy"><span class="lab-full">링크 복사</span><span class="lab-short">복사</span></button>' : ''}
            <button class="rc-act" data-act="find"><span class="lab-full">원작자 찾기</span><span class="lab-short">원작자</span></button>
          </div>
        </div>
      </article>`;
    }).join('');
    box.querySelectorAll('.rcard').forEach(card => {
      const item = list.find(x => String(x.id) === card.dataset.id) || {};
      const pick = () => { if (item.url) selectShort(item); else oneClickImport(card.dataset.title); };
      card.addEventListener('click', e => {
        const act = e.target.closest('[data-act]');
        if (!act) { pick(); return; }
        const kind = act.dataset.act;
        if (kind === 'pick') { pick(); return; }
        e.preventDefault(); e.stopPropagation();
        if (kind === 'preview') openPreview(item, 'short');
        else if (kind === 'copy') copyText(item.url || '');
        else if (kind === 'find') findOriginal(item.title, 'youtube', item.url);
        else if (kind === 'open' && item.url) window.open(item.url, '_blank', 'noopener');
      });
      card.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(); }
      });
    });
  }

  /* ── 무가공 클린 원본 (originals/manifest.json 번들) ──── */
  function origUrl(o) { return './' + String(o.file).replace(/^\.?\//, ''); }
  function renderOriginals() {
    const wrap = el('origWrap'), box = el('origGrid');
    const list = RS.originals || [];
    if (!wrap || !box) return;
    if (!list.length) { wrap.hidden = true; return; }
    wrap.hidden = false;
    if (el('origSub')) el('origSub').textContent = '· ' + list.length + '편 · 다운로드 없이 딸깍';
    box.innerHTML = list.map(o => `<article class="ocard" data-id="${U.esc(o.id)}">
        <div class="ocard-thumb">
          <img src="${U.esc(o.thumb)}" alt="${U.esc(o.title)} 썸네일" loading="lazy" decoding="async">
          <span class="ocard-len">${Math.round(o.len || 0)}초</span>
          <span class="ocard-cat">${U.esc(o.cat || '원본')}</span>
        </div>
        <div class="ocard-body">
          <div class="ocard-title">${U.esc(o.title)}</div>
          <div class="ocard-hook">훅 · ${U.esc(o.hook || '')}</div>
          <div class="ocard-acts">
            <button class="btn outline sm" data-prev="${U.esc(o.id)}">▶ 미리보기</button>
            <a class="btn outline sm" href="${U.esc(origUrl(o))}" download="${U.esc(String(o.file).split('/').pop())}" data-dl="${U.esc(o.id)}">⬇ 원본 다운</a>
            <button class="btn primary sm" data-apply="${U.esc(o.id)}">🎬 바로 얹기</button>
          </div>
        </div>
      </article>`).join('');
    box.querySelectorAll('[data-apply]').forEach(b => b.addEventListener('click', () => applyOriginal(b.dataset.apply, b)));
    box.querySelectorAll('[data-prev]').forEach(b => b.addEventListener('click', () => {
      const o = list.find(x => x.id === b.dataset.prev);
      if (o) openPreview(o, 'original');
    }));
    box.querySelectorAll('[data-dl]').forEach(a => a.addEventListener('click', () => {
      const o = list.find(x => x.id === a.dataset.dl) || {};
      RS.toast('⬇ 원본 다운 시작 · ' + (o.title || '') + ' (' + fmtMB(o.bytes || 0) + ')');
    }));
  }

  async function applyOriginal(id, btn) {
    const o = (RS.originals || []).find(x => x.id === id);
    if (!o) { RS.toast('원본 정보를 찾지 못했습니다', 'err'); return; }
    if (S.ui.applyingOriginal) { RS.toast('이미 원본을 받는 중입니다', 'err'); return; }
    S.ui.applyingOriginal = true;
    const label = btn ? btn.textContent : '';
    if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spin"></span> 받는 중…'; }
    let failed = '';
    try {
      const res = await fetch(origUrl(o), { cache: 'force-cache' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const total = +res.headers.get('content-length') || o.bytes || 0;
      let blob;
      if (res.body && res.body.getReader && total) {
        const reader = res.body.getReader();
        const chunks = []; let got = 0;
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          chunks.push(value); got += value.length;
          if (btn) btn.innerHTML = '<span class="spin"></span> ' + Math.min(99, Math.round(got / total * 100)) + '%';
        }
        blob = new Blob(chunks, { type: 'video/mp4' });
      } else {
        blob = await res.blob();
      }
      if (!blob || blob.size < 20000) throw new Error('파일이 비어 있습니다');
      const fname = String(o.file).split('/').pop();
      const file = (typeof File === 'function') ? new File([blob], fname, { type: 'video/mp4' }) : blob;
      if (!file.name) file.name = fname;
      loadVideoFile(file);
      S.ui.picked = Object.assign({}, o, { local: true, url: origUrl(o), channel: o.credit || '', views: 0 });
      showSourcePanel(S.ui.picked);
      setTab('script');
      RS.toast('🎬 원본 얹음 · ' + o.title + ' (' + fmtMB(blob.size) + ')', 'ok');
    } catch (e) {
      failed = e.message;
      RS.toast('원본을 받지 못했습니다: ' + e.message + ' — ⬇ 원본 다운으로 받아 올려 주세요', 'err');
    } finally {
      S.ui.applyingOriginal = false;
      if (btn) { btn.disabled = false; btn.innerHTML = label || '🎬 바로 얹기'; }
    }
    return !failed;
  }

  function bindDiscoverOnce() {
    el('dSearch').addEventListener('click', runDiscover);
    el('dRefresh').addEventListener('click', runDiscover);
    if (el('dMore')) el('dMore').addEventListener('click', runMore);
    if (el('popMore')) el('popMore').addEventListener('click', loadPopularMore);
    el('dKeyword').addEventListener('keydown', e => { if (e.key === 'Enter') runDiscover(); });
    $$('#dPresets .preset-chip').forEach(b => b.addEventListener('click', () => applyDiscoverPreset(b.dataset.preset)));
    ['dRegion', 'dDur', 'dMin', 'dSort'].forEach(id => el(id).addEventListener('change', () => {
      $$('#dPresets .preset-chip').forEach(b => b.classList.remove('on'));
      syncFilterLabel();
    }));
    syncFilterLabel();
    $$('#dChips .chip').forEach(c => c.addEventListener('click', () => {
      el('dKeyword').value = c.dataset.kw;
      $$('#dChips .chip').forEach(x => x.classList.toggle('on', x === c));
      $$('#dPresets .preset-chip').forEach(b => b.classList.remove('on'));
      runDiscover();
    }));
    renderOriginals();
  }

  /* ── 5단계 마무리: 제목 5안 · 썸네일 · 3줄 체크 · 피클 넘기기 ── */
  const UPX = { style: (RS.up && RS.up.prefs && RS.up.prefs.style) || 'docu', titles: [], titleSource: 'template', thumbImg: null, frame: null, thumbBlob: null, thumbText: '' };
  let thumbTimer = null, checkTimer = null;

  function upCtx() {
    return {
      project: S.project,
      title: el('uTitle') ? el('uTitle').value : '',
      desc: el('uDesc') ? el('uDesc').value : '',
      tags: el('uTags') ? el('uTags').value : ''
    };
  }

  function bindUpload() {
    if (!el('uTitle') || !RS.up) return;
    el('uTitle').addEventListener('input', () => {
      el('uTitleCount').textContent = el('uTitle').value.length + '/100';
      const tt = el('uThumbText');
      if (tt && !tt.dataset.touched) tt.value = RS.up.plain(el('uTitle').value).slice(0, 40);
      scheduleThumb();
      scheduleCheck();
    });
    el('uDesc').addEventListener('input', scheduleCheck);
    el('uTags').addEventListener('input', scheduleCheck);
    el('uFile').addEventListener('change', e => {
      const f = e.target.files && e.target.files[0];
      if (!f) return;
      S.media.exportBlob = f;
      S.media.exportName = f.name;
      syncUploadFields();
    });
    el('uCopyMeta').addEventListener('click', copyMeta);
    el('uCopyMeta2').addEventListener('click', copyMeta);
    if (el('uCopySet')) el('uCopySet').addEventListener('click', copyHandoffSet);
    el('uTitleAI').addEventListener('click', aiTitles);
    el('uThumbRefresh').addEventListener('click', () => { UPX.frame = null; refreshThumb(true); });
    el('uThumbText').addEventListener('input', e => { e.target.dataset.touched = '1'; scheduleThumb(); });
    el('uThumbSub').addEventListener('input', scheduleThumb);
    el('uThumbSave').addEventListener('click', saveThumb);
    el('uSaveThumb').addEventListener('click', saveThumb);
    el('uSaveVideo').addEventListener('click', saveVideo);
    el('uThumbBg').addEventListener('change', e => {
      const f = e.target.files && e.target.files[0];
      if (!f) return;
      const img = new Image();
      img.onload = () => {
        UPX.thumbImg = img;
        S.media.thumbImg = img;
        el('uThumbBgClear').hidden = false;
        el('uThumbState').textContent = '배경 · ' + f.name;
        refreshThumb(true);
      };
      img.onerror = () => RS.toast('이미지를 읽지 못했습니다', 'err');
      img.src = URL.createObjectURL(f);
    });
    el('uThumbBgClear').addEventListener('click', () => {
      UPX.thumbImg = null; S.media.thumbImg = null;
      el('uThumbBgClear').hidden = true;
      el('uThumbState').textContent = '현재 영상 프레임 사용';
      refreshThumb(true);
    });
    el('uCheckRun').addEventListener('click', () => {
      const res = renderCheck(RS.up.precheck(upCtx()));
      RS.toast(res.warn ? '체크 완료 — 경고 ' + res.warn + '건' : '체크 완료 — 3/3 통과', res.warn ? '' : 'ok');
    });
    el('uDescFix').addEventListener('click', fixDesc);
    renderStyleChips();
  }

  function scheduleThumb() {
    clearTimeout(thumbTimer);
    thumbTimer = setTimeout(() => drawThumbNow(), 220);
  }
  function scheduleCheck() {
    clearTimeout(checkTimer);
    checkTimer = setTimeout(() => renderCheck(RS.up.precheck(upCtx())), 320);
  }

  function renderStyleChips() {
    const box = el('uThumbStyles');
    if (!box) return;
    box.innerHTML = RS.up.THUMB_STYLES.map(st =>
      `<button class="chip${st.id === UPX.style ? ' on' : ''}" data-style="${st.id}" title="${U.esc(st.desc)}">${U.esc(st.label)}</button>`
    ).join('');
    box.querySelectorAll('[data-style]').forEach(b => b.addEventListener('click', () => {
      UPX.style = b.dataset.style;
      RS.up.savePrefs({ style: UPX.style });
      renderStyleChips();
      refreshThumb(false);
    }));
  }

  function drawThumbNow() {
    const c = el('uThumbCanvas');
    if (!c || !RS.up) return;
    const p = S.project;
    const text = (el('uThumbText') && el('uThumbText').value.trim()) || RS.up.plain(el('uTitle') ? el('uTitle').value : '') || '제목을 넣으세요';
    const sub = el('uThumbSub') ? el('uThumbSub').value.trim() : '';
    const badge = (p.tag && p.tag.text) ? p.tag.text.replace(/^@/, '') : (p.hook && p.hook.line1 ? '' : '');
    RS.up.drawThumb(c, {
      style: UPX.style, text, sub, badge: badge || '',
      img: UPX.thumbImg || UPX.frame, sample: (p.source && p.source.sample) || 'docu',
      t: S.player.t || 0, zoom: p.zoom || 1.02
    });
    UPX.thumbText = text;
    RS.up.thumbBlob(c).then(b => { UPX.thumbBlob = b; });
  }

  function refreshThumb(force) {
    const c = el('uThumbCanvas');
    if (!c || !RS.up) return;
    const up = el('tab-upload');
    if (up && up.hidden) return;   /* 보이지 않는 탭에서는 썸네일을 다시 그리지 않음(스와이프 반응 속도) */
    if (UPX.frame && !force) { drawThumbNow(); return; }
    RS.up.ready().then(() => RS.up.frameSource(S.player.t)).then(src => {
      if (src) UPX.frame = src;
      drawThumbNow();
      if (el('uThumbState') && !UPX.thumbImg) {
        el('uThumbState').textContent = src ? '배경 · 현재 영상 프레임' : '배경 · 샘플 이미지';
      }
    });
  }

  function renderTitles(list, source) {
    UPX.titles = list || [];
    UPX.titleSource = source || 'template';
    const box = el('uTitleList');
    if (!box) return;
    const cur = RS.up.plain(el('uTitle') ? el('uTitle').value : '');
    box.innerHTML = UPX.titles.map((t, i) =>
      `<button class="title-item${RS.up.plain(t.text) === cur ? ' on' : ''}" data-i="${i}">
        <span class="tkind">${U.esc(t.kind || '추천')}</span>
        <span class="ttext">${U.esc(t.text)}</span>
      </button>`
    ).join('');
    const badge = el('uTitleTag');
    if (badge) badge.textContent = source === 'gemini' ? 'AI 5안' : '기본 5안';
    box.querySelectorAll('.title-item').forEach(b => b.addEventListener('click', () => {
      const t = UPX.titles[+b.dataset.i];
      if (!t) return;
      S.project.meta.titles[S.project.meta.selected || 0] = RS.up.clampTitle(t.text);
      el('uTitle').value = S.project.meta.titles[S.project.meta.selected || 0];
      el('uTitleCount').textContent = el('uTitle').value.length + '/100';
      const tt = el('uThumbText');
      if (tt) { tt.dataset.touched = ''; tt.value = RS.up.plain(t.text).slice(0, 40); }
      box.querySelectorAll('.title-item').forEach(x => x.classList.toggle('on', x === b));
      touch();
      scheduleThumb();
      scheduleCheck();
      RS.toast('제목을 넣었습니다 — ' + t.kind);
    }));
  }

  async function aiTitles() {
    const btn = el('uTitleAI');
    btn.disabled = true;
    const old = btn.textContent;
    btn.innerHTML = '<span class="spin"></span> 5안 만드는 중';
    try {
      const r = await RS.up.titlesAI(S.project);
      renderTitles(r.list, r.source);
      RS.toast(r.source === 'gemini' ? 'AI 제목 5안 완성' : '기본 5안으로 만들었습니다', 'ok');
    } catch (e) {
      renderTitles(RS.up.titlesSmart(S.project), 'template');
      RS.toast('AI 호출 실패 — 기본 5안으로 대체했습니다', 'err');
    } finally {
      btn.disabled = false;
      btn.textContent = old;
    }
  }

  function renderCheck(res) {
    const box = el('uCheckList');
    if (!box) return res;
    box.innerHTML = res.items.map(it => `<div class="audit-item ${it.ok ? 'ok' : 'warn'}">
      <span class="ai-ico">${it.ok ? '✓' : '!'}</span>
      <div class="ai-body"><b>${U.esc(it.title)}</b><span>${U.esc(it.detail)}</span></div>
    </div>`).join('');
    const badge = el('uCheckBadge');
    if (badge) {
      badge.textContent = res.warn ? '경고 ' + res.warn + '건' : '3/3 통과';
      badge.className = 'tag ' + (res.warn ? 'audit-badge-warn' : 'audit-badge-ok');
    }
    const fix = el('uCheckFix');
    if (fix) fix.hidden = !res.items.some(it => it.fix);
    return res;
  }

  function fixDesc() {
    const desc = RS.up.withSafety(el('uDesc').value, RS.up.prefs.email);
    S.project.meta.desc = desc;
    el('uDesc').value = desc;
    touch();
    renderCheck(RS.up.precheck(upCtx()));
    RS.toast('설명란에 삭제 안내 문구를 넣었습니다', 'ok');
  }

  async function copyMeta() {
    const title = (el('uTitle').value || '').trim();
    const desc = el('uDesc').value || '';
    const txt = title + (desc ? '\n\n' + desc : '');
    if (!txt.trim()) { RS.toast('복사할 제목이 없습니다', 'err'); return; }
    const ok = await U.copy(txt);
    RS.toast(ok ? '제목·설명을 복사했습니다' : '복사 실패 — 직접 선택해 주세요', ok ? 'ok' : 'err');
  }

  /* 📋 참외에게 보낼 작업 세트 — 원본 + 스타일 + 대본 + 제목 한 번에 */
  function handoffSetText() {
    const p = S.project;
    const pr = RS.presetById(p.presetId) || {};
    const v = S.ui.picked || {};
    const L = [];
    L.push('[릴 스튜디오 작업 세트]');
    L.push('');
    if (p.source.type === 'video' && S.media.videoName) {
      L.push('· 원본: 클린 원본 MP4 — ' + S.media.videoName);
      if (v && v.local && v.file) L.push('  (사이트 원본 파일: ' + v.file + ')');
    } else if (v && v.url) {
      L.push('· 원본: ' + v.url);
      if (v.title) L.push('  원제목: ' + v.title);
      if (v.channel) L.push('  채널: ' + v.channel);
    } else {
      L.push('· 원본: (아직 없음 — 1단계에서 영상을 골라주세요)');
    }
    L.push('· 편집 스타일: ' + (pr.name || '커스텀') + (pr.short ? ' — ' + pr.short : ''));
    const title = ((el('uTitle') && el('uTitle').value) || p.meta.titles[p.meta.selected] || p.meta.titles[0] || '').trim();
    L.push('· 제목: ' + (title || '(없음)'));
    const hooks = [p.hook.line1, p.hook.line2].filter(Boolean);
    if (hooks.length) L.push('· 상단 훅: ' + hooks.join(' / '));
    L.push('· 대본 (' + (p.cues || []).length + '줄 · ' + U.totalDur(p).toFixed(1) + '초, 음슴체 0%):');
    (p.cues || []).forEach((c, i) => {
      const cm = (c.comment && c.comment.on && c.comment.text) ? '   (댓글: ' + c.comment.text + ')' : '';
      L.push('  ' + (i + 1) + '. [' + (+c.start).toFixed(1) + '~' + (+c.end).toFixed(1) + 's] ' + U.strip(c.text) + cm);
    });
    const bgm = RS.bgmList.find(b => b.id === p.bgm.id);
    L.push('· BGM: ' + (p.bgm.on && bgm ? bgm.name + ' ' + Math.round(p.bgm.volume * 100) + '% · 덕킹 ' + Math.round((p.bgm.duck || 0) * 100) + '%' : '없음'));
    if (p.meta.tags) L.push('· 태그: ' + p.meta.tags);
    if (el('uDesc') && el('uDesc').value) {
      L.push('');
      L.push('[설명]');
      L.push(el('uDesc').value);
    }
    L.push('');
    L.push('→ 이 세트 그대로 완성본 제작 + 유튜브 쇼츠 업로드까지 진행해 주세요.');
    return L.join('\n');
  }
  async function copyHandoffSet() {
    const txt = handoffSetText();
    const ok = await U.copy(txt);
    RS.toast(ok ? '📋 작업 세트 복사됨 — 참외 채팅에 그대로 붙여넣으세요' : '복사가 막혔습니다 — 직접 선택해 주세요', ok ? 'ok' : 'err');
  }

  function saveVideo() {
    const blob = S.media.exportBlob;
    if (!blob) { RS.toast('먼저 미리보기 탭에서 영상을 렌더하세요', 'err'); setTab('preview'); return; }
    const type = blob.type || '';
    const ext = /mp4/i.test(type) || /\.mp4$/i.test(S.media.exportName || '') ? '.mp4' : '.webm';
    const name = (S.media.exportName || '').replace(/\.[a-z0-9]+$/i, '');
    U.download((name || fileBase()) + ext, blob);
    RS.toast('완성 영상을 저장했습니다 — 참외 채팅에 올려주세요', 'ok');
  }

  async function saveThumb() {
    const c = el('uThumbCanvas');
    if (!c) return;
    if (!UPX.thumbBlob) { drawThumbNow(); await new Promise(r => setTimeout(r, 180)); }
    const blob = UPX.thumbBlob || await RS.up.thumbBlob(c);
    if (!blob) { RS.toast('썸네일을 만들지 못했습니다', 'err'); return; }
    U.download(fileBase() + '_thumb.png', blob);
    RS.toast('썸네일 PNG를 저장했습니다', 'ok');
  }

  function syncUploadFields() {
    const p = S.project;
    if (!el('uTitle') || !RS.up) return;
    if (document.activeElement !== el('uTitle')) el('uTitle').value = p.meta.titles[p.meta.selected] || p.meta.titles[0] || p.name || '';

    /* 설명란: “출처 · 원작자 요청 시 즉시 삭제합니다” 자동 포함 */
    const safeDesc = RS.up.withSafety(p.meta.desc || '', RS.up.prefs.email);
    if (safeDesc !== (p.meta.desc || '')) { p.meta.desc = safeDesc; touch(); }
    if (document.activeElement !== el('uDesc')) el('uDesc').value = safeDesc;
    if (document.activeElement !== el('uTags')) el('uTags').value = p.meta.tags || '';

    el('uTitleCount').textContent = (el('uTitle').value || '').length + '/100';
    el('uFileState').textContent = S.media.exportBlob
      ? ('렌더 파일 · ' + (S.media.exportName || 'video') + ' (' + (S.media.exportBlob.size / 1048576).toFixed(1) + 'MB)')
      : '렌더 파일 없음 — 미리보기 탭에서 먼저 렌더하세요';
    el('uFileState').className = 'hint' + (S.media.exportBlob ? ' ok' : '');
    const tag = el('uReadyTag');
    if (tag) {
      tag.textContent = S.media.exportBlob ? '파일 준비됨' : '파일 없음';
      tag.className = 'tag' + (S.media.exportBlob ? ' lime' : '');
    }
    const hint = el('uHandoffHint');
    if (hint) hint.textContent = S.media.exportBlob
      ? '준비 완료 — 두 파일을 참외 채팅에 올리면 업로드·예약까지 참외가 처리합니다.'
      : '렌더 영상이 없으면 미리보기 탭에서 먼저 렌더하세요.';

    const tt = el('uThumbText');
    if (tt && !tt.dataset.touched) tt.value = RS.up.plain(el('uTitle').value || (p.hook && p.hook.line1) || '').slice(0, 40);
    renderStyleChips();
    /* 프로젝트가 바뀌면 제목 5안·썸네일 배경 프레임을 새로 뽑습니다 */
    if (UPX.projId !== p.id) {
      UPX.projId = p.id;
      UPX.frame = null;
      UPX.titles = [];
      renderTitles(RS.up.titlesSmart(p), 'template');
    }
    refreshThumb(false);
    if (!UPX.titles.length) renderTitles(RS.up.titlesSmart(p), 'template');
    renderCheck(RS.up.precheck(upCtx()));
  }

  /* ── settings ───────────────────────────────────────── */
  function openSettings() {
    el('stYtKey').value = S.settings.youtube || '';
    el('stGemKey').value = S.settings.gemini || '';
    el('stYtState').textContent = '';
    el('stGemState').textContent = '';
    const p = S.project;
    el('stSubSize').value = p.sub.fontSize || 62;
    el('stSubSizeVal').textContent = p.sub.fontSize || 62;
    el('stAccent').value = normHex(p.sub.accent, '#D8FF3E');
    el('stHookColor').value = normHex(p.hook.color, '#FFFFFF');
    el('stHookBg').value = normHex(p.hook.bg, '#0B0D12');
    el('stSubBox').checked = p.sub.box !== false;
    el('stCardOn').checked = !!(p.card && p.card.on);
    renderPresetSelect();
    RS.openModal('settings');
  }
  function normHex(v, d) {
    if (typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v)) return v;
    return d;
  }
  function renderPresetSelect() {
    const sel = el('stPresetSelect');
    sel.innerHTML = S.presets.map(p => `<option value="${p.id}">${U.esc(p.name)}${p.builtin ? '' : ' (내 프리셋)'}</option>`).join('');
    sel.value = S.project.presetId || 'dopa-band';
    const cur = S.presets.find(p => p.id === sel.value) || S.presets[0];
    el('stPresetDesc').textContent = cur ? cur.desc || '' : '';
  }
  function bindSettings() {
    const restyle = () => { drawStatic(); touch(); };
    el('stSubSize').addEventListener('input', e => {
      S.project.sub.fontSize = +e.target.value;
      el('stSubSizeVal').textContent = e.target.value;
      restyle();
    });
    el('stAccent').addEventListener('input', e => { S.project.sub.accent = e.target.value; S.project.hook.accent = e.target.value; restyle(); });
    el('stHookColor').addEventListener('input', e => { S.project.hook.color = e.target.value; restyle(); });
    el('stHookBg').addEventListener('input', e => { S.project.hook.bg = e.target.value; restyle(); });
    el('stSubBox').addEventListener('change', e => { S.project.sub.box = e.target.checked; restyle(); });
    el('stCardOn').addEventListener('change', e => { S.project.card.on = e.target.checked; restyle(); });
    el('stSaveKeys').addEventListener('click', () => {
      S.settings.youtube = el('stYtKey').value.trim();
      S.settings.gemini = el('stGemKey').value.trim();
      RS.store.saveSettings(S.settings);
      updateMode();
      RS.toast('키를 저장했습니다 (이 브라우저에만)', 'ok');
    });
    el('stClearKeys').addEventListener('click', async () => {
      if (!(await RS.confirm('키 지우기', '저장된 API 키 3개를 지웁니다. 계속할까요?'))) return;
      S.settings = {}; RS.store.saveSettings({});
      el('stYtKey').value = ''; el('stGemKey').value = '';
      updateMode(); RS.toast('키를 지웠습니다');
    });
    el('stYtTest').addEventListener('click', async () => {
      const k = el('stYtKey').value.trim();
      if (!k) { el('stYtState').textContent = '키를 넣어주세요'; return; }
      el('stYtState').textContent = '확인 중…';
      try { await RS.tube.testKey(k); el('stYtState').textContent = '✓ 정상'; el('stYtState').style.color = 'var(--lime)'; }
      catch (e) { el('stYtState').textContent = '✕ ' + e.message; el('stYtState').style.color = '#FFB4B4'; }
    });
    el('stGemTest').addEventListener('click', async () => {
      const k = el('stGemKey').value.trim();
      if (!k) { el('stGemState').textContent = '키를 넣어주세요'; return; }
      el('stGemState').textContent = '확인 중…';
      try { const n = await RS.ai.testGemini(k); el('stGemState').textContent = '✓ 정상 · 모델 ' + n + '개'; el('stGemState').style.color = 'var(--lime)'; }
      catch (e) { el('stGemState').textContent = '✕ ' + e.message; el('stGemState').style.color = '#FFB4B4'; }
    });
    el('stPresetSelect').addEventListener('change', () => {
      const cur = S.presets.find(p => p.id === el('stPresetSelect').value);
      el('stPresetDesc').textContent = cur ? cur.desc || '' : '';
    });
    el('stPresetApply').addEventListener('click', () => {
      const p = S.presets.find(x => x.id === el('stPresetSelect').value);
      if (p) { applyPreset(p); RS.toast(p.name + ' 적용', 'ok'); }
    });
    el('stPresetSave').addEventListener('click', () => {
      const name = el('stPresetName').value.trim();
      if (!name) { RS.toast('프리셋 이름을 넣어주세요', 'err'); return; }
      const p = S.project;
      const preset = {
        id: 'u_' + U.uid(), name, builtin: false,
        desc: [U.hookStyles[p.hook.style] || '', p.ratio, '자막 ' + p.sub.fontSize + 'px', '말속도 ' + p.voice.rate + 'x'].join(' · '),
        ratio: p.ratio, hook: U.clone(p.hook), sub: U.clone(p.sub), card: U.clone(p.card), tag: U.clone(p.tag),
        grade: p.grade, zoom: p.zoom, offset: p.offset, bgm: U.clone(p.bgm), voiceRate: p.voice.rate
      };
      S.presets.push(preset);
      RS.store.savePresets(S.presets.filter(x => !x.builtin));
      S.project.presetId = preset.id;
      el('stPresetName').value = '';
      renderPresetSelect(); touch();
      RS.toast('프리셋 저장 · ' + name, 'ok');
    });
    el('stPresetDelete').addEventListener('click', async () => {
      const id = el('stPresetSelect').value;
      const p = S.presets.find(x => x.id === id);
      if (!p || p.builtin) { RS.toast('기본 프리셋은 삭제할 수 없습니다', 'err'); return; }
      if (!(await RS.confirm('프리셋 삭제', p.name + ' 을(를) 지울까요?'))) return;
      S.presets = S.presets.filter(x => x.id !== id);
      RS.store.savePresets(S.presets.filter(x => !x.builtin));
      renderPresetSelect(); RS.toast('삭제했습니다');
    });
    el('stPresetExport').addEventListener('click', () => {
      const data = JSON.stringify(S.presets.filter(x => !x.builtin), null, 2);
      U.download('reel_presets.json', new Blob([data], { type: 'application/json' }));
    });
    el('stPresetImport').addEventListener('change', async e => {
      const f = e.target.files && e.target.files[0]; if (!f) return;
      try {
        const arr = JSON.parse(await f.text());
        if (!Array.isArray(arr)) throw new Error('형식이 아닙니다');
        arr.forEach(p => { if (p && p.name) { p.id = p.id || 'u_' + U.uid(); p.builtin = false; S.presets.push(p); } });
        RS.store.savePresets(S.presets.filter(x => !x.builtin));
        renderPresetSelect(); RS.toast('프리셋 ' + arr.length + '개를 가져왔습니다', 'ok');
      } catch (err) { RS.toast('가져오기 실패: ' + err.message, 'err'); }
      e.target.value = '';
    });
    el('stProjExport').addEventListener('click', () => {
      const copy = U.clone(S.project);
      delete copy.__none;
      U.download(fileBase() + '.json', new Blob([JSON.stringify(copy, null, 2)], { type: 'application/json' }));
      RS.toast('프로젝트 JSON 저장', 'ok');
    });
    el('stProjImport').addEventListener('change', async e => {
      const f = e.target.files && e.target.files[0]; if (!f) return;
      try {
        const j = JSON.parse(await f.text());
        if (!j.cues || !Array.isArray(j.cues)) throw new Error('큐가 없습니다');
        S.project = Object.assign(RS.newProject(), j);
        S.player.t = 0; pause();
        syncProjectToUI(true);
        RS.toast('프로젝트를 불러왔습니다', 'ok');
        RS.closeModal('settings');
      } catch (err) { RS.toast('불러오기 실패: ' + err.message, 'err'); }
      e.target.value = '';
    });
    el('stReset').addEventListener('click', async () => {
      if (!(await RS.confirm('전체 초기화', '저장된 프로젝트·프리셋·키를 모두 지우고 데모로 돌아갑니다. 되돌릴 수 없습니다.'))) return;
      Object.values(RS.KEYS).forEach(k => { try { localStorage.removeItem(k); } catch (e) {} });
      location.reload();
    });
  }

  function applyPreset(p) {
    const pr = S.project;
    pr.presetId = p.id;
    ['hook', 'sub', 'card', 'tag', 'bgm'].forEach(k => { if (p[k]) pr[k] = Object.assign({}, pr[k], U.clone(p[k])); });
    if (p.ratio) pr.ratio = p.ratio;
    if (p.grade) pr.grade = p.grade;
    ['bright', 'contrast', 'sat', 'letterbox'].forEach(k => { if (p[k] != null) pr[k] = p[k]; });
    // 스타일이 지정한 효과음은 베댓이 붙은 큐에만, 비어 있을 때 채웁니다
    if (p.sfx && pr.cues) pr.cues.forEach(c => { if (c.comment && c.comment.on && !c.sfx) c.sfx = p.sfx; });
    if (p.zoom) pr.zoom = p.zoom;
    if (p.offset != null) pr.offset = p.offset;
    if (p.voiceRate) pr.voice.rate = p.voiceRate;
    // fill missing hook lines from preset defaults
    pr.hook.size = p.hook.size;
    pr.sub.font = p.sub.font;
    resizeStage();
    syncProjectToUI(true);
    drawStatic();
    renderStyleCards();
    touch();
    const pd = el('stPresetDesc'); if (pd) pd.textContent = p.desc || '';
    lastOverlayKey = '';
    syncStyleBar();
    paintOverlay(true);
  }

  /* ── sync all UI from project ───────────────────────── */
  function syncProjectToUI(full) {
    const p = S.project;
    el('projName').value = p.name || '내 첫 쇼츠';
    el('aiTopic').value = p.topic || '';
    el('aiTone').value = el('aiTone').value || 'news';
    el('aiLang').value = p.lang || 'ko';
    el('hook1').value = p.hook.line1 || '';
    el('hook2').value = p.hook.line2 || '';
    el('hookStyle').value = p.hook.style || 'plain';
    el('hookOn').checked = p.hook.on !== false;
    el('metaDesc').value = p.meta.desc || '';
    el('metaTags').value = p.meta.tags || '';
    el('bgmVol').value = Math.round((p.bgm.volume || 0.32) * 100);
    el('bgmVolVal').textContent = el('bgmVol').value + '%';
    el('bgmDuck').value = Math.round((p.bgm.duck || 0.55) * 100);
    el('bgmDuckVal').textContent = el('bgmDuck').value + '%';
    el('voiceRate').value = Math.round((p.voice.rate || 1) * 100);
    el('voiceRateVal').textContent = (p.voice.rate || 1).toFixed(2) + 'x';

    el('voiceVol').value = Math.round((p.voice.volume == null ? 1 : p.voice.volume) * 100);
    el('voiceVolVal').textContent = el('voiceVol').value + '%';
    el('origOn').checked = p.orig.on !== false;
    el('origVol').value = Math.round((p.orig.volume == null ? 1 : p.orig.volume) * 100);
    el('origVolVal').textContent = el('origVol').value + '%';
    el('thumbBadge').value = (p.tag && p.tag.on) ? p.tag.text.replace(/^@/, '') : '';
    A.setBgmVolume(p.bgm.volume);
    A.setDuckAmount(p.bgm.duck);
    A.setOrigVolume(p.orig.on === false ? 0 : p.orig.volume);
    A.setVoiceVolume(p.voice.volume == null ? 1 : p.voice.volume);
    syncSourceUI();
    renderBgm();
    renderTitles();
    renderCues();
    renderScrubCues();
    resizeStage();
    updateMetaLine();
    updateMode();
    syncUploadFields();
    renderStyleCards();
    lastOverlayKey = '';
    paintOverlay(true);
    if (full) lastActiveCue = null;
  }

  /* ── QA hook ────────────────────────────────────────── */
  window.__rsQA = {
    version: '1.0',
    tab: n => setTab(n),
    play: () => play(),
    pause: () => pause(),
    seek: t => seekTo(t),
    state: () => ({
      ratio: S.project.ratio, cues: S.project.cues.length, dur: U.totalDur(S.project),
      playing: S.player.playing, t: nowT(), tab: S.ui.tab,
      bgm: S.project.bgm.id, preset: S.project.presetId,
      hook: [S.project.hook.line1, S.project.hook.line2],
      titles: S.project.meta.titles,
      errors: window.__rsErrors.slice(0, 20),
      canvasMain: (() => { const c = el('stageMain'); try { const d = c.getContext('2d').getImageData(c.width / 2, c.height / 2, 1, 1).data; return [d[0], d[1], d[2], d[3]]; } catch (e) { return null; } })()
    }),
    demo: () => { S.project = RS.demoProject(); syncProjectToUI(true); },
    thumb: () => makeThumb(),
    audit: () => runAudit(),
    fix: () => auditFix(),
    import: t => oneClickImport(t),
    preset: k => applyDiscoverPreset(k),
    style: id => applyPreset(RS.presetById(id)),
    resync: () => syncProjectToUI(true),
    styles: () => RS.presets.map(p => p.id),
    geom: () => {
      const p = S.project, W = 1080, H = p.ratio === '16:9' ? 607.5 : 1920;
      let sub = 0, card = 0;
      (p.cues || []).forEach(c => {
        const g = subGeom(p, c, W, H); if (g.bottom > sub) sub = g.bottom;
        const cg = cardGeom(p, c, W, H); if (cg && cg.bottom > card) card = cg.bottom;
      });
      return { subBottom: Math.round(sub), cardBottom: Math.round(card), safeY: AUDIT_SAFE_Y };
    },
    errors: () => window.__rsErrors.slice(),
    set: () => handoffSetText(),
    overlay: () => ({ cue: (el('ovSub') || {}).innerText || '', hook: (el('ovHook') || {}).innerText || '', cmt: (el('ovCmt') || {}).innerText || '', style: el('styName').innerText, idx: el('styIdx').innerText, kind: stage.kind }),
    swipe: n => stepStyle(n)
  };

  // bind discover after DOM ready (buttons exist already)
  if (document.readyState !== 'loading') { bindDiscoverOnce(); bindDiscover(); }
  else document.addEventListener('DOMContentLoaded', () => { bindDiscoverOnce(); bindDiscover(); });
})();
