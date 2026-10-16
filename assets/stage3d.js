/* 光溯 GUANGSU · 3D 运镜预演台（three.js）
 *
 * 用途：用「火柴人」把拍摄方案演出来 —— 谁在拍、演员怎么走、镜头怎么动。
 *   · 火柴人演员：代表被拍的人，可沿轨迹移动、做动作
 *   · 火柴人摄影师：代表拍摄者，手里带一台"机身轮廓"，按运镜轨迹移动
 *   · 相机视锥：从摄影师位置射出的半透明视锥，直观显示"拍到了什么"
 *   · 自由视角：鼠标左键拖拽旋转、滚轮缩放、右键平移，可任意角度观察走位
 *
 * 设计约束：
 *   · 无 WebGL / 无 three.js 时静默降级，不影响页面其它功能
 *   · 仅在视图可见时渲染，切走或页面隐藏时暂停，避免空耗
 *   · 「减少动态效果」偏好下不自动播放，但仍可手动操作
 */
(function () {
  'use strict';

  var T = window.THREE;
  var host = null, api = null;

  /* ---------- 火柴人构造 ---------- */
  function makeStick(color, opts) {
    opts = opts || {};
    var g = new T.Group();
    var mat = new T.MeshBasicMaterial({ color: color });
    var lineMat = new T.LineBasicMaterial({ color: color, transparent: true, opacity: 0.95 });
    var headMat = new T.MeshBasicMaterial({ color: color, transparent: true, opacity: 0.9 });

    var s = opts.scale || 1;
    var headR = 0.15 * s;
    var seg = function (len) { return len * s; };

    /* 关节高度（相对地面） */
    var hipY = seg(0.82), shoulderY = seg(1.30), neckY = seg(1.36), headY = seg(1.52);

    /* 头 */
    var head = new T.Mesh(new T.SphereGeometry(headR, 14, 12), headMat);
    head.position.y = headY;
    g.add(head);

    /* 躯干：颈 → 胯 */
    var torsoGeo = new T.BufferGeometry().setFromPoints([
      new T.Vector3(0, neckY, 0), new T.Vector3(0, hipY, 0)
    ]);
    g.add(new T.Line(torsoGeo, lineMat));

    /* 四肢：用 Line 表示，便于每帧改端点做动作 */
    function limb(from, to) {
      var geo = new T.BufferGeometry().setFromPoints([from.clone(), to.clone()]);
      var line = new T.Line(geo, lineMat);
      g.add(line);
      return line;
    }
    var armL = limb(new T.Vector3(0, shoulderY, 0), new T.Vector3(-seg(0.30), seg(0.98), 0));
    var armR = limb(new T.Vector3(0, shoulderY, 0), new T.Vector3(seg(0.30), seg(0.98), 0));
    var legL = limb(new T.Vector3(0, hipY, 0), new T.Vector3(-seg(0.16), 0, 0));
    var legR = limb(new T.Vector3(0, hipY, 0), new T.Vector3(seg(0.16), 0, 0));

    /* 地面圆环，标明站位 */
    var ringMat = new T.MeshBasicMaterial({ color: color, transparent: true, opacity: 0.22, side: T.DoubleSide });
    var ring = new T.Mesh(new T.RingGeometry(seg(0.30), seg(0.34), 28), ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.006;
    g.add(ring);

    g.userData = { head: head, armL: armL, armR: armR, legL: legL, legR: legR,
      hipY: hipY, shoulderY: shoulderY, neckY: neckY, headY: headY, s: s, mat: mat, lineMat: lineMat };
    return g;
  }

  /* 更新四肢端点（用于走路摆臂 / 举相机等动作） */
  function poseLimb(line, from, to) {
    var p = line.geometry.attributes.position;
    p.setXYZ(0, from.x, from.y, from.z);
    p.setXYZ(1, to.x, to.y, to.z);
    p.needsUpdate = true;
    line.geometry.computeBoundingSphere();
  }

  /* ---------- 摄影师：火柴人 + 机身轮廓 ---------- */
  function makeShooter(color) {
    var g = makeStick(color, { scale: 1.0 });
    var d = g.userData;
    /* 机身：一个朝前的扁盒子 */
    var bodyMat = new T.MeshBasicMaterial({ color: color, transparent: true, opacity: 0.55 });
    var cam = new T.Mesh(new T.BoxGeometry(0.18, 0.13, 0.24), bodyMat);
    var camGrp = new T.Group();
    camGrp.add(cam);
    /* 镜头筒 */
    var lens = new T.Mesh(new T.CylinderGeometry(0.045, 0.05, 0.12, 12), bodyMat);
    lens.rotation.x = Math.PI / 2;
    lens.position.z = -0.16;
    camGrp.add(lens);
    g.add(camGrp);
    g.userData.camGrp = camGrp;
    return g;
  }

  /* ---------- 视锥：显示镜头拍到的范围 ---------- */
  function makeFrustum(color) {
    var g = new T.Group();
    /* 用线框锥体示意视野：底四角 + 顶点 */
    var fov = 52 * Math.PI / 180, dist = 1.7, aspect = 16 / 9;
    var hh = Math.tan(fov / 2) * dist, hw = hh * aspect;
    var apex = new T.Vector3(0, 0, 0);
    var c = [
      new T.Vector3(-hw, -hh, -dist), new T.Vector3(hw, -hh, -dist),
      new T.Vector3(hw, hh, -dist), new T.Vector3(-hw, hh, -dist)
    ];
    var lineMat = new T.LineBasicMaterial({ color: color, transparent: true, opacity: 0.5 });
    for (var i = 0; i < 4; i++) {
      g.add(new T.Line(new T.BufferGeometry().setFromPoints([apex.clone(), c[i].clone()]), lineMat));
      g.add(new T.Line(new T.BufferGeometry().setFromPoints([c[i].clone(), c[(i + 1) % 4].clone()]), lineMat));
    }
    /* 底面半透明面片，增强"拍到范围"的体量感 */
    var faceMat = new T.MeshBasicMaterial({ color: color, transparent: true, opacity: 0.10, side: T.DoubleSide, depthWrite: false });
    var face = new T.Mesh(new T.PlaneGeometry(hw * 2, hh * 2), faceMat);
    face.position.z = -dist;
    g.add(face);
    return g;
  }

  /* ---------- 轨迹线 ---------- */
  function makeTrack(color) {
    var mat = new T.LineBasicMaterial({ color: color, transparent: true, opacity: 0.75 });
    var geo = new T.BufferGeometry();
    geo.setAttribute('position', new T.BufferAttribute(new Float32Array(3 * 240), 3));
    geo.setDrawRange(0, 0);
    var line = new T.Line(geo, mat);
    line.frustumCulled = false;
    return line;
  }
  function setTrack(line, pts) {
    var arr = line.geometry.attributes.position.array;
    var n = Math.min(pts.length, 240);
    for (var i = 0; i < n; i++) {
      arr[i * 3] = pts[i].x; arr[i * 3 + 1] = pts[i].y; arr[i * 3 + 2] = pts[i].z;
    }
    line.geometry.attributes.position.needsUpdate = true;
    line.geometry.setDrawRange(0, n);
    line.geometry.computeBoundingSphere();
  }

  /* ---------- 身份标签：Canvas 纹理贴到 Sprite ---------- */
  function makeLabel(text, color) {
    try {
      var cv = document.createElement('canvas');
      var dpr = 2;
      cv.width = 160 * dpr; cv.height = 56 * dpr;
      var ctx = cv.getContext('2d');
      ctx.scale(dpr, dpr);
      /* 圆角底 */
      var w = 160, h = 56, r = 14;
      ctx.beginPath();
      ctx.moveTo(r, 0); ctx.lineTo(w - r, 0); ctx.quadraticCurveTo(w, 0, w, r);
      ctx.lineTo(w, h - r); ctx.quadraticCurveTo(w, h, w - r, h);
      ctx.lineTo(r, h); ctx.quadraticCurveTo(0, h, 0, h - r);
      ctx.lineTo(0, r); ctx.quadraticCurveTo(0, 0, r, 0); ctx.closePath();
      ctx.fillStyle = 'rgba(8,12,22,.82)';
      ctx.fill();
      ctx.lineWidth = 2; ctx.strokeStyle = color; ctx.stroke();
      ctx.fillStyle = color;
      ctx.font = '700 26px "Microsoft YaHei",sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(text, w / 2, h / 2 + 1);

      var tex = new T.CanvasTexture(cv);
      tex.minFilter = T.LinearFilter;
      var mat = new T.SpriteMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false });
      var sp = new T.Sprite(mat);
      sp.scale.set(0.86, 0.30, 1);
      sp.renderOrder = 999;
      return sp;
    } catch (e) { return null; }
  }

  /* ---------- 地面 ---------- */
  function makeFloor(scene) {
    var grid = new T.GridHelper(12, 24, 0x2a3550, 0x1a2136);
    grid.position.y = 0;
    scene.add(grid);
    /* 地面薄板，给火柴人一个落脚感 */
    var plate = new T.Mesh(
      new T.PlaneGeometry(12, 12),
      new T.MeshBasicMaterial({ color: 0x0a0f1c, transparent: true, opacity: 0.5 })
    );
    plate.rotation.x = -Math.PI / 2;
    plate.position.y = -0.002;
    scene.add(plate);
  }

  /* ---------- 主类 ---------- */
  function Stage(container) {
    this.host = container;
    this.ok = false;
    this.playing = false;
    this.t = 0;
    this.dur = 6;
    this.speed = 1;
    this.mode = 'orbit';
    this.params = {};
    this._raf = 0;
    this._built = false;
  }

  Stage.prototype.build = function () {
    if (this._built) return true;
    if (!T || !this.host) return false;
    try {
      this.renderer = new T.WebGLRenderer({ antialias: true, alpha: true });
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.8));
      this.renderer.setClearColor(0x000000, 0);
      this.host.appendChild(this.renderer.domElement);
      this.renderer.domElement.style.display = 'block';
      this.renderer.domElement.style.width = '100%';
      this.renderer.domElement.style.height = '100%';
      this.renderer.domElement.style.cursor = 'grab';
      this.renderer.domElement.style.touchAction = 'none';

      this.scene = new T.Scene();
      this.camera = new T.PerspectiveCamera(46, 1, 0.1, 200);
      /* 自由视角（轨道相机）：围绕场景中心旋转。
         目标点取场景几何中心（略高于地面），半径按舞台可视范围给定，
         否则火柴人会被挤到画面角落、大量留白。 */
      this.target = new T.Vector3(0, 0.75, 1.1);
      this.sph = { r: 7.4, theta: Math.PI * 0.28, phi: Math.PI * 0.36 };
      this._applyOrbit();

      this.clock = new T.Clock();
      makeFloor(this.scene);

      /* 演员（被拍对象） */
      this.actor = makeStick(0x7ef3ff, { scale: 1.0 });
      this.actor.position.set(0, 0, 0);
      this.scene.add(this.actor);

      /* 摄影师 */
      this.shooter = makeShooter(0xffb75e);
      this.scene.add(this.shooter);

      /* 视锥挂在摄影师上 */
      this.frustum = makeFrustum(0x6d5efc);
      this.shooter.userData.camGrp.add(this.frustum);

      /* 轨迹 */
      this.actorTrack = makeTrack(0x22d3ee);
      this.camTrack = makeTrack(0xffb75e);
      this.scene.add(this.actorTrack);
      this.scene.add(this.camTrack);

      /* 主体标记：演员头顶箭头 + 身份标签，强调"这是被拍的人" */
      var coneMat = new T.MeshBasicMaterial({ color: 0x7ef3ff, transparent: true, opacity: 0.75 });
      this.actorFlag = new T.Mesh(new T.ConeGeometry(0.10, 0.22, 4), coneMat);
      this.actorFlag.position.y = 1.95;
      this.actorFlag.rotation.x = Math.PI;
      this.scene.add(this.actorFlag);

      /* 身份标签：用 Sprite 在火柴人上方显示"演员 / 摄影师"，便于教学辨识 */
      this.actorLabel = makeLabel('演员', '#7ef3ff');
      this.shooterLabel = makeLabel('摄影师', '#ffb75e');
      if (this.actorLabel) this.scene.add(this.actorLabel);
      if (this.shooterLabel) this.scene.add(this.shooterLabel);

      this._bindOrbit();
      this._resize();
      this.syncSize();          // 布局未就绪时持续重试，保证绘制缓冲与容器一致
      /* 容器尺寸变化（例如父级从 hidden 变为可见）时自动同步绘制缓冲。
         没有这一步，canvas 会停留在 three.js 默认的 300x150，
         画面被拉伸、Sprite 标签小到看不见。 */
      if (typeof ResizeObserver === 'function') {
        var self = this;
        this._ro = new ResizeObserver(function () { self._resize(); });
        this._ro.observe(this.host);
      }
      this.ok = true;
      this._built = true;
      return true;
    } catch (e) {
      this.ok = false;
      return false;
    }
  };

  Stage.prototype._applyOrbit = function () {
    var r = this.sph.r * (this._fit || 1), th = this.sph.theta, ph = this.sph.phi;
    this.camera.position.set(
      this.target.x + r * Math.sin(ph) * Math.sin(th),
      this.target.y + r * Math.cos(ph),
      this.target.z + r * Math.sin(ph) * Math.cos(th)
    );
    this.camera.lookAt(this.target);
  };

  Stage.prototype._bindOrbit = function () {
    var self = this, el = this.renderer.domElement;
    var drag = null;
    el.addEventListener('pointerdown', function (e) {
      e.preventDefault();
      el.setPointerCapture && el.setPointerCapture(e.pointerId);
      drag = { x: e.clientX, y: e.clientY, btn: e.button, theta: self.sph.theta, phi: self.sph.phi,
               px: self.camera.position.x, py: self.camera.position.y, pz: self.camera.position.z };
      el.style.cursor = 'grabbing';
    });
    el.addEventListener('pointermove', function (e) {
      if (!drag) return;
      var dx = (e.clientX - drag.x) / Math.max(1, el.clientWidth);
      var dy = (e.clientY - drag.y) / Math.max(1, el.clientHeight);
      if (drag.btn === 2) {
        /* 右键平移：沿相机右向量与上向量移动目标点 */
        var right = new T.Vector3().setFromMatrixColumn(self.camera.matrix, 0);
        var up = new T.Vector3().setFromMatrixColumn(self.camera.matrix, 1);
        self.target.addScaledVector(right, -dx * 4.2);
        self.target.addScaledVector(up, dy * 4.2);
      } else {
        self.sph.theta = drag.theta - dx * Math.PI * 1.6;
        self.sph.phi = Math.min(Math.PI * 0.92, Math.max(Math.PI * 0.06, drag.phi - dy * Math.PI * 1.1));
      }
      self._applyOrbit();
    });
    ['pointerup', 'pointercancel'].forEach(function (ev) {
      el.addEventListener(ev, function () {
        drag = null; el.style.cursor = 'grab';
      });
    });
    el.addEventListener('wheel', function (e) {
      e.preventDefault();
      self.sph.r = Math.min(18, Math.max(1.6, self.sph.r * (1 + (e.deltaY > 0 ? 0.12 : -0.12))));
      self._applyOrbit();
    }, { passive: false });
    /* 屏蔽右键菜单以便右键平移 */
    el.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  };

  Stage.prototype.setOrbit = function (preset) {
    var P = {
      'free': { r: 7.4, theta: Math.PI * 0.28, phi: Math.PI * 0.36, ty: 0.75, tz: 1.1 },
      'top': { r: 8.2, theta: 0, phi: 0.14, ty: 0.0, tz: 1.1 },
      'front': { r: 6.6, theta: 0, phi: Math.PI * 0.44, ty: 0.85, tz: 1.0 },
      'side': { r: 6.6, theta: Math.PI * 0.5, phi: Math.PI * 0.44, ty: 0.85, tz: 1.0 },
      'close': { r: 4.4, theta: Math.PI * 0.22, phi: Math.PI * 0.38, ty: 0.95, tz: 0.9 }
    }[preset] || null;
    if (!P) return;
    this.sph.r = P.r; this.sph.theta = P.theta; this.sph.phi = P.phi;
    this.target.set(0, P.ty, P.tz == null ? 1.1 : P.tz);
    this._applyOrbit();
  };

  Stage.prototype._resize = function () {
    if (!this._built) return;
    var w = this.host.clientWidth || 0, h = this.host.clientHeight || 0;
    /* 布局尚未完成时不要写死 300x150（three.js 默认缓冲）——
       否则绘制缓冲会一直停在极小尺寸，画面被拉伸、Sprite 小到看不见。 */
    if (w < 2 || h < 2) return false;
    var pr = Math.min(window.devicePixelRatio || 1, 1.8);
    this.renderer.setPixelRatio(pr);
    this.renderer.setSize(w, h, false);
    var cvs = this.renderer.domElement;
    cvs.style.width = w + 'px';
    cvs.style.height = h + 'px';
    var aspect = w / Math.max(1, h);
    this.camera.aspect = aspect;
    /* 舞台通常是宽幅的：窄画布时自动拉远，避免火柴人出画 */
    this._fit = aspect < 1.5 ? 1.5 / Math.max(0.6, aspect) : 1;
    this.camera.updateProjectionMatrix();
    this._applyOrbit();
    return true;
  };
  /* 布局稳定前反复尝试同步缓冲尺寸 */
  Stage.prototype.syncSize = function () {
    var self = this, tries = 0;
    (function attempt() {
      if (!self._built) return;
      if (self._resize() || ++tries > 30) return;
      requestAnimationFrame(attempt);
    })();
  };

  /* ---------- 动作：按手法 id 生成"演员 + 摄影师"的走位与镜头运动 ---------- */
  Stage.prototype.setMove = function (moveId, opts) {
    this.mode = moveId || 'dolly';
    this.params = opts || {};
    this.t = 0;
    this._update(0, true);
  };

  /* 进度 p(0~1) → 位置；
     所有手法都在半径约 2 的空间内演示，保证火柴人始终在视野中。 */
  Stage.prototype._compute = function (p) {
    var m = this.mode;
    var A = { pos: new T.Vector3(0, 0, 0), face: 0 };          // 演员
    var C = { pos: new T.Vector3(0, 1.1, 3.0), face: Math.PI }; // 摄影师（含机身高度）
    var camLookAt = new T.Vector3(0, 1.0, 0);
    var label = '';

    if (m === 'orbit') {
      var a = -Math.PI * 0.55 + p * Math.PI * 1.10;   // 约 200° 环绕
      var r = 2.5;
      C.pos.set(Math.sin(a) * r, 1.05, Math.cos(a) * r);
      C.face = Math.atan2(A.pos.x - C.pos.x, A.pos.z - C.pos.z);
      label = '摄影师绕演员弧线移动，半径保持不变';
    } else if (m === 'dolly') {
      var from = this.params.from != null ? this.params.from : 3.2;
      var to = this.params.to != null ? this.params.to : 1.5;
      var d = from + (to - from) * p;
      var sgn = to >= from ? 1 : -1;
      C.pos.set(0, 1.05, d * sgn > 0 ? d : d);
      C.face = Math.atan2(A.pos.x - C.pos.x, A.pos.z - C.pos.z);
      label = (to < from ? '镜头匀速推进' : '镜头匀速后退揭示') + '：' + from.toFixed(1) + ' → ' + to.toFixed(1) + ' 米';
    } else if (m === 'follow') {
      var gap = this.params.gap || 1.8;
      /* 演员沿弧线走，摄影师保持等距跟随 */
      var aa = -Math.PI * 0.35 + p * Math.PI * 0.95;
      var rr = 1.5;
      A.pos.set(Math.sin(aa) * rr, 0, Math.cos(aa) * rr);
      A.face = aa + Math.PI / 2;
      var ca = aa - 0.42;                                // 摄影师落后一点角度
      C.pos.set(Math.sin(ca) * (rr + gap), 1.05, Math.cos(ca) * (rr + gap));
      C.face = Math.atan2(A.pos.x - C.pos.x, A.pos.z - C.pos.z);
      label = '摄影师与演员保持 ' + gap.toFixed(1) + ' 米等距跟随';
    } else if (m === 'crane') {
      var h = 1.1 + p * 2.3;
      var back = 2.4 + p * 1.4;
      C.pos.set(0, h, back);
      C.face = 0;
      camLookAt.set(0, Math.max(0.35, 1.0 - p * 0.5), 0);
      label = '摄影师垂直上升，镜头缓缓下俯';
    } else if (m === 'static') {
      C.pos.set(0, this.params.height != null ? this.params.height + 0.85 : 1.3, 2.6);
      C.face = 0;
      camLookAt.set(0, 1.15, 0);
      label = '机位固定，仅角度变化';
    } else if (m === 'whip') {
      /* 甩镜：摄影师原地快速转动朝向 */
      C.pos.set(0, 1.1, 2.4);
      var sw = -1 + p * 2;
      C.face = 0 + sw * 0.9;
      label = '原地快速甩动（0.2~0.3 秒），方向前后一致';
    } else if (m === 'ramp') {
      /* 变速：位置推进 + 用速度指示表现顿挫 */
      var dp = p < 0.45 ? p / 0.45 * 0.55 : (p < 0.72 ? 0.55 + (p - 0.45) / 0.27 * 0.06 : 0.61 + (p - 0.72) / 0.28 * 0.39);
      C.pos.set(0, 1.05, 3.1 - dp * 1.5);
      C.face = 0;
      label = p < 0.45 ? '常速接近' : (p < 0.72 ? '动作峰值 → 降为慢动作（顿挫）' : '恢复常速');
    } else if (m === 'neon') {
      C.pos.set(0.9, 1.15, 2.3);
      C.face = -0.35;
      label = '机位基本固定，靠冷暖光比塑形';
    } else if (m === 'frame') {
      C.pos.set(0, 1.15, 2.9);
      C.face = 0;
      label = '机位固定，用前景（门/窗）框住主体';
    } else if (m === 'dutch') {
      C.pos.set(0, 1.2, 2.5);
      C.face = 0;
      label = '机位固定，机身倾斜 ' + (this.params.tilt || 14) + '°';
    } else if (m === 'lightleak') {
      C.pos.set(0, 1.1, 2.6);
      C.face = 0;
      label = '转场处强光扫过镜头';
    } else {
      C.pos.set(0, 1.1, 2.8);
      C.face = 0;
    }

    /* 视锥朝向：让视锥指向 camLookAt */
    var dir = new T.Vector3().subVectors(camLookAt, C.pos).normalize();
    C.yaw = Math.atan2(dir.x, dir.z);
    C.pitch = Math.asin(Math.max(-1, Math.min(1, dir.y)));

    return { A: A, C: C, camLookAt: camLookAt, label: label };
  };

  Stage.prototype._update = function (dt, force) {
    if (!this.ok) return;
    var p = this.dur > 0 ? Math.min(1, this.t / this.dur) : 0;
    var st = this._compute(p);

    /* 演员 */
    this.actor.position.copy(st.A.pos);
    this.actor.rotation.y = st.A.face;
    this.actorFlag.position.set(st.A.pos.x, 1.95, st.A.pos.z);
    if (this.actorLabel) this.actorLabel.position.set(st.A.pos.x, 2.25, st.A.pos.z);

    /* 摄影师 */
    this.shooter.position.set(st.C.pos.x, 0, st.C.pos.z);
    this.shooter.userData.camGrp.position.set(0, st.C.pos.y - 1.36, 0);
    if (this.shooterLabel) this.shooterLabel.position.set(st.C.pos.x, 1.90, st.C.pos.z);
    /* 机身 + 视锥朝向 */
    var cg = this.shooter.userData.camGrp;
    cg.rotation.set(0, st.C.yaw, 0);
    this.frustum.rotation.set(-st.C.pitch, 0, 0);
    this.shooter.rotation.y = st.C.yaw;

    /* 走路摆臂：按进度做正弦摆动，让火柴人不是"滑行" */
    var swing = Math.sin(this.t * 7) * 0.16 * (this.playing ? 1 : 0);
    var a = this.actor.userData, sh = this.shooter.userData;
    poseLimb(a.legL, new T.Vector3(0, a.hipY, 0), new T.Vector3(-0.16 + swing * 0.8, 0, swing));
    poseLimb(a.legR, new T.Vector3(0, a.hipY, 0), new T.Vector3(0.16 - swing * 0.8, 0, -swing));
    poseLimb(a.armL, new T.Vector3(0, a.shoulderY, 0), new T.Vector3(-0.30, 0.98, -swing * 0.9));
    poseLimb(a.armR, new T.Vector3(0, a.shoulderY, 0), new T.Vector3(0.30, 0.98, swing * 0.9));

    /* 摄影师双臂抬起做持机姿势 */
    poseLimb(sh.armL, new T.Vector3(0, sh.shoulderY, 0), new T.Vector3(-0.16, 1.24, 0.22));
    poseLimb(sh.armR, new T.Vector3(0, sh.shoulderY, 0), new T.Vector3(0.16, 1.24, 0.22));
    var sw2 = Math.sin(this.t * 6.2) * 0.06 * (this.playing ? 1 : 0);
    poseLimb(sh.legL, new T.Vector3(0, sh.hipY, 0), new T.Vector3(-0.12, 0, sw2));
    poseLimb(sh.legR, new T.Vector3(0, sh.hipY, 0), new T.Vector3(0.12, 0, -sw2));

    /* 轨迹：把已走过的路径画出来 */
    if (force || this.playing) {
      var camPts = [], actPts = [];
      var N = 40;
      for (var i = 0; i <= N; i++) {
        var pp = (i / N) * p;
        var s2 = this._compute(pp);
        camPts.push(new T.Vector3(s2.C.pos.x, 0.02, s2.C.pos.z));
        actPts.push(new T.Vector3(s2.A.pos.x, 0.02, s2.A.pos.z));
      }
      setTrack(this.camTrack, camPts);
      setTrack(this.actorTrack, actPts);
    }

    this.lastState = st;
    this.renderer.render(this.scene, this.camera);
  };

  Stage.prototype.play = function () {
    if (!this.ok) return;
    if (this.playing) return;
    this.playing = true;
    if (this.t >= this.dur) this.t = 0;
    this._loop();
  };
  Stage.prototype.pause = function () {
    this.playing = false;
    if (this._raf) cancelAnimationFrame(this._raf);
    this._raf = 0;
    this._update(0);   // 重绘一帧保持画面
  };
  Stage.prototype.reset = function () {
    this.t = 0;
    this._update(0);
  };
  Stage.prototype.seek = function (p) {
    this.t = Math.max(0, Math.min(1, p)) * this.dur;
    this._update(0);
  };
  Stage.prototype._loop = function () {
    var self = this;
    if (!this.playing) return;
    this._raf = requestAnimationFrame(function () {
      var dt = self.clock.getDelta();
      self.t += dt * self.speed;
      if (self.t > self.dur) { self.t = self.dur; self.playing = false; self._update(0, true); self._emitEnd && self._emitEnd(); return; }
      self._update(dt);
      self._loop();
    });
  };

  Stage.prototype.dispose = function () {
    this.pause();
    if (this._ro) { try { this._ro.disconnect(); } catch (e) {} this._ro = null; }
    if (this.renderer) {
      try { this.renderer.dispose(); } catch (e) {}
      var el = this.renderer.domElement;
      if (el && el.parentNode) el.parentNode.removeChild(el);
    }
    this._built = false;
    this.ok = false;
  };

  window.GS_STAGE3D = { create: function (el) { return new Stage(el); }, Stage: Stage };
})();
