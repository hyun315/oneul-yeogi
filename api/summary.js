// /api/summary.js  —  기사 하나를 펼칠 때만 도는 요약 엔드포인트
//
//  구글 뉴스 RSS는 본문을 주지 않는다. 제목과 링크뿐이다.
//  그래서 (1) 구글 리다이렉트를 풀어 원문 주소를 찾고
//        (2) 그 페이지의 본문을 긁고
//        (3) 한국어로 요약한다.
//
//  미리 220건을 다 처리하지 않고 "펼칠 때 그 한 건만" 처리한다.
//  결과는 URL 단위로 24시간 캐시되므로, 같은 기사를 다른 사람이
//  펼치면 API 호출 없이 즉시 나온다.
//
//  GET /api/summary?u=<원문 링크(encodeURIComponent)>

export const config = { maxDuration: 30 };

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const BODY_LIMIT = 6000;   // 요약에 넘길 본문 최대 길이

/* 구글 뉴스 링크를 실제 기사 주소로 푼다.

   구글은 2024년부터 원문 주소를 감춘 불투명 ID(AU_yqL...)를 쓴다.
   단순 리다이렉트로는 안 풀리고, 구글의 주소 해석 엔드포인트에
   기사 페이지에서 얻은 서명(sg)과 시각(ts)을 함께 보내야 한다. */
async function viaBatchExecute(id){
  const page = await fetch(`https://news.google.com/rss/articles/${id}`, {
    headers:{ 'User-Agent':UA },
  });
  const html = await page.text();

  const sg = html.match(/data-n-a-sg="([^"]+)"/)?.[1];
  const ts = html.match(/data-n-a-ts="([^"]+)"/)?.[1];
  if (!sg || !ts) return null;

  const inner = JSON.stringify(['garturlreq',
    [['X','X',['X','X'],null,null,1,1,'US:en',null,1,null,null,null,null,null,0,1],
     'X','X',1,[1,1,1],1,1,null,0,0,null,0],
    id, Number(ts), sg]);

  const r = await fetch('https://news.google.com/_/DotsSplashUi/data/batchexecute', {
    method:'POST',
    headers:{
      'content-type':'application/x-www-form-urlencoded;charset=UTF-8',
      'User-Agent':UA,
    },
    body: new URLSearchParams({ 'f.req': JSON.stringify([[['Fbv4je', inner]]]) }),
  });
  if (!r.ok) return null;

  const text = (await r.text())
    .replace(/\\"/g,'"')
    .replace(/\\u003d/g,'=').replace(/\\u0026/g,'&').replace(/\\\//g,'/');

  const hit = [...text.matchAll(/https?:\/\/[^\s"'\\\]]+/g)]
    .map(m => m[0])
    .find(u => !/(^https?:\/\/(news|www|accounts|policies|support|lh\d|ssl)\.g(oogle|static))/.test(u));

  return hit || null;
}

async function resolveUrl(url){
  if (!url.includes('news.google.com')) return { url, html:null };

  const id = url.match(/\/rss\/articles\/([^?/]+)/)?.[1]
          || url.match(/\/articles\/([^?/]+)/)?.[1];

  if (id){
    try {
      const real = await viaBatchExecute(id);
      if (real) return { url:real, html:null };
    } catch (e) {
      console.error('batchexecute failed:', e.message);
    }
  }

  // 예비: 그냥 따라가 본다 (옛 형식 링크는 이걸로 풀린다)
  const r = await fetch(url, { redirect:'follow', headers:{ 'User-Agent':UA } });
  const html = await r.text();
  if (r.url && !r.url.includes('news.google.com')) return { url:r.url, html };

  const m =
    html.match(/data-n-au="([^"]+)"/) ||
    html.match(/href="(https?:\/\/(?!news\.google|www\.google|accounts\.google|policies\.google|support\.google)[^"]+)"/);

  return m ? { url:m[1].replace(/&amp;/g,'&'), html:null } : { url, html:null };
}

/* HTML에서 읽을 만한 본문만 남긴다 */
function extractText(html){
  let s = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<nav[\s\S]*?<\/nav>/gi, ' ')
    .replace(/<header[\s\S]*?<\/header>/gi, ' ')
    .replace(/<footer[\s\S]*?<\/footer>/gi, ' ')
    .replace(/<aside[\s\S]*?<\/aside>/gi, ' ')
    .replace(/<form[\s\S]*?<\/form>/gi, ' ');

  // <article>이 있으면 그 안쪽을 우선한다
  const art = s.match(/<article[\s\S]*?<\/article>/i);
  if (art && art[0].length > 500) s = art[0];

  // 문단 위주로 모은다 (광고·캡션 같은 짧은 조각은 버린다)
  const paras = [...s.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)]
    .map(m => m[1].replace(/<[^>]+>/g,' ').replace(/&nbsp;/g,' ')
                  .replace(/&amp;/g,'&').replace(/&quot;/g,'"')
                  .replace(/&#39;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>')
                  .replace(/\s+/g,' ').trim())
    .filter(t => t.length > 40);

  const text = paras.join('\n');
  return text.length > 200 ? text.slice(0, BODY_LIMIT) : '';
}

async function summarize(text, title, key, model){
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method:'POST',
    headers:{
      'content-type':'application/json',
      'x-api-key':key,
      'anthropic-version':'2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: 700,
      system:
        '너는 해외에 사는 한국인을 위한 뉴스 앱의 요약가다. 현지 기사를 한국어로 요약한다.\n' +
        '규칙:\n' +
        '- 3~5문장. 각 문장은 완결된 사실 한 가지씩.\n' +
        '- 그곳에 사는 한국인 입장에서 알아야 할 것을 앞에 둔다 ' +
        '(언제부터, 어디가, 얼마가, 무엇이 달라지는지).\n' +
        '- 기자 논평이나 배경 설명보다 사실과 숫자를 우선한다.\n' +
        '- 지명·기관명은 한국 언론 표기를 따른다 (Jakarta→자카르타, Bekasi→브카시).\n' +
        '- 현지 제도·용어는 한국어 뒤 괄호로 원어를 남긴다 (예: 체류허가(KITAS)).\n' +
        '- 본문이 기사 내용이 아니라 광고·안내문뿐이면 정확히 이렇게만 답한다: NO_CONTENT\n' +
        '- 머리말이나 "요약:" 같은 표시 없이 요약문만 출력한다.',
      messages: [{ role:'user', content:`제목: ${title || '(없음)'}\n\n본문:\n${text}` }],
    }),
  });
  if (!r.ok) throw new Error(`anthropic ${r.status}`);
  const d = await r.json();
  return (d.content || []).filter(b => b.type === 'text').map(b => b.text).join('').trim();
}

export default async function handler(req, res){
  const raw   = req.query.u;
  const title = req.query.t || '';

  if (!raw){
    res.status(400).json({ error:'주소가 없습니다' });
    return;
  }

  const key = process.env.ANTHROPIC_API_KEY;
  if (!key || process.env.ENABLE_TRANSLATE !== '1'){
    res.status(200).json({ ok:false, reason:'off', message:'요약 기능이 꺼져 있습니다.' });
    return;
  }

  try {
    const target = decodeURIComponent(raw);
    const { url, html } = await resolveUrl(target);

    if (url.includes('news.google.com')){
      res.setHeader('Cache-Control','s-maxage=600');
      res.status(200).json({
        ok:false, reason:'noLink', source:target,
        message:'원문 주소를 찾지 못했습니다. 원문 링크로 열어 주세요.',
      });
      return;
    }

    let page = html;
    if (!page){
      const r = await fetch(url, { headers:{ 'User-Agent':UA, 'Accept-Language':'id,en;q=0.8' } });
      if (!r.ok) throw new Error(`fetch ${r.status}`);
      page = await r.text();
    }

    const text = extractText(page);
    if (!text){
      res.setHeader('Cache-Control','s-maxage=3600');
      res.status(200).json({
        ok:false, reason:'noText', source:url,
        message:'이 매체는 본문을 바로 읽어올 수 없습니다. 원문에서 확인해 주세요.',
      });
      return;
    }

    const model = process.env.TRANSLATE_MODEL || 'claude-haiku-4-5-20251001';
    const out = await summarize(text, title, key, model);

    if (!out || out.includes('NO_CONTENT')){
      res.setHeader('Cache-Control','s-maxage=3600');
      res.status(200).json({
        ok:false, reason:'noText', source:url,
        message:'본문을 찾지 못했습니다. 원문에서 확인해 주세요.',
      });
      return;
    }

    // 기사 본문은 잘 안 바뀐다. URL 단위로 24시간 캐시.
    res.setHeader('Cache-Control','s-maxage=86400, stale-while-revalidate=604800');
    res.status(200).json({ ok:true, summary:out, source:url });

  } catch (e) {
    console.error('summary failed:', e.message);
    res.status(200).json({
      ok:false, reason:'error',
      message:'요약을 만들지 못했습니다. 원문을 열어 확인해 주세요.',
    });
  }
}
