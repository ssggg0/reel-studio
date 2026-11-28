/* REEL STUDIO — 🛡️ 수익화 위험 영상 자동 제외
   방송사·예능·드라마·뉴스 클립, 아이돌·K-POP·음방·직캠, 영화·OTT 저작권물,
   여러 장면을 짜깁기한 랭킹·모음집 쇼츠를 발굴 목록에서 자동으로 걸러냅니다.
   (단일 장면·단일 원본으로 직접 따라 만들 수 있는 소재만 남기는 것이 목적) */
(function () {
  'use strict';
  const RS = window.RS = window.RS || {};
  const KEY = 'reelstudio.safeFilter.v1';

  function esc(s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

  /* 영문·숫자 용어는 단어 경계로(‘M2’가 ‘M256’에 걸리지 않게),
     한글 용어는 붙여 쓴 말까지 잡도록 부분 일치로 만듭니다. */
  function toRe(term) {
    if (term instanceof RegExp) return term;
    const raw = String(term);
    if (/^[\x00-\x7F]+$/.test(raw)) {
      return new RegExp('(^|[^a-z0-9])' + esc(raw).replace(/\s+/g, '[\\s._\\-]*') + '([^a-z0-9]|$)', 'i');
    }
    return new RegExp(esc(raw).replace(/\s+/g, '\\s*'), 'i');
  }

  const KINDS = {
    tv: '방송·예능',
    idol: '아이돌·K-POP',
    movie: '영화·OTT',
    comp: '랭킹·모음집'
  };

  /* ── 차단 사전 ───────────────────────────────────────── */
  const RULES = [
    { kind: 'tv', terms: [
      /* 국내외 방송사·뉴스 */
      'KBS', 'MBC', 'SBS', 'JTBC', 'tvN', 'Mnet', 'EBS', '채널A', 'TV조선', 'MBN', 'YTN',
      '연합뉴스', '연합뉴스TV', '뉴시스', 'TBS', 'OBS', 'KTV', '국회방송', 'SBS News', 'MBC News',
      'KBS News', 'JTBC News', 'MBC뉴스', 'KBS뉴스', 'SBS뉴스', '속보',
      /* 방송 예능·교양·드라마 클립 채널 */
      '스브스', '엠뚜루마뚜루', '디글', 'Diggle', 'tvN D', '워크맨', '아는 형님', '런닝맨',
      '무한도전', '놀면 뭐하니', '유 퀴즈', '전지적 참견', '라디오스타', '나 혼자 산다',
      '1박 2일', '신서유기', 'SNL 코리아', '개그콘서트', '코미디언', '실제상황', '편스토랑',
      '불후의 명곡', '미스터트롯', '미스트롯', '전국노래자랑', '동상이몽', '백종원',
      /* 방송 클립 공통 말 */
      '예능', '드라마', '명장면', '하이라이트', '클립', '본방송', '다시보기', '미방분',
      '선공개', '풀영상', '예고편', '티저', '방송사고'
    ] },
    { kind: 'idol', terms: [
      /* 아이돌·K-POP 채널·음악방송 */
      '아이돌', 'K-POP', 'K POP', '케이팝', '음방',
      '직캠', 'fancam', 'STUDIO CHOOM', '스튜디오 춤', '1theK', 'MBCkpop', 'MBC Kpop',
      'KBS Kpop', 'SBS Kpop', '스브스케이팝', '인기가요', '뮤직뱅크', '음악중심', '쇼챔피언',
      '엠카운트다운', 'M Countdown', 'Music Bank', 'Inkigayo', 'M2', 'KCON', 'MAMA Awards',
      '골든디스크', '가요대전', '가요대축제', '가요대제전',
      /* 기획사·그룹 */
      'HYBE', '하이브', 'SMTOWN', 'SM Entertainment', 'SM엔터테인먼트', 'JYP', 'YG',
      'BLACKPINK', 'BTS', '방탄소년단', 'BIGBANG', 'TWICE', '트와이스', 'NewJeans', '뉴진스',
      'aespa', '에스파', 'IVE', '아이브', 'LE SSERAFIM', '르세라핌', 'SEVENTEEN', '세븐틴',
      'Stray Kids', '스트레이 키즈', 'NCT', 'EXO', '엑소', '소녀시대', 'Girls Generation',
      'ENHYPEN', '엔하이픈', 'NMIXX', 'ILLIT', 'BABYMONSTER', 'ZEROBASEONE', 'RIIZE',
      '아이유', '임영웅',
      /* 음악 영상 공통 말 */
      '컴백', '무대 영상', '레전드 무대', '안무', 'choreography', 'dance practice',
      '뮤직비디오', 'Official MV', 'M/V', 'MV 티저'
    ] },
    { kind: 'movie', terms: [
      'Netflix', '넷플릭스', 'Disney', '디즈니', 'Pixar', '픽사', 'Marvel', '마블',
      'Warner', '워너브라더스', 'Universal Pictures', '유니버설', 'Apple TV',
      '쿠팡플레이', '왓챠', '웨이브', '티빙', 'TVING', 'Wavve', 'Watcha',
      '스튜디오드래곤', 'CJ ENM', '영화리뷰', '영화 리뷰', '극장판', '만화영화',
      '애니메이션', 'animation', /애니(?!멀)/, '트레일러', 'trailer'
    ] },
    { kind: 'comp', terms: [
      /* 여러 장면 짜깁기 = 단일 원본으로 못 따라 만듦 */
      '랭킹', '순위', '모음', '모음집', '총정리', '결산', '베스트', 'compilation',
      'best of', 'best moments', '레전드 모음', '외 다수', '한방에 정리', '한 번에 정리',
      'TOP', /(^|[^가-힣a-z])탑(?![가-힣a-z])/i
    ] }
  ];
  const COMPILED = RULES.map(r => ({
    kind: r.kind,
    re: r.terms.map(toRe)
  }));

  /* ── 상태(기본 ON) ───────────────────────────────────── */
  let on = true;
  try {
    const v = localStorage.getItem(KEY);
    if (v === '0' || v === 'false') on = false;
  } catch (e) {}

  const F = RS.safeFilter = {
    label: '🛡️ 방송·아이돌·랭킹 자동 제외',
    shortLabel: '🛡️ 방송·아이돌·랭킹 제외',
    kinds: KINDS,
    enabled() { return on; },
    set(v) {
      on = !!v;
      try { localStorage.setItem(KEY, on ? '1' : '0'); } catch (e) {}
      return on;
    },
    toggle() { return F.set(!on); },

    /* 한 건 검사 → null(안전) 또는 {kind, kindLabel, hit, field} */
    check(item) {
      if (!item) return null;
      const title = String(item.title || '');
      const channel = String(item.channel || '');
      const cat = String(item.cat || '');
      const hay = title + ' \u0001 ' + channel + ' \u0001 ' + cat;
      for (const rule of COMPILED) {
        for (const re of rule.re) {
          if (!re.test(hay)) continue;
          const m = re.exec(hay);
          const hit = (m && m[0] ? m[0] : '').trim().replace(/^\u0001|\u0001$/g, '').trim();
          return {
            kind: rule.kind,
            kindLabel: KINDS[rule.kind],
            hit: hit || re.source,
            field: re.test(title) ? 'title' : 'channel'
          };
        }
      }
      return null;
    },

    /* 목록 → {list, removed:[{item, reason}]}. 꺼져 있으면 그대로 통과 */
    filter(list, force) {
      const arr = Array.isArray(list) ? list : [];
      const active = typeof force === 'boolean' ? force : on;
      if (!active) return { list: arr.slice(), removed: [], active: false };
      const safe = [], removed = [];
      for (const it of arr) {
        const r = F.check(it);
        if (r) removed.push({ item: it, reason: r });
        else safe.push(it);
      }
      return { list: safe, removed, active: true };
    },

    /* 제외 사유를 짧게: '방송·예능 2 · 아이돌·K-POP 1' */
    summary(removed) {
      const c = {};
      (removed || []).forEach(r => {
        const k = (r && r.reason && r.reason.kindLabel) || '기타';
        c[k] = (c[k] || 0) + 1;
      });
      return Object.keys(c).map(k => k + ' ' + c[k]).join(' · ');
    }
  };
})();
