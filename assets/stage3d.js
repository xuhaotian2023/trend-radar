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

  /* ---------- 精细摄制装备：三轴云台 + 机身 + 镜头 + 监视屏 + 跟焦轮 ----------
     结构（自下而上）：
       手柄 grip → 偏航轴 yaw（水平旋转）→ 横滚轴 roll（左右倾斜）
       → 俯仰轴 pitch（上下俯仰）→ 快装板 → 机身 → 镜头 → 遮光罩
     三个轴各自成组，运行时按运镜需要独立转动，因此云台动作肉眼可见。 */
  function makeRig(color) {
    
    var rig = new T.Group();

    var metal = new T.MeshBasicMaterial({ color: color, transparent: true, opacity: 0.72 });
    var dark = new T.MeshBasicMaterial({ color: 0x2b3140, transparent: true, opacity: 0.9 });
    var accent = new T.MeshBasicMaterial({ color: 0x7ef3ff, transparent: true, opacity: 0.85 });
    var glass = new T.MeshBasicMaterial({ color: 0x9fd8ff, transparent: true, opacity: 0.45 });

    /* --- 手柄：摄影师握持处 --- */
    var grip = new T.Mesh(new T.CylinderGeometry(0.026, 0.030, 0.20, 10), dark);
    grip.position.y = -0.16;
    rig.add(grip);

    /* --- 偏航轴：立轴 + 轴心球（水平旋转的可见标志） --- */
    var yawGrp = new T.Group();
    var yawPost = new T.Mesh(new T.CylinderGeometry(0.020, 0.020, 0.10, 8), metal);
    yawPost.position.y = -0.06;
    yawGrp.add(yawPost);
    var yawBall = new T.Mesh(new T.SphereGeometry(0.032, 10, 8), dark);
    yawGrp.add(yawBall);
    rig.add(yawGrp);

    /* --- 横滚轴：横臂 + 两侧电机（左右倾斜） --- */
    var rollGrp = new T.Group();
    rollGrp.position.y = 0.035;
    var rollArm = new T.Mesh(new T.BoxGeometry(0.24, 0.022, 0.022), metal);
    rollGrp.add(rollArm);
    [-0.12, 0.12].forEach(function (x) {
      var motor = new T.Mesh(new T.CylinderGeometry(0.030, 0.030, 0.034, 12), dark);
      motor.rotation.z = Math.PI / 2;
      motor.position.x = x;
      rollGrp.add(motor);
      /* 电机端盖上的青色环，让轴心转动时更醒目 */
      var ring = new T.Mesh(new T.TorusGeometry(0.030, 0.004, 6, 14), accent);
      ring.rotation.y = Math.PI / 2;
      ring.position.x = x + (x < 0 ? -0.018 : 0.018);
      rollGrp.add(ring);
    });
    yawGrp.add(rollGrp);

    /* --- 俯仰轴：竖臂 + 相机托架（上下俯仰） --- */
    var pitchGrp = new T.Group();
    pitchGrp.position.y = 0.032;
    var pitchArm = new T.Mesh(new T.BoxGeometry(0.022, 0.13, 0.022), metal);
    pitchArm.position.y = 0.055;
    pitchGrp.add(pitchArm);
    var pitchBall = new T.Mesh(new T.SphereGeometry(0.022, 10, 8), dark);
    pitchBall.position.y = 0.115;
    pitchGrp.add(pitchBall);
    rollGrp.add(pitchGrp);

    /* --- 快装板 + 机身 --- */
    var body = new T.Group();
    body.position.y = 0.128;
    var plate = new T.Mesh(new T.BoxGeometry(0.13, 0.012, 0.17), dark);
    plate.position.y = -0.012;
    body.add(plate);
    var camBody = new T.Mesh(new T.BoxGeometry(0.155, 0.115, 0.20), metal);
    body.add(camBody);
    /* 顶部热靴 + 提手 */
    var hotShoe = new T.Mesh(new T.BoxGeometry(0.10, 0.014, 0.06), dark);
    hotShoe.position.y = 0.064;
    body.add(hotShoe);
    /* 翻转屏：机身背面的一块亮面，随云台一起转，能看出朝向 */
    var screen = new T.Mesh(new T.PlaneGeometry(0.105, 0.075), glass);
    screen.position.set(0, 0.004, 0.103);
    screen.rotation.y = Math.PI;
    body.add(screen);
    /* 机身顶部的录制指示灯 */
    var rec = new T.Mesh(new T.SphereGeometry(0.010, 8, 6), new T.MeshBasicMaterial({ color: 0xfb7185 }));
    rec.position.set(0.058, 0.052, -0.055);
    body.add(rec);
    /* 镜头：镜筒 + 变焦环 + 遮光罩 */
    var lensBarrel = new T.Mesh(new T.CylinderGeometry(0.042, 0.046, 0.135, 16), dark);
    lensBarrel.rotation.x = Math.PI / 2;
    lensBarrel.position.z = -0.165;
    body.add(lensBarrel);
    var zoomRing = new T.Mesh(new T.CylinderGeometry(0.049, 0.049, 0.022, 16), accent);
    zoomRing.rotation.x = Math.PI / 2;
    zoomRing.position.z = -0.145;
    body.add(zoomRing);
    var lensGlass = new T.Mesh(new T.CylinderGeometry(0.038, 0.038, 0.008, 16), glass);
    lensGlass.rotation.x = Math.PI / 2;
    lensGlass.position.z = -0.234;
    body.add(lensGlass);
    var hood = new T.Mesh(new T.CylinderGeometry(0.055, 0.046, 0.05, 16, 1, true), dark);
    hood.rotation.x = Math.PI / 2;
    hood.position.z = -0.246;
    body.add(hood);
    /* 跟焦轮：机身右侧的小圆盘，转动可见 */
    var ffWheel = new T.Mesh(new T.CylinderGeometry(0.030, 0.030, 0.014, 14), accent);
    ffWheel.rotation.z = Math.PI / 2;
    ffWheel.position.set(0.086, -0.028, 0.020);
    body.add(ffWheel);
    pitchGrp.add(body);

    /* 各轴引用，供运行时驱动 */
    rig.userData = {
      yawGrp: yawGrp, rollGrp: rollGrp, pitchGrp: pitchGrp,
      body: body, ffWheel: ffWheel, lens: lensBarrel,
      zoomRing: zoomRing, screen: screen, rec: rec
    };
    return rig;
  }

  /* ---------- 摄影师：火柴人 + 精细摄制装备 ---------- */
  function makeShooter(color) {
    var g = makeStick(color, { scale: 1.0 });
    var camGrp = new T.Group();
    camGrp.add(makeRig(color));
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
    var grp = new T.Group();
    var grid = new T.GridHelper(12, 24, 0x2a3550, 0x1a2136);
    grid.position.y = 0;
    grp.add(grid);
    /* 地面薄板，给火柴人一个落脚感 */
    var plate = new T.Mesh(
      new T.PlaneGeometry(12, 12),
      new T.MeshBasicMaterial({ color: 0x0a0f1c, transparent: true, opacity: 0.5 })
    );
    plate.rotation.x = -Math.PI / 2;
    plate.position.y = -0.002;
    grp.add(plate);
    scene.add(grp);
    grp.userData.grid = grid;
    grp.userData.plate = plate;
    return grp;
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
      /* 允许接收键盘焦点，配合自由飞行模式的 WASD */
      this.renderer.domElement.tabIndex = 0;
      this.renderer.domElement.style.outline = 'none';

      this.scene = new T.Scene();
      this.camera = new T.PerspectiveCamera(46, 1, 0.1, 200);
      /* 自由视角（轨道相机）：围绕场景中心旋转。
         目标点取场景几何中心（略高于地面），半径按舞台可视范围给定，
         否则火柴人会被挤到画面角落、大量留白。 */
      this.target = new T.Vector3(0, 0.75, 1.1);
      this.sph = { r: 7.4, theta: Math.PI * 0.28, phi: Math.PI * 0.36 };
      this._applyOrbit();

      this.clock = new T.Clock();
      this.floorGrid = makeFloor(this.scene);

      /* 场景环境：按拍摄场景搭出对应空间（房间窗边 / 夜景街头 / 天台…）。
         环境作为独立 Group 挂载，切换场景时只替换这一组，火柴人与轨迹不受影响。 */
      this.envGroup = null;

      /* 演员（被拍对象） */
      this.actor = makeStick(0x7ef3ff, { scale: 1.0 });
      this.actor.position.set(0, 0, 0);
      this.scene.add(this.actor);

      /* 摄影师 */
      this.shooter = makeShooter(0xffb75e);
      this.scene.add(this.shooter);

      /* 视锥挂在摄影师的装备上 */
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
    /* 装备特写是"凑近看细节"，不能再按画幅比例放大半径，否则永远拉不近 */
    var fit = this._orbitFollowGear ? 1 : (this._fit || 1);
    var r = this.sph.r * fit, th = this.sph.theta, ph = this.sph.phi;
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
               yaw: (self._fly && self._fly.yaw) || 0, pitch: (self._fly && self._fly.pitch) || 0 };
      el.style.cursor = 'grabbing';
      try { el.focus(); } catch (err) {}
    });
    el.addEventListener('pointermove', function (e) {
      if (!drag) return;
      var dx = (e.clientX - drag.x) / Math.max(1, el.clientWidth);
      var dy = (e.clientY - drag.y) / Math.max(1, el.clientHeight);

      if (self.camMode === 'fly') {
        /* 自由飞行：拖拽直接改朝向（像在第一人称里转头） */
        var f = self._fly || (self._fly = { v: new T.Vector3(), yaw: drag.yaw, pitch: drag.pitch, keys: {} });
        f.yaw = drag.yaw - dx * Math.PI * 1.6;
        f.pitch = Math.max(-1.35, Math.min(1.35, drag.pitch - dy * Math.PI * 1.1));
        return;
      }
      if (self.camMode === 'follow') return;   // 跟机视角由摄影师驱动，不响应拖拽

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
      self.nudgeDist(1 + (e.deltaY > 0 ? 0.12 : -0.12));
    }, { passive: false });
    /* 屏蔽右键菜单以便右键平移 */
    el.addEventListener('contextmenu', function (e) { e.preventDefault(); });

    /* 键盘：自由飞行模式下用 WASD / 方向键 / Q E 在空间里移动。
       监听挂在 window 上，但只在"自由飞行 + 画布在视口内"时生效，避免抢页面快捷键。 */
    function inView() {
      var r = el.getBoundingClientRect();
      return r.bottom > 0 && r.top < (window.innerHeight || 0) && r.width > 0;
    }
    window.addEventListener('keydown', function (e) {
      if (self.camMode !== 'fly' || !inView()) return;
      var k = String(e.key || '').toLowerCase();
      if (['w', 'a', 's', 'd', 'q', 'e', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].indexOf(k) >= 0) {
        self.flyKey(k, true);
        e.preventDefault();
      }
    });
    window.addEventListener('keyup', function (e) {
      var k = String(e.key || '').toLowerCase();
      self.flyKey(k, false);
    });
    /* 失焦时清空按键，避免"按键卡住"导致相机一直飘 */
    window.addEventListener('blur', function () {
      if (self._fly && self._fly.keys) self._fly.keys = {};
    });
  };

  Stage.prototype.setOrbit = function (preset) {
    var P = {
      'free': { r: 7.4, theta: Math.PI * 0.28, phi: Math.PI * 0.36, ty: 0.75, tz: 1.1 },
      'top': { r: 8.2, theta: 0, phi: 0.14, ty: 0.0, tz: 1.1 },
      'front': { r: 6.6, theta: 0, phi: Math.PI * 0.44, ty: 0.85, tz: 1.0 },
      'side': { r: 6.6, theta: Math.PI * 0.5, phi: Math.PI * 0.44, ty: 0.85, tz: 1.0 },
      'close': { r: 5.6, theta: Math.PI * 0.30, phi: Math.PI * 0.40, ty: 0.95, tz: 1.5 },
      /* 装备特写：贴近摄影师，专门看清云台三轴与机身细节 */
      'gear': { r: 2.35, theta: Math.PI * 0.44, phi: Math.PI * 0.47, ty: 1.15, tz: 0, followGear: true }
    }[preset] || null;
    if (!P) return;
    /* 切回环绕视角时退出跟机 / 自由飞行模式 */
    this.camMode = 'orbit';
    this.sph.r = P.r; this.sph.theta = P.theta; this.sph.phi = P.phi;
    /* 装备特写：目标点跟着摄影师走，便于观察云台动作 */
    this._orbitFollowGear = !!P.followGear;
    this.target.set(0, P.ty, P.tz == null ? 1.1 : P.tz);
    if (P.followGear && this.shooter) {
      var cg2 = this.shooter.userData.camGrp;
      var wp2 = new T.Vector3();
      cg2.getWorldPosition(wp2);
      this.target.copy(wp2);
    }
    this._applyOrbit();
  };

  /* ---------- 观察模式 ----------
     orbit : 环绕观察（默认，绕场景中心旋转）
     follow: 跟机视角——把观察相机贴到摄影师身上，看到的就是"摄影师拍到什么"
     fly   : 自由飞行——脱离轨道，用键盘/WASD 或拖拽在空间里自由移动
     三种模式共用同一台相机，切换时只改驱动方式。 */
  Stage.prototype.setCamMode = function (mode) {
    if (!this.ok) return;
    if (mode !== 'orbit' && mode !== 'follow' && mode !== 'fly') return;
    var prev = this.camMode || 'orbit';
    this.camMode = mode;
    if (mode === 'orbit' && prev !== 'orbit') {
      /* 从其它模式回到环绕：以当前位置反推球坐标，避免视角突变 */
      this._syncSphFromCamera();
    }
    if (mode === 'fly' && prev !== 'fly') {
      this._fly = this._fly || { v: new T.Vector3(), yaw: 0, pitch: 0, keys: {} };
      /* 用当前朝向初始化飞行方向 */
      var dir = new T.Vector3();
      this.camera.getWorldDirection(dir);
      this._fly.yaw = Math.atan2(-dir.x, -dir.z);
      this._fly.pitch = Math.asin(Math.max(-1, Math.min(1, dir.y)));
    }
  };

  /* 由当前相机位置反推球坐标（保持视觉连续） */
  Stage.prototype._syncSphFromCamera = function () {
    var off = new T.Vector3().subVectors(this.camera.position, this.target);
    var r = off.length() || 7;
    this.sph.r = r;
    this.sph.phi = Math.acos(Math.max(-1, Math.min(1, off.y / r)));
    this.sph.theta = Math.atan2(off.x, off.z);
  };

  /* 手动微调自由视角的朝向（键盘方向键 / 拖拽都会走这里） */
  Stage.prototype.nudgeView = function (dTheta, dPhi) {
    if (this.camMode === 'fly') {
      var f = this._fly; if (!f) return;
      f.yaw += dTheta; f.pitch = Math.max(-1.35, Math.min(1.35, f.pitch + dPhi));
      return;
    }
    this.sph.theta += dTheta;
    this.sph.phi = Math.min(Math.PI * 0.92, Math.max(Math.PI * 0.06, this.sph.phi + dPhi));
    this._applyOrbit();
  };
  Stage.prototype.nudgeDist = function (factor) {
    if (this.camMode === 'fly') {
      var f = this._fly; if (!f) return;
      f.v.z = (f.v.z || 0);   // 飞行模式下滚轮改为前后推进
      f._push = (f._push || 0) + (factor > 1 ? -0.5 : 0.5);
      return;
    }
    this.sph.r = Math.min(18, Math.max(1.6, this.sph.r * factor));
    this._applyOrbit();
  };
  /* 自由飞行模式：按方向键/WASD 平移 */
  Stage.prototype.flyKey = function (key, down) {
    if (!this._fly) this._fly = { v: new T.Vector3(), yaw: 0, pitch: 0, keys: {} };
    this._fly.keys[key] = !!down;
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

  /* ---------- 场景环境切换 ----------
     按场景 id 搭出对应空间。同一 id 不重复重建；切到新场景时销毁旧的释放显存。
     环境自带的灯架 / 柔光箱等已经表达光线来向，因此场景内不再额外打灯。 */
  Stage.prototype.setEnvironment = function (sceneId) {
    if (!this.ok || !window.GS_ENV) return false;
    var id = sceneId || 'generic';
    if (this._envId === id && this.envGroup) return true;

    /* 移除旧环境 */
    if (this.envGroup) {
      this.scene.remove(this.envGroup);
      this.envGroup.traverse(function (o) {
        if (o.geometry) { try { o.geometry.dispose(); } catch (e) {} }
        if (o.material) {
          var ms = Array.isArray(o.material) ? o.material : [o.material];
          ms.forEach(function (m) { try { m.dispose(); } catch (e) {} });
        }
      });
      this.envGroup = null;
    }

    var env = window.GS_ENV.create(id);
    if (!env || !env.group) { this._envId = null; return false; }
    this.envGroup = env.group;
    this.scene.add(this.envGroup);
    this._envId = id;
    this._envInfo = { light: env.light, id: id };

    /* 场景自带来光线语义时隐藏通用网格，避免与场景地板打架 */
    if (this.floorGrid) {
      var showGrid = env.ground !== false;
      this.floorGrid.userData.grid.visible = showGrid;
      this.floorGrid.userData.plate.visible = showGrid;
    }
    this._update(0, true);
    return true;
  };
  Stage.prototype.envInfo = function () { return this._envInfo || { light: '', id: '' }; };

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
    var moving = this.playing ? 1 : 0;
    var a = this.actor.userData, sh = this.shooter.userData;

    /* ---- 演员动作：由当前手法决定"演什么" ---- */
    var perf = this._actorPerf(p, moving);
    poseLimb(a.legL, new T.Vector3(0, a.hipY, 0), perf.legL);
    poseLimb(a.legR, new T.Vector3(0, a.hipY, 0), perf.legR);
    poseLimb(a.armL, new T.Vector3(0, a.shoulderY, 0), perf.armL);
    poseLimb(a.armR, new T.Vector3(0, a.shoulderY, 0), perf.armR);
    /* 躯干整体起伏：走路时上下颠簸，让动作有重量感 */
    this.actor.position.y = perf.bob;
    /* 转身/侧身：围绕手法需要做细微身体转动 */
    this.actor.rotation.y = st.A.face + perf.lean;

    /* ---- 摄影师：持机姿态 + 步伐 ---- */
    var sp = this._shooterPerf(p, moving);
    poseLimb(sh.armL, new T.Vector3(0, sh.shoulderY, 0), sp.armL);
    poseLimb(sh.armR, new T.Vector3(0, sh.shoulderY, 0), sp.armR);
    poseLimb(sh.legL, new T.Vector3(0, sh.hipY, 0), sp.legL);
    poseLimb(sh.legR, new T.Vector3(0, sh.hipY, 0), sp.legR);
    this.shooter.position.y = sp.bob;

    /* ---- 云台三轴：按运镜需要独立转动，让云台动作肉眼可见 ---- */
    var rigU = null;
    if (cg.children.length) rigU = cg.children[0].userData;
    if (rigU) {
      /* 偏航轴：甩镜时大幅转动，其余跟随机身朝向做微调 */
      rigU.yawGrp.rotation.y = sp.yaw;
      /* 横滚轴：环绕/跟随时机身微倾，制造运动感 */
      rigU.rollGrp.rotation.z = sp.roll;
      /* 俯仰轴：升高时下俯、低角度时上仰 */
      rigU.pitchGrp.rotation.x = sp.pitch;
      /* 跟焦轮随焦点变化转动 */
      rigU.ffWheel.rotation.x = this.t * (this.playing ? 1.6 : 0);
      /* 录制指示灯呼吸 */
      if (rigU.rec) {
        rigU.rec.visible = this.playing ? (Math.sin(this.t * 6) > -0.2) : false;
      }
    }

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

    /* ---- 相机模式驱动 ---- */
    this._driveCamera(dt);

    this.renderer.render(this.scene, this.camera);
  };

  /* 按当前模式摆放观察相机 */
  Stage.prototype._driveCamera = function (dt) {
    var mode = this.camMode || 'orbit';

    if (mode === 'follow') {
      /* 跟机视角：相机放到镜头前方一点（而不是机身中心），
         否则会从火柴人躯干内部往外看，画面被自己的身体挡住、看不出构图。 */
      var cg = this.shooter.userData.camGrp;
      var wp = new T.Vector3();
      cg.getWorldPosition(wp);
      var quat = cg.getWorldQuaternion(new T.Quaternion());
      var dir = new T.Vector3(0, 0, -1).applyQuaternion(quat);
      /* 沿镜头朝向前移 0.30m（越过机身与镜筒），并略微上抬到取景眼位 */
      var pos = wp.clone().addScaledVector(dir, 0.30);
      pos.y += 0.04;
      this.camera.position.copy(pos);
      var look = pos.clone().addScaledVector(dir, 3.0);
      this.camera.lookAt(look.x, look.y, look.z);
      return;
    }

    if (mode === 'fly') {
      /* 自由飞行：方向键/WASD 平移 + 拖拽转向，完全脱离轨道 */
      var f = this._fly || (this._fly = { v: new T.Vector3(), yaw: 0, pitch: 0, keys: {}, _push: 0 });
      var speed = 3.4 * Math.max(0.016, Math.min(dt || 0.016, 0.05)) * 60 / 60;
      var fwd = new T.Vector3(-Math.sin(f.yaw), 0, -Math.cos(f.yaw));
      var right = new T.Vector3(Math.cos(f.yaw), 0, -Math.sin(f.yaw));
      var mv = new T.Vector3();
      var k = f.keys || {};
      if (k.w || k.arrowup) mv.add(fwd);
      if (k.s || k.arrowdown) mv.sub(fwd);
      if (k.a || k.arrowleft) mv.sub(right);
      if (k.d || k.arrowright) mv.add(right);
      if (k.q) mv.y -= 1;
      if (k.e) mv.y += 1;
      if (mv.lengthSq() > 0) mv.normalize().multiplyScalar(speed);
      /* 滚轮推进 */
      if (f._push) { mv.addScaledVector(fwd, f._push * 0.35); f._push = 0; }
      this.camera.position.add(mv);
      /* 俯仰影响视线高度但不改变前进方向（保持地面平行，避免眩晕） */
      var look = new T.Vector3(
        this.camera.position.x - Math.sin(f.yaw) * Math.cos(f.pitch),
        this.camera.position.y + Math.sin(f.pitch),
        this.camera.position.z - Math.cos(f.yaw) * Math.cos(f.pitch)
      );
      this.camera.lookAt(look);
      return;
    }

    /* orbit：由 _applyOrbit 负责，拖拽时实时更新。
       装备特写模式下目标点持续跟随摄影师，镜头跟着云台一起走。 */
    if (this._orbitFollowGear && this.shooter) {
      var wp3 = new T.Vector3();
      this.shooter.userData.camGrp.getWorldPosition(wp3);
      this.target.copy(wp3);
      this._applyOrbit();
    }
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
  /* ---------- 演员演技：按手法生成四肢端点与身体起伏 ----------
     所有端点都是相对躯干原点的局部坐标（与 makeStick 的关节高度统一）。
     走路用反相正弦驱动四肢；不同手法叠加各自的"表演"（抬手、转身、定格等）。 */
  Stage.prototype._actorPerf = function (p, moving) {
    var a = this.actor.userData;
    var hipY = a.hipY, shY = a.shoulderY;
    var m = this.mode;
    /* 步频：走位越快的镜头，步频越高 */
    var cadence = (m === 'follow' || m === 'whip') ? 8.2 : (m === 'orbit' || m === 'crane') ? 5.4 : 6.4;
    var ph = this.t * cadence;
    var A = moving ? 1 : 0;

    /* 腿：反相摆动，幅度随步频 */
    var legSwing = Math.sin(ph) * 0.30 * A;
    var legLift = Math.max(0, Math.sin(ph)) * 0.10 * A;
    var legL = new T.Vector3(-0.15 - legSwing * 0.35, legLift, legSwing);
    var legR = new T.Vector3(0.15 + legSwing * 0.35, Math.max(0, -Math.sin(ph)) * 0.10 * A, -legSwing);

    /* 手臂：与腿反相，幅度略小 */
    var armSwing = Math.sin(ph + Math.PI) * 0.26 * A;
    var armL = new T.Vector3(-0.30, 0.98, armSwing);
    var armR = new T.Vector3(0.30, 0.98, -armSwing);

    /* 身体起伏：双脚交替支撑带来的上下颠簸 */
    var bob = Math.abs(Math.sin(ph)) * 0.035 * A;

    var lean = 0;

    /* ---- 各手法的专属表演 ---- */
    if (m === 'orbit') {
      /* 环绕：演员基本站定做展示动作，双手略微抬起（展示产品/自我） */
      armL.set(-0.30, 1.02 + Math.sin(ph * 0.5) * 0.05, 0.10);
      armR.set(0.30, 1.06 + Math.sin(ph * 0.5 + 1) * 0.05, 0.12);
      lean = Math.sin(ph * 0.4) * 0.10;
      bob = Math.abs(Math.sin(ph * 0.6)) * 0.012 * A;
    } else if (m === 'dolly') {
      /* 推拉：演员多半在"表演情绪"，手臂自然摆动幅度小 */
      armSwing = Math.sin(ph + Math.PI) * 0.14 * A;
      armL.set(-0.30, 0.98, armSwing);
      armR.set(0.30, 0.98, -armSwing);
      lean = Math.sin(this.t * 1.1) * 0.05;
    } else if (m === 'follow') {
      /* 跟随：演员正常行走，手臂摆动最大 */
      armSwing = Math.sin(ph + Math.PI) * 0.34 * A;
      armL.set(-0.30, 0.98, armSwing);
      armR.set(0.30, 0.98, -armSwing);
      lean = 0.06 * A;
    } else if (m === 'crane') {
      /* 升高：演员站定，双臂自然下垂后随镜头升高微微张开 */
      var open = Math.min(1, p * 1.6);
      armL.set(-0.30 - open * 0.16, 0.98 - open * 0.10, 0.02);
      armR.set(0.30 + open * 0.16, 0.98 - open * 0.10, 0.02);
      legL.set(-0.17, 0, 0); legR.set(0.17, 0, 0);
      bob = 0.01 * A;
    } else if (m === 'ramp') {
      /* 变速：动作峰值处做一次发力的定格——手臂前挥后骤停 */
      var peak = p > 0.42 && p < 0.62;
      var drive = Math.min(1, p / 0.45);
      if (peak) {
        /* 停格姿态：前臂抬起、身体前倾 */
        armL.set(-0.26, 1.16, -0.22);
        armR.set(0.26, 1.18, -0.26);
        legL.set(-0.22, 0.02, 0.20);
        legR.set(0.18, 0, -0.14);
        lean = 0.18;
        bob = 0.02;
      } else if (p < 0.42) {
        /* 蓄力：手臂后摆 */
        armL.set(-0.30, 0.98 - drive * 0.06, 0.30 * drive);
        armR.set(0.30, 0.98 - drive * 0.06, 0.30 * drive);
        lean = -0.08 * drive;
      }
    } else if (m === 'whip') {
      /* 甩镜：演员做一个快速转身/挥手，配合镜头甩动 */
      var turn = p < 0.5 ? p * 2 : 1;
      armL.set(-0.30 - 0.20 * turn, 1.02 + 0.10 * turn, 0.10 * turn);
      armR.set(0.30, 0.98, 0);
      lean = -0.30 * Math.sin(p * Math.PI);
    } else if (m === 'dutch') {
      /* 荷兰角：演员略显不安，手臂夹紧、重心偏移 */
      armL.set(-0.22, 1.00, 0.06);
      armR.set(0.22, 1.00, -0.06);
      legL.set(-0.13, 0, 0.04);
      legR.set(0.19, 0, -0.03);
      lean = Math.sin(this.t * 2.2) * 0.08;
      bob = 0.008 * A;
    } else if (m === 'neon' || m === 'frame' || m === 'static' || m === 'lightleak') {
      /* 静态塑形类：演员轻微呼吸感，不做大动作 */
      var breathe = Math.sin(this.t * 1.8) * 0.02;
      armL.set(-0.29, 0.99 + breathe, 0.04);
      armR.set(0.29, 0.99 + breathe, -0.04);
      legL.set(-0.16, 0, 0.02); legR.set(0.16, 0, -0.02);
      lean = Math.sin(this.t * 0.9) * 0.04;
      bob = 0.006 * A;
    }

    return { legL: legL, legR: legR, armL: armL, armR: armR, bob: bob, lean: lean };
  };

  /* ---------- 摄影师动作：持机步态 + 云台三轴 ---------- */
  Stage.prototype._shooterPerf = function (p, moving) {
    var sh = this.shooter.userData;
    var shY = sh.shoulderY, hipY = sh.hipY;
    var m = this.mode;
    var A = moving ? 1 : 0;
    /* 摄影师的步伐比演员更小更稳（要保证画面不抖） */
    var cadence = (m === 'follow' || m === 'whip') ? 7.0 : (m === 'orbit' ? 5.2 : 6.0);
    var ph = this.t * cadence;
    var swing = Math.sin(ph) * 0.14 * A;
    var bob = Math.abs(Math.sin(ph)) * 0.018 * A;

    var legL = new T.Vector3(-0.12 - swing * 0.4, Math.max(0, Math.sin(ph)) * 0.05 * A, swing);
    var legR = new T.Vector3(0.12 + swing * 0.4, Math.max(0, -Math.sin(ph)) * 0.05 * A, -swing);

    /* 双臂举起持机：双手位置随手法调整（胸前 / 举高 / 贴眼） */
    var armUp = 1.22, armFwd = 0.20;
    if (m === 'crane') { armUp = 1.30; armFwd = 0.16; }        // 举高
    if (m === 'low-angle-hero' || m === 'static') { armUp = 1.16; armFwd = 0.24; }
    if (m === 'neon') { armUp = 1.20; armFwd = 0.22; }
    var jitter = moving ? Math.sin(ph * 1.3) * 0.012 : 0;
    var armL = new T.Vector3(-0.15, armUp + jitter, armFwd);
    var armR = new T.Vector3(0.15, armUp + jitter, armFwd);

    /* 云台三轴：不同运镜的轴动作不同，这是"云台怎么动"的可视化核心 */
    var yaw = 0, roll = 0, pitch = 0;
    if (m === 'whip') {
      /* 甩镜：偏航轴快速大幅左右甩动（0.2~0.3 秒级） */
      var sw = Math.sin(Math.min(1, p) * Math.PI * 2);
      yaw = sw * 0.85;
      roll = sw * 0.22;
    } else if (m === 'orbit') {
      /* 环绕：偏航轴持续跟住主体（朝向由 _compute 的 yaw 承担），横滚微倾 */
      roll = Math.sin(p * Math.PI) * 0.10;
      pitch = -0.03;
    } else if (m === 'crane') {
      /* 升高：俯仰轴由平视转下俯，是本手法最直观的云台动作 */
      pitch = p * 0.42;
      roll = Math.sin(p * Math.PI) * 0.05;
    } else if (m === 'follow') {
      /* 跟随：横滚轴随步伐轻微摇摆，模拟手持减震的浮动 */
      roll = Math.sin(ph * 0.8) * 0.055 * A;
      yaw = Math.sin(ph * 0.5) * 0.03 * A;
    } else if (m === 'ramp') {
      /* 变速：降速段云台俯仰微调，制造"顿挫"前的准备动作 */
      pitch = (p > 0.42 && p < 0.72) ? -0.08 : 0.02;
      roll = Math.sin(ph * 0.6) * 0.03 * A;
    } else if (m === 'dutch') {
      /* 荷兰角：横滚轴持续倾斜，正是该手法的本质 */
      roll = -(this.params.tilt || 14) * Math.PI / 180;
    } else if (m === 'dolly') {
      /* 推拉：俯仰轴保持水平，横滚几乎为零——稳定推进 */
      roll = Math.sin(ph * 0.5) * 0.012 * A;
      pitch = 0.01;
    } else {
      roll = Math.sin(ph * 0.6) * 0.02 * A;
    }

    return { legL: legL, legR: legR, armL: armL, armR: armR,
      bob: bob, yaw: yaw, roll: roll, pitch: pitch };
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
