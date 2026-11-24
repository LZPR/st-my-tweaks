import { createGreetingHistory, greetingBatchSize } from './greeting-history.js';

export function greetingCharacter(context, entry) {
    if (context.groupId == null) return context.characters[context.characterId];
    if (entry.is_user || entry.is_system || !entry.original_avatar) return undefined;
    return context.characters.find(character => character.avatar === entry.original_avatar);
}

function element(tag, text, className) {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = text;
    if (className) node.className = className;
    return node;
}

function button(text, fn, className) {
    const node = element('button', text, className);
    node.type = 'button';
    node.addEventListener('click', fn);
    return node;
}

function greetingRow(title, text, buttons) {
    const row = element('details', undefined, 'stmt-greeting-row');
    const head = element('summary');
    head.append(element('span', title), element('small', text.replace(/\s+/g, ' ').trim() || '尚未填写'));
    const actions = element('div', undefined, 'stmt-greeting-actions');
    actions.append(...buttons);
    row.append(head, element('p', text || '尚未填写开场白'), actions);
    return row;
}

const normalize = text => text.trim().replace(/\r\n?/g, '\n');
const firstOf = card => card.first_mes ?? card.data?.first_mes ?? '';
const alternativesOf = card => card.data?.alternate_greetings ?? [];

export async function applyMessageGreeting(message, isEnabled, config, updateConfig, signal) {
    const context = SillyTavern.getContext();
    const id = Number(message.getAttribute('mesid'));
    const entry = context.chat[id];
    const source = entry.mes;
    const character = greetingCharacter(context, entry);
    const { avatar, name } = character;

    async function post(route, body, requestSignal) {
        const response = await fetch('/api/' + route, {
            method: 'POST', headers: context.getRequestHeaders(), body: JSON.stringify(body), signal: requestSignal,
        });
        if (!response.ok) throw new Error('Request failed: ' + response.status);
        return response;
    }
    const readJson = async (...args) => (await post(...args)).json();
    const readCard = () => readJson('characters/get', { avatar_url: avatar });
    function current() {
        const live = SillyTavern.getContext();
        return isEnabled() && message.isConnected && live.chatId === context.chatId && live.chat[id] === entry
            && entry.mes === source && greetingCharacter(live, entry)?.avatar === avatar;
    }

    let card = await readCard();
    if (!current()) return;
    const panel = element('section', undefined, 'stmt-greetings');
    panel.innerHTML = `
        <header><h3>开场白管理</h3><span class="stmt-character"></span></header>
        <div class="stmt-greeting-source"><div><strong>当前消息</strong><small></small></div></div>
        <input class="text_pole stmt-greeting-search" type="search" placeholder="搜索开场白…" aria-label="搜索开场白">
        <div class="stmt-greeting-scroll">
            <section><h4>角色开场白 <span></span></h4><div class="stmt-card-list"></div></section>
            <section class="stmt-history"><h4><label><input type="checkbox">其它聊天开场白</label></h4>
                <div class="stmt-history-list"></div><div class="stmt-history-status" aria-live="polite"></div></section>
        </div>`;
    const find = sel => panel.querySelector(sel);
    find('.stmt-character').textContent = name;
    find('.stmt-greeting-source small').textContent = source;
    const search = find('input[type=search]');
    const toggle = find('input[type=checkbox]');
    toggle.checked = config.showGreetingHistory !== false;
    const query = () => search.value.trim().toLocaleLowerCase();
    const matches = (...parts) => parts.some(part => part.toLocaleLowerCase().includes(query()));
    let busy = false;
    const history = createGreetingHistory(readJson, character, context.groupId == null ? context.chatId : null,
        greetingBatchSize(config), () => Boolean(query()), () => renderHistory(false));

    async function confirm(title, oldText, newText, okButton) {
        const content = element('div', undefined, 'stmt-greeting-confirm');
        content.append(element('h3', title));
        if (newText !== undefined) content.append(element('strong', '原开场白'));
        content.append(element('p', oldText || '尚未填写'));
        if (newText !== undefined) content.append(element('strong', '替换为当前消息'), element('p', newText));
        const result = await context.callGenericPopup(content, context.POPUP_TYPE.CONFIRM, '', {
            okButton, cancelButton: '取消', leftAlign: true, allowVerticalScrolling: true,
        });
        return result === context.POPUP_RESULT.AFFIRMATIVE;
    }

    async function change(action, index, text, title) {
        if (busy) return;
        if (!current()) { toastr.warning('当前消息已变化，请重新打开窗口。'); return; }
        busy = true;
        try {
            const isMain = index === -1;
            const old = isMain ? firstOf(card) : alternativesOf(card)[index];
            if (action === 'edit') {
                const content = element('div', undefined, 'stmt-greeting-editor');
                const field = element('textarea', undefined, 'text_pole maximized_textarea');
                field.value = old;
                field.setAttribute('aria-label', title);
                content.append(element('h3', '编辑' + title), field);
                const result = await context.callGenericPopup(content, context.POPUP_TYPE.CONFIRM, '', {
                    okButton: '保存', cancelButton: '取消', large: true, leftAlign: true,
                    onOpen: () => field.focus(),
                });
                if (result !== context.POPUP_RESULT.AFFIRMATIVE || field.value === old) return;
                text = field.value;
            } else if (action === 'overwrite') {
                if (!await confirm('覆盖' + title + '？', old, text, '覆盖')) return;
            } else if (action === 'delete') {
                if (!await confirm((isMain ? '清空' : '删除') + title + '？', old, undefined, isMain ? '清空' : '删除')) return;
                text = '';
            }

            if (!current()) return;
            const latest = await readCard();
            if (!current()) return;
            const alternatives = [...alternativesOf(latest)];
            const editor = document.querySelector('#firstmessage_textarea');
            const editingCard = () => document.querySelector('#avatar_url_pole')?.value === avatar;
            if ((isMain && (firstOf(latest) !== old || (editor && editingCard() && editor.value !== old)))
                || (!isMain && index !== null && (alternatives.length !== alternativesOf(card).length || alternatives[index] !== old))) {
                card = latest;
                renderCard();
                renderHistory();
                toastr.warning('开场白已变化，请核对后重试。');
                return;
            }
            if (isMain) {
                await post('characters/edit-attribute', { avatar_url: avatar, ch_name: latest.name, field: 'first_mes', value: text });
                latest.first_mes = text;
                if (latest.data) latest.data.first_mes = text;
                if (editor && editingCard() && editor.value === old) editor.value = text;
            } else {
                if (action === 'import' && [firstOf(latest), ...alternatives].some(item => normalize(item) === normalize(text))) {
                    card = latest;
                    renderCard();
                    renderHistory();
                    toastr.info('角色已包含这条开场白。');
                    return;
                }
                if (index === null) alternatives.push(text);
                else if (action === 'delete') alternatives.splice(index, 1);
                else alternatives[index] = text;
                await post('characters/merge-attributes', { avatar, data: { alternate_greetings: alternatives } });
                latest.data ??= {};
                latest.data.alternate_greetings = alternatives;
            }
            const cached = context.characters.find(item => item.avatar === avatar);
            if (cached) {
                cached.data ??= {};
                if (isMain) cached.first_mes = cached.data.first_mes = text;
                else cached.data.alternate_greetings = alternatives;
            }
            card = latest;
            renderCard();
            renderHistory();
            toastr.success('已更新角色开场白。');
        } catch {
            toastr.error('读写角色开场白失败，请检查连接后重试。');
        } finally {
            busy = false;
        }
    }

    function renderCard() {
        const list = find('.stmt-card-list');
        const texts = [firstOf(card), ...alternativesOf(card)];
        find('h4 span').textContent = String(texts.length);
        list.replaceChildren();
        texts.forEach((text, i) => {
            const title = i ? '备选开场白 ' + i : '主开场白';
            if (!matches(title, text)) return;
            list.append(greetingRow(title, text, [
                button('用当前消息覆盖', () => change('overwrite', i - 1, source, title)),
                button('全屏编辑', () => change('edit', i - 1, text, title)),
                button(i ? '删除' : '清空', () => change('delete', i - 1, '', title), 'stmt-danger'),
            ]));
        });
        if (!list.childElementCount) list.append(element('small', '没有匹配的角色开场白'));
    }

    let historyIndex = 0;
    let known = new Set();
    function renderHistory(reset = true) {
        const list = find('.stmt-history-list');
        const status = find('.stmt-history-status');
        const { entries, loading, more, error } = history.state();
        if (reset) {
            list.replaceChildren();
            historyIndex = 0;
            known = new Set([firstOf(card), ...alternativesOf(card)].map(normalize));
        }
        status.replaceChildren();
        if (!toggle.checked) return;
        for (; historyIndex < entries.length; historyIndex++) {
            const { file, text } = entries[historyIndex];
            const key = normalize(text);
            if (known.has(key)) continue;
            known.add(key);
            if (matches(text, file)) list.append(greetingRow(file, text, [
                button('加入角色开场白', () => change('import', null, text)),
            ]));
        }
        if (loading) status.textContent = '正在读取其它聊天…';
        else if (error) status.append(button('读取失败，点击重试', history.load));
        else if (more) status.append(button('加载更多', history.load));
        else if (!list.childElementCount) status.textContent = query() ? '没有匹配的聊天开场白' : '没有其它不重复的开场白';
    }

    find('.stmt-greeting-source').append(button('新建备选开场白', () => change('new', null, source), 'stmt-primary'));
    toggle.addEventListener('change', () => {
        updateConfig({ showGreetingHistory: toggle.checked });
        history.pause();
        renderHistory();
        if (toggle.checked) void history.load();
    });
    search.addEventListener('input', () => {
        renderCard();
        renderHistory();
        if (toggle.checked && query()) void history.load();
    });
    const scroll = find('.stmt-greeting-scroll');
    scroll.addEventListener('scroll', () => {
        if (toggle.checked && !history.state().error && scroll.scrollTop + scroll.clientHeight >= scroll.scrollHeight - 32) void history.load();
    });
    renderCard();
    renderHistory();
    signal.addEventListener('abort', history.pause, { once: true });
    try {
        await context.callGenericPopup(panel, context.POPUP_TYPE.TEXT, '', {
            okButton: '完成', leftAlign: true, onClosing: () => !busy,
            onOpen: () => { if (toggle.checked) void history.load(); },
        });
    } finally {
        history.pause();
        signal.removeEventListener('abort', history.pause);
    }
}
