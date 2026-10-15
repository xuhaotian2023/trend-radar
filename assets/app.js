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
    if (name === 'summary') {
      renderSummaryOnce();
      setTimeout(function () { window.Charts.renderSummary(D); }, 420);
    }
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
    summary: '全站热点汇总',
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

  /* ================= 思维导图 ================= */
  var stage = $('#mapStage'), svg = $('#mapSvg');
  var POS = {
    douyin: [17, 25], bilibili: [50, 12], xiaohongshu: [83, 25],
    kuaishou: [17, 74], shipinhao: [83, 74]
  };

  function buildMap() {
    D.platforms.forEach(function (p, i) {
      var pos = POS[p.id];
      var node = document.createElement('button');
      node.className = 'mnode';
      node.style.setProperty('--p', p.color);
      node.style.setProperty('--p2', p.color2);
      node.style.setProperty('--p-glow', p.color + '55');
      node.style.setProperty('--d', (0.15 + i * 0.08) + 's');
      node.style.left = pos[0] + '%'; node.style.top = pos[1] + '%';
      node.setAttribute('aria-label', p.name + '分支');
      var top = p.topics[0];
      node.innerHTML =
        '<div class="mn-top">' +
          '<span class="mn-logo">' + p.name.charAt(0) + '</span>' +
          '<div class="mn-name">' + p.name + '<em>' + p.en + '</em></div>' +
          '<span class="mn-heat" id="heat-' + p.id + '">' + p.heat.toFixed(1) + '<i>HEAT</i></span>' +
        '</div>' +
        '<div class="mn-topic"><span class="tt">TOP1</span><b>' + esc(top.title) + '</b></div>' +
        '<div class="mn-foot"><span class="cnt">' + p.topicCount + ' 话题在榜</span>' + sparkSVG(p.trend, p.color) + '</div>' +
        '<span class="mn-go">进入分支 →</span>';
      node.addEventListener('click', function () {
        branchPulse(p.id, function () { bootRun(p.color, 'platform', function () { openPlatform(p.id); }); });
      });
      stage.appendChild(node);
    });

    // 汇总节点
    var sum = document.createElement('button');
    sum.className = 'mnode mnode-sum';
    sum.style.setProperty('--d', '0.62s');
    sum.style.left = '50%'; sum.style.top = '88%';
    sum.setAttribute('aria-label', '全站热点汇总');
    sum.innerHTML =
      '<span class="ms-t">全站热点汇总<em>CROSS-PLATFORM</em></span>' +
      '<span class="ms-d">' + totalTopics + ' 话题 · ' + fmtWan(totalEst) + ' 预估播放</span>' +
      '<span class="ms-go">查看跨平台榜单 →</span>';
    sum.addEventListener('click', function () { bootRun('#6d5efc', 'summary', function () { goView('summary'); }); });
    stage.appendChild(sum);

    drawLinks();
    // 中枢数字滚动
    countUp($('#hubTopics'), totalTopics, {});
    countUp($('#hubEst'), parseFloat((totalEst / 10000).toFixed(1)), { dec: 1, suffix: ' 亿' });
  }

  function nodeCenter(id) {
    var el = document.getElementById('heat-' + id).closest('.mnode');
    return [el.offsetLeft + el.offsetWidth / 2, el.offsetTop + el.offsetHeight / 2];
  }

  function drawLinks() {
    var w = stage.clientWidth, h = stage.clientHeight;
    if (w <= 0) return;
    var hx = w * 0.5, hy = h * 0.46;
    $$('.link, .link-glow, .flow', svg).forEach(function (e) { e.remove(); });
    var ns = 'http://www.w3.org/2000/svg';
    D.platforms.forEach(function (p) {
      var c = nodeCenter(p.id);
      var dx = c[0] - hx, dy = c[1] - hy, dist = Math.hypot(dx, dy);
      var x1 = hx + dx / dist * 122, y1 = hy + dy / dist * 122;
      var x2 = c[0] - dx / dist * 100, y2 = c[1] - dy / dist * 58;
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
    initParticles();
  }

  /* 连线粒子流动 */
  var particles = [], rafId = null;
  function initParticles() {
    particles = $$('.link', svg).map(function (path, i) {
      var c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      c.setAttribute('r', '2.6');
      c.setAttribute('fill', path.getAttribute('stroke'));
      c.setAttribute('filter', 'url(#glow)');
      svg.appendChild(c);
      return { path: path, dot: c, speed: 0.00009 + i * 0.000022, off: i * 0.37 };
    });
    if (!rafId) rafLoop(performance.now());
  }
  function rafLoop(now) {
    particles.forEach(function (o) {
      var len = o.path.getTotalLength();
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

  var resizeTimer = null;
  window.addEventListener('resize', function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () { if (currentView === 'map') drawLinks(); }, 180);
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

    var cards = p.topics.map(function (t, i) {
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
          '<div class="pv-topicsbox"><h3>在榜话题 · 实时抓取 TOP ' + p.topics.length + '</h3><p class="sub">点击话题查看剪辑手法 / 视频内核 / 流量预估完整分析</p>' + cards + '</div>' +
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

  /* ================= 汇总视图 ================= */
  var summaryRendered = false;
  function renderSummaryOnce() {
    if (summaryRendered) return;
    summaryRendered = true;
    var riseCount = 0, allTopics = [];
    D.platforms.forEach(function (p) {
      p.topics.forEach(function (t) {
        if (t.growth >= 15) riseCount++;
        allTopics.push({ p: p, t: t });
      });
    });
    allTopics.sort(function (a, b) { return b.t.heat - a.t.heat; });

    $('#sumKpis').innerHTML =
      '<div class="kpi"><div class="k-l">监测平台</div><div class="k-v">' + D.platforms.length + '<small>个</small></div><div class="k-bar"><i data-w="100"></i></div></div>' +
      '<div class="kpi"><div class="k-l">在榜话题总数</div><div class="k-v">' + totalTopics + '<small>个</small></div><div class="k-bar"><i data-w="86"></i></div></div>' +
      '<div class="kpi"><div class="k-l">总预估播放</div><div class="k-v">' + (totalEst / 10000).toFixed(2) + '<small>亿</small></div><div class="k-bar"><i data-w="92"></i></div></div>' +
      '<div class="kpi"><div class="k-l">急速上升话题</div><div class="k-v" style="color:var(--good)">+' + riseCount + '<small>个</small></div><div class="k-bar"><i data-w="' + (riseCount / allTopics.length * 100).toFixed(0) + '"></i></div></div>';

    $('#rankList').innerHTML = allTopics.slice(0, 10).map(function (o, i) {
      return '<div class="rank-row" data-plat="' + o.p.id + '" data-tid="' + o.t.id + '" role="button" tabindex="0">' +
        '<span class="rk">' + pad(i + 1) + '</span>' +
        '<span class="r-title">' + esc(o.t.title) + '</span>' +
        '<span class="r-plat" style="background:' + o.p.color + '">' + o.p.name + '</span>' +
        '<span class="r-cat">' + o.t.cat + '</span>' +
        '<span class="r-est">' + fmtWan(o.t.est) + '</span>' +
        '<span class="r-gr up">▲ ' + o.t.growth.toFixed(1) + '%</span>' +
      '</div>';
    }).join('') ;

    $$('#rankList .rank-row').forEach(function (row) {
      row.addEventListener('click', function () { openTopic(row.dataset.plat, row.dataset.tid); });
      row.addEventListener('keydown', function (e) { if (e.key === 'Enter') openTopic(row.dataset.plat, row.dataset.tid); });
    });
    $('#sumUpdated').textContent = '跨平台聚合 · 更新于 ' + D.updatedAt;
    setTimeout(function () {
      $$('#view-summary [data-w]').forEach(function (el) { el.style.width = el.dataset.w + '%'; });
    }, 300);
  }

  /* ================= 当日热点视图 ================= */
  var todayHourly = null;
  var TD_SECTIONS = [
    { id: 'all', name: '全部' },
    { id: 'game', name: '游戏', match: ['游戏', '电竞'] },
    { id: 'pet', name: '萌宠', match: ['萌宠', '宠物'] },
    { id: 'film', name: '影视娱乐', match: ['影视娱乐', '影视修复'] },
    { id: 'food', name: '美食', match: ['美食探店', '美食'] },
    { id: 'life', name: '生活', match: ['生活方式', '家居', '旅行攻略', '三农', '纪实', '创业'] },
    { id: 'knowledge', name: '知识', match: ['知识科普', '知识付费', '校园纪实', '硬核DIY', '职场剧情'] },
    { id: 'fashion', name: '时尚美妆', match: ['穿搭', '美妆', '时尚银发'] },
    { id: 'emotion', name: '情感', match: ['情感', '情感科技', '家国影像'] },
    { id: 'health', name: '健康', match: ['健康生活', '助眠声控', '手作', '家庭剧情'] }
  ];
  var tdCat = 'all';
  function tdFilter(list) {
    if (tdCat === 'all') return list;
    var sec = null;
    TD_SECTIONS.forEach(function (s) { if (s.id === tdCat) sec = s; });
    if (!sec || !sec.match) return list;
    return list.filter(function (o) { return sec.match.indexOf(o.t.cat) >= 0; });
  }
  function tdRenderCats(all) {
    $('#tdCats').innerHTML = TD_SECTIONS.map(function (s) {
      var n = s.id === 'all' ? all.length :
        all.filter(function (o) { return s.match && s.match.indexOf(o.t.cat) >= 0; }).length;
      if (n === 0 && s.id !== 'all') return '';
      return '<button role="tab" data-cat="' + s.id + '"' + (tdCat === s.id ? ' class="on"' : '') + '>' +
        s.name + '<span class="tc-n">' + n + '</span></button>';
    }).join('');
    $$('#tdCats button').forEach(function (b) {
      b.addEventListener('click', function () {
        if (tdCat === b.dataset.cat) return;
        tdCat = b.dataset.cat;
        renderToday(true);
      });
    });
  }
  function tdRow(o, i, showGrowth) {
    return '<div class="rank-row" data-plat="' + o.p.id + '" data-tid="' + o.t.id + '" role="button" tabindex="0">' +
      '<span class="rk">' + pad(i + 1) + '</span>' +
      '<span class="r-title">' + esc(o.t.title) + '</span>' +
      '<span class="r-plat" style="background:' + o.p.color + '">' + o.p.name + '</span>' +
      '<span class="r-cat">' + o.t.cat + '</span>' +
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

    if (!fromCat) tdRenderCats(all);
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
        '<span>' + champ.p.name + ' · ' + champ.t.cat + ' · 预估 ' + fmtWan(champ.t.est) + '</span></span>' +
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

    // 今日全网热榜 TOP 10
    $('#tdRank').innerHTML = list.length ? list.slice(0, 10).map(function (o, i) {
      return tdRow(o, i, false).replace('<span class="r-est">', '<span class="r-est" title="热度">');
    }).join('') : '<div class="td-empty">该分区今日暂无上榜话题</div>';
    tdBind($('#tdRank'));

    // 24 小时热度条（首次生成后保持，仅刷新榜首/榜单以跟随实时热度）
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
    $('#tdStrip').innerHTML = todayHourly.map(function (v, h) {
      return '<span class="hb' + (v === peak ? ' peak' : '') + '" data-h="' + pad(h) + ':00 · ' + v + '" ' +
             'style="height:' + v + '%;animation:riseIn .5s var(--ease) ' + (h * 0.028) + 's both"></span>';
    }).join('');

    var d = new Date();
    $('#tdUpdated').textContent = '今日 · 更新于 ' + pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds()) + ' · 跨平台实时聚合';
  }

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
    var plan = SHOT_PLANS[Math.floor(Math.random() * SHOT_PLANS.length)];
    function kv(k, v, wide) { return '<div class="sh-kv' + (wide ? ' wide' : '') + '"><span>' + k + '</span><p>' + v + '</p></div>'; }
    shotList.innerHTML = plan.map(function (sh, i) {
      return '<article class="shot" style="animation-delay:' + (i * 0.08).toFixed(2) + 's">' +
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
        '</div></article>';
    }).join('');
  }

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
    azLog.textContent = '$ analyze :: init engine v2.6 …';
    var phaseLogs = [
      'frame-sampling :: 120 帧 @ 30fps · detected cuts = ' + (8 + Math.floor(Math.random() * 9)),
      'beat-detect :: BPM ≈ ' + (95 + Math.floor(Math.random() * 45)) + ' · 命中鼓点 ' + (4 + Math.floor(Math.random() * 7)),
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
        countUp($('#rpCuts'), 5, {});
        countUp($('#rpBeats'), 4 + Math.floor(Math.random() * 7), {});
        countUp($('#rpFree'), 100, { suffix: '%', dec: 0 });
        jyLocked.hidden = true;
        jyFlowWrap.classList.remove('locked');
        jyAuto.disabled = false;
        azWide.hidden = false;
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
