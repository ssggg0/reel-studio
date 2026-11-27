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
    bindScript();
    bindMusic();
    bindTransport();
    bindPreview();
    bindUpload();
    bindSettings();
    fillVoices();
    renderSfx();
    syncProjectToUI(true);
    renderDiscover();
    loop();
    if (!RS.store.loadProject()) {
      setTimeout(() => RS.toast('데모 프로젝트로 열었어요 · 설정에서 API 키를 넣으면 실데이터로 바뀝니다'), 700);
    }
    document.fonts && document.fonts.ready.then(() => { drawStatic(); });
  }

  /* ── mode / meta ────────────────────────────────────── */
  function updateMode() {
    const n = (RS.ai.hasGemini() ? 1 : 0) + (RS.ai.hasYouTube() ? 1 : 0) + (RS.ai.hasOauth() ? 1 : 0);
    const pill = el('modePill'), txt = el('modeText');
    pill.classList.toggle('live', n > 0);
    txt.textContent = n === 0 ? '데모 모드' : n >= 3 ? 'API 연결됨' : '일부 연결';
    el('aiMode').textContent = RS.ai.hasGemini() ? 'Gemini 연결' : '데모 생성';
  }

  function updateMetaLine() {
    const p = S.project, dur = U.totalDur(p);
    el('projMeta').textContent = p.ratio + ' · ' + dur.toFixed(1) + '초 · ' + (p.cues || []).length + '큐';
    el('pRatioTag').textContent = p.ratio;
    el('aRatioTag').textContent = p.ratio;
    el('xLen').textContent = dur.toFixed(1);
    el('cueSummary').textContent = (p.cues || []).length + '큐 · ' + dur.toFixed(1) + '초';
    el('hookSummary').textContent = [p.hook.line1, p.hook.line2].filter(Boolean).length + '줄';
    el('metaSummary').textContent = (p.meta.titles || []).filter(Boolean).length + '안';
    el('sourceSummary').textContent = p.source.type === 'video' ? ('영상 · ' + (S.media.videoName || '')) : ('샘플 · ' + (RS.sampleSources.find(s => s.id === p.source.sample) || RS.sampleSources[0]).name);
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
    if (name === 'upload') syncUploadFields();
    if (name === 'script') { renderCues(); }
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
    $$('.modal-back').forEach(b => b.addEventListener('click', () => RS.closeModal(b.dataset.close)));
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') {
        $$('.modal:not([hidden])').forEach(m => RS.closeModal(m.id.replace('Modal', '')));
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
  function bindSource() {
    $$('#sSamples .chip').forEach(c => c.addEventListener('click', () => {
      S.project.source = { type: 'sample', sample: c.dataset.sample, name: c.textContent };
      S.project.zoom = 1;
      syncSourceUI();
      touch();
    }));
    el('sVideoFile').addEventListener('change', e => {
      const f = e.target.files && e.target.files[0];
      if (!f) return;
      loadVideoFile(f);
      e.target.value = '';
    });
    el('sVideoClear').addEventListener('click', () => clearVideo());
    $$('#sRatio .seg-btn').forEach(b => b.addEventListener('click', () => {
      S.project.ratio = b.dataset.ratio;
      $$('#sRatio .seg-btn').forEach(x => x.classList.toggle('is-on', x === b));
      resizeStage(); touch(); drawStatic();
    }));
    const bindRange = (id, key, fmt, scale) => {
      el(id).addEventListener('input', e => {
        const v = +e.target.value;
        S.project[key] = scale ? v / scale : v;
        el(id + 'Val').textContent = fmt(v);
        if (key === 'zoom') S.project.zoom = Math.max(0.5, v / 100);
        touch();
      });
    };
    bindRange('vZoom', 'zoom', v => v + '%', 100);
    bindRange('vOffset', 'offset', v => v < 35 ? '위' : v > 65 ? '아래' : '가운데', 100);
    bindRange('vBright', 'bright', v => (v > 0 ? '+' : '') + v);
    bindRange('vContrast', 'contrast', v => (v > 0 ? '+' : '') + v);
    bindRange('vSat', 'sat', v => (v > 0 ? '+' : '') + v);
    el('vGrade').addEventListener('change', e => { S.project.grade = e.target.value; touch(); });
  }

  function loadVideoFile(f) {
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
    touch();
    RS.toast('영상 올림 · ' + f.name);
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
    $$('#sRatio .seg-btn').forEach(x => x.classList.toggle('is-on', x.dataset.ratio === p.ratio));
    $$('#sSamples .chip').forEach(c => c.classList.toggle('on', p.source.type === 'sample' && c.dataset.sample === p.source.sample));
    el('sVideoName').textContent = S.media.videoName || '아직 파일 없음';
    el('sVideoClear').hidden = !S.media.videoName;
    el('vZoom').value = Math.round((p.zoom || 1) * 100);
    el('vZoomVal').textContent = Math.round((p.zoom || 1) * 100) + '%';
    el('vOffset').value = Math.round((p.offset == null ? .5 : p.offset) * 100);
    el('vOffsetVal').textContent = (p.offset == null ? .5 : p.offset) < .35 ? '위' : (p.offset || .5) > .65 ? '아래' : '가운데';
    el('vBright').value = p.bright || 0; el('vBrightVal').textContent = (p.bright > 0 ? '+' : '') + (p.bright || 0);
    el('vContrast').value = p.contrast || 0; el('vContrastVal').textContent = (p.contrast > 0 ? '+' : '') + (p.contrast || 0);
    el('vSat').value = p.sat || 0; el('vSatVal').textContent = (p.sat > 0 ? '+' : '') + (p.sat || 0);
    el('vGrade').value = p.grade || 'none';
    const sm = RS.sampleSources.find(s => s.id === (p.source.sample || 'docu'));
    el('stageBadge').textContent = p.source.type === 'video' ? '내 영상' : ('샘플 · ' + (sm ? sm.name : '다큐 다크'));
  }

  /* ── script tab ─────────────────────────────────────── */
  function bindScript() {
    el('sNewProject').addEventListener('click', async () => {
      if (!(await RS.confirm('새 프로젝트', '지금 대본과 큐를 지우고 새로 시작할까요? 저장된 프리셋은 그대로 남습니다.'))) return;
      S.project = RS.newProject();
      S.player.t = 0; pause();
      syncProjectToUI(true);
      RS.toast('새 프로젝트 시작');
    });

    el('aiGen').addEventListener('click', async () => {
      const topic = el('aiTopic').value.trim() || S.project.topic || S.project.name;
      if (!topic) { RS.toast('주제를 한 줄 넣어주세요', 'err'); el('aiTopic').focus(); return; }
      const btn = el('aiGen');
      btn.disabled = true; btn.innerHTML = '<span class="spin"></span> 생성중';
      try {
        const res = await RS.ai.generate({ topic, tone: el('aiTone').value, lang: el('aiLang').value, lengthSec: +el('aiLen').value });
        applyScript(res, el('aiLang').value);
        RS.toast(res.source === 'gemini' ? 'Gemini 대본 완성 · ' + res.cues.length + '큐' : '데모 대본 완성 · ' + res.cues.length + '큐 (키를 넣으면 실제 생성)', 'ok');
      } catch (e) {
        RS.toast('생성 실패: ' + e.message + ' — 데모 대본으로 대신합니다', 'err');
        applyScript(RS.ai.demo(topic, el('aiLang').value, +el('aiLen').value), el('aiLang').value);
      } finally {
        btn.disabled = false; btn.textContent = '대본 생성';
      }
    });

    el('aiTranslate').addEventListener('click', async () => {
      const lang = el('aiLang').value;
      const btn = el('aiTranslate');
      btn.disabled = true; btn.innerHTML = '<span class="spin"></span> 번역';
      try {
        const res = await RS.ai.translate(S.project, lang);
        applyScript(res, lang, true);
        RS.toast(res.source === 'gemini' ? '번역 완료 · ' + lang : '데모 번역으로 바꿨습니다 (Gemini 키 필요)', res.source === 'gemini' ? 'ok' : '');
      } catch (e) {
        RS.toast('번역 실패: ' + e.message, 'err');
      } finally { btn.disabled = false; btn.textContent = '번역'; }
    });

    ['hook1', 'hook2'].forEach(id => el(id).addEventListener('input', e => {
      S.project.hook[id === 'hook1' ? 'line1' : 'line2'] = e.target.value;
      touch(); drawStatic();
    }));
    el('hookStyle').addEventListener('change', e => { S.project.hook.style = e.target.value; touch(); });
    el('hookOn').addEventListener('change', e => { S.project.hook.on = e.target.checked; touch(); });

    el('cueAdd').addEventListener('click', () => {
      const p = S.project;
      const last = p.cues[p.cues.length - 1];
      const start = last ? +last.end : 0;
      const c = { id: U.uid(), text: '새 자막', start, end: +(start + 2.4).toFixed(1), sfx: '', comment: { on: false, text: '', name: '시청자' } };
      p.cues.push(c);
      renderCues(); touch(); selectCue(c.id);
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
      renderCues(); touch(); drawStatic();
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
        drawStatic(); touch(); renderScrubCues();
      } else if (e.target.classList.contains('cmt-text')) {
        c.comment.text = e.target.value; touch(); drawStatic();
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
      if (e.target.classList.contains('cue-sfx')) { c.sfx = e.target.value; if (c.sfx) A.playSfx(c.sfx); touch(); }
      if (e.target.classList.contains('cue-cmt-on')) { c.comment.on = e.target.checked; touch(); drawStatic(); }
    });
    el('cueList').addEventListener('click', e => {
      const row = e.target.closest('.cue'); if (!row) return;
      const c = S.project.cues.find(x => x.id === row.dataset.id); if (!c) return;
      if (e.target.classList.contains('cue-del')) {
        S.project.cues = S.project.cues.filter(x => x.id !== c.id);
        renderCues(); touch(); drawStatic(); return;
      }
      if (e.target.classList.contains('cue-play')) { pause(); seekTo(c.start); drawStatic(); A.playSfx(c.sfx || 'pop'); return; }
      if (e.target.classList.contains('cue-no')) { pause(); seekTo(c.start); drawStatic(); return; }
      selectCue(c.id);
    });
    el('cueList').addEventListener('focusin', e => {
      const row = e.target.closest('.cue'); if (row) selectCue(row.dataset.id, true);
    });
  }

  function applyScript(res, lang, keepComments) {
    const p = S.project;
    p.hook.line1 = res.hook1 || p.hook.line1;
    p.hook.line2 = res.hook2 || p.hook.line2;
    p.lang = lang || 'ko';
    const old = p.cues;
    p.cues = res.cues.map((c, i) => ({
      id: U.uid(), text: c.text, start: c.start, end: c.end, sfx: i === 0 ? 'impact' : '',
      comment: keepComments && old[i] ? old[i].comment : { on: false, text: '', name: '시청자' }
    }));
    if (res.titles) p.meta.titles = res.titles.map(t => String(t || '').slice(0, 100));
    if (res.desc != null) p.meta.desc = res.desc;
    if (res.tags != null) p.meta.tags = res.tags;
    p.topic = el('aiTopic').value.trim() || p.topic;
    S.player.t = 0;
    syncProjectToUI(true);
    renderCues();
    touch();
  }

  /* ── cues ───────────────────────────────────────────── */
  function autoGrow(t) { t.style.height = 'auto'; t.style.height = Math.min(160, t.scrollHeight) + 'px'; }
  function updateCueDuration(row, c) {
    const d = row.querySelector('.cue-dur');
    if (d) d.textContent = (c.end - c.start).toFixed(1) + '초';
    updateMetaLine();
  }
  function selectCue(id, noScroll) {
    S.ui.selectedCue = id;
    $$('#cueList .cue').forEach(r => r.classList.toggle('is-active', r.dataset.id === id));
    if (!noScroll) {
      const row = $(`#cueList .cue[data-id="${id}"]`);
      if (row) row.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }

  function renderCues() {
    const p = S.project;
    const list = el('cueList');
    list.innerHTML = '';
    p.cues.forEach((c, i) => {
      const row = document.createElement('div');
      row.className = 'cue' + (S.ui.selectedCue === c.id ? ' is-active' : '');
      row.dataset.id = c.id;
      row.innerHTML = `
        <button class="cue-no" title="이 큐로 이동">${i + 1}</button>
        <div>
          <textarea class="cue-text" rows="1" spellcheck="false" placeholder="자막 문장">${U.esc(c.text)}</textarea>
          <div class="cue-times">
            <input class="cue-start" type="number" step="0.1" min="0" value="${(+c.start).toFixed(1)}" aria-label="시작">
            <span class="to">→</span>
            <input class="cue-end" type="number" step="0.1" min="0" value="${(+c.end).toFixed(1)}" aria-label="끝">
            <span class="hint cue-dur">${(c.end - c.start).toFixed(1)}초</span>
          </div>
          <div class="cue-tools">
            <select class="mini cue-sfx" aria-label="효과음">
              <option value="">효과음 없음</option>
              ${RS.sfxList.map(s => `<option value="${s.id}"${c.sfx === s.id ? ' selected' : ''}>${s.name}</option>`).join('')}
            </select>
            <label class="cmt-toggle"><input type="checkbox" class="cue-cmt-on"${c.comment.on ? ' checked' : ''}> 댓글</label>
            <input class="cmt-text" placeholder="댓글 내용" value="${U.esc(c.comment.text || '')}">
            <button class="cue-play" title="이 큐 미리듣기">▶</button>
            <button class="cue-del" title="큐 삭제">✕</button>
          </div>
        </div>`;
      list.appendChild(row);
      autoGrow(row.querySelector('.cue-text'));
    });
    renderScrubCues();
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
    el('voiceSelect').addEventListener('change', e => {
      S.project.voice.voiceURI = e.target.value; touch();
      const t = S.project.cues[0] && U.strip(S.project.cues[0].text);
      if (t) A.speak(t, { rate: S.project.voice.rate, uri: e.target.value });
    });
    el('voiceRate').addEventListener('input', e => {
      S.project.voice.rate = +e.target.value / 100;
      el('voiceRateVal').textContent = S.project.voice.rate.toFixed(2) + 'x';
      touch();
    });
    el('voiceVol').addEventListener('input', e => {
      S.project.voice.volume = +e.target.value / 100;
      el('voiceVolVal').textContent = e.target.value + '%';
      A.setVoiceVolume(S.project.voice.volume); touch();
    });
    el('voiceOn').addEventListener('change', e => { S.project.voice.on = e.target.checked; touch(); });
    el('voiceTest').addEventListener('click', () => {
      const c = S.project.cues[0];
      if (!c) { RS.toast('큐가 없습니다', 'err'); return; }
      A.resume();
      A.speak(U.strip(c.text), { rate: S.project.voice.rate, uri: S.project.voice.voiceURI });
    });
    el('voiceFile').addEventListener('change', async e => {
      const f = e.target.files && e.target.files[0];
      if (!f) return;
      try {
        await A.loadNarration(f);
        S.project.voice.file = f.name;
        S.project.voice.fileName = f.name;
        S.media.narrationName = f.name;
        el('voiceFileName').textContent = f.name;
        el('voiceFileClear').hidden = false;
        touch();
        RS.toast('나레이션 올림 · ' + f.name + ' (영상에 실제로 섞입니다)', 'ok');
      } catch (err) { RS.toast('오디오를 읽지 못했습니다: ' + err.message, 'err'); }
      e.target.value = '';
    });
    el('voiceFileClear').addEventListener('click', () => {
      A.stopNarration();
      A.narrationBuf = null;
      S.project.voice.file = null; S.project.voice.fileName = null; S.media.narrationName = null;
      el('voiceFileName').textContent = '없음 (타입캐스트 수민 mp3 등)';
      el('voiceFileClear').hidden = true;
      touch();
    });
    el('sfxGrid').addEventListener('click', e => {
      const b = e.target.closest('.sfx-btn'); if (!b) return;
      A.resume(); A.playSfx(b.dataset.id);
      b.classList.add('hit'); setTimeout(() => b.classList.remove('hit'), 220);
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

  function renderSfx() {
    const box = el('sfxGrid');
    if (!box) return;
    box.innerHTML = RS.sfxList.map(s => `<button class="sfx-btn" data-id="${s.id}"><span>▶</span>${U.esc(s.name)}</button>`).join('');
  }

  function fillVoices() {    const sel = el('voiceSelect');
    if (!sel) return;
    const list = A.voices();
    const cur = S.project ? S.project.voice.voiceURI : '';
    sel.innerHTML = '<option value="">기본 목소리 (기기 설정)</option>' +
      list.map(v => `<option value="${U.esc(v.voiceURI)}"${v.voiceURI === cur ? ' selected' : ''}>${U.esc(v.name)} · ${v.lang}</option>`).join('');
  }
  RS.fillVoices = fillVoices;

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
    lastSpoken = null;
    if (p.bgm.on && p.bgm.id) A.startBgm(p.bgm.id, S.player.t, p.bgm.volume);
    if (p.source.type === 'video' && S.media.video && S.media.video.src) {
      A.bindVideo(S.media.video);
      try { S.media.video.currentTime = Math.min(S.player.t, Math.max(0, S.media.video.duration - 0.1)); } catch (e) {}
      S.media.video.play().catch(() => {});
    }
    A.setVoiceVolume(p.voice.volume == null ? 1 : p.voice.volume);
    if (p.voice.file && A.narrationBuf) A.startNarration(S.player.t);
    updatePlayBtns();
  }

  function pause() {
    if (!S.player.playing) { updatePlayBtns(); return; }
    const t = nowT();
    S.player.playing = false;
    S.player.t = U.clamp(t, 0, U.totalDur(S.project));
    A.stopBgm(); A.stopNarration(); A.stopSpeak();
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
    lastSpoken = null; firedSfx.clear();
    updateTransport(t);
    drawStatic();
    if (was) play();
  }

  let lastSpoken = null;
  const firedSfx = new Set();
  function updateDuckAndTts() {
    const p = S.project;
    if (!S.player.playing) return;
    const t = nowT();
    const cue = U.cueAt(p, t);
    const speaking = !!(cue && p.voice.on && !p.voice.file);
    const narrating = !!(p.voice.file && A.narrationBuf && t < (A.narrationBuf.duration || 0));
    A.duck(speaking || narrating);
    if (cue) {
      if (cue.sfx && !firedSfx.has(cue.id)) { firedSfx.add(cue.id); A.playSfx(cue.sfx); }
      if (speaking && lastSpoken !== cue.id) {
        lastSpoken = cue.id;
        A.speak(U.strip(cue.text), { rate: p.voice.rate, uri: p.voice.voiceURI });
      }
    }
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
    el('thumbMake').addEventListener('click', makeThumb);
    el('thumbSave').addEventListener('click', () => {
      const c = el('thumbCanvas');
      c.toBlob(b => { if (b) U.download(fileBase() + '_thumb.png', b); }, 'image/png');
      RS.toast('썸네일 PNG 저장', 'ok');
    });
    el('thumbCopyTitle').addEventListener('click', async () => { RS.toast(await U.copy(S.project.meta.titles[S.project.meta.selected] || S.project.meta.titles[0] || '') ? '제목 복사' : '복사 실패', 'ok'); });
    el('thumbCopyDesc').addEventListener('click', async () => { RS.toast(await U.copy(S.project.meta.desc) ? '설명 복사' : '복사 실패', 'ok'); });
    el('thumbCopyTags').addEventListener('click', async () => { RS.toast(await U.copy(S.project.meta.tags) ? '태그 복사' : '복사 실패', 'ok'); });
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
    if (!mime) { RS.toast('녹화 코덱을 찾지 못했습니다', 'err'); return; }

    S.ui.exporting = true;
    el('xStart').disabled = true; el('xStart').innerHTML = '<span class="spin"></span> 렌더중';
    el('xProgWrap').hidden = false; el('xProgBar').style.width = '0%'; el('xProgTxt').textContent = '0%';
    pause(); seekTo(0);
    await new Promise(r => setTimeout(r, 120));
    if (document.fonts) {
      try {
        await Promise.all([
          document.fonts.load('900 62px "Noto Sans KR"'),
          document.fonts.load('700 30px "Noto Sans KR"'),
          document.fonts.load('900 54px "Black Han Sans"')
        ]);
        await document.fonts.ready;
      } catch (e) {}
    }

    let stream;
    try {
      stream = canvas.captureStream(fps);
      const aStream = A.recordStream();
      if (aStream) aStream.getAudioTracks().forEach(t => stream.addTrack(t));
    } catch (e) { S.ui.exporting = false; el('xStart').disabled = false; el('xStart').textContent = '영상 렌더'; RS.toast('캔버스 캡처 실패: ' + e.message, 'err'); return; }

    const chunks = [];
    let rec;
    try {
      rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: res >= 1080 ? 9000000 : 5000000, audioBitsPerSecond: 128000 });
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
    if (p.voice.file && A.narrationBuf) A.startNarration(0);
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
      const blob = new Blob(chunks, { type: mime.split(';')[0] });
      const ext = mime.includes('mp4') ? 'mp4' : 'webm';
      if (blob.size < 800) {
        el('xProgBar').style.width = '0%'; el('xProgTxt').textContent = '0%';
        el('xStart').disabled = false; el('xStart').textContent = '영상 렌더';
        S.ui.exporting = false;
        RS.toast('녹화기(“' + mime + '”)가 프레임을 만들지 못했습니다. 사파리는 mp4, 크롬은 webm으로 다시 시도해 주세요.', 'err');
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
        await Promise.all([
          document.fonts.load('900 96px "Noto Sans KR"'),
          document.fonts.load('700 40px "Noto Sans KR"'),
          document.fonts.load('900 40px "Black Han Sans"')
        ]);
        await document.fonts.ready;
      }
    } catch (e) {}
    R.thumbnail(c, S.project, S.player.t, el('thumbBadge').value.trim());
    el('thumbWrap').hidden = false;
    RS.toast('썸네일 생성 · 1080×1920', 'ok');
  }

  /* ── discover ───────────────────────────────────────── */
  function bindDiscover() {}
  function readFilters() {
    return {
      q: el('dKeyword').value.trim(), region: el('dRegion').value,
      dur: el('dDur').value, minViews: el('dMin').value, sort: el('dSort').value
    };
  }
  async function runDiscover() {
    const btn = el('dSearch');
    btn.disabled = true; btn.innerHTML = '<span class="spin"></span>';
    const st = el('discoverStatus');
    st.innerHTML = '<span class="spin"></span> 분석 중…';
    st.classList.remove('off');
    try {
      const list = await RS.tube.search(readFilters());
      renderDiscover(list);
      const demo = !RS.ai.hasYouTube();
      st.classList.toggle('off', demo);
      st.innerHTML = '<i class="dot"></i>' + (demo ? '샘플 떡상 데이터 · ' : 'YouTube 실시간 · ') + list.length + '건';
      if (!list.length) el('discoverResults').innerHTML = '<div class="note">조건에 맞는 영상이 없습니다. 최소 조회수를 낮추거나 다른 키워드로 해보세요.</div>';
    } catch (e) {
      st.classList.add('off');
      st.innerHTML = '<i class="dot"></i>실패: ' + U.esc(e.message);
      renderDiscover(RS.tube.demoSearch(readFilters()));
      RS.toast('API 실패 — 샘플로 대신합니다: ' + e.message, 'err');
    } finally { btn.disabled = false; btn.textContent = '분석'; }
  }

  function renderDiscover(list) {
    const box = el('discoverResults');
    if (!box) return;
    list = list || RS.demoDiscover;
    box.innerHTML = list.map((v, i) => {
      const views = U.fmtNum(v.views), subs = v.subs ? U.fmtNum(v.subs) : '—';
      const ratio = v.ratio >= 1 ? v.ratio.toFixed(1) + '×' : (v.views / Math.max(1, v.subs) || 0).toFixed(2);
      const hot = v.ratio >= 3;
      const hue = 196 + (i * 29) % 90;
      return `<button class="rcard" data-id="${U.esc(v.id || i)}" data-title="${U.esc(v.title)}">
        <div class="thumb">
          ${v.thumb ? `<img src="${U.esc(v.thumb)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : `<div class="ph" style="background:linear-gradient(150deg,hsl(${hue} 32% 16%),#0b0d12 70%)">▶</div>`}
          <span class="ratio">${hot ? '🔥 ' : ''}${ratio}</span>
          <span class="len">${U.fmtClock(v.len)}</span>
        </div>
        <div class="rc-body">
          <div class="rc-title">${U.esc(v.title)}</div>
          <div class="rc-meta"><span>${U.esc(v.channel)}</span><span><b>${views}</b>회</span><span>구독 ${subs}</span><span>${v.days === 0 ? '오늘' : v.days + '일 전'}</span></div>
          <div class="rc-cta">이 각도로 대본 만들기 →</div>
        </div>
      </button>`;
    }).join('');
    box.querySelectorAll('.rcard').forEach(card => card.addEventListener('click', () => {
      const title = card.dataset.title;
      el('aiTopic').value = title;
      S.project.topic = title;
      setTab('script');
      el('secAI').open = true;
      RS.toast('주제를 대본 탭으로 가져왔습니다 — [대본 생성]을 누르세요', 'ok');
      setTimeout(() => el('aiGen').scrollIntoView({ behavior: 'smooth', block: 'center' }), 120);
    }));
  }
  function bindDiscoverOnce() {
    el('dSearch').addEventListener('click', runDiscover);
    el('dRefresh').addEventListener('click', runDiscover);
    el('dKeyword').addEventListener('keydown', e => { if (e.key === 'Enter') runDiscover(); });
    $$('#dChips .chip').forEach(c => c.addEventListener('click', () => {
      el('dKeyword').value = c.dataset.kw;
      $$('#dChips .chip').forEach(x => x.classList.toggle('on', x === c));
      runDiscover();
    }));
  }

  /* ── upload ─────────────────────────────────────────── */
  function bindUpload() {
    el('uConnect').addEventListener('click', async () => {
      if (!RS.ai.hasOauth()) { openSettings(); RS.toast('OAuth Client ID를 먼저 넣어주세요', 'err'); return; }
      const b = el('uConnect');
      b.disabled = true; b.innerHTML = '<span class="spin"></span> 연결중';
      try {
        await RS.tube.connect();
        updateAuthUI();
        RS.toast('Google 연결 완료', 'ok');
      } catch (e) { RS.toast('연결 실패: ' + e.message, 'err'); }
      finally { b.disabled = false; b.textContent = 'Google 연결'; }
    });
    el('uTitle').addEventListener('input', () => { el('uTitleCount').textContent = el('uTitle').value.length + '/100'; });
    el('uFile').addEventListener('change', e => {
      const f = e.target.files && e.target.files[0];
      if (!f) return;
      S.media.exportBlob = f;
      S.media.exportName = f.name;
      el('uFileState').textContent = '선택 · ' + f.name + ' (' + (f.size / 1048576).toFixed(1) + 'MB)';
      el('uFileState').className = 'hint ok';
    });
    el('uStart').addEventListener('click', startUpload);
  }

  function updateAuthUI() {
    const has = RS.ai.hasOauth();
    const tag = el('uAuthTag');
    const state = el('uConnState');
    if (!has) {
      tag.textContent = '미연결'; tag.className = 'tag';
      state.textContent = 'OAuth Client ID가 없습니다'; state.className = 'conn-state warn';
      el('uConnHint').textContent = '설정 → API 키에서 OAuth Client ID를 넣으면 연결됩니다. 1분이면 됩니다.';
      return;
    }
    if (RS.tube.token) {
      tag.textContent = '연결됨'; tag.className = 'tag lime';
      state.textContent = '연결됨 · ' + RS.tube.tokenAgeMin() + '분 전'; state.className = 'conn-state ok';
      el('uConnHint').textContent = '토큰은 약 1시간 유효합니다. 만료되면 다시 연결하세요.';
    } else {
      tag.textContent = '대기'; tag.className = 'tag';
      state.textContent = 'Client ID 있음 · Google 연결만 남았습니다'; state.className = 'conn-state';
      el('uConnHint').textContent = 'Google 계정으로 한 번 승인하면 업로드할 수 있습니다.';
    }
  }

  function syncUploadFields() {
    const p = S.project;
    if (!el('uTitle')) return;
    if (document.activeElement !== el('uTitle')) el('uTitle').value = p.meta.titles[p.meta.selected] || p.meta.titles[0] || p.name || '';
    if (document.activeElement !== el('uDesc')) el('uDesc').value = p.meta.desc || '';
    if (document.activeElement !== el('uTags')) el('uTags').value = p.meta.tags || '';
    el('uTitleCount').textContent = (el('uTitle').value || '').length + '/100';
    el('uFileState').textContent = S.media.exportBlob ? ('렌더 파일 · ' + (S.media.exportName || 'video') + ' (' + (S.media.exportBlob.size / 1048576).toFixed(1) + 'MB)') : '렌더 파일 없음 — 미리보기 탭에서 먼저 렌더하세요';
    el('uFileState').className = 'hint' + (S.media.exportBlob ? ' ok' : '');
    updateAuthUI();
  }

  async function startUpload() {
    if (!S.media.exportBlob) { RS.toast('먼저 미리보기 탭에서 영상을 렌더하세요', 'err'); setTab('preview'); return; }
    if (!RS.tube.token) { RS.toast('Google 연결이 필요합니다', 'err'); return; }
    const btn = el('uStart');
    btn.disabled = true; btn.innerHTML = '<span class="spin"></span> 업로드중';
    el('uProgWrap').hidden = false; el('uProgBar').style.width = '0%'; el('uProgTxt').textContent = '0%';
    el('uOut').hidden = true;
    try {
      const file = S.media.exportBlob instanceof File ? S.media.exportBlob :
        new File([S.media.exportBlob], S.media.exportName || 'reel.mp4', { type: S.media.exportBlob.type || 'video/mp4' });
      const res = await RS.tube.upload({
        file, title: el('uTitle').value, desc: el('uDesc').value, tags: el('uTags').value,
        privacy: el('uPrivacy').value, madeForKids: el('uKids').value === 'true',
        onProgress: pct => { el('uProgBar').style.width = pct + '%'; el('uProgTxt').textContent = pct + '%'; }
      });
      el('uProgBar').style.width = '100%'; el('uProgTxt').textContent = '100%';
      el('uOut').hidden = false;
      el('uOut').innerHTML = `<div class="ok">업로드 완료 · ${U.esc(el('uPrivacy').value)}</div>
        <a href="https://youtube.com/watch?v=${U.esc(res.id)}" target="_blank" rel="noopener">https://youtube.com/watch?v=${U.esc(res.id)}</a>
        <div class="hint">유튜브 스튜디오에서 처리 후 쇼츠로 노출됩니다. 썸네일은 미리보기 탭에서 만든 PNG를 스튜디오에 올리세요.</div>`;
      RS.toast('유튜브 업로드 완료', 'ok');
    } catch (e) {
      el('uOut').hidden = false;
      el('uOut').innerHTML = `<div class="err">업로드 실패: ${U.esc(e.message)}</div><div class="hint">토큰 만료(1시간)면 다시 연결하고, API 사용 설정·테스트 사용자 등록을 확인하세요.</div>`;
      RS.toast('업로드 실패: ' + e.message, 'err');
    } finally {
      btn.disabled = false; btn.textContent = '업로드';
    }
  }

  /* ── settings ───────────────────────────────────────── */
  function openSettings() {
    el('stYtKey').value = S.settings.youtube || '';
    el('stGemKey').value = S.settings.gemini || '';
    el('stOauth').value = S.settings.oauth || '';
    el('stYtState').textContent = '';
    el('stGemState').textContent = '';
    renderPresetSelect();
    RS.openModal('settings');
  }
  function renderPresetSelect() {
    const sel = el('stPresetSelect');
    sel.innerHTML = S.presets.map(p => `<option value="${p.id}">${U.esc(p.name)}${p.builtin ? '' : ' (내 프리셋)'}</option>`).join('');
    sel.value = S.project.presetId || 'issuehanjan';
    const cur = S.presets.find(p => p.id === sel.value) || S.presets[0];
    el('stPresetDesc').textContent = cur ? cur.desc || '' : '';
  }
  function bindSettings() {
    el('stSaveKeys').addEventListener('click', () => {
      S.settings.youtube = el('stYtKey').value.trim();
      S.settings.gemini = el('stGemKey').value.trim();
      S.settings.oauth = el('stOauth').value.trim();
      RS.store.saveSettings(S.settings);
      updateMode(); updateAuthUI();
      RS.toast('키를 저장했습니다 (이 브라우저에만)', 'ok');
    });
    el('stClearKeys').addEventListener('click', async () => {
      if (!(await RS.confirm('키 지우기', '저장된 API 키 3개를 지웁니다. 계속할까요?'))) return;
      S.settings = {}; RS.store.saveSettings({});
      el('stYtKey').value = ''; el('stGemKey').value = ''; el('stOauth').value = '';
      updateMode(); updateAuthUI(); RS.toast('키를 지웠습니다');
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
    if (p.zoom) pr.zoom = p.zoom;
    if (p.offset != null) pr.offset = p.offset;
    if (p.voiceRate) pr.voice.rate = p.voiceRate;
    // fill missing hook lines from preset defaults
    pr.hook.size = p.hook.size;
    pr.sub.font = p.sub.font;
    resizeStage();
    syncProjectToUI(true);
    drawStatic();
    touch();
    el('stPresetDesc').textContent = p.desc || '';
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
    el('voiceOn').checked = p.voice.on !== false;
    el('origOn').checked = p.orig.on !== false;
    el('origVol').value = Math.round((p.orig.volume == null ? 1 : p.orig.volume) * 100);
    el('origVolVal').textContent = el('origVol').value + '%';
    el('voiceFileName').textContent = p.voice.fileName || '없음 (타입캐스트 수민 mp3 등)';
    el('voiceFileClear').hidden = !p.voice.fileName;
    el('thumbBadge').value = (p.tag && p.tag.on) ? p.tag.text.replace(/^@/, '') : (p.presetId === 'issuehanjan' ? '이슈한잔' : '');
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
    updateAuthUI();
    fillVoices();
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
    errors: () => window.__rsErrors.slice()
  };

  // bind discover after DOM ready (buttons exist already)
  if (document.readyState !== 'loading') { bindDiscoverOnce(); bindDiscover(); }
  else document.addEventListener('DOMContentLoaded', () => { bindDiscoverOnce(); bindDiscover(); });
})();
