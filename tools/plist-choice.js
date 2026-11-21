// Return the original option index so display-only transformations never change saved values.
export function openChoice({ title, labels, allowCustom = false, choose }) {
    const dialog = document.createElement('dialog');
    dialog.className = 'st-plist-choice';
    dialog.setAttribute('aria-label', title);
    const header = document.createElement('header');
    const heading = document.createElement('h3');
    heading.textContent = title;
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'pl-choice-close';
    close.setAttribute('aria-label', '关闭');
    close.textContent = '×';
    close.onclick = () => dialog.close();
    header.append(heading, close);

    const search = document.createElement('input');
    search.type = 'search';
    search.className = 'text_pole';
    search.autofocus = true;
    search.placeholder = allowCustom ? '搜索或输入属性名称' : '搜索参数';
    search.setAttribute('aria-label', search.placeholder);
    const results = document.createElement('div');
    results.className = 'pl-choice-results';
    const empty = document.createElement('p');
    empty.textContent = '没有匹配项';
    empty.setAttribute('role', 'status');
    function select(index) {
        dialog.close();
        choose(index, search.value.trim());
    }
    const tiles = labels.map((label, index) => {
        const tile = document.createElement('button');
        tile.type = 'button';
        tile.textContent = label;
        tile.onclick = () => select(index);
        return tile;
    });
    results.append(...tiles);
    dialog.append(header, search, results, empty);
    const custom = document.createElement('button');
    if (allowCustom) {
        custom.className = 'pl-choice-custom';
        custom.type = 'button';
        custom.onclick = () => select(-1);
        dialog.append(custom);
    }
    function filter() {
        const text = search.value.trim();
        const query = text.toLocaleLowerCase();
        for (const tile of tiles) tile.hidden = !tile.textContent.toLocaleLowerCase().includes(query);
        empty.hidden = tiles.some(tile => !tile.hidden);
        custom.textContent = text ? '＋ 新建「' + text + '」' : '＋ 自定义属性';
    }
    filter();
    search.addEventListener('input', filter);
    search.addEventListener('keydown', event => {
        if (event.isComposing || event.key !== 'Enter') return;
        event.preventDefault();
        const first = tiles.find(tile => !tile.hidden);
        if (first) first.click();
        else if (allowCustom) custom.click();
    });
    dialog.addEventListener('close', () => dialog.remove(), { once: true });
    document.body.append(dialog);
    dialog.showModal();
}
