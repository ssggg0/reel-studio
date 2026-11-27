/* REEL STUDIO — AI: Gemini 대본 생성/번역 + 데모 생성기 */
(function () {
  'use strict';
  const RS = window.RS;

  const AI = RS.ai = {};
  const MODEL_CANDIDATES = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash'];

  AI.hasGemini = () => !!(RS.state.settings && RS.state.settings.gemini);
  AI.hasYouTube = () => !!(RS.state.settings && RS.state.settings.youtube);
  AI.hasOauth = () => !!(RS.state.settings && RS.state.settings.oauth);

  /* ── Gemini 호출 ─────────────────────────────────────── */
  async function callGemini(prompt, key) {
    let lastErr = null;
    for (const model of MODEL_CANDIDATES) {
      const url = 'https://generativelanguage.googleapis.com/v1beta/models/' + model + ':generateContent?key=' + encodeURIComponent(key);
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0.9, topP: 0.95, maxOutputTokens: 4096, responseMimeType: 'application/json' }
          })
        });
        if (res.status === 404) { lastErr = new Error('모델 없음: ' + model); continue; }
        if (!res.ok) {
          const t = await res.text();
          throw new Error('Gemini ' + res.status + ' · ' + t.slice(0, 220));
        }
        const data = await res.json();
        const parts = (((data.candidates || [])[0] || {}).content || {}).parts || [];
        const text = parts.map(p => p.text || '').join('\n').trim();
        if (!text) throw new Error('빈 응답');
        return text;
      } catch (e) {
        lastErr = e;
        if (String(e.message || '').includes('400') || String(e.message || '').includes('403')) break;
      }
    }
    throw lastErr || new Error('Gemini 호출 실패');
  }

  function parseJson(text) {
    let s = String(text).trim();
    s = s.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
    const a = s.indexOf('{'), b = s.lastIndexOf('}');
    if (a >= 0 && b > a) s = s.slice(a, b + 1);
    return JSON.parse(s);
  }

  const LANG_NAME = { ko: '한국어', en: 'English', ja: '日本語', es: 'Español', vi: 'Tiếng Việt' };

  /* ── 데모 생성기 ─────────────────────────────────────── */
  const TPL = {
    ko: {
      hook: ['{kw}, 30초 정리', '핵심만 뽑았습니다'],
      cues: [
        '{kw} — 지금부터 30초로 정리합니다',
        '지난주까지 분위기는 완전히 달랐습니다',
        '그런데 하루 만에 판이 뒤집혔습니다',
        '첫 번째 원인은 #현장의 허점 이었습니다',
        '여기에 시장의 쏠림까지 겹쳤습니다',
        '숫자로 보면 더 선명합니다. #3.4% 하락, #1조 2천억 순매도',
        '개인 투자자들은 그 물량을 고스란히 받아냈습니다',
        '전문가들도 방향을 쉽게 말하지 못합니다',
        '관전 포인트는 이번 주 #발표 하나입니다'
      ],
      titles: ['{kw}, 30초 정리 — 지금 무슨 일이', '하루 만에 뒤집힌 판, 핵심 원인은', '{kw} 결론은 아직? 이번 주 관전 포인트'],
      desc: '{kw} 관련 이슈를 30초로 정리했습니다.\n\n숫자와 사실만 남기고, 결론은 이번 주 발표로 미뤄봅니다.\n\n#이슈 #요약 #쇼츠',
      tags: '이슈,요약,뉴스,{kw},쇼츠'
    },
    en: {
      hook: ['{kw}, explained in 30 seconds', 'What actually happened here'],
      cues: [
        '{kw} just flipped — here is the 30 second version',
        'Last week, everyone was sure this was going one way',
        'Then, in a single day, the whole board turned over',
        'Cause number one was a hole in the system',
        'Then the crowd all ran the same direction',
        'The numbers are blunt: #3.4% down, #1.2T sold',
        'Retail investors bought every share that was dumped',
        'Even the experts will not call the next move yet',
        'The one thing to watch is this week’s announcement'
      ],
      titles: ['{kw} just flipped — what really happened', 'One day was all it took. Here is why', '{kw} explained in 30 seconds'],
      desc: '{kw} — the 30 second version, numbers only.\n\n#shorts #news #explained',
      tags: 'shorts,news,explained,{kw}'
    },
    ja: {
      hook: ['{kw}、30秒で整理します', 'いま知っておきたい核心'],
      cues: [
        '{kw}、30秒でまとめます',
        '先週までは空気がまったく違いました',
        'ところが一日で形勢が逆転しました',
        '原因の一つ目は現場の穴でした',
        'そこに市場の偏りも重なりました',
        '数字はもっと分かりやすい。#3.4%下落、#1兆2千億の売り',
        '個人投資家がその全量を受け取りました',
        '専門家も次の方向をまだ言えません',
        '注目は今週の #発表 ひとつです'
      ],
      titles: ['{kw}、30秒でわかる', '一日で反転した理由', '{kw} の次に来るもの'],
      desc: '{kw} を30秒で整理。数字だけで。\n\n#ショート #ニュース',
      tags: 'ショート,ニュース,解説,{kw}'
    },
    es: {
      hook: ['{kw}, explicado en 30 segundos', 'Lo que nadie te contó'],
      cues: [
        '{kw}, la versión de 30 segundos',
        'La semana pasada todo el mundo lo veía de otra forma',
        'Y en un solo día, el tablero se dio la vuelta',
        'La primera causa fue un hueco en el sistema',
        'A eso se sumó todo el mundo corriendo al mismo lado',
        'Los números no engañan: #3,4% abajo, #1,2 billones vendidos',
        'Los minoritarios compraron todo lo que se vendió',
        'Ni los expertos se atreven a decir qué sigue',
        'La clave está en el anuncio de esta semana'
      ],
      titles: ['{kw} en 30 segundos', 'Un día lo cambió todo', 'Lo que viene después de {kw}'],
      desc: '{kw} en 30 segundos, solo datos.\n\n#shorts #noticias',
      tags: 'shorts,noticias,explicado,{kw}'
    },
    vi: {
      hook: ['{kw} — 30 giây tóm gọn', 'Điều bạn cần biết ngay'],
      cues: [
        '{kw}, bản 30 giây',
        'Tuần trước, mọi thứ còn diễn ra theo hướng khác',
        'Vậy mà chỉ một ngày, thế cờ đã đổi',
        'Nguyên nhân đầu tiên là một lỗ hổng tại chỗ',
        'Rồi cả thị trường cùng chạy về một hướng',
        'Con số rất rõ: #giảm 3,4%, #bán 1,2 nghìn tỷ',
        'Nhà đầu tư cá nhân mua lại toàn bộ lượng bán ra',
        'Chuyên gia cũng chưa dám nói bước tiếp theo',
        'Điểm đáng xem là thông báo trong tuần này'
      ],
      titles: ['{kw} trong 30 giây', 'Một ngày đảo ngược tất cả', 'Sau {kw} sẽ là gì?'],
      desc: '{kw} trong 30 giây, chỉ con số.\n\n#shorts #tintuc',
      tags: 'shorts,tintuc,giaithich,{kw}'
    }
  };

  function kwOf(topic) {
    const t = String(topic || '').replace(/[#*\n"'“”‘’]/g, ' ').trim();
    const words = t.split(/[\s,·]+/).filter(w => w.length > 1 && !/^[0-9,.%]+$/.test(w));
    if (!words.length) return '이 이슈';
    const clean = words.slice(0, 4).map(w => w.replace(/(에서|에게|까지|부터|으로|라고|하고|이며|이랑|와|과|은|는|이|가|을|를|의|에|도|만|로)$/, ''));
    const pick = clean.filter(w => w.length > 1).slice(0, 2).join(' ');
    return (pick || words[0]).slice(0, 14);
  }

  function fill(s, kw) { return String(s).replace(/\{kw\}/g, kw); }

  function distribute(n, total, lang) {
    // 한글/일본어/중국어는 글자수, 그 외는 단어수 기반 길이 배분
    const weights = [];
    for (let i = 0; i < n; i++) {
      const base = i === 0 ? 1.15 : (i === n - 1 ? 1.1 : 1);
      weights.push(base * (0.85 + Math.random() * 0.35));
    }
    const sum = weights.reduce((a, b) => a + b, 0);
    let acc = 0;
    return weights.map(w => {
      const dur = (w / sum) * total;
      const start = acc; acc += dur;
      return { start: +start.toFixed(1), end: +acc.toFixed(1) };
    });
  }

  AI.demo = function (topic, lang, lengthSec) {
    const L = TPL[lang] || TPL.ko;
    const kw = kwOf(topic || '이 이슈');
    const cues = L.cues.map(t => fill(t, kw));
    if (+lengthSec <= 20) cues.splice(2, 2);
    if (+lengthSec >= 38) cues.splice(4, 0, fill('여기에 #숫자 하나가 더해집니다', kw));
    const times = distribute(cues.length, +lengthSec || 28);
    return {
      source: 'demo',
      hook1: fill(L.hook[0], kw), hook2: fill(L.hook[1], kw),
      cues: cues.map((t, i) => ({ text: t, start: times[i].start, end: times[i].end })),
      titles: L.titles.map(t => fill(t, kw).slice(0, 95)),
      desc: fill(L.desc, kw), tags: fill(L.tags, kw)
    };
  };

  /* ── 생성 ────────────────────────────────────────────── */
  AI.generate = async function (opts) {
    const { topic, tone, lang, lengthSec } = opts;
    const key = RS.state.settings.gemini;
    if (!key) return AI.demo(topic, lang, lengthSec);

    const toneTx = tone === 'friend' ? '친근한 반말 (친구에게 말하듯, 과한 유행어 금지)'
      : tone === 'calm' ? '차분한 정보 전달체' : '뉴스 구어체 (음슴체·개조식 금지, 자연스러운 입말)';
    const prompt = `너는 한국 유튜브 쇼츠 채널 '이슈한잔'의 수석 작가다. 아래 주제로 쇼츠 대본을 쓴다.

주제: ${topic || '최근 화제 이슈'}
언어: ${LANG_NAME[lang] || '한국어'}
문체: ${toneTx}
길이: 약 ${lengthSec}초
큐 개수: ${lengthSec <= 20 ? 7 : lengthSec >= 38 ? 11 : 9}

규칙:
- 첫 큐는 0.5초에 꽂히는 팩트/반전. 스포일러 없이 궁금증.
- 숫자·단위는 정확히 쓰고, 핵심 키워드/숫자 앞에 # 를 붙여 강조 표시한다 (예: #4,697, #3.4%).
- 한 큐는 12~24자(비한국어는 6~12단어). 자막으로 읽힐 길이.
- 결론을 "아직 모른다"로 끝내지 말고 기대감 80% + 팩트 20%로 맺는다.
- 중학생도 이해하는 일상어. 전문용어 금지. 확인되지 않은 루머 금지.
- hook1, hook2는 상단에 얹힐 2줄 후킹. 각 18자 이내(비한국어 8단어 이내).
- titles는 클릭률 높은 서로 다른 각도 3개. 100자 이내.
- desc는 3~4줄 + 해시태그. tags는 콤마 구분 8개.

반드시 아래 JSON만 출력:
{"hook1":"","hook2":"","cues":["",""],"titles":["","",""],"desc":"","tags":""}`;

    const text = await callGemini(prompt, key);
    const j = parseJson(text);
    const rawCues = Array.isArray(j.cues) ? j.cues.filter(x => String(x).trim()) : [];
    const total = +lengthSec || 28;
    const times = distribute(rawCues.length, total);
    return {
      source: 'gemini',
      hook1: j.hook1 || '', hook2: j.hook2 || '',
      cues: rawCues.map((t, i) => ({ text: String(t).trim(), start: times[i].start, end: times[i].end })),
      titles: (j.titles || []).slice(0, 3).concat(['', '', '']).slice(0, 3).map(s => String(s).slice(0, 100)),
      desc: j.desc || '', tags: j.tags || ''
    };
  };

  /* ── 번역 ────────────────────────────────────────────── */
  AI.translate = async function (project, lang) {
    const key = RS.state.settings.gemini;
    if (!key) {
      const d = AI.demo(project.topic || project.hook.line1, lang, RS.util.totalDur(project) || 28);
      return d;
    }
    const payload = {
      hook: [project.hook.line1, project.hook.line2],
      cues: project.cues.map(c => c.text),
      titles: project.meta.titles,
      desc: project.meta.desc,
      tags: project.meta.tags
    };
    const prompt = `다음 쇼츠 대본을 ${LANG_NAME[lang] || lang}로 번역한다. 자연스러운 방송 말투로, 직역하지 말고 그 언어권 시청자가 바로 이해하게. # 강조 표시와 숫자는 그대로 유지. 원문에 없는 내용 추가 금지.
JSON만 출력: {"hook1":"","hook2":"","cues":["원문 개수와 동일"],"titles":["","",""],"desc":"","tags":""}
원문: ${JSON.stringify(payload)}`;
    const text = await callGemini(prompt, key);
    const j = parseJson(text);
    return {
      source: 'gemini',
      hook1: j.hook1 || '', hook2: j.hook2 || '',
      cues: (j.cues || []).map((t, i) => ({ text: String(t), start: project.cues[i] ? project.cues[i].start : 0, end: project.cues[i] ? project.cues[i].end : 1 })),
      titles: j.titles || project.meta.titles, desc: j.desc || project.meta.desc, tags: j.tags || project.meta.tags
    };
  };

  /* ── 연결 테스트 ─────────────────────────────────────── */
  AI.testGemini = async function (key) {
    const url = 'https://generativelanguage.googleapis.com/v1beta/models?key=' + encodeURIComponent(key);
    const res = await fetch(url);
    if (!res.ok) throw new Error('키가 거부되었습니다 (' + res.status + ')');
    const d = await res.json();
    return (d.models || []).length;
  };
})();
