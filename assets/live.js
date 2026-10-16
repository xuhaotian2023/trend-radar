/* 光溯 GUANGSU · 实时数据层
 *
 * 职责：从同源代理 /api/hot 拉取「真实实时热榜」，并与内置演示数据合并。
 *
 * 三种数据等级（页面上必须如实标注，不得混淆）：
 *   live  = 真实实时  → 抖音 / 哔哩哔哩 / 微博（经 server.js 服务端代理抓取公开热榜）
 *   demo  = 演示模拟  → 快手 / 小红书 / 视频号（无公开接口，使用内置演示数据）
 *   stale = 缓存数据  → 代理暂时抓取失败，沿用最近一次成功结果并标注时间
 *
 * 未启动 server.js 时（例如双击打开 index.html），本模块静默降级：
 * 全部标记为 demo，页面继续可用，不会报错。
 */
(function () {
  'use strict';

  var API = '/api/hot';
  var TIMEOUT = 12000;
  var cache = null;          // 最近一次成功响应
  var mode = 'unknown';      // live | offline
  var listening = [];

  /* 与 server.js 的 source key 对应；后端能拿到真数据的平台 */
  var LIVE_PLATFORMS = { douyin: 1, bilibili: 1, weibo: 1 };

  function emit() {
    listening.forEach(function (fn) { try { fn(snapshot()); } catch (e) {} });
  }
  function onUpdate(fn) {
    listening.push(fn);
    if (cache) fn(snapshot());
  }

  function snapshot() {
    return {
      mode: mode,
      fetchedAt: cache ? cache.fetchedAt : null,
      sources: cache ? cache.sources : {},
      /* 平台是否具备真实实时能力 */
      isLivePlatform: function (pid) { return mode === 'live' && !!LIVE_PLATFORMS[pid] && !!this.sources[pid]; },
      /* 取某平台的实时榜单，没有则返回 null（调用方回退到演示数据） */
      listOf: function (pid) {
        var s = this.sources[pid];
        return (s && s.live && s.list && s.list.length) ? s.list : null;
      },
      labelOf: function (pid) {
        var s = this.sources[pid];
        if (mode !== 'live' || !LIVE_PLATFORMS[pid] || !s || !s.live) return 'demo';
        return s.stale ? 'stale' : 'live';
      },
      /* 展示用文案 */
      badgeOf: function (pid) {
        var k = this.labelOf(pid);
        if (k === 'live') return { text: '真实实时', cls: 'is-live', tip: '数据来自平台公开热榜，经服务端代理实时抓取' };
        if (k === 'stale') return { text: '缓存数据', cls: 'is-stale', tip: '代理暂时抓取失败，展示最近一次成功结果' };
        return { text: '演示数据', cls: 'is-demo', tip: '该平台无公开热榜接口，当前为内置演示数据' };
      }
    };
  }

  function fetchOnce(force) {
    if (typeof fetch !== 'function') return Promise.resolve(null);
    var ctl = typeof AbortController === 'function' ? new AbortController() : null;
    var timer = ctl ? setTimeout(function () { ctl.abort(); }, TIMEOUT) : null;
    return fetch(API + (force ? '?force=1' : ''), {
      signal: ctl ? ctl.signal : undefined,
      headers: { Accept: 'application/json' },
      cache: 'no-store'
    }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    }).then(function (j) {
      if (!j || !j.ok) throw new Error((j && j.error) || '响应无效');
      return j;
    }).finally(function () { if (timer) clearTimeout(timer); });
  }

  function refresh(force) {
    return fetchOnce(force).then(function (j) {
      if (!j) { mode = 'offline'; emit(); return snapshot(); }
      cache = j;
      /* 只要有一个平台拿到真实数据，就算 live 模式；其余平台再按平台粒度判断 */
      var any = Object.keys(j.sources || {}).some(function (k) {
        return j.sources[k] && j.sources[k].live && j.sources[k].list && j.sources[k].list.length;
      });
      mode = any ? 'live' : 'offline';
      emit();
      return snapshot();
    }).catch(function () {
      mode = 'offline';                 // 未启动 server.js 或抓取失败 → 静默降级
      emit();
      return snapshot();
    });
  }

  window.GS_LIVE = {
    refresh: refresh,
    onUpdate: onUpdate,
    snapshot: snapshot,
    get mode() { return mode; },
    /* 供页面判断当前是否需要提示"启动 server.js 以获取真实数据" */
    isOffline: function () { return mode !== 'live'; }
  };
})();
