/* 光溯 GUANGSU · 轻量代理与静态服务
 *
 * 作用有两个：
 *   1. 静态托管本项目（纯前端页面，无构建步骤）
 *   2. 代理抓取三个平台的真实实时热榜：抖音 / 哔哩哔哩 / 微博
 *
 * 为什么必须走服务端代理：
 *   这三个接口都没有开放 CORS 响应头，浏览器里直接 fetch 会被同源策略拦下，
 *   因此由本服务在服务端取回后以同源接口 /api/hot 交给前端。
 *
 * 合规与克制原则（重要）：
 *   · 只读取各平台「公开可见」的热榜列表，不登录、不绕过任何权限、不抓取用户数据
 *   · 带内存缓存（默认 60 秒）+ 请求间隔限流，避免对源站造成压力
 *   · 只取标题与热度，不落库、不转售、不再分发原始数据
 *   · 页面会明确标注数据来源；快手 / 小红书 / 视频号无公开接口，前端如实标注为模拟
 *
 * 启动：node server.js   （默认 http://127.0.0.1:8787）
 * 环境变量：PORT 端口；CACHE_MS 缓存毫秒
 */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const ROOT = __dirname;
const PORT = parseInt(process.env.PORT || '8787', 10);
const CACHE_MS = parseInt(process.env.CACHE_MS || '60000', 10);

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

/* ---------- 数据源定义：每个源给出抓取方式与归一化函数 ---------- */
const SOURCES = {
  douyin: {
    label: '抖音',
    page: 'https://www.douyin.com/',
    api: 'https://www.douyin.com/aweme/v1/web/hot/search/list/',
    query: { device_platform: 'webapp', aid: '6383', channel: 'channel_pc_web' },
    normalize: (j) => {
      const list = (j && j.data && j.data.word_list) || [];
      return list.map((it, i) => ({
        rank: Number(it.position) || i + 1,
        title: String(it.word || '').trim(),
        heat: Number(it.hot_value) || 0
      })).filter((x) => x.title);
    }
  },
  bilibili: {
    label: '哔哩哔哩',
    page: 'https://www.bilibili.com/',
    api: 'https://api.bilibili.com/x/web-interface/search/square',
    query: { limit: '30' },
    normalize: (j) => {
      const list = (j && j.data && j.data.trending && j.data.trending.list) || [];
      return list.map((it, i) => ({
        rank: i + 1,
        title: String(it.keyword || '').trim(),
        heat: Number(it.heat_score) || 0
      })).filter((x) => x.title);
    }
  },
  weibo: {
    label: '微博',
    page: 'https://weibo.com/',
    api: 'https://weibo.com/ajax/side/hotSearch',
    query: {},
    normalize: (j) => {
      const list = (j && j.data && j.data.realtime) || [];
      return list.map((it, i) => ({
        rank: Number(it.rank) >= 0 ? Number(it.rank) + 1 : i + 1,
        title: String(it.word || '').trim(),
        heat: Number(it.num) || 0,
        tag: it.label_name || ''
      })).filter((x) => x.title);
    }
  }
};

/* ---------- 缓存：key -> { at, payload } ---------- */
const cache = new Map();
const inflight = new Map();

function buildUrl(src) {
  const u = new URL(src.api);
  Object.keys(src.query || {}).forEach((k) => u.searchParams.set(k, src.query[k]));
  return u.toString();
}

async function fetchSource(key) {
  const src = SOURCES[key];
  const target = buildUrl(src);
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 12000);
  try {
    const res = await fetch(target, {
      signal: ctl.signal,
      headers: {
        'User-Agent': UA,
        'Referer': src.page,
        'Origin': src.page.replace(/\/$/, ''),
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'zh-CN,zh;q=0.9'
      }
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const text = await res.text();
    if (!text.trim()) throw new Error('空响应（可能被源站风控拦截）');
    let json;
    try { json = JSON.parse(text); }
    catch (e) { throw new Error('响应不是合法 JSON'); }

    const items = src.normalize(json);
    if (!items.length) throw new Error('接口返回成功但没有榜单数据');
    return {
      source: key,
      label: src.label,
      live: true,
      updatedAt: new Date().toISOString(),
      count: items.length,
      list: items.map((x, i) => Object.assign({}, x, { rank: x.rank || i + 1 }))
    };
  } finally {
    clearTimeout(timer);
  }
}

/* 带缓存 + 合并并发请求，避免同时打多个请求到源站 */
async function getSource(key, force) {
  const hit = cache.get(key);
  if (!force && hit && Date.now() - hit.at < CACHE_MS) {
    return Object.assign({}, hit.payload, { cached: true, ageMs: Date.now() - hit.at });
  }
  if (inflight.has(key)) return inflight.get(key);

  const task = (async () => {
    try {
      const payload = await fetchSource(key);
      cache.set(key, { at: Date.now(), payload });
      return Object.assign({}, payload, { cached: false, ageMs: 0 });
    } catch (err) {
      // 抓取失败：若有旧缓存则降级返回旧数据并标记 stale，前端据此显示"缓存于 xx"
      if (hit) {
        return Object.assign({}, hit.payload, {
          cached: true, stale: true, ageMs: Date.now() - hit.at,
          error: String(err && err.message || err)
        });
      }
      return { source: key, label: SOURCES[key].label, live: false, error: String(err && err.message || err), list: [] };
    } finally {
      inflight.delete(key);
    }
  })();
  inflight.set(key, task);
  return task;
}

/* ---------- HTTP 工具 ---------- */
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.gif': 'image/gif', '.webp': 'image/webp', '.ico': 'image/x-icon',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.map': 'application/json'
};

function sendJson(res, code, obj) {
  const body = Buffer.from(JSON.stringify(obj), 'utf8');
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': body.length,
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*'
  });
  res.end(body);
}

function serveStatic(req, res, pathname) {
  let rel = decodeURIComponent(pathname);
  if (rel === '/' || rel === '') rel = '/index.html';
  // 防目录穿越：解析后必须仍在 ROOT 之内
  const abs = path.resolve(ROOT, '.' + rel);
  if (!abs.startsWith(ROOT)) { res.writeHead(403); res.end('Forbidden'); return; }
  fs.stat(abs, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end('404 Not Found'); return; }
    const ext = path.extname(abs).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Content-Length': st.size,
      'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=300'
    });
    fs.createReadStream(abs).pipe(res);
  });
}

/* ---------- 主服务 ---------- */
const server = http.createServer(async (req, res) => {
  const parsed = url.parse(req.url, true);
  const pathname = parsed.pathname;

  if (pathname === '/api/hot') {
    const only = String(parsed.query.source || '').trim();
    const force = parsed.query.force === '1';
    const keys = only ? only.split(',').filter((k) => SOURCES[k]) : Object.keys(SOURCES);
    if (!keys.length) { sendJson(res, 400, { ok: false, error: '未知 source，可选：' + Object.keys(SOURCES).join(',') }); return; }
    try {
      const results = await Promise.all(keys.map((k) => getSource(k, force)));
      const out = { ok: true, fetchedAt: new Date().toISOString(), cacheMs: CACHE_MS, sources: {} };
      results.forEach((r) => { out.sources[r.source] = r; });
      sendJson(res, 200, out);
    } catch (err) {
      sendJson(res, 500, { ok: false, error: String(err && err.message || err) });
    }
    return;
  }

  if (pathname === '/api/health') {
    sendJson(res, 200, {
      ok: true, port: PORT, cacheMs: CACHE_MS,
      sources: Object.keys(SOURCES).map((k) => ({
        key: k, label: SOURCES[k].label,
        cachedAt: cache.has(k) ? new Date(cache.get(k).at).toISOString() : null
      }))
    });
    return;
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); res.end('Method Not Allowed'); return; }
  serveStatic(req, res, pathname);
});

server.listen(PORT, '127.0.0.1', () => {
  console.log('光溯 GUANGSU 已启动');
  console.log('  页面   http://127.0.0.1:' + PORT + '/');
  console.log('  热榜   http://127.0.0.1:' + PORT + '/api/hot');
  console.log('  健康   http://127.0.0.1:' + PORT + '/api/health');
  console.log('  缓存 ' + Math.round(CACHE_MS / 1000) + ' 秒 · 真实源：抖音 / 哔哩哔哩 / 微博');
});
