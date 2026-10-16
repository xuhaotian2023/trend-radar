/* 光溯 GUANGSU · 动效与图表适配层（Motion One + ResizeObserver）
   职责：scroll reveal / stagger 入场 / 图表容器尺寸自适配。
   约束：不接管既有交互（.stag 入场、toast、overlay 仍由 app.js / CSS 负责）；
        仅在 Motion 可用且未开启「减少动态效果」时启用，否则直接显示内容。 */
(function () {
  'use strict';

  var docEl = document.documentElement;
  var M = window.Motion;
  var reduce = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  var motionOK = !!(M && typeof M.animate === 'function') && !reduce;
  var EASE = [0.22, 1, 0.36, 1];
  var MAX_DELAY = 0.34;

  /* 渐进增强：仅当动效可用时才启用 CSS 初始隐藏态，避免内容不可见 */
  if (motionOK) docEl.classList.add('gs-on');

  function show(el) { el.classList.add('gs-in'); }

  /* 动画结束即落 gs-in；另加 1.6s 看门狗兜底，杜绝动画异常导致内容停留在隐藏态 */
  function revealOne(el) {
    if (el.__gsIn) return;
    el.__gsIn = true;
    if (!motionOK) { show(el); return; }
    setTimeout(function () { show(el); }, 1600);
    try {
      var a = M.animate(el,
        { opacity: [0, 1], transform: ['translateY(14px)', 'translateY(0px)'] },
        { duration: 0.68, ease: EASE });
      if (a && a.finished) a.finished.then(function () { show(el); }, function () { show(el); });
      else show(el);
    } catch (e) { show(el); }
  }

  function revealGroup(box) {
    if (box.__gsIn) return;
    box.__gsIn = true;
    if (!motionOK) { show(box); return; }
    setTimeout(function () { show(box); }, 1600);
    try {
      M.animate(box,
        { opacity: [0, 1], transform: ['translateY(12px)', 'translateY(0px)'] },
        { duration: 0.6, ease: EASE });
      var kids = box.children;
      for (var i = 0; i < kids.length; i++) {
        M.animate(kids[i],
          { opacity: [0, 1], transform: ['translateY(12px)', 'translateY(0px)'] },
          { duration: 0.6, delay: Math.min(MAX_DELAY, 0.05 + i * 0.055), ease: EASE });
      }
    } catch (e) { /* 动画失败时由看门狗兜底显示 */ }
  }

  function dispatch(el) {
    if (el.classList.contains('gs-stagger')) revealGroup(el);
    else revealOne(el);
  }

  /* ---------- 1. 滚动揭示：视口相交后触发一次 ---------- */
  var targets = [];
  var list = document.querySelectorAll('.gs-reveal,.gs-stagger');
  for (var i = 0; i < list.length; i++) targets.push(list[i]);

  if (!('IntersectionObserver' in window) || !motionOK) {
    targets.forEach(function (el) { el.__gsIn = true; show(el); });
  } else {
    var io = new IntersectionObserver(function (entries) {
      for (var k = 0; k < entries.length; k++) {
        var en = entries[k];
        if (!en.isIntersecting) continue;
        io.unobserve(en.target);
        dispatch(en.target);
      }
    }, { rootMargin: '0px 0px -6% 0px', threshold: 0.06 });
    targets.forEach(function (el) { io.observe(el); });
    /* 兜底：当前视图内 1.8s 后仍未触发的元素直接显示，避免停留隐藏态
       （其它视图的元素交由滚动揭示，视口相交时再动画） */
    setTimeout(function () {
      var act = document.querySelector('.view.active');
      targets.forEach(function (el) {
        if (el.__gsIn) return;
        if (act && act.contains(el)) { el.__gsIn = true; show(el); }
      });
    }, 1800);
  }

  /* ---------- 2. 图表容器尺寸自适配（ECharts 宽度为 0 时会出现空图） ---------- */
  if (window.echarts && 'ResizeObserver' in window) {
    var HOST_SEL = '#pvTrend,#ovChart,[data-gs-chart]';
    function chartHosts() { return document.querySelectorAll(HOST_SEL); }

    var busy = false;
    function resizeCharts() {
      if (busy) return;
      busy = true;
      requestAnimationFrame(function () {
        busy = false;
        var hosts = chartHosts();
        for (var n = 0; n < hosts.length; n++) {
          var el = hosts[n];
          var inst = window.echarts.getInstanceByDom(el);
          if (inst && el.clientWidth > 0) inst.resize();
        }
      });
    }

    var ro = new ResizeObserver(resizeCharts);
    var seen = [];
    function scanHosts() {
      var hosts = chartHosts();
      for (var n = 0; n < hosts.length; n++) {
        if (seen.indexOf(hosts[n]) === -1) { seen.push(hosts[n]); ro.observe(hosts[n]); }
      }
    }
    scanHosts();

    var moBusy = false;
    var mo = new MutationObserver(function () {
      if (moBusy) return;
      moBusy = true;
      requestAnimationFrame(function () { moBusy = false; scanHosts(); resizeCharts(); });
    });
    mo.observe(document.body, { childList: true, subtree: true });

    window.addEventListener('resize', resizeCharts, { passive: true });
  }
})();
