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

  /* ---------- 火柴人构造（带关节）----------
     骨架分层：胯(hip) → 腰(waist) → 胸(chest) → 颈(neck) → 头(head)
     四肢各两节：肩→肘→腕、胯→膝→踝，因此可以做出屈肘、屈膝、抬手等自然动作，
     而不是原来"肩→手、胯→脚"一根直棍。
     关节处放小球，转动时能看清是哪个关节在动。 */
  function makeStick(color, opts) {
    opts = opts || {};
    var g = new T.Group();
    var lineMat = new T.LineBasicMaterial({ color: color, transparent: true, opacity: 0.95 });
    var jointMat = new T.MeshBasicMaterial({ color: color, transparent: true, opacity: 0.55 });
    var headMat = new T.MeshBasicMaterial({ color: color, transparent: true, opacity: 0.9 });

    var s = opts.scale || 1;
    var seg = function (len) { return len * s; };
    var headR = seg(0.15);
    var jointR = seg(0.028);

    /* 骨架关键高度（相对地面，单位米） */
    var ankleY = 0, kneeY = seg(0.44), hipY = seg(0.82);
    var waistY = seg(0.98), chestY = seg(1.16), neckY = seg(1.36), headY = seg(1.52);

    /* 头 */
    var head = new T.Mesh(new T.SphereGeometry(headR, 14, 12), headMat);
    head.position.y = headY;
    g.add(head);

    /* 躯干：胯→腰→胸→颈 分三段，可做出弯腰/转身 */
    function bone(from, to) {
      var geo = new T.BufferGeometry().setFromPoints([from.clone(), to.clone()]);
      var line = new T.Line(geo, lineMat);
      g.add(line);
      return line;
    }
    var spineLow = bone(new T.Vector3(0, hipY, 0), new T.Vector3(0, waistY, 0));
    var spineMid = bone(new T.Vector3(0, waistY, 0), new T.Vector3(0, chestY, 0));
    var spineUp = bone(new T.Vector3(0, chestY, 0), new T.Vector3(0, neckY, 0));

    /* 关节球：让旋转可见 */
    function joint(y) {
      var j = new T.Mesh(new T.SphereGeometry(jointR, 8, 6), jointMat);
      j.position.y = y;
      g.add(j);
      return j;
    }
    var jWaist = joint(waistY), jChest = joint(chestY);

    /* 四肢两节 */
    var armL_up = bone(new T.Vector3(0, neckY, 0), new T.Vector3(-seg(0.17), seg(1.14), 0));
    var armL_lo = bone(new T.Vector3(-seg(0.17), seg(1.14), 0), new T.Vector3(-seg(0.30), seg(0.98), 0));
    var armR_up = bone(new T.Vector3(0, neckY, 0), new T.Vector3(seg(0.17), seg(1.14), 0));
    var armR_lo = bone(new T.Vector3(seg(0.17), seg(1.14), 0), new T.Vector3(seg(0.30), seg(0.98), 0));
    var legL_up = bone(new T.Vector3(0, hipY, 0), new T.Vector3(-seg(0.09), kneeY, 0));
    var legL_lo = bone(new T.Vector3(-seg(0.09), kneeY, 0), new T.Vector3(-seg(0.16), ankleY, 0));
    var legR_up = bone(new T.Vector3(0, hipY, 0), new T.Vector3(seg(0.09), kneeY, 0));
    var legR_lo = bone(new T.Vector3(seg(0.09), kneeY, 0), new T.Vector3(seg(0.16), ankleY, 0));

    /* 脚掌：一小段横线，让站姿有"踩地"感 */
    var footL = bone(new T.Vector3(-seg(0.16), ankleY, 0), new T.Vector3(-seg(0.16), ankleY, seg(0.14)));
    var footR = bone(new T.Vector3(seg(0.16), ankleY, 0), new T.Vector3(seg(0.16), ankleY, seg(0.14)));

    /* 地面圆环，标明站位 */
    var ringMat = new T.MeshBasicMaterial({ color: color, transparent: true, opacity: 0.22, side: T.DoubleSide });
    var ring = new T.Mesh(new T.RingGeometry(seg(0.30), seg(0.34), 28), ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.006;
    g.add(ring);

    g.userData = {
      head: head,
      spineLow: spineLow, spineMid: spineMid, spineUp: spineUp,
      armL_up: armL_up, armL_lo: armL_lo, armR_up: armR_up, armR_lo: armR_lo,
      legL_up: legL_up, legL_lo: legL_lo, legR_up: legR_up, legR_lo: legR_lo,
      footL: footL, footR: footR,
      jWaist: jWaist, jChest: jChest,
      hipY: hipY, waistY: waistY, chestY: chestY, neckY: neckY, headY: headY,
      kneeY: kneeY, ankleY: ankleY, s: s, lineMat: lineMat
    };
    return g;
  }

  /* 更新单节骨骼端点 */
  function poseBone(line, from, to) {
    var p = line.geometry.attributes.position;
    p.setXYZ(0, from.x, from.y, from.z);
    p.setXYZ(1, to.x, to.y, to.z);
    p.needsUpdate = true;
    line.geometry.computeBoundingSphere();
  }
  /* 兼容旧调用名 */
  var poseLimb = poseBone;

  /* ---------- 把"姿态描述"应用到关节骨架 ----------
     姿态里给出的是各肢体末梢位置（腕 / 踝）与弯曲量，这里据此反推肘与膝的位置，
     从而让两节骨骼呈现自然的屈伸，而不是一根直棍。
     bend>0 表示关节向后弯（肘向体后、膝向体后），符合人体实际活动方向。 */
  function applySkeleton(u, pose) {
    var S = u;

    /* 躯干：允许轻微前倾/侧倾与扭转 */
    var bend = pose.spine || 0;          // 前倾弧度
    var twist = pose.twist || 0;         // 扭转弧度
    var lean = pose.sideLean || 0;       // 侧倾
    var dx = Math.sin(twist) * 0.02;
    var hipP = new T.Vector3(0, S.hipY, 0);
    var waistP = new T.Vector3(dx * 0.5, S.waistY, Math.sin(bend) * 0.035);
    var chestP = new T.Vector3(dx, S.chestY, Math.sin(bend) * 0.075 + lean * 0.02);
    var neckP = new T.Vector3(dx * 1.3, S.neckY, Math.sin(bend) * 0.10 + lean * 0.03);
    poseBone(S.spineLow, hipP, waistP);
    poseBone(S.spineMid, waistP, chestP);
    poseBone(S.spineUp, chestP, neckP);
    S.jWaist.position.set(waistP.x, waistP.y, waistP.z);
    S.jChest.position.set(chestP.x, chestP.y, chestP.z);
    /* 头跟随颈部，并可按需要低头/抬头 */
    var headP = new T.Vector3(neckP.x, neckP.y + (S.headY - S.neckY), neckP.z + Math.sin(bend + (pose.headPitch || 0)) * 0.05);
    S.head.position.copy(headP);

    /* 肩点：由胸位置派生，保证与躯干连贯 */
    var shL = new T.Vector3(chestP.x - 0.17, S.neckY - 0.02, chestP.z);
    var shR = new T.Vector3(chestP.x + 0.17, S.neckY - 0.02, chestP.z);

    /* 手臂：给定腕部位置 wrist，肘部取"肩腕连线的中点 + 侧向偏移" */
    function arm(up, lo, sh, wrist, bendAmt) {
      var mid = new T.Vector3().addVectors(sh, wrist).multiplyScalar(0.5);
      /* 肘向体后（+Z 稍偏）与体外偏移，形成自然折角 */
      var dir = new T.Vector3().subVectors(wrist, sh);
      var len = dir.length() || 1;
      mid.z += (bendAmt == null ? 0.06 : bendAmt);
      mid.y += len * 0.04;
      poseBone(up, sh, mid);
      poseBone(lo, mid, wrist);
    }
    arm(S.armL_up, S.armL_lo, shL, pose.wristL || new T.Vector3(-0.30, 0.98, 0), pose.elbowL);
    arm(S.armR_up, S.armR_lo, shR, pose.wristR || new T.Vector3(0.30, 0.98, 0), pose.elbowR);

    /* 腿：给定踝部位置 ankle，膝部取"胯踝连线中点 + 向前偏移"（膝盖向前弯） */
    function leg(up, lo, foot, hip, ankle, kneeFwd) {
      var mid = new T.Vector3().addVectors(hip, ankle).multiplyScalar(0.5);
      mid.z -= (kneeFwd == null ? 0.05 : kneeFwd);   // 膝向前
      poseBone(up, hip, mid);
      poseBone(lo, mid, ankle);
      /* 脚掌朝前 */
      poseBone(foot, ankle, new T.Vector3(ankle.x, ankle.y, ankle.z + 0.14));
    }
    var hipL = new T.Vector3(hipP.x - 0.09, S.hipY, hipP.z);
    var hipR = new T.Vector3(hipP.x + 0.09, S.hipY, hipP.z);
    leg(S.legL_up, S.legL_lo, S.footL, hipL, pose.ankleL || new T.Vector3(-0.16, 0, 0), pose.kneeL);
    leg(S.legR_up, S.legR_lo, S.footR, hipR, pose.ankleR || new T.Vector3(0.16, 0, 0), pose.kneeR);
  }

  /* ---------- 动物模型（猫 / 狗）----------
     用与火柴人相同的"骨骼 = Line"手法，便于统一驱动与配色。
     四足骨架：躯干 + 头(含吻部/耳朵) + 四肢两节 + 尾巴两节。
     体型按真实比例：
       猫 肩高 ~0.25m、体长 ~0.45m、腿短、尾长且上翘
       狗 肩高 ~0.45m、体长 ~0.75m、腿较长、尾下垂摆动
     legTop 是肩/胯的离地高度，决定"腿有多长"——猫必须明显短于狗。 */
  function makeAnimal(kind, color) {
    var isCat = kind === 'cat';
    var T_ = T;
    var g = new T_.Group();
    var lineMat = new T_.LineBasicMaterial({ color: color, transparent: true, opacity: 0.95 });
    var bodyMat = new T_.MeshBasicMaterial({ color: color, transparent: true, opacity: 0.88 });

    /* 关键尺寸（米） */
    var bodyH = isCat ? 0.16 : 0.26;          // 躯干厚度
    var bodyLen = isCat ? 0.30 : 0.50;        // 躯干长度
    var legLen = isCat ? 0.13 : 0.30;         // 腿长（肩高的一半左右）
    var headR = isCat ? 0.070 : 0.105;
    var bodyY = legLen + bodyH / 2;           // 躯干中心高度
    var frontZ = bodyLen / 2, backZ = -bodyLen / 2;

    function bone(from, to) {
      var geo = new T_.BufferGeometry().setFromPoints([from.clone(), to.clone()]);
      var line = new T_.Line(geo, lineMat);
      g.add(line);
      return line;
    }

    /* 躯干：用"椭球"更接近动物体态，而不是一根线 */
    var torso = new T_.Mesh(new T_.SphereGeometry(1, 14, 10), bodyMat);
    torso.scale.set(isCat ? 0.085 : 0.125, bodyH / 2, bodyLen / 2 + 0.02);
    torso.position.set(0, bodyY, 0);
    g.add(torso);
    var spine = bone(new T_.Vector3(0, bodyY, frontZ), new T_.Vector3(0, bodyY, backZ));

    /* 颈 + 头 */
    var headY = bodyY + (isCat ? 0.075 : 0.105);
    var headZ = frontZ + (isCat ? 0.055 : 0.075);
    var neck = bone(new T_.Vector3(0, bodyY, frontZ), new T_.Vector3(0, headY - headR * 0.6, headZ - 0.02));
    var headBall = new T_.Mesh(new T_.SphereGeometry(headR, 12, 10), bodyMat);
    headBall.position.set(0, headY, headZ);
    g.add(headBall);
    /* 吻部：猫短、狗长 */
    var muzzle = new T_.Mesh(
      new T_.SphereGeometry(isCat ? 0.034 : 0.055, 8, 6), bodyMat);
    muzzle.scale.set(1, isCat ? 0.75 : 0.68, isCat ? 1.1 : 1.5);
    muzzle.position.set(0, headY - headR * 0.22, headZ + headR * (isCat ? 0.85 : 1.15));
    g.add(muzzle);

    /* 耳朵：猫为三角尖耳，狗为下垂耳片 */
    [-1, 1].forEach(function (sd) {
      if (isCat) {
        var ear = new T_.Mesh(new T_.ConeGeometry(0.024, 0.052, 4), bodyMat);
        ear.position.set(sd * 0.036, headY + headR * 0.85, headZ - 0.004);
        ear.rotation.z = sd * 0.20;
        g.add(ear);
      } else {
        var flap = new T_.Mesh(new T_.BoxGeometry(0.020, 0.075, 0.034), bodyMat);
        flap.position.set(sd * (headR * 0.92), headY - 0.006, headZ - 0.004);
        flap.rotation.z = sd * 0.30;
        g.add(flap);
      }
    });

    /* 四肢两节：上段(肩/胯→膝) + 下段(膝→足) */
    var legX = isCat ? 0.055 : 0.085;
    function leg(sd) {
      var x = sd * legX;
      var kneeY = legLen * 0.5;
      return {
        x: x, fz: frontZ, bz: backZ, kneeY: kneeY,
        fUp: bone(new T_.Vector3(x, bodyY, frontZ), new T_.Vector3(x, kneeY, frontZ)),
        fLo: bone(new T_.Vector3(x, kneeY, frontZ), new T_.Vector3(x, 0, frontZ)),
        bUp: bone(new T_.Vector3(x, bodyY, backZ), new T_.Vector3(x, kneeY, backZ)),
        bLo: bone(new T_.Vector3(x, kneeY, backZ), new T_.Vector3(x, 0, backZ))
      };
    }
    var legs = [leg(-1), leg(1)];

    /* 尾巴两节：猫长且上翘，狗短且自然下垂 */
    var tailBase = new T_.Vector3(0, bodyY, backZ);
    var tailMid, tailEnd;
    if (isCat) {
      tailMid = new T_.Vector3(0, bodyY + 0.10, backZ - 0.03);
      tailEnd = new T_.Vector3(0, bodyY + 0.19, backZ + 0.01);
    } else {
      tailMid = new T_.Vector3(0, bodyY - 0.02, backZ - 0.07);
      tailEnd = new T_.Vector3(0, bodyY - 0.06, backZ - 0.14);
    }
    var tail1 = bone(tailBase, tailMid);
    var tail2 = bone(tailMid, tailEnd);

    g.userData = {
      kind: kind, isCat: isCat,
      spine: spine, neck: neck, head: headBall, muzzle: muzzle, torso: torso,
      legs: legs, tail1: tail1, tail2: tail2,
      bodyY: bodyY, headY: headY, headZ: headZ, frontZ: frontZ, backZ: backZ,
      tailBase: tailBase, tailMid: tailMid, tailEnd: tailEnd,
      headR: headR, legX: legX, legLen: legLen, bodyLen: bodyLen, bodyH: bodyH,
      lineMat: lineMat
    };
    return g;
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

  /* ---------- 视锥：显示镜头拍到的范围 + 仰角/俯角标识 ----------
     除了四棱锥线框，还额外画出：
       · 水平参考面（与地面平行），作为"0°"基准
       · 角度弧：显示镜头相对水平面的俯仰角
       · 垂直标尺：上下各一段，直观看出是仰拍还是俯拍
     这些几何体随俯仰角实时变化，因此"仰角/俯角"不再只是文字，而是看得见的量。 */
  function makeFrustum(color) {
    var g = new T.Group();
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

    /* --- 俯仰角标识（挂在视锥上，随镜头一起转） --- */
    var ind = new T.Group();

    /* 水平基准面：一块扁平的半透明矩形，代表"水平视线"。
       刻意做小一些——它是参照物，不该盖过视锥主体。 */
    var horizMat = new T.MeshBasicMaterial({ color: 0x9fb6dd, transparent: true, opacity: 0.13, side: T.DoubleSide, depthWrite: false });
    var horiz = new T.Mesh(new T.PlaneGeometry(hw * 1.25, dist * 0.75), horizMat);
    horiz.rotation.x = -Math.PI / 2;
    horiz.position.set(0, 0, -dist * 0.42);
    ind.add(horiz);
    /* 水平面边框 */
    var hb = new T.LineSegments(
      new T.EdgesGeometry(new T.BoxGeometry(hw * 1.25, 0.002, dist * 0.75)),
      new T.LineBasicMaterial({ color: 0x9fb6dd, transparent: true, opacity: 0.38 })
    );
    hb.position.set(0, 0, -dist * 0.42);
    ind.add(hb);
    /* 中心轴线：从镜头中心向前的水平参考线 */
    ind.add(new T.Line(
      new T.BufferGeometry().setFromPoints([new T.Vector3(0, 0, 0), new T.Vector3(0, 0, -dist * 1.15)]),
      new T.LineBasicMaterial({ color: 0x9fb6dd, transparent: true, opacity: 0.5 })
    ));
    /* 垂直标尺：向上与向下各一段，长度随俯仰角变化（运行时改 drawRange） */
    var vMat = new T.LineBasicMaterial({ color: 0xffd166, transparent: true, opacity: 0.85 });
    var upGeo = new T.BufferGeometry().setFromPoints([new T.Vector3(0, 0, -dist), new T.Vector3(0, 1, -dist)]);
    var dnGeo = new T.BufferGeometry().setFromPoints([new T.Vector3(0, 0, -dist), new T.Vector3(0, -1, -dist)]);
    var upLine = new T.Line(upGeo, vMat);
    var dnLine = new T.Line(dnGeo, vMat);
    ind.add(upLine);
    ind.add(dnLine);
    /* 角度弧：在水平面与视线之间画一段弧，弧长即俯仰角大小 */
    var ARC_SEG = 20;
    var arcGeo = new T.BufferGeometry();
    arcGeo.setAttribute('position', new T.BufferAttribute(new Float32Array((ARC_SEG + 1) * 3), 3));
    var arcLine = new T.Line(arcGeo, new T.LineBasicMaterial({ color: 0xffd166, transparent: true, opacity: 0.9 }));
    arcLine.frustumCulled = false;
    ind.add(arcLine);
    /* 角度数值标签 */
    var angLabel = makeLabel('0°', '#ffd166');
    if (angLabel) { angLabel.scale.set(0.42, 0.15, 1); ind.add(angLabel); }

    g.add(ind);
    g.userData = {
      ind: ind, upLine: upLine, dnLine: dnLine, arcLine: arcLine,
      arcGeo: arcGeo, angLabel: angLabel, dist: dist, ARC_SEG: ARC_SEG
    };
    return g;
  }

  /* 根据俯仰角刷新角度标识。
     pitch>0 表示镜头向下俯（俯角），pitch<0 表示向上仰（仰角）。 */
  function updateFrustumAngle(frustum, pitch) {
    var u = frustum.userData;
    if (!u || !u.ind) return;
    var ang = pitch || 0;
    var deg = ang * 180 / Math.PI;
    var dist = u.dist;

    /* 垂直标尺长度按角度大小伸缩（tan，最多限制到 1.2 避免过长） */
    var vlen = Math.min(1.2, Math.abs(Math.tan(ang)) * dist * 1.1 + 0.04);
    var upLen = ang < 0 ? vlen : 0.001;   // 仰角→向上画
    var dnLen = ang > 0 ? vlen : 0.001;   // 俯角→向下画
    var pa = u.upLine.geometry.attributes.position;
    pa.setXYZ(1, 0, upLen, -dist); pa.needsUpdate = true;
    u.upLine.geometry.computeBoundingSphere();
    var pb = u.dnLine.geometry.attributes.position;
    pb.setXYZ(1, 0, -dnLen, -dist); pb.needsUpdate = true;
    u.dnLine.geometry.computeBoundingSphere();
    u.upLine.visible = upLen > 0.01;
    u.dnLine.visible = dnLen > 0.01;

    /* 角度弧：在 YZ 平面内从水平方向扫到当前视线方向 */
    var arr = u.arcGeo.attributes.position.array;
    var N = u.ARC_SEG;
    var R = dist * 0.55;
    for (var i = 0; i <= N; i++) {
      var a = ang * (i / N);
      arr[i * 3] = 0;
      arr[i * 3 + 1] = Math.sin(a) * R;
      arr[i * 3 + 2] = -Math.cos(a) * R;
    }
    u.arcGeo.attributes.position.needsUpdate = true;
    u.arcGeo.computeBoundingSphere();
    u.arcLine.visible = Math.abs(deg) > 0.6;

    /* 数值标签：显示在弧的中点附近 */
    if (u.angLabel) {
      var am = ang * 0.5;
      u.angLabel.position.set(0, Math.sin(am) * R * 1.35, -Math.cos(am) * R * 1.35);
      u.angLabel.visible = Math.abs(deg) > 0.6;
      /* 重绘文字（Sprite 纹理由 makeLabel 生成，需整体替换才能改字） */
      var txt = (deg > 0 ? '俯 ' : '仰 ') + Math.abs(deg).toFixed(0) + '°';
      if (u.angLabel._txt !== txt) {
        u.angLabel._txt = txt;
        var nt = makeLabel(txt, '#ffd166');
        if (nt) {
          nt.scale.set(0.46, 0.16, 1);
          nt.position.copy(u.angLabel.position);
          u.ind.remove(u.angLabel);
          u.ind.add(nt);
          u.angLabel = nt;
        }
      }
    }
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

      /* 动物设置：默认无，由 setAnimal 决定是否加入 */
      this.animal = null;
      this.animalKind = null;
      this.animalLabel = null;

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
        self.invalidate();
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
      self.invalidate();
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
      this.invalidate();
      return;
    }
    this.sph.theta += dTheta;
    this.sph.phi = Math.min(Math.PI * 0.92, Math.max(Math.PI * 0.06, this.sph.phi + dPhi));
    this._applyOrbit();
    this.invalidate();
  };
  Stage.prototype.nudgeDist = function (factor) {
    if (this.camMode === 'fly') {
      var f = this._fly; if (!f) return;
      f._push = (f._push || 0) + (factor > 1 ? -0.5 : 0.5);
      this.invalidate();
      return;
    }
    this.sph.r = Math.min(18, Math.max(1.6, this.sph.r * factor));
    this._applyOrbit();
    this.invalidate();
  };
  /* 自由飞行模式：按方向键/WASD 平移 */
  Stage.prototype.flyKey = function (key, down) {
    if (!this._fly) this._fly = { v: new T.Vector3(), yaw: 0, pitch: 0, keys: {} };
    this._fly.keys[key] = !!down;
    if (down) this.invalidate();
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
    /* 记录本场景的障碍区域，供走位求解器避让 */
    this._obstacles = env.obstacles || null;

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

  /* ---------- 动物：加入 / 移除 / 换种类 ----------
     动物与演员一起构成"被拍对象"，默认站在演员侧前方（构图更自然），
     并做呼吸、摆尾、偶尔抬头等小动作，避免像静止摆件。 */
  Stage.prototype.setAnimal = function (kind) {
    if (!this.ok) return false;
    /* 先移除旧的 */
    if (this.animal) {
      this.scene.remove(this.animal);
      this.animal.traverse(function (o) {
        if (o.geometry) { try { o.geometry.dispose(); } catch (e) {} }
        if (o.material) { try { o.material.dispose(); } catch (e) {} }
      });
      this.animal = null;
      if (this.animalLabel) { this.scene.remove(this.animalLabel); this.animalLabel = null; }
    }
    if (!kind || kind === 'none') { this.animalKind = null; this._update(0, true); return true; }

    /* 动物配色刻意避开环境色与角色色：猫用暖橘、狗用蜜金，都能在冷色环境里跳出来 */
    var color = kind === 'cat' ? 0xffc27a : 0xffd98a;
    this.animal = makeAnimal(kind, color);
    this.animalKind = kind;
    this.scene.add(this.animal);
    this.animalLabel = makeLabel(kind === 'cat' ? '猫' : '狗', kind === 'cat' ? '#ffc27a' : '#ffd98a');
    if (this.animalLabel) this.scene.add(this.animalLabel);
    this._update(0, true);
    return true;
  };
  Stage.prototype.animalInfo = function () { return { kind: this.animalKind }; };

  /* 动物动作：呼吸起伏 + 尾巴摆动 + 头部转动 + 四肢微动 */
  Stage.prototype._updateAnimal = function (p, moving) {
    var an = this.animal;
    if (!an) return;
    var u = an.userData;
    var t = this.t;
    var m = this.mode;
    var cat = u.isCat;

    /* 站位：演员侧前方，避开演员身体以免重叠 */
    var baseX = cat ? 0.58 : 0.78;
    var baseZ = cat ? 0.30 : 0.42;
    var wander = (m === 'follow') ? Math.sin(t * 0.8) * 0.16 : 0;
    var x = baseX + wander;
    var z = baseZ + (m === 'follow' ? Math.cos(t * 0.6) * 0.09 : 0);

    /* 避障：动物也不能站进道具里 */
    var ob = this._obstacles;
    if (ob) {
      var rr = ob.resolve(x, z, 0.26);
      x = rr.x; z = rr.z;
    }
    an.position.set(x, 0, z);
    /* 面朝演员 */
    an.rotation.y = Math.atan2(-x, -z);

    /* 呼吸：躯干与头部轻微起伏 */
    var rate = cat ? 2.6 : 3.2;
    var breathe = Math.sin(t * rate) * (cat ? 0.006 : 0.008);
    an.position.y = breathe > 0 ? breathe : 0;

    /* 尾巴：猫慢速轻摆（上翘），狗快速左右摇 */
    var wagSpeed = cat ? 1.9 : 6.5;
    var wagAmp = cat ? 0.045 : 0.11;
    var wag = Math.sin(t * wagSpeed) * wagAmp;
    var tm = u.tailMid.clone(), te = u.tailEnd.clone();
    tm.x += wag * 0.5; te.x += wag * 1.5;
    /* 直立摆尾时也让尾尖上下微动 */
    te.y += Math.sin(t * wagSpeed * 1.7) * (cat ? 0.012 : 0.008);
    poseBone(u.tail1, u.tailBase, tm);
    poseBone(u.tail2, tm, te);

    /* 头：偶发转头/抬头（两个不同频率叠加，避免看起来像机械摆动） */
    var look = Math.sin(t * 0.63) * 0.6 + Math.sin(t * 0.21) * 0.4;
    var headY = u.headY + Math.sin(t * rate) * 0.004;
    var headZ = u.headZ - Math.abs(look) * 0.018;
    var headX = look * 0.028;
    u.head.position.set(headX, headY, headZ);
    u.muzzle.position.set(headX, headY - u.headR * 0.22, headZ + u.headR * (cat ? 0.85 : 1.15));
    poseBone(u.neck, new T.Vector3(0, u.bodyY, u.frontZ),
      new T.Vector3(headX * 0.6, headY - u.headR * 0.6, headZ - 0.02));

    /* 四肢：交替轻微踩踏（呼吸带动），让站姿不僵 */
    u.legs.forEach(function (lg, i) {
      var phase = t * rate + i * 1.6;
      var lift = Math.max(0, Math.sin(phase)) * (cat ? 0.006 : 0.009);
      poseBone(lg.fUp, new T.Vector3(lg.x, u.bodyY, lg.fz), new T.Vector3(lg.x, lg.kneeY, lg.fz));
      poseBone(lg.fLo, new T.Vector3(lg.x, lg.kneeY, lg.fz), new T.Vector3(lg.x, lift, lg.fz));
      poseBone(lg.bUp, new T.Vector3(lg.x, u.bodyY, lg.bz), new T.Vector3(lg.x, lg.kneeY, lg.bz));
      poseBone(lg.bLo, new T.Vector3(lg.x, lg.kneeY, lg.bz), new T.Vector3(lg.x, lift, lg.bz));
    });

    /* 标签跟随（贴在头顶上方一点） */
    if (this.animalLabel) {
      var top = u.headY + u.headR + (cat ? 0.20 : 0.26);
      this.animalLabel.position.set(x, top + an.position.y, z);
    }
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
      /* 若该角度会被障碍挡住，则把环绕半径向内收（保持弧形走向但不穿模） */
      var obO = this._obstacles;
      if (obO) {
        var triesO = 0;
        while (triesO++ < 8) {
          if (!obO.blocked(Math.sin(a) * r, Math.cos(a) * r, 0.40)) break;
          r -= 0.18;
        }
      }
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
      /* 摄影师落后一点角度，距离 = 演员半径 + 间距 */
      var ca = aa - 0.42;
      var camR = rr + gap;
      /* 若该角度下摄影师会落到障碍/边界外，则向内收半径（贴位跟随，保证不穿模） */
      var ob0 = this._obstacles;
      if (ob0) {
        var tries = 0;
        while (tries++ < 6) {
          var cx = Math.sin(ca) * camR, cz = Math.cos(ca) * camR;
          if (!ob0.blocked(cx, cz, 0.40)) break;
          camR -= 0.22;
        }
      }
      C.pos.set(Math.sin(ca) * camR, 1.05, Math.cos(ca) * camR);
      C.face = Math.atan2(A.pos.x - C.pos.x, A.pos.z - C.pos.z);
      label = '摄影师与演员保持约 ' + gap.toFixed(1) + ' 米等距跟随';
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

    /* 避障：把演员与摄影师推出场景道具（桌椅/灯架/器材），避免穿模。
       演员优先级更高——摄影师的机位可以让，但主体不能被道具挤压到画外。 */
    var ob = this._obstacles;
    if (ob) {
      var ra = ob.resolve(A.pos.x, A.pos.z, 0.42);
      A.pos.x = ra.x; A.pos.z = ra.z;
      var rc = ob.resolve(C.pos.x, C.pos.z, 0.40);
      C.pos.x = rc.x; C.pos.z = rc.z;
      /* 避让后重新计算镜头朝向，保证视锥仍指向演员 */
      var dx2 = A.pos.x - C.pos.x, dz2 = A.pos.z - C.pos.z, dy2 = camLookAt.y - C.pos.y;
      var dir2 = new T.Vector3(dx2, dy2, dz2).normalize();
      C.yaw = Math.atan2(dir2.x, dir2.z);
      C.pitch = Math.asin(Math.max(-1, Math.min(1, dir2.y)));
    }

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
    /* 刷新仰角/俯角标识（几何 + 数值标签） */
    updateFrustumAngle(this.frustum, st.C.pitch);
    this.shooter.rotation.y = st.C.yaw;

    /* 走路摆臂：按进度做正弦摆动，让火柴人不是"滑行" */
    var moving = this.playing ? 1 : 0;
    var a = this.actor.userData, sh = this.shooter.userData;

    /* ---- 演员动作：由当前手法决定"演什么"（含各关节的两节骨） ---- */
    var perf = this._actorPerf(p, moving);
    applySkeleton(a, perf);
    /* 躯干整体起伏：走路时上下颠簸，让动作有重量感 */
    this.actor.position.y = perf.bob;
    /* 转身/侧身：围绕手法需要做细微身体转动 */
    this.actor.rotation.y = st.A.face + perf.lean;

    /* ---- 动物（若启用）：跟随演员位置做对应动作 ---- */
    if (this.animal) {
      this._updateAnimal(p, moving);
    }

    /* ---- 摄影师：持机姿态 + 步伐 ---- */
    var sp = this._shooterPerf(p, moving);
    applySkeleton(sh, sp);
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

  /* 按当前模式摆放观察相机。
     dt 为空表示"交互重绘"帧——此时仍要处理飞行位移，否则暂停后就飞不动了。 */
  Stage.prototype._driveCamera = function (dt) {
    var mode = this.camMode || 'orbit';
    var step = (dt == null || dt <= 0) ? 1 / 60 : Math.min(dt, 0.05);

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
      /* 自由飞行：方向键/WASD 平移 + 拖拽转向，完全脱离轨道。
         暂停或播放结束后依然生效（由 _ensureIdleLoop 驱动重绘）。 */
      var f = this._fly || (this._fly = { v: new T.Vector3(), yaw: 0, pitch: 0, keys: {}, _push: 0 });
      var speed = 3.4 * step;
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
      if (mv.lengthSq() > 0) {
        mv.normalize().multiplyScalar(speed);
        this._idleDirty = true;                 // 有位移就保持重绘
      }
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
    var m = this.mode;
    /* 步频：走位越快的镜头，步频越高 */
    var cadence = (m === 'follow' || m === 'whip') ? 8.2 : (m === 'orbit' || m === 'crane') ? 5.4 : 6.4;
    var ph = this.t * cadence;
    var A = moving ? 1 : 0;

    /* 基本走路周期：
       腿前后摆动 + 抬脚（膝盖随抬腿而屈），手臂反相摆动且肘部自然微屈。 */
    var legSwing = Math.sin(ph) * 0.30 * A;
    var liftL = Math.max(0, Math.sin(ph));
    var liftR = Math.max(0, -Math.sin(ph));
    var ankleL = new T.Vector3(-0.15 - legSwing * 0.35, liftL * 0.09 * A, legSwing);
    var ankleR = new T.Vector3(0.15 + legSwing * 0.35, liftR * 0.09 * A, -legSwing);
    /* 抬腿时膝盖弯得更明显 */
    var kneeL = 0.05 + liftL * 0.07 * A;
    var kneeR = 0.05 + liftR * 0.07 * A;

    var armSwing = Math.sin(ph + Math.PI) * 0.26 * A;
    var wristL = new T.Vector3(-0.30, 0.98, armSwing);
    var wristR = new T.Vector3(0.30, 0.98, -armSwing);
    var elbow = 0.07;

    var bob = Math.abs(Math.sin(ph)) * 0.035 * A;
    var lean = 0, spine = 0, twist = 0, headPitch = 0;

    /* ---- 各手法的专属表演（改为驱动关节姿态） ---- */
    if (m === 'orbit') {
      /* 环绕：站定做展示动作，双肘抬起、手掌略向前（托举/介绍感） */
      wristL.set(-0.28, 1.04 + Math.sin(ph * 0.5) * 0.04, -0.14);
      wristR.set(0.28, 1.08 + Math.sin(ph * 0.5 + 1) * 0.04, -0.16);
      elbow = 0.05;
      lean = Math.sin(ph * 0.4) * 0.10;
      twist = Math.sin(ph * 0.4) * 0.10;
      bob = Math.abs(Math.sin(ph * 0.6)) * 0.012 * A;
      ankleL.set(-0.16, 0, 0.01); ankleR.set(0.16, 0, -0.01);
      kneeL = kneeR = 0.04;
    } else if (m === 'dolly') {
      /* 推拉：情绪表演，手臂小幅自然摆动，重心略前 */
      armSwing = Math.sin(ph + Math.PI) * 0.14 * A;
      wristL.set(-0.30, 0.98, armSwing);
      wristR.set(0.30, 0.98, -armSwing);
      lean = Math.sin(this.t * 1.1) * 0.05;
      spine = 0.05 + Math.sin(this.t * 1.1) * 0.02;
    } else if (m === 'follow') {
      /* 跟随：正常行走，摆动最大、身体前倾 */
      armSwing = Math.sin(ph + Math.PI) * 0.34 * A;
      wristL.set(-0.30, 0.98, armSwing);
      wristR.set(0.30, 0.98, -armSwing);
      lean = 0.06 * A;
      spine = 0.08 * A;
      twist = Math.sin(ph) * 0.06 * A;
    } else if (m === 'crane') {
      /* 升高：站定，双臂随镜头升高向外张开（"打开格局"的手势） */
      var open = Math.min(1, p * 1.6);
      wristL.set(-0.30 - open * 0.20, 0.98 - open * 0.06, 0.02 - open * 0.10);
      wristR.set(0.30 + open * 0.20, 0.98 - open * 0.06, 0.02 - open * 0.10);
      elbow = 0.04;
      ankleL.set(-0.17, 0, 0); ankleR.set(0.17, 0, 0);
      kneeL = kneeR = 0.03;
      bob = 0.01 * A;
      headPitch = -0.06 * open;
    } else if (m === 'ramp') {
      /* 变速：蓄力 → 峰值定格（前臂抬起、身体前倾、前腿蹬出） */
      var peak = p > 0.42 && p < 0.62;
      var drive = Math.min(1, p / 0.45);
      if (peak) {
        wristL.set(-0.26, 1.14, -0.26);
        wristR.set(0.26, 1.16, -0.30);
        elbow = 0.10;
        ankleL.set(-0.24, 0.01, 0.22); ankleR.set(0.16, 0, -0.18);
        kneeL = 0.12; kneeR = 0.09;
        spine = 0.20; lean = 0.18; headPitch = 0.05;
        bob = 0.02;
      } else if (p < 0.42) {
        /* 蓄力：手臂后摆、屈膝下蹲 */
        wristL.set(-0.30, 0.94 - drive * 0.08, 0.26 * drive);
        wristR.set(0.30, 0.94 - drive * 0.08, 0.26 * drive);
        elbow = 0.09;
        kneeL = kneeR = 0.05 + drive * 0.08;
        spine = -0.06 * drive;
        lean = -0.08 * drive;
        bob = -0.03 * drive;
      }
    } else if (m === 'whip') {
      /* 甩镜：转身挥手 */
      var turn = p < 0.5 ? p * 2 : 1;
      wristL.set(-0.30 - 0.22 * turn, 1.00 + 0.12 * turn, 0.06 - 0.22 * turn);
      wristR.set(0.30, 0.98, 0);
      elbow = 0.08;
      lean = -0.30 * Math.sin(p * Math.PI);
      twist = -0.34 * Math.sin(p * Math.PI);
      headPitch = -0.04 * Math.sin(p * Math.PI);
    } else if (m === 'dutch') {
      /* 荷兰角：不安，手臂夹紧、重心偏移、单膝微屈 */
      wristL.set(-0.22, 1.00, 0.06);
      wristR.set(0.22, 1.00, -0.06);
      elbow = 0.05;
      ankleL.set(-0.13, 0, 0.04); ankleR.set(0.19, 0, -0.03);
      kneeL = 0.06; kneeR = 0.03;
      lean = Math.sin(this.t * 2.2) * 0.08;
      spine = Math.sin(this.t * 2.2) * 0.03;
      bob = 0.008 * A;
    } else if (m === 'neon' || m === 'frame' || m === 'static' || m === 'lightleak') {
      /* 静态塑形类：呼吸感，肩随呼吸微起伏 */
      var breathe = Math.sin(this.t * 1.8) * 0.018;
      wristL.set(-0.29, 0.99 + breathe, 0.03);
      wristR.set(0.29, 0.99 + breathe, -0.03);
      elbow = 0.05;
      ankleL.set(-0.16, 0, 0.02); ankleR.set(0.16, 0, -0.02);
      kneeL = kneeR = 0.035;
      lean = Math.sin(this.t * 0.9) * 0.04;
      bob = 0.006 * A;
    }

    return {
      ankleL: ankleL, ankleR: ankleR, wristL: wristL, wristR: wristR,
      kneeL: kneeL, kneeR: kneeR, elbowL: elbow, elbowR: elbow,
      spine: spine, twist: twist, sideLean: lean * 0.4, headPitch: headPitch,
      bob: bob, lean: lean
    };
  };

  /* ---------- 摄影师动作：持机步态 + 云台三轴 ---------- */
  Stage.prototype._shooterPerf = function (p, moving) {
    var sh = this.shooter.userData;
    var m = this.mode;
    var A = moving ? 1 : 0;
    /* 摄影师的步伐比演员更小更稳（要保证画面不抖） */
    var cadence = (m === 'follow' || m === 'whip') ? 7.0 : (m === 'orbit' ? 5.2 : 6.0);
    var ph = this.t * cadence;
    var swing = Math.sin(ph) * 0.14 * A;
    var bob = Math.abs(Math.sin(ph)) * 0.018 * A;

    var ankleL = new T.Vector3(-0.12 - swing * 0.4, Math.max(0, Math.sin(ph)) * 0.05 * A, swing);
    var ankleR = new T.Vector3(0.12 + swing * 0.4, Math.max(0, -Math.sin(ph)) * 0.05 * A, -swing);
    /* 稳定器步态：屈膝更深，重心更低（这是"忍者步"的关键） */
    var kneeL = 0.07 + Math.max(0, Math.sin(ph)) * 0.04 * A;
    var kneeR = 0.07 + Math.max(0, -Math.sin(ph)) * 0.04 * A;

    /* 双手举机位置：胸前 / 举高 / 贴眼，随手法调整 */
    var armUp = 1.20, armFwd = -0.20;
    if (m === 'crane') { armUp = 1.30; armFwd = -0.15; }
    if (m === 'static' || m === 'dutch') { armUp = 1.16; armFwd = -0.24; }
    if (m === 'neon') { armUp = 1.19; armFwd = -0.22; }
    if (m === 'ramp') { armUp = 1.22; armFwd = -0.22; }
    var jitter = moving ? Math.sin(ph * 1.3) * 0.010 : 0;
    var wristL = new T.Vector3(-0.15, armUp + jitter, armFwd);
    var wristR = new T.Vector3(0.15, armUp + jitter, armFwd);
    /* 肘部明显外张并下沉——真实的双手持稳定器姿势 */
    var elbow = 0.13;

    /* 躯干：摄影师略含胸、重心下沉 */
    var spine = 0.06 + (moving ? 0.03 : 0);
    var twist = 0;
    var sideLean = 0;

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

    return {
      ankleL: ankleL, ankleR: ankleR, wristL: wristL, wristR: wristR,
      kneeL: kneeL, kneeR: kneeR, elbowL: elbow, elbowR: elbow,
      spine: spine, twist: twist, sideLean: sideLean,
      bob: bob, yaw: yaw, roll: roll, pitch: pitch
    };
  };

  /* ---------- 交互渲染循环 ----------
     播放结束后如果彻底停掉 rAF，镜头就再也不会重绘，
     于是"拖拽/滚轮/键盘"全部失效——这正是"播放完不能用自由视角"的根因。
     这里保留一个轻量循环：仅在需要时（暂停后仍在交互，或姿势有变化）重绘，
     空闲时不产生额外绘制，兼顾可交互与省电。 */
  Stage.prototype._ensureIdleLoop = function () {
    var self = this;
    if (this._idleRaf) return;
    this._idleDirty = true;
    (function tick() {
      if (!self.ok) { self._idleRaf = 0; return; }
      self._idleRaf = requestAnimationFrame(tick);
      if (self.playing) return;                  // 播放中由 _loop 负责
      if (self._idleDirty) {
        self._idleDirty = false;
        self._update(0);
      }
    })();
    this._idleRaf = 1;
  };
  /* 标记"需要重绘一帧"（相机被拖动、切换视角等交互时调用） */
  Stage.prototype.invalidate = function () {
    this._idleDirty = true;
    this._ensureIdleLoop();
  };

  Stage.prototype._loop = function () {
    var self = this;
    if (!this.playing) return;
    this._raf = requestAnimationFrame(function () {
      var dt = self.clock.getDelta();
      self.t += dt * self.speed;
      if (self.t > self.dur) {
        self.t = self.dur;
        self.playing = false;
        self._update(0, true);
        self._emitEnd && self._emitEnd();
        /* 播放结束 → 转入可交互的静止状态，镜头仍可自由拖动 */
        self.invalidate();
        return;
      }
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
