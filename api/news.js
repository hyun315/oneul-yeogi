// /api/news.js  —  「오늘 여기」 수집 서버 (Vercel Serverless, Node 18+)
//
//  독자는 해외에 사는 한국인이다. 경영 브리핑이 아니라 생활 정보가 중심이다.
//  - 나라 단위로만 수집한다. 사용자가 고른 조합으로 호출하지 않는다.
//  - 엣지 캐시 4시간 재사용 → 사용자 수와 무관하게 RSS 호출량 고정.
//
//  GET /api/news?country=ID

const COUNTRIES = {
  ID: {
    name: '인도네시아', flag: '🇮🇩', tz: 'Asia/Jakarta',
    hl: 'id', gl: 'ID', ceid: 'ID:id',
    cities: [
      { id:'jakarta',  label:'자카르타', kw:['Jakarta'] },
      { id:'bekasi',   label:'브카시',   kw:['Bekasi'] },
      { id:'cikarang', label:'찌카랑',   kw:['Cikarang'] },
      { id:'tangerang',label:'땅그랑',   kw:['Tangerang', 'BSD'] },
      { id:'bandung',  label:'반둥',     kw:['Bandung'] },
      { id:'surabaya', label:'수라바야', kw:['Surabaya'] },
      { id:'bali',     label:'발리',     kw:['Bali', 'Denpasar'] },
      { id:'batam',    label:'바탐',     kw:['Batam'] },
    ],
    topics: [
      { id:'safety', kw:['kriminalitas','kejahatan','begal','keamanan warga'] },
      { id:'visa',   kw:['imigrasi','visa','KITAS','izin tinggal','orang asing'] },
      { id:'money',  kw:['kurs rupiah','inflasi','harga pangan','biaya hidup'] },
      { id:'move',   kw:['bandara','penerbangan','kemacetan','transportasi','jalan tol'] },
      { id:'nature', kw:['banjir','gempa','cuaca ekstrem','erupsi','kebakaran'] },
      { id:'health', kw:['rumah sakit','demam berdarah','wabah','kesehatan masyarakat'] },
      { id:'school', kw:['sekolah','pendidikan','tahun ajaran','kampus'] },
      { id:'korea',  kw:['Korea Selatan','Korsel','warga Korea'] },
      { id:'rule',   kw:['peraturan baru','pajak','upah minimum','perizinan usaha'] },
      { id:'work',   kw:['investasi','industri','manufaktur','ekspor','pabrik'] },
    ],
  },
  VN: {
    name: '베트남', flag: '🇻🇳', tz: 'Asia/Ho_Chi_Minh',
    hl: 'vi', gl: 'VN', ceid: 'VN:vi',
    cities: [
      { id:'hanoi',    label:'하노이',   kw:['Hà Nội'] },
      { id:'hcmc',     label:'호치민',   kw:['TP HCM','Hồ Chí Minh'] },
      { id:'bacninh',  label:'박닌',     kw:['Bắc Ninh'] },
      { id:'haiphong', label:'하이퐁',   kw:['Hải Phòng'] },
      { id:'danang',   label:'다낭',     kw:['Đà Nẵng'] },
      { id:'binhduong',label:'빈즈엉',   kw:['Bình Dương'] },
    ],
    topics: [
      { id:'safety', kw:['tội phạm','an ninh trật tự','cướp giật'] },
      { id:'visa',   kw:['thị thực','xuất nhập cảnh','người nước ngoài','tạm trú'] },
      { id:'money',  kw:['tỷ giá','lạm phát','giá cả','chi phí sinh hoạt'] },
      { id:'move',   kw:['sân bay','chuyến bay','ùn tắc','giao thông'] },
      { id:'nature', kw:['bão','ngập lụt','thời tiết','cháy'] },
      { id:'health', kw:['bệnh viện','sốt xuất huyết','dịch bệnh','y tế'] },
      { id:'school', kw:['trường học','giáo dục','năm học'] },
      { id:'korea',  kw:['Hàn Quốc','người Hàn'] },
      { id:'rule',   kw:['quy định mới','thuế','lương tối thiểu','giấy phép'] },
      { id:'work',   kw:['đầu tư','khu công nghiệp','xuất khẩu','nhà máy'] },
    ],
  },
  PH: {
    name: '필리핀', flag: '🇵🇭', tz: 'Asia/Manila',
    hl: 'en-PH', gl: 'PH', ceid: 'PH:en',
    cities: [
      { id:'manila', label:'마닐라',     kw:['Manila','Makati','BGC'] },
      { id:'cebu',   label:'세부',       kw:['Cebu'] },
      { id:'clark',  label:'클락',       kw:['Clark','Pampanga','Angeles City'] },
      { id:'davao',  label:'다바오',     kw:['Davao'] },
      { id:'baguio', label:'바기오',     kw:['Baguio'] },
    ],
    topics: [
      { id:'safety', kw:['crime','robbery','police operation','security'] },
      { id:'visa',   kw:['immigration','visa','foreign national','ACR'] },
      { id:'money',  kw:['peso exchange rate','inflation','food prices','cost of living'] },
      { id:'move',   kw:['airport','flight','traffic','NAIA'] },
      { id:'nature', kw:['typhoon','flooding','earthquake','volcano'] },
      { id:'health', kw:['hospital','dengue','outbreak','public health'] },
      { id:'school', kw:['school year','education','university'] },
      { id:'korea',  kw:['South Korea','Korean national'] },
      { id:'rule',   kw:['new regulation','tax','minimum wage','business permit'] },
      { id:'work',   kw:['investment','BPO','manufacturing','export'] },
    ],
  },
  KH: {
    name: '캄보디아', flag: '🇰🇭', tz: 'Asia/Phnom_Penh',
    hl: 'en', gl: 'KH', ceid: 'KH:en',
    cities: [
      { id:'pnh',  label:'프놈펜',     kw:['Phnom Penh'] },
      { id:'siem', label:'씨엠립',     kw:['Siem Reap'] },
      { id:'shv',  label:'시하누크빌', kw:['Sihanoukville','Preah Sihanouk'] },
    ],
    topics: [
      { id:'safety', kw:['crime','scam compound','police','security'] },
      { id:'visa',   kw:['immigration','visa','foreigner','work permit'] },
      { id:'money',  kw:['riel','inflation','prices','cost of living'] },
      { id:'move',   kw:['airport','flight','road','traffic'] },
      { id:'nature', kw:['flood','weather','fire'] },
      { id:'health', kw:['hospital','dengue','outbreak','health ministry'] },
      { id:'school', kw:['school','education'] },
      { id:'korea',  kw:['South Korea','Korean'] },
      { id:'rule',   kw:['new law','tax','minimum wage','licence'] },
      { id:'work',   kw:['investment','garment','export','factory'] },
    ],
  },
};

// 주제 이름은 나라와 무관하므로 한 곳에서만 관리한다
const TOPIC_LABELS = {
  safety: { label:'치안·사건',   group:'생활' },
  visa:   { label:'비자·체류',   group:'생활' },
  money:  { label:'환율·물가',   group:'생활' },
  move:   { label:'교통·항공',   group:'생활' },
  nature: { label:'날씨·재해',   group:'생활' },
  health: { label:'의료·보건',   group:'생활' },
  school: { label:'교육·학교',   group:'생활' },
  korea:  { label:'한국 관련',   group:'생활' },
  rule:   { label:'제도·세금',   group:'일' },
  work:   { label:'산업·투자',   group:'일' },
};

const WINDOW = 'when:3d';
const PER_FEED = 12;

function feedUrl(c, q){
  const tail = `hl=${c.hl}&gl=${c.gl}&ceid=${c.ceid}`;
  return q
    ? `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&${tail}`
    : `https://news.google.com/rss?${tail}`;
}

function unescape(s){
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g,'$1')
    .replace(/&lt;/g,'<').replace(/&gt;/g,'>')
    .replace(/&quot;/g,'"').replace(/&#39;/g,"'")
    .replace(/&nbsp;/g,' ')
    .replace(/&#(\d+);/g, (_,n) => String.fromCharCode(+n))
    .replace(/&amp;/g,'&');
}

function decode(s=''){
  // 구글 RSS는 엔티티를 이중 인코딩해 보낸다 (&amp;nbsp;).
  // 한 번만 풀면 &nbsp; 가 그대로 남으므로 두 번 돌린다.
  let out = unescape(unescape(s));
  return out.replace(/<[^>]+>/g,'').replace(/\s+/g,' ').trim();
}

function pick(block, tag){
  const m = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`,'i'));
  return m ? decode(m[1]) : '';
}

// 구글 RSS의 description은 대개 "제목 + 매체명"의 반복이다.
// 그대로 두면 번역 비용이 두 배로 들고 화면에도 같은 문장이 두 줄 나온다.
function usefulSnippet(desc, title, source){
  if (!desc) return '';
  let s = desc;
  if (source) s = s.split(source)[0];                 // 꼬리의 매체명 제거
  s = s.replace(/\s+/g,' ').trim();
  const norm = x => x.toLowerCase().replace(/[^a-z0-9가-힣]/g,'');
  const a = norm(s), b = norm(title);
  if (!a) return '';
  if (a === b || b.startsWith(a) || a.startsWith(b)) return '';  // 제목 반복
  if (a.length < 40) return '';                       // 너무 짧으면 의미 없음
  return s.slice(0, 200);
}

function parseRss(xml){
  const out = [];
  for (const block of (xml.match(/<item>[\s\S]*?<\/item>/g) || []).slice(0, PER_FEED)){
    const raw = pick(block,'title');
    if (!raw) continue;
    const cut = raw.lastIndexOf(' - ');           // "제목 - 매체"
    const title  = cut > 20 ? raw.slice(0, cut) : raw;
    const source = pick(block,'source') || (cut > 20 ? raw.slice(cut + 3) : '');
    out.push({
      title,
      source,
      link:      pick(block,'link'),
      published: pick(block,'pubDate'),
      snippet:   usefulSnippet(pick(block,'description'), title, source),
    });
  }
  return out;
}

async function grab(url){
  try {
    const r = await fetch(url, { headers:{ 'User-Agent':'Mozilla/5.0 (compatible; OneulYeogi/1.0)' } });
    return r.ok ? parseRss(await r.text()) : [];
  } catch { return []; }
}

function tagIt(a, c){
  const hay = `${a.title} ${a.snippet}`.toLowerCase();
  return {
    ...a,
    cities: c.cities.filter(x => x.kw.some(k => hay.includes(k.toLowerCase()))).map(x => x.id),
    topics: c.topics.filter(x => x.kw.some(k => hay.includes(k.toLowerCase()))).map(x => x.id),
  };
}

/* ──────────────────────────────────────────────
   한국어 번역
   독자가 열 때가 아니라 "수집할 때" 한 번만 돌린다.
   엣지 캐시에 번역 결과가 같이 실리므로, 독자가 몇 명이든
   나라당 하루 6회(4시간 캐시)만 호출된다.

   Vercel 환경변수
     ANTHROPIC_API_KEY = sk-ant-...
     ENABLE_TRANSLATE  = 1        (끄려면 지우거나 0)
     TRANSLATE_MODEL   = claude-haiku-4-5-20251001   (선택)
   ────────────────────────────────────────────── */
const TRANSLATE_MAX = 48;   // 상위 몇 건까지 번역할지
const BATCH = 16;           // 한 번에 보낼 건수

async function translateBatch(rows, model, key){
  const payload = rows.map((a, i) => ({ i, t: a.title, s: a.snippet || '' }));

  const body = {
    model,
    max_tokens: 4000,
    system:
      '너는 해외 거주 한국인을 위한 뉴스 앱의 번역기다. 현지 뉴스 제목과 요약을 한국어로 옮긴다.\n' +
      '규칙:\n' +
      '- 신문 제목투로 간결하게. 직역투나 기계번역투를 피한다.\n' +
      '- 지명·기관명은 한국 언론이 쓰는 표기를 따른다 (예: Jakarta→자카르타, Bekasi→브카시).\n' +
      '- 현지 고유 제도·용어는 한국어 뒤 괄호로 원어를 남긴다 (예: 체류허가(KITAS)).\n' +
      '- s가 빈 문자열이면 결과의 s도 빈 문자열로 둔다.\n' +
      '- 설명, 인사말, 마크다운 코드펜스 없이 JSON 배열만 출력한다.\n' +
      '출력 형식: [{"i":0,"t":"한국어 제목","s":"한국어 요약"}]',
    messages: [{ role:'user', content: JSON.stringify(payload) }],
  };

  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`anthropic ${r.status}`);

  const data = await r.json();
  const text = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
  const clean = text.replace(/```json|```/g, '').trim();
  const parsed = JSON.parse(clean);
  if (!Array.isArray(parsed)) throw new Error('not an array');
  return parsed;
}

async function attachKorean(articles){
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key || process.env.ENABLE_TRANSLATE !== '1') return articles;

  const model = process.env.TRANSLATE_MODEL || 'claude-haiku-4-5-20251001';
  const target = articles.slice(0, TRANSLATE_MAX);

  const chunks = [];
  for (let i = 0; i < target.length; i += BATCH) chunks.push(target.slice(i, i + BATCH));

  // 한 묶음이 실패해도 나머지는 살린다. 번역이 없으면 원문 그대로 나간다.
  const done = await Promise.all(chunks.map(async (chunk, ci) => {
    try {
      const out = await translateBatch(chunk, model, key);
      out.forEach(row => {
        const a = chunk[row.i];
        if (a && row.t) a.ko = { title: String(row.t), snippet: String(row.s || '') };
      });
      return true;
    } catch (e) {
      console.error(`translate chunk ${ci} failed:`, e.message);
      return false;
    }
  }));

  return articles.map(a => ({ ...a, translated: !!a.ko, _ok: done }))
    .map(({ _ok, ...a }) => a);
}

export default async function handler(req, res){
  const code = String(req.query.country || 'ID').toUpperCase();
  const c = COUNTRIES[code];
  if (!c){
    res.status(400).json({ error:`아직 지원하지 않는 나라입니다: ${code}` });
    return;
  }

  const jobs = [
    { seed:null, url:feedUrl(c, null) },
    ...c.cities.map(x => ({ seed:{ city:x.id }, url:feedUrl(c, `"${x.kw[0]}" ${WINDOW}`) })),
    ...c.topics.map(x => ({ seed:{ topic:x.id }, url:feedUrl(c, `(${x.kw.map(k=>`"${k}"`).join(' OR ')}) ${WINDOW}`) })),
  ];

  const lists = await Promise.all(jobs.map(j => grab(j.url)));

  const seen = new Map();
  lists.forEach((list, i) => {
    const seed = jobs[i].seed;
    for (const raw of list){
      const key = raw.title.slice(0, 70).toLowerCase();
      const a = tagIt(raw, c);
      if (seed?.city  && !a.cities.includes(seed.city))  a.cities.push(seed.city);
      if (seed?.topic && !a.topics.includes(seed.topic)) a.topics.push(seed.topic);

      const prev = seen.get(key);
      if (prev){
        prev.cities = [...new Set([...prev.cities, ...a.cities])];
        prev.topics = [...new Set([...prev.topics, ...a.topics])];
      } else seen.set(key, a);
    }
  });

  const collected = [...seen.values()]
    .sort((a,b) => new Date(b.published) - new Date(a.published));

  const articles = await attachKorean(collected);
  const translated = articles.filter(a => a.ko).length;

  res.setHeader('Cache-Control','s-maxage=14400, stale-while-revalidate=86400');
  res.status(200).json({
    translated,
    country: code,
    name: c.name,
    flag: c.flag,
    timezone: c.tz,
    cities: c.cities.map(({id,label}) => ({ id, label })),
    topics: c.topics.map(t => ({ id:t.id, ...TOPIC_LABELS[t.id] })),
    collectedAt: new Date().toISOString(),
    count: articles.length,
    articles,
  });
}
