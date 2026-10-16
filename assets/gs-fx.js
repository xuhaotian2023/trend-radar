/* 光溯 GUANGSU · Three.js 氛围层
   职责：极低对比度的粒子场 + 缓慢浮动的线框几何体，作为背景氛围，不抢主体信息。
   约束：指针穿透、置于所有内容之下；页面隐藏时暂停；「减少动态效果」时完全不加载。
        库或 WebGL 不可用时静默降级为纯 CSS 氛围层。 */
(function () {
  'use strict';

  var host = document.getElementById('bgFx');
  var T = window.THREE;
  if (!host || !T) return;
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  var scene, camera, renderer, group, orbs = [], raf = 0, clock, running = false;
  var pointerX = 0, pointerY = 0, curX = 0, curY = 0;

  function size() {
    var w = host.clientWidth || window.innerWidth;
    var h = host.clientHeight || window.innerHeight;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.6));
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  function build() {
    renderer = new T.WebGLRenderer({ alpha: true, antialias: false, powerPreference: 'low-power' });
    renderer.setClearColor(0x000000, 0);
    host.appendChild(renderer.domElement);

    scene = new T.Scene();
    camera = new T.PerspectiveCamera(58, 1, 0.1, 120);
    camera.position.set(0, 0, 7);
    clock = new T.Clock();

    group = new T.Group();
    scene.add(group);

    /* 粒子场：两簇配色（主色 / 辅助色），低透明度 */
    var small = window.innerWidth < 820;
    var count = small ? 460 : 1150;
    var pos = new Float32Array(count * 3);
    var col = new Float32Array(count * 3);
    var c1 = new T.Color(0x6d5efc);
    var c2 = new T.Color(0x22d3ee);
    for (var i = 0; i < count; i++) {
      var i3 = i * 3;
      pos[i3] = (Math.random() - 0.5) * 20;
      pos[i3 + 1] = (Math.random() - 0.5) * 12;
      pos[i3 + 2] = (Math.random() - 0.5) * 10 - 2;
      var t = Math.random();
      var c = c1.clone().lerp(c2, t);
      col[i3] = c.r; col[i3 + 1] = c.g; col[i3 + 2] = c.b;
    }
    var geo = new T.BufferGeometry();
    geo.setAttribute('position', new T.BufferAttribute(pos, 3));
    geo.setAttribute('color', new T.BufferAttribute(col, 3));
    var mat = new T.PointsMaterial({
      size: small ? 0.036 : 0.030,
      vertexColors: true,
      transparent: true,
      opacity: 0.5,
      depthWrite: false,
      blending: T.AdditiveBlending,
      sizeAttenuation: true
    });
    var points = new T.Points(geo, mat);
    group.add(points);

    /* 浮动几何体：两枚线框多面体，作为空间锚点 */
    var defs = [
      { p: [-3.6, 1.9, -5.2], r: 1.9, c: 0x6d5efc, o: 0.17, s: 1.0 },
      { p: [3.9, -2.1, -6.4], r: 2.5, c: 0x22d3ee, o: 0.12, s: -0.7 }
    ];
    for (var d = 0; d < defs.length; d++) {
      var df = defs[d];
      var oGeo = new T.IcosahedronGeometry(df.r, 1);
      var oMat = new T.MeshBasicMaterial({ color: df.c, wireframe: true, transparent: true, opacity: df.o });
      var orb = new T.Mesh(oGeo, oMat);
      orb.position.set(df.p[0], df.p[1], df.p[2]);
      orb.userData.speed = df.s;
      orbs.push(orb);
      group.add(orb);
    }

    size();
  }

  function frame() {
    raf = requestAnimationFrame(frame);
    var dt = clock.getDelta();
    var t = clock.elapsedTime;

    group.rotation.y += dt * 0.018;
    group.rotation.x = Math.sin(t * 0.05) * 0.035;

    for (var i = 0; i < orbs.length; i++) {
      var o = orbs[i];
      o.rotation.x += dt * 0.06 * o.userData.speed;
      o.rotation.y += dt * 0.045;
      o.position.y += Math.sin(t * 0.35 + i * 1.7) * dt * 0.05;
    }

    /* 指针视差：非常克制的位移，避免干扰阅读 */
    curX += (pointerX - curX) * 0.045;
    curY += (pointerY - curY) * 0.045;
    camera.position.x = curX * 0.42;
    camera.position.y = -curY * 0.30;
    camera.lookAt(0, 0, -2);

    renderer.render(scene, camera);
  }

  function play() {
    if (running) return;
    running = true;
    clock.getDelta();
    raf = requestAnimationFrame(frame);
  }
  function pause() {
    if (!running) return;
    running = false;
    cancelAnimationFrame(raf);
  }

  try {
    build();
  } catch (e) {
    if (renderer && renderer.domElement && renderer.domElement.parentNode) {
      renderer.domElement.parentNode.removeChild(renderer.domElement);
    }
    return;
  }

  var resizeTimer = 0;
  window.addEventListener('resize', function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(size, 150);
  }, { passive: true });

  window.addEventListener('pointermove', function (e) {
    pointerX = (e.clientX / window.innerWidth) * 2 - 1;
    pointerY = (e.clientY / window.innerHeight) * 2 - 1;
  }, { passive: true });

  document.addEventListener('visibilitychange', function () {
    if (document.hidden) pause(); else play();
  });

  play();
})();
