export const defaults = [
    { name: '性别', value: '男, 女, 非二元, 无性别' },
    { name: '外貌', value: '长发, 短发, 卷发, 直发, 光头, 黑发, 金发, 银发, 异色瞳, 浓眉, 鹰钩鼻, 雀斑, 酒窝, 胡须, 黝黑肤色, 苍白肤色, 刺青, 伤疤, 高挑, 矮小, 纤细, 壮硕, 圆润' },
    { name: '性格', value: '活泼, 腼腆, 温和, 冷静, 急躁, 好奇, 固执, 谨慎, 豪爽, 多疑, 自负, 谦逊, 悲观, 乐观, 叛逆, 务实, 浪漫, 好胜, 宽容, 记仇' },
    { name: '年龄阶段', value: '幼儿, 儿童, 少年, 青年, 中年, 老年' },
    { name: '衣着', value: '正装, 校服, 工装, 运动服, 长袍, 盔甲, 风衣, 皮夹克, 斗篷, 百褶裙, 牛仔裤, 高筒靴, 凉鞋, 刺绣, 拼布, 褪色, 剪裁合身' },
    { name: '随身物品', value: '怀表, 笔记本, 吊坠, 眼镜, 手杖, 指南针, 雨伞, 相机, 钥匙串, 地图, 怀炉, 护身符' },
    { name: '举止', value: '步履轻快, 拖步, 昂首, 驼背, 叉腰, 抱臂, 踱步, 低头避视, 直视对方, 咬指甲, 转笔, 敲桌面' },
    { name: '言谈', value: '低语, 洪亮, 沙哑, 清脆, 语速快, 慢条斯理, 惜字如金, 健谈, 毒舌, 风趣, 咬文嚼字, 爱用比喻, 方言口音, 习用敬语' },

    { name: '价值观', value: '自由, 秩序, 公正, 忠诚, 荣誉, 传统, 平等, 效率, 求真, 家庭至上, 珍视生命, 崇尚力量' },
    { name: '动机', value: '复仇, 赎罪, 自保, 寻亲, 归乡, 求学, 扬名, 致富, 争权, 救援, 守护秘密, 打破诅咒' },
    { name: '情绪', value: '喜悦, 愤怒, 悲伤, 恐惧, 惊讶, 厌恶, 羞耻, 愧疚, 嫉妒, 焦虑, 如释重负, 怀念' },
    { name: '技能', value: '急救, 烹饪, 导航, 追踪, 潜水, 攀岩, 驯兽, 农耕, 机械维修, 编程, 口译, 谈判, 调查取证, 戏剧表演, 乐器演奏, 绘图' },
    { name: '爱好', value: '阅读, 园艺, 观星, 徒步, 垂钓, 收藏, 摄影, 陶艺, 舞蹈, 棋类, 骑行, 烘焙' },
    { name: '人际关系', value: '亲子, 手足, 伴侣, 挚友, 师徒, 同僚, 邻里, 雇佣, 盟友, 宿敌, 监护, 笔友' },

    { name: '题材', value: '奇幻, 科幻, 武侠, 仙侠, 历史, 悬疑, 恐怖, 爱情, 喜剧, 冒险, 日常, 末世, 赛博朋克, 蒸汽朋克' },
    { name: '场所', value: '集市, 港口, 车站, 图书馆, 教室, 诊所, 酒馆, 剧院, 法庭, 工坊, 地铁, 公寓, 遗迹, 城堡, 寺庙, 营地, 空间站, 实验室, 森林, 沙漠, 洞穴, 雪原, 海岸, 沼泽' },
    { name: '时间', value: '黎明, 上午, 正午, 午后, 黄昏, 入夜, 午夜, 春季, 夏季, 秋季, 冬季, 节庆, 宵禁期间' },
    { name: '天气', value: '晴朗, 阴天, 浓雾, 细雨, 雷暴, 飘雪, 冰雹, 大风, 沙尘, 酷热, 霜冻, 闷湿' },
    { name: '氛围', value: '宁静, 喧闹, 温馨, 肃穆, 喜庆, 荒凉, 紧张, 压抑, 诡异, 梦幻, 怀旧, 尴尬' },
    { name: '事件', value: '重逢, 失踪, 宴会, 交易, 比赛, 停电, 搬迁, 误会, 告别, 远征, 审判, 加冕, 逃亡, 灾后重建' },
];

// Earlier versions saved these defaults even when only an unrelated setting changed.
const previousDefaults = [
    { name: '性别', value: '男, 女' },
    { name: '外貌', value: '长发, 短发, 卷发, 直发' },
    { name: '性格', value: '活泼, 腼腆, 温和, 冷静' },
];

export function getPresets({ presets }) {
    if (presets == null) return defaults;
    const savedDefaults = presets.length === previousDefaults.length && previousDefaults.every((row, index) =>
        row.name === presets[index]?.name && row.value === presets[index]?.value);
    return savedDefaults ? defaults : presets;
}
