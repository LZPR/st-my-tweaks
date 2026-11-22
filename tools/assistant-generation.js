import { promptManager, settingsToUpdate } from '../../../../openai.js';
import { ToolManager } from '../../../../tool-calling.js';
import { uuidv4 } from '../../../../utils.js';

export const descriptionTool = {
    type: 'function',
    function: {
        name: 'stmt_character_description',
        description: 'Read or replace a SillyTavern character description. Omit character for the currently selected solo character. For a named character, use its exact name or avatar filename. Omit description to read. Supply the full replacement text to write.',
        parameters: { type: 'object', properties: {
            character: { type: 'string', description: 'Exact character name or avatar filename' },
            description: { type: 'string', description: 'Full new description, only for a requested edit' },
        }, additionalProperties: false },
    },
};

export async function characterDescription(args, avatar, signal) {
    const live = SillyTavern.getContext();
    const cards = live.characters.filter(Boolean);
    const matches = args.character === undefined
        ? cards.filter(c => c.avatar === avatar)
        : cards.filter(c => c.avatar === args.character || c.name === args.character);
    if (matches.length !== 1) throw new Error(matches.length ? '角色重名，请指定头像文件名。' : '没有找到角色，请指定角色名。');
    const card = matches[0];
    const request = async (route, fields) => {
        const response = await fetch('/api/characters/' + route, {
            method: 'POST', headers: live.getRequestHeaders(), signal,
            body: JSON.stringify({ avatar_url: card.avatar, ...fields }),
        });
        if (!response.ok) throw new Error('角色卡请求失败（' + response.status + '）。');
        return response;
    };
    const current = await (await request('get', {})).json();
    const before = current.data?.description ?? current.description ?? '';
    if (!Object.hasOwn(args, 'description')) return { name: current.name, description: before };
    if (typeof args.description !== 'string') throw new Error('角色描述必须为文本。');
    const editor = document.querySelector('#description_textarea');
    const editing = () => editor && document.querySelector('#avatar_url_pole')?.value === card.avatar;
    if (editing() && editor.value !== before) throw new Error('编辑框中有尚未保存的角色描述。');
    await request('edit-attribute', { ch_name: current.name, field: 'description', value: args.description });
    card.description = args.description;
    if (card.data) card.data.description = args.description;
    if (editing() && editor.value === before) editor.value = args.description;
    return { name: current.name, saved: true };
}


// ST reads the same settings object in prompt assembly, streaming and tool recursion.
// Keep its identity, and serialize the ordinary settings even if ST saves mid-turn.
export function applyAssistantPreset(context, config, isAssistant) {
    const settings = context.chatCompletionSettings;
    const overrides = {};
    if (config.preset) {
        const preset = context.getPresetManager('openai').getCompletionPresetByName(config.preset);
        if (!preset) throw new Error('助手预设已不存在，请重新选择。');
        for (const [key, value] of Object.entries(preset)) {
            const field = settingsToUpdate[key]?.[1];
            if (field) overrides[field] = structuredClone(value);
        }
    }
    const prompts = structuredClone(overrides.prompts ?? settings.prompts);
    for (const prompt of prompts) {
        if (['main', 'jailbreak'].includes(prompt.identifier)) prompt.forbid_overrides = true;
    }
    const characterId = promptManager.configuration.promptOrder.dummyId;
    const presetOrder = overrides.prompt_order?.find(list => String(list.character_id) === String(characterId))?.order;
    const order = structuredClone(presetOrder ?? promptManager.getPromptOrderForCharacter({ id: characterId }));
    // ST can append built-in markers even when a preset omits them from its order.
    for (const identifier of ['worldInfoBefore', 'worldInfoAfter', 'charDescription', 'charPersonality',
        'scenario', 'personaDescription', 'dialogueExamples', 'bias']) {
        const entry = order.find(item => item.identifier === identifier);
        if (entry) entry.enabled = false;
        else order.push({ identifier, enabled: false });
    }
    if (config.prompt.trim() && config.promptMode === 'replace') {
        const main = prompts.find(prompt => prompt.identifier === 'main');
        if (main) main.content = config.prompt;
        else prompts.push({ identifier: 'main', name: 'Main Prompt', role: 'system', content: config.prompt, system_prompt: true, forbid_overrides: true });
        const entry = order.find(item => item.identifier === 'main');
        if (entry) entry.enabled = true;
        else order.unshift({ identifier: 'main', enabled: true });
    } else if (config.prompt.trim() && ['top', 'bottom'].includes(config.promptMode)) {
        const identifier = prompts.some(p => p.identifier === 'stmtAssistantDescription') ? uuidv4() : 'stmtAssistantDescription';
        prompts.push({ identifier, name: '助手角色描述', role: 'system', content: config.prompt, system_prompt: false });
        const entry = { identifier, enabled: true };
        if (config.promptMode === 'top') order.unshift(entry);
        else order.push(entry);
    }
    Object.assign(overrides, {
        function_calling: config.description, n: 1,
        custom_include_body: '', custom_exclude_body: '', custom_prompt_post_processing: '',
        new_chat_prompt: '', send_if_empty: '', assistant_prefill: '', squash_system_messages: false,
        prompts, prompt_order: [{ character_id: characterId, order }],
    });
    const ordinary = new Map();
    for (const [key, value] of Object.entries(overrides)) {
        ordinary.set(key, settings[key]);
        Object.defineProperty(settings, key, {
            enumerable: true, configurable: true,
            get: () => isAssistant() ? value : ordinary.get(key),
            set: updated => ordinary.set(key, updated),
        });
    }
    Object.defineProperty(settings, 'toJSON', {
        configurable: true, value: () => ({ ...settings, ...Object.fromEntries(ordinary) }),
    });
    // ST dispatches by registered name even when a provider returns an unadvertised call.
    const invoke = ToolManager.invokeFunctionTool;
    const scopedInvoke = function (name, args) {
        if (isAssistant() && (!config.description || name !== descriptionTool.function.name)) {
            return Promise.resolve(new Error('此工具未在助手聊天中启用。'));
        }
        return invoke.call(this, name, args);
    };
    ToolManager.invokeFunctionTool = scopedInvoke;
    return () => {
        if (ToolManager.invokeFunctionTool === scopedInvoke) ToolManager.invokeFunctionTool = invoke;
        delete settings.toJSON;
        for (const [key, value] of ordinary) {
            Object.defineProperty(settings, key, { value, writable: true, configurable: true, enumerable: true });
        }
        promptManager.render(false);
    };
}
