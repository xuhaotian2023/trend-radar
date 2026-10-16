/* 光溯 GUANGSU · AI 未来热点预测引擎（本地模型 · 无网络依赖）
 *
 * 说明：这是基于现有热度、增速、饱和度与类目周期性的**启发式预测模型**，
 *       用于演示"提前判断什么会火"的产品能力，不代表真实平台的算法预测结果。
 *       页面上必须如实标注为"模型推演"，不得宣称为平台官方预测。
 *
 * 预测维度：
 *   · 增速动量   —— 当前增速越高，越可能继续上行（动量效应）
 *   · 饱和度反压 —— 热度接近饱和区时会回落，预测拐点
 *   · 类目周期性 —— 不同类目有各自的生命周期长度（如赛事短、知识长）
 *   · 时段节律   —— 结合当前时段判断当天剩余时间的走势
 */
(function () {
  'use strict';

  /* 类目生命周期（小时）与衰减特征：越短越"快起快落" */
  var CAT_CYCLE = {
    '游戏': { life: 30, decay: 0.90, label: '赛事驱动 · 快起快落' },
    '影视娱乐': { life: 42, decay: 0.93, label: '话题驱动 · 中周期' },
    '美食': { life: 54, decay: 0.96, label: '常青类目 · 长尾稳定' },
    '萌宠': { life: 72, decay: 0.97, label: '常青类目 · 极长尾' },
    '情感': { life: 60, decay: 0.95, label: '情绪共鸣 · 长尾发酵' },
    '知识': { life: 90, decay: 0.98, label: '沉淀型 · 超长尾' },
    '生活': { life: 66, decay: 0.96, label: '日常向 · 稳定长尾' },
    '时尚': { life: 48, decay: 0.94, label: '审美驱动 · 中周期' }
  };
  function cycleOf(cat) { return CAT_CYCLE[cat] || { life: 54, decay: 0.95, label: '通用周期' }; }

  /* 预测单条话题未来 N 个时间点的热度轨迹
     参数取值依据：演示数据的热度集中在 81~96（已是"高位区"），
     因此不能用"接近 100 就压制"的强刹车，否则所有话题都会被衰减项吃掉、
     预测全部变成单调下行，失去区分度。这里改为：
       · 动量项主导短期走势（增速是预测未来最有效的信号）
       · 饱和刹车只做温和限制，且用平台饱和度而非话题字段
       · 衰减项按类目周期给出，与动量同量级，让快慢类目真正拉开差距 */
  function forecastTopic(t, hours, now, platSat) {
    var cyc = cycleOf(t.cat);
    var heat = t.heat;
    var g = t.growth || 10;
    /* 平台饱和度缺失时给中性值 62，避免把所有话题压成同一条曲线 */
    var sat = (typeof platSat === 'number' && isFinite(platSat)) ? platSat : 62;

    /* 动量：增速 20% ≈ 每小时 +1.1 热度，增速 40% ≈ +2.2 */
    var momentum = (g / 100) * 5.6;
    /* 高位刹车：热度越高上行越难。用"离天花板还有多远"做连续刹车，
       热度 96 时几乎贴顶、热度 81 时仍有余量，这样峰值才会落在 12 小时窗口内。 */
    var ceiling = 98.5;                                     // 高位平台期望上限
    var satBrake = 1 - (sat / 100) * 0.25;                  // 饱和度 70 → 0.825
    var perHourKeep0 = Math.pow(cycleOf(t.cat).decay, 1 / Math.max(1, cycleOf(t.cat).life));

    var pts = [];
    var h = heat;
    for (var i = 0; i <= hours; i++) {
      pts.push({ h: i, v: Math.max(20, Math.min(99.9, h)) });
      /* 刹车随"接近天花板"平滑增强：距顶 2.5 分时刹车约 0.5，贴顶时趋近 0.08 */
      var room = Math.max(0, ceiling - h);
      var brake2 = Math.min(1, 0.08 + (room / 18));
      var rise = momentum * brake2 * satBrake;
      var fall = h * (1 - perHourKeep0);
      h = h + rise - fall;
      /* 夜间（0-6 点）整体降温，白天回升 */
      var hourOfDay = (((now == null ? 20 : now) + i) % 24 + 24) % 24;
      if (hourOfDay >= 0 && hourOfDay < 6) h -= 0.5;
    }
    return pts;
  }

  /* 峰值出现在第几小时 */
  function peakHour(pts) {
    var bi = 0;
    for (var i = 1; i < pts.length; i++) if (pts[i].v > pts[bi].v) bi = i;
    return bi;
  }

  /* 置信度：话题本身的可信度 + 增速明确度 + 曲线信号强度 */
  function confidenceOf(t, pts) {
    var base = (t.confidence || 80) / 100;
    var growthFactor = Math.min(1, (t.growth || 10) / 45);      // 增速越明确越可信
    var curve = Math.abs(pts[pts.length - 1].v - pts[0].v);
    var signal = Math.min(1, curve / 6);                        // 变化越明显，信号越强
    var c = base * 0.60 + growthFactor * 0.24 + signal * 0.16;
    return Math.max(42, Math.min(94, Math.round(c * 100)));
  }

  /* 爆发窗口文案 */
  function windowText(ph) {
    if (ph <= 2) return { text: '2 小时内', cls: 'hot' };
    if (ph <= 6) return { text: '2~6 小时', cls: 'warm' };
    if (ph <= 12) return { text: '6~12 小时', cls: 'warm' };
    return { text: '12~24 小时', cls: 'cool' };
  }

  /* 结论：上行 / 见顶 / 回落（阈值按 12 小时内的预计涨跌热度设定） */
  function verdictOf(pts) {
    var a = pts[0].v, b = pts[pts.length - 1].v, ph = peakHour(pts), peak = pts[ph].v;
    var delta = b - a;
    var rise = peak - a;
    if (rise > 1.2 && ph >= pts.length - 2) return { k: 'rise', text: '持续上行', desc: '动量强、饱和度仍有空间，预测窗口内仍在爬升' };
    if (rise > 0.8) return { k: 'rise', text: '上行后趋稳', desc: '预计在 ' + ph + ' 小时前后见顶，随后进入平台期' };
    if (delta > -1.2) return { k: 'flat', text: '高位震荡', desc: '接近饱和区，热度将维持但缺乏新增量' };
    return { k: 'fall', text: '见顶回落', desc: '流量红利已释放，峰值出现在 ' + ph + ' 小时前' };
  }

  /* 生成某平台/全网的未来热点候选 */
  function predict(all, now) {
    var hours = 12;
    var out = all.map(function (x) {
      var pts = forecastTopic(x.t, hours, now, x.p && x.p.saturation);
      var ph = peakHour(pts);
      var conf = confidenceOf(x.t, pts);
      var gain = pts[hours].v - pts[0].v;
      var cyc = cycleOf(x.t.cat);
      return {
        plat: x.p, topic: x.t,
        pts: pts, hours: hours,
        peakHour: ph,
        peakVal: pts[ph].v,
        lastVal: pts[hours].v,
        firstVal: pts[0].v,
        gain: gain,
        conf: conf,
        window: windowText(ph),
        verdict: verdictOf(pts),
        cycle: cyc,
        /* 潜力分：兼顾上行空间与可信度，用于排序 */
        score: Math.max(0, gain) * 2.4 + (x.t.growth || 0) * 0.5 + conf * 0.14 - (x.p && x.p.saturation || 62) * 0.05
      };
    });
    /* 只保留"仍有上行空间或高位维持"的，按潜力分排序 */
    out = out.filter(function (o) { return o.verdict.k !== 'fall'; });
    out.sort(function (a, b) { return b.score - a.score; });
    return out;
  }

  /* 汇总洞察：跨话题的共性结论 */
  function insights(preds) {
    var list = [];
    if (!preds.length) return list;
    /* 最快爆发 */
    var fastest = preds.slice().sort(function (a, b) { return a.peakHour - b.peakHour || b.score - a.score; })[0];
    if (fastest) list.push({ icon: '⚡', t: '最快爆发', v: fastest.topic.title, d: '预计 ' + fastest.window.text + ' 进入峰值（' + fastest.peakVal.toFixed(1) + ' 热度）' });
    /* 最大上行空间 */
    var biggest = preds.slice().sort(function (a, b) { return b.gain - a.gain; })[0];
    if (biggest) list.push({ icon: '📈', t: '上行空间最大', v: biggest.topic.title, d: '未来 12 小时预计 +' + Math.max(0, biggest.gain).toFixed(1) + ' 热度，置信度 ' + biggest.conf + '%' });
    /* 最可信 */
    var surest = preds.slice().sort(function (a, b) { return b.conf - a.conf; })[0];
    if (surest) list.push({ icon: '🎯', t: '信号最明确', v: surest.topic.title, d: '置信度 ' + surest.conf + '% · ' + surest.cycle.label });
    /* 类目倾向 */
    var byCat = {};
    preds.forEach(function (o) { byCat[o.topic.cat] = (byCat[o.topic.cat] || 0) + o.score; });
    var topCat = Object.keys(byCat).sort(function (a, b) { return byCat[b] - byCat[a]; })[0];
    if (topCat) list.push({ icon: '🏷', t: '类目倾向', v: topCat, d: '未来 12 小时上行话题中，该品类潜力分最高（' + byCat[topCat].toFixed(0) + '）' });
    return list;
  }

  window.GS_PREDICT = {
    predict: predict,
    insights: insights,
    cycleOf: cycleOf,
    /* 演示用：模型自述，页面需要如实展示 */
    modelNote: '基于热度动量、饱和度反压、类目生命周期与时段节律的启发式推演，用于演示预测能力，非平台官方预测结果。'
  };
})();
