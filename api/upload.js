// /api/upload.js  —  광고주에게 받은 이미지를 올린다 (관리자 전용)
//
//  광고주가 보내온 배너 이미지와 원페이지 광고물을 그대로 올리면
//  공개 URL이 돌아온다. 그 URL을 광고 등록 화면에 넣으면 된다.
//
//  POST /api/upload?name=banner.jpg   (본문: 이미지 바이트)
//  헤더: x-admin-key, content-type

export const config = { maxDuration: 30 };

const BLOB_API = 'https://blob.vercel-storage.com';

export default async function handler(req, res){
  if (req.method !== 'POST'){
    res.status(405).json({ error:'허용되지 않은 방식입니다' });
    return;
  }
  const pw = process.env.ADMIN_PASSWORD;
  if (!pw || req.headers['x-admin-key'] !== pw){
    res.status(401).json({ error:'권한이 없습니다' });
    return;
  }
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token){
    res.status(400).json({ error:'Blob 저장소가 연결되지 않았습니다.' });
    return;
  }

  try {
    const raw  = String(req.query.name || 'file');
    const safe = raw.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-60);
    const path = `ads/${Date.now()}-${safe}`;
    const type = req.headers['content-type'] || 'application/octet-stream';

    // 본문을 그대로 모은다
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const body = Buffer.concat(chunks);

    if (!body.length){ res.status(400).json({ error:'파일이 비어 있습니다' }); return; }
    if (body.length > 8 * 1024 * 1024){
      res.status(400).json({ error:'8MB 이하만 올릴 수 있습니다' });
      return;
    }

    const r = await fetch(`${BLOB_API}/${path}`, {
      method:'PUT',
      headers:{
        authorization:`Bearer ${token}`,
        'x-api-version':'7',
        'x-content-type':type,
        'x-add-random-suffix':'0',
        'x-cache-control-max-age':'31536000',
      },
      body,
    });
    if (!r.ok) throw new Error(`blob ${r.status} ${await r.text()}`);

    const d = await r.json();
    res.status(200).json({ ok:true, url:d.url });

  } catch (e) {
    console.error('upload failed:', e.message);
    res.status(500).json({ error:'업로드에 실패했습니다', detail:e.message });
  }
}
