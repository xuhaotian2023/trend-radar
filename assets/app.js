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
  function renderToday() {
    var all = [];
    D.platforms.forEach(function (p) { p.topics.forEach(function (t) { all.push({ p: p, t: t }); }); });
    all.sort(function (a, b) { return b.t.heat - a.t.heat; });

    // 今日榜首
    var champ = all[0], ch = $('#tdChamp');
    ch.setAttribute('data-plat', champ.p.id); ch.setAttribute('data-tid', champ.t.id);
    ch.innerHTML =
      '<span class="c-rank">NO.1</span>' +
      '<span class="c-main"><b>' + esc(champ.t.title) + '</b>' +
      '<span>' + champ.p.name + ' · ' + champ.t.cat + ' · 预估 ' + fmtWan(champ.t.est) + '</span></span>' +
      '<span class="c-heat">' + champ.t.heat.toFixed(1) + '</span>';
    ch.onclick = function () { openTopic(champ.p.id, champ.t.id); };
    ch.onkeydown = function (e) { if (e.key === 'Enter') openTopic(champ.p.id, champ.t.id); };

    // 急速上升 TOP 4
    var risers = all.slice().sort(function (a, b) { return b.t.growth - a.t.growth; }).slice(0, 4);
    $('#tdRisers').innerHTML = risers.map(function (o, i) { return tdRow(o, i, true); }).join('');
    tdBind($('#tdRisers'));

    // 今日全网热榜 TOP 10
    $('#tdRank').innerHTML = all.slice(0, 10).map(function (o, i) {
      return tdRow(o, i, false).replace('<span class="r-est">', '<span class="r-est" title="热度">');
    }).join('');
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
      jcNo = $('#jcNo'), jcTxt = $('#jcTxt'), jySteps = $('#jySteps');
  var azBusy = false, jyTimer = null, jyStepIdx = 0;

  /* 剪映动图教学步骤：位置为 stage 内百分比坐标；hi 为高亮目标元素 data-jy */
  var JY_STEPS = [
    { t: '点击「媒体」面板的【导入素材】，把解构出的原片拖入素材库（剪映专业版免费功能）', x: 15, y: 30, hi: ['import', 'tab-media'] },
    { t: '将素材拖到下方【时间轴】主轨道，粗剪出与原片一致的镜头顺序', x: 50, y: 82, hi: ['timeline'] },
    { t: '选中片段 → 右上【变速】→「曲线变速」选「蒙太奇」，免费复刻原片节奏', x: 84, y: 55, hi: ['p-speed'] },
    { t: '在镜头交界处点【转场】，选免费「叠化 / 闪白」，对齐解构出的鼓点位置', x: 84, y: 63, hi: ['p-trans'] },
    { t: '给关键帧打【关键帧 ⭐】+ 缓慢缩放，用「文本 → 花字」加免费花字字幕', x: 84, y: 71, hi: ['p-key', 'p-text'] },
    { t: '全部对齐后点右上【导出】，参数保持默认即可，全程未使用任何付费项', x: 91, y: 8, hi: ['export'] }
  ];

  function jyHighlight(keys) {
    $$('#jyStage [data-jy]').forEach(function (el) {
      if (keys.indexOf(el.dataset.jy) >= 0) el.classList.add('hi');
      else if (el.classList.contains('jy-tab') || el.classList.contains('jy-ptab') ||
               el.classList.contains('jy-import') || el.classList.contains('jy-timeline')) el.classList.remove('hi');
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
    jyStepIdx = idx % JY_STEPS.length;
    var s = JY_STEPS[jyStepIdx];
    jcNo.textContent = 'STEP ' + pad(jyStepIdx + 1) + ' / ' + pad(JY_STEPS.length);
    jyCursor.style.left = s.x + '%'; jyCursor.style.top = s.y + '%';
    jySpot.style.left = s.x + '%'; jySpot.style.top = s.y + '%';
    jyHighlight(s.hi);
    jyType(s.t);
    $$('.jy-chip', jySteps).forEach(function (c, i) { c.classList.toggle('on', i === jyStepIdx); });
  }
  function jyPlayLoop() {
    jyStopLoop();
    jyTimer = 1;
    (function tick() {
      if (jyTimer === null) return;
      jyShowStep(jyStepIdx);
      jyTimer = setTimeout(tick, 3600);
    })();
  }
  function jyStopLoop() {
    if (jyTimer && jyTimer !== 1) clearTimeout(jyTimer);
    jyTimer = null;
  }
  function jyBuildChips() {
    jySteps.innerHTML = JY_STEPS.map(function (s, i) {
      return '<button class="jy-chip" data-i="' + i + '">STEP ' + pad(i + 1) + '</button>';
    }).join('');
    $$('.jy-chip', jySteps).forEach(function (c) {
      c.addEventListener('click', function () {
        if (jyTimer === null) return; // 未解锁不响应
        jyStopLoop();
        jyShowStep(parseInt(c.dataset.i, 10));
        jyTimer = setTimeout(function tickLoop() {
          jyShowStep(jyStepIdx + 1);
          jyTimer = setTimeout(tickLoop, 3600);
        }, 3600);
      });
    });
  }
  jyBuildChips();

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
  function azLoad(name) {
    azRun.hidden = false; azReset.hidden = false; azReset.disabled = false;
    azFileName.innerHTML = '<i>▸</i> ' + esc(name);
    azStart.disabled = false;
    azLog.textContent = '$ load :: ' + esc(name) + ' — 就绪，点击「开始解构」';
    azBarFill.style.width = '0%'; azSetPhases(-1);
    azReport.hidden = true;
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
        azLogPush('$ analyze :: DONE — 解构报告已生成，右栏动图教学已解锁');
        azReport.hidden = false;
        countUp($('#rpCuts'), 8 + Math.floor(Math.random() * 9), {});
        countUp($('#rpBeats'), 4 + Math.floor(Math.random() * 7), {});
        countUp($('#rpFree'), 96, { suffix: '%', dec: 0 });
        jyLocked.hidden = true;
        jyStepIdx = 0; jyPlayLoop();
        azBusy = false; azStart.disabled = false; azDemo.disabled = false;
        toast('视频解构完成 · 剪映免费操作教学已解锁');
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
    if (f) azLoad(f.name);
  });
  azFile.addEventListener('change', function () {
    if (azFile.files && azFile.files[0]) azLoad(azFile.files[0].name);
  });
  azDemo.addEventListener('click', function () {
    azLoad('demo_trend_cut_' + pad(1 + Math.floor(Math.random() * 9)) + '.mp4（演示样片）');
  });
  azStart.addEventListener('click', azAnalyze);
  azReset.addEventListener('click', function () {
    jyStopLoop(); azBusy = false;
    azRun.hidden = true; azReport.hidden = true; azReset.hidden = true;
    azStart.disabled = true; azDemo.disabled = false; azFile.value = '';
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
