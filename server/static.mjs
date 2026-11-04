import { readFile } from 'node:fs/promises';
import { resolve, sep, extname } from 'node:path';
import {brotliCompressSync,gzipSync,constants} from 'node:zlib';
const encodedAssets=new Map();

const types = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.css':'text/css; charset=utf-8', '.png':'image/png', '.svg':'image/svg+xml', '.woff':'font/woff', '.woff2':'font/woff2', '.webmanifest':'application/manifest+json' };
export async function serveStatic(req, res, root) {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/auth/')) return false;
  if (!['GET','HEAD'].includes(req.method)) return false;
  let pathname;
  try { pathname = decodeURIComponent(url.pathname); } catch { res.writeHead(400); res.end(); return true; }
  const base = resolve(root);
  const file = resolve(base, `.${pathname === '/' ? '/index.html' : pathname}`);
  if (!file.startsWith(base + sep) || pathname.includes('\\') || pathname.split('/').some(p=>p.startsWith('.'))) {
    res.writeHead(404); res.end(); return true;
  }
  try {
    const content = await readFile(file),extension=extname(file);
    const hashed=/^\/assets\/[^/]+-[A-Za-z0-9_-]{8,}\.[a-z0-9]+$/.test(pathname);
    const accepted=String(req.headers?.['accept-encoding']||'').split(',').map(part=>{const [name,...params]=part.trim().split(';');const q=params.find(p=>p.trim().startsWith('q='));return {name,q:q?Number(q.trim().slice(2)):1};}).filter(item=>item.q>0);
    const encoding=content.length>1024&&['.html','.js','.css','.svg','.webmanifest'].includes(extension)?accepted.some(item=>item.name==='br')?'br':accepted.some(item=>item.name==='gzip')?'gzip':'':'';
    let payload=content;
    if(encoding){
      const key=file+':'+encoding;
      payload=hashed&&encodedAssets.get(key)|| (encoding==='br'?brotliCompressSync(content,{params:{[constants.BROTLI_PARAM_QUALITY]:4}}):gzipSync(content,{level:6}));
      if(hashed){if(encodedAssets.size>=20)encodedAssets.delete(encodedAssets.keys().next().value);encodedAssets.set(key,payload);}
    }
    res.writeHead(200, { 'Content-Type': types[extension] || 'application/octet-stream', 'Cache-Control':hashed?'public, max-age=31536000, immutable':'no-cache', 'X-Content-Type-Options':'nosniff','Content-Length':payload.length,'Vary':'Accept-Encoding',...(encoding?{'Content-Encoding':encoding}:{}) });
    res.end(req.method === 'HEAD' ? undefined : payload);
  } catch { res.writeHead(404); res.end(); }
  return true;
}
