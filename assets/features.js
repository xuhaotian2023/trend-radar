/* 光溯 GUANGSU · 扩展功能装配层
 *   1) AI 未来热点预测（热点星图内）
 *   2) AI 运镜编排台（3D 火柴人预演）
 *   3) 真实实时数据的接入与来源标注
 *
 * 独立于 app.js，避免主交互文件继续膨胀；依赖：
 *   data.js / live.js / predict.js / cinematography.js / orchestrator.js / stage3d.js
 */
(function () {
  'use strict';

  var D = window.RADAR_DATA;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  function pad(n) { return n < 10 ? '0' + n : '' + n; }
  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;'); }

  /* ============================================================
     一、真实实时数据接入
     ============================================================ */
  var Live = window.GS_LIVE;
  var liveState = null;

  /* 平台配色（用于"真实/演示"标签着色） */
  function platTag(text, cls) { return '<span class="fc-plat ' + cls + '">' + esc(text) + '</span>'; }

  function applyLive() {
    liveState = Live.snapshot();
    /* 在星图分支节点与平台页顶部标注数据等级 */
    D.platforms.forEach(function (p) {
      var b = Live.snapshot().badgeOf(p.id);
      var node = $('.mnode[data-pid="' + p.id + '"]');
      if (node) {
        var host = $('.mn-name', node);
        if (host && !$('.mn-live', host)) {
          var tag = document.createElement('span');
          tag.className = 'mn-live ' + b.cls;
          tag.textContent = b.text;
          tag.title = b.tip;
          host.appendChild(tag);
        } else if ($('.mn-live', host)) {
          var ex = $('.mn-live', host);
          ex.className = 'mn-live ' + b.cls;
          ex.textContent = b.text;
          ex.title = b.tip;
        }
      }
    });
    updateLiveBanner();
    /* 预测与"实时"标签联动刷新 */
    renderForecast(true);
  }

  function updateLiveBanner() {
    var badge = $('#liveBadge');
    if (!badge) return;
    var s = Live.snapshot();
    if (s.mode === 'live') {
      var n = 0;
      Object.keys(s.sources).forEach(function (k) { if (s.sources[k] && s.sources[k].live) n++; });
      badge.title = '已连接真实实时数据：' + n + ' 个平台（抖音 / 哔哩哔哩 / 微博）· 缓存 60 秒';
      badge.classList.add('is-real');
    } else {
      badge.title = '未连接后端代理，当前展示内置演示数据。运行 node server.js 可获取真实实时热榜。';
      badge.classList.remove('is-real');
    }
  }

  if (Live) {
    Live.onUpdate(applyLive);
    Live.refresh();
    /* 每 60 秒拉一次，与服务端缓存周期对齐 */
    setInterval(function () { Live.refresh(); }, 60000);
  }

  /* ============================================================
     二、AI 未来热点预测
     ============================================================ */
  var fcPlat = 'all';        // 当前筛选平台
  var fcSelIdx = 0;          // 当前选中项
  var fcData = [];
  var fcInsights = [];

  function allTopics() {
    var all = [];
    D.platforms.forEach(function (p) { p.topics.forEach(function (t) { all.push({ p: p, t: t }); }); });
    return all;
  }

  function buildForecast() {
    var pool = allTopics();
    if (fcPlat !== 'all') pool = pool.filter(function (x) { return x.p.id === fcPlat; });
    fcData = window.GS_PREDICT.predict(pool, new Date().getHours());
    fcInsights = window.GS_PREDICT.insights(fcData);
  }

  /* ---- 预测曲线 SVG ---- */
  /* 曲线选样：不只取潜力分前 5（它们的走势往往雷同），
     而是混合「上行空间最大」「最快爆发」「不同类目」的候选，让对比真正有信息量。 */
  function pickCurveSet() {
    if (!fcData.length) return [];
    var out = [], seen = {};
    function take(o) { if (o && !seen[o.topic.id]) { seen[o.topic.id] = 1; out.push(o); } }
    take(fcData[0]);                                                        // 潜力最高
    var byGain = fcData.slice().sort(function (a, b) { return b.gain - a.gain; });
    take(byGain[0]);                                                        // 上行空间最大
    var byPeak = fcData.slice().sort(function (a, b) { return a.peakHour - b.peakHour; });
    take(byPeak[0]);                                                        // 最快爆发
    /* 补足不同类目，保证曲线形状有差异 */
    for (var i = 0; i < fcData.length && out.length < 5; i++) {
      if (!out.some(function (x) { return x.topic.cat === fcData[i].topic.cat; })) take(fcData[i]);
    }
    for (var j = 0; j < fcData.length && out.length < 5; j++) take(fcData[j]);
    return out;
  }

  function renderCurve() {
    var host = $('#fcChart');
    if (!host) return;
    var top = pickCurveSet();
    if (!top.length) { host.innerHTML = '<div class="fc-empty">暂无可用预测数据</div>'; return; }

    var W = 900, H = 230, PL = 46, PR = 16, PT = 16, PB = 30;
    var iw = W - PL - PR, ih = H - PT - PB;
    /* Y 轴范围：聚焦到实际数据区间，避免曲线因共用 0~100 轴而全部压平看不清趋势。
       演示数据热度集中在 81~96，若按 0~100 画则所有线几乎重合。 */
    var vals = [];
    top.forEach(function (o) { o.pts.forEach(function (p) { vals.push(p.v); }); });
    var vmin = Math.min.apply(null, vals), vmax = Math.max.apply(null, vals);
    var span = Math.max(1.2, vmax - vmin);
    var pad0 = Math.max(0.5, span * 0.22);
    vmin = Math.max(0, vmin - pad0); vmax = Math.min(100, vmax + pad0);
    if (vmax - vmin < 2) { var mid = (vmax + vmin) / 2; vmin = mid - 1; vmax = mid + 1; }

    var hours = top[0].pts.length - 1;
    var xOf = function (h) { return PL + (h / hours) * iw; };
    var yOf = function (v) { return PT + (1 - (v - vmin) / (vmax - vmin)) * ih; };

    var COLORS = ['#6d5efc', '#22d3ee', '#34d399', '#ffb75e', '#fb7185'];
    var s = '<svg viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none">';

    /* 横向网格 + Y 轴刻度 */
    for (var gi = 0; gi <= 4; gi++) {
      var vv = vmin + (vmax - vmin) * gi / 4;
      var yy = yOf(vv);
      s += '<line class="fc-grid-l" x1="' + PL + '" y1="' + yy.toFixed(1) + '" x2="' + (W - PR) + '" y2="' + yy.toFixed(1) + '"/>';
      s += '<text class="fc-lbl" x="' + (PL - 8) + '" y="' + (yy + 3).toFixed(1) + '" text-anchor="end">' + vv.toFixed(0) + '</text>';
    }
    /* X 轴：每 2 小时一格 */
    for (var hi = 0; hi <= hours; hi += 2) {
      var xx = xOf(hi);
      s += '<line class="fc-axis" x1="' + xx.toFixed(1) + '" y1="' + PT + '" x2="' + xx.toFixed(1) + '" y2="' + (H - PB) + '"/>';
      s += '<text class="fc-lbl" x="' + xx.toFixed(1) + '" y="' + (H - PB + 15) + '" text-anchor="middle">+' + hi + 'h</text>';
    }

    /* 每条曲线：面积 + 线 + 首尾点 */
    top.forEach(function (o, i) {
      var c = COLORS[i % COLORS.length];
      var pts = o.pts.map(function (p) { return xOf(p.h).toFixed(1) + ',' + yOf(p.v).toFixed(1); });
      var area = 'M' + xOf(0).toFixed(1) + ',' + yOf(vmin).toFixed(1) + ' L' +
        pts.join(' L') + ' L' + xOf(hours).toFixed(1) + ',' + yOf(vmin).toFixed(1) + ' Z';
      s += '<path class="fc-area" fill="' + c + '" d="' + area + '"/>';
      s += '<polyline class="fc-line" stroke="' + c + '" points="' + pts.join(' ') + '"/>';
      s += '<circle class="fc-dot" cx="' + xOf(0).toFixed(1) + '" cy="' + yOf(o.pts[0].v).toFixed(1) + '" r="3" fill="' + c + '"/>';
      s += '<circle class="fc-dot" cx="' + xOf(hours).toFixed(1) + '" cy="' + yOf(o.pts[hours].v).toFixed(1) + '" r="3" fill="' + c + '"/>';
    });

    /* 悬停交互层 */
    s += '<line class="fc-hover-line" id="fcHoverLine" x1="0" y1="' + PT + '" x2="0" y2="' + (H - PB) + '" style="display:none"/>';
    s += '<g id="fcTip" style="display:none">' +
      '<rect class="fc-tip-bg" rx="6" width="150" height="52"/>' +
      '<text class="fc-tip-t" x="10" y="19"></text>' +
      '<text class="fc-tip-v" x="10" y="36"></text>' +
      '<text class="fc-tip-v" x="10" y="48"></text>' +
      '</g>';
    s += '<rect class="fc-hit" x="' + PL + '" y="' + PT + '" width="' + iw + '" height="' + ih + '" id="fcHit"/>';
    s += '</svg>';
    host.innerHTML = s;

    /* 悬停：显示该小时各条曲线数值 */
    var hit = $('#fcHit'), hline = $('#fcHoverLine'), tip = $('#fcTip');
    if (!hit) return;
    function onMove(ev) {
      var r = host.getBoundingClientRect();
      var rel = (ev.clientX - r.left) / r.width * W;         // 换算到 viewBox 坐标
      var h = Math.round((rel - PL) / iw * hours);
      h = Math.max(0, Math.min(hours, h));
      var px = xOf(h);
      hline.setAttribute('x1', px); hline.setAttribute('x2', px);
      hline.style.display = '';
      var lines = top.map(function (o, i) {
        return { name: o.topic.title, v: o.pts[h].v, c: COLORS[i % COLORS.length], short: o.topic.title.slice(0, 12) };
      }).sort(function (a, b) { return b.v - a.v; });
      var tx = px + 12; if (tx > W - 160) tx = px - 162;
      tip.setAttribute('transform', 'translate(' + tx + ',' + (PT + 8) + ')');
      var tEls = tip.querySelectorAll('text');
      tEls[0].textContent = '未来 +' + h + ' 小时';
      if (lines[0]) { tEls[1].textContent = '▲ ' + lines[0].short + '  ' + lines[0].v.toFixed(1); tEls[1].setAttribute('fill', lines[0].c); }
      if (lines[1]) { tEls[2].textContent = '▲ ' + lines[1].short + '  ' + lines[1].v.toFixed(1); tEls[2].setAttribute('fill', lines[1].c); }
      tip.style.display = '';
    }
    hit.addEventListener('mousemove', onMove);
    hit.addEventListener('mouseleave', function () { hline.style.display = 'none'; tip.style.display = 'none'; });
    host.addEventListener('mousemove', onMove);
    host.addEventListener('mouseleave', function () { hline.style.display = 'none'; tip.style.display = 'none'; });
  }

  /* ---- 洞察条 ---- */
  function renderInsights() {
    var host = $('#fcInsights');
    if (!host) return;
    host.innerHTML = fcInsights.map(function (x) {
      return '<div class="fc-ins">' +
        '<div class="fi-cap"><i>' + x.icon + '</i>' + esc(x.t) + '</div>' +
        '<b title="' + esc(x.v) + '">' + esc(x.v) + '</b>' +
        '<span>' + esc(x.d) + '</span></div>';
    }).join('');
  }

  /* ---- 平台筛选标签 ---- */
  function renderTabs() {
    var host = $('#fcTabs');
    if (!host) return;
    var tabs = [{ id: 'all', name: '全网' }].concat(D.platforms.map(function (p) { return { id: p.id, name: p.name }; }));
    host.innerHTML = tabs.map(function (t) {
      return '<button data-p="' + t.id + '"' + (t.id === fcPlat ? ' class="on"' : '') + '>' + esc(t.name) + '</button>';
    }).join('');
    $$('button', host).forEach(function (b) {
      b.addEventListener('click', function () {
        fcPlat = b.dataset.p; fcSelIdx = 0;
        renderForecast(true);
      });
    });
  }

  /* ---- 潜力榜 ---- */
  function renderList() {
    var host = $('#fcList');
    if (!host) return;
    if (!fcData.length) { host.innerHTML = '<div class="fc-empty">暂无预测数据</div>'; return; }
    host.innerHTML = fcData.slice(0, 12).map(function (o, i) {
      var up = o.gain >= 0;
      return '<div class="fc-item' + (i === fcSelIdx ? ' on' : '') + '" data-i="' + i + '">' +
        '<span class="fc-rank">' + pad(i + 1) + '</span>' +
        '<div class="fc-mid">' +
          '<div class="fc-title" title="' + esc(o.topic.title) + '">' + esc(o.topic.title) + '</div>' +
          '<div class="fc-meta">' +
            '<span class="fc-plat" style="color:' + o.plat.color + ';border-color:' + o.plat.color + '66;background:' + o.plat.color + '18">' + esc(o.plat.name) + '</span>' +
            '<span class="fc-win ' + o.window.cls + '">爆发 ' + o.window.text + '</span>' +
            '<span class="fc-tag">' + esc(o.topic.cat) + ' · ' + esc(o.verdict.text) + '</span>' +
          '</div>' +
        '</div>' +
        '<div class="fc-right">' +
          '<div class="fc-gain' + (up ? '' : ' down') + '">' + (up ? '+' : '') + o.gain.toFixed(1) + '</div>' +
          '<div class="fc-arrow">12h 热度变化</div>' +
          '<div class="fc-conf"><div class="fc-conf-bar"><i style="width:' + o.conf + '%"></i></div>' +
          '<div class="fc-conf-t">置信度 ' + o.conf + '%</div></div>' +
        '</div>' +
      '</div>';
    }).join('');
    $$('.fc-item', host).forEach(function (el) {
      el.addEventListener('click', function () { fcSelIdx = +el.dataset.i; renderForecast(false); });
    });
  }

  /* ---- 详情 ---- */
  function renderDetail() {
    var host = $('#fcDetail');
    if (!host) return;
    var o = fcData[fcSelIdx];
    if (!o) { host.innerHTML = '<div class="fc-empty">选择左侧任意话题<br>查看逐小时推演依据与投放策略建议</div>'; return; }
    var t = o.topic, cyc = o.cycle;
    /* 迷你走势图 */
    var W = 320, H = 64, pd = 8;
    var vs = o.pts.map(function (p) { return p.v; });
    var mn = Math.min.apply(null, vs), mx = Math.max.apply(null, vs);
    if (mx - mn < 1.5) { mx = mn + 1.5; }
    var pts = o.pts.map(function (p, i) {
      var x = pd + (i / (o.pts.length - 1)) * (W - pd * 2);
      var y = pd + (1 - (p.v - mn) / (mx - mn)) * (H - pd * 2);
      return x.toFixed(1) + ',' + y.toFixed(1);
    }).join(' ');
    var peak = o.pts[o.peakHour];

    host.innerHTML =
      '<div class="fc-d-hd">' +
        '<span class="fc-d-plat" style="color:' + o.plat.color + ';border-color:' + o.plat.color + '66;background:' + o.plat.color + '18">' + esc(o.plat.name) + ' · ' + esc(t.cat) + '</span>' +
        '<h4>' + esc(t.title) + '</h4>' +
        '<div class="fc-d-verdict">' + esc(o.verdict.text) + ' —— ' + esc(o.verdict.desc) + '</div>' +
      '</div>' +

      '<div class="fc-d-sec"><h5>走势推演</h5>' +
        '<div class="fc-spark"><svg viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none">' +
          '<polyline class="fc-line" stroke="url(#fcGrad)" points="' + pts + '"/>' +
          '<defs><linearGradient id="fcGrad" x1="0" y1="0" x2="1" y2="0">' +
            '<stop offset="0%" stop-color="#6d5efc"/><stop offset="100%" stop-color="#22d3ee"/></linearGradient></defs>' +
        '</svg></div>' +
        '<div class="fc-kvs" style="margin-top:10px">' +
          '<div class="fc-kv"><span>当前热度</span><b>' + o.firstVal.toFixed(1) + '</b></div>' +
          '<div class="fc-kv"><span>预测峰值</span><b class="up">' + peak.v.toFixed(1) + '</b></div>' +
          '<div class="fc-kv"><span>峰值时间</span><b>+' + o.peakHour + ' 小时</b></div>' +
          '<div class="fc-kv"><span>12h 后预估</span><b class="' + (o.gain >= 0 ? 'up' : 'dn') + '">' + o.lastVal.toFixed(1) + '</b></div>' +
        '</div>' +
      '</div>' +

      '<div class="fc-d-sec"><h5>推演依据</h5><div class="fc-reasons">' +
        '<div class="fc-reason"><i>◆</i><span>当前增速 <b>' + (t.growth || 0).toFixed(1) + '%</b>，动量项决定短期上行斜率</span></div>' +
        '<div class="fc-reason"><i>◆</i><span>类目周期：<b>' + esc(cyc.label) + '</b>（生命周期约 ' + cyc.life + ' 小时）</span></div>' +
        '<div class="fc-reason"><i>◆</i><span>平台饱和度 <b>' + (o.plat.saturation || '—') + '</b>，越接近饱和上行越受限</span></div>' +
        '<div class="fc-reason"><i>◆</i><span>数据置信度 <b>' + (t.confidence || '—') + '</b>，模型综合判定 ' + o.conf + '%</span></div>' +
      '</div></div>' +

      '<div class="fc-d-sec"><h5>投放建议</h5>' +
        '<div class="fc-advice">' + adviceFor(o) + '</div>' +
      '</div>' +

      '<div class="fc-d-sec"><h5>模型说明</h5>' +
        '<div class="fc-reason"><i>※</i><span style="color:var(--muted)">' + esc(window.GS_PREDICT.modelNote) + '</span></div>' +
      '</div>';
  }

  function adviceFor(o) {
    var w = o.window.text, v = o.verdict.k;
    var base = '<b>建议在爆发窗口前完成发布</b>（' + w + '内）。';
    if (v === 'rise' && o.peakHour <= 3) {
      return base + '该话题动量强、即将进入峰值，适合<b>快速跟拍同题材</b>并抢占早期流量，标题直接挂话题词。';
    }
    if (v === 'rise') {
      return base + '上行斜率平稳，适合做<b>深度内容</b>（教程 / 盘点 / 拆解），用长尾承接持续流量。';
    }
    if (v === 'flat') {
      return base + '热度已到高位平台，<b>靠差异化角度切入</b>比追同题更有效，例如反向观点、幕后视角或跨领域嫁接。';
    }
    return base + '该话题已见顶，<b>不建议直接跟拍</b>；可观察其衍生的二级话题或等待类目轮动。';
  }

  function renderForecast(rebuild) {
    if (rebuild) { buildForecast(); renderTabs(); renderInsights(); }
    if (fcSelIdx >= fcData.length) fcSelIdx = 0;
    renderCurve();
    renderList();
    renderDetail();
    var sub = $('#fcCurveSub');
    if (sub) {
      var top = fcData.slice(0, 5);
      sub.textContent = top.length
        ? '未来 12 小时热度走势 · 展示潜力前 ' + top.length + ' 名 · 悬停查看逐小时数值'
        : '未来 12 小时热度走势';
    }
  }

  /* ============================================================
     三、AI 运镜编排台
     ============================================================ */
  var stage = null, stageReady = false, plan = null, curMoveIdx = 0, rafProg = 0;
  var curEnvId = null, curEnvManual = false, curAnimal = 'none';

  /* 可切换的预演场景（id 与 scene-env.js / cinematography.js 对齐） */
  var ENV_LIST = [
    { id: 'indoor-window', short: '室内窗边', tip: '单侧窗光 · 柔和侧光，适合家居/日常/治愈' },
    { id: 'cafe-mood', short: '咖啡馆', tip: '窗光 + 暖色吊灯，适合探店/下午茶/聊天' },
    { id: 'street-night', short: '夜景街头', tip: '霓虹冷暖对冲 + 路灯，适合探店/都市/情绪' },
    { id: 'sports-arena', short: '天台/运动', tip: '顶光 + 侧逆光，适合运动/热血/竞技' },
    { id: 'studio-clean', short: '棚拍', tip: '主柔光 + 侧逆光勾边，适合产品/开箱/带货' },
    { id: 'outdoor-golden', short: '户外黄金', tip: '低角度暖阳逆光，适合旅行/户外/人像' },
    { id: 'rain-reflect', short: '雨后反光', tip: '街灯硬光 + 湿地倒影，适合氛围/情绪' },
    { id: 'generic', short: '通用外景', tip: '中性空间，未识别场景时的默认环境' }
  ];

  function syncModeButtons(mode) {
    var modes = $('#ocModes');
    if (!modes) return;
    $$('button', modes).forEach(function (b) { b.classList.toggle('on', b.dataset.m === mode); });
    var hint = $('#ocModeHint');
    if (hint) {
      hint.textContent = mode === 'follow'
        ? '跟机视角：这就是摄影师取景框里的画面 · 切回「环绕观察」可继续自由旋转'
        : mode === 'fly'
          ? '自由飞行：拖拽转向 · W/A/S/D 或方向键平移 · Q/E 升降 · 滚轮推进'
          : '环绕观察：拖动旋转 · 滚轮缩放 · 右键平移';
    }
    /* 跟机/飞行时预设视角不适用，置灰提示 */
    var views = $('#ocViews');
    if (views) views.classList.toggle('dim', mode !== 'orbit');
  }

  function syncEnvButtons() {
    var pick = $('#ocEnvPick');
    if (!pick) return;
    $$('button', pick).forEach(function (b) {
      var on = b.dataset.env === curEnvId;
      b.classList.toggle('on', on && !curEnvManual);
      b.classList.toggle('auto', on && curEnvManual);
    });
    /* 自动匹配时给一个额外标记，说明这是按描述选的 */
    if (curEnvId && !$('.oc-envpick button[data-env="' + curEnvId + '"]', document)) return;
    var line = $('#ocEnvLine');
    if (line && stage && stage.ok) {
      var info = stage.envInfo();
      var envDef = ENV_LIST.filter(function (e) { return e.id === info.id; })[0];
      if (envDef) {
        line.hidden = false;
        line.innerHTML = '当前场景：<b>' + esc(envDef.short) + '</b> · ' +
          esc(envDef.tip) + (info.light ? '　|　光线：' + esc(info.light) : '');
      } else {
        line.hidden = true;
      }
    }
  }

  function initOrchestra() {
    var ta = $('#ocText'), go = $('#ocGo'), samples = $('#ocSamples');
    if (!ta || !go) return;

    /* 灵感示例按钮 */
    if (samples && window.GS_ORCH) {
      samples.innerHTML = window.GS_ORCH.samples.map(function (s) {
        return '<button type="button" title="' + esc(s) + '">' + esc(s) + '</button>';
      }).join('');
      $$('button', samples).forEach(function (b) {
        b.addEventListener('click', function () { ta.value = b.textContent; ta.focus(); });
      });
    }

    go.addEventListener('click', runCompose);
    ta.addEventListener('keydown', function (e) {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); runCompose(); }
    });

    /* 舞台控制 */
    var playBtn = $('#ocPlay'), resetBtn = $('#ocReset');
    if (playBtn) {
      playBtn.addEventListener('click', function () {
        if (!stage || !stage.ok) return;
        if (stage.playing) { stage.pause(); playBtn.innerHTML = '<i>▶</i>播放预演'; }
        else { stage.play(); playBtn.innerHTML = '<i>❚❚</i>暂停'; }
      });
    }
    if (resetBtn) {
      resetBtn.addEventListener('click', function () {
        if (!stage || !stage.ok) return;
        stage.reset();
        if (playBtn) playBtn.innerHTML = '<i>▶</i>播放预演';
        paintProgress(0);
      });
    }
    var views = $('#ocViews');
    if (views) {
      $$('button', views).forEach(function (b) {
        b.addEventListener('click', function () {
          $$('button', views).forEach(function (x) { x.classList.toggle('on', x === b); });
          if (stage && stage.ok) stage.setOrbit(b.dataset.v);
          syncModeButtons('orbit');
        });
      });
    }

    /* 观察模式：环绕观察 / 跟机视角 / 自由飞行 */
    var modes = $('#ocModes');
    if (modes) {
      $$('button', modes).forEach(function (b) {
        b.addEventListener('click', function () {
          if (!stage || !stage.ok) return;
          stage.setCamMode(b.dataset.m);
          syncModeButtons(b.dataset.m);
        });
      });
    }

    /* 动物：无 / 猫 / 狗 */
    var animals = $('#ocAnimals');
    if (animals) {
      $$('button', animals).forEach(function (b) {
        b.addEventListener('click', function () {
          $$('button', animals).forEach(function (x) { x.classList.toggle('on', x === b); });
          curAnimal = b.dataset.a;
          if (stage && stage.ok) {
            stage.setAnimal(curAnimal);
            stage.invalidate();
          }
        });
      });
    }

    /* 场景环境切换 */
    var envPick = $('#ocEnvPick');
    if (envPick) {
      envPick.innerHTML = ENV_LIST.map(function (e) {
        return '<button data-env="' + e.id + '" title="' + esc(e.tip || '') + '">' + esc(e.short) + '</button>';
      }).join('');
      $$('button', envPick).forEach(function (b) {
        b.addEventListener('click', function () {
          if (!stage || !stage.ok) return;
          curEnvId = b.dataset.env;
          curEnvManual = true;
          stage.setEnvironment(curEnvId);
          /* 换场景后动物仍需在位（障碍区域已随场景更新） */
          if (curAnimal && curAnimal !== 'none') stage.setAnimal(curAnimal);
          stage.invalidate();
          syncEnvButtons();
        });
      });
    }

    /* 舞台惰性初始化：切到本视图且有方案时才建 WebGL 上下文 */
    window.addEventListener('resize', function () {
      if (stage && stage.ok) stage._resize();
    });  }

  function ensureStage() {
    if (stageReady) return;
    stageReady = true;
    var host = $('#ocStage');
    if (!host || !window.GS_STAGE3D) return;
    try {
      stage = window.GS_STAGE3D.create(host);
      var ok = stage.build();
      if (!ok) {
        var fail = $('#ocStageFail');
        if (fail) { fail.hidden = false; host.style.display = 'none'; }
        stage = null;
        return;
      }
      /* 播放进度回调 */
      stage._emitEnd = function () {
        var pb = $('#ocPlay'); if (pb) pb.innerHTML = '<i>▶</i>播放预演';
        paintProgress(1);
      };
      stage.setOrbit('free');
      stage.setMove((plan && plan.demo && plan.demo.mode) || 'dolly');
      /* 恢复用户此前选择的动物 */
      if (curAnimal && curAnimal !== 'none') stage.setAnimal(curAnimal);
      stage.reset();
      /* 进入可交互的静止状态，保证未播放时也能自由调视角 */
      stage.invalidate();
    } catch (e) {
      var f2 = $('#ocStageFail');
      if (f2) { f2.hidden = false; host.style.display = 'none'; }
      stage = null;
    }
  }

  /* 进度条 + 阶段文案：跟随 3D 播放 */
  function paintProgress(p) {
    var fill = $('#ocBarFill'), ph = $('#ocPhase');
    if (fill) fill.style.width = (p * 100).toFixed(1) + '%';
    if (!ph) return;
    if (!stage || !stage.ok || !stage.lastState) { ph.textContent = plan ? '就绪 · 点击播放预演' : '等待生成方案'; return; }
    var st = stage.lastState;
    ph.textContent = (st.label || '') + '   ' + (p * 100).toFixed(0) + '%';
  }
  function startProgLoop() {
    if (rafProg) cancelAnimationFrame(rafProg);
    (function tick() {
      rafProg = requestAnimationFrame(tick);
      if (!stage || !stage.ok) { paintProgress(0); return; }
      var p = stage.dur > 0 ? Math.min(1, stage.t / stage.dur) : 0;
      paintProgress(p);
    })();
  }

  function runCompose() {
    var ta = $('#ocText');
    var desc = (ta && ta.value || '').trim();
    if (!desc) {
      ta && ta.focus();
      ta && ta.classList.add('oc-shake');
      setTimeout(function () { ta && ta.classList.remove('oc-shake'); }, 500);
      return;
    }
    plan = window.GS_ORCH.compose(desc);
    if (!plan) return;
    renderPlan(plan);
    /* 先让结果面板可见（canvas 容器此时才有真实尺寸），再初始化 3D */
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        ensureStage();
        if (stage && stage.ok) {
          stage._resize();
          /* 按方案里的场景自动搭建对应环境（用户手动选择过则不覆盖） */
          if (plan.scene && window.GS_ENV && window.GS_ENV.has(plan.scene.id)) {
            if (!curEnvManual || !curEnvId) {
              curEnvId = plan.scene.id;
              curEnvManual = false;
              stage.setEnvironment(curEnvId);
            }
          } else if (!curEnvId) {
            curEnvId = 'generic';
            curEnvManual = false;
            stage.setEnvironment(curEnvId);
          }
          syncEnvButtons();
          if (plan.demo) { stage.setMove(plan.demo.mode); stage.reset(); }
          curMoveIdx = 0;
          syncMoveCards();
        }
        startProgLoop();
      });
    });
  }

  function renderPlan(p) {
    var res = $('#ocResult');
    if (res) res.hidden = false;

    var tone = $('#ocTone'), scene = $('#ocScene'), dur = $('#ocDur'), cnt = $('#ocCount');
    if (tone) tone.textContent = p.tone;
    if (scene) scene.textContent = p.scene ? p.scene.name : '通用外景';
    if (dur) dur.textContent = '约 ' + p.totalSec + ' 秒';
    if (cnt) cnt.textContent = p.picked.length + ' 个手法';

    /* 手法卡片 */
    var mv = $('#ocMoves');
    if (mv) {
      mv.innerHTML = p.picked.map(function (x, i) {
        var m = x.move;
        return '<div class="oc-mv' + (i === 0 ? ' on' : '') + '" data-i="' + i + '">' +
          '<div class="oc-mv-hd">' +
            '<b>' + esc(m.name) + '</b>' +
            '<span class="oc-mv-en">' + esc(m.en) + '</span>' +
            '<span class="oc-chip c-' + esc(m.cat) + '">' + esc(m.cat) + '</span>' +
            '<span class="oc-mv-lv">' + esc(m.level) + '</span>' +
          '</div>' +
          '<div class="oc-mv-why">' + esc(x.why) + '</div>' +
          '<div class="oc-mv-row"><span class="k">景别</span><span>' + esc(m.shot) + '</span></div>' +
          '<div class="oc-mv-row"><span class="k">运动</span><span>' + esc(m.move) + '</span></div>' +
          '<div class="oc-mv-row"><span class="k">器材</span><span>' + esc(m.gear) + '</span></div>' +
          '<div class="oc-mv-more">' +
            '<div class="oc-mv-why" style="margin-bottom:6px"><b>为什么现在流行：</b>' + esc(m.why) + '</div>' +
            '<div class="oc-mv-row" style="margin-bottom:5px"><span class="k">步骤</span></div>' +
            '<ol class="oc-mv-steps">' + m.steps.map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('') + '</ol>' +
            '<div class="oc-mv-pf"><span class="k">避坑</span><span>' + m.pitfalls.map(esc).join(' / ') + '</span></div>' +
          '</div>' +
        '</div>';
      }).join('');
      $$('.oc-mv', mv).forEach(function (el) {
        el.addEventListener('click', function () {
          var i = +el.dataset.i;
          /* 第一次点击展开详情；再次点击收起 */
          var wasOpen = el.classList.contains('open');
          $$('.oc-mv', mv).forEach(function (x) { x.classList.remove('on', 'open'); });
          if (!wasOpen) el.classList.add('open');
          el.classList.add('on');
          curMoveIdx = i;
          /* 切换 3D 预演到该手法 */
          var m = p.picked[i].move;
          if (stage && stage.ok && m.demo) {
            stage.setMove(m.demo.mode);
            stage.reset();
            stage.play();
            var pb = $('#ocPlay'); if (pb) pb.innerHTML = '<i>❚❚</i>暂停';
            paintProgress(0);
          } else if (stage && stage.ok) {
            /* 该手法没有专属演示，退回整体方案演示 */
            stage.setMove((p.demo && p.demo.mode) || 'dolly');
            stage.reset();
          }
        });
      });
    }

    /* 分镜脚本 */
    var board = $('#ocBoard');
    if (board) {
      board.innerHTML = p.storyboard.map(function (s) {
        return '<div class="oc-shot">' +
          '<div class="oc-shot-hd">' +
            '<span class="oc-shot-no">SHOT ' + pad(s.no) + '</span>' +
            '<span class="oc-shot-dur">' + s.dur + 's</span>' +
          '</div>' +
          '<b>' + esc(s.move.name) + '</b>' +
          '<div class="oc-shot-shot">' + esc(s.shot) + ' · ' + esc(s.move.cat) + '</div>' +
          '<div class="oc-shot-cam">' + esc(s.camera) + '</div>' +
          '<div class="oc-shot-act">' + esc(s.action) + '</div>' +
        '</div>';
      }).join('');
    }

    /* 场景 */
    var sb = $('#ocSceneBox');
    if (sb) {
      if (p.scene) {
        sb.innerHTML = '<div class="oc-info">' +
            '<b>' + esc(p.scene.name) +
              '<span class="oc-match ' + (p.sceneMatched ? 'yes' : 'no') + '">' + (p.sceneMatched ? '已匹配你的描述' : '通用推荐') + '</span></b>' +
            '<div class="oc-info-row"><span class="k">光线条件</span><span>' + esc(p.scene.light) + '</span></div>' +
            '<div class="oc-info-row"><span class="k">最佳时段</span><span>' + esc(p.scene.best) + '</span></div>' +
            '<div class="oc-info-row"><span class="k">选择理由</span><span>' + esc(p.scene.why) + '</span></div>' +
            '<div class="oc-info-row"><span class="k">所需器材</span><span>' + esc(p.scene.gear) + '</span></div>' +
          '</div>';
      } else {
        sb.innerHTML = '<div class="oc-info"><b>通用外景</b>' +
          '<div class="oc-info-row"><span class="k">说明</span><span>描述里没有明确场景关键词，已按通用自然光条件给出方案。补充"室内 / 夜景 / 海边 / 咖啡店"等词可获得更精准建议。</span></div></div>';
      }
      /* 景别 */
      if (p.shots.length) {
        sb.innerHTML += '<div class="oc-info"><b>推荐景别组合</b>' +
          p.shots.map(function (s) {
            return '<div class="oc-info-row"><span class="k">' + esc(s.name) + '</span><span>' + esc(s.use) + '</span></div>';
          }).join('') + '</div>';
      }
    }

    /* 器材 */
    var gb = $('#ocGearBox');
    if (gb) {
      gb.innerHTML = p.gear.length ? p.gear.map(function (g) {
        return '<div class="oc-info"><b>' + esc(g.name) + '</b>' +
          (g.why ? '<div class="oc-info-row"><span class="k">作用</span><span>' + esc(g.why) + '</span></div>' : '') +
          (g.tips ? '<div class="oc-info-row"><span class="k">要点</span><span>' + esc(g.tips) + '</span></div>' : '') +
        '</div>';
      }).join('') : '<div class="oc-info"><b>手机即可</b><div class="oc-info-row"><span class="k">说明</span><span>该方案无需额外器材，用手机手持或简单倚靠即可完成。</span></div></div>';
    }

    var sub = $('#ocStageSub');
    if (sub) {
      sub.textContent = '演示手法：' + (p.demo ? p.demo.moveName : '整体方案') + ' · 火柴人 = 拍摄者与演员 · 拖动画面可自由旋转视角';
    }
  }

  function syncMoveCards() {
    var mv = $('#ocMoves');
    if (!mv) return;
    $$('.oc-mv', mv).forEach(function (el, i) { el.classList.toggle('on', i === curMoveIdx); });
  }

  /* ============================================================
     启动
     ============================================================ */
  function boot() {
    renderForecast(true);
    initOrchestra();
    updateLiveBanner();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  /* 暴露给 app.js 做视图切换时的钩子 */
  window.GS_EXT = {
    onViewEnter: function (name) {
      if (name === 'orchestra') {
        /* 切到运镜台时再建 WebGL，避免拖慢首屏 */
        if (plan) { ensureStage(); startProgLoop(); }
        if (stage && stage.ok) { stage.syncSize(); stage._applyOrbit(); }
      }
      if (name === 'map') renderForecast(true);
    },
    renderForecast: renderForecast
  };
})();
