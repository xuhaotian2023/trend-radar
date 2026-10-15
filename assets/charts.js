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

  window.addEventListener('resize', function () { charts.forEach(function (c) { c.resize(); }); });

  return {
    renderTopic: renderTopic,
    renderPlatformTrend: renderPlatformTrend
  };
})();
