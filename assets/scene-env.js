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

  /* ============ 环境配色体系 ============
     为了让"环境模型边界"一眼可辨，环境元素按功能分色，且每类色相保持稳定：
       地面 SHELL   冷灰蓝，低饱和、压暗——只做承载，不抢视线
       墙体 WALL    比地面略亮一档，形成"盒子"的体感
       轮廓 EDGE    中蓝，用于勾出墙/体量/大件家具的边界
       家具 PROP   各场景主题色（木/布/金属），是"可碰撞道具"
       器材 GEAR    冷银蓝 + 青色点缀，摄影灯光器材统一色
       光源 LIGHT   暖橙/品红/青，是发光体，最亮
       标记 MARK    低饱和青灰，走位区与地面参考线
     与角色严格区分：演员 = 亮青 #7ef3ff，摄影师 = 橙 #ffb75e（都不出现在环境里）。 */
  var C = {
    SHELL: 0x1a2231, WALL: 0x232e42, EDGE: 0x44587e,
    MARK: 0x5a76a8,
    PROP_WOOD: 0x5c452c, PROP_WOOD_D: 0x412f1c,
    PROP_FABRIC: 0x4a5878, PROP_METAL: 0x6b7a9c,
    GEAR: 0x4a5878, GEAR_LIT: 0xb0ecff,
    LIGHT_WARM: 0xffcf94, LIGHT_SUN: 0xffb066, LIGHT_NEON: 0x22d3ee, LIGHT_NEON2: 0xff3d9a
  };
  /* 矩形体量的轮廓线：让"这是一个实体"一目了然 */
  function edges(w, h, d, color, opacity) {
    return new (T().LineSegments)(
      new (T().EdgesGeometry)(new (T().BoxGeometry)(w, h, d)),
      new (T().LineBasicMaterial)({ color: color == null ? C.EDGE : color, transparent: true, opacity: opacity == null ? 0.55 : opacity })
    );
  }
  /* 地面走位区标记环 */
  function markRing(x, z, r, y, color) {
    var ring = new (T().Mesh)(
      new (T().RingGeometry)(r, r + 0.05, 44),
      new (T().MeshBasicMaterial)({ color: color == null ? C.MARK : color, transparent: true, opacity: 0.30, side: T().DoubleSide })
    );
    ring.rotation.x = -Math.PI / 2;
    at(ring, x, y == null ? 0.012 : y, z);
    return ring;
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

  /* ============ 障碍区域 ============
     每个场景登记"人不能穿过"的立式道具，走位求解器据此把火柴人推开，
     避免演员/摄影师穿进桌椅与器材。
     只登记真正占地的物体（桌、台、灯架、器材）；
     地面 / 墙面 / 远景剪影不登记（它们不是障碍，否则会把整个场地判为不可站）。 */
  function Obstacles() { this.list = []; }
  Obstacles.prototype.add = function (x, z, r, label) {
    this.list.push({ x: x, z: z, r: r, label: label || '' });
    return this;
  };
  Obstacles.prototype.addBox = function (x, z, hw, hd, label) {
    /* 矩形道具用外接圆近似，保证四个方向都推得开 */
    return this.add(x, z, Math.sqrt(hw * hw + hd * hd), label);
  };
  /* 把点推出所有障碍（迭代处理多障碍叠加）。
     要点：
       1) 推出时多留 2cm 余量，否则浮点边界会让点仍被判定为"在内"
       2) 迭代上限后若仍在内（多个大障碍形成围困），退化为"沿远离场地中心方向推到最外层"，
          保证一定能得到一个合法位置，不会让火柴人卡在道具里 */
  Obstacles.prototype.resolve = function (x, z, pad) {
    pad = pad == null ? 0.34 : pad;
    var EPS = 0.02;
    var px = x, pz = z, guard = 0;
    while (guard++ < 12) {
      var moved = false;
      for (var i = 0; i < this.list.length; i++) {
        var o = this.list[i];
        var dx = px - o.x, dz = pz - o.z;
        var need = o.r + pad + EPS;
        var d = Math.sqrt(dx * dx + dz * dz);
        if (d < need) {
          if (d < 1e-4) { dx = 0; dz = 1; d = 1; }   // 恰在圆心：给个默认推离方向
          px = o.x + dx / d * need;
          pz = o.z + dz / d * need;
          moved = true;
        }
      }
      if (!moved) return { x: px, z: pz };
    }
    /* 未收敛：找当前点所在的障碍，沿"从场地中心指向该障碍圆心"的方向推到其外侧 */
    for (var k = 0; k < this.list.length; k++) {
      var ob2 = this.list[k];
      var ddx = px - ob2.x, ddz = pz - ob2.z;
      if (Math.sqrt(ddx * ddx + ddz * ddz) < ob2.r + pad + EPS) {
        var ox = ob2.x, oz = ob2.z;
        if (Math.sqrt(ox * ox + oz * oz) < 1e-4) { ox = 0; oz = -1; }
        var on = Math.sqrt(ox * ox + oz * oz);
        px = ob2.x + ox / on * (ob2.r + pad + EPS);
        pz = ob2.z + oz / on * (ob2.r + pad + EPS);
      }
    }
    return { x: px, z: pz };
  };
  Obstacles.prototype.blocked = function (x, z, pad) {
    pad = pad == null ? 0.34 : pad;
    for (var i = 0; i < this.list.length; i++) {
      var o = this.list[i];
      var dx = x - o.x, dz = z - o.z;
      if (Math.sqrt(dx * dx + dz * dz) < o.r + pad) return true;
    }
    return false;
  };

  /* ============ 1. 室内窗边 ============ */
  function indoorWindow() {
    var g = new (T().Group)();
    var ob = new Obstacles();

    /* 地面与墙体：铺满整个场地，作为"容器"而不是障碍 */
    var floor = plane(11, 11, 0x151b2b, 0.9); floor.rotation.x = -Math.PI / 2; g.add(floor);
    var backWall = plane(11, 3.4, 0x1a2236, 0.8); at(backWall, 0, 1.7, -4.6); g.add(backWall);
    var sideWall = plane(10, 3.4, 0x182034, 0.65);
    sideWall.rotation.y = Math.PI / 2; at(sideWall, -5.0, 1.7, 0); g.add(sideWall);

    /* 墙体轮廓线：明确空间边界（配合第 6 项"区分环境模型边界"） */
    var edge = new (T().LineSegments)(
      new (T().EdgesGeometry)(new (T().BoxGeometry)(10, 3.4, 9.2)),
      new (T().LineBasicMaterial)({ color: 0x3d4f74, transparent: true, opacity: 0.5 })
    );
    at(edge, 0, 1.7, -0.2);
    g.add(edge);

    /* 窗：亮面 + 窗框 + 十字窗棂 + 窗台（贴墙，位于场地左侧） */
    var winGrp = new (T().Group)();
    winGrp.add(at(plane(2.6, 2.0, 0xbcd6ff, 0.30), 0, 1.55, 0.01));
    winGrp.add(at(frame(2.6, 2.0, 0x8fb4e8, 0.85), 0, 1.55, 0.02));
    winGrp.add(at(box(0.04, 2.0, 0.04, 0x8fb4e8, 0.8), 0, 1.55, 0.03));
    winGrp.add(at(box(2.6, 0.04, 0.04, 0x8fb4e8, 0.8), 0, 1.55, 0.03));
    winGrp.add(at(box(3.0, 0.07, 0.30, 0x2a3450, 0.95), 0, 0.52, 0.10));
    winGrp.position.set(-4.55, 0, 0.4); winGrp.rotation.y = Math.PI / 2;
    g.add(winGrp);

    /* 窗光落在地面的亮区：与窗口位置对齐，提示光从哪来 */
    var lightPool = plane(3.6, 3.6, 0x9dc4ff, 0.11);
    lightPool.rotation.x = -Math.PI / 2; at(lightPool, -1.4, 0.012, 0.4); g.add(lightPool);
    /* 光带：从窗口向场地中央斜射的柔光条 */
    var beam = plane(4.6, 1.7, 0xbcd6ff, 0.07);
    beam.rotation.x = -Math.PI / 2; beam.rotation.z = -0.42;
    at(beam, -0.4, 0.014, 0.3); g.add(beam);

    /* 桌椅：移到场地左后侧，避开中央走位区 */
    var table = new (T().Group)();
    table.add(at(box(1.2, 0.07, 0.78, 0x4a5878, 0.95), 0, 0.72, 0));
    table.add(at(box(1.16, 0.03, 0.74, 0x5d6d92, 0.9), 0, 0.755, 0));
    [[-0.52, -0.32], [0.52, -0.32], [-0.52, 0.32], [0.52, 0.32]].forEach(function (p) {
      table.add(at(cyl(0.03, 0.03, 0.72, 0x39445e, 0.95, 8), p[0], 0.36, p[1]));
    });
    /* 桌上：杯碟与一摞书，增加生活感 */
    table.add(at(cyl(0.055, 0.045, 0.10, 0xf5ece0, 0.95, 12), 0.22, 0.81, 0.10));
    table.add(at(cyl(0.10, 0.10, 0.014, 0xf5ece0, 0.9, 14), 0.22, 0.765, 0.10));
    table.add(at(box(0.24, 0.05, 0.18, 0x8a6a4a, 0.9), -0.26, 0.79, -0.06));
    table.add(at(box(0.22, 0.04, 0.16, 0x9c7a58, 0.9), -0.26, 0.835, -0.04));
    table.position.set(-2.5, 0, -2.0); table.rotation.y = 0.42;
    g.add(table);
    ob.add(-2.5, -2.0, 0.72, '桌');

    var chair = new (T().Group)();
    chair.add(at(box(0.46, 0.06, 0.46, 0x47536e, 0.95), 0, 0.45, 0));
    chair.add(at(box(0.46, 0.52, 0.06, 0x47536e, 0.9), 0, 0.72, -0.20));
    [[-0.19, -0.19], [0.19, -0.19], [-0.19, 0.19], [0.19, 0.19]].forEach(function (q) {
      chair.add(at(cyl(0.022, 0.022, 0.45, 0x39445e, 0.9, 6), q[0], 0.225, q[1]));
    });
    chair.position.set(-1.9, 0, -0.7); chair.rotation.y = 1.15;
    g.add(chair);
    ob.add(-1.9, -0.7, 0.34, '椅');

    /* 地毯：中央走位区的地面标记（不构成障碍，反而是"站位参考"） */
    var rug = plane(3.2, 2.6, 0x27324f, 0.45);
    rug.rotation.x = -Math.PI / 2; at(rug, 0.5, 0.008, 0.4); g.add(rug);
    /* 走位区边界线：圈出演员可站的范围，帮助理解构图 */
    var ring = new (T().Mesh)(
      new (T().RingGeometry)(2.30, 2.36, 48),
      new (T().MeshBasicMaterial)({ color: 0x3f5b8a, transparent: true, opacity: 0.35, side: T().DoubleSide })
    );
    ring.rotation.x = -Math.PI / 2; at(ring, 0.5, 0.010, 0.4); g.add(ring);

    /* 吊灯 */
    var lamp = new (T().Group)();
    lamp.add(at(cyl(0.008, 0.008, 0.7, 0x66708c, 0.6, 6), 0, 3.05, 0));
    lamp.add(at(cyl(0.24, 0.32, 0.24, 0xffe9b8, 0.78, 14), 0, 2.62, 0));
    lamp.add(at(cyl(0.30, 0.30, 0.02, 0xffe9b8, 0.3, 14), 0, 2.50, 0));
    lamp.position.set(0.5, 0, 0.4);
    g.add(lamp);

    /* 右后侧矮柜 + 绿植：补足场地另一侧，避免单侧太空 */
    var cabinet = new (T().Group)();
    cabinet.add(at(box(1.0, 0.62, 0.42, 0x3c4a66, 0.95), 0, 0.31, 0));
    cabinet.add(at(box(1.02, 0.03, 0.44, 0x56668a, 0.9), 0, 0.63, 0));
    cabinet.position.set(2.9, 0, -3.0); cabinet.rotation.y = -0.3;
    g.add(cabinet);
    ob.add(2.9, -3.0, 0.66, '矮柜');

    var plant = new (T().Group)();
    plant.add(at(cyl(0.13, 0.16, 0.26, 0x6b4f3a, 0.95, 12), 0, 0.13, 0));
    [0, 1, 2].forEach(function (k) {
      plant.add(at(cyl(0.02, 0.02, 0.5 + k * 0.14, 0x2f5238, 0.85, 6), (k - 1) * 0.09, 0.5 + k * 0.06, (k % 2) * 0.07));
    });
    plant.add(at(new (T().Mesh)(new (T().SphereGeometry)(0.26, 10, 8), mat(0x35603f, 0.75)), 0, 0.78, 0));
    plant.position.set(3.9, 0, -2.0);
    g.add(plant);
    ob.add(3.9, -2.0, 0.34, '绿植');

    return { group: g, light: '单侧窗户主光（柔和侧光）· 室内吊灯为辅', ground: false, obstacles: ob };
  }

  /* ============ 2. 城市夜景街头 ============ */
  function streetNight() {
    var g = new (T().Group)();
    var ob = new Obstacles();

    var road = plane(12, 12, 0x101828, 0.94); road.rotation.x = -Math.PI / 2; g.add(road);
    /* 湿沥青反光带：沿街道走向铺开，强化纵深感 */
    var wet = plane(2.6, 12, 0x22405c, 0.32); wet.rotation.x = -Math.PI / 2; at(wet, 0, 0.006, 0); g.add(wet);
    var wet2 = plane(1.1, 9, 0x2e5678, 0.22); wet2.rotation.x = -Math.PI / 2; at(wet2, 1.6, 0.008, -0.5); g.add(wet2);
    /* 人行道边线：划分街道与走位区 */
    var curb = box(0.10, 0.10, 11, 0x39455e, 0.8); at(curb, -2.35, 0.05, 0); g.add(curb);
    var curb2 = box(0.10, 0.10, 11, 0x39455e, 0.8); at(curb2, 3.35, 0.05, 0); g.add(curb2);

    /* 楼体：沿街道两侧贴近人行道布置，形成"街巷夹峙"的包围感。
       靠近但不越过走位区（中央留给火柴人），因此不会穿模。 */
    var buildings = [
      { x: -3.5, z: -3.4, w: 2.0, h: 5.4, d: 2.4, c: 0x151d30 },
      { x: -3.2, z: 0.2, w: 1.8, h: 3.9, d: 2.2, c: 0x121a2a },
      { x: -4.0, z: 3.4, w: 1.6, h: 3.0, d: 1.9, c: 0x111827 },
      { x: 3.7, z: -2.6, w: 2.2, h: 6.2, d: 2.6, c: 0x161f33 },
      { x: 3.4, z: 1.2, w: 1.8, h: 3.6, d: 2.2, c: 0x111827 },
      { x: 4.1, z: 4.2, w: 1.6, h: 2.8, d: 2.0, c: 0x101724 }
    ];
    buildings.forEach(function (b) {
      g.add(at(box(b.w, b.h, b.d, b.c, 0.96), b.x, b.h / 2, b.z));
      /* 楼体轮廓线：让远近层次更清楚 */
      g.add(at(new (T().LineSegments)(
        new (T().EdgesGeometry)(new (T().BoxGeometry)(b.w, b.h, b.d)),
        new (T().LineBasicMaterial)({ color: 0x33456b, transparent: true, opacity: 0.55 })
      ), b.x, b.h / 2, b.z));
      /* 窗灯 */
      for (var i = 0; i < 10; i++) {
        if (Math.random() > 0.6) continue;
        var lit = Math.random() > 0.45;
        var win = box(0.18, 0.22, 0.03, lit ? 0xffd08a : 0x8fd8ff, lit ? 0.85 : 0.45);
        at(win,
          b.x + (Math.random() - 0.5) * (b.w * 0.66),
          0.8 + Math.random() * (b.h - 1.6),
          b.z + (b.x < 0 ? b.d / 2 + 0.02 : -b.d / 2 - 0.02));
        g.add(win);
      }
      /* 登记障碍：近侧建筑必须挡住走位，防止穿模 */
      ob.add(b.x, b.z, Math.sqrt(b.w * b.w + b.d * b.d) / 2, '楼体');
    });

    /* 远景天际线：压在建筑之后，纯装饰、不挡人（不登记障碍） */
    for (var sf = 0; sf < 16; sf++) {
      var sh2 = 2.0 + Math.random() * 4.2;
      var sw = 1.0 + Math.random() * 1.4;
      g.add(at(box(sw, sh2, 1.0, 0x0d1420, 0.92),
        -10 + sf * 1.35, sh2 / 2 - 0.6, -7.2 - Math.random() * 2.4));
    }

    /* 霓虹招牌：贴在近侧楼面上，形成冷暖对冲的主色源 */
    [
      { x: -2.38, y: 2.9, z: -3.4, w: 0.10, h: 1.7, c: 0xff3d9a },
      { x: -2.26, y: 2.0, z: -3.4, w: 0.10, h: 1.0, c: 0xff8ad0 },
      { x: -2.24, y: 1.3, z: 0.2, w: 0.10, h: 1.2, c: 0xff3d9a },
      { x: 2.55, y: 3.3, z: -2.6, w: 0.10, h: 2.0, c: 0x22d3ee },
      { x: 2.55, y: 2.2, z: -0.6, w: 1.6, h: 0.10, c: 0x22d3ee },
      { x: 2.46, y: 1.5, z: 1.2, w: 0.10, h: 1.1, c: 0x7ef3ff }
    ].forEach(function (n) {
      g.add(at(box(n.w, n.h, 0.06, n.c, 0.88), n.x, n.y, n.z));
      /* 光晕：同位置放大半透明片 */
      g.add(at(box(n.w * 4.0, n.h * 1.3, 0.02, n.c, 0.14), n.x + (n.x < 0 ? -0.06 : 0.06), n.y, n.z));
    });
    /* 地面霓虹倒光：招牌在地面的彩色反射 */
    [[-2.5, -3.0, 0xff3d9a], [2.6, -1.4, 0x22d3ee]].forEach(function (q) {
      var gl = plane(1.5, 2.4, q[2], 0.10);
      gl.rotation.x = -Math.PI / 2;
      gl.rotation.z = -0.5;
      at(gl, q[0], 0.013, q[1]);
      g.add(gl);
    });

    /* 人行道抬面：给街道一个"路面/人行道"的高差 */
    var walkL = box(0.9, 0.14, 12, 0x2a3448, 0.85); at(walkL, -2.85, 0.07, 0); g.add(walkL);
    var walkR = box(0.9, 0.14, 12, 0x2a3448, 0.85); at(walkR, 3.85, 0.07, 0); g.add(walkR);
    /* 人行道边线 */
    g.add(at(box(0.04, 0.16, 12, 0x4a5878, 0.7), -2.41, 0.08, 0));
    g.add(at(box(0.04, 0.16, 12, 0x4a5878, 0.7), 4.29, 0.08, 0));

    /* 路灯：立在人行道边（走位区之外），带地面光池 */
    [[-2.9, -3.6], [3.9, 3.0]].forEach(function (p) {
      g.add(at(cyl(0.06, 0.07, 3.6, 0x323c53, 0.92, 8), p[0], 1.8, p[1]));
      g.add(at(cyl(0.22, 0.06, 0.20, 0xffd9a0, 0.88, 12), p[0], 3.68, p[1]));
      /* 悬臂 + 灯头伸出到街道上方 */
      var armDir = p[0] < 0 ? 1 : -1;
      g.add(at(box(0.9, 0.05, 0.05, 0x323c53, 0.85), p[0] + armDir * 0.45, 3.62, p[1]));
      var pool = plane(3.4, 3.4, 0xffc98a, 0.11);
      pool.rotation.x = -Math.PI / 2; at(pool, p[0] + armDir * 0.5, 0.010, p[1]);
      g.add(pool);
      ob.add(p[0], p[1], 0.24, '路灯');
    });

    /* 街边咖啡摊：移到右侧人行道，避开中央走位 */
    var stall = new (T().Group)();
    stall.add(at(box(1.7, 0.09, 0.85, 0x322a42, 0.96), 0, 0.95, 0));
    stall.add(at(box(1.7, 0.92, 0.07, 0x3d3350, 0.88), 0, 0.5, -0.42));
    [[-0.76, -0.36], [0.76, -0.36], [-0.76, 0.36], [0.76, 0.36]].forEach(function (q) {
      stall.add(at(cyl(0.032, 0.032, 0.95, 0x2a2438, 0.92, 6), q[0], 0.47, q[1]));
    });
    /* 台面灯串 + 招牌 */
    stall.add(at(box(1.6, 0.05, 0.05, 0xffb75e, 0.92), 0, 1.64, 0));
    stall.add(at(box(0.9, 0.22, 0.04, 0xffd9a0, 0.7), 0, 1.42, -0.3));
    /* 台面物件：咖啡机与杯 */
    stall.add(at(box(0.3, 0.26, 0.24, 0x8c8f9c, 0.95), -0.45, 1.12, 0));
    stall.add(at(cyl(0.05, 0.04, 0.09, 0xf5ece0, 0.95, 10), 0.3, 1.04, 0.1));
    stall.position.set(4.35, 0, 1.1); stall.rotation.y = -0.42;
    g.add(stall);
    ob.add(4.35, 1.1, 0.95, '咖啡摊');

    /* 垃圾桶 / 消防栓：街道细节，同样放在走位区外 */
    var bin = new (T().Group)();
    bin.add(at(cyl(0.20, 0.17, 0.62, 0x3a4459, 0.92, 12), 0, 0.31, 0));
    bin.add(at(cyl(0.22, 0.22, 0.05, 0x4d5a75, 0.9, 12), 0, 0.64, 0));
    bin.position.set(-2.9, 0, 2.6); g.add(bin);
    ob.add(-2.9, 2.6, 0.28, '垃圾桶');

    /* 地面积水高光 */
    [[-0.7, 1.3, 1.3, 0.55], [1.4, -1.8, 0.9, 0.4]].forEach(function (q) {
      var puddle = plane(q[2], q[3], 0x5083b4, 0.24);
      puddle.rotation.x = -Math.PI / 2; at(puddle, q[0], 0.011, q[1]);
      g.add(puddle);
    });

    return { group: g, light: '霓虹冷暖对冲（品红 / 青色）+ 路灯暖光', ground: false, obstacles: ob };
  }

  /* ============ 3. 天台 / 运动场馆 ============ */
  function rooftop() {
    var g = new (T().Group)();
    var ob = new Obstacles();

    var deck = plane(12, 12, 0x1c2434, 0.92); deck.rotation.x = -Math.PI / 2; g.add(deck);
    /* 地砖分格：给出天台的地面尺度感 */
    for (var t = -5; t <= 5; t++) {
      g.add(at(box(11, 0.012, 0.03, 0x2b374d, 0.5), 0, 0.006, t * 1.05));
      g.add(at(box(0.03, 0.012, 11, 0x2b374d, 0.5), t * 1.05, 0.006, 0));
    }

    /* 围栏：沿后侧与左侧布置，立柱 + 双横杆 */
    var railMat = mat(0x4a5878, 0.88);
    for (var i = -5; i <= 5; i++) {
      var post = new (T().Mesh)(new (T().BoxGeometry)(0.06, 1.10, 0.06), railMat);
      at(post, i * 1.1, 0.55, -5.0); g.add(post);
    }
    g.add(at(new (T().Mesh)(new (T().BoxGeometry)(11.2, 0.06, 0.06), railMat), 0, 1.10, -5.0));
    g.add(at(new (T().Mesh)(new (T().BoxGeometry)(11.2, 0.045, 0.045), railMat), 0, 0.62, -5.0));
    /* 左侧围栏（转角） */
    for (var i2 = -4; i2 <= 4; i2++) {
      g.add(at(new (T().Mesh)(new (T().BoxGeometry)(0.06, 1.10, 0.06), railMat), -5.4, 0.55, i2 * 1.2));
    }
    g.add(at(new (T().Mesh)(new (T().BoxGeometry)(0.06, 0.06, 10.6), railMat), -5.4, 1.10, 0));

    /* 远景城市剪影：压在围栏之外，形成天际线 */
    for (var b = 0; b < 20; b++) {
      var h = 0.9 + Math.random() * 3.2;
      var blk = box(0.75 + Math.random() * 0.8, h, 0.6, 0x0d1420, 0.92);
      at(blk, -8 + b * 0.85, h / 2 - 0.5, -6.6 - Math.random() * 1.8);
      g.add(blk);
    }
    /* 地平线暖带：黄金时刻的天光 */
    g.add(at(plane(18, 2.6, 0xff9d5c, 0.11), 0, 1.6, -8.6));
    g.add(at(plane(18, 1.1, 0xffd0a0, 0.07), 0, 0.9, -8.4));

    /* 天台设备：空调外机（含风扇与格栅）+ 通风管，均置于边角 */
    var ac = new (T().Group)();
    ac.add(at(box(1.2, 0.9, 0.75, 0x323c52, 0.96), 0, 0.45, 0));
    ac.add(at(box(1.22, 0.05, 0.77, 0x4a5878, 0.9), 0, 0.92, 0));
    var acFan = cyl(0.28, 0.28, 0.04, 0x56668a, 0.92, 16);
    acFan.rotation.x = Math.PI / 2; at(acFan, 0, 0.5, 0.39); ac.add(acFan);
    for (var bl = -2; bl <= 2; bl++) {
      ac.add(at(box(0.5, 0.03, 0.02, 0x3d4a66, 0.8), 0, 0.5 + bl * 0.07, 0.40));
    }
    ac.position.set(-3.4, 0, -3.6);
    g.add(ac);
    ob.add(-3.4, -3.6, 0.78, '空调外机');

    var vent = new (T().Group)();
    vent.add(at(cyl(0.24, 0.24, 1.4, 0x323c52, 0.92, 12), 0, 0.7, 0));
    vent.add(at(cyl(0.30, 0.30, 0.06, 0x4a5878, 0.9, 12), 0, 1.42, 0));
    vent.position.set(4.0, 0, -2.6);
    g.add(vent);
    ob.add(4.0, -2.6, 0.34, '通风管');

    /* 训练架：贴合"天台练习"语义，放在右侧但不挡走位 */
    var rack = new (T().Group)();
    rack.add(at(box(0.09, 2.0, 0.09, 0x5a6c90, 0.92), -0.6, 1.0, 0));
    rack.add(at(box(0.09, 2.0, 0.09, 0x5a6c90, 0.92), 0.6, 1.0, 0));
    rack.add(at(box(1.28, 0.09, 0.09, 0x5a6c90, 0.92), 0, 1.98, 0));
    /* 横杆上的杠铃片 */
    rack.add(at(cyl(0.16, 0.16, 0.05, 0x6b7a9c, 0.9, 14), -0.5, 1.30, 0));
    rack.add(at(cyl(0.16, 0.16, 0.05, 0x6b7a9c, 0.9, 14), 0.5, 1.30, 0));
    rack.position.set(4.0, 0, 1.4); rack.rotation.y = 0.34;
    g.add(rack);
    ob.add(4.0, 1.4, 0.74, '训练架');

    /* 地面标记：跳箱落点，给出"练习"的空间参照 */
    var pad = plane(1.6, 1.6, 0x3a4a68, 0.30);
    pad.rotation.x = -Math.PI / 2; at(pad, 1.4, 0.010, 1.6); g.add(pad);
    var ring = new (T().Mesh)(
      new (T().RingGeometry)(1.10, 1.15, 40),
      new (T().MeshBasicMaterial)({ color: 0x5a76a8, transparent: true, opacity: 0.35, side: T().DoubleSide })
    );
    ring.rotation.x = -Math.PI / 2; at(ring, 1.4, 0.012, 1.6); g.add(ring);

    var sunPatch = plane(3.6, 2.6, 0xffb877, 0.11);
    sunPatch.rotation.x = -Math.PI / 2; at(sunPatch, 0.4, 0.011, 0.6); g.add(sunPatch);

    return { group: g, light: '顶光 + 侧逆光强化轮廓（可配黄金时刻）', ground: false, obstacles: ob };
  }

  /* ============ 4. 简洁背景棚拍 ============ */
  function studio() {
    var g = new (T().Group)();
    var ob = new Obstacles();

    var floor = plane(11, 11, 0x1f2637, 0.92); floor.rotation.x = -Math.PI / 2; g.add(floor);
    /* 无缝背景纸：后墙 + 弧形过渡 */
    g.add(at(plane(9, 3.6, 0x27304a, 0.92), 0, 1.8, -3.6));
    var curve = plane(9, 1.1, 0x2a3450, 0.8);
    curve.rotation.x = -Math.PI / 4; at(curve, 0, 0.39, -3.25); g.add(curve);
    /* 背景纸与地面的交界高光，明确"背景边界" */
    g.add(at(box(9, 0.02, 0.02, 0x4a5c82, 0.5), 0, 0.02, -2.72));

    /* 产品台：置于场地中央偏后，是本体（不是障碍），演员绕它走位 */
    var podium = new (T().Group)();
    podium.add(at(cyl(0.60, 0.68, 0.90, 0x36415c, 0.96, 28), 0, 0.45, 0));
    podium.add(at(cyl(0.63, 0.63, 0.04, 0x51628a, 0.95, 28), 0, 0.92, 0));
    /* 台面顶光条 */
    podium.add(at(cyl(0.40, 0.40, 0.01, 0xa8c8f0, 0.18, 20), 0, 0.945, 0));
    podium.position.set(0, 0, -1.2);
    g.add(podium);
    ob.add(0, -1.2, 0.70, '产品台');

    /* 左前主柔光箱（含灯架与地面脚架） */
    var softbox = new (T().Group)();
    softbox.add(at(box(1.6, 1.6, 0.09, 0xe4eeff, 0.34), 0, 0, 0));
    softbox.add(at(frame(1.6, 1.6, 0xa8bce0, 0.72, 0.05), 0, 0, 0.01));
    /* 柔光箱内部格栅 */
    for (var gz = -2; gz <= 2; gz++) {
      softbox.add(at(box(1.56, 0.02, 0.02, 0xc4d4f0, 0.35), 0, gz * 0.32, -0.04));
    }
    softbox.position.set(-3.6, 2.0, 1.9); softbox.rotation.y = Math.PI / 4.5;
    g.add(softbox);
    var sbStand = new (T().Group)();
    sbStand.add(at(cyl(0.035, 0.035, 2.7, 0x4a5878, 0.85, 8), 0, 1.35, 0));
    sbStand.add(at(cyl(0.28, 0.32, 0.06, 0x4a5878, 0.85, 14), 0, 0.03, 0));
    /* 三脚支撑 */
    [[0.34, 0], [-0.17, 0.30], [-0.17, -0.30]].forEach(function (q) {
      sbStand.add(at(cyl(0.018, 0.018, 0.42, 0x4a5878, 0.8, 6), q[0], 0.20, q[1]));
    });
    sbStand.position.set(-3.6, 0, 1.9);
    g.add(sbStand);
    ob.add(-3.6, 1.9, 0.40, '主灯架');

    /* 右后侧逆光条灯 */
    var rim = new (T().Group)();
    rim.add(at(box(0.14, 2.1, 0.14, 0xb0ecff, 0.6), 0, 1.98, 0));
    rim.add(at(box(0.46, 2.3, 0.46, 0xb0ecff, 0.10), 0, 1.98, 0));
    rim.position.set(3.2, 0, -2.4);
    g.add(rim);
    var rimStand = new (T().Group)();
    rimStand.add(at(cyl(0.030, 0.030, 2.1, 0x4a5878, 0.85, 8), 0, 1.05, 0));
    rimStand.add(at(cyl(0.26, 0.30, 0.06, 0x4a5878, 0.85, 14), 0, 0.03, 0));
    rimStand.position.set(3.2, 0, -2.4);
    g.add(rimStand);
    ob.add(3.2, -2.4, 0.36, '逆光灯架');

    /* 反光板：立在右前方，补面部 */
    var refl = new (T().Group)();
    refl.add(at(box(1.0, 1.2, 0.05, 0xecf2ff, 0.28), 0, 1.2, 0));
    refl.add(at(frame(1.0, 1.2, 0xb0c2e0, 0.6, 0.04), 0, 1.2, 0.01));
    refl.position.set(2.4, 0, 1.7); refl.rotation.y = -Math.PI / 5;
    g.add(refl);
    ob.add(2.4, 1.7, 0.58, '反光板');

    /* 器材箱与备用灯：补足场地细节 */
    var crate = new (T().Group)();
    crate.add(at(box(0.7, 0.45, 0.5, 0x3a4560, 0.95), 0, 0.225, 0));
    crate.add(at(box(0.72, 0.04, 0.52, 0x54648a, 0.9), 0, 0.46, 0));
    crate.position.set(-4.2, 0, -1.6); crate.rotation.y = 0.5;
    g.add(crate);
    ob.add(-4.2, -1.6, 0.50, '器材箱');

    /* 走位区标记环 */
    var ring = new (T().Mesh)(
      new (T().RingGeometry)(1.72, 1.77, 44),
      new (T().MeshBasicMaterial)({ color: 0x5a76a8, transparent: true, opacity: 0.32, side: T().DoubleSide })
    );
    ring.rotation.x = -Math.PI / 2; at(ring, 0, 0.011, 0.5); g.add(ring);

    return { group: g, light: '左前主柔光 + 右后侧逆光勾边（可控光环境）', ground: false, obstacles: ob };
  }

  /* ============ 5. 咖啡馆氛围位 ============ */
  function cafe() {
    var g = new (T().Group)();
    var ob = new Obstacles();

    var floor = plane(12, 12, 0x201a14, 0.92); floor.rotation.x = -Math.PI / 2; g.add(floor);
    /* 木地板拼缝：给出室内尺度 */
    for (var f = -5; f <= 5; f++) {
      g.add(at(box(11, 0.010, 0.02, 0x362b20, 0.45), 0, 0.005, f * 1.05));
    }
    g.add(at(plane(12, 3.4, 0x281f18, 0.88), 0, 1.7, -5.0));

    /* 落地窗：整面墙的窗，是咖啡馆的主光来源 */
    var winGrp = new (T().Group)();
    winGrp.add(at(plane(3.8, 2.6, 0xffd9a8, 0.26), 0, 1.6, 0));
    winGrp.add(at(frame(3.8, 2.6, 0x7a664a, 0.88, 0.07), 0, 1.6, 0.02));
    /* 窗棂：竖三分 */
    [-0.63, 0.63].forEach(function (mx) {
      winGrp.add(at(box(0.05, 2.6, 0.05, 0x7a664a, 0.85), mx, 1.6, 0.03));
    });
    winGrp.add(at(box(3.8, 0.05, 0.05, 0x7a664a, 0.85), 0, 1.6, 0.03));
    winGrp.position.set(4.4, 0, -1.2); winGrp.rotation.y = -Math.PI / 2;
    g.add(winGrp);

    /* 窗光：地面暖区 + 斜射光带 */
    var warm = plane(4.2, 3.4, 0xffca8a, 0.13);
    warm.rotation.x = -Math.PI / 2; at(warm, 1.8, 0.012, -0.8); g.add(warm);
    var beam = plane(5.0, 1.9, 0xffd9a8, 0.07);
    beam.rotation.x = -Math.PI / 2; beam.rotation.z = 0.48;
    at(beam, 2.2, 0.014, 0.2); g.add(beam);

    /* 桌椅组：分布在场地边缘，中央留出走位区 */
    function tableSet(x, z, ry) {
      var t = new (T().Group)();
      t.add(at(cyl(0.46, 0.46, 0.06, 0x5c452c, 0.96, 20), 0, 0.74, 0));
      t.add(at(cyl(0.46, 0.46, 0.02, 0x6d5334, 0.9, 20), 0, 0.78, 0));
      t.add(at(cyl(0.055, 0.08, 0.72, 0x412f1c, 0.92, 10), 0, 0.36, 0));
      t.add(at(cyl(0.28, 0.32, 0.05, 0x412f1c, 0.92, 16), 0, 0.025, 0));
      /* 桌上：杯碟、小蛋糕盘 */
      t.add(at(cyl(0.055, 0.045, 0.10, 0xf7efe4, 0.96, 12), 0.14, 0.83, 0.08));
      t.add(at(cyl(0.10, 0.10, 0.014, 0xf7efe4, 0.92, 14), 0.14, 0.78, 0.08));
      t.add(at(cyl(0.09, 0.09, 0.012, 0xe8dccc, 0.9, 14), -0.16, 0.79, -0.06));
      t.add(at(box(0.10, 0.06, 0.10, 0xd8b98a, 0.9), -0.16, 0.83, -0.06));
      t.position.set(x, 0, z); t.rotation.y = ry;
      g.add(t);

      [[-0.82, 0], [0.82, 0]].forEach(function (p, i) {
        var c = new (T().Group)();
        c.add(at(box(0.46, 0.06, 0.46, 0x55402a, 0.96), 0, 0.46, 0));
        c.add(at(box(0.46, 0.54, 0.06, 0x55402a, 0.92), 0, 0.74, i ? 0.21 : -0.21));
        [[-0.19, -0.19], [0.19, -0.19], [-0.19, 0.19], [0.19, 0.19]].forEach(function (q) {
          c.add(at(cyl(0.024, 0.024, 0.46, 0x453322, 0.92, 6), q[0], 0.23, q[1]));
        });
        c.position.set(x + p[0], 0, z + p[1]); c.rotation.y = ry;
        g.add(c);
      });
      return t;
    }
    tableSet(-3.0, -2.6, 0.42);
    tableSet(-3.4, 1.4, -0.55);
    tableSet(1.6, -4.0, 0.2);
    ob.add(-3.0, -2.6, 0.92, '桌椅');
    ob.add(-3.4, 1.4, 0.92, '桌椅');
    ob.add(1.6, -4.0, 0.92, '桌椅');

    /* 吧台：贴后墙，长条形 */
    var bar = new (T().Group)();
    bar.add(at(box(4.2, 0.10, 0.66, 0x6b4f30, 0.96), 0, 1.04, 0));
    bar.add(at(box(4.2, 1.02, 0.60, 0x47331d, 0.92), 0, 0.51, -0.02));
    /* 台面物件：咖啡机、杯架、菜单立牌 */
    bar.add(at(box(0.5, 0.42, 0.38, 0x9a9da8, 0.95), -1.2, 1.30, 0));
    bar.add(at(box(0.52, 0.05, 0.40, 0x7d828f, 0.9), -1.2, 1.53, 0));
    bar.add(at(cyl(0.10, 0.10, 0.22, 0xc9c2b4, 0.9, 12), 0.4, 1.20, 0));
    bar.add(at(box(0.22, 0.30, 0.03, 0xd8c9a8, 0.85), 1.5, 1.24, 0));
    bar.position.set(-2.4, 0, -4.2); bar.rotation.y = 0.12;
    g.add(bar);
    ob.add(-2.4, -4.2, 2.20, '吧台');

    /* 吧台后墙层板 + 咖啡豆罐 */
    for (var sh = 0; sh < 2; sh++) {
      g.add(at(box(3.2, 0.05, 0.24, 0x5c452c, 0.9), -2.4, 1.7 + sh * 0.5, -4.84));
      for (var j = 0; j < 5; j++) {
        g.add(at(cyl(0.07, 0.07, 0.16, 0x8a6a44, 0.88, 10), -3.7 + j * 0.65, 1.83 + sh * 0.5, -4.84));
      }
    }

    /* 吊灯：暖色，对着桌面而非走位区中心 */
    [[-3.0, -2.6], [-3.4, 1.4], [1.6, -4.0]].forEach(function (p) {
      g.add(at(cyl(0.007, 0.007, 0.7, 0x5c4a34, 0.6, 6), p[0], 3.0, p[1]));
      g.add(at(cyl(0.11, 0.18, 0.17, 0xffcf94, 0.84, 14), p[0], 2.58, p[1]));
      var glow = plane(1.1, 1.1, 0xffcf94, 0.11);
      glow.rotation.x = -Math.PI / 2; at(glow, p[0], 0.011, p[1]); g.add(glow);
    });

    /* 墙上海报与绿植，补足细节 */
    g.add(at(box(1.2, 0.9, 0.05, 0x33261a, 0.9), -0.6, 2.0, -4.94));
    g.add(at(box(1.14, 0.84, 0.02, 0x4a3a28, 0.7), -0.6, 2.0, -4.90));
    var plant = new (T().Group)();
    plant.add(at(cyl(0.15, 0.18, 0.30, 0x7a5b42, 0.95, 12), 0, 0.15, 0));
    plant.add(at(new (T().Mesh)(new (T().SphereGeometry)(0.30, 10, 8), mat(0x3d6b46, 0.78)), 0, 0.66, 0));
    plant.position.set(4.4, 0, 2.2);
    g.add(plant);
    ob.add(4.4, 2.2, 0.36, '绿植');

    /* 走位区标记：中央空地 */
    var ring = new (T().Mesh)(
      new (T().RingGeometry)(1.55, 1.60, 44),
      new (T().MeshBasicMaterial)({ color: 0x8a7350, transparent: true, opacity: 0.30, side: T().DoubleSide })
    );
    ring.rotation.x = -Math.PI / 2; at(ring, 0.5, 0.012, 0.2); g.add(ring);

    return { group: g, light: '窗光 + 桌面反射 + 暖色吊灯', ground: false, obstacles: ob };
  }

  /* ============ 6. 雨后反光地面 ============ */
  function rainReflect() {
    var g = new (T().Group)();
    var ob = new Obstacles();

    var road = plane(12, 12, 0x0d1524, 0.96); road.rotation.x = -Math.PI / 2; g.add(road);
    /* 人行道边线与路缘，界定走位区 */
    g.add(at(box(0.12, 0.12, 12, 0x37435c, 0.82), -2.5, 0.06, 0));
    g.add(at(box(0.12, 0.12, 12, 0x37435c, 0.82), 3.5, 0.06, 0));

    /* 积水镜面：散布但不集中于走位区中心 */
    var puddles = [[-1.3, 2.1, 2.0, 0.9], [1.9, -1.4, 1.6, 0.7], [-0.4, -3.0, 1.3, 0.6],
                   [2.6, 2.4, 1.1, 0.5], [-3.2, 0.4, 1.5, 0.8]];
    puddles.forEach(function (q) {
      var pd = plane(q[2], q[3], 0x4a7cae, 0.22);
      pd.rotation.x = -Math.PI / 2;
      pd.rotation.z = Math.random() * Math.PI;
      at(pd, q[0], 0.008, q[1]);
      g.add(pd);
    });

    /* 街灯：立在人行道边，带湿地垂直倒影 */
    [[-3.1, -1.4], [4.1, 1.2]].forEach(function (q) {
      g.add(at(cyl(0.06, 0.07, 3.8, 0x323c53, 0.92, 8), q[0], 1.9, q[1]));
      g.add(at(cyl(0.24, 0.07, 0.22, 0xffd9a0, 0.88, 12), q[0], 3.86, q[1]));
      /* 悬臂伸向路面 */
      var dir = q[0] < 0 ? 1 : -1;
      g.add(at(box(1.0, 0.06, 0.06, 0x323c53, 0.85), q[0] + dir * 0.5, 3.80, q[1]));
      /* 倒影条：沿路面拉长 */
      var refl = plane(0.7, 4.0, 0xffc98a, 0.15);
      refl.rotation.x = -Math.PI / 2; at(refl, q[0] + dir * 0.9, 0.010, q[1] + 0.6);
      g.add(refl);
      /* 光池 */
      var pool = plane(3.2, 3.2, 0xffc98a, 0.09);
      pool.rotation.x = -Math.PI / 2; at(pool, q[0] + dir * 0.8, 0.011, q[1]);
      g.add(pool);
      ob.add(q[0], q[1], 0.26, '街灯');
    });

    /* 雨丝：只落在走位区之外的上空，避免糊住火柴人 */
    for (var r = 0; r < 110; r++) {
      var ang = Math.random() * Math.PI * 2;
      var rad = 2.4 + Math.random() * 4.2;
      var drop = box(0.013, 0.32, 0.013, 0xb0cce8, 0.26);
      drop.position.set(Math.cos(ang) * rad, Math.random() * 4.6, Math.sin(ang) * rad);
      drop.rotation.z = 0.20;
      g.add(drop);
    }

    /* 建筑剪影 + 轮廓线 */
    for (var b = 0; b < 12; b++) {
      var h = 1.6 + Math.random() * 3.4;
      var w = 0.9 + Math.random() * 0.9;
      var blk = box(w, h, 0.7, 0x111a2c, 0.92);
      at(blk, -7.5 + b * 1.4, h / 2 - 0.2, -6.2 - Math.random() * 1.6);
      g.add(blk);
    }
    /* 霓虹残影：远处招牌的模糊色块 */
    [[-4.8, 2.6, 0xff3d9a], [5.2, 3.2, 0x22d3ee]].forEach(function (n) {
      g.add(at(box(0.14, 1.6, 0.06, n[2], 0.6), n[0], n[1], -6.0));
      g.add(at(box(0.6, 1.9, 0.02, n[2], 0.12), n[0], n[1], -6.0));
    });

    /* 走位区标记 */
    var ring = new (T().Mesh)(
      new (T().RingGeometry)(1.45, 1.50, 44),
      new (T().MeshBasicMaterial)({ color: 0x5a86b8, transparent: true, opacity: 0.30, side: T().DoubleSide })
    );
    ring.rotation.x = -Math.PI / 2; at(ring, 0.4, 0.012, 0.4); g.add(ring);

    return { group: g, light: '街灯硬光 + 湿地倒影作二次光源', ground: false, obstacles: ob };
  }

  /* ============ 7. 户外黄金时刻（兼蓝调时刻） ============ */
  function goldenHour() {
    var g = new (T().Group)();
    var ob = new Obstacles();

    var grass = plane(12, 12, 0x21301f, 0.92); grass.rotation.x = -Math.PI / 2; g.add(grass);
    /* 草地纹理带：斜向铺开，避免大片纯色 */
    for (var gt = 0; gt < 14; gt++) {
      var stripe = plane(0.5 + Math.random() * 0.7, 11, 0x1a2818, 0.35);
      stripe.rotation.x = -Math.PI / 2;
      stripe.rotation.z = -0.32;
      at(stripe, -6 + gt * 0.95, 0.006, 0);
      g.add(stripe);
    }

    /* 低角度暖阳：远地平线处 */
    g.add(at(plane(3.0, 3.0, 0xffb066, 0.38), -4.0, 1.7, -7.0));
    g.add(at(plane(7.0, 4.6, 0xff9a4a, 0.13), -4.0, 2.0, -7.2));
    g.add(at(plane(12, 1.4, 0xffc98a, 0.08), 0, 0.7, -7.4));

    /* 远景丘陵：两层，拉开纵深 */
    for (var i = 0; i < 8; i++) {
      g.add(at(box(2.8, 1.3 + Math.random() * 1.0, 1.1, 0x18281c, 0.88),
        -8.5 + i * 2.4, 0.3, -8.2 - Math.random() * 1.4));
    }
    for (var i2 = 0; i2 < 7; i2++) {
      g.add(at(box(3.0, 0.7 + Math.random() * 0.6, 1.0, 0x1c2e1e, 0.75),
        -7.5 + i2 * 2.5, 0.2, -6.6 - Math.random()));
    }

    /* 地面长影：从光源方向拉出 */
    for (var s = 0; s < 7; s++) {
      var sh = plane(0.24, 3.0 + Math.random() * 1.4, 0x0d1408, 0.32);
      sh.rotation.x = -Math.PI / 2;
      sh.rotation.z = -0.52;
      at(sh, -2.0 + s * 0.95, 0.012, 0.8 + Math.random() * 1.0);
      g.add(sh);
    }

    /* 近景草丛：加密但避开中央 */
    for (var t = 0; t < 40; t++) {
      var ang = Math.random() * Math.PI * 2;
      var rad = 2.1 + Math.random() * 3.4;
      var blade = box(0.035, 0.24 + Math.random() * 0.24, 0.035, 0x33502e, 0.72);
      blade.position.set(Math.cos(ang) * rad, 0.13, Math.sin(ang) * rad);
      blade.rotation.z = (Math.random() - 0.5) * 0.32;
      g.add(blade);
    }

    /* 树：树干 + 三层树冠 + 轮廓线 */
    var tree = new (T().Group)();
    tree.add(at(cyl(0.10, 0.15, 2.4, 0x33261a, 0.96, 8), 0, 1.2, 0));
    /* 分枝 */
    tree.add(at(cyl(0.05, 0.06, 0.9, 0x33261a, 0.9, 6), 0.22, 2.2, 0.1));
    tree.add(at(cyl(0.05, 0.06, 0.8, 0x33261a, 0.9, 6), -0.20, 2.3, -0.08));
    [0, 1, 2].forEach(function (k) {
      tree.add(at(cyl(0.80 - k * 0.17, 1.00 - k * 0.17, 0.58, 0x2a4526, 0.72, 12), 0, 2.5 + k * 0.36, 0));
    });
    tree.position.set(4.2, 0, -1.6);
    g.add(tree);
    ob.add(4.2, -1.6, 0.42, '树');

    /* 远景树丛：不构成障碍，只做背景层次 */
    [[-5.4, -3.4, 0.9], [-6.2, 0.6, 1.1], [6.0, -3.0, 1.0]].forEach(function (q) {
      var bush = new (T().Group)();
      bush.add(at(cyl(0.07, 0.10, 1.5, 0x2a2016, 0.9, 6), 0, 0.75, 0));
      [0, 1].forEach(function (k) {
        bush.add(at(cyl(0.55 - k * 0.14, 0.68 - k * 0.14, 0.44, 0x243d22, 0.68, 10), 0, 1.6 + k * 0.30, 0));
      });
      bush.position.set(q[0], 0, q[1]);
      bush.scale.set(q[2], q[2], q[2]);
      g.add(bush);
    });

    /* 走位区标记 */
    var ring = new (T().Mesh)(
      new (T().RingGeometry)(1.50, 1.55, 44),
      new (T().MeshBasicMaterial)({ color: 0x6f8f68, transparent: true, opacity: 0.30, side: T().DoubleSide })
    );
    ring.rotation.x = -Math.PI / 2; at(ring, 0, 0.013, 0.2); g.add(ring);

    return { group: g, light: '低角度暖阳逆光/侧逆光，发丝光与轮廓光', ground: false, obstacles: ob };
  }

  /* ============ 8. 通用外景 ============ */
  function generic() {
    var g = new (T().Group)();
    var ob = new Obstacles();

    var floor = plane(12, 12, 0x1a2231, 0.9); floor.rotation.x = -Math.PI / 2; g.add(floor);
    /* 网格地面：中性空间的可读参照 */
    for (var i = -5; i <= 5; i++) {
      g.add(at(box(11, 0.010, 0.02, 0x2c3a52, 0.5), 0, 0.006, i * 1.05));
      g.add(at(box(0.02, 0.010, 11, 0x2c3a52, 0.5), i * 1.05, 0.006, 0));
    }

    /* 抽象体量：明确是"占位"，不暗示具体家具 */
    [[-4.0, -3.4, 1.8, 2.4], [4.2, -2.6, 1.6, 2.0], [-3.0, 3.6, 2.2, 2.8]].forEach(function (b) {
      var m = box(b[2], b[3], 1.4, 0x263346, 0.75);
      at(m, b[0], b[3] / 2, b[1]);
      g.add(m);
      g.add(at(new (T().LineSegments)(
        new (T().EdgesGeometry)(new (T().BoxGeometry)(b[2], b[3], 1.4)),
        new (T().LineBasicMaterial)({ color: 0x44587e, transparent: true, opacity: 0.6 })
      ), b[0], b[3] / 2, b[1]));
      ob.add(b[0], b[1], Math.sqrt(b[2] * b[2] + 1.4 * 1.4) / 2, '体量');
    });

    var beam = plane(7, 1.8, 0x8fb4ff, 0.11);
    beam.rotation.x = -Math.PI / 2;
    beam.rotation.z = 0.5;
    at(beam, 0, 0.012, 0.4);
    g.add(beam);

    /* 走位区标记 */
    var ring = new (T().Mesh)(
      new (T().RingGeometry)(1.50, 1.55, 44),
      new (T().MeshBasicMaterial)({ color: 0x5a76a8, transparent: true, opacity: 0.30, side: T().DoubleSide })
    );
    ring.rotation.x = -Math.PI / 2; at(ring, 0, 0.013, 0.3); g.add(ring);

    return { group: g, light: '通用自然光（建议补充具体场景关键词）', ground: false, obstacles: ob };
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
