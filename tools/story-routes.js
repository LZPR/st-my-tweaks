import { extension_prompt_roles, extension_prompt_types, isGenerating } from '../../../../../script.js';

const promptKey = 'st-my-tweaks-story-route';
const defaults = {
    count: 4,
    lifetime: 6,
    generation: '根据当前对话，用对话所用的语言提出几条后续发展路线。每条用一两句话写清从当前情境如何发展，保留用户决定如何回应的空间。不要代写用户台词或行动。让不同路线在事件、关系或节奏上有实质区别，例如顺势推进、深入了解或引入合理的戏剧性转折。',
    guidance: '请结合角色和当前情境，循序渐进地沿以下路线推动对话，为用户留出回应空间。\n{{route}}',
};

function renderSettings(canvas, draft) {
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
    if (!Array.isArray(routes) || !routes.length || routes.some(item => typeof item !== 'string' || !item.trim())) {
        throw new Error('Invalid routes');
    }
    return [...new Set(routes.map(item => item.trim()))].map(text => ({ text }));
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
    let popup, panel, editor;
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
                quietPrompt: generation + '\n推荐提供 ' + count + ' 条。仅输出 JSON 对象，格式为 {"routes":["路线一的内容","路线二的内容"]}。',
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

    function edit(route) {
        const target = session;
        const field = document.createElement('textarea');
        field.className = 'text_pole';
        field.rows = 4;
        field.value = route?.text ?? '';
        field.setAttribute('aria-label', route ? '编辑路线' : '新建自定义路线');
        editor = document.createElement('div');
        const heading = document.createElement('h3');
        heading.textContent = field.getAttribute('aria-label');
        editor.append(heading, field, actions(button('保存路线', () => {
            if (!isCurrent(target)) return;
            const text = field.value.trim();
            if (!text) {
                field.focus();
                toastr.warning('请填写路线内容。');
                return;
            }
            if (route) route.text = text;
            else target.custom = { text };
            editor = null;
            update();
        }, 'fa-check'), button('取消编辑', () => { editor = null; render(); })));
        render();
        field.focus();
    }

    function render(focusRoute) {
        if (!panel) return;
        if (editor) {
            if (editor.parentElement !== panel) panel.replaceChildren(editor);
            return;
        }
        const target = session;
        const heading = document.createElement('h3');
        heading.textContent = '对话发展路线';
        const status = document.createElement('p');
        status.setAttribute('role', 'status');
        status.textContent = target.pending ? '正在根据当前对话生成路线…' : target.notice;
        const refresh = button('换一批', generate, 'fa-rotate');
        refresh.disabled = target.pending;
        const bar = actions(refresh);
        if (!target.custom) bar.append(button('自建路线', () => edit(null), 'fa-plus'));
        const header = document.createElement('div');
        header.className = 'stmt-route-header';
        header.append(heading, bar);
        const list = document.createElement('div');
        list.className = 'stmt-route-list';
        panel.replaceChildren(header, status, list);
        const routes = [...target.routes];
        if (target.custom) routes.unshift(target.custom);
        if (target.selected && !routes.includes(target.selected)) routes.unshift(target.selected);
        for (const route of routes) {
            const active = route === target.selected;
            const card = document.createElement('div');
            card.className = 'st-my-tweaks-route';
            card.classList.toggle('is-selected', active);
            const select = button(route.text, () => {
                if (!isCurrent(target)) return;
                target.selected = active ? null : route;
                target.anchor = SillyTavern.getContext().chat.length - 1;
                syncPrompt();
                render(route);
            });
            select.className = 'stmt-route-select';
            select.setAttribute('aria-pressed', String(active));
            if (route === target.custom) {
                const label = document.createElement('strong');
                label.textContent = '自定义';
                card.append(label);
            }
            const change = iconButton('编辑路线', 'fa-pen', () => edit(route));
            change.classList.add('stmt-route-edit');
            change.disabled = target.pending && route !== target.custom;
            card.append(select, change);
            list.append(card);
            if (route === focusRoute) select.focus({ preventScroll: true });
        }
    }

    function update() {
        syncPrompt();
        render();
    }

    function close() {
        const current = popup;
        popup = panel = editor = null;
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
        const current = new context.Popup(panel, context.POPUP_TYPE.TEXT, '', {
            okButton: '关闭', leftAlign: true, allowVerticalScrolling: true,
        });
        popup = current;
        update();
        const closed = current.show();
        if (!session.routes.length && !session.custom) void generate();
        try {
            await closed;
        } finally {
            if (popup === current) popup = panel = editor = null;
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
