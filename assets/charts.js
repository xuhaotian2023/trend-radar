/* 热点雷达 · ECharts 图表层 */
window.Charts = (function () {
  var cs = getComputedStyle(document.documentElement);
  var accent = cs.getPropertyValue('--accent').trim();
  var accent2 = cs.getPropertyValue('--accent2').trim();
  var ink = cs.getPropertyValue('--ink').trim();
  var muted = cs.getPropertyValue('--muted').trim();
  var rule = cs.getPropertyValue('--rule').trim();
  var good = cs.getPropertyValue('--good').trim();

  var charts = []; // 所有实例，统一 resize

  function mk(id) {
    var el = document.getElementById(id);
    if (!el) return null;
    var old = echarts.getInstanceByDom(el);
    if (old) { old.dispose(); }
    var c = echarts.init(el, null, { renderer: 'svg' });
    charts.push(c);
    return c;
  }

  function axisStyle() {
    return {
      axisLine: { lineStyle: { color: rule } },
      axisLabel: { color: muted, fontSize: 10.5 },
      splitLine: { lineStyle: { color: 'rgba(255,255,255,.05)' } },
      axisTick: { show: false }
    };
  }

  function tip(extra) {
    return Object.assign({
      trigger: 'axis', appendToBody: true,
      backgroundColor: 'rgba(13,20,36,.94)', borderColor: rule,
      textStyle: { color: ink, fontSize: 12 },
      axisPointer: { lineStyle: { color: 'rgba(255,255,255,.2)' } }
    }, extra || {});
  }

  /* ---------- 话题预估流量（近7日实际 + 未来3日预测） ---------- */
  function genCurve(id) {
    var h = 0;
    for (var i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
    return function () { h = (h * 1664525 + 1013904223) >>> 0; return h / 4294967296; };
  }

  function renderTopic(id, topic, color, color2) {
    var c = mk(id); if (!c) return;
    var rnd = genCurve(topic.id);
    var base = topic.est / 100 / 7 * 1.35; // 万/日 量级
    var actual = [], forecast = [], labels = [];
    var peakV = 0;
    for (var i = 0; i < 7; i++) {
      var v = Math.round(base * (0.42 + 0.58 * i / 6) * (0.88 + rnd() * 0.26));
      actual.push(v); forecast.push(null); if (v > peakV) peakV = v;
      labels.push('D-' + (6 - i));
    }
    labels.push('今日');
    for (var j = 1; j <= 3; j++) {
      forecast.push(Math.round(peakV * (1 - j * 0.17) * (0.92 + rnd() * 0.14)));
      labels.push('D+' + j);
    }
    // 让预测曲线与实际曲线衔接
    forecast[7] = actual[6];

    c.setOption({
      animationDuration: 750,
      grid: { left: 8, right: 14, top: 30, bottom: 6, containLabel: true },
      legend: {
        data: ['实际播放', '流量预测'], right: 0, top: 0,
        textStyle: { color: muted, fontSize: 11 }, itemWidth: 14, itemHeight: 8
      },
      tooltip: tip(),
      xAxis: Object.assign(axisStyle(), { type: 'category', data: labels, boundaryGap: false, splitLine: { show: false } }),
      yAxis: Object.assign(axisStyle(), { type: 'value', name: '万/日', nameTextStyle: { color: muted, fontSize: 10 } }),
      series: [
        {
          name: '实际播放', type: 'line', data: actual, smooth: .35, symbol: 'circle', symbolSize: 5,
          lineStyle: { color: color, width: 2.4 }, itemStyle: { color: color },
          areaStyle: {
            color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: color + '55' }, { offset: 1, color: color + '05' }])
          },
          markLine: {
            silent: true, symbol: 'none',
            lineStyle: { color: muted, type: 'dashed', width: 1 },
            label: { color: muted, fontSize: 10, formatter: '预测起点' },
            data: [{ xAxis: 6 }]
          }
        },
        {
          name: '流量预测', type: 'line', data: forecast, smooth: .35, symbol: 'emptyCircle', symbolSize: 5,
          lineStyle: { color: color2, width: 2, type: 'dashed' }, itemStyle: { color: color2 },
          areaStyle: {
            color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: color2 + '33' }, { offset: 1, color: color2 + '03' }])
          }
        }
      ]
    });
  }

  /* ---------- 平台近7日热度走势 ---------- */
  function renderPlatformTrend(id, p) {
    var c = mk(id); if (!c) return;
    var labels = [], d = new Date();
    for (var i = 7; i >= 0; i--) { var t = new Date(d - i * 864e5); labels.push((t.getMonth() + 1) + '/' + t.getDate()); }
    c.setOption({
      animationDuration: 800,
      grid: { left: 6, right: 12, top: 24, bottom: 4, containLabel: true },
      tooltip: tip(),
      xAxis: Object.assign(axisStyle(), { type: 'category', data: labels, boundaryGap: false, splitLine: { show: false } }),
      yAxis: Object.assign(axisStyle(), { type: 'value', min: 40, max: 100 }),
      series: [{
        name: '热度指数', type: 'line', data: p.trend, smooth: .4, symbol: 'circle', symbolSize: 5,
        lineStyle: { color: p.color, width: 2.6 }, itemStyle: { color: p.color },
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: p.color + '50' }, { offset: 1, color: p.color + '05' }])
        },
        markPoint: {
          symbolSize: 34, itemStyle: { color: p.color },
          label: { color: '#fff', fontSize: 10, fontFamily: 'Consolas' },
          data: [{ type: 'max', name: '峰值' }]
        }
      }]
    });
  }

  /* ---------- 汇总页三图 ---------- */
  var GROUP_MAP = {
    '职场剧情': '剧情娱乐', '家庭剧情': '剧情娱乐', '萌宠': '剧情娱乐',
    '知识科普': '知识教育', '知识付费': '知识教育', '校园纪实': '知识教育', '硬核DIY': '知识教育',
    '生活方式': '生活方式', '美食探店': '生活方式', '家居': '生活方式', '助眠声控': '生活方式', '创业': '生活方式',
    '情感科技': '情感共鸣', '情感': '情感共鸣', '家国影像': '情感共鸣',
    '穿搭': '时尚美妆', '美妆': '时尚美妆', '时尚银发': '时尚美妆',
    '三农': '三农纪实', '纪实': '三农纪实',
    '影视修复': '影视文娱', '旅行攻略': '旅行攻略'
  };

  function renderSummary(data) {
    var pls = data.platforms;

    // 1. 平台热度份额（玫瑰图）
    var c1 = mk('sShare');
    if (c1) c1.setOption({
      animationDuration: 800,
      tooltip: tip({ trigger: 'item', formatter: '{b}<br/>加权热度 {c}（{d}%）' }),
      series: [{
        type: 'pie', roseType: 'radius', radius: ['18%', '72%'], center: ['50%', '52%'],
        itemStyle: { borderRadius: 7, borderColor: 'rgba(7,11,20,.9)', borderWidth: 2 },
        label: { color: ink, fontSize: 11, formatter: '{b}' },
        labelLine: { lineStyle: { color: rule } },
        data: pls.map(function (p) { return { name: p.name, value: Math.round(p.heat * 10) / 10, itemStyle: { color: p.color } }; })
      }]
    });

    // 2. 全网24h走势（双序列）
    var c2 = mk('sTrend');
    if (c2) {
      var labels = [], heat = [], growth = [];
      var rnd = genCurve('sum24h');
      for (var i = 0; i < 12; i++) {
        labels.push((i * 2) + ':00');
        var day = Math.sin((i - 4) / 11 * Math.PI) * 34 + 46 + rnd() * 8; // 晚间峰
        heat.push(Math.round(Math.min(day, 98) * 10) / 10);
        growth.push(Math.round((6 + rnd() * 20) * 10) / 10);
      }
      c2.setOption({
        animationDuration: 800,
        grid: { left: 8, right: 8, top: 34, bottom: 4, containLabel: true },
        legend: { data: ['全网热度', '新话题增速%'], right: 0, top: 0, textStyle: { color: muted, fontSize: 11 }, itemWidth: 14, itemHeight: 8 },
        tooltip: tip(),
        xAxis: Object.assign(axisStyle(), { type: 'category', data: labels, boundaryGap: false, splitLine: { show: false } }),
        yAxis: Object.assign(axisStyle(), { type: 'value', min: 0, max: 100 }),
        series: [
          {
            name: '全网热度', type: 'line', data: heat, smooth: .45, symbol: 'none',
            lineStyle: { color: accent, width: 2.6 },
            areaStyle: {
              color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                { offset: 0, color: accent + '4d' }, { offset: 1, color: accent + '05' }])
            },
            markPoint: {
              symbolSize: 32, itemStyle: { color: accent },
              label: { color: '#fff', fontSize: 9.5, fontFamily: 'Consolas' },
              data: [{ type: 'max', name: '峰值' }]
            }
          },
          {
            name: '新话题增速%', type: 'line', data: growth, smooth: .45, symbol: 'none',
            lineStyle: { color: accent2, width: 1.8, type: 'dashed' }, itemStyle: { color: accent2 }
          }
        ]
      });
    }

    // 3. 话题赛道分布（横向条形）
    var c3 = mk('sCats');
    if (c3) {
      var agg = {};
      pls.forEach(function (p) {
        p.topics.forEach(function (t) {
          var g = GROUP_MAP[t.cat] || '其他';
          agg[g] = (agg[g] || 0) + t.est;
        });
      });
      var arr = Object.keys(agg).map(function (k) { return [k, agg[k]]; });
      arr.sort(function (a, b) { return a[1] - b[1]; });
      c3.setOption({
        animationDuration: 800,
        grid: { left: 8, right: 30, top: 10, bottom: 4, containLabel: true },
        tooltip: tip({ trigger: 'item', formatter: function (q) { return q.name + '<br/>预估播放 ' + (q.value / 10000).toFixed(2) + ' 亿'; } }),
        xAxis: Object.assign(axisStyle(), { type: 'value', splitLine: { lineStyle: { color: 'rgba(255,255,255,.05)' } }, axisLabel: { show: false } }),
        yAxis: Object.assign(axisStyle(), { type: 'category', data: arr.map(function (x) { return x[0]; }), splitLine: { show: false } }),
        series: [{
          type: 'bar', data: arr.map(function (x) { return x[1]; }),
          barWidth: 13, itemStyle: { borderRadius: [0, 7, 7, 0] },
          label: { show: true, position: 'right', color: muted, fontSize: 10.5, fontFamily: 'Consolas', formatter: function (q) { return (q.value / 10000).toFixed(1) + '亿'; } },
          itemStyle: { color: new echarts.graphic.LinearGradient(0, 0, 1, 0, [{ offset: 0, color: accent2 + '88' }, { offset: 1, color: accent }]) }
        }]
      });
    }
  }

  window.addEventListener('resize', function () { charts.forEach(function (c) { c.resize(); }); });

  return {
    renderTopic: renderTopic,
    renderPlatformTrend: renderPlatformTrend,
    renderSummary: renderSummary
  };
})();
