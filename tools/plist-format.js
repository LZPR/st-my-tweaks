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

export function parseRows(body, valueRanges = []) {
    const sections = splitTraits(body, ';；');
    if (!sections) return null;
    if (!sections.at(-1).trim()) sections.pop();
    if (!sections.length) return null;
    const rows = [];
    let offset = 0;
    for (const section of sections) {
        const match = /^(\s*)([^:：=;；\[\]\r\n]+?)(\s*[:：=]\s*)([\s\S]+?)(\s*)$/u.exec(section);
        if (!match || !match[2].trim() || !match[4].trim()) return null;
        rows.push({ name: match[2].trim(), value: match[4].trim() });
        const start = offset + match[1].length + match[2].length + match[3].length;
        valueRanges.push({ start, end: start + match[4].length });
        offset += section.length + 1;
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
        const valueRanges = [];
        const rows = parseRows(match[1], valueRanges);
        if (rows) blocks.push({ start: match.index, end, rows, valueRanges });
    }
    return blocks;
}

export function writeBlocks(text, blocks, drafts) {
    let result = '';
    let cursor = 0;
    for (const [index, block] of blocks.entries()) {
        result += text.slice(cursor, block.start);
        const rows = drafts[index];
        if (rows.length === block.rows.length && rows.every((row, i) => row.name === block.rows[i].name)) {
            // Keep the source dialect, including equals signs and spacing, for value-only edits.
            let from = block.start;
            rows.forEach((row, i) => {
                if (row.value === block.rows[i].value) return;
                const range = block.valueRanges[i];
                result += text.slice(from, block.start + 1 + range.start) + row.value;
                from = block.start + 1 + range.end;
            });
            result += text.slice(from, block.end);
        } else {
            result += formatBlock(rows);
        }
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
