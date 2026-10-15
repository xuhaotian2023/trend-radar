/* 热点雷达 · 交互层：路由 / 思维导图 / 实时模拟 / 弹窗 */
(function () {
  'use strict';
  var D = window.RADAR_DATA;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  /* ================= 工具 ================= */
  function fmtWan(v) {
    if (v >= 10000) { var y = (v / 10000).toFixed(2); return parseFloat(y) + ' 亿'; }
    return Math.round(v) + ' 万';
  }
  function pad(n) { return n < 10 ? '0' + n : '' + n; }
  function countUp(el, target, opt) {
    opt = opt || {};
    var dec = opt.dec || 0, suffix = opt.suffix || '', dur = opt.dur || 950;
    var t0 = performance.now();
    function frame(t) {
      var p = Math.min((t - t0) / dur, 1);
      var e = 1 - Math.pow(1 - p, 3);
      el.textContent = (target * e).toFixed(dec) + suffix;
      if (p < 1) requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }
  function sparkSVG(trend, color) {
    var w = 64, h = 22, min = Math.min.apply(null, trend), max = Math.max.apply(null, trend);
    var pts = trend.map(function (v, i) {
      var x = 2 + i * (w - 4) / (trend.length - 1);
      var y = h - 3 - (v - min) / (max - min || 1) * (h - 6);
      return x.toFixed(1) + ',' + y.toFixed(1);
    }).join(' ');
    return '<svg viewBox="0 0 ' + w + ' ' + h + '"><polyline class="spark-line" stroke="' + color + '" points="' + pts + '"/></svg>';
  }
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;'); }

  var toastEl = $('#toast'), toastTimer = null;
  function toast(msg) {
    toastEl.textContent = msg; toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove('show'); }, 2400);
  }

  /* ================= 路由 ================= */
  var currentView = 'map';
  function goView(name) {
    if (name === currentView) return;
    currentView = name;
    $$('.view').forEach(function (v) { v.classList.toggle('active', v.id === 'view-' + name); });
    $$('.topnav button').forEach(function (b) { b.classList.toggle('active', b.dataset.nav === name); });
    if (name === 'today') renderToday();
    var activeView = $('#view-' + name); if (activeView) activeView.scrollTop = 0;
  }
  /* ================= Boot 沉浸过渡（一级→二级 · 极光玻璃） ================= */
  var bootEl = $('#boot'), bootTitle = $('#bootTitle'),
      bpFill = $('#bpFill'), bpPct = $('#bpPct'), bpStatus = $('#bpStatus'), fxScan = $('#fxScan');
  var bootBusy = false, bootTimers = [], bootRaf = null;
  var ROUTE_LABEL = {
    map: '思维导图总览',
    today: '当日热点',
    platform: '平台深度分析',
    analyzer: 'AI 剪辑解构台'
  };
  function bootRun(color, target, swap) {
    if (bootBusy) { swap(); return; }
    bootBusy = true;
    bootTimers.forEach(clearTimeout); bootTimers = [];
    if (bootRaf) { cancelAnimationFrame(bootRaf); bootRaf = null; }
    bootEl.style.setProperty('--gt', color || '#22d3ee');
    bootTitle.textContent = ROUTE_LABEL[target] || '正在进入';
    bootTitle.style.animation = 'none'; void bootTitle.offsetWidth; bootTitle.style.animation = '';
    bpFill.style.width = '0%';
    bpPct.textContent = '0%';
    bpStatus.textContent = '加载中';
    bpStatus.classList.remove('ready');
    bootEl.classList.remove('on'); void bootEl.offsetWidth;
    bootEl.classList.add('on');

    // 进度 0% → 100%，完成后显示"已就绪"
    var PROG_MS = 480, t0 = performance.now();
    (function prog(t) {
      var p = Math.min((t - t0) / PROG_MS, 1);
      var e = 1 - Math.pow(1 - p, 2);
      var pct = Math.round(e * 100);
      bpFill.style.width = pct + '%';
      bpPct.textContent = pct + '%';
      if (p < 1) { bootRaf = requestAnimationFrame(prog); return; }
      bootRaf = null;
      bpStatus.textContent = '已就绪';
      bpStatus.classList.add('ready');
      bootTimers.push(setTimeout(swap, 120));      // 已就绪后立刻切视图
      bootTimers.push(setTimeout(function () {
        bootEl.classList.remove('on');
        fxScan.classList.add('tear');
      }, 240));
      bootTimers.push(setTimeout(function () {
        fxScan.classList.remove('tear');
        bootBusy = false;
      }, 620));
    })(t0);
  }
  $$('.topnav button').forEach(function (b) {
    b.addEventListener('click', function () {
      var name = b.dataset.nav;
      bootRun(name === 'analyzer' ? '#22d3ee' : '#6d5efc', name, function () { goView(name); });
    });
  });

  /* ================= 时钟 & 实时模拟 ================= */
  function tickClock() {
    var d = new Date();
    $('#clock').textContent = pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
  }
  setInterval(tickClock, 1000); tickClock();

  var totalTopics = 0, totalEst = 0;
  D.platforms.forEach(function (p) {
    totalTopics += p.topicCount;
    p.topics.forEach(function (t) { totalEst += t.est; });
  });

  setInterval(function () {
    var n = 1 + Math.floor(Math.random() * 2);
    for (var i = 0; i < n; i++) {
      var p = D.platforms[Math.floor(Math.random() * D.platforms.length)];
      p.heat = Math.max(60, Math.min(99.5, p.heat + (Math.random() - 0.42) * 1.8));
      var t = p.topics[Math.floor(Math.random() * p.topics.length)];
      t.heat = Math.max(55, Math.min(99.5, t.heat + (Math.random() - 0.45) * 1.6));
      var el = document.getElementById('heat-' + p.id);
      if (el) {
        el.innerHTML = p.heat.toFixed(1) + '<i>HEAT</i>';
        el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash');
      }
    }
  }, 3000);

  $('#refreshBtn').addEventListener('click', function () {
    var btn = this; btn.classList.add('spin');
    D.platforms.forEach(function (p) {
      p.heat = Math.max(60, Math.min(99.5, p.heat + (Math.random() - 0.42) * 3));
      var el = document.getElementById('heat-' + p.id);
      if (el) el.innerHTML = p.heat.toFixed(1) + '<i>HEAT</i>';
    });
    setTimeout(function () { btn.classList.remove('spin'); }, 850);
    var d = new Date();
    toast('已同步最新热点数据 · ' + pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds()));
  });

  /* ================= 思维导图（节点可拖动 · 连线每帧实时派生） ================= */
  var stage = $('#mapStage'), svg = $('#mapSvg');
  var POS = {
    douyin: [17, 26], bilibili: [50, 12], xiaohongshu: [83, 26],
    kuaishou: [20, 78], shipinhao: [80, 78]
  };
  var HUB = { x: 50, y: 46 };
  var nodeState = {};        // id -> { x:百分比, y:百分比, el:节点DOM }  ← 连线的唯一数据源
  var linksDirty = true;     // 脏位：布局/拖动/尺寸变化时标记，由 rAF 统一重绘

  function buildMap() {
    D.platforms.forEach(function (p, i) {
      var pos = POS[p.id];
      var node = document.createElement('div');
      node.className = 'mnode';
      node.setAttribute('role', 'button');
      node.setAttribute('tabindex', '0');
      node.dataset.pid = p.id;
      node.style.setProperty('--p', p.color);
      node.style.setProperty('--p2', p.color2);
      node.style.setProperty('--p-glow', p.color + '55');
      node.style.setProperty('--d', (0.15 + i * 0.08) + 's');
      node.style.left = pos[0] + '%'; node.style.top = pos[1] + '%';
      node.setAttribute('aria-label', p.name + '分支 · 可拖动');
      var top = p.topics[0];
      node.innerHTML =
        '<div class="mn-top">' +
          '<span class="mn-logo">' + p.name.charAt(0) + '</span>' +
          '<div class="mn-name">' + p.name + '<em>' + p.en + '</em></div>' +
          '<span class="mn-heat" id="heat-' + p.id + '">' + p.heat.toFixed(1) + '<i>HEAT</i></span>' +
        '</div>' +
        '<div class="mn-topic"><span class="tt">TOP1</span><b>' + esc(top.title) + '</b></div>' +
        '<div class="mn-foot"><span class="cnt">' + p.topicCount + ' 话题在榜</span>' + sparkSVG(p.trend, p.color) + '</div>' +
        '<button class="mn-sub-toggle" type="button">≡ 在榜话题 TOP' + p.topics.length + '</button>' +
        '<span class="mn-go">按住拖动 · 点击进入完整分析 →</span>' +
        '<div class="mn-sub" hidden></div>';
      stage.appendChild(node);
      nodeState[p.id] = { x: pos[0], y: pos[1], el: node };

      // 入场动画结束后释放 transform：既保留居中定位，又让 hover / 拖动生效
      node.addEventListener('animationend', function () { node.style.animation = 'none'; linksDirty = true; });

      bindDrag(node, p);
      node.querySelector('.mn-sub-toggle').addEventListener('click', function (e) {
        e.stopPropagation(); toggleSub(p.id);
      });
      node.addEventListener('click', function () {
        if (node._suppressClick) { node._suppressClick = false; return; }
        branchPulse(p.id, function () { bootRun(p.color, 'platform', function () { openPlatform(p.id); }); });
      });
      node.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') branchPulse(p.id, function () { bootRun(p.color, 'platform', function () { openPlatform(p.id); }); });
      });
    });

    redrawLinks();
    if (!rafId) rafId = requestAnimationFrame(rafLoop);
    countUp($('#hubTopics'), totalTopics, {});
    countUp($('#hubEst'), parseFloat((totalEst / 10000).toFixed(1)), { dec: 1, suffix: ' 亿' });
  }

  /* 拖动：pointer 事件直接改写节点百分比坐标，连线随之实时重绘 */
  function bindDrag(node, p) {
    var st = nodeState[p.id], dragging = false, moved = false, sx = 0, sy = 0, ox = 0, oy = 0;
    node.addEventListener('pointerdown', function (e) {
      if (e.target.closest('.mn-sub')) return;
      dragging = true; moved = false;
      sx = e.clientX; sy = e.clientY; ox = st.x; oy = st.y;
      node.classList.add('dragging');
      if (node.setPointerCapture) { try { node.setPointerCapture(e.pointerId); } catch (err) {} }
      linksDirty = true;
    });
    node.addEventListener('pointermove', function (e) {
      if (!dragging) return;
      var w = stage.clientWidth, h = stage.clientHeight;
      if (Math.abs(e.clientX - sx) > 3 || Math.abs(e.clientY - sy) > 3) moved = true;
      st.x = Math.max(7, Math.min(93, ox + (e.clientX - sx) / w * 100));
      st.y = Math.max(8, Math.min(92, oy + (e.clientY - sy) / h * 100));
      node.style.left = st.x + '%'; node.style.top = st.y + '%';
      linksDirty = true;
    });
    node.addEventListener('pointerup', function () {
      if (!dragging) return;
      dragging = false; node.classList.remove('dragging');
      node._suppressClick = moved;   // 拖动后不触发「进入平台」点击
      linksDirty = true;
    });
    node.addEventListener('pointercancel', function () { dragging = false; node.classList.remove('dragging'); });
  }

  /* 三级菜单：平台关键指标 + 在榜话题 TOP10 */
  function toggleSub(pid) {
    var node = nodeState[pid].el, panel = node.querySelector('.mn-sub');
    var wasOpen = panel.hidden === false;
    $$('.mnode .mn-sub').forEach(function (x) { x.hidden = true; });
    $$('.mnode').forEach(function (x) { x.classList.remove('sub-open', 'sub-up'); });
    if (wasOpen) { linksDirty = true; return; }
    if (!panel.dataset.built) {
      panel.dataset.built = '1';
      panel.innerHTML = buildSubHTML(D.platforms.filter(function (x) { return x.id === pid; })[0]);
      $$('.mn-sub-topic', panel).forEach(function (row) {
        row.addEventListener('click', function (e) { e.stopPropagation(); openTopic(pid, row.dataset.tid); });
      });
      panel.querySelector('.mn-sub-enter').addEventListener('click', function (e) {
        e.stopPropagation();
        var p = D.platforms.filter(function (x) { return x.id === pid; })[0];
        bootRun(p.color, 'platform', function () { openPlatform(pid); });
      });
    }
    panel.hidden = false; node.classList.add('sub-open');
    node.classList.toggle('sub-up', st_y(pid) > 55);   // 下排节点面板向上展开
    linksDirty = true;
  }
  function st_y(pid) { var s = nodeState[pid]; return s ? s.y : 0; }
  function buildSubHTML(p) {
    var kpis = [
      ['在榜话题数', p.topicCount + ' 个'], ['平均预估播放', fmtWan(p.avgEst)],
      ['峰值增速 24h', '+' + p.peak.toFixed(1) + '%'], ['内容饱和度', p.saturation + '%']
    ];
    var rows = p.topics.slice(0, 10).map(function (t, i) {
      return '<button class="mn-sub-topic" type="button" data-tid="' + t.id + '">' +
        '<span class="mst-rk">' + pad(i + 1) + '</span>' +
        '<span class="mst-t">' + esc(t.title) + '</span>' +
        '<span class="mst-c">' + t.cat + '</span>' +
        '<span class="mst-h">' + t.heat.toFixed(1) + '</span></button>';
    }).join('');
    return '<div class="mn-sub-hd"><b>' + p.name + ' · 平台信息</b><span>' + D.updatedAt + ' 快照</span></div>' +
      '<div class="mn-sub-kpis">' + kpis.map(function (k) {
        return '<div class="msk"><span>' + k[0] + '</span><b>' + k[1] + '</b></div>';
      }).join('') + '</div>' +
      '<div class="mn-sub-tp"><b>在榜话题 TOP ' + Math.min(10, p.topics.length) + '</b><span>点击查看完整分析</span></div>' +
      '<div class="mn-sub-list">' + rows + '</div>' +
      '<button class="mn-sub-enter" type="button">进入 ' + p.name + ' 完整分析 →</button>';
  }

  /* 连线：完全由 nodeState 百分比坐标派生，与节点定位同源，不再跑丢 */
  function redrawLinks() {
    linksDirty = false;
    var w = stage.clientWidth, h = stage.clientHeight;
    if (w <= 0 || h <= 0) return;
    $$('.link, .link-glow, .flow', svg).forEach(function (e) { e.remove(); });
    var hx = w * HUB.x / 100, hy = h * HUB.y / 100;
    var ns = 'http://www.w3.org/2000/svg';
    D.platforms.forEach(function (p) {
      var st = nodeState[p.id]; if (!st) return;
      var cx = w * st.x / 100, cy = h * st.y / 100;
      var dx = cx - hx, dy = cy - hy, dist = Math.hypot(dx, dy) || 1;
      var r2 = Math.min(st.el.offsetWidth, 260) / 2 * 0.86;
      var x1 = hx + dx / dist * 122, y1 = hy + dy / dist * 122;
      var x2 = cx - dx / dist * r2, y2 = cy - dy / dist * r2;
      var d = 'M ' + x1.toFixed(1) + ' ' + y1.toFixed(1) +
              ' C ' + x1.toFixed(1) + ' ' + (y1 + (y2 - y1) * 0.42).toFixed(1) +
              ', ' + x2.toFixed(1) + ' ' + (y2 - (y2 - y1) * 0.42).toFixed(1) +
              ', ' + x2.toFixed(1) + ' ' + y2.toFixed(1);

      [['link-glow', p.color], ['link', p.color], ['flow', p.color2]].forEach(function (cfg) {
        var path = document.createElementNS(ns, 'path');
        path.setAttribute('d', d);
        path.setAttribute('class', cfg[0]);
        path.setAttribute('stroke', cfg[1]);
        path.dataset.plat = p.id;
        svg.appendChild(path);
      });
    });
    rebuildParticles();
  }
  /* 连线上流动的光点 */
  var particles = [], rafId = null;
  function rebuildParticles() {
    particles.forEach(function (o) { if (o.dot) o.dot.remove(); });
    particles = $$('.link', svg).map(function (path, i) {
      var c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      c.setAttribute('r', '2.6');
      c.setAttribute('fill', path.getAttribute('stroke'));
      c.setAttribute('filter', 'url(#glow)');
      svg.appendChild(c);
      return { path: path, dot: c, speed: 0.00009 + i * 0.000022, off: i * 0.37 };
    });
  }
  function rafLoop(now) {
    if (linksDirty) redrawLinks();          // ← 拖动 / 尺寸变化时连线实时重算
    particles.forEach(function (o) {
      var len = o.path.getTotalLength();
      if (!len) return;
      var t = ((now * o.speed) + o.off) % 1;
      var pt = o.path.getPointAtLength(t * len);
      o.dot.setAttribute('cx', pt.x); o.dot.setAttribute('cy', pt.y);
      o.dot.setAttribute('opacity', (0.25 + 0.75 * Math.sin(t * Math.PI)).toFixed(2));
    });
    rafId = requestAnimationFrame(rafLoop);
  }

  /* 点击分支：脉冲沿线飞行后进入 */
  function branchPulse(pid, done) {
    var path = $$('.link', svg).filter(function (e) { return e.dataset.plat === pid; })[0];
    if (!path) { done(); return; }
    var p = D.platforms.filter(function (x) { return x.id === pid; })[0];
    var c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    c.setAttribute('r', '5'); c.setAttribute('fill', p.color);
    c.setAttribute('filter', 'url(#glow)');
    svg.appendChild(c);
    $$('.link, .link-glow, .flow', svg).forEach(function (e) {
      if (e.dataset.plat === pid) e.classList.add('lit'); else e.classList.add('dim');
    });
    var len = path.getTotalLength(), t0 = performance.now(), dur = 620;
    (function fly(t) {
      var k = Math.min((t - t0) / dur, 1), e = k * k;
      var pt = path.getPointAtLength(e * len);
      c.setAttribute('cx', pt.x); c.setAttribute('cy', pt.y);
      c.setAttribute('r', 5 + k * 3);
      if (k < 1) { requestAnimationFrame(fly); }
      else { c.remove(); done(); }
    })(t0);
  }

  /* 尺寸 / 视图切换 → 标记连线脏位（含 ResizeObserver 兜底） */
  var resizeTimer = null;
  function markLinksDirty() { linksDirty = true; }
  window.addEventListener('resize', function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(markLinksDirty, 120);
  });
  if (window.ResizeObserver) { new ResizeObserver(markLinksDirty).observe(stage); }
  document.addEventListener('transitionend', function (e) {
    if (e.target && e.target.classList && e.target.classList.contains('view')) markLinksDirty();
  });

  /* ================= 平台分支视图 ================= */
  var platformCache = {};
  function techTop(t) {
    var arr = [['节奏卡点', t.tech.rhythm], ['转场设计', t.tech.trans], ['字幕包装', t.tech.sub], ['声画匹配', t.tech.sound]];
    arr.sort(function (a, b) { return b[1] - a[1]; });
    return arr.slice(0, 2);
  }
  var maxEst = 0;
  D.platforms.forEach(function (p) { p.topics.forEach(function (t) { if (t.est > maxEst) maxEst = t.est; }); });

  function openPlatform(pid) {
    var p = D.platforms.filter(function (x) { return x.id === pid; })[0];
    var sec = $('#view-platform');
    sec.style.setProperty('--p', p.color);
    sec.style.setProperty('--p2', p.color2);
    sec.style.setProperty('--p-glow', p.color + '44');

    var topN = Math.min(10, p.topics.length);
    var cards = p.topics.slice(0, topN).map(function (t, i) {
      var chips = techTop(t).map(function (c) {
        return '<span class="tc-chip hl">' + c[0] + ' <b>' + c[1] + '</b></span>';
      }).join('');
      chips += '<span class="tc-chip">内核 · ' + esc(t.core.narr.length > 16 ? t.core.narr.slice(0, 16) + '…' : t.core.narr) + '</span>';
      return '<article class="tcard" data-plat="' + p.id + '" data-tid="' + t.id + '" tabindex="0" role="button" aria-label="' + esc(t.title) + '">' +
        '<div class="tc-rank">' + pad(i + 1) + '</div>' +
        '<div class="tc-main">' +
          '<div class="tc-head"><h4>' + esc(t.title) + '</h4><span class="tc-cat">' + t.cat + '</span></div>' +
          '<div class="tc-chips">' + chips + '</div>' +
          '<div class="tc-est"><span class="bar"><i data-w="' + (t.est / maxEst * 100).toFixed(1) + '"></i></span>' +
            '<b>' + fmtWan(t.est) + '</b><span>预估播放</span></div>' +
        '</div>' +
        '<div class="tc-side">' +
          '<div class="tc-heat">' + t.heat.toFixed(1) + '<small>HEAT</small></div>' +
          '<div class="tc-gr up">▲ ' + t.growth.toFixed(1) + '%</div>' +
          sparkSVG(p.trend, p.color) +
          '<span class="tc-more">完整分析 →</span>' +
        '</div></article>';
    }).join('');

    sec.innerHTML = '<div class="pv-wrap">' +
      '<button class="back" id="backBtn">← 返回导图</button>' +
      '<div class="stag">' +
        '<div class="pv-hero">' +
          '<div class="pv-logo">' + p.name.charAt(0) + '</div>' +
          '<div><h1>' + p.name + '<em>' + p.en + '</em></h1><p class="pv-slogan">' + p.slogan + '</p></div>' +
          '<div class="pv-heat"><b id="pvHeat">0.0</b><span>实时热度指数</span></div>' +
        '</div>' +
        '<p class="pv-desc">' + p.desc + '</p>' +
        '<div class="pv-kpis">' +
          '<div class="kpi"><div class="k-l">在榜话题数</div><div class="k-v">' + p.topicCount + '<small>个</small></div><div class="k-bar"><i data-w="' + (p.topicCount / 40 * 100) + '"></i></div></div>' +
          '<div class="kpi"><div class="k-l">平均预估播放</div><div class="k-v">' + fmtWan(p.avgEst) + '</div><div class="k-bar"><i data-w="' + (p.avgEst / 21000 * 100).toFixed(1) + '"></i></div></div>' +
          '<div class="kpi"><div class="k-l">峰值增速（24h）</div><div class="k-v">+' + p.peak.toFixed(1) + '<small>%</small></div><div class="k-bar"><i data-w="' + (p.peak / 30 * 100).toFixed(1) + '"></i></div></div>' +
          '<div class="kpi"><div class="k-l">内容饱和度</div><div class="k-v">' + p.saturation + '<small>%</small></div><div class="k-bar"><i data-w="' + p.saturation + '"></i></div></div>' +
        '</div>' +
        '<div class="pv-body">' +
          '<div class="pv-chart"><h3>近 7 日热度走势</h3><p class="sub">平台整体热度指数采样</p><div id="pvTrend"></div></div>' +
          '<div class="pv-topicsbox"><h3>在榜话题 · 实时抓取 TOP ' + topN + '</h3><p class="sub">点击话题查看剪辑手法 / 视频内核 / 流量预估完整分析</p>' + cards + '</div>' +
        '</div>' +
      '</div></div>';

    $('#backBtn').addEventListener('click', function () { bootRun(p.color, 'map', function () { goView('map'); }); });
    $$('.tcard', sec).forEach(function (card) {
      card.addEventListener('click', function () { openTopic(card.dataset.plat, card.dataset.tid); });
      card.addEventListener('keydown', function (e) { if (e.key === 'Enter') openTopic(card.dataset.plat, card.dataset.tid); });
    });

    goView('platform');
    countUp($('#pvHeat'), p.heat, { dec: 1 });
    setTimeout(function () { window.Charts.renderPlatformTrend('pvTrend', p); }, 380);
    // 入场后填充进度条
    setTimeout(function () {
      $$('#view-platform [data-w]').forEach(function (el) { el.style.width = el.dataset.w + '%'; });
    }, 240);
  }

  /* ================= 话题分析弹窗 ================= */
  var overlay = $('#topicOverlay');
  function openTopic(pid, tid) {
    var p = D.platforms.filter(function (x) { return x.id === pid; })[0];
    var t = p.topics.filter(function (x) { return x.id === tid; })[0];
    if (!p || !t) return;

    var techRows = [['节奏卡点', t.tech.rhythm], ['转场设计', t.tech.trans], ['字幕包装', t.tech.sub], ['声画匹配', t.tech.sound]]
      .map(function (r) {
        return '<div class="tech-row"><div class="t-head"><b>' + r[0] + '</b><span>' + r[1] + '</span></div>' +
               '<div class="t-bar"><i data-w="' + r[1] + '"></i></div></div>';
      }).join('');

    // 模板原视频（真实外链，非 AI 生成内容）
    var orig = (D.orig && D.orig[tid]) || null;
    var origSec = orig ?
      '<section class="ov-sec orig-sec wide"><h3>模板原视频</h3>' +
        '<p class="sub">该话题模板对应的真实原视频 · 直达视频站播放页 · 非 AI 生成</p>' +
        '<a class="orig-link" href="' + esc(orig.url) + '" target="_blank" rel="noopener noreferrer">' +
          '<span class="orig-ico">B</span>' +
          '<span class="orig-main"><b>' + esc(orig.title) + '</b><span>' + orig.site + ' · ' + esc(orig.url.replace(/^https?:\/\//, '').split('/video/')[0]) + '</span></span>' +
          '<span class="orig-go">前往播放 ↗</span>' +
        '</a>' +
        '<p class="orig-note">链接指向视频站真实页面，与站内原视频一致；点击将在新标签页打开。</p>' +
      '</section>' : '';

    $('#ovPanel').innerHTML =
      '<button class="ov-close" id="ovClose">✕</button>' +
      '<div class="ov-head">' +
        '<div><div class="ov-badges">' +
          '<span class="ov-badge" style="background:' + p.color + '">' + p.name + '</span>' +
          '<span class="ov-badge ghost">' + t.cat + '</span>' +
          '<span class="ov-badge ghost">实时抓取</span>' +
        '</div>' +
        '<h2>' + esc(t.title) + '</h2>' +
        '<div class="ov-sub">热点雷达 · ' + D.updatedAt + ' 抓取快照 · 剪辑手法 / 视频内核 / 流量预估三维分析</div></div>' +
        '<div class="ov-score"><b>' + t.heat.toFixed(1) + '</b><div class="gr up">▲ ' + t.growth.toFixed(1) + '% / 24h</div><span>热度指数</span></div>' +
      '</div>' +
      '<div class="ov-grid">' +
        '<section class="ov-sec"><h3>预估流量模型</h3><p class="sub">近 7 日实际播放 + 未来 3 日生命周期预测</p>' +
          '<div id="ovChart"></div>' +
          '<div class="ov-chips">' +
            '<div class="ov-chip"><b>' + fmtWan(t.est) + '</b><span>生命周期预估播放</span></div>' +
            '<div class="ov-chip"><b>D-1 ~ 今日</b><span>流量峰值区间</span></div>' +
            '<div class="ov-chip"><b>' + t.confidence + '%</b><span>模型置信度</span></div>' +
          '</div>' +
        '</section>' +
        '<section class="ov-sec"><h3>剪辑手法解析</h3><p class="sub">四维手法评分（0-100）</p>' + techRows +
          '<p class="tech-desc">' + t.tech.desc + '</p>' +
        '</section>' +
        '<section class="ov-sec wide"><h3>视频内核拆解</h3><p class="sub">叙事 · 情绪 · 人群 · 传播</p>' +
          '<div class="core-grid">' +
            '<div class="core-kv"><div class="c-k">NARRATIVE · 核心叙事结构</div><div class="c-v">' + t.core.narr + '</div></div>' +
            '<div class="core-kv"><div class="c-k">EMOTION · 情绪锚点</div><div class="c-v">' + t.core.emo + '</div></div>' +
            '<div class="core-kv"><div class="c-k">AUDIENCE · 目标人群画像</div><div class="c-v">' + t.core.aud + '</div></div>' +
            '<div class="core-kv"><div class="c-k">SPREAD · 传播扩散机制</div><div class="c-v">' + t.core.spread + '</div></div>' +
          '</div>' +
        '</section>' +
        origSec +
      '</div>';

    overlay.classList.add('open');
    document.body.style.overflow = 'hidden';
    $('#ovClose').addEventListener('click', closeTopic);
    setTimeout(function () {
      window.Charts.renderTopic('ovChart', t, p.color, p.color2);
      $$('#ovPanel [data-w]').forEach(function (el) { el.style.width = el.dataset.w + '%'; });
    }, 300);
  }
  function closeTopic() {
    overlay.classList.remove('open');
    document.body.style.overflow = '';
  }
  overlay.addEventListener('click', function (e) { if (e.target === overlay) closeTopic(); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && overlay.classList.contains('open')) closeTopic(); });

  /* ================= 当日热点视图 ================= */
  var todayHourly = null;
  var TD_SECTIONS = [
    { id: 'all', name: '全部' },
    { id: 'game', name: '游戏', cats: ['游戏'] },
    { id: 'pet', name: '萌宠', cats: ['萌宠'] },
    { id: 'film', name: '影视娱乐', cats: ['影视娱乐'] },
    { id: 'food', name: '美食', cats: ['美食'] },
    { id: 'emotion', name: '情感', cats: ['情感'] },
    { id: 'life', name: '生活', cats: ['生活'] }
  ];
  var tdCat = 'all', tdSub = '';
  function tdSec() {
    var s = null; TD_SECTIONS.forEach(function (x) { if (x.id === tdCat) s = x; });
    return s;
  }
  function tdByCat(list) {
    var s = tdSec();
    if (!s || !s.cats) return list;
    return list.filter(function (o) { return s.cats.indexOf(o.t.cat) >= 0; });
  }
  function tdFilter(list) {
    var out = tdByCat(list);
    if (tdSub) out = out.filter(function (o) { return o.t.sub === tdSub; });
    return out;
  }
  /* 一级分区标签 */
  function tdRenderCats(all) {
    $('#tdCats').innerHTML = TD_SECTIONS.map(function (s) {
      var n = s.id === 'all' ? all.length :
        all.filter(function (o) { return s.cats && s.cats.indexOf(o.t.cat) >= 0; }).length;
      if (n === 0 && s.id !== 'all') return '';
      return '<button role="tab" data-cat="' + s.id + '"' + (tdCat === s.id ? ' class="on"' : '') + '>' +
        s.name + '<span class="tc-n">' + n + '</span></button>';
    }).join('');
    $$('#tdCats button').forEach(function (b) {
      b.addEventListener('click', function () {
        if (tdCat === b.dataset.cat) return;
        tdCat = b.dataset.cat; tdSub = '';
        renderToday(true);
      });
    });
  }
  /* 二级子分区标签（游戏 → 王者荣耀 / 三角洲行动…；萌宠 → 猫咪 / 狗狗） */
  function tdRenderSubcats(all) {
    var box = $('#tdSubcats');
    if (tdCat === 'all') { box.hidden = true; box.innerHTML = ''; tdSub = ''; return; }   // 仅在一级分区内下钻
    var pool = tdByCat(all);
    var subs = [];
    pool.forEach(function (o) {
      var s = o.t.sub;
      if (subs.indexOf(s) < 0) subs.push(s);
    });
    if (subs.length < 2) { box.hidden = true; box.innerHTML = ''; tdSub = ''; return; }
    box.hidden = false;
    box.innerHTML = '<button role="tab" data-sub=""' + (tdSub === '' ? ' class="on"' : '') + '>该分区全部<span class="tc-n">' + pool.length + '</span></button>' +
      subs.map(function (s) {
        var n = pool.filter(function (o) { return o.t.sub === s; }).length;
        return '<button role="tab" data-sub="' + esc(s) + '"' + (tdSub === s ? ' class="on"' : '') + '>' +
          esc(s) + '<span class="tc-n">' + n + '</span></button>';
      }).join('');
    $$('#tdSubcats button').forEach(function (b) {
      b.addEventListener('click', function () {
        if (tdSub === b.dataset.sub) return;
        tdSub = b.dataset.sub;
        renderToday(true);
      });
    });
  }
  function tdRow(o, i, showGrowth) {
    return '<div class="rank-row" data-plat="' + o.p.id + '" data-tid="' + o.t.id + '" role="button" tabindex="0">' +
      '<span class="rk">' + pad(i + 1) + '</span>' +
      '<span class="r-title">' + esc(o.t.title) + '</span>' +
      '<span class="r-plat" style="background:' + o.p.color + '">' + o.p.name + '</span>' +
      '<span class="r-cat">' + o.t.sub + '</span>' +
      '<span class="r-est">' + o.t.heat.toFixed(1) + '</span>' +
      (showGrowth ? '<span class="r-gr up">▲ ' + o.t.growth.toFixed(1) + '%</span>' : '') +
      '</div>';
  }
  function tdBind(root) {
    $$('.rank-row', root).forEach(function (row) {
      row.addEventListener('click', function () { openTopic(row.dataset.plat, row.dataset.tid); });
      row.addEventListener('keydown', function (e) { if (e.key === 'Enter') openTopic(row.dataset.plat, row.dataset.tid); });
    });
  }
  function renderToday(fromCat) {
    var all = [];
    D.platforms.forEach(function (p) { p.topics.forEach(function (t) { all.push({ p: p, t: t }); }); });
    all.sort(function (a, b) { return b.t.heat - a.t.heat; });

    if (!fromCat) { tdRenderCats(all); tdSub = ''; }
    tdRenderSubcats(all);
    var list = tdFilter(all);

    // 今日榜首（随分区切换）
    var ch = $('#tdChamp');
    if (list.length) {
      var champ = list[0];
      ch.hidden = false;
      ch.setAttribute('data-plat', champ.p.id); ch.setAttribute('data-tid', champ.t.id);
      ch.innerHTML =
        '<span class="c-rank">NO.1</span>' +
        '<span class="c-main"><b>' + esc(champ.t.title) + '</b>' +
        '<span>' + champ.p.name + ' · ' + champ.t.sub + ' · 预估 ' + fmtWan(champ.t.est) + '</span></span>' +
        '<span class="c-heat">' + champ.t.heat.toFixed(1) + '</span>';
      ch.onclick = function () { openTopic(champ.p.id, champ.t.id); };
      ch.onkeydown = function (e) { if (e.key === 'Enter') openTopic(champ.p.id, champ.t.id); };
    } else {
      ch.hidden = true;
    }

    // 急速上升 TOP 4
    var risers = list.slice().sort(function (a, b) { return b.t.growth - a.t.growth; }).slice(0, 4);
    $('#tdRisers').innerHTML = risers.length ? risers.map(function (o, i) { return tdRow(o, i, true); }).join('')
      : '<div class="td-empty">该分区今日暂无急速上升话题</div>';
    tdBind($('#tdRisers'));

    // 分区前十榜（标题随二级分区变化）
    var sec = tdSec();
    var label = tdSub || (tdCat === 'all' ? '全网' : (sec ? sec.name : ''));
    $('#tdRankTitle').textContent = label + ' 热榜 TOP 10';
    $('#tdRank').innerHTML = list.length ? list.slice(0, 10).map(function (o, i) {
      return tdRow(o, i, false);
    }).join('') : '<div class="td-empty">该分区今日暂无上榜话题</div>';
    tdBind($('#tdRank'));

    // 24 小时热度条（首次生成后保持，仅刷新榜单以跟随实时热度）
    if (!todayHourly) {
      todayHourly = [];
      var nowH = new Date().getHours();
      for (var h = 0; h < 24; h++) {
        var wave = 46 + 34 * Math.sin((h - 6) / 24 * Math.PI * 2 - 0.6) +
                   18 * Math.sin(h / 3.7) + Math.random() * 12;
        if (h >= 18 && h <= 23) wave += 20;         // 晚间黄金档
        if (h === nowH) wave += 26;                  // 当前小时高亮
        todayHourly.push(Math.max(16, Math.min(100, Math.round(wave))));
      }
    }
    var peak = Math.max.apply(null, todayHourly);
    var peakH = todayHourly.indexOf(peak);
    $('#tdStrip').innerHTML = todayHourly.map(function (v, h) {
      return '<span class="hb' + (v === peak ? ' peak' : '') + '" data-h="' + pad(h) + ':00 · ' + v + '" ' +
             'style="height:' + v + '%;animation:riseIn .5s var(--ease) ' + (h * 0.028) + 's both"></span>';
    }).join('');

    // 今日热度区补充信息（填补热度条下方留白）
    var avgHeat = list.length ? list.reduce(function (s, o) { return s + o.t.heat; }, 0) / list.length : 0;
    var sumEst = list.reduce(function (s, o) { return s + o.t.est; }, 0);
    var nowH2 = new Date().getHours();
    var ins = [
      ['在榜话题', list.length + ' 个'],
      ['预估总播放', sumEst >= 10000 ? (sumEst / 10000).toFixed(2) + ' 亿' : Math.round(sumEst) + ' 万'],
      ['平均热度指数', avgHeat.toFixed(1)],
      ['当前时段热度', todayHourly[nowH2] + ' / 峰值 ' + pad(peakH) + ':00']
    ];
    $('#tdInsights').innerHTML = ins.map(function (x) {
      return '<div class="td-ins"><span>' + x[0] + '</span><b>' + x[1] + '</b></div>';
    }).join('');

    // 分时段看点：四段时段热度均值对比，峰值时段高亮
    var phDef = [
      ['凌晨 00-06', 0, 6, '深夜流量洼地 · 适合长尾沉淀'],
      ['上午 06-12', 6, 12, '通勤刷屏高峰 · 资讯类易爆'],
      ['午间 12-18', 12, 18, '午休加下班前 · 话题发酵期'],
      ['晚间 18-24', 18, 24, '黄金流量档 · 爆款集中爆发']
    ];
    var segVals = phDef.map(function (s) {
      var seg = todayHourly.slice(s[1], s[2]);
      return seg.reduce(function (a, b) { return a + b; }, 0) / Math.max(1, seg.length);
    });
    var segMax = Math.max.apply(null, segVals);
    $('#tdPhase').innerHTML = phDef.map(function (s, i) {
      return '<div class="ph' + (segVals[i] === segMax ? ' hot' : '') + '">' +
        '<b>' + s[0] + '<i>' + Math.round(segVals[i]) + '</i></b><span>' + s[3] + '</span>' +
        '<div class="ph-bar"><i style="width:' + Math.round(segVals[i] / Math.max(1, segMax) * 100) + '%"></i></div></div>';
    }).join('');

    // 热搜关键词：从话题标题与子分区提取高频词，字号随热度放大
    var kwMap = {};
    list.forEach(function (o) {
      (o.t.title || '').split(/[：:·｜|，,！!？?\s（）()「」]+/).concat([o.t.sub]).forEach(function (w) {
        w = (w || '').trim();
        if (w.length < 2 || w.length > 8) return;
        kwMap[w] = (kwMap[w] || 0) + o.t.heat;
      });
    });
    var kws = Object.keys(kwMap).map(function (k) { return [k, kwMap[k]]; })
      .sort(function (a, b) { return b[1] - a[1]; }).slice(0, 14);
    var kwMax = kws.length ? kws[0][1] : 1;
    $('#tdKw').innerHTML = kws.map(function (k) {
      return '<span class="kw" style="font-size:' + (11.5 + Math.round(k[1] / kwMax * 38) / 10).toFixed(1) + 'px">' + esc(k[0]) + '</span>';
    }).join('');

    // 五平台各自在榜 TOP 10
    $('#tdPlatGrid').innerHTML = D.platforms.map(function (p) {
      var rows = p.topics.slice(0, 10).map(function (t, i) {
        return '<div class="rank-row" data-plat="' + p.id + '" data-tid="' + t.id + '" role="button" tabindex="0">' +
          '<span class="rk">' + pad(i + 1) + '</span>' +
          '<span class="r-title">' + esc(t.title) + '</span>' +
          '<span class="r-est">' + t.heat.toFixed(1) + '</span></div>';
      }).join('');
      return '<div class="td-plat" style="--p:' + p.color + '">' +
        '<div class="td-plat-hd">' +
          '<span class="tp-logo">' + p.name.charAt(0) + '</span>' +
          '<div><b>' + p.name + '</b><em>' + p.en + '</em></div>' +
          '<span class="tp-heat">' + p.heat.toFixed(1) + '</span>' +
        '</div>' +
        '<div class="td-plat-list">' + rows + '</div>' +
      '</div>';
    }).join('');
    tdBind($('#tdPlatGrid'));

    var d = new Date();
    $('#tdUpdated').textContent = '今日 · 更新于 ' + pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds()) + ' · 跨平台实时聚合';
    if (pgUpd) setTimeout(pgUpd, 60);   // 榜单重渲染后刷新滑轨箭头状态
  }

  /* 五平台 TOP10 滑轨：一屏放不下五个 → 横向滚动 + 左右翻页箭头 */
  var pgUpd = null;
  (function () {
    var grid = $('#tdPlatGrid'), prev = $('#pgPrev'), next = $('#pgNext');
    if (!grid || !prev || !next) return;
    function upd() {
      var max = grid.scrollWidth - grid.clientWidth - 2;
      prev.disabled = grid.scrollLeft <= 2;
      next.disabled = grid.scrollLeft >= max;
    }
    function page(dir) { grid.scrollBy({ left: dir * grid.clientWidth * 0.9, behavior: 'smooth' }); }
    prev.addEventListener('click', function () { page(-1); });
    next.addEventListener('click', function () { page(1); });
    grid.addEventListener('scroll', upd, { passive: true });
    window.addEventListener('resize', upd);
    pgUpd = upd;
    setTimeout(upd, 400);
  })();

  /* ================= AI 剪辑解构台 ================= */
  var azDrop = $('#azDrop'), azFile = $('#azFile'), azRun = $('#azRun'), azFileName = $('#azFileName'),
      azBarFill = $('#azBarFill'), azPhases = $$('#azPhases li'), azLog = $('#azLog'),
      azStart = $('#azStart'), azDemo = $('#azDemo'), azReset = $('#azReset'), azReport = $('#azReport');
  var jyLocked = $('#jyLocked'), jyCursor = $('#jyCursor'), jySpot = $('#jySpot'),
      jcNo = $('#jcNo'), jcTxt = $('#jcTxt'), jyFlow = $('#jyFlow'),
      jyFlowWrap = $('#jyFlowWrap'), jyAuto = $('#jyAuto'),
      azWide = $('#azWide'), shotList = $('#shotList');
  var azBusy = false, jyTimer = null, jyStepIdx = 0;

  /* 剪映动图教学步骤：位置为 stage 内百分比坐标；hi 为高亮目标元素 data-jy；
     ft/fd 为流程图节点标题/副标题。全部步骤仅使用剪映专业版免费功能 */
  var JY_STEPS = [
    { t: '点击左上角素材面板的【＋ 导入】，把原片拖入本地素材库（媒体面板为免费功能）', s: '＋ 导入素材到本地媒体库', x: 14, y: 24, hi: ['import', 'tab-media'], ft: '导入素材', fd: '媒体 · 本地' },
    { t: '把素材拖入底部【时间轴】主轨道，用工具条【✂ 分割】在镜头交界处切开，粗剪出与原片一致的镜头顺序', s: '拖入主轨 · ✂ 分割粗剪', x: 50, y: 88, hi: ['timeline', 'split'], ft: '粗剪分割', fd: '主轨 · 分割' },
    { t: '选中音频 → 点工具条【♪ 自动踩点】选「节拍 Ⅰ」，时间轴出现黄色鼓点标记，把每个镜头切点拖到鼓点严格对齐', s: '自动踩点 · 切点对齐鼓点', x: 63, y: 76, hi: ['beat'], ft: '自动踩点', fd: '节拍Ⅰ · 卡点' },
    { t: '在两段素材交界处点【转场】→ 分类「叠化」中选免费『叠化』或『闪白』，时长 0.4~0.6s，对准鼓点瞬间切出', s: '加免费转场：叠化 / 闪白', x: 24, y: 12, hi: ['tab-tr'], ft: '转场 · 叠化/闪白', fd: '转场面板 · 免费' },
    { t: '选中片段 → 右侧属性面板【变速】→「曲线变速」选免费预设『蒙太奇』，高潮段自动 0.4x → 1.8x 起伏', s: '曲线变速 · 蒙太奇', x: 86, y: 14, hi: ['p-speed', 'p-curve', 'cv-mont'], ft: '曲线变速', fd: '蒙太奇 · 免费' },
    { t: '在推近镜头起点与终点各打一个【◈ 关键帧】，缩放 100% → 112% 做缓推；再用【文本 → 花字】加免费花字标题', s: '关键帧缓推 ＋ 免费花字', x: 86, y: 46, hi: ['p-key', 'p-text'], ft: '关键帧＋花字', fd: '缩放 100→112%' },
    { t: '全部对齐后点右上角【导出】，保持默认参数即可导出成片 —— 全流程只用了剪映免费功能', s: '导出成片 · 全程免费', x: 88, y: 3.5, hi: ['export'], ft: '导出成片', fd: '默认参数' }
  ];

  function jyHighlight(keys) {
    $$('#jyStage [data-jy]').forEach(function (el) {
      el.classList.toggle('hi', keys.indexOf(el.dataset.jy) >= 0);
    });
  }
  function jyType(text, done) {
    jcTxt.textContent = ''; jcTxt.classList.remove('full');
    var i = 0;
    (function type() {
      if (jyTimer === null) return;
      jcTxt.textContent = text.slice(0, ++i);
      if (i < text.length) setTimeout(type, 22);
      else { jcTxt.classList.add('full'); done && done(); }
    })();
  }
  function jyShowStep(idx) {
    jyStepIdx = ((idx % JY_STEPS.length) + JY_STEPS.length) % JY_STEPS.length;
    var s = JY_STEPS[jyStepIdx];
    jcNo.textContent = 'STEP ' + pad(jyStepIdx + 1) + ' / ' + pad(JY_STEPS.length);
    jyCursor.style.left = s.x + '%'; jyCursor.style.top = s.y + '%';
    jySpot.style.left = s.x + '%'; jySpot.style.top = s.y + '%';
    jyHighlight(s.hi);
    jyType(s.t);
    var sub = $('#jsSub');
    if (sub) { sub.textContent = s.s || ''; sub.classList.add('on'); }
    $$('.jf-node', jyFlow).forEach(function (n, i) {
      n.classList.toggle('on', i === jyStepIdx);
      n.classList.toggle('done', i < jyStepIdx);
    });
  }
  function jyAutoUI(playing) {
    jyAuto.classList.toggle('on', playing);
    jyAuto.innerHTML = playing ? '<i>⏸</i>自动播放中' : '<i>▶</i>自动播放';
  }
  function jyPlayLoop() {
    jyStopLoop();
    jyTimer = 1; jyAutoUI(true);
    (function tick() {
      if (jyTimer === null) return;
      jyShowStep(jyStepIdx);
      jyTimer = setTimeout(function () { jyStepIdx = (jyStepIdx + 1) % JY_STEPS.length; tick(); }, 3600);
    })();
  }
  function jyStopLoop() {
    if (jyTimer && jyTimer !== 1) clearTimeout(jyTimer);
    jyTimer = null;
  }
  /* 流程图节点：点击查看即停止自动播放，用户可用「自动播放」按钮自行恢复 */
  function jfBuild() {
    jyFlow.innerHTML = JY_STEPS.map(function (s, i) {
      return '<button class="jf-node" data-i="' + i + '">' +
        '<span class="jf-no">STEP ' + pad(i + 1) + '</span>' +
        '<b>' + s.ft + '</b><span class="jf-d">' + s.fd + '</span></button>';
    }).join('');
    $$('.jf-node', jyFlow).forEach(function (n) {
      n.addEventListener('click', function () {
        if (jyFlowWrap.classList.contains('locked')) return;
        jyStopLoop(); jyAutoUI(false);
        jyShowStep(parseInt(n.dataset.i, 10));
      });
    });
  }
  jfBuild();
  jyAuto.addEventListener('click', function () {
    if (jyAuto.disabled) return;
    if (jyTimer !== null) { jyStopLoop(); jyAutoUI(false); }
    else { jyPlayLoop(); }
  });

  /* ================= 剪映工作台 · 素材自适应 + 点击真实反馈 ================= */
  var jyStage = $('#jyStage'), jyTrackList = $('#jyTrackList'), jyBeatLayer = $('#jyBeatLayer'),
      jyMarks = $('#jyMarks'), jyTracksBox = $('.jy-tracks', jyStage);

  /* 时间轴轨道随分镜/素材数量动态生成：素材越多，轨道行数越多、行高越大，工作台整体向上扩展，杜绝裁切
     每个素材片段写入真实时间码（data-st/data-et），主轨交界处插入可点选的转场标记 */
  var JY_FX = ['荧光线描', '星火', '录制边框', '复古DV', '闭幕'];
  var JY_STK = ['🔥', '✨', '😂', '💯', '👍'];
  var JY_TRANS = [{ n: '叠化', dur: '0.5s' }, { n: '闪白', dur: '0.4s' }, { n: '泛光', dur: '0.6s' }];
  function jyBuildTracks(cuts, beats) {
    cuts = Math.max(4, Math.min(20, Math.round(cuts || 6)));
    beats = Math.max(3, Math.min(12, Math.round(beats || 5)));
    var rows = [
      { k: 'main', l: '主视频', cls: '', n: cuts },
      { k: 'pip', l: '画中画', cls: 'pip', n: Math.max(1, Math.ceil(cuts / 3)) },
      { k: 'text', l: '文本', cls: 'text', n: Math.max(1, Math.ceil(cuts / 4)) },
      { k: 'sticker', l: '贴纸', cls: 'sticker', n: Math.max(1, Math.ceil(cuts / 4)) },
      { k: 'fx', l: '特效', cls: 'fx', n: Math.max(1, Math.ceil(cuts / 2)) },
      { k: 'audio', l: '音频', cls: 'audio', n: Math.max(1, cuts) }
    ];
    /* 素材越多 → 自动追加音效 / 字幕轨道，行高同步放大 */
    if (cuts >= 10) rows.push({ k: 'sfx', l: '音效', cls: 'audio', n: Math.max(1, Math.round(cuts / 2)) });
    if (cuts >= 14) rows.push({ k: 'sub', l: '字幕', cls: 'text', n: Math.max(1, Math.round(cuts / 3)) });
    var th = cuts >= 16 ? 20 : cuts >= 11 ? 17 : 14;
    jyStage.style.setProperty('--jytk-h', th + 'px');
    jyStage.style.setProperty('--jytl-h', (26 + 16 + rows.length * (th + 4) + 8) + 'px');
    var dur = jyClipDur();
    jyTrackList.innerHTML = rows.map(function (r) {
      var clips = '';
      for (var i = 0; i < r.n; i++) {
        var st = dur * i / r.n, et = dur * (i + 1) / r.n;
        var dt = r.k === 'text' ? ' data-t="花字' + (i + 1) + '"' : r.k === 'sub' ? ' data-t="字幕' + (i + 1) + '"' : r.k === 'fx' ? ' data-fx="' + JY_FX[i % JY_FX.length] + '"' : '';
        clips += '<span class="jy-clip" data-i="' + i + '" data-n="' + (i + 1) + '" data-st="' + st.toFixed(2) + '" data-et="' + et.toFixed(2) + '"' + dt + '></span>';
      }
      return '<div class="jy-track ' + r.cls + '" data-tk="' + r.k + '" data-l="' + r.l + '">' + clips + '</div>';
    }).join('');
    /* 主轨交界处插入转场标记（名称与分镜解构方案一致，均为剪映免费转场） */
    var mainRow = $('.jy-track[data-tk="main"]', jyTrackList);
    if (mainRow) {
      var plan = pickPlan() || [];
      var tnames = plan.map(function (s) { return s.trans; });
      for (var i = 0; i < cuts - 1; i++) {
        var tn = tnames.length ? tnames[i % tnames.length] : JY_TRANS[i % JY_TRANS.length];
        var sp = document.createElement('span');
        sp.className = 'jy-trans';
        sp.dataset.i = i; sp.dataset.n = tn.n; sp.dataset.dur = tn.dur;
        sp.dataset.et = (dur * (i + 1) / cuts).toFixed(2);
        sp.style.left = ((i + 1) * 100 / cuts).toFixed(2) + '%';
        mainRow.appendChild(sp);
      }
    }
    var bp = '';
    for (var b = 0; b < beats; b++) {
      bp += '<span class="jy-beat" style="left:' + (11 + b * (78 / (beats - 1))).toFixed(1) + '%"></span>';
    }
    jyBeatLayer.innerHTML = bp;
    var cap = $('.jy-pool-cap', jyStage);
    if (cap) cap.textContent = '本地素材 · ' + (5 + cuts) + ' 项 · 主轨 ' + cuts + ' 段';
    if (typeof jyTlClamp === 'function') jyTlClamp();
  }

  /* 每个可点击工作台元素 → 画面选区框 / 联动轨道 / 说明 */
  var JY_SEL = {
    'tab-media': { t: '已选中「媒体 · 本地」—— 这里是导入原片的入口，选中后监视器框出整体画面', track: 'main', box: [4, 4, 92, 92], label: '监视器 · 整体画面' },
    'tab-audio': { t: '已选中「音频」—— 画面底部框出 BGM / 音效对应的波形占位区', track: 'audio', box: [4, 80, 92, 15], label: '音频 · BGM 波形' },
    'tab-text': { t: '已选中「文本」—— 画面中的花字标题已被框出，预览已暂停以便核对位置', track: 'text', box: [13, 64, 74, 23], label: '文本 · 花字标题' },
    'tab-sticker': { t: '已选中「贴纸」—— 画面右上角贴纸元素已被框出', track: 'sticker', box: [66, 11, 26, 26], label: '贴纸 · 装饰元素' },
    'tab-fx': { t: '已选中「特效」—— 免费特效「荧光线描」作用于整幅画面', track: 'fx', box: [4, 4, 92, 92], label: '特效 · 荧光线描', free: true },
    'tab-tr': { t: '已选中「转场」—— 免费转场「叠化」作用于两段素材的交界处', box: [4, 38, 92, 20], label: '转场 · 叠化处', free: true },
    'tab-filter': { t: '已选中「滤镜」—— 免费风格化滤镜覆盖整幅画面', box: [4, 4, 92, 92], label: '滤镜 · 全画面' },
    'tab-adjust': { t: '已选中「调节」—— 亮度 / 对比度 / 饱和度作用于整幅画面', box: [4, 4, 92, 92], label: '调节 · 全画面' },
    'p-speed': { t: '已选中「常规变速」—— 2.0x 快放，与闪白切出严格同帧（免费功能）', box: [4, 4, 92, 92], label: '变速 · 全画面', free: true },
    'p-curve': { t: '已选中「曲线变速」—— 免费预设，可自定义速度曲线配合鼓点', box: [4, 4, 92, 92], label: '曲线变速 · 全画面', free: true },
    'cv-mont': { t: '已应用曲线变速预设「蒙太奇」—— 免费预设：卡点段提速、叙事段放慢', box: [4, 4, 92, 92], label: '预设 · 蒙太奇', free: true },
    'cv-hero': { t: '已应用曲线变速预设「英雄时刻」—— 免费预设：放大高光瞬间', box: [4, 4, 92, 92], label: '预设 · 英雄时刻', free: true },
    'cv-bull': { t: '已应用曲线变速预设「子弹时间」—— 免费预设：慢放强化冲击', box: [4, 4, 92, 92], label: '预设 · 子弹时间', free: true },
    'p-key': { t: '已选中「◈ 关键帧」—— 当前片段已打 2 个缩放关键帧，画面框出缩放变化范围', box: [12, 12, 76, 76], label: '关键帧 · 缩放范围' },
    'p-trans': { t: '已选中「转场 · 叠化」—— 免费转场作用于两段素材的交界处', box: [4, 38, 92, 20], label: '转场 · 叠化处', free: true },
    'p-text': { t: '已选中「文本 · 花字」—— 免费花字模板，画面中的标题已被框出，预览已暂停', track: 'text', box: [13, 64, 74, 23], label: '文本 · 花字标题' },
    'ratio': { t: '已选中画幅比例「原始 ▾」—— 可切换 16:9 / 9:16 / 1:1 等免费画幅', box: [4, 4, 92, 92], label: '画幅 · 原始比例' },
    'split': { t: '已选中工具栏「✂ 分割」—— 播放头位置即为分割点，点击可切开片段', track: 'main', box: [47.5, 4, 5, 92], label: '分割点' },
    'beat': { t: '已开启「♪ 自动踩点（节拍Ⅰ）」—— 时间轴上的黄色圆点即自动生成的鼓点（免费功能）', track: 'audio', free: true },
    'import': { t: '「＋ 导入」—— 把原片加入本地媒体库，是解构复刻的第一步（免费功能）' },
    'export': { t: '「导出」—— 全流程结束后按默认参数导出成片，无需任何付费项' },
    'play': { t: '播放 / 暂停监视器' }
  };
  var TRACK_SEL = {
    main: { t: '主视频轨道已选中 —— 画面整体即主轨原片', box: [4, 4, 92, 92], label: '主视频 · 原片' },
    pip: { t: '画中画轨道已选中 —— 画面右下角为叠加的画中画内容', box: [54, 54, 40, 36], label: '画中画' },
    text: { t: '文本轨道已选中 —— 画面中的花字标题已被框出，预览已暂停', box: [13, 64, 74, 23], label: '文本 · 花字标题' },
    sticker: { t: '贴纸轨道已选中 —— 画面中的贴纸元素已被框出', box: [66, 11, 26, 26], label: '贴纸' },
    fx: { t: '特效轨道已选中 —— 免费特效作用于整幅画面', box: [4, 4, 92, 92], label: '特效 · 免费', free: true },
    audio: { t: '音频轨道已选中 —— 底部为 BGM 与卡点波形', box: [4, 80, 92, 15], label: '音频' },
    sfx: { t: '音效轨道已选中 —— 音效素材与鼓点严格对齐（免费音效）', box: [4, 80, 92, 15], label: '音效 · 素材', free: true },
    sub: { t: '字幕轨道已选中 —— 画面中的字幕文本已被框出，预览已暂停', box: [13, 64, 74, 23], label: '字幕 · 文本' }
  };
  var TOOL_TIP = { '删除': '删除选中片段', '定格': '在播放头处生成 3 秒定格画面', '倒放': '片段倒序播放',
    '镜像': '画面水平镜像，常配合转场使用', '旋转': '每次旋转 90°', '裁剪': '裁剪画面比例至目标画幅' };

  function jyClearSel() {
    $$('.hi', jyStage).forEach(function (el) { el.classList.remove('hi'); });
    $$('.jy-track.sel', jyStage).forEach(function (el) { el.classList.remove('sel'); });
    $$('.jy-clip.sel', jyStage).forEach(function (el) { el.classList.remove('sel'); });
    if (jyTracksBox) jyTracksBox.classList.remove('hi');
    if (jyMarks) jyMarks.innerHTML = '';
    var pw = $('#jyPaused'); if (pw) pw.remove();
    var sub = $('#jsSub'); if (sub) sub.classList.remove('on');
  }
  function jyPauseUI(paused) {
    var cur = $('#jyPaused');
    if (paused) {
      if (!cur) {
        var b = document.createElement('span');
        b.className = 'jy-paused'; b.id = 'jyPaused'; b.textContent = '⏸ 已暂停';
        ($('.jy-vframe', jyStage) || $('.jy-screen', jyStage)).appendChild(b);
      }
    } else if (cur) { cur.remove(); }
  }
  function jyDoPause() { if (jyPrev) { try { jyPrev.pause(); } catch (e) {} } jyPauseUI(true); }
  function jyDoPlay() {
    if (jyPrev && jyPrev.getAttribute('src')) { var p = jyPrev.play(); if (p && p.catch) p.catch(function () {}); }
    jyPauseUI(false);
  }
  function jyDrawBox(box, label, free) {
    if (!jyMarks) return;
    jyMarks.innerHTML = '';
    if (!box) return;
    var d = document.createElement('span');
    d.className = 'jy-box' + (free ? ' free' : '');
    d.style.left = box[0] + '%'; d.style.top = box[1] + '%';
    d.style.width = box[2] + '%'; d.style.height = box[3] + '%';
    d.innerHTML = '<i>' + label + ' · ' + (free ? '免费功能' : '已选中') + '</i>';
    jyMarks.appendChild(d);
  }
  function jySelectTrack(key) {
    $$('.jy-track', jyStage).forEach(function (tr) { tr.classList.toggle('sel', tr.dataset.tk === key); });
    if (jyTracksBox) {
      jyTracksBox.classList.add('hi');
      setTimeout(function () { jyTracksBox.classList.remove('hi'); }, 900);
    }
  }
  function jySay(text) { jcNo.textContent = '工作台'; jcTxt.textContent = text; jcTxt.classList.add('full'); }
  /* 素材点选联动：监视器定位 + 覆盖层 + 定位到素材时间码 */
  function jyOverlay(txt) { var sub = $('#jsSub'); if (sub) { sub.textContent = txt; sub.classList.add('on'); } }
  function fmtT(t) { t = Math.max(0, t || 0); return pad(Math.floor(t / 60)) + ':' + pad(Math.floor(t % 60)) + '.' + Math.floor((t % 1) * 10); }
  function jyClipDur() { return (jyPrev && jyPrev.getAttribute('src') && isFinite(jyPrev.duration) && jyPrev.duration > 0) ? jyPrev.duration : 15; }
  function jySeekTo(t) {
    if (jyPrev && jyPrev.getAttribute('src') && isFinite(jyPrev.duration) && jyPrev.duration > 0) {
      try { jyPrev.currentTime = Math.min(Math.max(0, t), Math.max(0, jyPrev.duration - 0.05)); } catch (e) {}
    }
    jyDoPause();
  }
  function jySelectClip(el) {
    el.classList.add('sel');
    if (el.classList.contains('jy-trans')) {          // 素材交界处的免费转场标记
      var tn = { n: el.dataset.n || '叠化', dur: el.dataset.dur || '0.5s' };
      var bt = +el.dataset.et || 0;
      jySeekTo(Math.max(0, bt - 0.1));
      jyDrawBox([4, 38, 92, 20], '转场 · ' + tn.n, true);
      jySay('已选中转场「' + tn.n + '」（免费）· 时长 ' + tn.dur + ' · 监视器已定位至转场帧 ' + fmtT(bt) + ' —— 转场作用于前后两段素材的交界处');
      return;
    }
    var tr = el.closest('.jy-track'); var tk = tr ? tr.dataset.tk : 'main';
    var i = +el.dataset.i || 0, st = +el.dataset.st || 0, et = +el.dataset.et || 0, n = +el.dataset.n || 1;
    var rng = fmtT(st) + ' – ' + fmtT(et);
    if (tk === 'main') {
      jySeekTo(st);
      jyDrawBox([4, 4, 92, 92], '素材 ' + n + ' · ' + rng, false);
      jySay('已选中主轨素材 ' + n + '（' + rng + '）· 时间码与原片一一对应，监视器已定位至素材起点 ' + fmtT(st) + ' 并暂停，可逐帧核对剪辑点');
    } else if (tk === 'text' || tk === 'sub') {
      var tt = el.dataset.t || ('文本 ' + n);
      jySeekTo(st); jyOverlay('「' + tt + '」');
      jyDrawBox([13, 64, 74, 23], (tk === 'sub' ? '字幕' : '文本') + ' · ' + tt, true);
      jySay('已选中' + (tk === 'sub' ? '字幕' : '花字文本') + '「' + tt + '」（免费模板）· ' + rng + ' · 画面中对应文本已框出，预览已暂停');
    } else if (tk === 'sticker') {
      var sk = JY_STK[i % JY_STK.length];
      jySeekTo(st); jyOverlay(sk);
      jyDrawBox([66, 11, 26, 26], '贴纸 · ' + sk, true);
      jySay('已选中贴纸素材「' + sk + '」（免费贴纸库）· ' + rng + ' · 画面右上角对应贴纸已框出');
    } else if (tk === 'fx') {
      var fx = el.dataset.fx || JY_FX[i % JY_FX.length];
      jySeekTo(st);
      jyDrawBox([4, 4, 92, 92], '特效 · ' + fx, true);
      jySay('已选中特效「' + fx + '」（免费 · 路径：特效 → 氛围 → ' + fx + '）· ' + rng + ' · 免费特效作用于整幅画面');
    } else if (tk === 'pip') {
      jySeekTo(st);
      jyDrawBox([54, 54, 40, 36], '画中画 · 素材 ' + n, false);
      jySay('已选中画中画素材 ' + n + '（' + rng + '）· 画面右下角的叠加内容已框出');
    } else {
      jySeekTo(st);
      jyDrawBox([4, 80, 92, 15], tk === 'sfx' ? '音效 · 素材 ' + n : '音频 · BGM', true);
      jySay('已选中' + (tk === 'sfx' ? '音效素材 ' + n : '音频轨 BGM') + '（免费音效）· ' + rng + ' · 波形与黄色鼓点严格对齐');
    }
  }
  /* 分镜方案：时间轴转场标记与分镜报告共用同一套数据（curPlan 为空时随机抽取） */
  var curPlan = null;
  function pickPlan() {
    if (!curPlan && typeof SHOT_PLANS !== 'undefined' && SHOT_PLANS) curPlan = SHOT_PLANS[Math.floor(Math.random() * SHOT_PLANS.length)];
    return curPlan;
  }
  function parseT(s) { var m = (s || '0:00').trim().split(':'); return (+m[0]) * 60 + (+m[1] || 0); }

  jyStage.addEventListener('click', function (e) {
    var el = e.target.closest('[data-jy],[data-tk],.jy-clip,.jy-trans,.jy-tb,.jy-thumb,.jy-cv,.jy-cbtn,.jy-rtabs span,.jy-lsub span');
    if (!el || !jyStage.contains(el)) return;
    var key = el.dataset.jy;
    if (key === 'preview' || key === 'timeline') return;   // 容器命中忽略
    if (jyTlDragged()) return;                             // 刚拖完时间轴画布 → 忽略本次误触

    jyStopLoop(); jyAutoUI(false);            // 用户手动点击 → 停止自动播放

    // 播放按钮：切换播放 / 暂停
    if (key === 'play') {
      if (jyPrev && !jyPrev.paused) { jyDoPause(); jySay('已暂停预览 —— 点击 ▶ 继续播放'); }
      else { jyDoPlay(); jySay('正在播放预览画面'); }
      return;
    }

    jyClearSel();
    jyDoPause();                               // 点击任意工作台元素 → 预览暂停

    if (el.classList.contains('jy-clip') || el.classList.contains('jy-trans')) {
      jySelectClip(el);                        // 素材 / 文字 / 特效 / 转场点选 → 监视器定位对应时间码
      return;
    }

    var def = el.dataset.tk ? TRACK_SEL[el.dataset.tk] : JY_SEL[key];
    if (!def) {
      var pEl = el.parentElement;
      if (el.classList.contains('jy-tb')) {
        var name = el.textContent.trim();
        def = { t: '工具栏「' + name + '」· ' + (TOOL_TIP[name] || '基础编辑操作') + '（免费功能）', track: 'main' };
        el.classList.add('hi');
      } else if (el.classList.contains('jy-thumb')) {
        var nm = el.dataset.n || '素材';
        def = { t: '已选中素材「' + nm + '」· 可拖入主轨参与剪辑', track: 'main' };
        el.classList.add('hi');
      } else if (el.classList.contains('jy-cv')) {
        def = { t: '已应用曲线变速预设「' + el.textContent.trim() + '」（免费预设）', box: [4, 4, 92, 92], label: '曲线预设 · ' + el.textContent.trim(), free: true };
      } else if (el.classList.contains('jy-cbtn')) {
        var cn = el.textContent.trim();
        def = { t: '监视器控件「' + cn + '」· ' + (cn === '⏮' ? '回到上一关键帧' : cn === '⏭' ? '跳到下一关键帧' : '全屏预览') + '（免费功能）', box: [4, 4, 92, 92], label: '监视器 · 显示区' };
      } else if (pEl && pEl.classList.contains('jy-rtabs')) {
        def = { t: '已切换到右栏「' + el.textContent.trim() + '」面板（免费功能）', box: [4, 4, 92, 92], label: el.textContent.trim() };
      } else if (pEl && pEl.classList.contains('jy-lsub')) {
        def = { t: '已切换到素材库分类「' + el.textContent.trim() + '」（免费）', box: [4, 4, 92, 92], label: '素材库 · ' + el.textContent.trim(), free: true };
      } else { return; }
    }

    // 面板标签联动 .on 状态
    if (el.parentElement && el.parentElement.classList.contains('jy-ltabs')) {
      $$('.jy-ltabs span', jyStage).forEach(function (s) { s.classList.toggle('on', s === el); });
    }
    if (el.parentElement && el.parentElement.classList.contains('jy-rtabs')) {
      $$('.jy-rtabs span', jyStage).forEach(function (s) { s.classList.toggle('on', s === el); });
    }
    if (el.parentElement && el.parentElement.classList.contains('jy-rmode')) {
      $$('.jy-rmode span', jyStage).forEach(function (s) { s.classList.toggle('on', s === el); });
    }
    if (el.classList.contains('jy-cv')) {
      $$('.jy-cv', jyStage).forEach(function (s) { s.classList.toggle('on', s === el); });
    }

    if (!el.classList.contains('jy-track')) el.classList.add('hi');
    else jySelectTrack(el.dataset.tk);
    if (def.track) jySelectTrack(def.track);
    jyDrawBox(def.box, def.label || '', def.free);
    jySay(def.t);
  });

  jyBuildTracks(6, 5);   // 初始时间轴（未导入素材时的占位结构）

  /* ---- 时间轴画布：按住随意拖动平移 + 缩放（联动 --jy-zoomw），拖动结束不误触点选 ---- */
  var jyTlVp = jyTracksBox, jyTlInner = $('#jyTlInner');
  var jyPan = 0, jyZoom = 1.72, jyTlMoved = false, jyDrag = null;
  function jyTlMaxPan() { return Math.max(0, (jyTlVp ? jyTlVp.clientWidth : 0) * (jyZoom - 1)); }
  function jyTlApply() { if (jyTlInner) jyTlInner.style.transform = 'translateX(' + (-jyPan) + 'px)'; }
  function jyTlClamp() { jyPan = Math.min(Math.max(0, jyPan), jyTlMaxPan()); jyTlApply(); }
  function jyTlZoomTo(z) {
    jyZoom = Math.min(4.5, Math.max(1, z));
    if (jyTlVp) jyTlVp.style.setProperty('--jy-zoomw', (jyZoom * 100).toFixed(1) + '%');
    jyTlClamp();
  }
  function jyTlDragged() { return jyTlMoved; }
  if (jyTlVp) {
    jyTlVp.addEventListener('pointerdown', function (e) {
      if (e.button !== 0) return;
      jyDrag = { x: e.clientX, pan: jyPan };
      jyTlMoved = false;
      jyTlVp.classList.add('grabbing');
      try { jyTlVp.setPointerCapture(e.pointerId); } catch (err) {}
    });
    jyTlVp.addEventListener('pointermove', function (e) {
      if (!jyDrag) return;
      var dx = e.clientX - jyDrag.x;
      if (Math.abs(dx) > 5) jyTlMoved = true;
      jyPan = Math.min(Math.max(0, jyDrag.pan - dx), jyTlMaxPan());
      jyTlApply();
    });
    ['pointerup', 'pointercancel'].forEach(function (ev) {
      jyTlVp.addEventListener(ev, function () {
        if (!jyDrag) return;
        jyDrag = null; jyTlVp.classList.remove('grabbing');
        if (jyTlMoved) setTimeout(function () { jyTlMoved = false; }, 0);   // 仅拦截拖动结束的当次 click，随后自动恢复
      });
    });
  }
  (function () {
    var zin = $('#jyZin'), zout = $('#jyZout'), zfit = $('#jyZfit');
    if (zin) zin.addEventListener('click', function (e) { e.stopPropagation(); jyTlZoomTo(jyZoom * 1.35); });
    if (zout) zout.addEventListener('click', function (e) { e.stopPropagation(); jyTlZoomTo(jyZoom / 1.35); });
    if (zfit) zfit.addEventListener('click', function (e) { e.stopPropagation(); jyPan = 0; jyTlZoomTo(1); });
  })();
  window.addEventListener('resize', jyTlClamp);

  /* ================= 分镜级解构报告（转场/特效均为剪映专业版免费功能真实名称） ================= */
  var SHOT_PLANS = [
    [ /* 高燃卡点型 */
      { range: '00:00.0 – 00:02.4', name: '开场钩子', shot: '特写 · 手持急推镜', role: '情感',
        why: '特写 + 急推在 3 秒内砸出视觉锤，把核心悬念直接怼到观众眼前，留住完播',
        trans: { n: '闪白', path: '转场 → 叠化 → 闪白', dur: '0.3s' }, fx: { n: '荧光线描', path: '特效 → 氛围 → 荧光线描' },
        beat: '音频 → 踩点 → 自动踩点（节拍Ⅰ）生成黄色鼓点；第 1 个鼓点与画面爆出瞬间严格同帧',
        key: '第 0 帧打缩放关键帧 100%，第 12 帧打 118%，两帧之间自动补间成急促推近',
        speed: '常规变速 1.3x 快放，与闪白切出同帧结束' },
      { range: '00:02.4 – 00:05.0', name: '主体亮相', shot: '中景 · 横向移镜', role: '衔接',
        why: '承接钩子的情绪高点，横向移动把视线从悬念引到主体画面，完成空间转换',
        trans: { n: '叠化', path: '转场 → 叠化 → 叠化', dur: '0.5s' }, fx: { n: '星火', path: '特效 → 氛围 → 星火' },
        beat: '鼓点落在横向位移的终点帧，切点对准第 2 个鼓点',
        key: '位置关键帧：起点 X 偏移 -8%，终点归零，手动打 2 帧即可',
        speed: '曲线变速「英雄时刻」：亮相瞬间压到 0.5x，0.4s 后拉回 1.0x' },
      { range: '00:05.0 – 00:08.2', name: '高光连击', shot: '近景 · 手持快切三连', role: '情感',
        why: '3 段快切堆叠爽感，每段只保留击中最痛的 8 帧，情绪密度拉满',
        trans: { n: '闪黑', path: '转场 → 叠化 → 闪黑', dur: '0.2s' }, fx: { n: '录制边框', path: '特效 → 复古 → 录制边框' },
        beat: '三连切分别对准连续 3 个鼓点，形成「咚-咚-咚」的打点节奏',
        key: '每段首帧缩放 106%，末帧 100%，切出前归零避免跳帧感',
        speed: '曲线变速「蒙太奇」：每次命中瞬间 0.4x 定格 0.2s 再弹回 1.6x' },
      { range: '00:08.2 – 00:11.6', name: '情绪缓冲', shot: '全景 · 固定机位慢摇', role: '衔接',
        why: '高潮后给 1.5 秒喘息，慢摇镜头把情绪从竞技切到人物反应，为收尾蓄势',
        trans: { n: '泛光', path: '转场 → 光效 → 泛光', dur: '0.6s' }, fx: { n: '复古DV', path: '特效 → 复古 → 复古DV' },
        beat: '此段避开密集鼓点，压在底鼓长音上，速度放缓',
        key: '旋转关键帧 -1.2° → 0°，配合缩放 100% → 104%，做极轻微呼吸感',
        speed: '常规变速 0.8x 慢放' },
      { range: '00:11.6 – 00:15.0', name: '定格收尾', shot: '特写 · 升降格定格', role: '情感',
        why: '定格 + 花字落版，给观众截图传播的记忆点',
        trans: { n: '叠化', path: '转场 → 叠化 → 叠化', dur: '0.8s 长尾' }, fx: { n: '闭幕', path: '特效 → 基础 → 闭幕' },
        beat: '最后一个重鼓点 = 定格帧 + 花字弹出同帧，之后 BGM 自然衰减',
        key: '花字缩放 60% → 100% 弹入（2 帧），定格画面保持不动',
        speed: '曲线变速「子弹时间」：命中瞬间 0.2x 急停后完全定格' }
    ],
    [ /* 情感叙事型 */
      { range: '00:00.0 – 00:03.0', name: '悬念开场', shot: '大远景 · 缓推', role: '情感',
        why: '虚焦画面缓推亮起，把「这是什么」的悬念留给观众，钩住前 3 秒',
        trans: { n: '叠化', path: '转场 → 叠化 → 叠化', dur: '1.0s' }, fx: { n: '复古DV', path: '特效 → 复古 → 复古DV' },
        beat: '钢琴第一个重音与画面亮起同帧；踩点选「节拍Ⅱ」疏模式，避免过密',
        key: '缩放 100% → 108% 全程缓推，首末 2 个关键帧即可',
        speed: '常规变速 0.9x，保持叙事呼吸感' },
      { range: '00:03.0 – 00:06.0', name: '时光闪回', shot: '中景 · 横移扫描', role: '衔接',
        why: '素材横移扫过，把观众从悬念带进回忆段落，完成时空过渡',
        trans: { n: '色彩溶解', path: '转场 → 叠化 → 色彩溶解', dur: '0.8s' }, fx: { n: '星火', path: '特效 → 氛围 → 星火' },
        beat: '旋律句读处切换，每 2 个鼓点切一个画面',
        key: '位置关键帧从左到右移动 6%，模拟扫描仪匀速运动',
        speed: '常规变速 1.0x 原速，保持扫描稳定' },
      { range: '00:06.0 – 00:09.0', name: '揭晓瞬间', shot: '特写 · 前后对比硬切', role: '情感',
        why: '前后对比在重拍点揭晓，制造全片情绪峰值（泪点/爽点）',
        trans: { n: '闪白', path: '转场 → 叠化 → 闪白', dur: '0.4s' }, fx: { n: '荧光线描', path: '特效 → 氛围 → 荧光线描' },
        beat: '揭晓帧卡在全曲最强鼓点，切点前 0.1s 把音量拉低蓄势再爆发',
        key: '缩放 100% → 115% 急推 + 不透明度 2 帧淡入',
        speed: '曲线变速「英雄时刻」：揭晓瞬间 0.4x 慢放' },
      { range: '00:09.0 – 00:12.0', name: '情绪延展', shot: '近景 · 环绕运镜', role: '衔接',
        why: '峰值后不接硬切，用环绕镜头让情绪缓缓落地，避免戛然而止',
        trans: { n: '叠化', path: '转场 → 叠化 → 叠化', dur: '0.6s' }, fx: { n: '复古DV', path: '特效 → 复古 → 复古DV' },
        beat: '鼓点密度减半，切点放宽到每 4 拍一次',
        key: '缩放 105% 恒定，只打旋转 -1° → 1° 的呼吸帧',
        speed: '常规变速 0.85x' },
      { range: '00:12.0 – 00:15.0', name: '落版收尾', shot: '特写 · 渐隐定格', role: '情感',
        why: '花字寄语 + 渐隐落版，引导评论区互动与二创',
        trans: { n: '水墨', path: '转场 → 自然 → 水墨', dur: '1.0s' }, fx: { n: '闭幕', path: '特效 → 基础 → 闭幕' },
        beat: '尾音衰减起点 = 渐隐起点，声音与画面一起收',
        key: '不透明度 100% → 0% 末段 2 帧；花字自 80% 放大弹入',
        speed: '曲线变速「蒙太奇」尾段自然降速至定格' }
    ],
    [ /* 节奏混剪通用型 */
      { range: '00:00.0 – 00:02.0', name: '强节奏入场', shot: '特写 · 甩镜入场', role: '情感',
        why: '甩镜与鼓点同步入场，第一秒就立住节奏人设',
        trans: { n: '闪黑', path: '转场 → 叠化 → 闪黑', dur: '0.2s' }, fx: { n: '荧光线描', path: '特效 → 氛围 → 荧光线描' },
        beat: '自动踩点（节拍Ⅰ），入场帧 = 第 1 个鼓点',
        key: '位置 X -30% → 0，两帧甩入',
        speed: '常规变速 1.2x' },
      { range: '00:02.0 – 00:05.5', name: '素材串联', shot: '中景 · 跳切组接', role: '衔接',
        why: '同动作跳切压缩时间，把散乱素材拧成一股节奏',
        trans: { n: '推近', path: '转场 → 运镜 → 推近', dur: '0.4s' }, fx: { n: '星火', path: '特效 → 氛围 → 星火' },
        beat: '每个跳切点都压在鼓点上，形成「动作 = 打点」的体感',
        key: '每段首帧缩放 104%，末帧回到 100%',
        speed: '曲线变速「蒙太奇」自动起伏' },
      { range: '00:05.5 – 00:08.5', name: '高潮变速', shot: '近景 · 急停急起', role: '情感',
        why: '0.3x → 2.0x 的速度落差制造爽点峰值',
        trans: { n: '闪白', path: '转场 → 叠化 → 闪白', dur: '0.3s' }, fx: { n: '录制边框', path: '特效 → 复古 → 录制边框' },
        beat: '最强鼓点 = 速度最低点，视听双重重击',
        key: '缩放 100% → 112% 随速度曲线同步推近',
        speed: '曲线变速「子弹时间」：0.3x 急停后拉到 2.0x' },
      { range: '00:08.5 – 00:12.0', name: '节奏回落', shot: '全景 · 固定长镜', role: '衔接',
        why: '长镜头给观众喘息，为下一波高潮铺垫',
        trans: { n: '渐变擦除', path: '转场 → 擦除 → 渐变擦除', dur: '0.6s' }, fx: { n: '复古DV', path: '特效 → 复古 → 复古DV' },
        beat: '切换为每 2 拍一切，密度减半',
        key: '无运动帧，仅 100% 定帧即可',
        speed: '常规变速 1.0x' },
      { range: '00:12.0 – 00:15.0', name: '定格落版', shot: '特写 · 定格 + 花字', role: '情感',
        why: '定格帧留给花字标题，承担传播记忆点',
        trans: { n: '叠化', path: '转场 → 叠化 → 叠化', dur: '0.8s' }, fx: { n: '闭幕', path: '特效 → 基础 → 闭幕' },
        beat: '尾鼓点定格，BGM 衰减对齐渐隐',
        key: '花字缩放 70% → 100% 弹入（2 帧）',
        speed: '曲线变速「英雄时刻」收尾' }
    ]
  ];
  function renderShots() {
    var plan = pickPlan() || [];
    function kv(k, v, wide) { return '<div class="sh-kv' + (wide ? ' wide' : '') + '"><span>' + k + '</span><p>' + v + '</p></div>'; }
    shotList.innerHTML = plan.map(function (sh, i) {
      return '<article class="shot" data-si="' + i + '" style="animation-delay:' + (i * 0.08).toFixed(2) + 's">' +
        '<figure class="sh-fig" title="点击在监视器回看该镜头">' +
          '<div class="sf-box"><img alt="镜头 ' + (i + 1) + ' 帧" hidden><span class="sf-ph">FRAME…</span></div>' +
          '<figcaption>' + esc(sh.range.split('–')[0].trim()) + ' · 点击回看</figcaption>' +
        '</figure>' +
        '<div class="sh-main">' +
          '<header><span class="sh-no">SHOT ' + pad(i + 1) + '</span>' +
          '<span class="sh-range">' + sh.range + '</span>' +
          '<b class="sh-name">' + sh.name + '</b>' +
          '<span class="sh-role ' + (sh.role === '衔接' ? 'r-trans' : 'r-emo') + '">' + sh.role + '镜头</span></header>' +
          '<div class="sh-grid">' +
            kv('镜头语言', '<b>' + sh.shot + '</b>') +
            kv('镜头作用 · 为什么这样剪', sh.why) +
            kv('转场 · 剪映免费', '「<b>' + sh.trans.n + '</b>」 · ' + sh.trans.path + ' · 时长 ' + sh.trans.dur) +
            kv('特效 · 剪映免费', '「<b>' + sh.fx.n + '</b>」 · ' + sh.fx.path) +
            kv('音乐卡点', sh.beat) +
            kv('关键帧', sh.key) +
            kv('变速', sh.speed, 1) +
          '</div>' +
        '</div></article>';
    }).join('');
    captureFrames(plan);
  }
  /* 分镜帧图：真实导入视频时按分镜起点逐帧抓取；演示样片无真实画面时输出程序化 DEMO 帧 */
  function demoShotFrame(sh, i) {
    var c = document.createElement('canvas'); c.width = 320; c.height = 180;
    var g = c.getContext('2d');
    var grad = g.createLinearGradient(0, 0, 320, 180);
    grad.addColorStop(0, ['#101a33', '#1a1440', '#0a1626'][i % 3]);
    grad.addColorStop(1, '#071018');
    g.fillStyle = grad; g.fillRect(0, 0, 320, 180);
    g.strokeStyle = 'rgba(34,211,238,.18)'; g.lineWidth = 1;
    for (var y = 12; y < 180; y += 18) { g.beginPath(); g.moveTo(0, y); g.lineTo(320, y); g.stroke(); }
    g.fillStyle = 'rgba(126,243,255,.92)'; g.font = '700 21px Consolas, monospace';
    g.fillText('SHOT ' + pad(i + 1), 18, 46);
    g.fillStyle = 'rgba(255,255,255,.85)'; g.font = '13px Consolas, monospace';
    g.fillText(((sh && sh.name) || '') + ' · ' + ((sh && sh.shot) || ''), 18, 80);
    g.fillStyle = 'rgba(255,255,255,.5)'; g.font = '12px Consolas, monospace';
    g.fillText(((sh && sh.range) || '') + ' · DEMO FRAME', 18, 106);
    g.strokeStyle = 'rgba(5,217,232,.55)'; g.lineWidth = 2; g.strokeRect(6, 6, 308, 168);
    return c.toDataURL('image/jpeg', 0.85);
  }
  function captureFrames(plan) {
    var figs = $$('.sh-fig', shotList);
    function fill(i, src, demo) {
      var fig = figs[i]; if (!fig) return;
      var img = $('img', fig), ph = $('.sf-ph', fig), cap = $('figcaption', fig);
      if (img) { img.src = src; img.hidden = false; }
      if (ph) ph.hidden = true;
      if (cap && demo) cap.textContent = 'DEMO 帧 · 点击回看';
    }
    var hasReal = jyPrev && jyPrev.getAttribute('src') && isFinite(jyPrev.duration) && jyPrev.duration > 0;
    if (!hasReal || !plan.length) {
      plan.forEach(function (sh, i) { fill(i, demoShotFrame(sh, i), true); });
      return;
    }
    var dur = jyPrev.duration, c = document.createElement('canvas');
    c.width = 320; c.height = 180;
    var g = c.getContext('2d');
    var wasPaused = jyPrev.paused;
    try { jyPrev.pause(); } catch (e) {}
    var i = 0;
    (function next() {
      if (i >= plan.length) { if (!wasPaused) { var pp = jyPrev.play(); if (pp && pp.catch) pp.catch(function () {}); } return; }
      var t = Math.min(parseT(plan[i].range.split('–')[0]) + 0.15, Math.max(0, dur - 0.05));
      var fired = false;
      var done = function () {
        if (fired) return; fired = true;
        var ok = false;
        try { g.drawImage(jyPrev, 0, 0, c.width, c.height); fill(i, c.toDataURL('image/jpeg', 0.82), false); ok = true; } catch (e) {}
        if (!ok) fill(i, demoShotFrame(plan[i], i), true);
        i++; setTimeout(next, 70);
      };
      var to = setTimeout(done, 900);
      var onSeeked = function () { jyPrev.removeEventListener('seeked', onSeeked); clearTimeout(to); done(); };
      jyPrev.addEventListener('seeked', onSeeked);
      try { jyPrev.currentTime = t; } catch (e) {
        jyPrev.removeEventListener('seeked', onSeeked); clearTimeout(to);
        fill(i, demoShotFrame(plan[i], i), true); i++; setTimeout(next, 10);
      }
    })();
  }
  /* 点击报告中的镜头帧 → 监视器定位回看 */
  shotList.addEventListener('click', function (e) {
    var art = e.target.closest('.shot'); if (!art) return;
    var sh = (pickPlan() || [])[+art.dataset.si || 0]; if (!sh) return;
    var st = sh.range.split('–')[0].trim();
    jySeekTo(parseT(st));
    jySay('已回看镜头「' + sh.name + '」· 监视器定位至 ' + st + ' —— 预览已暂停，可在时间轴点击对应素材段逐帧核对');
  });

  function azLogPush(line) {
    azLog.textContent += '\n' + line;
    azLog.scrollTop = azLog.scrollHeight;
  }
  function azSetPhases(p) {
    azPhases.forEach(function (li, i) {
      var st = $('.st', li);
      li.classList.toggle('done', i < p); li.classList.toggle('on', i === p);
      st.textContent = i < p ? 'DONE' : (i === p ? 'RUN…' : 'IDLE');
    });
  }
  /* ---- 视频封面抽帧 & 剪映实时渲染 ---- */
  var dropIdle = $('#dropIdle'), dropPrev = $('#dropPrev'), dropCover = $('#dropCover'),
      dpName = $('#dpName'), dpInfo = $('#dpInfo'),
      jyPrev = $('#jyPrev'), jyThumbVid = $('#jyThumbVid'), jyThumbDur = $('#jyThumbDur'),
      jsHint = $('#jsHint'), jyTc = $('#jyTc');
  var curObjUrl = null;

  function fmtDur(sec) {
    if (!isFinite(sec) || sec < 0) sec = 0;
    var m = Math.floor(sec / 60), s = Math.floor(sec % 60);
    return pad(m) + ':' + pad(s);
  }
  function grabCover(url, cb) {
    var v = document.createElement('video');
    v.preload = 'metadata'; v.muted = true; v.playsInline = true; v.src = url;
    var done = false;
    function finish(data) { if (done) return; done = true; cb(data, v); }
    v.addEventListener('loadeddata', function () {
      try { v.currentTime = Math.min(0.1, (v.duration || 1) * 0.05); }
      catch (e) { finish(null); }
    });
    v.addEventListener('seeked', function () {
      try {
        var c = document.createElement('canvas');
        c.width = v.videoWidth || 640; c.height = v.videoHeight || 360;
        c.getContext('2d').drawImage(v, 0, 0, c.width, c.height);
        finish(c.toDataURL('image/jpeg', 0.82));
      } catch (e) { finish(null); }
    });
    v.addEventListener('error', function () { finish(null); });
    setTimeout(function () { finish(null); }, 4500);
  }
  function demoCover(name) {
    var c = document.createElement('canvas'); c.width = 640; c.height = 280;
    var g = c.getContext('2d');
    var grad = g.createLinearGradient(0, 0, 640, 280);
    grad.addColorStop(0, '#101a33'); grad.addColorStop(.55, '#1a1440'); grad.addColorStop(1, '#071018');
    g.fillStyle = grad; g.fillRect(0, 0, 640, 280);
    g.strokeStyle = 'rgba(34,211,238,.35)'; g.lineWidth = 1;
    for (var i = -280; i < 640; i += 44) { g.beginPath(); g.moveTo(i, 280); g.lineTo(i + 280, 0); g.stroke(); }
    g.fillStyle = 'rgba(126,243,255,.95)'; g.font = '700 26px Consolas, monospace';
    g.fillText('DEMO FRAME', 36, 140);
    g.fillStyle = 'rgba(255,255,255,.55)'; g.font = '15px Consolas, monospace';
    g.fillText(name.slice(0, 34), 36, 176);
    return c.toDataURL('image/jpeg', 0.85);
  }
  function showCover(src, name, info) {
    dropCover.src = src; dpName.textContent = name; dpInfo.textContent = info;
    dropIdle.hidden = true; dropPrev.hidden = false;
  }
  function wireJyVideo(url) {
    [jyPrev, jyThumbVid].forEach(function (v) {
      if (!v) return;
      v.src = url; v.currentTime = 0;
      var p = v.play(); if (p && p.catch) p.catch(function () {});
    });
    if (jsHint) jsHint.style.display = 'none';
    if (jyTc && !jyTc._bound) {
      jyTc._bound = true;
      if (jyPrev) jyPrev.addEventListener('timeupdate', function () {
        var t = jyPrev.currentTime || 0, f = Math.floor((t % 1) * 30);
        jyTc.textContent = '00:' + pad(Math.floor(t / 60)) + ':' + pad(Math.floor(t % 60)) + ':' + pad(f);
      });
    }
  }
  function clearJyVideo() {
    [jyPrev, jyThumbVid].forEach(function (v) { if (v) { try { v.pause(); } catch (e) {} v.removeAttribute('src'); v.removeAttribute('poster'); v.load && v.load(); } });
    if (jsHint) jsHint.style.display = '';
    if (jyTc) jyTc.textContent = '00:00:00:00';
  }

  function azLoad(name, file) {
    azRun.hidden = false; azReset.hidden = false; azReset.disabled = false;
    azFileName.innerHTML = '<i>▸</i> ' + esc(name);
    azStart.disabled = false;
    azLog.textContent = '$ load :: ' + esc(name) + ' — 就绪，点击「开始解构」';
    azBarFill.style.width = '0%'; azSetPhases(-1);
    azReport.hidden = true;
    jyStopLoop(); jyAutoUI(false); jyAuto.disabled = true;
    jyFlowWrap.classList.add('locked');
    $$('.jf-node', jyFlow).forEach(function (n) { n.classList.remove('on', 'done'); });
    jyClearSel();
    jyBuildTracks(6, 5);        // 预览阶段先复位成占位时间轴
    jyHighlight([]);
    azWide.hidden = true; shotList.innerHTML = '';
    jcNo.textContent = 'STEP 01'; jcTxt.textContent = '等待解构完成…'; jcTxt.classList.add('full');

    if (curObjUrl) { try { URL.revokeObjectURL(curObjUrl); } catch (e) {} curObjUrl = null; }
    clearJyVideo();

    if (file && window.URL && URL.createObjectURL) {
      curObjUrl = URL.createObjectURL(file);
      var mb = (file.size / 1048576);
      grabCover(curObjUrl, function (dataUrl, meta) {
        var dur = meta && isFinite(meta.duration) ? fmtDur(meta.duration) : '--:--';
        var res = meta && meta.videoWidth ? meta.videoWidth + '×' + meta.videoHeight : '—';
        if (jyThumbDur && meta && isFinite(meta.duration)) jyThumbDur.textContent = fmtDur(meta.duration);
        if (meta && isFinite(meta.duration)) {            // 按真实时长估算素材量，工作台随之扩展
          jyBuildTracks(Math.max(4, Math.min(16, Math.round(meta.duration / 3))), Math.max(4, Math.min(12, Math.round(meta.duration / 2.4))));
        }
        showCover(dataUrl || demoCover(name), name,
          res + ' · ' + dur + ' · ' + (mb >= 1 ? mb.toFixed(1) + ' MB' : Math.round(file.size / 1024) + ' KB'));
      });
      wireJyVideo(curObjUrl);
    } else {
      var cvg = demoCover(name);
      showCover(cvg, name, '演示样片 · DEMO · 本地模拟渲染');
      [jyPrev, jyThumbVid].forEach(function (v) { if (v) v.poster = cvg; });
      if (jsHint) jsHint.style.display = 'none';
    }
  }
  function azClearMedia() {
    if (curObjUrl) { try { URL.revokeObjectURL(curObjUrl); } catch (e) {} curObjUrl = null; }
    clearJyVideo();
    dropPrev.hidden = true; dropIdle.hidden = false;
    dropCover.removeAttribute('src');
    if (jyThumbDur) jyThumbDur.textContent = '00:15';
  }
  function azAnalyze() {
    if (azBusy || azRun.hidden) return;
    azBusy = true; azStart.disabled = true; azDemo.disabled = true;
    var cuts = 6 + Math.floor(Math.random() * 7);     // 主轨素材段数 6-12
    var beats = 4 + Math.floor(Math.random() * 7);    // 卡点鼓点数 4-10
    azLog.textContent = '$ analyze :: init engine v2.6 …';
    var phaseLogs = [
      'frame-sampling :: 120 帧 @ 30fps · detected cuts = ' + cuts,
      'beat-detect :: BPM ≈ ' + (95 + Math.floor(Math.random() * 45)) + ' · 命中鼓点 ' + beats,
      'transition-scan :: 识别到 叠化/闪白/运镜推近',
      'text-scan :: 花字 3 组 · 字幕 2 轨 · 贴纸 1',
      'capcut-map :: 免费功能覆盖 96% · 付费项命中 0'
    ];
    var p = 0;
    (function step() {
      if (p < 5) {
        azSetPhases(p);
        azBarFill.style.width = (p * 20 + 8) + '%';
        azLogPush('> [' + pad(p + 1) + '] ' + phaseLogs[p]);
        p++;
        setTimeout(step, 820 + Math.random() * 420);
      } else {
        azSetPhases(5);
        azBarFill.style.width = '100%';
        azLogPush('$ analyze :: DONE — 解构报告已生成，分镜解析与动图教学已解锁');
        azReport.hidden = false;
        countUp($('#rpCuts'), cuts, {});
        countUp($('#rpBeats'), beats, {});
        countUp($('#rpFree'), 100, { suffix: '%', dec: 0 });
        jyClearSel();
        jyBuildTracks(cuts, beats);     // 工作台时间轴按解构出的素材量实时扩展
        jyLocked.hidden = true;
        jyFlowWrap.classList.remove('locked');
        jyAuto.disabled = false;
        azWide.hidden = false;
        curPlan = null;                // 每次解构随机换一套分镜方案，时间轴转场与报告同源
        renderShots();
        jyStepIdx = 0; jyPlayLoop();
        azBusy = false; azStart.disabled = false; azDemo.disabled = false;
        toast('解构完成 · 分镜报告 + 剪映免费操作教学已解锁');
      }
    })();
  }
  azDrop.addEventListener('click', function () { azFile.click(); });
  azDrop.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); azFile.click(); } });
  ['dragenter', 'dragover'].forEach(function (ev) {
    azDrop.addEventListener(ev, function (e) { e.preventDefault(); azDrop.classList.add('hot'); });
  });
  ['dragleave', 'drop'].forEach(function (ev) {
    azDrop.addEventListener(ev, function (e) { e.preventDefault(); azDrop.classList.remove('hot'); });
  });
  azDrop.addEventListener('drop', function (e) {
    var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (f) azLoad(f.name, f);
  });
  azFile.addEventListener('change', function () {
    if (azFile.files && azFile.files[0]) azLoad(azFile.files[0].name, azFile.files[0]);
  });
  azDemo.addEventListener('click', function () {
    azLoad('demo_trend_cut_' + pad(1 + Math.floor(Math.random() * 9)) + '.mp4（演示样片）');
  });
  azStart.addEventListener('click', azAnalyze);
  azReset.addEventListener('click', function () {
    jyStopLoop(); jyAutoUI(false); jyAuto.disabled = true; azBusy = false;
    azRun.hidden = true; azReport.hidden = true; azReset.hidden = true;
    azStart.disabled = true; azDemo.disabled = false; azFile.value = '';
    azClearMedia();
    azWide.hidden = true; shotList.innerHTML = '';
    jyFlowWrap.classList.add('locked');
    $$('.jf-node', jyFlow).forEach(function (n) { n.classList.remove('on', 'done'); });
    jyClearSel();
    jyBuildTracks(6, 5);
    jyHighlight([]);
    jyLocked.hidden = false;
    jyLocked.innerHTML = '<b>LOCKED</b><span>完成左侧视频解构后<br>自动解锁剪映免费操作动图教学</span>';
    azLog.textContent = '$ ready. 等待导入视频…';
  });

  /* ================= 启动 ================= */
  buildMap();
  document.addEventListener('visibilitychange', function () {
    if (document.hidden && rafId) { cancelAnimationFrame(rafId); rafId = null; }
    else if (!document.hidden && !rafId) { rafLoop(performance.now()); }
  });
})();
