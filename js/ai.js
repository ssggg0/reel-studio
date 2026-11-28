/* REEL STUDIO — AI: Gemini 대본 생성/번역 + 데모 생성기 */
(function () {
  'use strict';
  const RS = window.RS;

  const AI = RS.ai = {};
  const MODEL_CANDIDATES = ['gemini-3.8-flash', 'gemini-3.5-flash', 'gemini-flash-latest', 'gemini-2.5-flash', 'gemini-2.0-flash'];

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
        '첫 번째 원인, #현장의 허점.',
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
    const prompt = `너는 한국 유튜브 쇼츠 전문 작가다. 동물·반전·CCTV·꿀팁·해외일상·자연·유머 등 장르를 가리지 않고, 아래 주제에 맞는 톤으로 쇼츠 대본을 쓴다.

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

  /* ── 연결 테스트 ─────────────────────────────────────── */
  AI.testGemini = async function (key) {
    const url = 'https://generativelanguage.googleapis.com/v1beta/models?key=' + encodeURIComponent(key);
    const res = await fetch(url);
    if (!res.ok) throw new Error('키가 거부되었습니다 (' + res.status + ')');
    const d = await res.json();
    return (d.models || []).length;
  };
})();
