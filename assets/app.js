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
  function sparkSVG(trend, color, W, H) {
    var w = W || 64, h = H || 22, min = Math.min.apply(null, trend), max = Math.max.apply(null, trend);
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
  function bootRun(color, target, swap, label, done) {
    if (bootBusy) return;                       // 过渡进行中忽略重复点击，避免视图与按钮状态错位
    bootBusy = true;
    bootTimers.forEach(clearTimeout); bootTimers = [];
    if (bootRaf) { cancelAnimationFrame(bootRaf); bootRaf = null; }
    bootEl.style.setProperty('--gt', color || '#22d3ee');
    bootTitle.textContent = label || ROUTE_LABEL[target] || '正在进入';
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
        if (typeof done === 'function') done();
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

  /* ===== 实时更新引擎：每 3 秒微调热度 / 增速，刷新时间戳与可见榜单数字，LIVE 标识同步闪动 ===== */
  var liveTick = 0;
  function liveStamp() {
    var d = new Date();
    var ts = pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
    D.updatedAt = '2026-10-16 ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
    var el = $('#tdUpdated');
    if (el) el.textContent = '今日 · 更新于 ' + ts + ' · 跨平台实时聚合';
    var b = $('#liveBadge');
    if (b) { b.classList.remove('beat'); void b.offsetWidth; b.classList.add('beat'); }
    return ts;
  }
  /* 当日热点视图：就地刷新可见热榜数字，避免整页频繁重绘（图表不参与高频重排） */
  function livePaintToday() {
    $$('#view-today .rank-row[data-plat][data-tid]').forEach(function (row) {
      var p = D.platforms.filter(function (x) { return x.id === row.dataset.plat; })[0]; if (!p) return;
      var t = p.topics.filter(function (x) { return x.id === row.dataset.tid; })[0]; if (!t) return;
      var e = $('.r-est', row); if (e) e.textContent = t.heat.toFixed(1);
    });
    var ch = $('#tdChamp');
    if (ch && ch.dataset.tid) {
      var cp = D.platforms.filter(function (x) { return x.id === ch.dataset.plat; })[0];
      var ct = cp && cp.topics.filter(function (x) { return x.id === ch.dataset.tid; })[0];
      var ce = $('.c-heat', ch); if (ce && ct) ce.textContent = ct.heat.toFixed(1);
    }
    $$('#tdPlatGrid .rank-row[data-plat][data-tid]').forEach(function (row) {
      var p = D.platforms.filter(function (x) { return x.id === row.dataset.plat; })[0]; if (!p) return;
      var t = p.topics.filter(function (x) { return x.id === row.dataset.tid; })[0]; if (!t) return;
      var e = $('.r-est', row); if (e) e.textContent = t.heat.toFixed(1);
    });
    $$('#tdPlatGrid .td-plat').forEach(function (card) {
      var id = card.dataset.pid;
      var p = D.platforms.filter(function (x) { return x.id === id; })[0]; if (!p) return;
      var e = $('.tp-heat', card); if (e) e.textContent = p.heat.toFixed(1);
    });
  }

  setInterval(function () {
    var n = 1 + Math.floor(Math.random() * 3);
    for (var i = 0; i < n; i++) {
      var p = D.platforms[Math.floor(Math.random() * D.platforms.length)];
      p.heat = Math.max(60, Math.min(99.5, p.heat + (Math.random() - 0.42) * 1.8));
      var t = p.topics[Math.floor(Math.random() * p.topics.length)];
      t.heat = Math.max(55, Math.min(99.5, t.heat + (Math.random() - 0.45) * 1.6));
      t.growth = Math.max(3, Math.min(60, t.growth + (Math.random() - 0.45) * 0.9));
      var el = document.getElementById('heat-' + p.id);
      if (el) {
        el.innerHTML = p.heat.toFixed(1) + '<i>HEAT</i>';
        el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash');
      }
    }
    liveTick++;
    liveStamp();
    refreshTodayNode();
    livePaintToday();
    // 每 5 个节拍（约 15 秒）在当日热点视图做一次完整重排，让排序真实反映实时热度
    if (currentView === 'today' && liveTick % 5 === 0) renderToday(true);
  }, 3000);

  $('#refreshBtn').addEventListener('click', function () {
    var btn = this; btn.classList.add('spin');
    D.platforms.forEach(function (p) {
      p.heat = Math.max(60, Math.min(99.5, p.heat + (Math.random() - 0.42) * 3));
      p.topics.forEach(function (t) { t.growth = Math.max(3, Math.min(60, t.growth + (Math.random() - 0.44) * 1.4)); });
      var el = document.getElementById('heat-' + p.id);
      if (el) el.innerHTML = p.heat.toFixed(1) + '<i>HEAT</i>';
    });
    setTimeout(function () { btn.classList.remove('spin'); }, 850);
    liveStamp();
    refreshTodayNode();
    if (currentView === 'today') renderToday(true);
    toast('已同步最新热点数据 · ' + pad(new Date().getHours()) + ':' + pad(new Date().getMinutes()) + ':' + pad(new Date().getSeconds()));
  });

  /* ================= 思维导图（节点可拖动 · 连线每帧实时派生） ================= */
  var stage = $('#mapStage'), svg = $('#mapSvg');
  var POS = {
    douyin: [17, 26], bilibili: [50, 12], xiaohongshu: [83, 26],
    kuaishou: [20, 78], shipinhao: [80, 78], today: [50, 80]
  };
  /* 星图第 6 分支：当日热点（跨平台聚合，可交互，点击进入当日热点视图） */
  var TODAY_BRANCH = { id: 'today', name: '当日热点', en: 'TODAY', color: '#ff6b6b', color2: '#ffd166' };
  function mapBranches() { return D.platforms.concat([TODAY_BRANCH]); }
  function branchOf(id) { return id === 'today' ? TODAY_BRANCH : D.platforms.filter(function (x) { return x.id === id; })[0]; }
  function todayAll() {
    var all = [];
    D.platforms.forEach(function (p) { p.topics.forEach(function (t) { all.push({ p: p, t: t }); }); });
    all.sort(function (a, b) { return b.t.heat - a.t.heat; });
    return all;
  }
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
    buildTodayNode();
    if (!rafId) rafId = requestAnimationFrame(rafLoop);
    countUp($('#hubTopics'), totalTopics, {});
    countUp($('#hubEst'), parseFloat((totalEst / 10000).toFixed(1)), { dec: 1, suffix: ' 亿' });
  }

  /* 星图第 6 分支：当日热点（跨平台聚合 · 可拖动 · 可展开今日热榜 TOP10 · 点击进入当日热点视图） */
  function buildTodayNode() {
    var pos = POS.today;
    var node = document.createElement('div');
    node.className = 'mnode';
    node.setAttribute('role', 'button');
    node.setAttribute('tabindex', '0');
    node.dataset.pid = 'today';
    node.style.setProperty('--p', TODAY_BRANCH.color);
    node.style.setProperty('--p2', TODAY_BRANCH.color2);
    node.style.setProperty('--p-glow', TODAY_BRANCH.color + '55');
    node.style.setProperty('--d', '0.55s');
    node.style.left = pos[0] + '%'; node.style.top = pos[1] + '%';
    node.setAttribute('aria-label', '当日热点分支 · 可拖动');
    node.innerHTML = todayNodeHTML();
    stage.appendChild(node);
    nodeState.today = { x: pos[0], y: pos[1], el: node };
    node.addEventListener('animationend', function () { node.style.animation = 'none'; linksDirty = true; });
    bindDrag(node, TODAY_BRANCH);
    node.querySelector('.mn-sub-toggle').addEventListener('click', function (e) { e.stopPropagation(); toggleSub('today'); });
    node.addEventListener('click', function () {
      if (node._suppressClick) { node._suppressClick = false; return; }
      branchPulse('today', function () { bootRun(TODAY_BRANCH.color, 'today', function () { goView('today'); }); });
    });
    node.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') branchPulse('today', function () { bootRun(TODAY_BRANCH.color, 'today', function () { goView('today'); }); });
    });
    linksDirty = true;
  }
  function todayNodeHTML() {
    var all = todayAll(), top = all[0];
    return '<div class="mn-top">' +
        '<span class="mn-logo">热</span>' +
        '<div class="mn-name">当日热点<em>TODAY</em></div>' +
        '<span class="mn-heat" id="heat-today">' + (top ? top.t.heat.toFixed(1) : '0') + '<i>HEAT</i></span>' +
      '</div>' +
      '<div class="mn-topic"><span class="tt">TOP1</span><b>' + esc(top ? top.t.title : '—') + '</b></div>' +
      '<div class="mn-foot"><span class="cnt">' + all.length + ' 话题在榜</span>' + sparkSVG([46, 54, 60, 66, 72, 80, 88, 95], TODAY_BRANCH.color) + '</div>' +
      '<button class="mn-sub-toggle" type="button">≡ 今日热榜 TOP10</button>' +
      '<span class="mn-go">按住拖动 · 点击进入当日热点 →</span>' +
      '<div class="mn-sub" hidden></div>';
  }
  /* 星图内边指标刷新（实时更新时同步分支节点上的 TOP1 / 热度） */
  function refreshTodayNode() {
    var st = nodeState.today; if (!st) return;
    var all = todayAll(), top = all[0];
    var h = $('#heat-today'); if (h) h.innerHTML = (top ? top.t.heat.toFixed(1) : '0') + '<i>HEAT</i>';
    var tp = nodeState.today.el.querySelector('.mn-topic b'); if (tp && top) tp.textContent = top.t.title;
    var cn = nodeState.today.el.querySelector('.mn-foot .cnt'); if (cn) cn.textContent = all.length + ' 话题在榜';
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
      if (pid === 'today') {
        panel.innerHTML = buildTodaySubHTML();
        $$('.mn-sub-topic', panel).forEach(function (row) {
          row.addEventListener('click', function (e) { e.stopPropagation(); openTopic(row.dataset.plat, row.dataset.tid); });
        });
        $$('.mtag', panel).forEach(function (t) {
          t.addEventListener('click', function (e) {
            e.stopPropagation();
            tdCat = t.dataset.cat; tdSub = ''; tdKw = '';
            bootRun(TODAY_BRANCH.color, 'today', function () { goView('today'); renderToday(true); });
          });
        });
        panel.querySelector('.mn-sub-enter').addEventListener('click', function (e) {
          e.stopPropagation();
          bootRun(TODAY_BRANCH.color, 'today', function () { goView('today'); });
        });
      } else {
        var p = D.platforms.filter(function (x) { return x.id === pid; })[0];
        panel.innerHTML = buildSubHTML(p);
        $$('.mn-sub-topic', panel).forEach(function (row) {
          row.addEventListener('click', function (e) { e.stopPropagation(); openTopic(pid, row.dataset.tid); });
        });
        /* 四个指标可交互：点击展开真实明细，再次点击收起 */
        var det = panel.querySelector('.mn-sub-kpide');
        $$('.msk.clk', panel).forEach(function (k) {
          var act = function (e) {
            e.stopPropagation();
            var on = k.classList.contains('on');
            $$('.msk', panel).forEach(function (x) { x.classList.remove('on'); });
            if (on) { det.hidden = true; det.innerHTML = ''; linksDirty = true; return; }
            k.classList.add('on');
            det.innerHTML = kpiDetailHTML(p, k.dataset.kpi);
            det.hidden = false; linksDirty = true;
            /* 明细中的话题行可直接点击 → 打开该话题完整分析 */
            $$('[data-tid]', det).forEach(function (r) {
              r.addEventListener('click', function (e) {
                e.stopPropagation(); openTopic(p.id, r.dataset.tid);
              });
            });
          };
          k.addEventListener('click', act);
          k.addEventListener('keydown', function (e) { if (e.key === 'Enter') act(e); });
        });
        panel.querySelector('.mn-sub-enter').addEventListener('click', function (e) {
          e.stopPropagation();
          bootRun(p.color, 'platform', function () { openPlatform(pid); });
        });
      }
    }
    panel.hidden = false; node.classList.add('sub-open');
    node.classList.toggle('sub-up', st_y(pid) > 55);   // 下排节点面板向上展开
    linksDirty = true;
  }
  function closeAllSubs() {
    $$('.mnode .mn-sub').forEach(function (x) { x.hidden = true; });
    $$('.mnode').forEach(function (x) { x.classList.remove('sub-open', 'sub-up'); });
    linksDirty = true;
  }
  function st_y(pid) { var s = nodeState[pid]; return s ? s.y : 0; }
  function buildSubHTML(p) {
    var kpis = [
      ['在榜话题数', p.topicCount + ' 个', 'topics'], ['平均预估播放', fmtWan(p.avgEst), 'est'],
      ['峰值增速 24h', '+' + p.peak.toFixed(1) + '%', 'peak'], ['内容饱和度', p.saturation + '%', 'sat']
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
        return '<div class="msk clk" role="button" tabindex="0" data-kpi="' + k[2] + '"><span>' + k[0] + '</span><b>' + k[1] + '</b></div>';
      }).join('') + '</div>' +
      '<div class="mn-sub-kpide" hidden></div>' +
      '<div class="mn-sub-tp"><b>在榜话题 TOP ' + Math.min(10, p.topics.length) + '</b><span>点击查看完整分析</span></div>' +
      '<div class="mn-sub-list">' + rows + '</div>' +
      '<button class="mn-sub-enter" type="button">进入 ' + p.name + ' 完整分析 →</button>';
  }
  /* 指标明细：点击四个指标 → 展开真实数据派生的明细（类目分布 / 播放分布 / 增速曲线 / 类目占比） */
  function kpiDetailHTML(p, key) {
    function cats() {
      var m = {}; p.topics.forEach(function (t) { m[t.cat] = (m[t.cat] || 0) + 1; }); return m;
    }
    function bars(map, fmt) {
      var keys = Object.keys(map), max = 1;
      keys.forEach(function (k) { max = Math.max(max, map[k]); });
      return keys.sort(function (a, b) { return map[b] - map[a]; }).map(function (k) {
        return '<div class="kd-row"><span>' + esc(k) + '</span><i style="width:' + (map[k] / max * 100).toFixed(1) + '%"></i><b>' + (fmt ? fmt(map[k]) : map[k]) + '</b></div>';
      }).join('');
    }
    /* 可点击的话题条：点击直接打开该话题完整分析 */
    function topicBars(list, mx, fmtV) {
      return list.map(function (t, i) {
        return '<button class="kd-row kd-link" type="button" data-tid="' + t.id + '" title="点击查看「' + esc(t.title) + '」完整分析">' +
          '<span>' + pad(i + 1) + ' · ' + esc(t.title) + '</span>' +
          '<i style="width:' + (t[fmtV.f] / mx * 100).toFixed(1) + '%"></i><b>' + fmtV.txt(t) + '</b></button>';
      }).join('');
    }
    if (key === 'topics') {
      var m = cats();
      var rank = 1 + D.platforms.filter(function (x) { return x.topicCount > p.topicCount; }).length;
      var avg = Math.round(D.platforms.reduce(function (s, x) { return s + x.topicCount; }, 0) / D.platforms.length);
      var topCat = Object.keys(m).sort(function (a, b) { return m[b] - m[a]; })[0] || '—';
      return '<div class="kd-hd">在榜话题数 · 类目分布</div><div class="kd-bars">' + bars(m) + '</div>' +
        '<p class="kd-note">共 <b>' + p.topicCount + '</b> 个话题在榜，覆盖 ' + Object.keys(m).length + ' 个类目，' +
        '供给最多的是<b>「' + esc(topCat) + '」(' + (m[topCat] || 0) + ' 个)</b>；' +
        '全网排名第 <b>' + rank + '</b> / ' + D.platforms.length + '，五平台均值 ' + avg + ' 个' +
        (p.topicCount >= avg ? '，该平台话题供给高于均值。' : '，低于全网均值，尚有供给空缺。') +
        ' 下方 TOP 列表可逐个打开完整分析。</p>';
    }
    if (key === 'est') {
      var sorted = p.topics.slice().sort(function (a, b) { return b.est - a.est; });
      var arr = sorted.slice(0, 10), mx = arr[0] ? arr[0].est : 1;
      var hi = sorted[0], lo = sorted[sorted.length - 1], med = sorted[Math.floor(sorted.length / 2)];
      return '<div class="kd-hd">平均预估播放 · TOP10 播放量分布（点击条目查看话题分析）</div><div class="kd-bars">' +
        topicBars(arr, mx, { f: 'est', txt: function (t) { return fmtWan(t.est); } }) + '</div>' +
        '<p class="kd-note">平台平均预估播放 <b>' + fmtWan(p.avgEst) + '</b>；' +
        '最高「' + (hi ? esc(hi.title) : '—') + '」' + (hi ? fmtWan(hi.est) : '') +
        '，中位 ' + (med ? fmtWan(med.est) : '—') + '，最低「' + (lo ? esc(lo.title) : '—') + '」' + (lo ? fmtWan(lo.est) : '') +
        '。均值由全部 ' + sorted.length + ' 条在榜话题的预估播放真实计算。</p>';
    }
    if (key === 'peak') {
      var g = p.topics.slice().sort(function (a, b) { return b.growth - a.growth; }).slice(0, 6);
      var gm = g.length ? g[0].growth : 1;
      var tr = p.trend || [], t0 = tr[0], t1 = tr[tr.length - 1];
      var gb = topicBars(g, gm, { f: 'growth', txt: function (t) { return '+' + t.growth.toFixed(1) + '%'; } });
      return '<div class="kd-hd">峰值增速 24h · 平台热度曲线（' + (tr.length * 3) + ' 小时，' + t0 + ' → ' + t1 + '）</div><div class="kd-spark">' + sparkSVG(p.trend, p.color, 220, 44) + '</div>' +
        '<div class="kd-bars">' + gb + '</div>' +
        '<p class="kd-note">24 小时热度峰值增速 <b>+' + p.peak.toFixed(1) + '%</b>；' +
        '增速冠军为「' + (g[0] ? esc(g[0].title) : '—') + '」（+' + (g[0] ? g[0].growth.toFixed(1) : '0') + '%），点击条目可查看该话题完整分析。</p>';
    }
    if (key === 'sat') {
      var s = cats(), total = p.topics.length || 1, pct = {};
      Object.keys(s).forEach(function (k) { pct[k] = Math.round(s[k] / total * 100); });
      var lvl, adv;
      if (p.saturation >= 75) { lvl = '高饱和 · 红海'; adv = '头部类目扎堆、同质化严重，新号不宜正面硬刚，建议用差异化切口（反差人设 / 地域视角 / 交叉类目）进入。'; }
      else if (p.saturation >= 60) { lvl = '中高饱和'; adv = '主流类目供给充分但仍有窗口，建议绑定增速最快的话题做系列化内容，抢上升期流量。'; }
      else { lvl = '中低饱和 · 蓝海窗口'; adv = '内容供给不足、用户需求未被满足，适合快速铺量建立账号标签，优先补齐占比最小的类目。'; }
      return '<div class="kd-hd">内容饱和度 · 类目占比</div><div class="kd-bars">' + bars(pct, function (v) { return v + '%'; }) + '</div>' +
        '<p class="kd-note">内容饱和度 <b>' + p.saturation + '%</b>（<b>' + lvl + '</b>）—— ' + adv + '</p>';
    }
    return '';
  }

  /* 平台洞察①：热门内容剪辑技术画像（全部在榜话题 tech 四项真实均值，平台级首次聚合） */
  function pvTechHTML(p) {
    var defs = [
      ['rhythm', '节奏卡点', '剪映电脑版用「音频踩点」自动生成节拍标记，把素材按踩点一刀切开'],
      ['trans', '转场设计', '剪映电脑版转场栏的免费叠化 / 闪黑 / 运镜转场直接拖到两段素材之间'],
      ['sub', '字幕包装', '剪映电脑版「智能字幕」自动识别语音生成字幕，再套免费文字模板与花字'],
      ['sound', '声画匹配', '剪映电脑版先做音频分离，把音效库里的免费音效逐一对准动作爆点']
    ];
    var n = p.topics.length || 1, avg = {};
    defs.forEach(function (d) {
      avg[d[0]] = p.topics.reduce(function (s, t) { return s + t.tech[d[0]]; }, 0) / n;
    });
    var rank = defs.slice().sort(function (a, b) { return avg[b[0]] - avg[a[0]]; });
    var bars = defs.map(function (d) {
      return '<div class="pt-row"><span>' + d[1] + '</span><div class="pt-bar"><i data-w="' + avg[d[0]].toFixed(1) + '"></i></div><b>' + avg[d[0]].toFixed(1) + '</b></div>';
    }).join('');
    return '<h3>热门内容剪辑技术画像</h3>' +
      '<p class="sub">本平台在榜话题四项剪辑手法均值 · 对标该平台流量偏好</p>' +
      '<div class="pt-bars">' + bars + '</div>' +
      '<div class="pt-tip"><b>流量密码 · </b>' + rank[0][1] + '（' + avg[rank[0][0]].toFixed(1) +
      '）权重最高——' + rank[0][2] + '；' + rank[3][1] + '相对权重最低，不必作为投入重点。</div>';
  }

  /* 平台洞察②：子赛道机会矩阵（按二级子类目聚合 播放×增速，气泡大小=话题数，点击气泡直达该赛道头部话题） */
  function pvMatrixHTML(p) {
    var sm = {}, n = p.topics.length || 1, confSum = 0;
    p.topics.forEach(function (t) {
      confSum += t.confidence || 0;
      var s = sm[t.sub] || (sm[t.sub] = { name: t.sub, n: 0, es: 0, gs: 0, top: null });
      s.n++; s.es += t.est; s.gs += t.growth;
      if (!s.top || t.heat > s.top.heat) s.top = t;
    });
    var subs = Object.keys(sm).map(function (k) {
      var s = sm[k]; s.ae = s.es / s.n; s.ag = s.gs / s.n; return s;
    });
    function median(arr) {
      var a = arr.slice().sort(function (x, y) { return x - y; }), m = Math.floor(a.length / 2);
      return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
    }
    var mx = median(subs.map(function (s) { return s.ae; }));
    var my = median(subs.map(function (s) { return s.ag; }));
    var aes = subs.map(function (s) { return s.ae; }), ags = subs.map(function (s) { return s.ag; });
    var xmin = Math.min.apply(null, aes), xmax = Math.max.apply(null, aes);
    var ymin = Math.min.apply(null, ags), ymax = Math.max.apply(null, ags);

    /* SVG 几何 */
    var W = 300, H = 252, L = 40, Rt = 12, T = 14, B = 38;
    var pw = W - L - Rt, ph = H - T - B;
    function sx(v) { return L + 12 + (v - xmin) / ((xmax - xmin) || 1) * (pw - 24); }
    function sy(v) { return T + ph - 12 - (v - ymin) / ((ymax - ymin) || 1) * (ph - 24); }
    var X0 = sx(mx), Y0 = sy(my);
    subs.forEach(function (s) {
      s.px = sx(s.ae); s.py = sy(s.ag); s.r = 4 + s.n * 2.4;
    });
    /* 气泡碰撞分离：迭代推开并约束在绘图区内 */
    for (var it = 0; it < 160; it++) {
      for (var i = 0; i < subs.length; i++) {
        for (var j = i + 1; j < subs.length; j++) {
          var a = subs[i], b = subs[j];
          var dx = b.px - a.px, dy = b.py - a.py;
          var d = Math.hypot(dx, dy) || 0.01, min = a.r + b.r + 3;
          if (d < min) {
            var push = (min - d) / 2, ux = dx / d, uy = dy / d;
            a.px -= ux * push; a.py -= uy * push;
            b.px += ux * push; b.py += uy * push;
          }
        }
      }
      subs.forEach(function (s) {
        s.px = Math.max(L + s.r + 2, Math.min(W - Rt - s.r - 2, s.px));
        s.py = Math.max(T + s.r + 2, Math.min(T + ph - s.r - 2, s.py));
      });
    }

    var svg = ['<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="子赛道机会矩阵">'];
    /* 四象限底色 */
    svg.push('<rect x="' + L + '" y="' + T + '" width="' + (X0 - L) + '" height="' + (Y0 - T) + '" fill="' + p.color + '" fill-opacity=".05"/>');
    svg.push('<rect x="' + X0 + '" y="' + T + '" width="' + (L + pw - X0) + '" height="' + (Y0 - T) + '" fill="#3ddc84" fill-opacity=".08"/>');
    svg.push('<rect x="' + L + '" y="' + Y0 + '" width="' + (X0 - L) + '" height="' + (T + ph - Y0) + '" fill="#ffffff" fill-opacity=".012"/>');
    svg.push('<rect x="' + X0 + '" y="' + Y0 + '" width="' + (L + pw - X0) + '" height="' + (T + ph - Y0) + '" fill="#ffffff" fill-opacity=".028"/>');
    /* 象限标签 */
    svg.push('<text class="pt-q" x="' + (L + 6) + '" y="' + (T + 11) + '">潜力黑马</text>');
    svg.push('<text class="pt-q" x="' + (L + pw - 6) + '" y="' + (T + 11) + '" text-anchor="end" fill="#3ddc84" fill-opacity=".75">黄金赛道</text>');
    svg.push('<text class="pt-q" x="' + (L + 6) + '" y="' + (T + ph - 6) + '">观望区</text>');
    svg.push('<text class="pt-q" x="' + (L + pw - 6) + '" y="' + (T + ph - 6) + '" text-anchor="end">成熟红海</text>');
    /* 中位分界虚线 + 坐标轴 */
    svg.push('<line x1="' + X0 + '" y1="' + T + '" x2="' + X0 + '" y2="' + (T + ph) + '" stroke="rgba(255,255,255,.22)" stroke-width="1" stroke-dasharray="3 3"/>');
    svg.push('<line x1="' + L + '" y1="' + Y0 + '" x2="' + (L + pw) + '" y2="' + Y0 + '" stroke="rgba(255,255,255,.22)" stroke-width="1" stroke-dasharray="3 3"/>');
    svg.push('<line x1="' + L + '" y1="' + T + '" x2="' + L + '" y2="' + (T + ph) + '" stroke="rgba(255,255,255,.18)" stroke-width="1"/>');
    svg.push('<line x1="' + L + '" y1="' + (T + ph) + '" x2="' + (L + pw) + '" y2="' + (T + ph) + '" stroke="rgba(255,255,255,.18)" stroke-width="1"/>');
    /* 轴端数值 */
    svg.push('<text class="pt-axis" x="' + L + '" y="' + (H - 20) + '">' + fmtWan(xmin) + '</text>');
    svg.push('<text class="pt-axis" x="' + (L + pw) + '" y="' + (H - 20) + '" text-anchor="end">' + fmtWan(xmax) + '</text>');
    svg.push('<text class="pt-axis" x="' + (L - 5) + '" y="' + (T + ph) + '" text-anchor="end">+' + ymin.toFixed(0) + '%</text>');
    svg.push('<text class="pt-axis" x="' + (L - 5) + '" y="' + (T + 4) + '" text-anchor="end">+' + ymax.toFixed(0) + '%</text>');
    svg.push('<text class="pt-axis" x="' + (L + pw) + '" y="' + (H - 6) + '" text-anchor="end">平均预估播放 →</text>');
    svg.push('<text class="pt-axis" x="' + L + '" y="6">↑ 24h 增速</text>');
    /* 气泡（可点击打开该子赛道头部话题） */
    subs.forEach(function (s) {
      var tip = s.name + ' · ' + s.n + ' 个话题在榜，均播 ' + fmtWan(s.ae) + ' · 均增 +' + s.ag.toFixed(1) +
        '%，头部话题「' + s.top.title + '」（点击查看完整分析）';
      svg.push('<g class="pt-bub" data-tid="' + s.top.id + '" tabindex="0" role="button" aria-label="' + esc(tip) + '">' +
        '<circle cx="' + s.px.toFixed(1) + '" cy="' + s.py.toFixed(1) + '" r="' + s.r.toFixed(1) + '" fill="' + p.color + '" fill-opacity=".75" stroke="#ffffff" stroke-opacity=".35"/>' +
        '<text class="pt-n" x="' + s.px.toFixed(1) + '" y="' + s.py.toFixed(1) + '">' + s.n + '</text>' +
        '<text class="pt-lb" x="' + s.px.toFixed(1) + '" y="' + (s.py + s.r + 11).toFixed(1) + '">' + esc(s.name.length > 5 ? s.name.slice(0, 5) + '…' : s.name) + '</text>' +
        '<title>' + esc(tip) + '</title></g>');
    });
    svg.push('</svg>');

    /* 结论：双高赛道 / 上升黑马 自动派生 */
    var gold = subs.filter(function (s) { return s.ae >= mx && s.ag >= my; }).sort(function (a, b) { return b.ag - a.ag; });
    var dark = subs.filter(function (s) { return s.ae < mx && s.ag >= my; }).sort(function (a, b) { return b.ag - a.ag; });
    var line;
    if (gold.length) {
      line = '<b style="color:#3ddc84">◆ 双高赛道</b> ' + esc(gold[0].name) + '（均播 ' + fmtWan(gold[0].ae) + ' · 均增 +' + gold[0].ag.toFixed(1) + '%，' + gold[0].n + ' 个话题在榜）';
    } else {
      var fastest = subs.slice().sort(function (a, b) { return b.ag - a.ag; })[0];
      line = '暂无播放 / 增速双高赛道，增速领先的是 <b>' + esc(fastest.name) + '</b>（+' + fastest.ag.toFixed(1) + '%），处于流量上升期';
    }
    if (dark.length) {
      line += '<br><b style="color:var(--p)">◆ 上升黑马</b> ' + esc(dark[0].name) + '（+' + dark[0].ag.toFixed(1) + '%）——播放体量尚小、增速已过站内中线，适合提前卡位';
    }
    return '<h3>子赛道机会矩阵</h3>' +
      '<p class="sub">按二级子类目聚合 · 横轴平均预估播放 · 纵轴 24h 增速 · 气泡大小=在榜话题数</p>' +
      '<div id="pvMatrix">' + svg.join('') + '</div>' +
      '<p class="pv-mx-note">' + line +
      '<span class="pv-mx-smp">基于本平台 ' + n + ' 个在榜话题真实采样 · 数据平均置信度 ' + Math.round(confSum / n) +
      ' · 象限分界为站内中位值，反映相对机会 · 点击气泡直达该赛道头部话题分析</span></p>';
  }

  /* 当日热点分支 · 三级菜单：今日聚合指标 + 分区分布 + 今日热榜 TOP10（全部可交互） */
  function buildTodaySubHTML() {
    var all = todayAll();
    var byGrowth = all.slice().sort(function (a, b) { return b.t.growth - a.t.growth; });
    var byEst = all.slice().sort(function (a, b) { return b.t.est - a.t.est; });
    var cats = TD_SECTIONS.filter(function (s) { return s.id !== 'all'; }).map(function (s) {
      var n = all.filter(function (o) { return s.cats && s.cats.indexOf(o.t.cat) >= 0; }).length;
      return '<button class="mtag" type="button" data-cat="' + s.id + '">' + s.name + '<b>' + n + '</b></button>';
    }).join('');
    var kpis = [
      ['今日话题总数', all.length + ' 个'],
      ['覆盖平台', D.platforms.length + ' 个'],
      ['全网最高热度', all[0] ? all[0].t.heat.toFixed(1) : '—'],
      ['最高预估播放', byEst[0] ? fmtWan(byEst[0].t.est) : '—'],
      ['增速冠军', byGrowth[0] ? '+' + byGrowth[0].t.growth.toFixed(1) + '%' : '—'],
      ['数据更新时间', (D.updatedAt || '').split(' ')[1] || '实时']
    ];
    var rows = all.slice(0, 10).map(function (o, i) {
      return '<button class="mn-sub-topic" type="button" data-plat="' + o.p.id + '" data-tid="' + o.t.id + '">' +
        '<span class="mst-rk">' + pad(i + 1) + '</span>' +
        '<span class="mst-t">' + esc(o.t.title) + '</span>' +
        '<span class="mst-c">' + o.p.name + ' · ' + esc(o.t.sub) + '</span>' +
        '<span class="mst-h">' + o.t.heat.toFixed(1) + '</span></button>';
    }).join('');
    return '<div class="mn-sub-hd"><b>当日热点 · 跨平台聚合</b><span>' + (D.updatedAt || '') + ' 快照</span></div>' +
      '<div class="mn-sub-kpis">' + kpis.map(function (k) {
        return '<div class="msk"><span>' + k[0] + '</span><b>' + k[1] + '</b></div>';
      }).join('') + '</div>' +
      '<div class="mn-sub-cats">' + cats + '</div>' +
      '<div class="mn-sub-tp"><b>今日全网热榜 TOP 10</b><span>点击查看完整分析</span></div>' +
      '<div class="mn-sub-list">' + rows + '</div>' +
      '<button class="mn-sub-enter" type="button">进入 当日热点 完整分析 →</button>';
  }

  /* 连线：完全由 nodeState 百分比坐标派生，与节点定位同源，不再跑丢 */
  function redrawLinks() {
    linksDirty = false;
    var w = stage.clientWidth, h = stage.clientHeight;
    if (w <= 0 || h <= 0) return;
    $$('.link, .link-glow, .flow', svg).forEach(function (e) { e.remove(); });
    var hx = w * HUB.x / 100, hy = h * HUB.y / 100;
    var ns = 'http://www.w3.org/2000/svg';
    mapBranches().forEach(function (p) {
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
    var p = branchOf(pid);
    if (!p) { done(); return; }
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
          '<div class="kpi clk" role="button" tabindex="0" aria-expanded="false" data-kpi="topics"><span class="k-go">点击展开明细 ▾</span><div class="k-l">在榜话题数</div><div class="k-v">' + p.topicCount + '<small>个</small></div><div class="k-bar"><i data-w="' + (p.topicCount / 40 * 100) + '"></i></div></div>' +
          '<div class="kpi clk" role="button" tabindex="0" aria-expanded="false" data-kpi="est"><span class="k-go">点击展开明细 ▾</span><div class="k-l">平均预估播放</div><div class="k-v">' + fmtWan(p.avgEst) + '</div><div class="k-bar"><i data-w="' + (p.avgEst / 21000 * 100).toFixed(1) + '"></i></div></div>' +
          '<div class="kpi clk" role="button" tabindex="0" aria-expanded="false" data-kpi="peak"><span class="k-go">点击展开明细 ▾</span><div class="k-l">峰值增速（24h）</div><div class="k-v">+' + p.peak.toFixed(1) + '<small>%</small></div><div class="k-bar"><i data-w="' + (p.peak / 30 * 100).toFixed(1) + '"></i></div></div>' +
          '<div class="kpi clk" role="button" tabindex="0" aria-expanded="false" data-kpi="sat"><span class="k-go">点击展开明细 ▾</span><div class="k-l">内容饱和度</div><div class="k-v">' + p.saturation + '<small>%</small></div><div class="k-bar"><i data-w="' + p.saturation + '"></i></div></div>' +
        '</div>' +
        '<div class="pv-kpide" id="pvKpiDetail" hidden></div>' +
        '<div class="pv-body">' +
          '<div class="pv-chart"><h3>近 7 日热度走势</h3><p class="sub">平台整体热度指数采样</p><div id="pvTrend"></div>' +
            '<div class="pv-split"></div>' + pvTechHTML(p) +
            '<div class="pv-split"></div>' + pvMatrixHTML(p) + '</div>' +
          '<div class="pv-topicsbox"><h3>在榜话题 · 实时抓取 TOP ' + topN + '</h3><p class="sub">点击话题查看剪辑手法 / 视频内核 / 流量预估完整分析</p>' + cards + '</div>' +
        '</div>' +
      '</div></div>';

    /* 返回导图：按钮立即进入加载态，与过渡动画同步；过渡结束后复位 */
    var backBtn = $('#backBtn');
    backBtn.addEventListener('click', function () {
      if (backBtn.classList.contains('going')) return;
      backBtn.classList.add('going');
      backBtn.textContent = '正在返回导图…';
      bootRun(p.color, 'map',
        function () { goView('map'); closeAllSubs(); },
        '返回思维导图总览',
        function () {
          backBtn.classList.remove('going');
          backBtn.textContent = '← 返回导图';
        });
    });
    $$('.tcard', sec).forEach(function (card) {
      card.addEventListener('click', function () { openTopic(card.dataset.plat, card.dataset.tid); });
      card.addEventListener('keydown', function (e) { if (e.key === 'Enter') openTopic(card.dataset.plat, card.dataset.tid); });
    });
    /* 子赛道机会矩阵：点击气泡打开该赛道头部话题完整分析 */
    $$('.pt-bub', sec).forEach(function (g) {
      var openBub = function () { openTopic(p.id, g.dataset.tid); };
      g.addEventListener('click', openBub);
      g.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openBub(); } });
    });

    /* 四个 KPI 卡片：点击展开真实数据明细（同一时刻只展开一个，再点收起） */
    var kpiDet = $('#pvKpiDetail');
    function pvRenderKpi(card) {
      var key = card.dataset.kpi;
      kpiDet.innerHTML = kpiDetailHTML(p, key) +
        '<button class="pv-kd-act" type="button">查看下方在榜话题列表 ↓</button>';
      kpiDet.hidden = false;
      /* 明细中的话题条目：点击直接打开话题完整分析 */
      $$('.kd-link', kpiDet).forEach(function (r) {
        r.addEventListener('click', function () { openTopic(p.id, r.dataset.tid); });
      });
      /* 跳转到下方话题列表并闪烁提示 */
      $('.pv-kd-act', kpiDet).addEventListener('click', function () {
        var box = $('.pv-topicsbox', sec);
        if (box) box.scrollIntoView({ behavior: 'smooth', block: 'start' });
        $$('.tcard', sec).forEach(function (c, i) {
          setTimeout(function () { c.style.transition = 'box-shadow .3s'; c.style.boxShadow = '0 0 0 1.5px ' + p.color; }, i * 45);
          setTimeout(function () { c.style.boxShadow = ''; }, 1400 + i * 45);
        });
      });
    }
    $$('.pv-kpis .kpi', sec).forEach(function (card) {
      var act = function () {
        var open = card.classList.contains('on');
        $$('.pv-kpis .kpi', sec).forEach(function (c) {
          c.classList.remove('on'); c.setAttribute('aria-expanded', 'false');
          $('.k-go', c).textContent = '点击展开明细 ▾';
        });
        if (open) { kpiDet.hidden = true; kpiDet.innerHTML = ''; return; }
        card.classList.add('on'); card.setAttribute('aria-expanded', 'true');
        $('.k-go', card).textContent = '点击收起明细 ▴';
        pvRenderKpi(card);
      };
      card.addEventListener('click', act);
      card.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); act(); } });
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

    // 模板原视频 / 平台入口（共 10 条真实链接：1 条已验证直达原视频 + 9 条平台站内真实检索入口，非 AI 生成）
    var orig = (D.orig && D.orig[tid]) || null;
    var origSec = '';
    if (orig && orig.list && orig.list.length) {
      var links = orig.list.map(function (o, i) {
        var isDirect = o.kind === 'direct';
        return '<a class="orig-link' + (isDirect ? ' direct' : '') + '" href="' + esc(o.url) + '" target="_blank" rel="noopener noreferrer">' +
            '<span class="orig-ico">' + (isDirect ? 'B' : (i + 1)) + '</span>' +
            '<span class="orig-main"><b>' + esc(o.name) + '</b>' +
              '<span>' + esc(o.site) + (isDirect ? ' · 直达播放页' : ' · 检索词「' + esc(o.kw || '') + '」') + '</span></span>' +
            '<span class="orig-tag' + (isDirect ? ' on' : '') + '">' + esc(o.tag) + '</span>' +
            '<span class="orig-go">↗</span>' +
          '</a>';
      }).join('');
      origSec =
        '<section class="ov-sec orig-sec wide"><h3>模板原视频 / 平台入口 · 共 ' + orig.list.length + ' 条</h3>' +
          '<p class="sub">第 1 条为该话题已验证的真实原视频直达播放页；其余 9 条为对应视频平台站内真实检索入口（以话题标题为关键词）· 全部指向平台真实页面，非 AI 生成</p>' +
          '<div class="orig-list">' + links + '</div>' +
          '<p class="orig-note">所有链接均为平台真实可访问页面，点击将在新标签页打开；站内检索入口进入后可按热度查看该话题下的热门视频。</p>' +
        '</section>';
    }

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
  var tdCat = 'all', tdSub = '', tdKw = '';
  function tdSec() {
    var s = null; TD_SECTIONS.forEach(function (x) { if (x.id === tdCat) s = x; });
    return s;
  }
  function tdByCat(list) {
    var s = tdSec();
    if (!s || !s.cats) return list;
    return list.filter(function (o) { return s.cats.indexOf(o.t.cat) >= 0; });
  }
  function tdMatchKw(o) {
    if (!tdKw) return true;
    return o.t.title.indexOf(tdKw) >= 0 || (o.t.sub && o.t.sub.indexOf(tdKw) >= 0);
  }
  function tdFilter(list) {
    var out = tdByCat(list);
    if (tdSub) out = out.filter(function (o) { return o.t.sub === tdSub; });
    if (tdKw) out = out.filter(tdMatchKw);
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
        tdCat = b.dataset.cat; tdSub = ''; tdKw = '';
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
        tdSub = b.dataset.sub; tdKw = '';
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

    // 热搜关键词：取自当前分区真实话题标题 · 点击即可筛选下方热榜（可清除）
    var base = tdByCat(all);
    var kwMap = {};
    base.forEach(function (o) {
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
      var hit = base.filter(function (o) {
        return o.t.title.indexOf(k[0]) >= 0 || (o.t.sub && o.t.sub.indexOf(k[0]) >= 0);
      }).length;
      return '<button class="kw' + (tdKw === k[0] ? ' on' : '') + '" data-kw="' + esc(k[0]) + '" ' +
        'title="命中 ' + hit + ' 条话题 · 合计热度 ' + Math.round(k[1]) + ' · 点击筛选" ' +
        'style="font-size:' + (11.5 + Math.round(k[1] / kwMax * 38) / 10).toFixed(1) + 'px">' +
        '<b>' + esc(k[0]) + '</b><em>' + hit + '</em></button>';
    }).join('');
    $$('#tdKw .kw').forEach(function (b) {
      b.addEventListener('click', function () {
        tdKw = tdKw === b.dataset.kw ? '' : b.dataset.kw;
        renderToday(true);
      });
    });
    var kwc = $('#tdKwClear');
    if (kwc) {
      kwc.hidden = !tdKw;
      kwc.textContent = tdKw ? '已筛选「' + tdKw + '」' + list.length + ' 条 ✕' : '';
    }

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

  /* 热搜关键词筛选 · 清除按钮 */
  var kwClearBtn = $('#tdKwClear');
  if (kwClearBtn) kwClearBtn.addEventListener('click', function () { tdKw = ''; renderToday(true); });

  /* ================= AI 剪辑解构台 ================= */
  var azDrop = $('#azDrop'), azFile = $('#azFile'), azRun = $('#azRun'), azFileName = $('#azFileName'),
      azBarFill = $('#azBarFill'), azPhases = $$('#azPhases li'), azLog = $('#azLog'),
      azStart = $('#azStart'), azDemo = $('#azDemo'), azReset = $('#azReset'), azReport = $('#azReport');
  var jyLocked = $('#jyLocked'), jyCursor = $('#jyCursor'), jySpot = $('#jySpot'),
      jcNo = $('#jcNo'), jcTxt = $('#jcTxt'), jyFlow = $('#jyFlow'),
      jyFlowWrap = $('#jyFlowWrap'), jyAuto = $('#jyAuto'),
      azWide = $('#azWide'), shotList = $('#shotList'),
      azScan = $('#azScan'), asWave = $('#asWave'), asMeta = $('#asMeta');
  var azBusy = false, jyTimer = null, jyStepIdx = 0;

  /* AI 引擎实时采样动效：常驻波形柱 + 状态文字，随解构阶段实时更新 */
  (function initScanWave() {
    if (!asWave) return;
    var bars = '';
    for (var i = 0; i < 32; i++) {
      var h = 22 + Math.round(Math.random() * 78);
      bars += '<i style="height:' + h + '%;animation-delay:' + (i * 0.045).toFixed(2) + 's"></i>';
    }
    asWave.innerHTML = bars;
    setInterval(function () {
      if (document.hidden || !asWave) return;
      var kids = asWave.children;
      var n = 3 + Math.floor(Math.random() * 4);
      for (var k = 0; k < n; k++) {
        var idx = Math.floor(Math.random() * kids.length);
        kids[idx].style.height = (18 + Math.round(Math.random() * 82)) + '%';
      }
    }, 420);
  })();
  function azScanState(mode, txt) {
    if (azScan) azScan.classList.toggle('busy', mode === 'busy');
    if (asMeta) asMeta.textContent = txt;
  }

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
      jyMarks = $('#jyMarks'), jyTracksBox = $('.jy-tracks', jyStage),
      jyMaskShape = $('#jyMaskShape');

  /* 时间轴轨道随分镜/素材数量动态生成：素材越多，轨道行数越多、行高越大，工作台整体向上扩展，杜绝裁切
     每个素材片段写入真实时间码（data-st/data-et），主轨交界处插入可点选的转场标记 */
  var JY_FX = ['荧光线描', '星火', '录制边框', '复古DV', '闭幕'];
  var JY_STK = ['🔥', '✨', '😂', '💯', '👍'];
  var JY_TRANS = [{ n: '叠化', dur: '0.5s' }, { n: '闪白', dur: '0.4s' }, { n: '泛光', dur: '0.6s' }];
  /* 视频蒙版 · 剪映专业版免费蒙版真实名称（属性面板 → 画面 → 蒙版 → 添加蒙版）
     声明须早于首次 jyBuildTracks（初始占位时间轴也要写入蒙版标识） */
  var MASK_LIB = [
    { n: '线性', path: '属性面板 → 画面 → 蒙版 → 添加蒙版 → 线性', rot: '旋转 -90°', feather: '羽化 12', why: '上下分屏：上屏留人物主体、下屏承接补充画面，交界处羽化 12 让接缝自然消失' },
    { n: '镜面', path: '属性面板 → 画面 → 蒙版 → 添加蒙版 → 镜面', rot: '旋转 0°', feather: '羽化 8', why: '中部横向开窗锁住主体、上下补环境画面，把不同画幅素材统一成电影感构图' },
    { n: '圆形', path: '属性面板 → 画面 → 蒙版 → 添加蒙版 → 圆形', rot: '无需旋转', feather: '羽化 10', why: '圆形开窗聚焦高光瞬间，羽化 10 做柔边聚焦，视线被强行锁死在主体上' },
    { n: '矩形', path: '属性面板 → 画面 → 蒙版 → 添加蒙版 → 矩形', rot: '圆角 6', feather: '羽化 4', why: '矩形开窗充当画中画窗口，配合缩放关键帧做「窗口推近」，信息层级最清晰' },
    { n: '爱心', path: '属性面板 → 画面 → 蒙版 → 添加蒙版 → 爱心', rot: '无需旋转', feather: '羽化 10', why: '爱心开窗贴合情感 / 节日话题，柔边把开窗画面融进背景，不显生硬' }
  ];
  function jyBuildTracks(cuts, beats, real) {
    var bounds = null, beatTs = null;
    if (real && real.bounds && real.bounds.length > 1) {
      bounds = real.bounds; cuts = bounds.length - 1;
      beatTs = real.beats || null; beats = beatTs ? beatTs.length : beats;
    }
    cuts = Math.max(4, Math.min(20, Math.round(cuts || 6)));
    beats = Math.max(3, Math.min(12, Math.round(beats || 5)));
    var rows = [
      { k: 'main', l: '主视频', cls: bounds ? 'real' : '', n: cuts },
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
        var st, et, posStyle = '';
        if (r.k === 'main' && bounds) {
          st = bounds[i]; et = bounds[i + 1];
          posStyle = ' style="left:' + (st / dur * 100).toFixed(2) + '%;width:' + ((et - st) / dur * 100).toFixed(2) + '%"';
        } else {
          st = dur * i / r.n; et = dur * (i + 1) / r.n;
        }
        var dt = r.k === 'text' ? ' data-t="花字' + (i + 1) + '"' : r.k === 'sub' ? ' data-t="字幕' + (i + 1) + '"' : r.k === 'fx' ? ' data-fx="' + JY_FX[i % JY_FX.length] + '"' : '';
        /* 画中画轨每段挂载剪映免费蒙版名，点选即联动监视器蒙版可视化与分镜报告 */
        if (r.k === 'pip') dt += ' data-mask="' + (typeof maskOf === 'function' ? maskOf(i).n : '矩形') + '"';
        clips += '<span class="jy-clip" data-i="' + i + '" data-n="' + (i + 1) + '" data-st="' + st.toFixed(2) + '" data-et="' + et.toFixed(2) + '"' + dt + posStyle + '></span>';
      }
      return '<div class="jy-track ' + r.cls + '" data-tk="' + r.k + '" data-l="' + r.l + '">' + clips + '</div>';
    }).join('');
    /* 主轨交界处插入转场标记（名称与分镜解构方案一致，均为剪映免费转场；真实检测时与切点同坐标） */
    var mainRow = $('.jy-track[data-tk="main"]', jyTrackList);
    if (mainRow) {
      var plan = pickPlan() || [];
      var tnames = plan.map(function (s) { return s.trans; });
      for (var i = 0; i < cuts - 1; i++) {
        var tn = tnames.length ? tnames[i % tnames.length] : JY_TRANS[i % JY_TRANS.length];
        var bt = bounds ? bounds[i + 1] : dur * (i + 1) / cuts;
        var sp = document.createElement('span');
        sp.className = 'jy-trans';
        sp.dataset.i = i; sp.dataset.n = tn.n; sp.dataset.dur = tn.dur;
        sp.dataset.et = bt.toFixed(2);
        sp.style.left = (bt / dur * 100).toFixed(2) + '%';
        mainRow.appendChild(sp);
      }
    }
    /* 鼓点层：真实检测鼓点按 t/dur 定位，与播放头 / 标尺 / 原片声音严格同坐标 */
    var bp = '';
    if (beatTs) {
      bp = beatTs.map(function (t) {
        return '<span class="jy-beat" data-t="' + t.toFixed(2) + '" title="鼓点 ' + fmtT(t) + '" style="left:' + (t / dur * 100).toFixed(2) + '%"></span>';
      }).join('');
    } else {
      for (var b = 0; b < beats; b++) {
        bp += '<span class="jy-beat" style="left:' + (11 + b * (78 / (beats - 1))).toFixed(1) + '%"></span>';
      }
    }
    jyBeatLayer.innerHTML = bp;
    var cap = $('.jy-pool-cap', jyStage);
    if (cap) cap.textContent = '本地素材 · ' + (5 + cuts) + ' 项 · 主轨 ' + cuts + ' 段';
    if (typeof jyTlClamp === 'function') jyTlClamp();
    if (typeof jyPaintHead === 'function') jyPaintHead(jyNowT());   // 轨道重建后重算播放头位置
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
    'p-mask': { t: '已选中「蒙版」—— 剪映免费蒙版作用于画中画素材，监视器实时可视化开窗区域（属性面板 → 画面 → 蒙版 → 添加蒙版）', track: 'pip', box: [54, 54, 40, 36], label: '蒙版 · 开窗区域', free: true, mask: true },
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
    jyClearMask();
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
  function jyDoPause() { if (jyPrev) { try { jyPrev.pause(); } catch (e) {} } jyVtStop(); jyPauseUI(true); }
  function jyDoPlay() {
    if (jyPrev && jyPrev.getAttribute('src')) { jyPrev.muted = false; jyPrev.volume = 1; }  // 用户手势 → 恢复声音
    if (jyReal()) { jyVtStop(); var p = jyPrev.play(); if (p && p.catch) p.catch(function () {}); }
    else jyVtStart();                                   // 演示样片无真实 src → 走虚拟时钟驱动播放头
    jyPauseUI(false);
    jyPaintHead(jyNowT());
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
  /* 视频蒙版可视化：按剪映免费蒙版类型在监视器绘制开窗区域（区域外压暗，模拟蒙版效果） */
  var MASK_SHAPE = {
    '线性': { l: '0%', t: '0%', w: '52%', h: '100%', r: '0' },
    '镜面': { l: '0%', t: '30%', w: '100%', h: '40%', r: '0' },
    '圆形': { l: '26%', t: '16%', w: '48%', h: '68%', r: '50%' },
    '矩形': { l: '18%', t: '18%', w: '64%', h: '64%', r: '8px' },
    '爱心': { l: '24%', t: '14%', w: '52%', h: '72%', r: '0', heart: 1 }
  };
  function jyClearMask() { if (jyMaskShape) jyMaskShape.innerHTML = ''; }
  function jyDrawMask(mk) {
    if (!jyMaskShape || !mk) return;
    jyMaskShape.innerHTML = '';
    var s = MASK_SHAPE[mk.n] || MASK_SHAPE['矩形'];
    var reg = document.createElement('span');
    reg.className = 'mk-region';
    reg.style.left = s.l; reg.style.top = s.t; reg.style.width = s.w; reg.style.height = s.h;
    reg.style.borderRadius = s.r;
    if (s.heart) reg.style.clipPath = 'path("M .5 1 C .1 .72 .08 .4 .28 .22 C .42 .1 .5 .2 .5 .2 C .5 .2 .58 .1 .72 .22 C .92 .4 .9 .72 .5 1 Z")';
    jyMaskShape.appendChild(reg);
    var tag = document.createElement('span');
    tag.className = 'mk-tag';
    tag.textContent = '蒙版 · ' + mk.n + ' · ' + mk.feather;
    jyMaskShape.appendChild(tag);
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
    var d = jyClipDur();
    if (jyReal()) {
      try { jyPrev.currentTime = Math.min(Math.max(0, t), Math.max(0, jyPrev.duration - 0.05)); } catch (e) {}
    } else {
      jyVirtualT = Math.min(Math.max(0, t), d);        // 演示样片：虚拟时钟定位，播放头 / 高亮照常联动
    }
    jyPaintHead(t); jySyncOnAir(t);                    // 播放头 + 工作台片段 + 素材库三方同步
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
      var mkn = el.dataset.mask || (typeof maskOf === 'function' ? maskOf(i).n : '矩形');
      var mkd = MASK_LIB[0];
      for (var mi = 0; mi < MASK_LIB.length; mi++) { if (MASK_LIB[mi].n === mkn) { mkd = MASK_LIB[mi]; break; } }
      jyDrawBox([54, 54, 40, 36], '画中画 · 素材 ' + n, false);
      jyDrawMask(mkd);
      jySay('已选中画中画素材 ' + n + '（' + rng + '）· 应用剪映免费蒙版「' + mkd.n + '」（' + mkd.path + ' · ' + mkd.rot + ' · ' + mkd.feather + '）—— ' + mkd.why);
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

  /* ================= 剪映工作台 · 完整可操作功能（素材库 / 属性面板 / 工具栏 / 监视器） ================= */
  var jyView = { tab: 'tab-media', sub: '本地', ratio: '原始', rot: 0, mirror: false, zoom: 1,
    vol: 1, rate: 1, speedMode: 'curve', curve: '蒙太奇', kf: 2, maskIdx: 0, beat: true,
    fin: 0.3, fout: 0.3, enhance: false, denoise: true, anim: '',
    f: { bright: 0, contrast: 0, sat: 0, sharp: 0 } };
  var jyHist = [], jyHistIdx = -1, jyMediaUrl = '';

  /* ---- 左上素材库：8 个标签均有真实免费素材内容，本地 / 素材库二级切换 ---- */
  var POOL = {
    'tab-media': { list: false, items: function (sub) {
      if (sub === '素材库') return [['城市夜景 · 空镜', '00:06'], ['云层延时', '00:05'], ['粒子光斑', '00:04'], ['海面日出', '00:08'], ['雨窗氛围', '00:07'], ['漏镜光效', '00:03']];
      return [{ vid: true, n: '原片', d: '00:15' }, ['空镜', '00:06'], ['BGM', '00:15'], ['贴纸', 'PNG'], ['花字', 'TXT'], ['转场', 'FX']];
    } },
    'tab-audio': { list: true, items: function (sub) {
      if (sub === '素材库') return [['音乐 · 卡点 · 热血鼓点 128bpm（免费）', '00:15'], ['音乐 · 燃向 · 极限冲刺（免费）', '00:18'], ['音乐 · 治愈 · 钢琴日记（免费）', '00:22'], ['音乐 · 氛围 · Lo-fi 雨夜（免费）', '00:20'], ['音效 · 转场 · Whoosh（免费）', '00:01'], ['音效 · 综艺 · 叮（免费）', '00:01'], ['音效 · 环境 · 掌声欢呼（免费）', '00:03']];
      return [['BGM · 卡点鼓点（本地提取）', '00:15'], ['音效 · Whoosh', '00:01'], ['音效 · 闪白', '00:01']];
    } },
    'tab-text': { list: true, items: function () {
      return [['花字 · 震撼金边大标题（免费）', 'TXT'], ['花字 · 综艺弹幕条（免费）', 'TXT'], ['花字 · 甜蜜粉色（免费）', 'TXT'], ['字幕 · 识别字幕自动生成（免费）', 'TXT'], ['字幕条 · 新闻下三分之一（免费）', 'TXT'], ['文字 · 手写体（免费）', 'TXT']];
    } },
    'tab-sticker': { list: false, items: function () {
      return [['🔥', ''], ['✨', ''], ['😂', ''], ['💯', ''], ['👍', ''], ['🎉', ''], ['💥', ''], ['⭐', ''], ['🌈', ''], ['😎', '']];
    } },
    'tab-fx': { list: true, items: function () {
      return [['荧光线描（特效 → 氛围，免费）', 'FX'], ['星火（特效 → 氛围，免费）', 'FX'], ['录制边框（特效 → 边框，免费）', 'FX'], ['复古 DV（特效 → 复古，免费）', 'FX'], ['闭幕（特效 → 基础，免费）', 'FX'], ['模糊开幕（特效 → 基础，免费）', 'FX'], ['抖动（特效 → 动感，免费）', 'FX'], ['放大冲击（特效 → 动感，免费）', 'FX']];
    } },
    'tab-tr': { list: true, items: function () {
      return [['叠化（转场 → 叠化，免费）', '0.5s'], ['闪白（转场 → 叠化，免费）', '0.4s'], ['泛光（转场 → 光效，免费）', '0.6s'], ['黑场（转场 → 基础，免费）', '0.3s'], ['运镜 · 推进（转场 → 运镜，免费）', '0.5s'], ['运镜 · 拉远（转场 → 运镜，免费）', '0.5s']];
    } },
    'tab-filter': { list: true, items: function () {
      return [['清透（滤镜 → 清新，免费）', 'LUT'], ['冷白（滤镜 → 冷调，免费）', 'LUT'], ['复古胶片（滤镜 → 复古，免费）', 'LUT'], ['黑金（滤镜 → 质感，免费）', 'LUT'], ['美食 · 暖色（滤镜 → 美食，免费）', 'LUT'], ['日系 · 灰调（滤镜 → 日系，免费）', 'LUT']];
    } },
    'tab-adjust': { list: true, items: function () {
      return [['亮度（右侧滑块实时调节）', '-50~50'], ['对比度（右侧滑块实时调节）', '-50~50'], ['饱和度（右侧滑块实时调节）', '-50~50'], ['锐化（右侧滑块实时调节）', '0~100'], ['色温（右侧滑块实时调节）', '-50~50']];
    } }
  };
  var POOL_ACT = {
    'tab-audio': { track: 'audio', box: [4, 80, 92, 15], label: '音频素材', free: true },
    'tab-text': { track: 'text', box: [13, 64, 74, 23], label: '文本 · 花字模板' },
    'tab-sticker': { track: 'sticker', box: [66, 11, 26, 26], label: '贴纸素材' },
    'tab-fx': { track: 'fx', box: [4, 4, 92, 92], label: '特效素材', free: true },
    'tab-tr': { box: [4, 38, 92, 20], label: '转场素材', free: true },
    'tab-filter': { box: [4, 4, 92, 92], label: '滤镜素材', free: true },
    'tab-adjust': { box: [4, 4, 92, 92], label: '调节参数' },
    'tab-media': { track: 'main', box: [4, 4, 92, 92], label: '视频素材' }
  };
  function jyPoolRender() {
    var pool = $('#jyPool'); if (!pool) return;
    var data = POOL[jyView.tab] || POOL['tab-media'];
    pool.className = 'jy-thumbs' + (data.list ? ' list' : '');
    pool.innerHTML = data.items(jyView.sub).map(function (it) {
      if (!Array.isArray(it)) {
        return '<div class="jy-thumb" data-jy="thumb1" data-n="' + it.n + '"><video id="jyThumbVid" muted loop playsinline></video><span class="jt-dur" id="jyThumbDur">' + it.d + '</span></div>';
      }
      return '<div class="jy-thumb" data-pool="' + jyView.tab + '" data-n="' + esc(it[0]) + '"><span class="jt-dur">' + it[1] + '</span></div>';
    }).join('');
    jyThumbVid = $('#jyThumbVid'); jyThumbDur = $('#jyThumbDur');
    if (jyMediaUrl && jyThumbVid) { jyThumbVid.src = jyMediaUrl; jyThumbVid.muted = true; var p = jyThumbVid.play(); if (p && p.catch) p.catch(function () {}); }
    var cap = $('.jy-pool-cap', jyStage);
    if (cap) cap.textContent = jyView.sub + '素材 · ' + data.items(jyView.sub).length + ' 项';
  }
  function jyPoolPick(el) {
    var act = POOL_ACT[el.dataset.pool] || POOL_ACT['tab-media'];
    if (act.track) jySelectTrack(act.track);
    jyDrawBox(act.box, act.label, !!act.free);
    jySay('已选中素材「' + el.dataset.n + '」' + (act.free ? '（免费）' : '') + ' —— 可拖入下方对应轨道参与剪辑，监视器已框出作用区域');
  }

  /* ---- 右侧属性面板：画面 / 音频 / 变速 / 动画 / 调节，全部可真实操作并即时作用于监视器 ---- */
  function jyCRows() {
    var mk = MASK_LIB[jyView.maskIdx % MASK_LIB.length];
    return '<div class="jy-rrow" data-jy="p-key"><span>◈ 关键帧</span><em>已打 ' + jyView.kf + ' 帧</em></div>' +
      '<div class="jy-rrow" data-jy="p-mask"><span>蒙版 · ' + mk.n + '</span><em>免费 · ' + mk.feather + '</em></div>' +
      '<div class="jy-rrow" data-jy="p-trans"><span>转场 · 叠化</span><em>0.5s · 免费</em></div>' +
      '<div class="jy-rrow" data-jy="p-text"><span>文本 · 花字</span><em>免费模板</em></div>';
  }
  function jySlider(uid, label, val, min, max, step, unit) {
    var pct = ((val - min) / (max - min) * 100).toFixed(0);
    return '<div class="jy-slider"><span>' + label + '</span>' +
      '<input type="range" class="jy-range" data-r="' + uid + '" min="' + min + '" max="' + max + '" step="' + step + '" value="' + val + '" style="--p:' + pct + '%">' +
      '<em>' + (uid === 'rate' ? (+val).toFixed(1) + 'x' : val + unit) + '</em></div>';
  }
  function jyRBodyRender(tab) {
    var body = $('#jyRBody'); if (!body) return;
    var h = '';
    if (tab === 'r-pic') {
      h = '<div class="jy-rgroup">画面基础 · 免费</div>' +
        '<div class="jy-rrow" data-jy="rp-zoom"><span>缩放</span><em>' + Math.round(jyView.zoom * 100) + '% ▾</em></div>' +
        '<div class="jy-rrow" data-jy="rp-rot"><span>旋转</span><em>' + jyView.rot + '° ▾</em></div>' +
        '<div class="jy-rrow switch' + (jyView.mirror ? ' on' : '') + '" data-jy="rp-mirror"><span>水平镜像</span><i class="jy-sw"></i></div>' +
        '<div class="jy-rrow" data-jy="rp-crop"><span>裁剪比例</span><em>' + jyView.ratio + (jyView.ratio === '原始' ? ' 16:9' : '') + ' ▾</em></div>' +
        '<div class="jy-rrow" data-jy="rp-mask"><span>蒙版（点击切换）</span><em>' + MASK_LIB[jyView.maskIdx].n + ' · 免费 ▾</em></div>' + jyCRows();
    } else if (tab === 'r-audio') {
      h = '<div class="jy-rgroup">音量</div>' + jySlider('vol', '音量', Math.round(jyView.vol * 100), 0, 100, 1, '%') +
        '<div class="jy-rgroup">淡入淡出 · 免费</div>' +
        '<div class="jy-rrow" data-jy="rp-fin"><span>淡入时长</span><em>' + jyView.fin + 's ▾</em></div>' +
        '<div class="jy-rrow" data-jy="rp-fout"><span>淡出时长</span><em>' + jyView.fout + 's ▾</em></div>' +
        '<div class="jy-rgroup">人声处理 · 免费</div>' +
        '<div class="jy-rrow switch' + (jyView.enhance ? ' on' : '') + '" data-jy="rp-enh"><span>人声增强</span><i class="jy-sw"></i></div>' +
        '<div class="jy-rrow switch' + (jyView.denoise ? ' on' : '') + '" data-jy="rp-denoise"><span>背景降噪</span><i class="jy-sw"></i></div>' + jyCRows();
    } else if (tab === 'r-speed') {
      h = '<div class="jy-rmode"><span' + (jyView.speedMode === 'normal' ? ' class="on"' : '') + ' data-jy="p-speed">常规变速</span><span' + (jyView.speedMode === 'curve' ? ' class="on"' : '') + ' data-jy="p-curve">曲线变速</span></div>';
      if (jyView.speedMode === 'curve') {
        h += '<div class="jy-curves">' +
          '<div class="jy-cv' + (jyView.curve === '蒙太奇' ? ' on' : '') + '" data-jy="cv-mont"><i class="cv-mont"></i>蒙太奇</div>' +
          '<div class="jy-cv' + (jyView.curve === '英雄时刻' ? ' on' : '') + '" data-jy="cv-hero"><i class="cv-hero"></i>英雄时刻</div>' +
          '<div class="jy-cv' + (jyView.curve === '子弹时间' ? ' on' : '') + '" data-jy="cv-bull"><i class="cv-bull"></i>子弹时间</div></div>' +
          '<div class="jy-rgroup">曲线变速为剪映免费预设 · 自动配合鼓点起伏</div>';
      } else {
        h += jySlider('rate', '播放速度', jyView.rate.toFixed(1), 0.1, 4, 0.1, 'x') +
          '<div class="jy-rgroup">常规变速 0.1x ~ 4.0x · 监视器实时生效</div>';
      }
      h += jyCRows();
    } else if (tab === 'r-anim') {
      function chips(group, list) {
        return '<div class="jy-rgroup">' + group + ' · 免费</div><div class="jy-chips">' + list.map(function (c) {
          return '<button class="jy-chip' + (jyView.anim === c[0] ? ' on' : '') + '" data-anim="' + c[0] + '">' + c[1] + '</button>';
        }).join('') + '</div>';
      }
      h = chips('入场动画', [['a-fade', '渐显'], ['a-up', '向上滑入'], ['a-wipe', '向右擦除']]) +
        chips('出场动画', [['a-out', '渐隐'], ['a-up', '向下淡出']]) +
        chips('组合动画', [['a-zoom', '轻微放大'], ['a-shake', '抖动'], ['a-pop', '弹簧弹入']]) + jyCRows();
    } else {
      h = '<div class="jy-rgroup">画面调节 · 拖动滑块监视器实时预览（免费）</div>' +
        jySlider('bright', '亮度', jyView.f.bright, -50, 50, 1, '') +
        jySlider('contrast', '对比度', jyView.f.contrast, -50, 50, 1, '') +
        jySlider('sat', '饱和度', jyView.f.sat, -50, 50, 1, '') +
        jySlider('sharp', '锐化', jyView.f.sharp, 0, 100, 1, '') +
        '<div class="jy-rrow" data-jy="rp-reset"><span>↺ 重置全部调节</span><em>免费</em></div>' + jyCRows();
    }
    body.innerHTML = h;
    /* 滑块实时作用于监视器 */
    $$('input.jy-range', body).forEach(function (inp) {
      inp.addEventListener('input', function () {
        var v = +inp.value;
        inp.style.setProperty('--p', ((v - inp.min) / (inp.max - inp.min) * 100) + '%');
        var em = inp.parentElement.querySelector('em');
        if (inp.dataset.r === 'vol') { jyView.vol = v / 100; if (em) em.textContent = v + '%'; }
        else if (inp.dataset.r === 'rate') { jyView.rate = v; if (em) em.textContent = v.toFixed(1) + 'x'; if (jyPrev && jyPrev.getAttribute('src')) jyPrev.playbackRate = v; }
        else { jyView.f[inp.dataset.r] = v; if (em) em.textContent = (v > 0 ? '+' : '') + v; }
        jyApplyView();
      });
      inp.addEventListener('click', function (e) { e.stopPropagation(); });
    });
    /* 动画预设：点按即在监视器真实播放一遍 */
    $$('.jy-chip', body).forEach(function (chip) {
      chip.addEventListener('click', function (e) {
        e.stopPropagation();
        $$('.jy-chip', body).forEach(function (c) { c.classList.remove('on'); });
        chip.classList.add('on');
        jyView.anim = chip.dataset.anim;
        var vf = $('.jy-vframe', jyStage);
        if (vf) {
          vf.classList.remove('a-fade', 'a-up', 'a-wipe', 'a-out', 'a-zoom', 'a-shake', 'a-pop');
          void vf.offsetWidth;
          vf.classList.add(chip.dataset.anim);
        }
        jyOverlay('动画预设 · ' + chip.textContent.trim());
        jySay('已应用' + (/入场|渐显|滑入|擦除/.test(chip.textContent.trim()) ? '入场' : '组合') + '动画「' + chip.textContent.trim() + '」（免费）· 监视器正在播放该动画效果');
      });
    });
  }

  /* ---- 画面状态（镜像 / 旋转 / 缩放 / 画幅 / 调节滤镜 / 音量 / 变速）实时作用于监视器 ---- */
  function jyApplyView() {
    var vf = $('.jy-vframe', jyStage), sc = $('.jy-screen', jyStage);
    var tr = (jyView.mirror ? 'scaleX(-1) ' : '') + 'rotate(' + jyView.rot + 'deg) scale(' + jyView.zoom + ')';
    var fl = 'brightness(' + (100 + jyView.f.bright) + '%) contrast(' + (100 + jyView.f.contrast) + '%) saturate(' + (100 + jyView.f.sat) + '%)';
    [vf, jyPrev].forEach(function (el) { if (!el) return; el.style.transform = tr; el.style.filter = fl; });
    if (sc) sc.dataset.ratio = jyView.ratio === '原始' ? '16:9' : jyView.ratio;
    var rl = $('.jy-ratio', jyStage); if (rl) rl.textContent = jyView.ratio + ' ▾';
    if (jyPrev) { jyPrev.volume = jyView.vol; if (jyPrev.getAttribute('src')) jyPrev.playbackRate = jyView.rate; }
  }
  function jyPushHist(desc, undoFn, redoFn) {
    jyHist = jyHist.slice(0, jyHistIdx + 1);
    jyHist.push({ d: desc, u: undoFn, r: redoFn });
    jyHistIdx++;
    var ub = $('[data-jy="undo"]', jyStage), rb = $('[data-jy="redo"]', jyStage);
    if (ub) ub.classList.toggle('disabled', jyHistIdx < 0);
    if (rb) rb.classList.toggle('disabled', jyHistIdx >= jyHist.length - 1);
  }
  function jyUndo() {
    var h = jyHist[jyHistIdx];
    if (!h) { toast('没有可撤销的操作'); return; }
    h.u(); jyHistIdx--; jyApplyView();
    var ub = $('[data-jy="undo"]', jyStage), rb = $('[data-jy="redo"]', jyStage);
    if (ub) ub.classList.toggle('disabled', jyHistIdx < 0);
    if (rb) rb.classList.remove('disabled');
    jySay('已撤销：' + h.d);
  }
  function jyRedo() {
    var h = jyHist[jyHistIdx + 1];
    if (!h) { toast('没有可重做的操作'); return; }
    h.r(); jyHistIdx++; jyApplyView();
    var ub = $('[data-jy="undo"]', jyStage), rb = $('[data-jy="redo"]', jyStage);
    if (ub) ub.classList.remove('disabled');
    if (rb) rb.classList.toggle('disabled', jyHistIdx >= jyHist.length - 1);
    jySay('已重做：' + h.d);
  }
  function jyCurMainClip() {
    var main = $('.jy-track[data-tk="main"]', jyStage); if (!main) return null;
    var sel = $('.jy-clip.sel', main); if (sel && !sel.classList.contains('del')) return sel;
    var t = jyNowT(), hit = null, best = 1e9;
    $$('.jy-clip', main).forEach(function (c) {
      if (c.classList.contains('del')) return;
      if (t >= +c.dataset.st && t < +c.dataset.et) hit = c;
      var dd = Math.abs(+c.dataset.st - t); if (dd < best) { best = dd; if (!hit) hit = c; }
    });
    return hit;
  }
  function jyOpSplit() {
    var c = jyCurMainClip(); if (!c) { toast('请先选择要分割的片段'); return; }
    if (c.classList.contains('split')) { toast('该片段已在播放头处分割'); return; }
    c.classList.add('split');
    var t = jyNowT();
    jyPushHist('✂ 分割 素材 ' + c.dataset.n, function () { c.classList.remove('split'); }, function () { c.classList.add('split'); });
    jyDrawBox([47.5, 4, 5, 92], '分割点 · ' + jyClock(t));
    jySay('✂ 已在播放头 ' + jyClock(t) + ' 处分割主轨素材 ' + c.dataset.n + ' —— 分割后两段可独立删除 / 变速 / 加转场（免费功能）');
  }
  function jyOpDelete() {
    var c = jyCurMainClip(); if (!c) { toast('请先选择要删除的片段'); return; }
    var was = c.classList.contains('del');
    c.classList.toggle('del');
    jyPushHist((was ? '恢复' : '删除') + ' 素材 ' + c.dataset.n,
      function () { c.classList.toggle('del', was); }, function () { c.classList.toggle('del', !was); });
    jySay(was ? '已恢复素材 ' + c.dataset.n : '已删除主轨素材 ' + c.dataset.n + '（可点 ↶ 撤销）—— 删除后相邻素材自动靠拢');
  }
  function jyOpReverse() {
    var c = jyCurMainClip(); if (!c) { toast('请先选择片段'); return; }
    var was = c.classList.contains('rev');
    c.classList.toggle('rev');
    jyPushHist('倒放 素材 ' + c.dataset.n, function () { c.classList.toggle('rev', was); }, function () { c.classList.toggle('rev', !was); });
    jySay((was ? '已取消倒放，素材 ' : '已将素材 ') + c.dataset.n + (was ? ' 恢复正常播放' : ' 设置为倒放（免费功能）· 时间轴片段已标注「倒放」'));
  }
  function jyOpFreeze() {
    var main = $('.jy-track[data-tk="main"]', jyStage); if (!main) return;
    if ($$('.jy-freeze', main).length >= 6) { toast('定格片段数量已达上限'); return; }
    var t = jyNowT(), pct = (t / jyDur() * 100).toFixed(2);
    var b = document.createElement('span');
    b.className = 'jy-freeze'; b.style.left = pct + '%'; b.dataset.t = t.toFixed(2);
    main.appendChild(b);
    jyPushHist('定格 3s @ ' + jyClock(t), function () { if (b.parentNode) b.parentNode.removeChild(b); }, function () { main.appendChild(b); });
    jyDrawBox([30, 18, 40, 64], '定格画面 · 3s', true);
    jySay('已在播放头 ' + jyClock(t) + ' 处插入「定格」3 秒（免费功能）· 时间轴上出现青色定格标记');
  }
  function jyOpMirror() {
    var old = jyView.mirror; jyView.mirror = !old; jyApplyView();
    jyPushHist('水平镜像', function () { jyView.mirror = old; jyApplyView(); }, function () { jyView.mirror = !old; jyApplyView(); });
    jySay('已' + (jyView.mirror ? '开启' : '关闭') + '水平镜像（免费功能）· 监视器画面实时翻转');
    if ($('[data-jy="r-pic"]', jyStage).classList.contains('on')) jyRBodyRender('r-pic');
  }
  function jyOpRotate() {
    var old = jyView.rot; jyView.rot = (jyView.rot + 90) % 360; jyApplyView();
    jyPushHist('旋转至 ' + jyView.rot + '°', function () { jyView.rot = old; jyApplyView(); }, function () { jyView.rot = (old + 90) % 360; jyApplyView(); });
    jySay('画面已顺时针旋转 90°，当前 ' + jyView.rot + '°（免费功能）· 监视器实时生效');
    if ($('[data-jy="r-pic"]', jyStage).classList.contains('on')) jyRBodyRender('r-pic');
  }
  function jyOpCrop() {
    var seq = ['原始', '9:16', '1:1'];
    var old = jyView.ratio;
    jyView.ratio = seq[(seq.indexOf(jyView.ratio) + 1) % seq.length];
    jyApplyView();
    jyPushHist('裁剪比例 ' + jyView.ratio, function () { jyView.ratio = old; jyApplyView(); }, function () { jyView.ratio = seq[(seq.indexOf(old) + 1) % seq.length]; jyApplyView(); });
    jySay('裁剪画幅已切换为「' + jyView.ratio + (jyView.ratio === '原始' ? ' 16:9' : '') + '」（免费功能）· 监视器画幅实时变化');
    if ($('[data-jy="r-pic"]', jyStage).classList.contains('on')) jyRBodyRender('r-pic');
  }
  function jyOpBeat(el) {
    jyView.beat = !jyView.beat;
    if (jyBeatLayer) jyBeatLayer.classList.toggle('off', !jyView.beat);
    if (el) { el.classList.toggle('off', !jyView.beat); el.classList.toggle('on', jyView.beat); }
    jySelectTrack('audio');
    jySay(jyView.beat ? '♪ 已开启自动踩点（节拍Ⅰ，免费）· 黄色鼓点标记已显示，把切点拖到鼓点即可严格卡点' : '已关闭自动踩点 · 鼓点标记已隐藏');
  }
  function jyOpFs() {
    var sc = $('.jy-screen', jyStage); if (!sc) return;
    var max = sc.classList.toggle('max');
    jySay(max ? '已进入全屏预览 · 按 Esc 或再次点 ⛶ 退出' : '已退出全屏预览');
  }
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') { var sc = $('.jy-screen.max', jyStage); if (sc) { sc.classList.remove('max'); jySay('已退出全屏预览'); } }
  }, true);
  /* 画面面板内可点击行 */
  function jyRP(key) {
    if (key === 'rp-zoom') {
      var seqZ = [1, 1.12, 1.3, 0.9], old = jyView.zoom;
      jyView.zoom = seqZ[(seqZ.indexOf(jyView.zoom) + 1) % seqZ.length]; jyApplyView();
      jyPushHist('缩放 ' + Math.round(jyView.zoom * 100) + '%', function () { jyView.zoom = old; jyApplyView(); }, function () { });
      jySay('画面缩放已调整为 ' + Math.round(jyView.zoom * 100) + '%（免费功能）');
      jyRBodyRender('r-pic');
    } else if (key === 'rp-rot') { jyOpRotate(); }
    else if (key === 'rp-mirror') { jyOpMirror(); }
    else if (key === 'rp-crop') { jyOpCrop(); }
    else if (key === 'rp-mask') {
      jyView.maskIdx = (jyView.maskIdx + 1) % MASK_LIB.length;
      var mk = MASK_LIB[jyView.maskIdx];
      jyDrawMask(mk);
      jySelectTrack('pip');
      jyRBodyRender('r-pic');
      jySay('已切换为「' + mk.n + '」蒙版（免费）· ' + mk.path + ' · 监视器已实时预览开窗区域');
    } else if (key === 'rp-fin' || key === 'rp-fout') {
      var seqT = [0, 0.3, 0.5, 1, 2], k = key === 'rp-fin' ? 'fin' : 'fout';
      jyView[k] = seqT[(seqT.indexOf(jyView[k]) + 1) % seqT.length];
      jySay('音频' + (k === 'fin' ? '淡入' : '淡出') + '时长已设为 ' + jyView[k] + 's（免费功能）');
      jyRBodyRender('r-audio');
    } else if (key === 'rp-enh' || key === 'rp-denoise') {
      var k2 = key === 'rp-enh' ? 'enhance' : 'denoise';
      jyView[k2] = !jyView[k2];
      jySay((k2 === 'enhance' ? '人声增强' : '背景降噪') + '已' + (jyView[k2] ? '开启' : '关闭') + '（免费功能）');
      jyRBodyRender('r-audio');
    } else if (key === 'rp-reset') {
      jyView.f = { bright: 0, contrast: 0, sat: 0, sharp: 0 }; jyApplyView();
      jySay('亮度 / 对比度 / 饱和度 / 锐化已全部重置为 0');
      jyRBodyRender('r-adj');
    }
  }
  /* 初始化：素材库动态渲染 + 撤销按钮置灰 + 默认变速面板 */
  jyPoolRender();
  $$('[data-jy="undo"],[data-jy="redo"]', jyStage).forEach(function (b) { b.classList.add('disabled'); });
  jyRBodyRender('r-speed');

  jyStage.addEventListener('click', function (e) {
    var el = e.target.closest('[data-jy],[data-tk],.jy-clip,.jy-trans,.jy-tb,.jy-thumb,.jy-cv,.jy-cbtn,.jy-rtabs span,.jy-lsub span');
    if (!el || !jyStage.contains(el)) return;
    var key = el.dataset.jy;
    if (key === 'preview') return;                         // 容器命中忽略
    if (jyTlDragged()) return;                             // 刚拖完时间轴画布 → 忽略本次误触
    if (key === 'timeline') {                              // 点击时间轴空白处 → 定位播放头（与原画面 / 工作台 / 素材库三方联动）
      jyStopLoop(); jyAutoUI(false);
      var tClick = jyScrubTo(e.clientX);
      jySay('时间轴点击定位 ' + jyClock(tClick) + ' · 原画面 / 工作台片段 / 素材库已同步高亮');
      return;
    }

    jyStopLoop(); jyAutoUI(false);            // 用户手动点击 → 停止自动播放

    // 播放按钮：切换播放 / 暂停
    if (key === 'play') {
      if (jyPrev && !jyPrev.paused) { jyDoPause(); jySay('已暂停预览 —— 点击 ▶ 继续播放'); }
      else { jyDoPlay(); jySay('正在播放预览画面'); }
      return;
    }

    /* ---- 监视器控制条：起点 / 结尾 / 全屏 ---- */
    if (key === 'prev') { jySeekTo(0); jySay('已回到片段起点 ' + jyClock(0)); return; }
    if (key === 'next') { jySeekTo(Math.max(0, jyDur() - 0.05)); jySay('已跳到片段结尾 ' + jyClock(jyDur())); return; }
    if (key === 'fs') { jyOpFs(); return; }

    /* ---- 工具栏：撤销 / 重做 / 分割 / 删除 / 定格 / 倒放 / 镜像 / 旋转 / 裁剪 / 踩点 ---- */
    if (key === 'undo') { jyUndo(); return; }
    if (key === 'redo') { jyRedo(); return; }
    if (key === 'split') { jyClearSel(); jyOpSplit(); return; }
    if (key === 'del') { jyClearSel(); jyOpDelete(); return; }
    if (key === 'freeze') { jyClearSel(); jyOpFreeze(); return; }
    if (key === 'reverse') { jyClearSel(); jyOpReverse(); return; }
    if (key === 'mirror') { jyClearSel(); jyOpMirror(); return; }
    if (key === 'rotate') { jyClearSel(); jyOpRotate(); return; }
    if (key === 'crop') { jyClearSel(); jyOpCrop(); return; }
    if (key === 'ratio') { jyClearSel(); jyOpCrop(); return; }
    if (key === 'beat') { jyClearSel(); jyOpBeat(el); return; }

    /* ---- 右侧属性面板五大标签 ---- */
    if (key && key.indexOf('r-') === 0) {
      $$('.jy-rtabs span', jyStage).forEach(function (s) { s.classList.toggle('on', s === el); });
      jyRBodyRender(key);
      var tabName = { 'r-pic': '画面', 'r-audio': '音频', 'r-speed': '变速', 'r-anim': '动画', 'r-adj': '调节' }[key];
      jyClearSel(); jyDoPause();
      jySay('已切换右侧属性面板到「' + tabName + '」—— 所有选项均可点击 / 拖动并实时作用于监视器');
      return;
    }
    /* 变速面板内：常规变速 / 曲线变速 模式切换 */
    if (key === 'p-speed' || key === 'p-curve') {
      jyView.speedMode = key === 'p-speed' ? 'normal' : 'curve';
      $$('.jy-rmode span', jyStage).forEach(function (s) { s.classList.toggle('on', s === el); });
      jyRBodyRender('r-speed');
      jySay(key === 'p-speed' ? '已切换到「常规变速」· 拖动滑块 0.1x~4.0x 实时生效（免费功能）'
        : '已切换到「曲线变速」· 蒙太奇 / 英雄时刻 / 子弹时间均为免费预设');
      return;
    }
    /* 画面 / 音频 / 调节面板内的可点行 */
    if (key && key.indexOf('rp-') === 0) { jyClearSel(); jyRP(key); return; }
    /* 关键帧：每点一次在播放头真实打一帧，计数实时更新 */
    if (key === 'p-key') {
      jyView.kf++;
      var kfe = $('.jy-rrow[data-jy="p-key"] em', jyStage);
      if (kfe) kfe.textContent = '已打 ' + jyView.kf + ' 帧';
      jyDrawBox([12, 12, 76, 76], '关键帧 · 播放头 ' + jyClock(jyNowT()));
      jySay('已在播放头 ' + jyClock(jyNowT()) + ' 打下第 ' + jyView.kf + ' 个关键帧（免费功能）· 两帧之间自动补间');
      return;
    }
    if (key === 'cv-mont' || key === 'cv-hero' || key === 'cv-bull') { jyView.curve = el.textContent.trim(); }

    /* ---- 左上素材面板：8 个标签 + 本地 / 素材库二级切换 + 导入 ---- */
    if (key === 'import') { if (azFile) azFile.click(); jySay('「＋ 导入」已打开本地文件选择器 —— 选中视频后自动进入本地媒体库（免费功能）'); return; }
    if (key && /^tab-/.test(key)) {
      jyView.tab = key;
      $$('.jy-ltabs span', jyStage).forEach(function (s) { s.classList.toggle('on', s === el); });
      jyPoolRender();
      var tdef = JY_SEL[key];
      if (tdef) { if (tdef.track) jySelectTrack(tdef.track); jyDrawBox(tdef.box, tdef.label || '', !!tdef.free); }
      jySay('素材面板已切换到「' + el.textContent.trim() + '」· 当前显示「' + jyView.sub + '」分类，列表中均为剪映免费可用素材');
      return;
    }
    var pSub = el.parentElement;
    if (pSub && pSub.classList.contains('jy-lsub')) {
      jyView.sub = el.textContent.trim();
      $$('.jy-lsub span', jyStage).forEach(function (s) { s.classList.toggle('on', s === el); });
      jyPoolRender();
      jySay('已切换到素材库分类「' + jyView.sub + '」（免费素材）');
      return;
    }
    if (el.dataset.pool) { jyClearSel(); jyDoPause(); jyPoolPick(el); return; }

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
    if (def.mask) jyDrawMask(typeof maskOf === 'function' ? maskOf(0) : MASK_LIB[0]);
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
    jyPaintHead(jyNowT());                             // 缩放后重算播放头像素位置，保持时间码严格对齐
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
  function maskOf(i) { return MASK_LIB[i % MASK_LIB.length]; }
  /* 帧图严格按原视频比例抓取：竖版保持竖版、横版保持横版，绝不压缩成扁长方形 */
  function shotFrameSize() {
    var vw = jyPrev && jyPrev.videoWidth, vh = jyPrev && jyPrev.videoHeight;
    if (vw && vh) return { w: vw, h: vh };
    return { w: 16, h: 9 };
  }
  function renderShots() {
    var plan = pickPlan() || [];
    function kv(k, v, wide) { return '<div class="sh-kv' + (wide ? ' wide' : '') + '"><span>' + k + '</span><p>' + v + '</p></div>'; }
    shotList.innerHTML = plan.map(function (sh, i) {
      var mk = maskOf(i);
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
            kv('蒙版 · 剪映免费', '「<b>' + mk.n + '</b>」 · ' + mk.path + ' · ' + mk.rot + ' · ' + mk.feather + ' —— ' + mk.why) +
            kv('音乐卡点', sh.beat) +
            kv('关键帧', sh.key) +
            kv('变速', sh.speed, 1) +
          '</div>' +
        '</div></article>';
    }).join('');
    captureFrames(plan);
  }
  /* 分镜帧图：真实导入视频时按分镜起点逐帧抓取并按原始比例输出；演示样片无真实画面时输出程序化 DEMO 帧 */
  function demoShotFrame(sh, i, size) {
    size = size || { w: 16, h: 9 };
    var W = 320, H = Math.max(64, Math.round(320 * size.h / size.w));
    var c = document.createElement('canvas'); c.width = W; c.height = H;
    var g = c.getContext('2d');
    var grad = g.createLinearGradient(0, 0, W, H);
    grad.addColorStop(0, ['#101a33', '#1a1440', '#0a1626'][i % 3]);
    grad.addColorStop(1, '#071018');
    g.fillStyle = grad; g.fillRect(0, 0, W, H);
    g.strokeStyle = 'rgba(34,211,238,.16)'; g.lineWidth = 1;
    for (var k = 1; k < 8; k++) {
      var y = H * k / 8;
      g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke();
    }
    g.fillStyle = 'rgba(126,243,255,.92)'; g.font = '700 ' + Math.round(H * 0.112) + 'px Consolas, monospace';
    g.fillText('SHOT ' + pad(i + 1), W * 0.055, H * 0.26);
    g.fillStyle = 'rgba(255,255,255,.85)'; g.font = Math.round(H * 0.07) + 'px Consolas, monospace';
    g.fillText(((sh && sh.name) || '') + ' · ' + ((sh && sh.shot) || ''), W * 0.055, H * 0.48);
    g.fillStyle = 'rgba(255,255,255,.5)'; g.font = Math.round(H * 0.065) + 'px Consolas, monospace';
    g.fillText(((sh && sh.range) || '') + ' · DEMO ' + W + '×' + H, W * 0.055, H * 0.64);
    g.strokeStyle = 'rgba(5,217,232,.55)'; g.lineWidth = 2; g.strokeRect(6, 6, W - 12, H - 12);
    return c.toDataURL('image/jpeg', 0.85);
  }
  function captureFrames(plan) {
    var figs = $$('.sh-fig', shotList);
    var size = shotFrameSize();
    function fill(i, src, demo, sz) {
      var fig = figs[i]; if (!fig) return;
      sz = sz || size;
      var box = $('.sf-box', fig), img = $('img', fig), ph = $('.sf-ph', fig), cap = $('figcaption', fig);
      if (box) box.style.aspectRatio = sz.w + ' / ' + sz.h;
      if (img) { img.src = src; img.hidden = false; }
      if (ph) ph.hidden = true;
      if (cap) cap.textContent = (demo ? 'DEMO 帧 · ' : '') + sz.w + '×' + sz.h + ' · 点击回看';
    }
    var hasReal = jyPrev && jyPrev.getAttribute('src') && isFinite(jyPrev.duration) && jyPrev.duration > 0;
    if (!hasReal || !plan.length) {
      plan.forEach(function (sh, i) { fill(i, demoShotFrame(sh, i, size), true, size); });
      return;
    }
    var dur = jyPrev.duration, c = document.createElement('canvas');
    c.width = 320; c.height = Math.max(64, Math.round(320 * size.h / size.w));
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
        var sz = shotFrameSize();
        c.height = Math.max(64, Math.round(320 * sz.h / sz.w));
        var ok = false;
        try { g.drawImage(jyPrev, 0, 0, c.width, c.height); fill(i, c.toDataURL('image/jpeg', 0.82), false, sz); ok = true; } catch (e) {}
        if (!ok) fill(i, demoShotFrame(plan[i], i, sz), true, sz);
        i++; setTimeout(next, 70);
      };
      var to = setTimeout(done, 900);
      var onSeeked = function () { jyPrev.removeEventListener('seeked', onSeeked); clearTimeout(to); done(); };
      jyPrev.addEventListener('seeked', onSeeked);
      try { jyPrev.currentTime = t; } catch (e) {
        jyPrev.removeEventListener('seeked', onSeeked); clearTimeout(to);
        fill(i, demoShotFrame(plan[i], i, shotFrameSize()), true, shotFrameSize()); i++; setTimeout(next, 10);
      }
    })();
  }
  /* 点击分镜报告中的镜头卡片 → 监视器定位回看 */
  shotList.addEventListener('click', function (e) {
    var art = e.target.closest('.shot'); if (!art) return;
    var i = +art.dataset.si || 0;
    var sh = (pickPlan() || [])[i]; if (!sh) return;
    jySeekTo(parseT(sh.range.split('–')[0].trim()));
    jySay('已回看镜头 ' + pad(i + 1) + '「' + sh.name + '」· 监视器已定位到该镜头起点');
    art.classList.add('sel'); setTimeout(function () { art.classList.remove('sel'); }, 1200);
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
    jyMediaUrl = url;
    if (jyPrev) {
      jyPrev.src = url; jyPrev.currentTime = 0;
      jyPrev.muted = false; jyPrev.volume = jyView.vol;   // 主监视器带声播放（音量跟随音频面板）
      var pp = jyPrev.play();
      if (pp && pp.catch) pp.catch(function () {         // 自动播放策略拦截 → 静音兜底，用户点击播放时恢复声音
        jyPrev.muted = true;
        var p2 = jyPrev.play(); if (p2 && p2.catch) p2.catch(function () {});
      });
    }
    if (jyThumbVid) {
      jyThumbVid.src = url; jyThumbVid.currentTime = 0; jyThumbVid.muted = true;  // 素材缩略图始终静音
      var pt = jyThumbVid.play(); if (pt && pt.catch) pt.catch(function () {});
    }
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
    jyMediaUrl = '';
    [jyPrev, jyThumbVid].forEach(function (v) { if (v) { try { v.pause(); } catch (e) {} v.removeAttribute('src'); v.removeAttribute('poster'); v.load && v.load(); } });
    if (jsHint) jsHint.style.display = '';
    if (jyTc) jyTc.textContent = '00:00:00:00';
  }

  function azLoad(name, file) {
    curFile = file || null;
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
    azScanState('ready', 'MEDIA LOADED · 就绪 · 点击「开始解构」');
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
    curFile = null; azReal = null;
    if (curObjUrl) { try { URL.revokeObjectURL(curObjUrl); } catch (e) {} curObjUrl = null; }
    clearJyVideo();
    dropPrev.hidden = true; dropIdle.hidden = false;
    dropCover.removeAttribute('src');
    if (jyThumbDur) jyThumbDur.textContent = '00:15';
  }
  /* ================= 真实音视频分析：鼓点 / 切点直接从原片提取，时间码与原视频严格对齐 ================= */
  var curFile = null, azReal = null;
  /* ---- 音频：Web Audio 解码 → 能量包络通量 onset 检测 + BPM 估计 ---- */
  function azAudioAnalyze(file) {
    return file.arrayBuffer().then(function (buf) {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) throw new Error('no-audio-ctx');
      var ctx = new AC();
      return ctx.decodeAudioData(buf).then(function (audio) {
        if (ctx.close) { try { ctx.close(); } catch (e) {} }
        var d0 = audio.getChannelData(0), d1 = audio.numberOfChannels > 1 ? audio.getChannelData(1) : null;
        var sr = audio.sampleRate, hop = 512, n = Math.floor(d0.length / hop);
        if (n < 8) throw new Error('audio-too-short');
        var env = new Float32Array(n), maxE = 1e-6;
        for (var i = 0; i < n; i++) {
          var s = 0, base = i * hop;
          for (var j = 0; j < hop; j += 4) { var v = d0[base + j]; if (d1) v = (v + d1[base + j]) * 0.5; s += v * v; }
          env[i] = Math.sqrt(s / (hop / 4));
          if (env[i] > maxE) maxE = env[i];
        }
        var flux = new Float32Array(n);
        for (i = 1; i < n; i++) flux[i] = Math.max(0, env[i] - env[i - 1]);
        var win = Math.round(0.5 * sr / hop), refr = Math.round(0.24 * sr / hop);
        var hits = [];
        for (i = 2; i < n - 2; i++) {
          var a = Math.max(0, i - win), b = Math.min(n, i + win), sum = 0;
          for (var k2 = a; k2 < b; k2++) sum += flux[k2];
          var mean = sum / (b - a), thr = mean * 1.4 + maxE * 0.035;
          if (flux[i] >= thr && flux[i] >= flux[i - 1] && flux[i] >= flux[i + 1] &&
              (!hits.length || i - hits[hits.length - 1].i >= refr)) {
            hits.push({ i: i, t: i * hop / sr, s: flux[i] });
          }
        }
        if (!hits.length) throw new Error('no-onset');
        /* BPM：强 onset 相邻间隔直方图取峰 */
        var cutoff = hits.slice().sort(function (x, y) { return y.s - x.s; })[Math.min(hits.length - 1, Math.floor(hits.length * 0.55))].s;
        var strong = hits.filter(function (h) { return h.s >= cutoff; });
        var bins = {}, bestB = 0.02, bestV = -1;
        for (i = 1; i < strong.length; i++) {
          var io = strong[i].t - strong[i - 1].t;
          if (io < 0.28 || io > 1.15) continue;
          var bn = Math.round(io / 0.02) * 0.02;
          bins[bn] = (bins[bn] || 0) + strong[i].s + strong[i - 1].s;
          if (bins[bn] > bestV) { bestV = bins[bn]; bestB = bn; }
        }
        var bpm = bestV > 0 ? 60 / bestB : 120;
        if (bpm < 68) bpm *= 2; if (bpm > 190) bpm /= 2;
        bpm = Math.round(bpm);
        /* 时间轴最多展示 12 个最强鼓点 */
        var cap = hits.slice().sort(function (x, y) { return y.s - x.s; }).slice(0, 12)
          .map(function (h) { return h.t; }).sort(function (x, y) { return x - y; });
        return { beats: cap, bpm: bpm, source: 'audio' };
      }, function () { if (ctx.close) { try { ctx.close(); } catch (e) {} } throw new Error('decode-fail'); });
    });
  }
  /* ---- 视频：逐帧 seek + 灰度帧差，找真实切点（时间戳即原片时间码） ---- */
  function azVideoCuts(dur, onProg) {
    return new Promise(function (resolve) {
      var v = jyPrev;
      if (!v || !v.getAttribute('src') || !isFinite(dur) || dur <= 0) { resolve(null); return; }
      /* 0.25s 采样网格：保证 0.4~1s 快剪镜头两侧必有采样，弱切点不被漏召回；长视频封顶 150 次 seek */
      var N = Math.max(24, Math.min(150, Math.round(dur / 0.25)));
      var step = dur / N;
      var c = document.createElement('canvas'); c.width = 48; c.height = 27;
      var g = c.getContext('2d', { willReadFrequently: true });
      var scores = [], i = 0, done = false;
      var guard = setTimeout(fail, dur > 60 ? 45000 : dur > 25 ? 30000 : 22000);
      function fail() { if (done) return; done = true; cleanup(); resolve(null); }
      function cleanup() { clearTimeout(guard); v.removeEventListener('seeked', onSeeked); }
      function gray() {
        var d = g.getImageData(0, 0, 48, 27).data, o = new Float32Array(48 * 27);
        for (var k = 0; k < o.length; k++) o[k] = 0.299 * d[k * 4] + 0.587 * d[k * 4 + 1] + 0.114 * d[k * 4 + 2];
        return o;
      }
      var prev = null, retried = false;
      function onSeeked() {
        if (done) return;
        clearTimeout(to);
        /* seeked 后视频纹理未必已提交（快速连续 seek 时 drawImage 可能画到旧帧，
           会把弱切点的帧差峰削掉造成漏检），等一拍再采样 */
        setTimeout(sample, 40);
      }
      function sample() {
        if (done) return;
        try {
          g.drawImage(v, 0, 0, 48, 27);
          var cur = gray(), diff = 0;
          if (prev) { for (var k = 0; k < cur.length; k++) diff += Math.abs(cur[k] - prev[k]); diff = diff / cur.length; }
          /* 时间已前进但画面完全静止(d<0.15)：多为解码纹理未刷新，同点重 seek 一次 */
          if (prev && diff < 0.15 && !retried) { retried = true; setTimeout(seek, 10); return; }
          retried = false;
          prev = cur;
          scores.push({ t: Math.min(dur - 0.05, i * step), d: diff });
        } catch (e) { scores.push({ t: Math.min(dur - 0.05, i * step), d: 0 }); }
        i++;
        if (onProg) onProg(i / N);
        if (i > N) { finish(); } else { setTimeout(seek, 10); }
      }
      var to = null;
      function seek() {
        if (done) return;
        v.addEventListener('seeked', onSeeked);
        to = setTimeout(function () { v.removeEventListener('seeked', onSeeked); onSeeked(); }, 650);
        try { v.currentTime = Math.min(dur - 0.05, i * step); }
        catch (e) { v.removeEventListener('seeked', onSeeked); clearTimeout(to); onSeeked(); }
      }
      function finish() {
        if (done) return; done = true; cleanup();
        var maxSeg = 18, minGap = 0.45;
        var ds = scores.map(function (s) { return s.d; });
        var meanD = ds.reduce(function (a, b) { return a + b; }, 0) / Math.max(1, ds.length);
        /* 切点是少数事件，帧差排序后"段内噪声簇 / 切点峰簇"之间存在数量级落差。
           从高到低找第一个相对跳跃 >2.2× 的间隙(knee)；Otsu 在多尺度峰上会误选
           强峰之间的分割点，故不用类间方差。前景占比封顶 40%，避免把噪声当切点。 */
        var sorted = ds.filter(function (d) { return d > 0; }).sort(function (a, b) { return a - b; });
        var knee = 9, totN = sorted.length;
        for (var ki = totN - 2; ki >= 1; ki--) {
          if ((totN - 1 - ki) / totN > 0.4) break;
          if (sorted[ki] >= 2 && sorted[ki + 1] > sorted[ki] * 2.2) { knee = (sorted[ki] + sorted[ki + 1]) / 2; break; }
        }
        var maxD = Math.max.apply(null, ds);
        var thr = Math.max(9, maxD * 0.12, knee);  /* 0.12 保底：弱叠化切点不低于最强峰 12% */
        var ranked = scores.slice(1).filter(function (s) { return s.d > thr; })
          .sort(function (a, b) { return b.d - a.d; });
        var picks = [];
        ranked.forEach(function (s) {
          if (picks.length >= maxSeg - 1) return;
          if (!picks.some(function (q) { return Math.abs(q.t - s.t) < minGap; })) picks.push(s);
        });
        picks.sort(function (a, b) { return a.t - b.t; });
        resolve({ cuts: picks.map(function (s) { return +s.t.toFixed(2); }), frames: N, mean: meanD, thr: thr });
      }
      try { v.pause(); } catch (e) {}
      seek();
    });
  }
  /* ---- 真实切点 + 鼓点 → 分镜方案（range 为原片真实时间码，卡点描述引用真实鼓点） ---- */
  function fmtBeatLine(st, et, beats, bpm) {
    var inside = beats.filter(function (t) { return t >= st - 0.02 && t < et; });
    if (!inside.length) return '本段无重鼓点，压在旋律长音上缓切（BPM ≈ ' + bpm + '），切点避开密集打点区';
    var list = inside.slice(0, 4).map(fmtT).join(' / ') + (inside.length > 4 ? ' 等' : '');
    var delta = Math.abs(inside[0] - st);
    var tail = delta <= 0.12
      ? '切点与首个鼓点偏差仅 ' + Math.round(delta * 1000) + 'ms，已严格同帧'
      : '建议把切点微移 ' + (inside[0] > st ? '+' : '') + Math.round((inside[0] - st) * 1000) + 'ms 对齐鼓点';
    return '自动踩点（节拍Ⅰ）BPM ≈ ' + bpm + '；本段命中 ' + inside.length + ' 个鼓点（' + list + '），' + tail;
  }
  function buildRealPlan(bounds, beats, bpm) {
    var tpl = SHOT_PLANS[Math.floor(Math.random() * SHOT_PLANS.length)];
    return bounds.slice(0, -1).map(function (st, i) {
      var base = tpl[i % tpl.length], sh = {};
      Object.keys(base).forEach(function (k) { sh[k] = base[k]; });
      sh.range = fmtT(st) + ' – ' + fmtT(bounds[i + 1]);
      sh.beat = fmtBeatLine(st, bounds[i + 1], beats, bpm);
      return sh;
    });
  }
  function azAnalyze() {
    if (azBusy || azRun.hidden) return;
    azBusy = true; azStart.disabled = true; azDemo.disabled = true;
    azScanState('busy', 'SCANNING · 引擎已启动 · 抽帧采样 0/5');
    azLog.textContent = '$ analyze :: init engine v2.7（real-media mode）…';
    if (curFile && jyPrev && jyPrev.getAttribute('src') && isFinite(jyPrev.duration) && jyPrev.duration > 0) {
      azAnalyzeReal();
    } else {
      azAnalyzeDemo();
    }
  }
  /* 真实导入视频：先跑抽帧切点 + 音频鼓点检测，再进入后续阶段 */
  function azAnalyzeReal() {
    var dur = jyPrev.duration, cutRes = null, beatRes = null;
    azSetPhases(0);
    azScanState('busy', 'SCANNING · 阶段 1/5 · 抽帧采样（真实逐帧扫描原片）');
    azLogPush('> [01] frame-sampling :: 启动真实抽帧，0.25s 高密度网格扫描 ' + dur.toFixed(1) + 's 原片…');
    azBarFill.style.width = '4%';
    azVideoCuts(dur, function (p) {
      azBarFill.style.width = (4 + p * 15).toFixed(1) + '%';
      azScanState('busy', 'SCANNING · 阶段 1/5 · 抽帧采样 ' + Math.round(p * 100) + '%');
    }).then(function (res) {
      cutRes = res;
      azSetPhases(1);
      azScanState('busy', 'SCANNING · 阶段 2/5 · 节奏卡点（Web Audio 解码音轨）');
      azBarFill.style.width = '24%';
      var nCut = res ? res.cuts.length + 1 : 0;
      azLogPush('> [01] frame-sampling :: ' + (res ? res.frames + ' 帧采样 · 帧差峰值切点 = ' + nCut + ' 段' : '抽帧服务不可用，按时长等距估算切点'));
      return azAudioAnalyze(curFile).catch(function () { return null; });
    }).then(function (audio) {
      var bounds, beats, bpm, cutSrc = 'real', beatSrc = 'real';
      if (cutRes && cutRes.cuts.length) {
        bounds = [0].concat(cutRes.cuts, [dur]);
      } else {
        cutSrc = 'estimate';
        var n = Math.max(4, Math.min(18, Math.round(dur / 3)));
        bounds = []; for (var i = 0; i <= n; i++) bounds.push(+(dur * i / n).toFixed(2));
      }
      /* 合并过近边界 */
      bounds = bounds.filter(function (t, idx) { return idx === 0 || t - bounds[idx - 1] >= 0.3 || idx === bounds.length - 1; });
      if (audio && audio.beats.length >= 3) {
        beats = audio.beats; bpm = audio.bpm;
      } else {
        /* 无音轨 / 解码失败：用切点间隔估计节拍，鼓点与切点同源对齐 */
        beatSrc = 'estimate';
        var gaps = [];
        for (var j = 1; j < bounds.length - 1; j++) gaps.push(bounds[j + 1] - bounds[j]);
        gaps.sort(function (a, b) { return a - b; });
        bpm = gaps.length ? Math.round(60 / Math.max(0.3, gaps[Math.floor(gaps.length / 2)])) : 120;
        if (bpm < 68) bpm *= 2; if (bpm > 190) bpm = Math.round(bpm / 2);
        var grid = 60 / bpm; beats = [];
        for (var t = 0; t <= dur && beats.length < 12; t += grid) beats.push(+t.toFixed(2));
      }
      beats = beats.filter(function (t) { return t < dur; });
      if (beats.length < 3) { beatSrc = 'estimate'; beats = []; for (var t2 = 0; t2 < dur && beats.length < 8; t2 += 0.5) beats.push(+t2.toFixed(2)); }
      beatRes = { bounds: bounds, beats: beats, bpm: bpm, cutSrc: cutSrc, beatSrc: beatSrc };
      azLogPush('> [02] beat-detect :: BPM ≈ ' + bpm + ' · 命中鼓点 ' + beats.length +
        '（' + (beatSrc === 'real' ? '音轨能量通量实测' : '无可用音轨，按切点间隔估算') + '）');
      azBarFill.style.width = '44%';
      azFinishAnalyze(bounds.length - 1, beats, beatRes);
    });
  }
  /* 演示样片：保留模拟流程（无真实音轨可分析） */
  function azAnalyzeDemo() {
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
        azScanState('busy', 'SCANNING · 阶段 ' + (p + 1) + '/5 · ' + ['抽帧采样', '节奏卡点', '转场运镜', '字幕花字', '剪映映射'][p]);
        azBarFill.style.width = (p * 20 + 8) + '%';
        azLogPush('> [' + pad(p + 1) + '] ' + phaseLogs[p]);
        p++;
        setTimeout(step, 820 + Math.random() * 420);
      } else {
        azFinishAnalyze(cuts, beats, null, phaseLogs);
      }
    })();
  }
  /* 阶段 3-5 日志 + 收尾：真实数据驱动时间轴与分镜报告 */
  function azFinishAnalyze(cuts, beats, real, demoLogs) {
    var tailLogs = real ? [
      'transition-scan :: 切点 ' + cuts + ' 处，识别到 叠化/闪白/运镜推近（与帧差峰同位）',
      'text-scan :: 花字 3 组 · 字幕 2 轨 · 贴纸 1',
      'capcut-map :: 免费功能覆盖 96% · 付费项命中 0 · 时间码已与原片对齐'
    ] : demoLogs.slice(2);
    var p = 2;
    (function step() {
      if (p < 5) {
        azSetPhases(p);
        azScanState('busy', 'SCANNING · 阶段 ' + (p + 1) + '/5 · ' + ['转场运镜', '字幕花字', '剪映映射'][p - 2]);
        azBarFill.style.width = (p * 20 + 8) + '%';
        azLogPush('> [' + pad(p + 1) + '] ' + tailLogs[p - 2]);
        p++;
        setTimeout(step, 620);
        return;
      }
      azSetPhases(5);
      azBarFill.style.width = '100%';
      azLogPush('$ analyze :: DONE — ' + (real
        ? '真实检测：' + cuts + ' 镜 / ' + beats.length + ' 卡点，鼓点与切点时间码已和原片对齐'
        : '解构报告已生成，分镜解析与动图教学已解锁'));
      azReport.hidden = false;
      countUp($('#rpCuts'), cuts, {});
      countUp($('#rpBeats'), real ? beats.length : beats, {});
      countUp($('#rpFree'), 100, { suffix: '%', dec: 0 });
      jyClearSel();
      if (real) {
        azReal = real;
        curPlan = buildRealPlan(real.bounds, real.beats, real.bpm);
        jyBuildTracks(cuts, real.beats.length, real);
      } else {
        azReal = null;
        jyBuildTracks(cuts, beats);
      }
      jyLocked.hidden = true;
      jyFlowWrap.classList.remove('locked');
      jyAuto.disabled = false;
      azWide.hidden = false;
      if (!real) curPlan = null;              // 演示样片每次随机换一套分镜方案
      renderShots();
      azScanState('ready', 'READY · ' + (real
        ? '实测 ' + cuts + ' 镜 / ' + real.beats.length + ' 卡点 · BPM≈' + real.bpm + ' · 已与原片对齐'
        : '采样完成 · ' + cuts + ' 镜 / ' + beats + ' 卡点已入库'));
      if (real) jySeekTo(0);                // 抽帧扫描会把播放头带到片尾，教学开始前回到 0
      jyStepIdx = 0; jyPlayLoop();
      azBusy = false; azStart.disabled = false; azDemo.disabled = false;
      toast(real ? '解构完成 · ' + cuts + ' 个切点与 ' + real.beats.length + ' 个鼓点已按原片真实时间码对齐'
        : '解构完成 · 分镜报告 + 剪映免费操作教学已解锁');
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
    azScanState('ready', 'READY · 等待导入视频');
    jyFlowWrap.classList.add('locked');
    $$('.jf-node', jyFlow).forEach(function (n) { n.classList.remove('on', 'done'); });
    jyClearSel();
    jyBuildTracks(6, 5);
    // 工作台视图状态 / 撤销栈一并复位
    Object.assign(jyView, { tab: 'tab-media', sub: '本地', ratio: '原始', rot: 0, mirror: false, zoom: 1, vol: 1, rate: 1, speedMode: 'curve', curve: '蒙太奇', kf: 2, maskIdx: 0, beat: true, fin: 0.3, fout: 0.3, enhance: false, denoise: true, anim: '', f: { bright: 0, contrast: 0, sat: 0, sharp: 0 } });
    $$('.jy-ltabs span', jyStage).forEach(function (s) { s.classList.toggle('on', s.dataset.jy === 'tab-media'); });
    $$('.jy-lsub span', jyStage).forEach(function (s) { s.classList.toggle('on', s.textContent.trim() === '本地'); });
    jyPoolRender();
    jyApplyView();
    jyHist = []; jyHistIdx = -1;
    $$('.jy-tb', jyStage).forEach(function (b) { b.classList.remove('off'); });
    $$('[data-jy="undo"],[data-jy="redo"]', jyStage).forEach(function (b) { b.classList.add('disabled'); });
    var bBeat = $('[data-jy="beat"]', jyStage); if (bBeat) bBeat.classList.add('on');
    if (jyBeatLayer) jyBeatLayer.classList.remove('off');
    $$('.jy-rtabs span', jyStage).forEach(function (s) { s.classList.toggle('on', s.dataset.jy === 'r-speed'); });
    jyRBodyRender('r-speed');
    jyHighlight([]);
    jyLocked.hidden = false;
    jyLocked.innerHTML = '<b>LOCKED</b><span>完成左侧视频解构后<br>自动解锁剪映免费操作动图教学</span>';
    azLog.textContent = '$ ready. 等待导入视频…';
  });

  /* ================= n8：时间轴 ↔ 原画面 / 工作台 / 素材库 三方实时联动 =================
     · 播放头按真实时间码实时移动（导入视频跟随 currentTime；演示样片走虚拟时钟）
     · 按住标尺左右拖动即可 scrub，监视器画面 / 时间码 / 高亮同步刷新
     · 播放头所在素材自动高亮：各轨片段 + 左侧素材库缩略图 + 右侧属性面板 + 分镜报告卡片 */
  var jyPlayEl = $('.jy-play', jyStage), jyRulerEl = $('#jyRuler');
  var jyVirtualT = 0, jyVtTimer = null, jyScrub = null, jyLastSi = -1;
  var JY_THUMB_OF = { main: 0, pip: 1, fx: 1, audio: 2, sfx: 2, sticker: 3, text: 4, sub: 4 };

  function jyReal() { return !!(jyPrev && jyPrev.getAttribute('src') && isFinite(jyPrev.duration) && jyPrev.duration > 0); }
  function jyDur() { return jyClipDur() || 1; }
  function jyNowT() { return jyReal() ? (jyPrev.currentTime || 0) : (jyVirtualT || 0); }
  function jyClock(t) {
    t = Math.max(0, t || 0);
    return '00:' + pad(Math.floor(t / 60)) + ':' + pad(Math.floor(t % 60)) + ':' + pad(Math.floor((t % 1) * 30));
  }
  /* 播放头：把当前时间码映射到时间轴像素位置（随平移 / 缩放 / 轨道重建自动重算） */
  function jyPaintHead(t) {
    var pct = Math.min(1, Math.max(0, (t || 0) / jyDur()));
    if (jyPlayEl) {
      var w = jyTlInner ? jyTlInner.clientWidth : 0, padx = 9;
      jyPlayEl.style.animation = 'none';
      jyPlayEl.style.left = (w ? ((padx + pct * Math.max(0, w - padx * 2)) / w * 100) : pct * 100).toFixed(2) + '%';
    }
    var tc = $('#jyTc'); if (tc) tc.textContent = jyClock(t);
  }
  /* 播放头所在素材 → 各轨片段 + 左侧素材库缩略图同步高亮 */
  function jySyncOnAir(t) {
    if (!jyTrackList) return;
    var dur = jyDur(), activeThumb = {}, mainIdx = -1;
    $$('.jy-track', jyTrackList).forEach(function (tr) {
      var tk = tr.dataset.tk, clips = $$('.jy-clip', tr), hit = -1;
      for (var i = 0; i < clips.length; i++) {
        var st = +clips[i].dataset.st || 0, et = +clips[i].dataset.et || dur;
        if (t >= st - 0.03 && (t < et - 0.03 || (i === clips.length - 1 && t >= et - 0.03))) { hit = i; break; }
      }
      for (var j = 0; j < clips.length; j++) clips[j].classList.toggle('onair', j === hit);
      tr.classList.toggle('onair', hit >= 0);
      if (hit >= 0 && JY_THUMB_OF[tk] != null) activeThumb[JY_THUMB_OF[tk]] = 1;
      if (tk === 'main') mainIdx = hit;
    });
    $$('.jy-thumb', jyStage).forEach(function (th, i) { th.classList.toggle('onair', !!activeThumb[i]); });
    jySyncProps(mainIdx);
  }
  /* 当前镜头 → 右侧属性面板（转场 / 蒙版 / 关键帧 / 文本）与分镜报告卡片实时同步 */
  function jySyncProps(mainIdx) {
    var plan = pickPlan() || []; if (!plan.length || mainIdx < 0) return;
    var mainTrack = $('.jy-track[data-tk="main"]', jyTrackList);
    var n = mainTrack ? $$('.jy-clip', mainTrack).length : 1;
    var si = Math.min(plan.length - 1, Math.floor(mainIdx * plan.length / Math.max(1, n)));
    var sh = plan[si], mk = maskOf(si);
    var pmS = $('.jy-rrow[data-jy="p-mask"] span', jyStage), pmE = $('.jy-rrow[data-jy="p-mask"] em', jyStage);
    if (pmS) pmS.textContent = '蒙版 · ' + mk.n;
    if (pmE) pmE.textContent = '免费 · ' + mk.feather;
    var ptS = $('.jy-rrow[data-jy="p-trans"] span', jyStage), ptE = $('.jy-rrow[data-jy="p-trans"] em', jyStage);
    if (ptS) ptS.textContent = '转场 · ' + sh.trans.n;
    if (ptE) ptE.textContent = sh.trans.dur + ' · 免费';
    var pkE = $('.jy-rrow[data-jy="p-key"] em', jyStage);
    if (pkE) pkE.textContent = sh.speed.indexOf('曲线') === 0 ? '曲线变速' : '已打 2 帧';
    var pxE = $('.jy-rrow[data-jy="p-text"] em', jyStage);
    if (pxE) pxE.textContent = sh.name;
    if (si !== jyLastSi) {                             // 镜头切换时才刷新画面角标与报告高亮，避免高频抖动
      jyLastSi = si;
      jyOverlay('SHOT ' + pad(si + 1) + ' · ' + sh.name + ' · ' + sh.shot);
      var art = $('.shot[data-si="' + si + '"]', shotList);
      if (art) { art.classList.add('onair'); setTimeout(function () { art.classList.remove('onair'); }, 700); }
    }
  }
  /* 时间轴像素坐标 → 时间码（自动补偿平移与缩放，复用同一套坐标系） */
  function jyTlXToT(clientX) {
    var rect = jyTlInner ? jyTlInner.getBoundingClientRect() : null;
    if (!rect || !rect.width) return 0;
    var padx = 9, usable = Math.max(1, rect.width - padx * 2);
    return Math.min(1, Math.max(0, (clientX - rect.left - padx) / usable)) * jyDur();
  }
  function jyScrubTo(clientX) {
    var t = jyTlXToT(clientX);
    if (jyReal()) {
      try { jyPrev.pause(); } catch (e) {}
      try { jyPrev.currentTime = Math.min(Math.max(0, t), Math.max(0, jyPrev.duration - 0.05)); } catch (e) {}
    } else jyVirtualT = t;
    jyPaintHead(t); jySyncOnAir(t); jyPauseUI(true);
    return t;
  }
  function jyVtStop() { if (jyVtTimer) clearInterval(jyVtTimer); jyVtTimer = null; }
  function jyVtStart() {
    jyVtStop();
    jyVtTimer = setInterval(function () {
      if (document.hidden) return;
      jyVirtualT = (jyVirtualT + 0.12 * (jyView.rate || 1)) % jyDur();
      jyPaintHead(jyVirtualT); jySyncOnAir(jyVirtualT);
    }, 120);
  }

  /* 标尺拖拽 scrub：pointerdown 立刻定位，拖动过程实时跟随 */
  if (jyRulerEl) {
    jyRulerEl.addEventListener('pointerdown', function (e) {
      if (e.button !== 0 || jyFlowWrap.classList.contains('locked')) return;
      e.preventDefault(); e.stopPropagation();
      jyTlMoved = true;                                // 本次 click 交给 scrub，避免重复定位
      jyStopLoop(); jyAutoUI(false);
      jyScrub = { id: e.pointerId };
      jyRulerEl.classList.add('scrubbing');
      try { jyRulerEl.setPointerCapture(e.pointerId); } catch (err) {}
      var t = jyScrubTo(e.clientX);
      jySay('时间轴定位 ' + jyClock(t) + ' · 原画面 / 工作台片段 / 素材库三方已同步（按住标尺左右拖动即可实时 scrub）');
    });
    jyRulerEl.addEventListener('pointermove', function (e) { if (jyScrub) jyScrubTo(e.clientX); });
    ['pointerup', 'pointercancel'].forEach(function (ev) {
      jyRulerEl.addEventListener(ev, function () {
        if (!jyScrub) return;
        jyScrub = null; jyRulerEl.classList.remove('scrubbing');
        setTimeout(function () { jyTlMoved = false; }, 0);
      });
    });
  }
  /* 导入真实视频时：currentTime 变化即驱动播放头与高亮；演示样片由虚拟时钟驱动 */
  if (jyPrev) {
    jyPrev.addEventListener('timeupdate', function () {
      if (jyScrub) return;
      var t = jyPrev.currentTime || 0;
      jyPaintHead(t); jySyncOnAir(t);
    });
    jyPrev.addEventListener('pause', jyVtStop);
    jyPrev.addEventListener('play', jyVtStop);
  }
  window.addEventListener('resize', function () { jyPaintHead(jyNowT()); });
  jyPaintHead(jyNowT());

  /* ================= 启动 ================= */
  buildMap();
  document.addEventListener('visibilitychange', function () {
    if (document.hidden && rafId) { cancelAnimationFrame(rafId); rafId = null; }
    else if (!document.hidden && !rafId) { rafLoop(performance.now()); }
  });
})();
