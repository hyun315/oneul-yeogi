// /api/ads.js  —  광고 배너 저장·조회
//
//  저장소
//   1) Vercel Blob 이 연결돼 있으면 그쪽에 쓴다 (관리자 화면에서 추가/수정 가능)
//   2) 없으면 저장소의 ads.json 을 읽기 전용으로 쓴다 (읽기만, 수정 불가)
//
//  Vercel 환경변수
//    BLOB_READ_WRITE_TOKEN   Storage → Blob 생성 시 자동 등록됨
//    ADMIN_PASSWORD          관리자 화면 접속 비밀번호
//
//  GET    /api/ads?country=ID        노출 대상 광고만
//  GET    /api/ads?all=1             (관리자) 전체
//  POST   /api/ads                   (관리자) 전체 목록 저장

export const config = { maxDuration: 15 };

const BLOB_PATH = 'ads/config.json';
const BLOB_API  = 'https://blob.vercel-storage.com';

const token = () => process.env.BLOB_READ_WRITE_TOKEN;

/* ── Blob 읽기 ── */
async function blobUrl(){
  const r = await fetch(`${BLOB_API}?prefix=${encodeURIComponent(BLOB_PATH)}&limit=1`, {
    headers:{ authorization:`Bearer ${token()}` },
  });
  if (!r.ok) return null;
  const d = await r.json();
  return d.blobs?.[0]?.url || null;
}

async function readBlob(){
  const url = await blobUrl();
  if (!url) return null;
  const r = await fetch(`${url}?t=${Date.now()}`);   // 캐시 우회
  if (!r.ok) return null;
  return r.json();
}

async function writeBlob(data){
  const r = await fetch(`${BLOB_API}/${BLOB_PATH}`, {
    method:'PUT',
    headers:{
      authorization:`Bearer ${token()}`,
      'x-api-version':'7',
      'x-content-type':'application/json',
      'x-add-random-suffix':'0',
      'x-cache-control-max-age':'60',
    },
    body: JSON.stringify(data),
  });
  if (!r.ok) throw new Error(`blob ${r.status} ${await r.text()}`);
  return r.json();
}

/* ── 저장소에 포함된 기본 파일 (Blob 미설정 시) ── */
async function readFallback(req){
  try {
    const host  = req.headers['x-forwarded-host'] || req.headers.host;
    const proto = req.headers['x-forwarded-proto'] || 'https';
    const r = await fetch(`${proto}://${host}/ads.json`);
    if (!r.ok) return { ads:[] };
    return await r.json();
  } catch { return { ads:[] }; }
}

async function load(req){
  if (token()){
    const d = await readBlob();
    if (d) return { data:d, writable:true };
    return { data:{ ads:[] }, writable:true };     // 아직 한 번도 저장 안 한 상태
  }
  return { data: await readFallback(req), writable:false };
}

/* 지금 노출해야 할 광고인지 */
function live(ad, country){
  if (!ad.active) return false;
  if (ad.countries?.length && !ad.countries.includes(country)) return false;
  const today = new Date().toISOString().slice(0, 10);
  if (ad.from && today < ad.from) return false;
  if (ad.to   && today > ad.to)   return false;
  return true;
}

const authed = req => {
  const pw = process.env.ADMIN_PASSWORD;
  return !!pw && req.headers['x-admin-key'] === pw;
};

export default async function handler(req, res){
  try {
    if (req.method === 'GET'){
      const { data, writable } = await load(req);
      const all = Array.isArray(data.ads) ? data.ads : [];

      if (req.query.all === '1'){
        if (!authed(req)){ res.status(401).json({ error:'권한이 없습니다' }); return; }
        res.setHeader('Cache-Control','no-store');
        res.status(200).json({ ads:all, rotateMs: Number(data.rotateMs) || 3000, writable, configured:!!token() });
        return;
      }

      const country = String(req.query.country || '').toUpperCase();
      const shown = all.filter(a => live(a, country));
      res.setHeader('Cache-Control','s-maxage=60, stale-while-revalidate=300');
      res.status(200).json({ ads:shown, rotateMs: Number(data.rotateMs) || 3000 });
      return;
    }

    if (req.method === 'POST'){
      if (!authed(req)){ res.status(401).json({ error:'권한이 없습니다' }); return; }
      if (!token()){
        res.status(400).json({ error:'Blob 저장소가 연결되지 않았습니다. Vercel에서 Storage → Blob 을 만들어 주세요.' });
        return;
      }
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      const ads  = Array.isArray(body?.ads) ? body.ads : [];
      const out  = { ads, rotateMs: Number(body?.rotateMs) || 3000, savedAt:new Date().toISOString() };
      await writeBlob(out);
      res.status(200).json({ ok:true, count:ads.length });
      return;
    }

    res.status(405).json({ error:'허용되지 않은 방식입니다' });

  } catch (e) {
    console.error('ads failed:', e.message);
    res.status(500).json({ error:'광고 정보를 처리하지 못했습니다', detail:e.message });
  }
}
