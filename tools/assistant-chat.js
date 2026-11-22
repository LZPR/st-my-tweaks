import { closeCurrentChat, isGenerating, neutralCharacterName, doNewChat, entitiesFilter, getPastCharacterChats, printCharactersDebounced, setCharacterName } from '../../../../../script.js';
import { openGroupById } from '../../../../group-chats.js';
import { uuidv4 } from '../../../../utils.js';
import { applyAssistantPreset, characterDescription, descriptionTool } from './assistant-generation.js';
import { migrateAssistantChats } from './assistant-store.js';

const defaults = { preset: '', prompt: '你是 AI 助手。', promptMode: 'top', menu: true, remember: true, hideCard: true, description: true, reviewWrites: true };
let updateSettings;

function element(tag, text, className) {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = text;
    if (className) node.className = className;
    return node;
}

function button(title, handler, icon) {
    const node = element('button', title, 'menu_button menu_button_icon');
    node.type = 'button';
    if (icon) node.prepend(element('i', '', 'fa-solid fa-fw ' + icon));
    node.onclick = () => Promise.resolve().then(handler).catch(error => toastr.error(error.message));
    return node;
}

function renderSettings(canvas, draft) {
    const config = { ...defaults, ...draft };
    const select = element('select', undefined, 'text_pole');
    select.add(new Option('使用当前 AI 响应配置', ''));
    for (const option of document.querySelectorAll('#settings_preset_openai option')) {
        select.add(new Option(option.text, option.text));
    }
    if (config.preset && !Array.from(select.options).some(o => o.value === config.preset)) {
        select.add(new Option(config.preset + '（已移除）', config.preset));
    }
    select.value = config.preset;
    select.onchange = () => { draft.preset = select.value; };
    const preset = element('label', '聊天补全预设');
    preset.append(select);
    const prompt = element('textarea', undefined, 'text_pole');
    prompt.rows = 4;
    prompt.value = config.prompt;
    prompt.oninput = () => { draft.prompt = prompt.value; };
    const label = element('label', '助手角色描述');
    label.append(prompt);
    const mode = element('select', undefined, 'text_pole');
    for (const [value, text] of [
        ['replace', '替换 Main Prompt'], ['top', '插入到预设顶部'],
        ['bottom', '插入到预设底部'], ['none', '不注入'],
    ]) mode.add(new Option(text, value));
    mode.value = config.promptMode;
    mode.onchange = () => { draft.promptMode = mode.value; };
    const placement = element('label', '助手角色描述注入方式');
    placement.append(mode);
    canvas.append(preset, label, placement);
    for (const [key, title] of [
        ['menu', '在扩展菜单显示「管理助手聊天」'],
        ['remember', '记住上次聊天（当前页面）'],
        ['hideCard', '隐藏助手角色卡'],
        ['description', '角色描述（读取和修改）'],
        ['reviewWrites', '写入前手动审查'],
    ]) {
        if (key === 'description') canvas.append(element('h4', '工具管理'));
        const check = element('input');
        check.type = 'checkbox';
        check.checked = config[key];
        check.onchange = () => { draft[key] = check.checked; };
        const row = element('label', undefined, 'checkbox_label');
        row.append(check, title);
        canvas.append(row);
    }
}

const ownerKey = 'stmtAssistantOwner';
const avatarPrefix = 'st-my-tweaks-assistant-';
const ownsCard = card => card?.data?.extensions?.[ownerKey] === true;

async function ensureAssistantCard(context) {
    // Refresh inside the lock so a second tab sees a card created by the first one.
    await context.getCharacters();
    const cards = context.characters;
    const knownAvatar = context.accountStorage.getItem(ownerKey);
    const candidates = [...cards.keys()].sort((a, b) => Number(cards[b].avatar === knownAvatar) - Number(cards[a].avatar === knownAvatar));
    for (const index of candidates) {
        const card = cards[index];
        if (card.shallow && (card.avatar === knownAvatar || card.avatar.startsWith(avatarPrefix))) {
            await context.unshallowCharacter(String(index));
        }
        if (ownsCard(cards[index])) return cards[index];
    }
    const response = await fetch('/api/characters/create', {
        method: 'POST', headers: context.getRequestHeaders(),
        body: JSON.stringify({ ch_name: '助手', file_name: avatarPrefix + uuidv4(),
            json_data: JSON.stringify({ data: { extensions: { [ownerKey]: true } } }) }),
    });
    if (!response.ok) throw new Error('创建助手聊天归档失败。');
    const avatar = await response.text();
    await context.getCharacters();
    const index = cards.findIndex(card => card.avatar === avatar);
    if (index >= 0) await context.unshallowCharacter(String(index));
    if (!ownsCard(cards[index])) throw new Error('未找到助手专用角色卡。');
    return cards[index];
}

function start(context, getConfig) {
    const config = () => ({ ...defaults, ...getConfig() });
    const live = () => SillyTavern.getContext();
    const ready = new Promise(resolve => context.eventSource.once(context.eventTypes.APP_READY, resolve));
    const drafts = new Map();
    const input = document.querySelector('#send_textarea');
    let owner, lastChat, previous, restorePreset, navigating = false;
    const active = () => {
        const c = live();
        return c.groupId == null && ownsCard(c.characters[c.characterId]);
    };
    const toggle = button('助手聊天', () => navigate(() => active() ? leave() : enter()), 'fa-robot');
    const manager = button('管理助手聊天', () => navigate(async () => {
        if (!active()) await enter(true);
        if (active()) document.querySelector('#option_select_chat').click();
    }), 'fa-folder-open');
    for (const node of [toggle, manager]) {
        node.className = 'list-group-item stmt-route-entry';
        node.firstChild.classList.add('extensionsMenuExtensionButton');
        document.querySelector('#extensionsMenu').append(node);
    }
    function refreshControls() {
        manager.style.display = config().menu ? '' : 'none';
        toggle.lastChild.textContent = active() ? '返回上一个聊天' : '助手聊天';
    }
    function setDraft(value) {
        input.value = value ?? '';
        input.dispatchEvent(new Event('input', { bubbles: true }));
    }
    async function navigate(action) {
        if (navigating) return;
        if (isGenerating()) {
            toastr.info('请先停止当前回复，再切换聊天。');
            return;
        }
        navigating = true;
        try { await action(); } finally { navigating = false; refreshControls(); }
    }
    function releasePreset() {
        restorePreset?.();
        restorePreset = null;
    }
    function location() {
        const c = live();
        const avatar = c.characters[c.characterId]?.avatar;
        const neutral = !avatar && c.groupId == null;
        return { avatar, group: c.groupId, id: c.chatId, draft: input.value, name: c.name2,
            messages: neutral ? structuredClone(c.chat) : null, metadata: neutral ? structuredClone(c.chatMetadata) : null };
    }
    async function enter(managing = false) {
        await ready;
        if (!managing && live().mainApi !== 'openai') throw new Error('请先在 ST 选择聊天补全连接。');
        const { preset, remember } = config();
        if (!managing && preset && !live().getPresetManager('openai').getCompletionPresetByName(preset)) {
            throw new Error('助手预设已不存在，请重新选择。');
        }
        const back = location();
        const wanted = remember ? lastChat : null;
        if (back.avatar || back.group) await live().saveChat();
        if (!owner || !context.characters.some(card => card.avatar === owner && ownsCard(card))) {
            const prepare = async () => {
                const card = await ensureAssistantCard(live());
                context.accountStorage.setItem(ownerKey, card.avatar);
                await migrateAssistantChats(live(), card);
                owner = card.avatar;
                printCharactersDebounced();
            };
            if (navigator.locks) await navigator.locks.request(ownerKey, prepare);
            else await prepare();
        }
        const index = context.characters.findIndex(card => card.avatar === owner);
        const files = await getPastCharacterChats(index);
        previous = back;
        await context.selectCharacterById(index);
        if (!active()) throw new Error('无法切换到助手聊天。');
        if (!managing) {
            if (wanted && files.some(file => file.file_name === wanted + '.jsonl')) {
                if (live().chatId !== wanted) await context.openCharacterChat(wanted);
            } else if (files.length) await doNewChat();
        }
        lastChat = remember ? live().chatId : null;
        setDraft(drafts.get(live().chatId));
        input.focus();
    }
    async function leave() {
        if (!active()) return;
        drafts.set(live().chatId, input.value);
        await live().saveChat();
        const back = previous;
        if (!await closeCurrentChat()) return;
        previous = null;
        releasePreset();
        const c = live();
        if (back?.group != null) {
            await openGroupById(back.group);
            if (live().groupId === back.group && live().chatId !== back.id) await c.openGroupChat(back.group, back.id);
        } else if (back?.avatar) {
            const index = c.characters.findIndex(card => card.avatar === back.avatar);
            if (index >= 0) {
                await c.selectCharacterById(index);
                if (live().characterId == index && live().chatId !== back.id) await c.openCharacterChat(back.id);
            }
        } else if (back?.name === neutralCharacterName) {
            await c.clearChat({ clearData: true });
            setCharacterName(back.name);
            c.updateChatMetadata(back.metadata, true);
            for (const message of back.messages) c.chat.push(message);
            await c.printMessages();
        }
        setDraft(back?.draft);
    }
    const hooks = [];
    const on = (event, callback) => {
        context.eventSource.makeLast(event, callback);
        hooks.push([event, callback]);
    };
    const events = context.eventTypes;
    const toolCalls = new Set();
    const cancelToolCalls = () => { for (const call of toolCalls) call.abort(); };
    on(events.GENERATION_STOPPED, cancelToolCalls);
    on(events.CHAT_CHANGED, () => {
        cancelToolCalls();
        if (active()) {
            if (config().remember) lastChat = live().chatId;
            if (config().hideCard) document.querySelector('#rm_button_characters')?.click();
        }
        if (!active()) {
            releasePreset();
            if (!navigating) previous = null;
        }
        if (!navigating) refreshControls();
    });
    on(events.GENERATION_AFTER_COMMANDS, (_type, _params, dryRun) => {
        if (!active() || dryRun || restorePreset) return;
        try {
            if (live().mainApi !== 'openai') throw new Error('助手需要聊天补全连接。');
            restorePreset = applyAssistantPreset(live(), config(), active);
        } catch (error) {
            context.stopGeneration();
            toastr.error(error.message);
        }
    });
    on(events.GENERATE_AFTER_COMBINE_PROMPTS, () => {
        if (!active()) return;
        const prompts = live().extensionPrompts;
        for (const key of Object.keys(prompts)) delete prompts[key];
    });
    on(events.CHAT_COMPLETION_SETTINGS_READY, payload => {
        if (!active()) return;
        const allowed = config().description && payload.tools?.filter(t => t.function.name === descriptionTool.function.name);
        if (allowed?.length) payload.tools = allowed;
        else { delete payload.tools; delete payload.tool_choice; }
        delete payload.stop;
    });
    on(events.GENERATION_ENDED, releasePreset);
    context.registerFunctionTool({
        ...descriptionTool.function, displayName: '角色描述',
        shouldRegister: () => active() && config().description,
        action: async args => {
            if (!active() || !config().description) throw new Error('助手角色描述工具未启用。');
            const call = new AbortController();
            toolCalls.add(call);
            try {
                return await characterDescription(args, previous?.group == null ? previous?.avatar : undefined, call.signal, config().reviewWrites);
            } finally {
                toolCalls.delete(call);
            }
        },
    });
    updateSettings = () => {
        if (!config().description) cancelToolCalls();
        if (!config().remember) lastChat = null;
        refreshControls();
        printCharactersDebounced();
    };
    entitiesFilter.filterFunctions[ownerKey] = entities => {
        if (!config().hideCard) return entities;
        const knownAvatar = context.accountStorage.getItem(ownerKey);
        return entities.filter(({ type, item }) => type !== 'character'
            || !(ownsCard(item) || (item.shallow && item.avatar === knownAvatar)));
    };
    printCharactersDebounced();
    refreshControls();
    return async () => {
        if (navigating || (active() && isGenerating())) throw new Error('请在切换聊天或生成回复结束后关闭助手。');
        await navigate(() => leave());
        cancelToolCalls();
        releasePreset();
        for (const [event, callback] of hooks) context.eventSource.removeListener(event, callback);
        context.unregisterFunctionTool(descriptionTool.function.name);
        delete entitiesFilter.filterFunctions[ownerKey];
        printCharactersDebounced();
        toggle.remove();
        manager.remove();
        updateSettings = null;
    };
}
export const assistantChat = {
    id: 'assistant-chat', label: '助手聊天', start, renderSettings,
    onSettingsChanged: () => updateSettings?.(),
};
