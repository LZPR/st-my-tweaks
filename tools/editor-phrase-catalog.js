const builtins = new Map([
    ['char', { name: '{{char}}', text: '{{char}}' }],
    ['user', { name: '{{user}}', text: '{{user}}' }],
    ['quotes', { name: '“”' }],
    ['brackets', { name: '[]' }],
    ['braces', { name: '{}' }],
    ['straightQuotes', { name: '""' }],
    ['asterisks', { name: '**' }],
]);

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
