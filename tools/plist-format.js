// Separators inside descriptions such as hair(long, black) belong to the trait.
export function splitTraits(text, separators = ',，') {
    const parts = [];
    let depth = 0;
    let start = 0;
    let quote = '';
    for (let i = 0; i < text.length; i++) {
        const char = text[i];
        if (quote) {
            if (char === '\\') i++;
            else if (char === quote) quote = '';
            continue;
        }
        if ((char === '"' || char === '“') && text.indexOf(char === '"' ? '"' : '”', i + 1) !== -1) {
            quote = char === '"' ? '"' : '”';
            continue;
        }
        if (char === '(' || char === '（') depth++;
        if (char === ')' || char === '）') depth--;
        if (depth < 0) return null;
        if (depth === 0 && separators.includes(char)) {
            parts.push(text.slice(start, i));
            start = i + 1;
        }
    }
    return depth === 0 ? [...parts, text.slice(start)] : null;
}

export function parseRows(body) {
    const sections = splitTraits(body, ';；');
    if (!sections) return null;
    if (!sections.at(-1).trim()) sections.pop();
    if (!sections.length) return null;
    const rows = [];
    for (const section of sections) {
        const match = /^(\s*)([^:：=;；\[\]\r\n]+?)(\s*[:：=]\s*)([\s\S]+?)(\s*)$/u.exec(section);
        if (!match || !match[2].trim() || !match[4].trim()) return null;
        rows.push({ name: match[2].trim(), value: match[4].trim() });
    }
    return rows;
}

export function findBlocks(text) {
    const blocks = [];
    for (const match of text.matchAll(/\[([^\[\]]+)\]/gu)) {
        const end = match.index + match[0].length;
        // Markdown links, reference definitions and double brackets are other markup.
        if (text[end] === '(' || text[end] === ':' || text[end] === ']' ||
            /[!\[\\]/u.test(text[match.index - 1] ?? '') || /^\s*https?:\/\//iu.test(match[1])) continue;
        const rows = parseRows(match[1]);
        if (rows) blocks.push({ start: match.index, end, rows });
    }
    return blocks;
}

export function writeBlocks(text, blocks, drafts) {
    let result = '';
    let cursor = 0;
    for (const [index, block] of blocks.entries()) {
        result += text.slice(cursor, block.start);
        const rows = drafts[index];
        const unchanged = rows.length === block.rows.length && rows.every((row, i) =>
            row.name === block.rows[i].name && row.value === block.rows[i].value);
        result += unchanged ? text.slice(block.start, block.end) : formatBlock(rows);
        cursor = block.end;
    }
    result += text.slice(cursor);
    for (const rows of drafts.slice(blocks.length)) {
        if (rows.length) result += (result && !result.endsWith('\n') ? '\n' : '') + formatBlock(rows);
    }
    return result;
}

function formatBlock(rows) {
    return rows.length ? '[' + rows.map(row => row.name + ': ' + row.value).join('; ') + ']' : '';
}
