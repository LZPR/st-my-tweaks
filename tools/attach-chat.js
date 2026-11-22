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
        if (msg?.is_system || typeof msg?.mes !== 'string' || !msg.mes.trim()) continue;
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
        let allChats, recentChats, loadingAll, attaching = false;
        function render() {
            const query = search.value.trim().toLowerCase();
            const filtered = Boolean(query || owner.value);
            list.replaceChildren();
            const rows = filtered ? allChats : recentChats;
            if (!rows) {
                status.textContent = '正在读取聊天…';
                return;
            }
            let count = 0;
            for (const row of rows) {
                const id = row.group ? 'g:' + row.group : 'c:' + (row.avatar ?? '');
                const title = row.file_name.replace(/\.jsonl$/i, '');
                if (currentOwner === id && current === title) continue;
                const name = owners.get(id) ?? id.slice(2);
                if ((owner.value && owner.value !== id) || !(name + ' ' + title).toLowerCase().includes(query)) continue;
                const key = JSON.stringify([id, title]);
                const label = document.createElement('label');
                label.className = 'stmt-attach-card';
                const heading = document.createElement('strong');
                heading.textContent = title;
                const author = document.createElement('small');
                author.textContent = name;
                const preview = document.createElement('span');
                preview.className = 'stmt-attach-preview';
                preview.textContent = !row.mes || ['[The message is empty]', '[The chat is empty]'].includes(row.mes)
                    ? '暂无消息预览' : row.mes.slice(0, 300);
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
                if (++count >= recentCount && !filtered) break;
            }
            function updateStatus() {
                status.textContent = (count ? (filtered ? '匹配 ' : '最近 ') + count + ' 个聊天' : '没有匹配的聊天') + ' · 已选 ' + selected.size;
            }
            updateStatus();
        }

        async function filter() {
            render();
            if (!(search.value.trim() || owner.value) || allChats || loadingAll) return;
            loadingAll = true;
            try {
                allChats = await readChats(ctx, 'recent', {}, signal);
                render();
            } catch (error) {
                if (!signal.aborted) status.textContent = '聊天列表读取失败，请重新筛选或重新打开。';
            } finally {
                loadingAll = false;
            }
        }
        search.oninput = owner.onchange = filter;

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
                        const messages = row.group
                            ? await readChats(ctx, 'group/get', { id: title }, signal)
                            : await readChats(ctx, 'get', { avatar_url: row.avatar ?? '', file_name: title }, signal);
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
            const closed = popup.show();
            readChats(ctx, 'recent', { max: recentCount + 1 }, signal).then(rows => {
                recentChats = rows;
                render();
            }).catch(() => {
                if (!signal.aborted && !search.value.trim() && !owner.value) status.textContent = '最近聊天读取失败，请重新打开。';
            });
            await closed;
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
