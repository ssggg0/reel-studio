/* REEL STUDIO — AI: Gemini 대본 생성/번역 + 데모 생성기 */
(function () {
  'use strict';
  const RS = window.RS;

  const AI = RS.ai = {};
  const MODEL_CANDIDATES = ['gemini-3.5-flash', 'gemini-3.7-flash', 'gemini-3.8-flash', 'gemini-flash-latest', 'gemini-2.5-flash', 'gemini-2.0-flash'];

  AI.hasGemini = () => !!(RS.state.settings && RS.state.settings.gemini);
  /* 저장된 키가 없어도 기본 키로 실시간이 돌기 때문에, 키가 하나라도 있으면 연결로 봅니다 */
  AI.hasYouTube = () => !!(RS.tube && RS.tube.hasKey ? RS.tube.hasKey() : (RS.state.settings && RS.state.settings.youtube));


  /* ── Gemini 호출 ─────────────────────────────────────── */
  async function callGemini(prompt, key, opts) {
    const o = opts || {};
    let lastErr = null;
    for (const model of MODEL_CANDIDATES) {
      const url = 'https://generativelanguage.googleapis.com/v1beta/models/' + model + ':generateContent?key=' + encodeURIComponent(key);
      try {
        const parts = [];
        if (o.videoUrl) parts.push({ fileData: { fileUri: o.videoUrl } });
        parts.push({ text: prompt });
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ role: 'user', parts: parts }],
            generationConfig: {
              temperature: o.temperature == null ? 0.9 : o.temperature,
              topP: 0.95,
              maxOutputTokens: o.maxOutputTokens || 8192,
              responseMimeType: 'application/json'
            }
          })
        });
        if (res.status === 404) { lastErr = new Error('모델 없음: ' + model); continue; }
        if (!res.ok) {
          const t = await res.text();
          const err = new Error('Gemini ' + res.status + ' · ' + t.slice(0, 220));
          err.status = res.status;
          /* 과부하(503)는 다음 모델로 넘어갑니다 */
          if (res.status === 503) { lastErr = err; continue; }
          throw err;
        }
        const data = await res.json();
        const parts2 = (((data.candidates || [])[0] || {}).content || {}).parts || [];
        const text = parts2.map(p => p.text || '').join('\n').trim();
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
        '{kw}, 30초 정리',
        '지난주까진 달랐습니다',
        '하루 만에 판이 뒤집혔죠',
        '첫 원인은 #현장의 허점',
        '여기에 쏠림이 겹쳤습니다',
        '숫자로 보면 선명합니다',
        '#3.4% 하락, #1조 순매도',
        '개인들이 물량을 다 샀죠',
        '결론은 이번 주 #발표입니다'
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

  /* ── 주제별 데모 대본(동물·힐링 / AI·테크) ─────────────── */
  const FLAVOR = {
    animal: {
      hook: ['포기한 줄 알았는데', '3시간 뒤 벌어진 일'],
      cues: [
        '이 영상, 지금 난리가 났습니다',
        '새끼 한 마리가 물속에서 빠져나오지 못했습니다',
        '무리는 잠시 자리를 뜨는 것처럼 보였습니다',
        '다들 포기했다고 생각했습니다',
        '그런데 #3시간 뒤, 무리가 다시 돌아왔습니다',
        '가장 큰 어른이 먼저 물속으로 들어갔습니다',
        '새끼는 그제야 몸을 맡겼습니다',
        '이 장면은 #27초 만에 400만 회를 넘겼습니다',
        '사람들은 본능이라고 부르지만, 다음 장면은 아직 설명이 안 됩니다'
      ],
      titles: ['{kw} — 떠났던 무리가 돌아온 이유', '포기한 줄 알았던 새끼, 3시간 뒤', '이 장면 하나로 400만 회, 무슨 일이'],
      desc: '물에 빠진 새끼를 두고 떠난 줄 알았던 무리가 3시간 뒤 다시 돌아왔습니다.\n\n#동물 #힐링 #감동 #쇼츠',
      tags: '동물,힐링,감동,구조,쇼츠'
    },
    tech: {
      hook: ['{kw}, 30초 정리', '이번엔 진짜 달라졌습니다'],
      cues: [
        '{kw} — 지금부터 30초로 정리합니다',
        '검색창에 질문을 넣으면 답이 아니라 판단이 나옵니다',
        '기존 서비스가 하던 일을 한 번에 가져갑니다',
        '숫자로 보면 #3배 빠르고, 비용은 #10분의 1',
        '문제는 이걸 아직 아무도 통제하지 못한다는 겁니다',
        '전문가들은 #2년 안에 순서가 바뀐다고 봅니다',
        '지금 준비한 사람과 아닌 사람의 차이가 여기서 갈립니다',
        '오늘 확인해야 할 건 딱 하나입니다',
        '내 업무 중 어디까지 넘길 수 있는지'
      ],
      titles: ['{kw}, 30초로 정리', '이번엔 진짜 달라졌습니다 — {kw}', 'AI가 바꾼 것과 아직 못 바꾼 것'],
      desc: '{kw} 관련 변화를 30초로 정리했습니다.\n\n숫자와 사실만 남겼습니다.\n\n#AI #테크 #쇼츠',
      tags: 'AI,테크,인공지능,쇼츠,정리'
    }
  };
  function flavorOf(topic) {
    const t = String(topic || '');
    if (/(동물|고양이|강아지|코끼리|냥|멍|야생|구조|puppy|cat|dog|animal|paws)/i.test(t)) return 'animal';
    if (/(AI|테크|아이폰|갤럭시|gemini|기술|로봇|반도체|앱|소프트웨어|tech)/i.test(t)) return 'tech';
    return '';
  }

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
    const fl = (lang === 'ko' || !lang) ? flavorOf(topic) : '';
    const L = fl ? FLAVOR[fl] : (TPL[lang] || TPL.ko);
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
    const prompt = `너는 한국 유튜브 쇼츠 1인 작가다. 동물·반전·CCTV·꿀팁·해외일상·자연·유머 등 장르를 가리지 않고, 아래 주제에 맞는 톤으로 쇼츠 대본을 쓴다.

주제: ${topic || '최근 화제 이슈'}
언어: ${LANG_NAME[lang] || '한국어'}
문체: ${toneTx}
길이: 약 ${lengthSec}초
큐 개수: ${lengthSec <= 20 ? 7 : lengthSec >= 38 ? 11 : 9}

[가장 중요한 규칙]
- 첫 큐 = 첫 1.5초. 스크롤을 멈추게 하는 도파민 훅. 가장 센 숫자·반전·금기·의외성을 맨 앞에 꺼낸다. 12자 이내.
- 한 큐는 7~12자(비한국어는 4~8단어). 한 눈에 읽히는 호흡. 길면 두 큐로 나눈다.
- 음슴체 절대 금지: ~함 / ~임 / ~됨 / ~모름 / ~없음 / ~했다함 같은 개조식·음슴체 금지. "~어요 / ~습니다"의 자연스러운 구어체만.
- 번역투 금지: "그것은 ~이다", "~에 의해", "~를 통해", "~에 대해" 같은 직역투 대신 한국어 어순 그대로. 영어 원문을 옮긴 티가 나면 다시 쓴다.
- 구어체 리듬: 짧은 문장, 말하듯 끊기. 접속사 남발 금지.

[그 밖]
- 숫자·단위는 정확히 쓰고, 핵심 키워드/숫자 앞에 # 를 붙여 강조 표시한다 (예: #4,697, #3.4%).
- 결론을 "아직 모른다"로 끝내지 말고 기대감 80% + 팩트 20%로 맺는다.
- 중학생도 이해하는 일상어. 전문용어 금지. 확인되지 않은 루머 금지.
- hook1, hook2는 상단에 얹힐 2줄 후킹. 각 16자 이내(비한국어 7단어 이내), 음슴체 금지.
- titles는 클릭률 높은 서로 다른 각도 3개. 100자 이내, 음슴체 금지.
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

  /* ── 제목 5안 (5단계 딸깍 선택) ─────────────────────────── */
  AI.TITLE_KINDS = ['호기심형', '숫자·충격형', '반전형', '썰형', '질문형'];
  AI.titles5 = async function (project) {
    const key = RS.state.settings && RS.state.settings.gemini;
    if (!key) throw new Error('Gemini 키 없음');
    const p = project || {};
    const cues = (p.cues || []).map(c => String(c.text || '').replace(/[#*]/g, '')).filter(Boolean).slice(0, 12);
    const payload = {
      현재제목: ((p.meta && p.meta.titles) || []).map(s => String(s || '').replace(/[#*]/g, '')).filter(Boolean).slice(0, 3),
      훅: [p.hook && p.hook.line1, p.hook && p.hook.line2].filter(Boolean),
      대본: cues,
      주제: p.topic || p.name || ''
    };
    const prompt = `너는 한국 유튜브 쇼츠 제목 전문가다. 아래 영상의 제목 후보 5개를 서로 다른 각도로 뽑는다.

${JSON.stringify(payload)}

규칙:
- 5개는 반드시 이 순서의 유형: 호기심형, 숫자·충격형, 반전형, 썰형, 질문형
- 각 14~38자, 100자 이내. 모바일에서 한 줄에 읽히는 길이.
- 첫 10자 안에 핵심 단어·숫자를 넣는다. 낚시성 거짓 단정 금지(내용에 없는 사실 창작 금지).
- 음슴체(~함/~임/~모름) 절대 금지. 자연스러운 한국어 어순, 번역투 금지.
- 이모지·특수문자 남발 금지. 숫자가 있으면 숫자형에 그대로 쓴다.

반드시 아래 JSON만 출력:
{"titles":[{"kind":"호기심형","text":""},{"kind":"숫자·충격형","text":""},{"kind":"반전형","text":""},{"kind":"썰형","text":""},{"kind":"질문형","text":""}]}`;
    const text = await callGemini(prompt, key);
    const j = parseJson(text);
    const arr = Array.isArray(j.titles) ? j.titles : [];
    return arr.map((t, i) => ({
      kind: String(t.kind || AI.TITLE_KINDS[i] || '추천'),
      text: String(t.text || t.title || '').trim()
    })).filter(t => t.text);
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


  /* ── 인기 쇼츠용 바이럴 데모 대본 ───────────────────── */
  const VIRAL = {
    heart: {
      hook1: '이 장면, 끝까지 보세요', hook2: '마지막에 이유가 나옵니다',
      cues: [
        '이 영상, 처음엔 그냥 평범해 보입니다',
        '그런데 몇 초 지나자 분위기가 달라집니다',
        '보는 사람마다 같은 곳에서 멈춥니다',
        '이 장면 하나로 저장이 몰렸습니다',
        '사연을 알고 나면 다시 보게 됩니다',
        '결국 사람이 궁금한 건 이런 순간입니다',
        '짧은데 오래 남는 이유가 여기 있습니다'
      ],
      desc: '짧은 장면 하나로 마음이 움직이는 영상.\n끝까지 보면 이유가 보입니다.\n\n#동물 #힐링 #쇼츠 #반전',
      tags: '동물,힐링,감동,쇼츠,반전'
    },
    funny: {
      hook1: '3초 만에 판이 뒤집힙니다', hook2: '예상 못 한 쪽에서 터집니다',
      cues: [
        '처음엔 진지하게 시작합니다',
        '그런데 3초 만에 판이 뒤집힙니다',
        '이건 예상 못 했습니다',
        '다들 같은 곳에서 빵 터집니다',
        '두 번 보면 더 웃긴 이유가 있습니다',
        '결국 웃음은 타이밍입니다',
        '그래서 이 영상이 계속 돌아갑니다'
      ],
      desc: '타이밍 하나로 터지는 영상.\n두 번 보면 더 웃깁니다.\n\n#유머 #웃긴영상 #쇼츠 #반전',
      tags: '유머,웃긴영상,쇼츠,반전,일상'
    },
    danger: {
      hook1: '3초 만에 벌어진 일입니다', hook2: '화면 보면 바로 이해됩니다',
      cues: [
        '3초 만에 벌어진 일입니다',
        '화면을 보면 상황이 바로 이해됩니다',
        '이런 경우 대부분 반응이 늦습니다',
        '한 번의 방심이 이렇게 됩니다',
        '댓글에는 같은 말이 반복됩니다',
        '다들 조심하라고 말합니다',
        '영상은 짧지만 경고는 오래 남습니다'
      ],
      desc: '짧은 순간에 벌어진 일을 그대로 담았습니다.\n한 번의 방심이 만드는 차이.\n\n#CCTV #블랙박스 #사고 #쇼츠',
      tags: 'CCTV,블랙박스,사고,쇼츠,교통'
    },
    info: {
      hook1: '이거 모르면 그냥 지나칩니다', hook2: '알고 나면 매일 씁니다',
      cues: [
        '이거 모르면 그냥 지나칩니다',
        '알고 나면 매일 쓰게 됩니다',
        '방법은 생각보다 간단합니다',
        '준비물은 딱 하나면 됩니다',
        '처음엔 반신반의했습니다',
        '해보면 차이가 바로 납니다',
        '저장해두면 두고두고 씁니다'
      ],
      desc: '알고 나면 매일 쓰게 되는 방법 하나.\n준비물도 거의 없습니다.\n\n#꿀팁 #생활정보 #쇼츠 #요리',
      tags: '꿀팁,생활정보,요리,쇼츠,정리'
    },
    daily: {
      hook1: '평범한 골목인데 뭔가 다릅니다', hook2: '보는 사람마다 저장합니다',
      cues: [
        '여기는 평범한 골목입니다',
        '그런데 디테일이 조금 다릅니다',
        '이런 장면이 일상처럼 지나갑니다',
        '보는 사람들이 하나같이 말합니다',
        '우리 동네에도 있었으면',
        '영상으로만 봐도 분위기가 느껴집니다',
        '다음에 가보고 싶어지는 곳입니다'
      ],
      desc: '평범한 일상 속에서 눈에 띄는 디테일.\n영상으로만 봐도 분위기가 전해집니다.\n\n#해외일상 #일본 #여행 #쇼츠',
      tags: '해외일상,일본,여행,일상,쇼츠'
    },
    wonder: {
      hook1: '합성 같지만 실제로 찍혔습니다', hook2: '자연에서 진짜 일어납니다',
      cues: [
        '이건 실제로 찍힌 화면입니다',
        '처음 보면 합성 같습니다',
        '그런데 자연에서 실제로 일어납니다',
        '카메라가 담은 건 순간의 우연입니다',
        '설명을 듣고 나면 더 신기합니다',
        '사람들이 계속 돌려보는 이유입니다',
        '세상은 아직 설명 안 된 것투성입니다'
      ],
      desc: '실제로 찍힌 신기한 순간.\n설명을 들으면 더 놀랍습니다.\n\n#신기한현상 #자연 #쇼츠 #풍경',
      tags: '신기한현상,자연,풍경,쇼츠,여행'
    }
  };
  const VIRAL_BY_CAT = {
    '동물': 'heart', 'ASMR': 'heart', '여행': 'heart', '자연': 'wonder',
    '해외일상': 'daily', '운동': 'info', '요리': 'info', '꿀팁': 'info',
    '유머': 'funny', '반전': 'funny', '공감': 'funny',
    'CCTV': 'danger', '블랙박스': 'danger', '신기한 현상': 'wonder'
  };
  AI.viral = function (title, cat) {
    const key = VIRAL_BY_CAT[cat] || 'funny';
    const t = VIRAL[key];
    const kw = String(title || '인기 쇼츠').replace(/#\S+/g, '').trim().slice(0, 26) || '인기 쇼츠';
    let acc = 0;
    const cues = t.cues.map((text, i) => {
      const dur = i === 0 ? 3.2 : 3.1;
      const c = { text, start: +acc.toFixed(1), end: +(acc + dur).toFixed(1) };
      acc += dur;
      return c;
    });
    return {
      source: 'demo', hook1: t.hook1, hook2: t.hook2, cues,
      titles: [kw + ' — 이 장면 하나로 저장이 몰렸습니다', '끝까지 보게 되는 ' + kw, kw + ', 이유는 마지막에 있습니다'],
      desc: kw + ' 영상을 그대로 따라 만들 수 있게 정리했습니다.\n' + t.desc,
      tags: t.tags
    };
  };

  /* ── 🔄 다른 추천 대본 (누를 때마다 새 각도) ─────────────
     Gemini 키가 있으면 매번 다른 각도로 새로 쓰고, 없으면 준비된 각도 6종을 돌립니다. */
  const ANGLES = [
    {
      id: 'twist', name: '반전형',
      hook: ['그냥 지나치면 후회해요', '3초 뒤에 판이 뒤집혀요'],
      cues: [
        '이 영상, 처음엔 아무 일도 없어 보여요',
        '그런데 3초만 지나면 분위기가 달라져요',
        '다들 여기서 한 번 멈춥니다',
        '이유는 아주 사소한 데 있었어요',
        '한 번 더 보면 보이는 장면이 있어요',
        '댓글에도 같은 말이 올라왔어요',
        '결국 사람은 이런 순간에 약해요',
        '다음 장면은 직접 보는 게 좋아요'
      ],
      titles: ['{kw} — 3초 뒤에 판이 뒤집혔어요', '이 장면 하나로 댓글이 터졌습니다', '끝까지 보게 되는 {kw}'],
      desc: '{kw} 영상의 반전 장면만 모았습니다.\n한 번 더 보면 더 선명해집니다.\n\n#반전 #쇼츠 #밈',
      tags: '반전,쇼츠,밈,웃긴영상,해외밈'
    },
    {
      id: 'number', name: '숫자·팩트형',
      hook: ['하루 만에 #300만 회', '이유는 14초에 있어요'],
      cues: [
        '이 영상, 하루 만에 #300만 회를 넘겼어요',
        '처음 올라온 건 #10시간 전입니다',
        '댓글은 #4만 개가 달렸어요',
        '공통점은 하나였습니다',
        '다들 같은 장면에서 멈췄어요',
        '그 장면은 #14초에 나옵니다',
        '숫자가 말해주는 건 하나예요',
        '사람들은 결말보다 과정을 봅니다'
      ],
      titles: ['{kw} #300만 회, 이유는 14초', '하루 만에 터진 장면 하나', '{kw} — 숫자로 보면 더 놀랍습니다'],
      desc: '{kw} 영상을 숫자로만 정리했습니다.\n14초 장면 하나가 전부입니다.\n\n# 이슈 #쇼츠 #숫자',
      tags: '이슈,쇼츠,숫자,화제,요약'
    },
    {
      id: 'empathy', name: '공감형',
      hook: ['보자마자 생각나는 사람', '한 번쯤 겪어봤죠'],
      cues: [
        '이거 보면서 바로 생각난 사람 있어요',
        '다들 한 번쯤 겪어봤을 장면이에요',
        '처음엔 나만 그런 줄 알았어요',
        '그런데 댓글이 전부 같은 말이에요',
        '결국 답은 하나로 모입니다',
        '이 영상이 오래 도는 이유예요',
        '저장해두면 나중에 또 보게 됩니다',
        '다음엔 이 장면 하나만 기억하세요'
      ],
      titles: ['{kw} — 다들 같은 데서 웃었어요', '이거 보면 한 명은 떠오릅니다', '한 번쯤 겪어봤을 {kw}'],
      desc: '{kw} 영상을 보다가 생각난 사람에게 보내주세요.\n댓글도 전부 같은 말입니다.\n\n#공감 #쇼츠 #일상',
      tags: '공감,쇼츠,일상,웃긴영상,밈'
    },
    {
      id: 'question', name: '질문형',
      hook: ['왜 이 장면이 터졌을까요', '답은 생각보다 단순해요'],
      cues: [
        '이 장면, 왜 이렇게 터졌을까요',
        '답은 생각보다 단순합니다',
        '사람들은 이 한 컷에 반응했어요',
        '설명을 들으면 더 신기해요',
        '전문가도 이유를 하나로 못 말합니다',
        '그래서 더 돌려보게 됩니다',
        '지금도 조회수가 오르고 있어요',
        '여러분은 어떻게 보셨어요?'
      ],
      titles: ['{kw}, 왜 이렇게 터졌을까요', '사람들이 멈춘 이유는 하나였습니다', '{kw} — 답은 생각보다 단순합니다'],
      desc: '{kw} 영상이 터진 이유를 짚어봤습니다.\n보고 나면 답이 보입니다.\n\n#화제 #쇼츠 #분석',
      tags: '화제,쇼츠,분석,이슈,밈'
    },
    {
      id: 'ending', name: '결말 예고형',
      hook: ['끝까지 보면 이유가 나와요', '마지막 2초가 전부예요'],
      cues: [
        '끝까지 보면 이유가 나옵니다',
        '마지막 2초가 전부예요',
        '중간에 한 번 숨 고르게 됩니다',
        '다들 여기서 빵 터졌어요',
        '이건 연출이 아니라 실제 상황입니다',
        '그래서 더 웃깁니다',
        '다음에 같은 일이 생기면',
        '이 장면을 떠올리게 됩니다'
      ],
      titles: ['{kw} — 마지막 2초가 전부입니다', '끝까지 봐야 하는 이유', '이 장면, 끝까지 보세요'],
      desc: '{kw} 영상의 마지막 2초를 놓치지 마세요.\n연출이 아니라 실제 상황입니다.\n\n#반전 #쇼츠 #밈',
      tags: '반전,쇼츠,밈,웃긴영상,결말'
    },
    {
      id: 'comment', name: '댓글·인용형',
      hook: ['댓글이 전부 같은 말이에요', '다들 여기서 멈췄어요'],
      cues: [
        '댓글창을 열어봤습니다',
        '거의 모든 댓글이 같은 말이에요',
        '다들 여기서 멈췄습니다',
        '한 사람이 쓴 댓글이 대표였어요',
        '이 영상은 설명이 필요 없습니다',
        '보면 바로 이해됩니다',
        '그래서 더 많이 돌려보게 됩니다',
        '여러분 생각도 댓글에 남겨주세요'
      ],
      titles: ['{kw} — 댓글이 전부 같은 말', '다들 여기서 멈췄습니다', '이 장면 하나면 충분합니다'],
      desc: '{kw} 영상의 댓글 반응을 모았습니다.\n보면 바로 이해됩니다.\n\n#리액션 #쇼츠 #밈',
      tags: '리액션,쇼츠,밈,웃긴영상,댓글'
    }
  ];
  function kwOfTopic(t) {
    const words = String(t || '').replace(/[#*"'“”‘’\n]/g, ' ').split(/[\s,·]+/).filter(w => w.length > 1);
    return (words.slice(0, 2).join(' ') || '이 영상').slice(0, 16);
  }
  AI.demoVariant = function (project, opts) {
    const o = opts || {};
    const p = project || {};
    const attempt = Math.max(1, o.attempt || 1);
    const A = ANGLES[(attempt - 1) % ANGLES.length];
    const kw = kwOfTopic(o.topic || p.topic || p.name);
    const len = +o.lengthSec || Math.max(20, Math.round(RS.util.totalDur(p) || 28));
    const lines = A.cues.slice();
    if (len <= 20) lines.splice(2, 2);
    if (len >= 38) lines.splice(4, 0, '여기에 #숫자 하나가 더해집니다');
    const times = distribute(lines.length, len);
    return {
      source: 'demo', angle: A.name,
      hook1: A.hook[0], hook2: A.hook[1],
      cues: lines.map((t, i) => ({ text: t, start: times[i].start, end: times[i].end })),
      titles: A.titles.map(t => t.replace(/\{kw\}/g, kw).slice(0, 95)),
      desc: A.desc.replace(/\{kw\}/g, kw),
      tags: A.tags.replace(/\{kw\}/g, kw)
    };
  };

  AI.regen = async function (project, opts) {
    const o = opts || {};
    const key = RS.state.settings && RS.state.settings.gemini;
    if (!key) return AI.demoVariant(project, o);
    const p = project || {};
    const prev = (p.cues || []).map(c => String(c.text || '').replace(/[#*]/g, '')).filter(Boolean).slice(0, 12);
    const angle = (ANGLES[((o.attempt || 1) - 1) % ANGLES.length] || ANGLES[0]).name;
    const toneTx = o.tone === 'friend' ? '친근한 반말 (과한 유행어 금지)'
      : o.tone === 'calm' ? '차분한 정보 전달체' : '뉴스 구어체 (음슴체·개조식 금지)';
    const prompt = `너는 한국 유튜브 쇼츠 1인 작가다. 이미 한 번 쓴 대본이 있고, 같은 영상으로 "완전히 다른 각도"의 대본을 다시 써야 한다.
이번 각도: ${angle} (${(o.attempt || 1)}번째 시도)

주제: ${o.topic || p.topic || p.name || '최근 화제 영상'}
언어: ${LANG_NAME[o.lang] || '한국어'}
문체: ${toneTx}
길이: 약 ${o.lengthSec || 28}초 · 큐 9개

[이전 대본 — 이 문장들과 겹치면 안 된다]
${JSON.stringify(prev)}

[규칙]
- 첫 큐 = 첫 1.5초. 스크롤을 멈추게 하는 훅. 12자 이내.
- 한 큐는 7~12자(비한국어 4~8단어). 길면 두 큐로 나눈다.
- 음슴체 절대 금지: ~함 / ~임 / ~됨 / ~모름 / ~없음 금지. "~어요 / ~습니다" 구어체만.
- 번역투 금지: "~에 의해", "~를 통해", "그것은 ~이다" 대신 한국어 어순 그대로.
- 이전 대본과 같은 첫 문장·같은 전개 금지. 훅의 종류(질문/숫자/반전/공감)도 바꾼다.
- 숫자·핵심 단어 앞에 # 를 붙인다. 확인되지 않은 사실 창작 금지.
- hook1·hook2는 상단 2줄 훅, 각 16자 이내.

반드시 아래 JSON만 출력:
{"hook1":"","hook2":"","cues":["",""],"titles":["","",""],"desc":"","tags":""}`;
    const text = await callGemini(prompt, key);
    const j = parseJson(text);
    const raw = Array.isArray(j.cues) ? j.cues.filter(x => String(x).trim()) : [];
    if (!raw.length) throw new Error('빈 대본');
    const times = distribute(raw.length, +o.lengthSec || 28);
    return {
      source: 'gemini', angle,
      hook1: j.hook1 || '', hook2: j.hook2 || '',
      cues: raw.map((t, i) => ({ text: String(t).trim(), start: times[i].start, end: times[i].end })),
      titles: (j.titles || []).slice(0, 3).concat(['', '', '']).slice(0, 3).map(x => String(x).slice(0, 100)),
      desc: j.desc || '', tags: j.tags || ''
    };
  };

  /* ── 외국 밈 자동 번역 + 한국어 대본 ─────────────────── */
  AI.translateShort = async function (item) {
    const key = RS.state.settings && RS.state.settings.gemini;
    if (!key) throw new Error('Gemini 키가 없습니다');
    const it = item || {};
    const prompt = `너는 한국 유튜브 쇼츠 작가다. 아래 외국 쇼츠의 원제목·채널·카테고리를 보고, 한국 시청자가 바로 이해하는 한국어 제목과, 그 영상 흐름에 맞는 한국어 대본을 새로 쓴다.

원제목: ${it.title || ''}
채널: ${it.channel || '알 수 없음'}
카테고리: ${it.cat || ''}

[규칙]
- title_ko: 원제목의 뜻을 살린 자연스러운 한국어 제목. 40자 이내. 직역투 금지, 낚시 금지.
- 영상에 실제로 있을 법한 장면 흐름으로 9줄 대본을 쓴다(원제목에 없는 사실을 단정하지 않는다).
- 첫 큐 = 첫 1.5초 훅, 12자 이내. 한 큐는 7~12자.
- 음슴체 절대 금지(~함/~임/~됨/~모름/~없음). "~어요 / ~습니다" 구어체만.
- 번역투 금지. 영어 어순을 그대로 옮기지 말고 한국어 어순으로 다시 쓴다.
- 숫자·핵심 단어 앞에 # 를 붙인다.
- hook1·hook2는 상단 2줄 훅, 각 16자 이내. titles 3안, 100자 이내.

반드시 아래 JSON만 출력:
{"title_ko":"","hook1":"","hook2":"","cues":["",""],"titles":["","",""],"desc":"","tags":""}`;
    const text = await callGemini(prompt, key);
    const j = parseJson(text);
    const raw = Array.isArray(j.cues) ? j.cues.filter(x => String(x).trim()) : [];
    if (!raw.length) throw new Error('빈 대본');
    const times = distribute(raw.length, 28);
    return {
      source: 'gemini',
      title_ko: String(j.title_ko || '').trim(),
      hook1: j.hook1 || '', hook2: j.hook2 || '',
      cues: raw.map((t, i) => ({ text: String(t).trim(), start: times[i].start, end: times[i].end })),
      titles: (j.titles || []).slice(0, 3).concat(['', '', '']).slice(0, 3).map(x => String(x).slice(0, 100)),
      desc: j.desc || '', tags: j.tags || ''
    };
  };

  /* ── 영상 속 실제 대사·리액션을 시간 그대로 한국어 큐로 ──────────
     · 제3자 상황 해설·나레이션 금지 ("이 영상에서는 ~하고 있습니다")
     · 영상이 실제로 들리는 말만, 시작·끝 초를 붙여서
     · 한국어는 말하듯 자연스럽게 (번역투 금지) */
  const DIALOGUE_PROMPT = (meta, retry) => `너는 영상 속에서 실제로 들리는 말만 받아 적는 한국어 쇼츠 자막 작가다.

아래 유튜브 쇼츠 영상을 처음부터 끝까지 직접 보고 들으면서 작업해라.
영상 제목: ${meta.title || '(모름)'}
채널: ${meta.channel || '(모름)'}
영상 길이: ${meta.dur ? '약 ' + Math.round(meta.dur) + '초 — 마지막 줄이 영상 끝 근처에서 끝나게' : '(직접 확인)'}

[절대 규칙]
1. 영상 속 인물이 실제로 말한 대사, 외침, 웃음, 탄식, 리액션만 적는다.
2. 제3자 상황 해설·나레이션 절대 금지. "이 영상에서는", "~하고 있습니다", "~하는 장면입니다", "놀라운 장면이 펼쳐집니다" 같은 문장은 쓰지 않는다.
3. 각 줄에 영상 기준 시작 초(s)와 끝 초(e)를 숫자로 적는다. 말이 시작되는 순간과 끝나는 순간 그대로. 0.1초 단위.
4. 한 줄은 1~3초. 너무 짧게 끊기면 붙이고, 3초를 넘으면 나눈다. 들리지 않는 무음 구간은 건너뛴다.
5. say에는 들린 원문 그대로(원어), ko에는 한국 사람이 말하듯 자연스러운 구어체 번역. 직역투("그것은 ~이다", "~에 의해") 금지. 이름·숫자는 그대로.
6. 웃음·비명·한숨 같은 소리는 괄호로 표시한다: (웃음), (비명), (한숨).
6-1. 말소리가 전혀 없는 영상(음악·동물·풍경)이면 화면에서 실제로 보이는 것만 사실로 4~6줄 적는다. "이 영상에서는", "~하고 있습니다" 같은 해설체 대신 짧은 사실 문장(~해요/~습니다)으로. 추측·과장 금지. 이때 한 줄은 2~4초.
6-2. 말소리가 조금이라도 있으면 6-1은 쓰지 않고 말소리만 적는다.
7. 영상 앞부분 1.5초 안에 들리는 가장 센 말은 hook1에, 바로 이어지는 말은 hook2에 넣는다. 각 18자 이내.
8. title_ko는 영상 내용을 살린 자연스러운 한국어 제목(40자 이내). lang은 원어 코드(en/ja/zh/es/ko 등).
9. numbers·핵심 단어 앞에 # 를 붙인다 (예: #3개, #5초).
${retry ? '10. 지난번보다 더 꼼꼼하게 다시 듣고, 시간이 밀리지 않게 초를 새로 맞춰라.' : ''}

반드시 아래 JSON만 출력:
{"title_ko":"","lang":"en","hook1":"","hook2":"","lines":[{"s":0.0,"e":1.8,"say":"","ko":""}],"titles":["","",""],"desc":"","tags":""}`;

  /* 대사 줄을 1~3초 큐로 합칩니다 (겹치거나 비는 시간 없이) */
  function toCues(lines, duration) {
    const raw = (lines || []).map(l => {
      const s = Math.max(0, +l.s);
      const e = Math.max(s + 0.4, +l.e);
      return { s: +s.toFixed(1), e: +e.toFixed(1), say: String(l.say || '').trim(), ko: String(l.ko || '').trim() || String(l.say || '').trim() };
    }).filter(l => l.ko).sort((a, b) => a.s - b.s);
    const out = [];
    raw.forEach(l => {
      const last = out[out.length - 1];
      const gap = last ? l.s - last.e : 0;
      const mergeable = last && gap <= 0.45 && (l.e - last.s) <= 3.2
        && !/[.!?…]$/.test(last.ko);
      if (mergeable) {
        last.ko = (last.ko + ' ' + l.ko).replace(/\s+/g, ' ').trim();
        last.say = (last.say + ' ' + l.say).replace(/\s+/g, ' ').trim();
        last.e = Math.max(last.e, l.e);
      } else {
        out.push({ s: l.s, e: l.e, say: l.say, ko: l.ko });
      }
    });
    const dur = +duration || 0;
    const cues = out.slice(0, 18).map(c => ({
      text: c.ko,
      start: c.s,
      end: dur ? Math.min(c.e, Math.max(c.s + 0.4, dur)) : c.e,
      say: c.say
    }));
    /* 시작이 같거나 끝이 시작보다 짧은 큐 정리 */
    for (let i = 0; i < cues.length; i++) {
      if (cues[i].end - cues[i].start < 0.3) cues[i].end = +(cues[i].start + 0.6).toFixed(1);
      if (i && cues[i].start < cues[i - 1].start) cues[i].start = cues[i - 1].start;
    }
    return cues;
  }

  AI.dialogue = async function (item, opts) {
    const key = RS.state.settings && RS.state.settings.gemini;
    if (!key) throw new Error('Gemini 키 없음');
    const it = item || {};
    const vid = (it.id && /^[A-Za-z0-9_-]{6,}$/.test(String(it.id))) ? String(it.id)
      : (String(it.url || '').match(/(?:shorts\/|watch\?v=|youtu\.be\/)([A-Za-z0-9_-]{6,})/) || [])[1] || '';
    if (!vid) throw new Error('영상 ID를 찾지 못했습니다');
    const meta = { title: it.title || '', channel: it.channel || '', cat: it.cat || '', dur: +it.len || 0 };
    const retry = Math.max(0, +(opts && opts.retry) || 0);
    const text = await callGemini(DIALOGUE_PROMPT(meta, retry), key, {
      videoUrl: 'https://www.youtube.com/watch?v=' + vid,
      temperature: retry ? 0.55 : 0.2,
      maxOutputTokens: 8192
    });
    const j = parseJson(text);
    const lines = Array.isArray(j.lines) ? j.lines : [];
    const duration = +(j.duration || 0) || (+it.len || 0);
    const cues = toCues(lines, duration);
    if (!cues.length) throw new Error('영상에서 말소리를 찾지 못했습니다');
    return {
      source: 'gemini-video',
      lang: String(j.lang || it.lang || '').slice(0, 6),
      title_ko: String(j.title_ko || '').trim(),
      hook1: cleanLine2(j.hook1), hook2: cleanLine2(j.hook2),
      cues: cues.map(c => ({ text: cleanLine2(c.text), start: c.start, end: c.end })),
      titles: (j.titles || []).slice(0, 3).concat(['', '', '']).slice(0, 3).map(s => cleanLine2(s).slice(0, 100)),
      desc: j.desc || '', tags: j.tags || ''
    };
  };

  function cleanLine2(t) {
    return String(t == null ? '' : t).replace(/^[\s"'“”‘’「」]+|[\s"'“”‘’「」]+$/g, '').trim();
  }

  /* ── 외국 쇼츠 제목 한 번에 한국어로 ─────────────────── */
  AI.translateTitles = async function (items) {
    const key = RS.state.settings && RS.state.settings.gemini;
    if (!key) return {};
    const list = (items || []).filter(x => x && x.title).slice(0, 12);
    if (!list.length) return {};
    const prompt = `다음 유튜브 쇼츠 제목들을 한국 시청자가 바로 이해하는 자연스러운 한국어로 번역한다. 직역투·낚시 금지, 40자 이내, 이모지는 그대로 둔다.

${JSON.stringify(list)}

반드시 아래 JSON만 출력:
{"items":[{"id":"","ko":""}]}`;
    const text = await callGemini(prompt, key, { temperature: 0.3, maxOutputTokens: 4096 });
    const j = parseJson(text);
    const map = {};
    (j.items || []).forEach(x => { if (x && x.id && x.ko) map[String(x.id)] = cleanLine2(x.ko).slice(0, 90); });
    return map;
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
