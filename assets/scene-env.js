/* 光溯 GUANGSU · 3D 场景环境库
 *
 * 用途：为运镜预演台搭出与拍摄场景对应的环境（房间窗边 / 夜景街头 / 天台 / 棚拍…），
 *       让用户不仅看到火柴人走位，还能看到"在什么地方拍、光从哪来"。
 *
 * 每个环境返回 { group, light, ground }：
 *   group   THREE.Group，坐标以「米」为单位，演员站在原点 (0,0,0)
 *   light   光线条件文案（UI 展示）
 *   ground  是否保留通用地面网格
 *
 * 设计约束：
 *   · 只用 MeshBasicMaterial / LineBasicMaterial，不依赖光照与贴图，headless 也能渲染
 *   · 体量控制在 12m x 12m 内，与地面网格一致
 *   · 道具用低多边形拼装，重点是"可辨识的空间关系"，不追求写实
 */
(function () {
  'use strict';

  function T() { return window.THREE; }
  function mat(color, opacity) {
    return new (T().MeshBasicMaterial)({
      color: color, transparent: opacity != null && opacity < 1, opacity: opacity == null ? 1 : opacity
    });
  }
  function box(w, h, d, color, opacity) {
    return new (T().Mesh)(new (T().BoxGeometry)(w, h, d), mat(color, opacity));
  }
  function plane(w, h, color, opacity) {
    return new (T().Mesh)(new (T().PlaneGeometry)(w, h), mat(color, opacity));
  }
  function cyl(rt, rb, h, color, opacity, seg) {
    return new (T().Mesh)(new (T().CylinderGeometry)(rt, rb, h, seg || 12), mat(color, opacity));
  }
  /* 摆放网格：一律用 position.set()，不替换内部 Vector3 实例 */
  function at(mesh, x, y, z) {
    mesh.position.set(x || 0, y || 0, z || 0);
    return mesh;
  }
  /* 矩形线框：表现窗框 / 门框 / 柔光箱边框 */
  function frame(w, h, color, opacity, thick) {
    var g = new (T().Group)();
    var t = thick || 0.045, m = mat(color, opacity == null ? 0.9 : opacity);
    var top = new (T().Mesh)(new (T().BoxGeometry)(w, t, t), m); top.position.y = h / 2;
    var bot = new (T().Mesh)(new (T().BoxGeometry)(w, t, t), m); bot.position.y = -h / 2;
    var lef = new (T().Mesh)(new (T().BoxGeometry)(t, h, t), m); lef.position.x = -w / 2;
    var rig = new (T().Mesh)(new (T().BoxGeometry)(t, h, t), m); rig.position.x = w / 2;
    g.add(top); g.add(bot); g.add(lef); g.add(rig);
    return g;
  }

  /* ============ 1. 室内窗边 ============ */
  function indoorWindow() {
    var g = new (T().Group)();
    var floor = plane(10, 10, 0x141a2a, 0.85); floor.rotation.x = -Math.PI / 2; g.add(floor);
    var backWall = plane(10, 3.2, 0x182034, 0.75); at(backWall, 0, 1.6, -4.2); g.add(backWall);
    var sideWall = plane(8, 3.2, 0x161d30, 0.6);
    sideWall.rotation.y = Math.PI / 2; at(sideWall, -4.6, 1.6, 0); g.add(sideWall);

    /* 窗：亮面 + 窗框 + 十字窗棂 + 窗台 */
    var winGrp = new (T().Group)();
    winGrp.add(at(plane(2.6, 2.0, 0xbcd6ff, 0.30), 0, 1.55, 0.01));
    winGrp.add(at(frame(2.6, 2.0, 0x8fb4e8, 0.85), 0, 1.55, 0.02));
    winGrp.add(at(box(0.04, 2.0, 0.04, 0x8fb4e8, 0.8), 0, 1.55, 0.03));
    winGrp.add(at(box(2.6, 0.04, 0.04, 0x8fb4e8, 0.8), 0, 1.55, 0.03));
    winGrp.add(at(box(3.0, 0.07, 0.30, 0x2a3450, 0.95), 0, 0.52, 0.10));
    winGrp.position.set(-2.2, 0, 0.6); winGrp.rotation.y = Math.PI / 2;
    g.add(winGrp);

    /* 窗光落在地面的亮区，提示光来向 */
    var lightPool = plane(3.4, 3.4, 0x9dc4ff, 0.10);
    lightPool.rotation.x = -Math.PI / 2; at(lightPool, 0.2, 0.012, 0.2); g.add(lightPool);

    /* 小桌 + 椅 + 地毯，给出尺度参照 */
    var table = new (T().Group)();
    table.add(at(box(1.1, 0.06, 0.7, 0x3a4560, 0.95), 0, 0.72, 0));
    [[-0.48, -0.28], [0.48, -0.28], [-0.48, 0.28], [0.48, 0.28]].forEach(function (p) {
      table.add(at(cyl(0.028, 0.028, 0.72, 0x2e3850, 0.9, 8), p[0], 0.36, p[1]));
    });
    table.position.set(1.5, 0, -1.1); table.rotation.y = -0.35;
    g.add(table);

    var chair = new (T().Group)();
    chair.add(at(box(0.44, 0.05, 0.44, 0x38435e, 0.95), 0, 0.45, 0));
    chair.add(at(box(0.44, 0.5, 0.05, 0x38435e, 0.9), 0, 0.7, -0.20));
    chair.position.set(1.5, 0, 0.15); chair.rotation.y = -0.35;
    g.add(chair);

    var rug = plane(2.6, 2.0, 0x243050, 0.5);
    rug.rotation.x = -Math.PI / 2; at(rug, 0.4, 0.008, 0.1); g.add(rug);

    /* 吊灯 */
    var lamp = new (T().Group)();
    lamp.add(at(cyl(0.008, 0.008, 0.5, 0x555f78, 0.6, 6), 0, 2.95, 0));
    lamp.add(at(cyl(0.22, 0.30, 0.22, 0xffe9b8, 0.75, 14), 0, 2.6, 0));
    lamp.position.set(0, 0, -0.4);
    g.add(lamp);

    return { group: g, light: '单侧窗户主光（柔和侧光）· 室内吊灯为辅', ground: true };
  }

  /* ============ 2. 城市夜景街头 ============ */
  function streetNight() {
    var g = new (T().Group)();
    var road = plane(11, 11, 0x0e1420, 0.92); road.rotation.x = -Math.PI / 2; g.add(road);
    var wet = plane(2.2, 10, 0x1d3a55, 0.35); wet.rotation.x = -Math.PI / 2; at(wet, 0, 0.006, 0); g.add(wet);

    /* 楼体 + 稀疏窗灯，制造城市纵深 */
    var buildings = [
      { x: -4.0, z: -2.4, w: 2.6, h: 5.2, d: 3.0, c: 0x141c2e },
      { x: -3.2, z: 2.0, w: 2.2, h: 3.6, d: 2.6, c: 0x111827 },
      { x: 4.2, z: -1.4, w: 2.8, h: 6.0, d: 3.2, c: 0x151d30 },
      { x: 3.6, z: 2.6, w: 2.0, h: 3.2, d: 2.4, c: 0x101725 }
    ];
    buildings.forEach(function (b) {
      g.add(at(box(b.w, b.h, b.d, b.c, 0.95), b.x, b.h / 2, b.z));
      for (var i = 0; i < 8; i++) {
        if (Math.random() > 0.62) continue;
        var win = box(0.16, 0.2, 0.02, Math.random() > 0.5 ? 0xffd08a : 0x8fd8ff, 0.75);
        at(win,
          b.x + (Math.random() - 0.5) * (b.w * 0.7),
          0.7 + Math.random() * (b.h - 1.2),
          b.z + (b.x < 0 ? b.d / 2 + 0.02 : -b.d / 2 - 0.02));
        g.add(win);
      }
    });

    /* 霓虹招牌：品红 / 青色，夜景核心色源（含光晕） */
    [
      { x: -2.55, y: 2.6, z: -2.3, w: 0.12, h: 1.5, c: 0xff3d9a },
      { x: 3.0, y: 3.0, z: -1.3, w: 0.12, h: 1.8, c: 0x22d3ee },
      { x: 3.0, y: 2.2, z: 0.6, w: 1.4, h: 0.12, c: 0x22d3ee }
    ].forEach(function (n) {
      g.add(at(box(n.w, n.h, 0.06, n.c, 0.85), n.x, n.y, n.z));
      g.add(at(box(n.w * 3.2, n.h * 1.25, 0.02, n.c, 0.16), n.x + (n.x < 0 ? -0.05 : 0.05), n.y, n.z));
    });

    /* 路灯 + 地面光池 */
    [[-2.0, -3.4], [2.4, 3.2]].forEach(function (p) {
      g.add(at(cyl(0.05, 0.06, 3.4, 0x2b3346, 0.9, 8), p[0], 1.7, p[1]));
      g.add(at(cyl(0.20, 0.05, 0.18, 0xffd9a0, 0.85, 12), p[0], 3.46, p[1]));
      var pool = plane(3.0, 3.0, 0xffc98a, 0.10);
      pool.rotation.x = -Math.PI / 2; at(pool, p[0], 0.01, p[1]);
      g.add(pool);
    });

    /* 街边咖啡摊：呼应"咖啡探店"类描述 */
    var stall = new (T().Group)();
    stall.add(at(box(1.6, 0.08, 0.8, 0x2a2438, 0.95), 0, 0.95, 0));
    stall.add(at(box(1.6, 0.9, 0.06, 0x352b45, 0.85), 0, 0.5, -0.4));
    [[-0.72, -0.34], [0.72, -0.34], [-0.72, 0.34], [0.72, 0.34]].forEach(function (p) {
      stall.add(at(cyl(0.03, 0.03, 0.95, 0x241f30, 0.9, 6), p[0], 0.47, p[1]));
    });
    stall.add(at(box(1.5, 0.05, 0.05, 0xffb75e, 0.9), 0, 1.62, 0));
    stall.position.set(2.3, 0, 0.9); stall.rotation.y = -0.5;
    g.add(stall);

    var puddle = plane(1.2, 0.5, 0x4a7ba8, 0.22);
    puddle.rotation.x = -Math.PI / 2; at(puddle, -0.6, 0.008, 1.2); g.add(puddle);

    return { group: g, light: '霓虹冷暖对冲（品红 / 青色）+ 路灯暖光', ground: false };
  }

  /* ============ 3. 天台 / 运动场馆 ============ */
  function rooftop() {
    var g = new (T().Group)();
    var deck = plane(10, 10, 0x1a2130, 0.9); deck.rotation.x = -Math.PI / 2; g.add(deck);

    /* 围栏：立柱 + 双横杆 */
    var railMat = mat(0x3d4a66, 0.85);
    for (var i = -4; i <= 4; i++) {
      var post = new (T().Mesh)(new (T().BoxGeometry)(0.05, 1.05, 0.05), railMat);
      at(post, i * 1.1, 0.525, -4.2); g.add(post);
    }
    g.add(at(new (T().Mesh)(new (T().BoxGeometry)(9.2, 0.05, 0.05), railMat), 0, 1.05, -4.2));
    g.add(at(new (T().Mesh)(new (T().BoxGeometry)(9.2, 0.04, 0.04), railMat), 0, 0.58, -4.2));

    /* 远景城市剪影 */
    for (var b = 0; b < 14; b++) {
      var h = 0.8 + Math.random() * 2.6;
      g.add(at(box(0.7 + Math.random() * 0.7, h, 0.5, 0x101724, 0.9),
        -7 + b * 1.05, h / 2 - 0.4, -6.5 - Math.random() * 1.5));
    }

    /* 天台设备：空调外机 + 通风管 */
    g.add(at(box(1.1, 0.8, 0.7, 0x2b3448, 0.95), -2.6, 0.4, -2.0));
    var acFan = cyl(0.26, 0.26, 0.04, 0x46566f, 0.9, 16);
    acFan.rotation.x = Math.PI / 2; at(acFan, -2.6, 0.45, -1.63); g.add(acFan);
    g.add(at(cyl(0.22, 0.22, 1.3, 0x2b3448, 0.9, 12), 3.0, 0.65, -1.6));

    /* 训练架：贴合"天台练习"语义 */
    var rack = new (T().Group)();
    rack.add(at(box(0.08, 1.8, 0.08, 0x4a5a78, 0.9), -0.5, 0.9, 0));
    rack.add(at(box(0.08, 1.8, 0.08, 0x4a5a78, 0.9), 0.5, 0.9, 0));
    rack.add(at(box(1.08, 0.08, 0.08, 0x4a5a78, 0.9), 0, 1.78, 0));
    rack.position.set(2.2, 0, 1.2); rack.rotation.y = 0.3;
    g.add(rack);

    /* 地平线暖带 + 地面光斑，暗示黄金时刻 */
    g.add(at(plane(14, 2.2, 0xff9d5c, 0.10), 0, 1.4, -7.8));
    var sunPatch = plane(3.0, 2.2, 0xffb877, 0.10);
    sunPatch.rotation.x = -Math.PI / 2; at(sunPatch, 0.6, 0.01, 0.4); g.add(sunPatch);

    return { group: g, light: '顶光 + 侧逆光强化轮廓（可配黄金时刻）', ground: true };
  }

  /* ============ 4. 简洁背景棚拍 ============ */
  function studio() {
    var g = new (T().Group)();
    var floor = plane(10, 10, 0x1b2130, 0.9); floor.rotation.x = -Math.PI / 2; g.add(floor);
    g.add(at(plane(8, 3.4, 0x232c40, 0.9), 0, 1.7, -3.2));
    var curve = plane(8, 0.9, 0x26304a, 0.75);
    curve.rotation.x = -Math.PI / 4; at(curve, 0, 0.32, -2.9); g.add(curve);

    /* 产品台 */
    g.add(at(cyl(0.62, 0.68, 0.85, 0x2f3a52, 0.95, 28), 0, 0.43, 0));
    g.add(at(cyl(0.64, 0.64, 0.03, 0x44536f, 0.95, 28), 0, 0.87, 0));

    /* 左前主柔光箱 */
    var softbox = new (T().Group)();
    softbox.add(at(box(1.5, 1.5, 0.08, 0xdfe9ff, 0.30), 0, 0, 0));
    softbox.add(at(frame(1.5, 1.5, 0x9fb6dd, 0.7, 0.05), 0, 0, 0.01));
    softbox.position.set(-3.0, 1.9, 1.4); softbox.rotation.y = Math.PI / 5;
    g.add(softbox);

    /* 右后侧逆光条灯 */
    g.add(at(box(0.12, 2.0, 0.12, 0xa8e8ff, 0.55), 2.6, 1.9, -1.6));
    g.add(at(box(0.5, 2.2, 0.5, 0xa8e8ff, 0.10), 2.6, 1.9, -1.6));

    /* 灯架 */
    [[-3.0, 1.4], [2.6, -1.6]].forEach(function (p) {
      g.add(at(cyl(0.03, 0.03, 2.6, 0x3a4459, 0.8, 8), p[0], 1.3, p[1]));
      g.add(at(cyl(0.24, 0.28, 0.05, 0x3a4459, 0.8, 14), p[0], 0.03, p[1]));
    });

    /* 反光板 */
    var refl = box(0.9, 1.1, 0.04, 0xe8eefc, 0.22);
    refl.position.set(1.6, 1.2, 1.8); refl.rotation.y = -Math.PI / 6;
    g.add(refl);

    return { group: g, light: '左前主柔光 + 右后侧逆光勾边（可控光环境）', ground: false };
  }

  /* ============ 5. 咖啡馆氛围位 ============ */
  function cafe() {
    var g = new (T().Group)();
    var floor = plane(10, 10, 0x1c1712, 0.9); floor.rotation.x = -Math.PI / 2; g.add(floor);
    g.add(at(plane(10, 3.2, 0x241c16, 0.85), 0, 1.6, -4.0));

    /* 落地窗（右侧） */
    var winGrp = new (T().Group)();
    winGrp.add(at(plane(3.2, 2.4, 0xffd9a8, 0.22), 0, 1.5, 0));
    winGrp.add(at(frame(3.2, 2.4, 0x6b5a44, 0.85, 0.06), 0, 1.5, 0.02));
    winGrp.position.set(3.4, 0, -1.0); winGrp.rotation.y = -Math.PI / 2;
    g.add(winGrp);

    var warm = plane(3.6, 3.0, 0xffca8a, 0.12);
    warm.rotation.x = -Math.PI / 2; at(warm, 1.2, 0.012, -0.4); g.add(warm);

    /* 桌椅组：桌 + 杯碟 + 两椅 */
    function tableSet(x, z, ry) {
      var t = new (T().Group)();
      t.add(at(cyl(0.42, 0.42, 0.05, 0x4a3826, 0.95, 20), 0, 0.74, 0));
      t.add(at(cyl(0.05, 0.07, 0.72, 0x352818, 0.9, 10), 0, 0.36, 0));
      t.add(at(cyl(0.26, 0.30, 0.04, 0x352818, 0.9, 16), 0, 0.02, 0));
      t.add(at(cyl(0.05, 0.04, 0.09, 0xf2e6d8, 0.95, 12), 0.12, 0.81, 0.06));
      t.add(at(cyl(0.09, 0.09, 0.012, 0xf2e6d8, 0.9, 14), 0.12, 0.765, 0.06));
      t.position.set(x, 0, z); t.rotation.y = ry;
      g.add(t);

      [[-0.75, 0], [0.75, 0]].forEach(function (p, i) {
        var c = new (T().Group)();
        c.add(at(box(0.42, 0.05, 0.42, 0x453425, 0.95), 0, 0.46, 0));
        c.add(at(box(0.42, 0.48, 0.05, 0x453425, 0.9), 0, 0.7, i ? 0.19 : -0.19));
        [[-0.17, -0.17], [0.17, -0.17], [-0.17, 0.17], [0.17, 0.17]].forEach(function (q) {
          c.add(at(cyl(0.02, 0.02, 0.46, 0x362a1c, 0.9, 6), q[0], 0.23, q[1]));
        });
        c.position.set(x + p[0], 0, z + p[1]); c.rotation.y = ry;
        g.add(c);
      });
    }
    tableSet(0.3, 0.6, 0.4);
    tableSet(-2.3, -1.4, -0.5);

    /* 吧台 */
    g.add(at(box(3.6, 0.09, 0.6, 0x5a4228, 0.95), -1.2, 1.02, -3.2));
    g.add(at(box(3.6, 1.0, 0.55, 0x3d2c1a, 0.9), -1.2, 0.5, -3.25));

    /* 吊灯 + 地面光斑 */
    [-2.2, -0.4, 1.4].forEach(function (x) {
      g.add(at(cyl(0.006, 0.006, 0.6, 0x4a3c2c, 0.6, 6), x, 2.85, -2.6));
      g.add(at(cyl(0.10, 0.16, 0.16, 0xffcf94, 0.8, 14), x, 2.5, -2.6));
      var glow = plane(0.9, 0.9, 0xffcf94, 0.10);
      glow.rotation.x = -Math.PI / 2; at(glow, x, 0.01, -2.6); g.add(glow);
    });

    g.add(at(box(1.1, 0.8, 0.04, 0x2c2116, 0.9), -2.6, 1.9, -3.95));

    return { group: g, light: '窗光 + 桌面反射 + 暖色吊灯', ground: true };
  }

  /* ============ 6. 雨后反光地面 ============ */
  function rainReflect() {
    var g = new (T().Group)();
    var road = plane(11, 11, 0x0b1220, 0.95); road.rotation.x = -Math.PI / 2; g.add(road);

    /* 积水镜面 */
    for (var i = 0; i < 7; i++) {
      var pd = plane(1.4 + Math.random() * 1.8, 0.7 + Math.random() * 1.0, 0x3f6f9e, 0.20);
      pd.rotation.x = -Math.PI / 2;
      pd.rotation.z = Math.random() * Math.PI;
      at(pd, (Math.random() - 0.5) * 7, 0.008, (Math.random() - 0.5) * 7);
      g.add(pd);
    }

    /* 街灯 + 湿地垂直倒影 */
    [[-2.6, -1.0], [2.4, 1.6]].forEach(function (q) {
      g.add(at(cyl(0.05, 0.06, 3.6, 0x2b3346, 0.9, 8), q[0], 1.8, q[1]));
      g.add(at(cyl(0.22, 0.06, 0.2, 0xffd9a0, 0.85, 12), q[0], 3.66, q[1]));
      var refl = plane(0.5, 3.2, 0xffc98a, 0.14);
      refl.rotation.x = -Math.PI / 2; at(refl, q[0], 0.01, q[1] + 1.8);
      g.add(refl);
    });

    /* 雨丝 */
    for (var r = 0; r < 90; r++) {
      var drop = box(0.012, 0.30, 0.012, 0xa8c8e8, 0.30);
      drop.position.set((Math.random() - 0.5) * 9, Math.random() * 4.2, (Math.random() - 0.5) * 9);
      drop.rotation.z = 0.22;
      g.add(drop);
    }

    /* 建筑剪影 */
    for (var b = 0; b < 9; b++) {
      var h = 1.4 + Math.random() * 3.0;
      g.add(at(box(0.9 + Math.random() * 0.8, h, 0.6, 0x0e1626, 0.9),
        -6 + b * 1.5, h / 2, -5.5 - Math.random()));
    }

    return { group: g, light: '街灯硬光 + 湿地倒影作二次光源', ground: false };
  }

  /* ============ 7. 户外黄金时刻（兼蓝调时刻） ============ */
  function goldenHour() {
    var g = new (T().Group)();
    var grass = plane(11, 11, 0x1d2a1c, 0.9); grass.rotation.x = -Math.PI / 2; g.add(grass);

    /* 低角度暖阳 */
    g.add(at(plane(2.6, 2.6, 0xffb066, 0.35), -3.6, 1.5, -6.2));
    g.add(at(plane(6.0, 4.0, 0xff9a4a, 0.12), -3.6, 1.8, -6.4));

    /* 远景丘陵 */
    for (var i = 0; i < 6; i++) {
      g.add(at(box(2.6, 1.2 + Math.random() * 0.9, 1.0, 0x16241a, 0.85),
        -7 + i * 2.6, 0.3, -7.4 - Math.random()));
    }

    /* 地面长影 */
    for (var s = 0; s < 5; s++) {
      var sh = plane(0.22, 2.6 + Math.random(), 0x0d1408, 0.35);
      sh.rotation.x = -Math.PI / 2;
      sh.rotation.z = -0.5;
      at(sh, -1.5 + s * 0.9, 0.012, 0.6 + Math.random() * 0.8);
      g.add(sh);
    }

    /* 近景草丛 */
    for (var t = 0; t < 26; t++) {
      var blade = box(0.03, 0.22 + Math.random() * 0.2, 0.03, 0x2e4a2a, 0.7);
      blade.position.set((Math.random() - 0.5) * 8, 0.12, (Math.random() - 0.5) * 7);
      blade.rotation.z = (Math.random() - 0.5) * 0.3;
      g.add(blade);
    }

    /* 树：树干 + 三层树冠 */
    g.add(at(cyl(0.09, 0.13, 2.2, 0x2a2016, 0.95, 8), 3.4, 1.1, -1.2));
    [0, 1, 2].forEach(function (k) {
      g.add(at(cyl(0.75 - k * 0.16, 0.95 - k * 0.16, 0.55, 0x223a20, 0.7, 12), 3.4, 2.3 + k * 0.34, -1.2));
    });

    return { group: g, light: '低角度暖阳逆光/侧逆光，发丝光与轮廓光', ground: true };
  }

  /* ============ 8. 通用外景 ============ */
  function generic() {
    var g = new (T().Group)();
    var floor = plane(11, 11, 0x161d2c, 0.85); floor.rotation.x = -Math.PI / 2; g.add(floor);

    [[-3.2, -2.4, 1.6, 2.2], [3.0, -1.8, 1.4, 1.8], [-1.2, -3.4, 2.0, 2.6]].forEach(function (b) {
      g.add(at(box(b[2], b[3], 1.2, 0x1e2839, 0.7), b[0], b[3] / 2, b[1]));
    });

    var beam = plane(6, 1.6, 0x8fb4ff, 0.10);
    beam.rotation.x = -Math.PI / 2;
    beam.rotation.z = 0.5;
    at(beam, 0, 0.012, 0.4);
    g.add(beam);

    return { group: g, light: '通用自然光（建议补充具体场景关键词）', ground: true };
  }

  /* 场景 id → 构造器。id 与 cinematography.js 的 SCENES 保持一致 */
  var ENVS = {
    'indoor-window': indoorWindow,
    'street-night': streetNight,
    'sports-arena': rooftop,
    'studio-clean': studio,
    'cafe-mood': cafe,
    'rain-reflect': rainReflect,
    'outdoor-golden': goldenHour,
    'blue-hour': goldenHour,
    'generic': generic
  };

  window.GS_ENV = {
    /* 建环境；失败时退回通用场景，保证预演不中断 */
    create: function (sceneId) {
      if (!window.THREE) return null;
      var fn = ENVS[sceneId] || ENVS['generic'];
      try { return fn(); }
      catch (e) { try { return ENVS['generic'](); } catch (e2) { return null; } }
    },
    has: function (sceneId) { return !!ENVS[sceneId]; },
    ids: function () { return Object.keys(ENVS); }
  };
})();
