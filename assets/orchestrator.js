/* 光溯 GUANGSU · AI 运镜编排引擎（本地规则引擎，无网络依赖）
 *
 * 输入：用户的一句话/一段场景描述（中文自然语言）
 * 输出：结构化拍摄方案 —— 手法组合 + 场景 + 景别 + 器材 + 分镜步骤 + 火柴人演示参数
 *
 * 匹配策略（三层，按权重累加）：
 *   1. 关键词精确命中（用户描述里直接出现手法标签）
 *   2. 意图/情绪语义映射（"高级感"→ 低角度/蓝调，"紧张"→ 荷兰角 + 手持）
 *   3. 场景默认配方（识别到场景类型后，套用该场景的成熟手法组合）
 * 末尾始终补齐：至少一个运镜 + 一个构图/光效，保证方案完整可用。
 */
(function () {
  'use strict';

  var MOVES = window.GS_MOVES || [];
  var SCENES = window.GS_SCENES || [];
  var SHOTS = window.GS_SHOTS || [];
  var GEAR = window.GS_GEAR || [];

  /* ---------- 语义联想表：把"感觉"翻译成"手法" ---------- */
  var INTENT = [
    { keys: ['高级', '高级感', '质感', '大片', '电影感', '氛围感'], moves: ['low-angle-hero', 'practical-neon', 'frame-in-frame'], shots: ['cu', 'ms'], tip: '高级感来自"光比 + 层次 + 克制运动"，不是来自加特效' },
    { keys: ['紧张', '不安', '悬疑', '压抑', '冲突', '焦虑'], moves: ['dutch-static', 'handheld-follow', 'push-in'], shots: ['cu'], tip: '用失衡构图 + 手持晃动制造心理压迫' },
    { keys: ['热血', '燃', '运动', '竞技', '力量', '速度', '爆发'], moves: ['speed-ramp', 'low-angle-hero', 'whip-pan'], shots: ['fs', 'ms'], tip: '力量感 = 低角度 + 变速顿挫 + 硬光轮廓' },
    { keys: ['温柔', '治愈', '安静', '日常', '生活', '舒服', '放松'], moves: ['push-in', 'frame-in-frame'], shots: ['ms', 'cu'], tip: '治愈感来自柔光与缓慢运动，避免任何快切' },
    { keys: ['产品', '开箱', '展示', '带货', '细节', '推荐'], moves: ['orbit-arc', 'push-in', 'practical-neon'], shots: ['ecu', 'cu'], tip: '产品镜头靠"环绕交代体积 + 特写交代细节"' },
    { keys: ['反转', '揭晓', '悬念', '意外', '结尾', '真相'], moves: ['pull-out', 'whip-pan'], shots: ['fs', 'ms'], tip: '先给局部制造疑问，再用拉远揭示全貌' },
    { keys: ['旅行', '风景', '城市', '漫游', 'vlog', '记录'], moves: ['handheld-follow', 'crane-up', 'frame-in-frame'], shots: ['ws', 'ms'], tip: '跟随建立代入，升高完成升华' },
    { keys: ['美食', '吃', '探店', '烹饪', '食欲'], moves: ['speed-ramp', 'push-in'], shots: ['ecu', 'cu'], tip: '食物靠"升格特写 + 声音放大"制造食欲' },
    { keys: ['口播', '讲解', '分享', '教学', '知识', '干货'], moves: ['push-in', 'frame-in-frame'], shots: ['ms', 'cu'], tip: '口播镜头要"稳定 + 有变化"，别全程一个机位' },
    { keys: ['夜景', '夜晚', '霓虹', '赛博', '灯'], moves: ['practical-neon', 'low-angle-hero'], shots: ['cu', 'ms'], tip: '夜景不要提亮一切，保留暗部才有氛围' },
    { keys: ['开场', '钩子', '吸引', '留人', '前三秒'], moves: ['whip-pan', 'push-in', 'speed-ramp'], shots: ['cu', 'ecu'], tip: '前 3 秒必须有视觉冲击或悬念，否则留不住人' },
    { keys: ['情绪', '感动', '独白', '内心', '回忆', '思念'], moves: ['push-in', 'trans-light-leak', 'pull-out'], shots: ['cu', 'ecu'], tip: '情绪靠慢推 + 光漏柔化转场承载' }
  ];

  /* ---------- 工具 ---------- */
  function norm(s) { return String(s || '').toLowerCase(); }
  function hits(text, tags) {
    var n = 0;
    (tags || []).forEach(function (t) { if (t && text.indexOf(norm(t)) >= 0) n++; });
    return n;
  }

  /* 匹配手法：返回按得分排序的候选 */
  function matchMoves(text) {
    var scored = MOVES.map(function (m) {
      var s = hits(text, m.tags) * 10;               // 标签命中权重最高
      if (text.indexOf(norm(m.name)) >= 0) s += 14;  // 直接说出名字
      if (text.indexOf(norm(m.en)) >= 0) s += 12;
      return { m: m, s: s };
    });
    scored.sort(function (a, b) { return b.s - a.s; });
    return scored;
  }

  /* 匹配场景：区分"强信号"与"弱泛词"——
     「夜」「霓虹」「咖啡」这类词指向性很强，而「城市」「生活」过于宽泛，
     若同权计分会出现"旅行 vlog 被判成夜景街头"这类误判，因此给泛词降权。 */
  var WEAK_SCENE_TAGS = ['城市', '生活', '日常', '户外', '室内'];
  function matchScene(text) {
    var best = null, bestS = 0;
    SCENES.forEach(function (sc) {
      var s = 0;
      (sc.tags || []).forEach(function (t) {
        if (t && text.indexOf(norm(t)) >= 0) {
          s += (WEAK_SCENE_TAGS.indexOf(t) >= 0) ? 3 : 10;   // 泛词只给 3 分
        }
      });
      if (text.indexOf(norm(sc.name)) >= 0) s += 12;
      if (s > bestS) { bestS = s; best = sc; }
    });
    /* 得分太低说明只是撞到泛词，视为未识别场景，走通用配置更稳妥 */
    return { scene: bestS >= 10 ? best : null, score: bestS };
  }

  /* 匹配景别 */
  function matchShots(text) {
    var out = [];
    SHOTS.forEach(function (sh) {
      var s = hits(text, sh.tags) * 10;
      if (text.indexOf(norm(sh.name)) >= 0) s += 12;
      if (s > 0) out.push({ sh: sh, s: s });
    });
    out.sort(function (a, b) { return b.s - a.s; });
    return out.map(function (x) { return x.sh; });
  }

  /* 匹配意图 */
  function matchIntent(text) {
    var found = [];
    INTENT.forEach(function (it) {
      var s = hits(text, it.keys);
      if (s > 0) found.push({ it: it, s: s });
    });
    found.sort(function (a, b) { return b.s - a.s; });
    return found;
  }

  function byId(list, id) { return list.filter(function (x) { return x.id === id; })[0]; }

  /* ---------- 主入口：生成拍摄方案 ---------- */
  function compose(desc) {
    var text = norm(desc);
    if (!text.trim()) return null;

    var mv = matchMoves(text);
    var sc = matchScene(text);
    var sh = matchShots(text);
    var it = matchIntent(text);

    var picked = [];                                 // 已选手法
    var reasons = [];                                // 每个手法的入选理由
    function take(move, why) {
      if (!move) return;
      if (picked.some(function (p) { return p.move.id === move.id; })) return;
      picked.push({ move: move, why: why });
    }

    /* 第一层：关键词直接命中 */
    mv.slice(0, 4).forEach(function (x) {
      if (x.s >= 10) take(x.m, '你的描述里出现了「' + (x.m.tags.filter(function (t) { return text.indexOf(norm(t)) >= 0; })[0] || x.m.name) + '」，正好对应这个手法');
    });

    /* 第二层：意图语义 */
    it.slice(0, 2).forEach(function (x) {
      x.it.moves.forEach(function (id) {
        var m = byId(MOVES, id);
        if (m) take(m, '你想要的「' + x.it.keys[0] + '」质感，行业里通常用这套手法实现——' + x.it.tip);
      });
    });

    /* 第三层：场景默认配方 */
    if (sc.scene) {
      var sceneRecipe = {
        'street-night': ['practical-neon', 'low-angle-hero', 'handheld-follow'],
        'blue-hour': ['frame-in-frame', 'push-in', 'low-angle-hero'],
        'indoor-window': ['push-in', 'frame-in-frame'],
        'studio-clean': ['orbit-arc', 'push-in', 'speed-ramp'],
        'outdoor-golden': ['low-angle-hero', 'push-in', 'frame-in-frame'],
        'cafe-mood': ['handheld-follow', 'frame-in-frame', 'push-in'],
        'sports-arena': ['speed-ramp', 'low-angle-hero', 'whip-pan'],
        'rain-reflect': ['low-angle-hero', 'practical-neon', 'frame-in-frame']
      }[sc.scene.id] || [];
      sceneRecipe.forEach(function (id) {
        var m = byId(MOVES, id);
        if (m) take(m, '「' + sc.scene.name + '」这个场景的成熟拍法通常包含它');
      });
    }

    /* 兜底：方案必须完整 —— 至少 1 个运镜 + 1 个构图/光效 */
    var hasMove = picked.some(function (p) { return p.move.cat === '运镜' || p.move.cat === '节奏'; });
    var hasLook = picked.some(function (p) { return p.move.cat === '构图' || p.move.cat === '光效'; });
    if (!hasMove) { var dm = byId(MOVES, 'push-in'); if (dm) take(dm, '缺少运动镜头，补一个最通用的缓推前进'); }
    if (!hasLook) { var dl = byId(MOVES, 'frame-in-frame'); if (dl) take(dl, '缺少画面层次，补一个零成本的框架式构图'); }

    /* 限制在 4 个以内，避免方案过载 */
    picked = picked.slice(0, 4);

    /* 景别：先收集"用户点名"与"手法推导"两路需求，再保证多样性 */
    var shotWanted = sh.slice(0, 3);                 // 用户描述里明确提到的景别
    var derived = {};
    picked.forEach(function (p) {
      if (p.move.cat === '构图') derived['ms'] = 1;
      if (p.move.id === 'push-in' || p.move.id === 'trans-light-leak') derived['cu'] = 1;
      if (p.move.id === 'speed-ramp' || p.move.id === 'orbit-arc' || p.move.id === 'practical-neon') derived['ecu'] = 1;
      if (p.move.id === 'crane-up' || p.move.id === 'pull-out' || p.move.id === 'handheld-follow') derived['ws'] = 1;
      if (p.move.id === 'low-angle-hero' || p.move.id === 'dutch-static') derived['fs'] = 1;
    });
    /* 合并去重：用户点名优先，其后补推导值 */
    var shots = shotWanted.slice();
    ['ecu', 'cu', 'ms', 'fs', 'ws'].forEach(function (k) {
      if (derived[k] && !shots.some(function (s) { return s.id === k; })) {
        var s = byId(SHOTS, k); if (s) shots.push(s);
      }
    });
    if (!shots.length) shots = [byId(SHOTS, 'ms'), byId(SHOTS, 'cu')].filter(Boolean);

    /* 器材：只从 gear 字段里"白名单"识别，避免把「手机即可」「手持」这类描述当成器材 */
    var GEAR_ALIAS = [
      { re: /手机|iPhone|安卓/, id: 'phone' },
      { re: /稳定器|云台|gimbal/i, id: 'gimbal' },
      { re: /补光灯|LED|灯/, id: 'light' },
      { re: /反光板/, id: 'reflector' },
      { re: /三脚架|桌面架/, id: 'tripod' },
      { re: /领夹麦|麦克风|麦/, id: 'mic' },
      { re: /无人机/, id: 'drone' }
    ];
    var gearIds = {};
    picked.forEach(function (p) {
      var g = p.move.gear || '';
      GEAR_ALIAS.forEach(function (a) { if (a.re.test(g)) gearIds[a.id] = 1; });
    });
    var gearList = Object.keys(gearIds).map(function (id) {
      if (id === 'drone') return { name: '无人机（可选）', why: '升格上摇的替代方案，适合大范围收尾', tips: '注意当地空域规定，室内禁用' };
      return byId(GEAR, id);
    }).filter(Boolean);

    /* 分镜脚本：景别沿镜头推进做"由远及近或由近及远"的合理分配，避免每条都一样 */
    var shotOrder = shots.map(function (s) { return s.id; });
    /* 若推导出的景别不足，用通用序列补齐，保证 storyboard 每行景别不重复堆叠 */
    var fallbackSeq = ['ws', 'ms', 'cu', 'ecu', 'fs'];
    fallbackSeq.forEach(function (k) { if (shotOrder.indexOf(k) < 0) shotOrder.push(k); });

    var storyboard = picked.map(function (p, i) {
      var secs = [3, 4, 3, 3][i] || 3;
      var sid = shotOrder[i] || 'ms';
      var shObj = byId(SHOTS, sid) || byId(SHOTS, 'ms');
      return {
        no: i + 1,
        move: p.move,
        why: p.why,
        dur: secs,
        shot: shObj ? shObj.name : '中景',
        shotId: sid,
        action: p.move.steps[0] || '',
        camera: p.move.move
      };
    });

    /* 演示参数：优先使用第一个"可演示"手法的 demo 配置 */
    var demo = null;
    for (var i = 0; i < picked.length; i++) {
      if (picked[i].move.demo) { demo = picked[i].move.demo; demo.moveName = picked[i].move.name; break; }
    }

    return {
      desc: String(desc).trim(),
      picked: picked,
      scene: sc.scene,
      sceneMatched: sc.score > 0,
      shots: shots,
      gear: gearList,
      intent: it.length ? it[0].it : null,
      storyboard: storyboard,
      demo: demo,
      /* 风格基调，用于 UI 摘要 */
      tone: it.length ? it[0].it.keys[0] : (sc.scene ? sc.scene.name : '通用'),
      totalSec: storyboard.reduce(function (a, b) { return a + b.dur; }, 0) + 2
    };
  }

  window.GS_ORCH = {
    compose: compose,
    /* 供 UI 做"灵感示例"按钮 */
    samples: [
      '拍一条深夜城市街头的咖啡探店，想要高级的霓虹氛围感，结尾有个反转',
      '运动品牌广告，主角在天台练习，要热血有力量感，节奏卡点',
      '治愈系居家日常 vlog，午后窗边喝咖啡，安静舒服',
      '产品开箱：一款无线耳机，突出质感与细节，适合带货',
      '旅行 vlog 开场，城市漫游然后升空俯瞰全景收尾'
    ]
  };
})();
