/* 热点雷达 · 模拟数据层（演示原型，接入真实抓取 API 后替换本文件即可） */
window.RADAR_DATA = {
  updatedAt: '2026-10-15 14:30',
  platforms: [
    {
      id: 'douyin', name: '抖音', en: 'DOUYIN', color: '#FE2C55', color2: '#25F4EE',
      slogan: '记录美好生活 · 强情绪短平快流量场',
      heat: 98.0, topicCount: 38, avgEst: 20220, peak: 21.9, saturation: 76,
      trend: [62, 68, 74, 71, 82, 88, 95, 98],
      desc: '算法中心化分发，热点爆发力最强、生命周期最短。强情绪、强节奏内容占主导，卡点快剪与悬念前置是流量入场券，挑战赛模板是裂变核心引擎。',
      topics: [
        {
          id: 'dy1', title: '国庆特种兵旅行挑战', cat: '生活方式', heat: 97, growth: 18.4, est: 28600, confidence: 87,
          tech: { rhythm: 92, trans: 88, sub: 90, sound: 94, desc: '高密度卡点快剪，平均 <b>0.8 秒/镜头</b>；前 3 秒以大字标题抛出钩子，鼓点 BGM 与转场严格对拍，结尾定格引导合拍。' },
          core: { narr: '目标清单式叙事，打卡点位逐个引爆', emo: '多巴胺刺激 + 集体出游共鸣', aud: '18-30 岁学生与都市白领', spread: '挑战赛模板接力，UGC 复拍裂变' }
        },
        {
          id: 'dy2', title: 'AI 复活老照片', cat: '情感科技', heat: 95, growth: 32.1, est: 24100, confidence: 90,
          tech: { rhythm: 84, trans: 79, sub: 86, sound: 88, desc: '新旧照片<b>前后对比硬切</b>，黑场闪白强化冲击；解说旁白铺底，钢琴渐进式 BGM 在揭晓瞬间推向泪点。' },
          core: { narr: '悬念—揭晓结构，情感回报后置', emo: '怀旧与亲情催泪锚点', aud: '25-45 岁家庭用户', spread: '情感号矩阵转发，评论区晒图二创' }
        },
        {
          id: 'dy3', title: '00 后整顿职场名场面', cat: '职场剧情', heat: 93, growth: 12.7, est: 19800, confidence: 84,
          tech: { rhythm: 90, trans: 86, sub: 92, sound: 85, desc: '情景剧三幕式结构，反转前 <b>0.5 秒静音留白</b>蓄势；花字放大金句，综艺化音效点缀节奏。' },
          core: { narr: '冲突—反转的爽感结构', emo: '代际共鸣 + 职场情绪宣泄', aud: '20-28 岁职场新人', spread: '金句切片传播，话题聚合二次创作' }
        },
        {
          id: 'dy4', title: '城市夜市美食图鉴', cat: '美食探店', heat: 89, growth: 6.3, est: 15400, confidence: 82,
          tech: { rhythm: 78, trans: 74, sub: 80, sound: 91, desc: '<b>慢镜头特写 + 食欲声效放大</b>；全片色温暖调统一，价格角标随镜头出现，沉浸式逛吃动线。' },
          core: { narr: '沉浸式逛吃动线，POI 逐站解锁', emo: '烟火气治愈锚点', aud: '22-35 岁夜生活人群', spread: '本地 POI 聚合页引流，同城推流加权' }
        },
        {
          id: 'dy5', title: '宠物开口说话系列', cat: '萌宠', heat: 87, growth: 21.9, est: 13200, confidence: 79,
          tech: { rhythm: 74, trans: 82, sub: 68, sound: 87, desc: '配音<b>对口型二次创作</b>，跳切制造荒诞感；字幕高度拟人化，综艺花字承担笑点节奏。' },
          core: { narr: '拟人化情景短剧', emo: '萌系治愈 + 反差幽默', aud: '全年龄泛用户', spread: '萌宠垂类矩阵联动，表情包外溢' }
        }
      ]
    },
    {
      id: 'bilibili', name: '哔哩哔哩', en: 'BILIBILI', color: '#FB7299', color2: '#FF9CC8',
      slogan: '你感兴趣的视频都在B站 · 圈层文化深度场',
      heat: 92.0, topicCount: 26, avgEst: 7420, peak: 28.5, saturation: 68,
      trend: [58, 62, 66, 70, 74, 80, 86, 92],
      desc: '中长视频与圈层文化阵地，弹幕共创放大互动深度。硬核、知识、怀旧类内容权重高，收藏率与完播率是核心增长杠杆，长尾流量显著优于短视频平台。',
      topics: [
        {
          id: 'bl1', title: '4K 修复经典动画重映计划', cat: '影视修复', heat: 92, growth: 9.8, est: 9600, confidence: 88,
          tech: { rhythm: 70, trans: 66, sub: 84, sound: 89, desc: '<b>长镜头保真呈现</b>修复质感；章节式进度条包装，弹幕引导字幕激发考古互动，环绕声全重制。' },
          core: { narr: '修复对比展示 + 幕后技术解说', emo: '集体记忆唤醒', aud: '20-35 岁怀旧向深度用户', spread: '弹幕考古互动，收藏率驱动长尾' }
        },
        {
          id: 'bl2', title: '自制机械键盘全流程', cat: '硬核DIY', heat: 90, growth: 14.2, est: 8200, confidence: 85,
          tech: { rhythm: 82, trans: 76, sub: 88, sound: 83, desc: '延时摄影与<b>微距特写混剪</b>；工序分段卡片化呈现，参数表字幕严谨，敲击声 ASMR 收音解压。' },
          core: { narr: '工序流全景记录', emo: '极客成就感 + 解压', aud: '18-30 岁数码硬件圈层', spread: '硬件区联动，配件清单置顶转化' }
        },
        {
          id: 'bl3', title: '期末周图书馆实录', cat: '校园纪实', heat: 86, growth: 28.5, est: 7400, confidence: 81,
          tech: { rhythm: 75, trans: 70, sub: 79, sound: 80, desc: '<b>固定机位 + 快进压缩</b>时间流逝；角标时间戳强化真实感，白噪音环境声营造在场氛围。' },
          core: { narr: '时间流逝蒙太奇', emo: '备考焦虑共情', aud: '16-24 岁在校生', spread: '期末季话题聚合，学习搭子招募发酵' }
        },
        {
          id: 'bl4', title: '沉浸式深夜电台', cat: '助眠声控', heat: 84, growth: 5.1, est: 6100, confidence: 86,
          tech: { rhythm: 60, trans: 52, sub: 72, sound: 95, desc: '<b>极慢节奏长镜头</b>，暗调布光；耳语旁白与 ASMR 三维收音，声音设计即内容本体。' },
          core: { narr: '场景陪伴型叙事', emo: '孤独感安抚', aud: '20-35 岁都市独居青年', spread: '睡前时段推送加权，会员音源延长观看' }
        },
        {
          id: 'bl5', title: '高考数学压轴题拆解', cat: '知识科普', heat: 82, growth: 11.3, est: 5800, confidence: 83,
          tech: { rhythm: 68, trans: 64, sub: 94, sound: 72, desc: '<b>手写板书 + 动画演示双轨并行</b>；步骤间刻意留白供弹幕刷屏，粉笔声收音强化课堂感。' },
          core: { narr: '递进式解题结构', emo: '顿悟快感 + 升学焦虑', aud: '15-19 岁考生与家长', spread: '收藏转发热链路，教辅品牌联动' }
        }
      ]
    },
    {
      id: 'kuaishou', name: '快手', en: 'KUAISHOU', color: '#FF7900', color2: '#FFB25C',
      slogan: '拥抱每一种生活 · 信任关系下沉市场',
      heat: 91.0, topicCount: 24, avgEst: 12320, peak: 19.2, saturation: 71,
      trend: [55, 60, 66, 72, 78, 84, 88, 91],
      desc: '信任关系驱动的老铁经济，下沉市场统治力强。真实人设与产地溯源内容转化效率高，直播导流链路成熟，方言化表达是天然的内容壁垒。',
      topics: [
        {
          id: 'ks1', title: '新农人直播助农', cat: '三农', heat: 91, growth: 16.8, est: 17300, confidence: 85,
          tech: { rhythm: 80, trans: 72, sub: 86, sound: 84, desc: '<b>田间实拍跟拍</b>增强临场感；产地溯源字幕建立信任，方言解说拉近距离，原声环境保留。' },
          core: { narr: '溯源信任叙事', emo: '助农情怀 + 价格实惠锚点', aud: '30-50 岁县域家庭用户', spread: '直播间导流，老铁推荐链路' }
        },
        {
          id: 'ks2', title: '东北家庭喜剧日常', cat: '家庭剧情', heat: 88, growth: 8.4, est: 14100, confidence: 82,
          tech: { rhythm: 86, trans: 84, sub: 90, sound: 82, desc: '情景剧<b>快剪节奏</b>，包袱抛出前留半拍蓄势；东北方言字幕保味，唢呐音效制造反转爆点。' },
          core: { narr: '系列化人设喜剧', emo: '代际幽默 + 家的温度', aud: '25-45 岁泛北方用户', spread: '系列追更养成，金句切片外溢' }
        },
        {
          id: 'ks3', title: '卡车司机环国记录', cat: '纪实', heat: 85, growth: 19.2, est: 11800, confidence: 80,
          tech: { rhythm: 74, trans: 68, sub: 82, sound: 81, desc: '<b>行车记录仪第一视角</b>混剪；里程数字进度条贯穿全片，日志体字幕，风噪路噪保留真实质感。' },
          core: { narr: '公路片式里程叙事', emo: '自由向往 + 劳动尊严', aud: '28-50 岁男性蓝领群体', spread: '职业群体身份认同转发，服务区打卡联动' }
        },
        {
          id: 'ks4', title: '手艺人修复老物件', cat: '手作', heat: 83, growth: 7.6, est: 9800, confidence: 78,
          tech: { rhythm: 76, trans: 70, sub: 74, sound: 88, desc: '<b>微距特写</b>记录修复全过程；前后对比滑屏转场，工序字幕严谨，金属摩擦声 ASMR 放大。' },
          core: { narr: '破损—重生的修复弧线', emo: '匠心治愈', aud: '25-40 岁生活美学人群', spread: '修复对比图跨平台传播' }
        },
        {
          id: 'ks5', title: '县城咖啡店创业记', cat: '创业', heat: 80, growth: 13.9, est: 8600, confidence: 76,
          tech: { rhythm: 72, trans: 66, sub: 80, sound: 75, desc: '日更 Vlog <b>流水账式真实记录</b>；营业额数字弹窗制造起伏，复盘字幕卡沉淀方法论。' },
          core: { narr: '连续剧式经营实录', emo: '小镇创业共鸣', aud: '22-35 岁小镇青年', spread: '创业话题社群讨论，选址攻略合集沉淀' }
        }
      ]
    },
    {
      id: 'shipinhao', name: '视频号', en: 'CHANNELS', color: '#07C160', color2: '#4AE58C',
      slogan: '人人可创作 · 微信生态社交裂变',
      heat: 85.0, topicCount: 19, avgEst: 9900, peak: 22.4, saturation: 62,
      trend: [48, 52, 58, 62, 70, 76, 82, 85],
      desc: '社交推荐 + 算法双引擎驱动，微信生态私域裂变能力独一档。家庭场景与中老年用户渗透率领先，转发率是第一增长指标，长图文联动闭环成熟。',
      topics: [
        {
          id: 'sph1', title: '同学会怀旧混剪', cat: '情感', heat: 85, growth: 10.2, est: 12800, confidence: 84,
          tech: { rhythm: 78, trans: 74, sub: 82, sound: 86, desc: '<b>老照片 Ken Burns 缓推</b>营造回忆感；年代金曲卡点，年份字幕飘落，人声独白贯穿情绪主线。' },
          core: { narr: '年代记忆蒙太奇', emo: '青春怀旧 + 重逢泪点', aud: '35-55 岁社交活跃层', spread: '微信群转发裂变，朋友圈打卡' }
        },
        {
          id: 'sph2', title: '节气养生食谱', cat: '健康生活', heat: 83, growth: 9.1, est: 11200, confidence: 88,
          tech: { rhythm: 66, trans: 58, sub: 90, sound: 78, desc: '<b>俯拍烹饪长镜头</b>；节气角标动画点题，食材功效字幕严谨，古风轻音乐统一氛围。' },
          core: { narr: '节令知识 + 实操食谱', emo: '健康焦虑抚平', aud: '40-60 岁家庭主厨人群', spread: '家庭群转发，公众号图文联动' }
        },
        {
          id: 'sph3', title: '高管管理课精选切片', cat: '知识付费', heat: 79, growth: 15.7, est: 8900, confidence: 77,
          tech: { rhythm: 64, trans: 60, sub: 92, sound: 74, desc: '<b>演讲实拍切片</b>；金句大字卡强化记忆点，逻辑框架图插入辅助理解，现场掌声保留营造权威感。' },
          core: { narr: '观点冲击 + 方法论清单', emo: '职场进阶焦虑', aud: '30-50 岁企业管理层', spread: '私域社群分发，付费课转化漏斗' }
        },
        {
          id: 'sph4', title: '家乡变化对比航拍', cat: '家国影像', heat: 78, growth: 22.4, est: 9400, confidence: 83,
          tech: { rhythm: 72, trans: 80, sub: 76, sound: 84, desc: '<b>无人机一镜到底</b>；今昔分屏擦除转场，地名大字卡点题，史诗弦乐推高情绪。' },
          core: { narr: '今昔对照叙事', emo: '乡愁 + 发展自豪', aud: '30-60 岁在外游子群体', spread: '老乡群定向转发，地域话题聚合' }
        },
        {
          id: 'sph5', title: '中老年模特队走秀', cat: '时尚银发', heat: 75, growth: 18.1, est: 7200, confidence: 75,
          tech: { rhythm: 70, trans: 76, sub: 78, sound: 80, desc: '<b>T 台运镜跟拍</b>；慢动作定格风采瞬间，队形字幕辅助叙事，国潮鼓点 BGM 提气。' },
          core: { narr: '风采展示型群像', emo: '年龄突破感 + 自信表达', aud: '45-65 岁活力银发族', spread: '广场舞社群裂变，服饰橱窗带货' }
        }
      ]
    },
    {
      id: 'xiaohongshu', name: '小红书', en: 'REDNOTE', color: '#FF2442', color2: '#FF7A8C',
      slogan: '你的生活指南 · 审美攻略种草场',
      heat: 90.0, topicCount: 22, avgEst: 11260, peak: 26.2, saturation: 66,
      trend: [50, 56, 64, 68, 74, 82, 87, 90],
      desc: '审美攻略型内容社区，搜索心智强、种草转化链路完整。清单化、公式化、教程化内容最易沉淀长尾流量，笔记与商品链接的闭环转化率行业领先。',
      topics: [
        {
          id: 'xhs1', title: '秋日氛围感穿搭公式', cat: '穿搭', heat: 90, growth: 24.6, est: 13600, confidence: 86,
          tech: { rhythm: 76, trans: 72, sub: 94, sound: 82, desc: '<b>OOTD 多套连换跳剪</b>；镜面反射转场显质感，单品价签标注清晰，慵懒法式 BGM 定调氛围。' },
          core: { narr: '公式化穿搭教学', emo: '审美升级 + 模仿便利', aud: '18-30 岁都市女性', spread: '单品清单笔记联动，橱窗直链转化' }
        },
        {
          id: 'xhs2', title: '3 分钟通勤伪素颜妆', cat: '美妆', heat: 87, growth: 12.8, est: 11900, confidence: 88,
          tech: { rhythm: 70, trans: 74, sub: 92, sound: 79, desc: '<b>分步计时快剪</b>制造效率感；产品盖章式贴片标注，步骤字幕精确到秒，刷具摩擦声收音。' },
          core: { narr: '计时挑战型教程', emo: '效率感 + 精致感兼得', aud: '20-32 岁通勤女性', spread: '产品合集笔记沉淀，品牌置换测评' }
        },
        {
          id: 'xhs3', title: '一人食晚餐摆盘', cat: '生活方式', heat: 85, growth: 9.4, est: 10300, confidence: 82,
          tech: { rhythm: 68, trans: 62, sub: 84, sound: 85, desc: '<b>顶拍俯瞰构图</b>讲究；分镜定格如杂志排版，食谱克数字幕严谨，厨具碰撞 ASMR 治愈。' },
          core: { narr: '独居仪式感叙事', emo: '自洽治愈', aud: '22-30 岁独居青年', spread: '食谱模板收藏，厨具好物外溢' }
        },
        {
          id: 'xhs4', title: '城市 Citywalk 路线合集', cat: '旅行攻略', heat: 84, growth: 17.3, est: 9700, confidence: 87,
          tech: { rhythm: 72, trans: 78, sub: 90, sound: 81, desc: '<b>第一视角步移镜头</b>；路线图动画描线增强攻略感，打卡点标注密度高，环境声保留。' },
          core: { narr: '地图式攻略叙事', emo: '城市探索新鲜感', aud: '18-28 岁本地玩家', spread: '路线图保存外溢，商家 POI 联动' }
        },
        {
          id: 'xhs5', title: '500 元出租屋改造计划', cat: '家居', heat: 81, growth: 26.2, est: 10800, confidence: 80,
          tech: { rhythm: 74, trans: 84, sub: 88, sound: 77, desc: '<b>前后对比大反转剪辑</b>是流量密码；施工过程快进压缩，预算清单字幕实时核对，轻快电子乐。' },
          core: { narr: '限制条件下的逆袭叙事', emo: '租房青年身份共鸣', aud: '20-28 岁租房群体', spread: '预算清单收藏，家具链接直挂转化' }
        }
      ]
    }
  ]
};

/* 模板原视频 · 站外真实视频源（经检索验证存在的平台原视频链接，非本页生成） */
window.RADAR_DATA.orig = {
  dy1:  { site:'哔哩哔哩', title:'Vlog EP.1 挑战一天走遍张家界森林公园', url:'https://www.bilibili.com/video/BV1JZN26mEQU/' },
  dy2:  { site:'哔哩哔哩', title:'【AI老照片复活】让你的老照片动起来，这就是AI的意义!', url:'https://www.bilibili.com/video/BV1RCkmYTEHq' },
  dy3:  { site:'哔哩哔哩', title:'盘点零零后整顿职场爆笑名场面', url:'https://m.bilibili.com/video/BV1tM411W7MV' },
  dy4:  { site:'哔哩哔哩', title:'碳水脑袋逛吃南宁VLOG 吃遍夜市一条街', url:'https://www.bilibili.com/video/BV1KbznBaEce/' },
  dy5:  { site:'哔哩哔哩', title:'全网最像人的小猫七七，不仅会说话还会叫奶奶', url:'https://www.bilibili.com/video/BV1akUSBmEPQ/' },
  bl1:  { site:'哔哩哔哩', title:'【4K修复测试】西游记 第一集 猴王初问世', url:'https://www.bilibili.com/video/BV1Hj9dBtETE/' },
  bl2:  { site:'哔哩哔哩', title:'零基础小白也能学会!客制化键盘从零到一完整组装教程', url:'https://www.bilibili.com/video/BV1YWK56yEiy/' },
  bl3:  { site:'哔哩哔哩', title:'Study with me 图书馆实时学习2h30min 期末周沉浸式', url:'https://www.bilibili.com/video/BV1N2T4zHEme/' },
  bl4:  { site:'哔哩哔哩', title:'ASMR: 失眠电台 | 温柔伴你晚安', url:'https://www.bilibili.com/video/BV1UKLU64Eti/' },
  bl5:  { site:'哔哩哔哩', title:'2025年新高考一卷数学压轴题讲解', url:'https://www.bilibili.com/video/BV1ARMqzSEKm/' },
  ks1:  { site:'哔哩哔哩', title:'老宗采摘荔枝赶集贩卖，剩下荔枝回家做成罐头', url:'https://www.bilibili.com/video/BV1sFK8z4Et6/' },
  ks2:  { site:'哔哩哔哩', title:'盘点东北家庭互怼爆笑日常', url:'https://m.bilibili.com/video/BV1KL411Q74B' },
  ks3:  { site:'哔哩哔哩', title:'继续出发 一日不得闲（货车司机第一视角）', url:'https://www.bilibili.com/video/BV1eJuAzzENz/' },
  ks4:  { site:'哔哩哔哩', title:'近150年历史的德国产缝纫机——完全拆解修复翻新', url:'https://www.bilibili.com/video/BV1WDeq6YEjR/' },
  ks5:  { site:'哔哩哔哩', title:'00后搞钱日记 | 梅州咖啡店装修Vlog 01', url:'https://www.bilibili.com/video/BV1M1u3z9EH9/' },
  sph1: { site:'哔哩哔哩', title:'【微电影】毕业10周年同学聚会', url:'https://www.bilibili.com/video/BV1v14y1g7UN/' },
  sph2: { site:'哔哩哔哩', title:'立秋养生 | 秋天的第一碗靓汤', url:'https://www.bilibili.com/video/BV1jstsznEzT/' },
  sph3: { site:'哔哩哔哩', title:'曾仕强《管理VS领导》卓越经理人必修课', url:'https://www.bilibili.com/video/BV1wN3Bz9E5K/' },
  sph4: { site:'哔哩哔哩', title:'我的家乡我的村庄（无人机航拍家乡十年变化）', url:'https://www.bilibili.com/video/BV1JUbfzdEMA/' },
  sph5: { site:'哔哩哔哩', title:'旗风雅韵艺术团姐妹们旗袍走秀《女人如书》', url:'https://www.bilibili.com/video/BV1h6tfzMEp1/' },
  xhs1: { site:'哔哩哔哩', title:'Dress sharing 秋冬的氛围感是呢大衣给的', url:'https://www.bilibili.com/video/BV13zC7YpEUe/' },
  xhs2: { site:'哔哩哔哩', title:'3min跟练 伪素颜气血妆 新手小白也能看清每一步', url:'https://www.bilibili.com/video/BV1in9kB7EZ7/' },
  xhs3: { site:'哔哩哔哩', title:'一人食晚餐vlog 番茄炒蛋盖饭+毛豆蒸香肠', url:'https://www.bilibili.com/video/BV17TKZzxEqo/' },
  xhs4: { site:'哔哩哔哩', title:'上海citywalk经典路线（附线路）', url:'https://www.bilibili.com/video/BV1DM4mziEjd/' },
  xhs5: { site:'哔哩哔哩', title:'耗时72小时，花¥500块爆改出租屋书桌 改造前vs改造后', url:'https://www.bilibili.com/video/BV1XnHozDEnd/' }
};
