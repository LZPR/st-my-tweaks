const defaults = { recentCount: 8, maxLength: 12000 };

function renderSettings(canvas, draft) {
    const fields = [];
    for (const [key, title] of [['recentCount', '最近显示的聊天数'], ['maxLength', '每份聊天附件的最大字符数']]) {
        const label = document.createElement('label');
        const input = document.createElement('input');
        input.type = 'number';
        input.className = 'text_pole';
        input.min = '1';
        input.required = true;
        input.value = draft[key] ?? defaults[key];
        label.append(title, input);
        canvas.append(label);
        fields.push({ key, input });
    }
    return () => {
        for (const { key, input } of fields) {
            if (!input.reportValidity() || !Number.isSafeInteger(input.valueAsNumber)) return false;
            draft[key] = input.valueAsNumber;
        }
        return true;
    };
}

// Work backwards so even a single oversized last message keeps its newest text.
function transcript(messages, remaining) {
    const lines = [];
    for (let i = messages.length - 1; i >= 0 && remaining > 0; i--) {
        const msg = messages[i];

        const line = `${msg.name || (msg.is_user ? '用户' : '角色')}：${msg.mes}`;
        if (lines.length && --remaining === 0) break;
        const chars = Array.from(line);
        lines.push(chars.slice(-remaining).join(''));
        remaining -= chars.length;
    }
    return lines.reverse().join('\n');
}

async function readChats(context, route, body, signal) {
    const response = await fetch('/api/chats/' + route, {
        method: 'POST', headers: context.getRequestHeaders(), body: JSON.stringify(body), signal,
    });
    if (!response.ok) throw new Error('无法读取聊天，请重试。');
    const data = await response.json();
    if (!Array.isArray(data)) throw new Error('聊天记录不可用。');
    return data;
}

async function readMessages(ctx, row, title, signal) {
    const data = row.group
        ? await readChats(ctx, 'group/get', { id: title }, signal)
        : await readChats(ctx, 'get', { avatar_url: row.avatar ?? '', file_name: title }, signal);
    return data.filter(msg => !msg?.is_system && typeof msg?.mes === 'string' && msg.mes.trim());
}
function start(context, getConfig) {
    const entry = document.createElement('button');
    entry.type = 'button';
    entry.className = 'list-group-item stmt-route-entry';
    entry.innerHTML = '<i class="fa-solid fa-paperclip fa-fw extensionsMenuExtensionButton" aria-hidden="true"></i><span>附加聊天记录</span>';
    entry.setAttribute('aria-haspopup', 'dialog');
    document.querySelector('#extensionsMenu').append(entry);
    let session;

    async function open() {
        if (session) return;
        const ctx = SillyTavern.getContext();
        const current = ctx.getCurrentChatId();
        const currentOwner = ctx.groupId ? 'g:' + ctx.groupId : 'c:' + (ctx.characters[ctx.characterId]?.avatar ?? '');
        const owners = new Map([['c:', '无角色聊天']]);
        for (const c of ctx.characters) if (c) owners.set('c:' + c.avatar, c.name);
        for (const g of ctx.groups) owners.set('g:' + g.id, g.name + '（群聊）');
        const recentCount = getConfig().recentCount ?? defaults.recentCount;
        const selected = new Map();
        const panel = document.createElement('div');
        panel.className = 'stmt-attach-panel';
        panel.innerHTML = `<h3>附加聊天记录</h3>
            <div class="stmt-attach-filters">
                <input type="search" class="text_pole" placeholder="搜索聊天名称或角色名" aria-label="搜索聊天名称或角色名">
                <select class="text_pole" aria-label="按角色筛选"><option value="">全部角色</option></select>
            </div>
            <div class="stmt-attach-list"></div><small role="status"></small>`;
        const search = panel.querySelector('input');
        const owner = panel.querySelector('select');
        const list = panel.querySelector('.stmt-attach-list');
        const status = panel.querySelector('small');
        for (const [id, name] of owners) owner.add(new Option(name, id));

        const controller = new AbortController();
        const { signal } = controller;
        let catalog, revision = 0, attaching = false;
        const previews = new Map();
        function previewFor(chat) {
            if (!previews.has(chat.key)) {
                const pending = readMessages(ctx, chat.row, chat.title, signal)
                    .then(messages => messages.at(-1)?.mes.slice(0, 300) ?? '')
                    .catch(error => {
                        previews.delete(chat.key);
                        throw error;
                    });
                previews.set(chat.key, pending);
            }
            return previews.get(chat.key);
        }

        async function render() {
            const version = ++revision;
            const query = search.value.trim().toLowerCase();
            const filtered = Boolean(query || owner.value);
            list.replaceChildren();
            status.textContent = '正在读取聊天…';
            let count = 0, failed = false;
            try {
                catalog ??= readChats(ctx, 'recent', {}, signal).catch(error => {
                    catalog = undefined;
                    throw error;
                });
                const rows = await catalog;
                const matches = [];
                for (const row of rows) {
                    const id = row.group ? 'g:' + row.group : 'c:' + (row.avatar ?? '');
                    const title = row.file_name.replace(/\.jsonl$/i, '');
                    const name = owners.get(id) ?? id.slice(2);
                    if (currentOwner === id && current === title) continue;
                    if (owner.value && owner.value !== id) continue;
                    if (!(name + ' ' + title).toLowerCase().includes(query)) continue;
                    matches.push({ row, title, name, key: JSON.stringify([id, title]) });
                }
                for (let i = 0; i < matches.length; i += 6) {
                    if (signal.aborted || version !== revision) return;
                    const batch = matches.slice(i, i + 6);
                    const results = await Promise.allSettled(batch.map(previewFor));
                    if (signal.aborted || version !== revision) return;
                    for (const [j, result] of results.entries()) {
                        if (result.status === 'rejected') {
                            failed = true;
                            continue;
                        }
                        if (!result.value) continue;
                        addCard(batch[j], result.value);
                        count++;
                        if (!filtered && count >= recentCount) break;
                    }
                    updateStatus();
                    if (!filtered && count >= recentCount) break;
                }
                updateStatus();
            } catch {
                if (!signal.aborted && version === revision) status.textContent = '聊天列表读取失败，请重新打开。';
            }

            function addCard({ row, title, name, key }, previewText) {
                const label = document.createElement('label');
                label.className = 'stmt-attach-card';
                const heading = document.createElement('strong');
                heading.textContent = title;
                const author = document.createElement('small');
                author.textContent = name;
                const preview = document.createElement('span');
                preview.className = 'stmt-attach-preview';
                preview.textContent = previewText;
                const checkbox = document.createElement('input');
                checkbox.type = 'checkbox';
                checkbox.checked = selected.has(key);
                checkbox.onchange = () => {
                    if (checkbox.checked) selected.set(key, { row, title, name });
                    else selected.delete(key);
                    updateStatus();
                };
                label.append(heading, checkbox, author, preview);
                list.append(label);

            }
            function updateStatus() {
                status.textContent = (count ? (filtered ? '匹配 ' : '最近 ') + count + ' 个聊天' : '没有匹配的聊天') + ' · 已选 ' + selected.size + (failed ? ' · 部分聊天读取失败' : '');
            }
        }
        search.oninput = owner.onchange = render;

        const popup = new context.Popup(panel, context.POPUP_TYPE.CONFIRM, '', {
            okButton: '附加', cancelButton: '取消', leftAlign: true,
            onClosing: async p => {
                if (p.result !== context.POPUP_RESULT.AFFIRMATIVE) {
                    controller.abort();
                    return true;
                }
                if (attaching) return false;
                if (!selected.size) {
                    status.textContent = '请先选择聊天。';
                    return false;
                }
                attaching = true;
                panel.inert = true;
                status.textContent = '正在准备附件…';
                try {
                    const transfer = new DataTransfer();
                    for (const { row, title, name } of selected.values()) {
                        const messages = await readMessages(ctx, row, title, signal);
                        const body = transcript(messages, getConfig().maxLength ?? defaults.maxLength);
                        if (!body) throw new Error('「' + title + '」没有可附加的消息。');
                        transfer.items.add(new File([body], name + ' - ' + title + '.txt', { type: 'text/plain' }));
                    }
                    if (signal.aborted) return false;
                    const paste = new ClipboardEvent('paste', { clipboardData: transfer, bubbles: true, cancelable: true });
                    const composer = document.querySelector('#send_textarea');
                    if (!paste.clipboardData?.files.length || !composer || composer.dispatchEvent(paste)) {
                        throw new Error('当前输入框无法接收附件。');
                    }
                    return true;
                } catch (error) {
                    if (!signal.aborted) status.textContent = error.message;
                    return false;
                } finally {
                    attaching = false;
                    panel.inert = false;
                }
            },
        });
        session = { controller, popup };
        try {
            render();
            await popup.show();
        } finally {
            controller.abort();
            session = undefined;
        }
    }
    function cancel() {
        if (!session) return;
        session.controller.abort();
        void session.popup.completeCancelled();
    }
    entry.onclick = () => open().catch(() => toastr.error('无法打开聊天选择器。'));
    context.eventSource.on(context.eventTypes.CHAT_CHANGED, cancel);
    return () => {
        context.eventSource.removeListener(context.eventTypes.CHAT_CHANGED, cancel);
        cancel();
        entry.remove();
    };
}

export const attachChat = { id: 'attach-chat', label: '附加聊天记录', start, renderSettings };
