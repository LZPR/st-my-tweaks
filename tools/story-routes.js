import { extension_prompt_roles, extension_prompt_types, isGenerating } from '../../../../../script.js';

const promptKey = 'st-my-tweaks-story-route';
const defaults = {
    autoGenerate: true,
    count: 4,
    lifetime: 6,
    generation: '根据当前对话，用对话所用的语言提出几条后续发展路线。每条用一两句话写清从当前情境如何发展，保留用户决定如何回应的空间。不要代写用户台词或行动。让不同路线在事件、关系或节奏上有实质区别，例如顺势推进、深入了解或引入合理的戏剧性转折。',
    guidance: '请结合角色和当前情境，循序渐进地沿以下路线推动对话，为用户留出回应空间。\n{{route}}',
};

function addCheckbox(canvas, draft, key, label) {
    const wrapper = document.createElement('label');
    wrapper.className = 'checkbox_label';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = draft[key] ?? defaults[key];
    input.addEventListener('change', () => { draft[key] = input.checked; });
    wrapper.append(input, label);
    canvas.append(wrapper);
}

function renderSettings(canvas, draft) {
    addCheckbox(canvas, draft, 'autoGenerate', '没有路线时自动生成');
    const fields = [];
    for (const [key, label] of [
        ['count', '推荐路线数量'], ['lifetime', '有效消息条数'],
        ['generation', '生成路线的提示词（推荐数量和 JSON 格式会自动附加）'],
        ['guidance', '引导对话的系统提示词（{{route}} 代表所选路线，省略时自动附在末尾）'],
    ]) {
        const numeric = typeof defaults[key] === 'number';
        const input = document.createElement(numeric ? 'input' : 'textarea');
        if (numeric) {
            input.type = 'number';
            input.min = '1';
            input.step = '1';
        } else {
            input.rows = 4;
        }
        input.required = true;
        input.className = 'text_pole';
        input.value = draft[key] ?? defaults[key];
        const wrapper = document.createElement('label');
        wrapper.append(label, input);
        canvas.append(wrapper);
        fields.push({ input, key, numeric });
    }
    return () => {
        for (const { input, key, numeric } of fields) {
            if (!input.reportValidity()) return false;
            if (!input.value.trim() || (numeric && !Number.isSafeInteger(input.valueAsNumber))) {
                toastr.warning('请输入有效的提示词或正整数。');
                input.focus();
                return false;
            }
            draft[key] = numeric ? input.valueAsNumber : input.value.trim();
        }
        return true;
    };
}

function parseRoutes(raw) {
    const text = String(raw ?? '').trim();
    const fenced = /^\x60\x60\x60(?:json)?\s*\n([\s\S]*?)\n\x60\x60\x60$/i.exec(text);
    const { routes } = JSON.parse(fenced ? fenced[1] : text);
    if (!Array.isArray(routes) || !routes.length) {
        throw new Error('Invalid routes');
    }
    const unique = new Map();
    for (const item of routes) {
        if (typeof item?.title !== 'string' || !item.title.trim()
            || typeof item.text !== 'string' || !item.text.trim()) {
            throw new Error('A route requires a title and text');
        }
        const text = item.text.trim();
        if (!unique.has(text)) unique.set(text, { title: item.title.trim(), text });
    }
    return [...unique.values()];
}

function button(label, click, icon) {
    const element = document.createElement('button');
    element.type = 'button';
    element.className = 'menu_button menu_button_icon';
    element.textContent = label;
    if (icon) {
        const glyph = document.createElement('i');
        glyph.className = 'fa-solid ' + icon;
        glyph.setAttribute('aria-hidden', 'true');
        element.prepend(glyph);
    }
    if (click) element.addEventListener('click', click);
    return element;
}

function iconButton(label, icon, click) {
    const element = button('', click, icon);
    element.title = label;
    element.setAttribute('aria-label', label);
    return element;
}

function actions(...buttons) {
    const bar = document.createElement('div');
    bar.className = 'stmt-route-actions';
    bar.append(...buttons);
    return bar;
}

function newSession() {
    const { chatId, groupId, characters, characterId } = SillyTavern.getContext();
    return {
        chatId, owner: groupId ?? characters[characterId]?.avatar,
        routes: [], custom: null, selected: null, anchor: 0, pending: false, notice: '',
    };
}

let settingsChanged;

function start(context, getConfig) {
    const config = () => ({ ...defaults, ...getConfig() });
    let session = newSession();
    let popup, panel, list, editor;
    let enabled = true;

    function isCurrent(target) {
        const live = SillyTavern.getContext();
        return enabled && target === session && target.chatId === live.chatId
            && target.owner === (live.groupId ?? live.characters[live.characterId]?.avatar);
    }

    function syncPrompt() {
        const live = SillyTavern.getContext();
        const { guidance, lifetime } = config();
        if (live.chat.length - 1 - session.anchor >= lifetime && session.selected) {
            session.selected = null;
            session.notice = '路线已到期，可重新选择。';
        }
        if (!isCurrent(session) || !session.selected || session.pending) {
            delete live.extensionPrompts[promptKey];
            return;
        }
        const route = session.selected.text;
        const prompt = guidance.includes('{{route}}')
            ? guidance.replaceAll('{{route}}', () => route) : guidance + '\n' + route;
        live.setExtensionPrompt(promptKey, prompt, extension_prompt_types.IN_CHAT, 0, false, extension_prompt_roles.SYSTEM);
    }

    async function generate() {
        const target = session;
        if (!isCurrent(target) || target.pending) return;
        if (isGenerating()) {
            target.notice = '当前正在生成回复，请在结束后点击「换一批」。';
            render();
            return;
        }
        target.pending = true;
        target.notice = '';
        syncPrompt();
        render();
        try {
            const { generation, count } = config();
            const live = SillyTavern.getContext();
            const settings = live.chatCompletionSettings;
            // Leave room for reasoning as well as the JSON, without changing the chat preset.
            const budget = live.mainApi === 'openai'
                ? Math.min(4096, 1024 + 256 * count, Math.floor(settings.openai_max_context / 4)) : 0;
            const raw = await context.generateQuietPrompt({
                responseLength: budget > settings?.openai_max_tokens ? budget : null,
                quietPrompt: generation + '\n推荐提供 ' + count + ' 条。每条路线用简短的标题概括发展方向，例如“平稳发展的路线”。'
                    + '正文写出结合当前情境的具体发展。仅输出 JSON 对象，格式为 {"routes":[{"title":"方向标题","text":"路线正文"}]}。',
            });
            if (!isCurrent(target)) return;
            try {
                target.routes = parseRoutes(raw);
                target.notice = '已生成 ' + target.routes.length + ' 条路线。';
            } catch {
                target.notice = '模型未返回有效的路线 JSON，可点击「换一批」重试。';
                toastr.warning(target.notice);
            }
        } catch {
            if (isCurrent(target)) {
                target.notice = '路线生成失败，请检查模型连接后手动换一批。';
                toastr.warning(target.notice);
            }
        } finally {
            target.pending = false;
            if (isCurrent(target)) update();
        }
    }

    function warnBeforeUnload(event) {
        event.preventDefault();
        event.returnValue = true;
    }

    function endEdit() {
        editor = null;
        window.removeEventListener('beforeunload', warnBeforeUnload);
    }

    function edit(route) {
        const target = session;
        const card = document.createElement('div');
        card.className = 'st-my-tweaks-route is-editing';
        editor = { route, card };
        window.addEventListener('beforeunload', warnBeforeUnload);
        const title = document.createElement('input');
        title.className = 'text_pole';
        title.placeholder = '路线标题';
        title.setAttribute('aria-label', '路线标题');
        title.value = route?.title ?? '自定义路线';
        const field = document.createElement('textarea');
        field.id = 'stmt-route-body-editor';
        field.className = 'text_pole';
        field.rows = 4;
        field.value = route?.text ?? '';
        field.placeholder = '路线正文';
        field.setAttribute('aria-label', '路线正文');
        const expand = iconButton('全屏编辑路线正文', 'fa-expand');
        expand.classList.add('editor_maximize');
        expand.dataset.for = field.id;
        card.append(title, field, actions(expand, button('保存', () => {
            if (!isCurrent(target)) return;
            const heading = title.value.trim();
            const text = field.value.trim();
            if (!heading || !text) {
                (heading ? field : title).focus();
                toastr.warning(heading ? '请填写路线正文。' : '请填写路线标题。');
                return;
            }
            if (route) Object.assign(route, { title: heading, text });
            else target.custom = { title: heading, text };
            endEdit();
            syncPrompt();
            render(route ?? target.custom);
        }, 'fa-check'), button('放弃编辑', () => { endEdit(); render(route); })));
        render();
        field.focus();
    }

    function render(focusRoute) {
        if (!panel) return;
        const target = session;
        const heading = document.createElement('h3');
        heading.textContent = '对话发展路线';
        const status = document.createElement('p');
        status.setAttribute('role', 'status');
        status.textContent = target.pending ? '正在根据当前对话生成路线…' : target.notice;
        const refresh = button('换一批', generate, 'fa-rotate');
        refresh.disabled = target.pending || !!editor;
        const bar = actions(refresh);
        if (!target.custom) {
            const create = button('自建路线', () => edit(null), 'fa-plus');
            create.disabled = !!editor;
            bar.append(create);
        }
        const header = document.createElement('div');
        header.className = 'stmt-route-header';
        header.append(heading, bar);
        panel.firstElementChild.replaceChildren(header, status);
        // Keep the draft attached, including while ST's maximized editor writes into it.
        for (const child of [...list.children]) {
            if (child !== editor?.card) child.remove();
        }
        const routes = [...target.routes];
        if (target.custom) routes.unshift(target.custom);
        if (target.selected && !routes.includes(target.selected)) routes.unshift(target.selected);
        if (editor && !routes.includes(editor.route)) routes.unshift(editor.route);
        for (const [index, route] of routes.entries()) {
            const active = route === target.selected;
            if (editor && route === editor.route) {
                editor.card.classList.toggle('is-selected', !!route && active);
                if (!editor.card.isConnected) list.insertBefore(editor.card, list.children[index] ?? null);
                continue;
            }
            const card = document.createElement('div');
            card.className = 'st-my-tweaks-route';
            card.classList.toggle('is-selected', active);
            const select = button('', () => {
                if (!isCurrent(target)) return;
                target.selected = active ? null : route;
                target.anchor = SillyTavern.getContext().chat.length - 1;
                target.notice = '';
                syncPrompt();
                render(route);
            });
            select.className = 'stmt-route-select';
            select.disabled = !!editor;
            select.setAttribute('aria-pressed', String(active));
            const title = document.createElement('span');
            title.className = 'stmt-route-title';
            title.textContent = route.title;
            const body = document.createElement('span');
            body.textContent = route.text;
            select.append(title, body);
            if (route === target.custom) {
                const label = document.createElement('strong');
                label.textContent = '自定义';
                card.append(label);
            }
            const change = iconButton('编辑路线', 'fa-pen', () => edit(route));
            change.classList.add('stmt-route-edit');
            change.disabled = !!editor || (target.pending && route !== target.custom);
            card.append(select, change);
            list.insertBefore(card, list.children[index] ?? null);
            if (route === focusRoute) select.focus({ preventScroll: true });
        }
    }

    function update() {
        syncPrompt();
        render();
    }

    function close() {
        const current = popup;
        endEdit();
        popup = panel = list = null;
        if (current) void current.completeCancelled();
    }

    function reset() {
        close();
        session = newSession();
        delete SillyTavern.getContext().extensionPrompts[promptKey];
    }

    async function open() {
        if (!isCurrent(session)) reset();
        if (popup) return;
        if (!session.chatId) {
            toastr.info('请先打开一个对话。');
            return;
        }
        panel = document.createElement('div');
        panel.className = 'stmt-routes';
        list = document.createElement('div');
        list.className = 'stmt-route-list';
        panel.append(document.createElement('div'), list);
        const current = new context.Popup(panel, context.POPUP_TYPE.TEXT, '', {
            okButton: '关闭', leftAlign: true, allowVerticalScrolling: true,
            onClosing: () => {
                if (!editor) return true;
                toastr.info('请先保存路线，或点「放弃编辑」。', undefined, { preventDuplicates: true });
                return false;
            },
        });
        popup = current;
        update();
        const closed = current.show();
        if (config().autoGenerate && !session.routes.length && !session.custom) void generate();
        try {
            await closed;
        } finally {
            if (popup === current) {
                endEdit();
                popup = panel = list = null;
            }
        }
    }

    const entry = button('对话发展路线', open, 'fa-route');
    entry.className = 'list-group-item stmt-route-entry';
    entry.firstElementChild.classList.add('fa-fw', 'extensionsMenuExtensionButton');
    document.querySelector('#extensionsMenu').append(entry);
    const { eventSource, eventTypes } = context;
    const events = [eventTypes.MESSAGE_SENT, eventTypes.MESSAGE_RECEIVED, eventTypes.MESSAGE_DELETED,
        eventTypes.MESSAGE_SWIPED, eventTypes.GENERATION_AFTER_COMMANDS];
    for (const event of events) eventSource.on(event, update);
    eventSource.on(eventTypes.CHAT_CHANGED, reset);
    settingsChanged = update;
    return () => {
        enabled = false;
        settingsChanged = undefined;
        for (const event of events) eventSource.removeListener(event, update);
        eventSource.removeListener(eventTypes.CHAT_CHANGED, reset);
        entry.remove();
        reset();
    };
}

export const storyRoutes = {
    id: 'story-routes', label: '对话发展路线', start, renderSettings,
    onSettingsChanged() { settingsChanged?.(); },
};
