// A prefixed name is one searchable field even though it occupies two elements.
export function highlightSection(section, query) {
    let count = 0;
    const pattern = query && new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'giu');
    function highlight(nodes, padding = '') {
        const parts = nodes.map(node => node.textContent);
        const text = parts.join('');
        const matches = pattern ? Array.from(text.slice(0, text.length - padding.length).matchAll(pattern)) : [];
        count += matches.length;
        let offset = 0;
        for (const [i, node] of nodes.entries()) {
            const value = parts[i];
            let cursor = 0;
            const children = [];
            for (const match of matches) {
                const start = Math.max(0, match.index - offset);
                const end = Math.min(value.length, match.index + match[0].length - offset);
                if (end <= start) continue;
                const mark = document.createElement('mark');
                mark.textContent = value.slice(start, end);
                children.push(value.slice(cursor, start), mark);
                cursor = end;
            }
            if (children.length || node.firstElementChild) node.replaceChildren(...children, value.slice(cursor));
            offset += value.length;
        }
    }
    for (const row of section.querySelectorAll('.pl-row')) {
        highlight([...row.querySelectorAll('.pl-name-cell > small, .pl-key > span')], ' ');
        for (const chip of row.querySelectorAll('.pl-chip')) highlight([chip]);
    }
    return count;
}
