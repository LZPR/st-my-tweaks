function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
}

const categories = {
    prompt: ['提示词与指令', 'PROMPT'],
    history: ['历史消息', 'HISTORY'],
    current: ['本轮输入', 'COMPOSER'],
};

function messageSection(kind, entries) {
    const section = element('details', 'stmt-rp-section');
    section.open = kind === 'current';
    const [title, code] = categories[kind];
    const summary = element('summary');
    const label = element('span', 'stmt-rp-label', title);
    label.append(element('small', '', code));
    const first = entries[0].message;
    const snippet = kind === 'current' ? '来自当前输入框' : typeof first.content === 'string' ? first.content.slice(0, 120) : first.role;
    const description = element('span', 'stmt-rp-description');
    description.append(element('b', '', entries.length + ' 条'), element('span', '', snippet));
    summary.append(label, description);
    section.append(summary);
    function populate() {
        if (!section.open || section.children.length > 1) return;
        const list = element('div', 'stmt-rp-messages');
        for (const { message, index } of entries) {
            const row = element('article');
            const meta = element('header');
            meta.append(element('small', '', '#' + String(index + 1).padStart(2, '0')), element('b', '', message.role));
            if (message.name) meta.append(element('span', '', message.name));
            row.append(meta);
            row.append(element('pre', '', typeof message.content === 'string' ? message.content : JSON.stringify(message.content, null, 2)));
            const { role, content, name, ...extra } = message;
            if (Object.keys(extra).length) row.append(element('pre', 'stmt-rp-extra', JSON.stringify(extra, null, 2)));
            list.append(row);
        }
        section.append(list);
    }
    section.addEventListener('toggle', populate);
    populate();
    return section;
}

export function previewDialog() {
    const dialog = element('dialog', 'stmt-rp');
    dialog.setAttribute('aria-label', '预览请求');
    dialog.innerHTML = `<header class="stmt-rp-head"><div><h2>预览请求</h2><p>POST /api/backends/chat-completions/generate</p></div><button type="button" class="stmt-rp-close" aria-label="关闭">×</button></header>
        <nav aria-label="预览视图"><button type="button" aria-pressed="true">消息</button><button type="button" aria-pressed="false">请求参数</button><button type="button" aria-pressed="false">完整 JSON</button></nav>
        <main><p role="status">正在组装请求…</p></main>`;
    const main = dialog.querySelector('main');
    const buttons = [...dialog.querySelectorAll('nav button')];
    buttons.forEach(b => { b.disabled = true; });
    function status(message) {
        main.replaceChildren(element('p', '', message));
        main.firstChild.setAttribute('role', 'status');
    }
    function render({ body, currentIndex, hasDraft, historyIndices }) {
        const { messages, ...params } = body;
        const messagePage = element('section');
        const paramsPage = element('section');
        function heading(title, count) {
            const h = element('div', 'stmt-rp-heading');
            h.append(element('h3', '', title), element('small', '', count));
            return h;
        }
        messagePage.append(heading('消息序列', messages.length + ' 条消息'));
        if (hasDraft && !(currentIndex >= 0)) messagePage.append(element('p', '', '未在最终消息中定位到本轮输入。'));
        const groups = [];
        const history = new Set(historyIndices);
        messages.forEach((message, index) => {
            const kind = index === currentIndex ? 'current' : history.has(index) ? 'history' : 'prompt';
            if (groups.at(-1)?.kind !== kind) groups.push({ kind, entries: [] });
            groups.at(-1).entries.push({ message, index });
        });
        for (const { kind, entries } of groups) messagePage.append(messageSection(kind, entries));
        paramsPage.append(heading('请求参数', Object.keys(params).length + ' 项'));
        const fields = element('dl', 'stmt-rp-fields');
        const priority = ['model', 'temperature', 'reasoning_effort', 'top_p', 'max_tokens', 'max_completion_tokens', 'stream'];
        for (const key of new Set([...priority.filter(key => key in params), ...Object.keys(params)])) {
            const value = params[key];
            fields.append(element('dt', '', key));
            const dd = element('dd');
            if (value !== null && typeof value === 'object') {
                const details = element('details');
                details.append(element('summary', '', Array.isArray(value) ? '数组 · ' + value.length : '对象 · ' + Object.keys(value).length));
                details.ontoggle = () => {
                    if (details.open && details.children.length === 1) details.append(element('pre', '', JSON.stringify(value, null, 2)));
                };
                dd.append(details);
            } else dd.textContent = JSON.stringify(value);
            fields.append(dd);
        }
        paramsPage.append(fields);
        const rawPage = element('pre');
        const pages = [messagePage, paramsPage, rawPage];
        function select(i) {
            if (i === 2 && !rawPage.hasChildNodes()) rawPage.textContent = JSON.stringify(body, null, 2);
            main.replaceChildren(pages[i]);
            buttons.forEach((b, n) => b.setAttribute('aria-pressed', String(n === i)));
            main.scrollTop = 0;
        }
        buttons.forEach((b, i) => { b.disabled = false; b.onclick = () => select(i); });
        select(0);
    }
    return { dialog, status, render };
}
