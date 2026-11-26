const builtins = new Map([
    ['char', { name: '{{char}}', text: '{{char}}' }],
    ['user', { name: '{{user}}', text: '{{user}}' }],
    ['quotes', { name: '“”' }],
    ['brackets', { name: '[]' }],
    ['braces', { name: '{}' }],
    ['straightQuotes', { name: '""' }],
    ['asterisks', { name: '**' }],
]);

export const reactionPresets = [
    { id: 'positive', name: '积极', texts: ['好啊，我想试试！', '说到我心坎里了。', '太好了，算我一个。', '我喜欢这个主意。'] },
    { id: 'negative', name: '消极', texts: ['唉，我有点提不起劲。', '这和我想的不太一样。', '坦白说，我有些失望。', '今天恐怕没这个心情。'] },
    { id: 'curious', name: '好奇', texts: ['后来呢？', '你是怎么发现的？', '等一下，那是什么？', '我想听听你怎么说。'] },
    { id: 'surprised', name: '惊讶', texts: ['啊？还有这种事？', '等等，我没听错吧？', '这倒是我没想到的。', '原来是这样！'] },
    { id: 'hesitant', name: '犹豫', texts: ['让我再想一想。', '我还拿不准。', '要不，我们先缓一缓？', '如果换个办法呢？'] },
    { id: 'caring', name: '关心', texts: ['你还好吗？', '要我陪你一会儿吗？', '慢慢来，我听着。', '有什么我能帮上忙的？'] },
];

export function getPhrases(config) {
    const saved = config.phrases ?? [];
    const missing = [];
    for (const [builtin, definition] of builtins) {
        if (!saved.some(item => item.builtin === builtin)) {
            missing.push({ builtin, ...definition, position: 'both', hidden: ['brackets', 'braces', 'straightQuotes', 'asterisks'].includes(builtin) });
        }
    }
    return [...missing, ...saved.map(phrase => {
        if (phrase.builtin || Array.isArray(phrase.texts)) return phrase;
        const { text, ...settings } = phrase;
        return { ...settings, texts: [text ?? ''] };
    })];
}
