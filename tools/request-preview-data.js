import { getBiasStrings, getMaxPromptTokens, isGenerating, parseMesExamples, removeMacros, baseChatReplace, extension_prompt_types, getExtensionPromptRoleByName } from '../../../../../script.js';
import { createGenerationParameters, getChatCompletionModel, prepareOpenAIMessages, setOpenAIMessageExamples, setOpenAIMessages, promptManager } from '../../../../openai.js';
import { getFileAttachment } from '../../../../chats.js';
import { getRegexedString, regex_placement } from '../../../../extensions/regex/engine.js';
import { getWorldInfoPrompt, wi_anchor_position, world_info_include_names } from '../../../../world-info.js';
import { MEDIA_DISPLAY, MEDIA_TYPE, inject_ids, IGNORE_SYMBOL } from '../../../../constants.js';
import { extractTextFromHTML, extractTextFromMarkdown, getBase64Async, getCharaFilename } from '../../../../utils.js';
import { ToolManager } from '../../../../tool-calling.js';
import { PromptReasoning } from '../../../../reasoning.js';
import { NOTE_MODULE_NAME } from '../../../../authors-note.js';
import { persona_description_positions } from '../../../../personas.js';

// The host reads depth injections from its registry even when given a separate
// extensionPrompts object. Restore only entries still owned by this preview.
function previewInjections(context, fields, wi, userMessageCount) {
    const registry = context.extensionPrompts;
    const before = new Map();
    const installed = new Map();
    function put(key, value, position, depth, role) {
        if (!before.has(key)) before.set(key, registry[key]);
        context.setExtensionPrompt(key, value, position, depth, false, role);
        installed.set(key, registry[key]);
    }
    const { IN_CHAT, NONE } = extension_prompt_types;
    for (const key of Object.keys(registry)) {
        if (key.startsWith(inject_ids.CUSTOM_WI_DEPTH) || key.startsWith(inject_ids.CUSTOM_WI_OUTLET(''))) put(key, '', NONE, 0);
    }
    for (const entry of wi.worldInfoDepth) put(inject_ids.CUSTOM_WI_DEPTH_ROLE(entry.depth, entry.role), entry.entries.join('\n'), IN_CHAT, entry.depth, entry.role);
    for (const [key, entries] of Object.entries(wi.outletEntries ?? {})) put(inject_ids.CUSTOM_WI_OUTLET(key), entries.join('\n'), NONE, 0);
    const depth = context.characters[context.characterId]?.data?.extensions?.depth_prompt;
    put(inject_ids.DEPTH_PROMPT, fields.charDepthPrompt || '', IN_CHAT, depth?.depth ?? 4, getExtensionPromptRoleByName(depth?.role));
    const user = context.powerUserSettings;
    if (user.persona_description_position === persona_description_positions.AT_DEPTH) {
        put('PERSONA_DESCRIPTION', fields.persona, IN_CHAT, user.persona_description_depth, user.persona_description_role);
    } else if (registry.PERSONA_DESCRIPTION) {
        put('PERSONA_DESCRIPTION', '', NONE, 0);
    }
    const meta = context.chatMetadata;
    const interval = Number(meta.note_interval);
    const withNote = interval === 1 || (interval > 0 && userMessageCount > 0 && userMessageCount % interval === 0);
    let note = '';
    if (withNote) {
        note = document.querySelector('#extension_floating_prompt')?.value ?? meta.note_prompt ?? '';
        const characterNote = context.extensionSettings.note?.chara?.find(item => item.name === getCharaFilename());
        if (characterNote?.useChara) {
            if (characterNote.position === 1) note = characterNote.prompt + '\n' + note;
            else if (characterNote.position === 2) note += '\n' + characterNote.prompt;
            else note = characterNote.prompt;
        }
        note = [...(wi.anBefore ?? []), note, ...(wi.anAfter ?? [])].filter(Boolean).join('\n');
        if (fields.persona && user.persona_description_position === persona_description_positions.TOP_AN) note = fields.persona + '\n' + note;
        if (fields.persona && user.persona_description_position === persona_description_positions.BOTTOM_AN) note += '\n' + fields.persona;
    }
    put(NOTE_MODULE_NAME, note, meta.note_position, meta.note_depth, meta.note_role);
    return () => {
        for (const [key, value] of before) {
            if (registry[key] !== installed.get(key)) continue;
            if (value === undefined) delete registry[key];
            else registry[key] = value;
        }
    };
}

async function readComposerMessage(context, text, files) {
    const { messageBias } = getBiasStrings(text, 'normal');
    const mes = context.substituteParams(getRegexedString(text, regex_placement.USER_INPUT));
    const message = { name: context.name1, mes: messageBias ? removeMacros(mes) : mes, is_user: true, extra: {} };
    for (const file of files) {
        const type = MEDIA_TYPE.getFromMime(file.type);
        if (type) {
            const media = message.extra.media ??= [];
            media.push({ type, url: await getBase64Async(file), title: file.name });
            message.extra.media_index = media.length - 1;
            message.extra.inline_image = true;
        } else if (file.type.startsWith('text/') || /\.(txt|md|json|csv|log)$/i.test(file.name)) {
            let text;
            if (file.type === 'text/markdown') text = await extractTextFromMarkdown(file);
            else if (file.type === 'text/html') text = await extractTextFromHTML(file);
            else text = await file.text();
            (message.extra.files ??= []).push({ name: file.name, text });
        } else {
            throw new Error('该附件需要在发送时转换，暂时无法预览。');
        }
    }
    return message;
}

// ST prepends non-empty files, separated by two newlines. Keep each boundary
// while reading the same file contents once, including for archived messages.
async function textAttachments(message) {
    const files = [];
    for (const file of message.extra?.files ?? []) {
        const text = file.text || (file.url ? await getFileAttachment(file.url) : '');
        files.push({ type: 'text', name: file.name || '文本附件', text: text || '' });
    }
    return files;
}

function locateAttachments(message, source, files) {
    const parts = Array.isArray(message.content) ? message.content : [{ type: 'text', text: message.content }];
    const nonempty = files.filter(file => file.text.replaceAll('\r', ''));
    const prefix = nonempty.map(file => file.text.replaceAll('\r', '')).join('\n\n');
    const media = source?.mediaDisplay === MEDIA_DISPLAY.GALLERY
        ? [source.media?.[source.mediaIndex]].filter(Boolean) : source?.media ?? [];
    const located = [];
    let foundText = false;
    for (const [part, block] of parts.entries()) {
        if (block?.type === 'text' && typeof block.text === 'string' && prefix && !foundText) {
            let offset = block.text.indexOf(prefix);
            // Repeated text can also appear in the author's prose. Use the original
            // assembly position if the complete projected content survived.
            if (offset < 0) continue;
            if (block.text.indexOf(prefix, offset + 1) >= 0) {
                const original = block.text.indexOf(source?.content);
                if (original < 0 || block.text.indexOf(source.content, original + 1) >= 0) continue;
                offset = original + source.content.indexOf(prefix);
            }
            for (const file of nonempty) {
                const end = offset + file.text.replaceAll('\r', '').length;
                located.push({ part, start: offset, end, file });
                offset = end + 2;
            }
            foundText = true;
        } else if (['image_url', 'audio_url', 'video_url'].includes(block?.type)) {
            const type = block.type.split('_')[0];
            const url = block[block.type]?.url ?? block[block.type];
            const candidates = media.filter(item => (item.type || 'image') === type);
            const siblings = parts.filter(item => item?.type === block.type);
            const file = siblings.length === candidates.length ? candidates[siblings.indexOf(block)]
                : candidates.find(item => item.url === url);
            located.push({ part, type, url, file });
        }
    }
    return located;
}

export async function buildRequestPreview(context, signal) {
    if (isGenerating()) throw new Error('请等待当前生成结束后再预览。');
    if (context.mainApi !== 'openai') throw new Error('当前工具支持聊天补全连接，请先切换连接类型。');
    if (context.groupId) throw new Error('群聊会在发送时选择发言角色，暂时无法预览。');
    if (context.characterId == null) throw new Error('请先打开一个角色聊天。');
    const text = document.querySelector('#send_textarea').value;
    if (text.trimStart().startsWith('/')) throw new Error('输入框中是斜杠命令，执行前无法确定请求。');

    const files = Array.from(document.querySelector('#file_form_input')?.files ?? []);
    const settings = context.chatCompletionSettings;
    const last = context.chat.at(-1);
    const continuing = !text && !files.length && context.powerUserSettings.continue_on_send && last && !last.is_user && !last.is_system;
    const type = continuing ? 'continue' : 'normal';
    const draft = text || (!continuing && !files.length && settings.send_if_empty?.trim()) || '';
    const canUseTools = ToolManager.isToolCallingSupported();
    const chat = context.chat.filter(m => !m.is_system || (canUseTools && Array.isArray(m.extra?.tool_invocations))).map(m => {
        const clone = structuredClone(m);
        if (m.extra?.[IGNORE_SYMBOL]) clone.extra[IGNORE_SYMBOL] = true;
        return clone;
    });
    if (chat.length) chat[0].mes = context.substituteParams(chat[0].mes);
    const current = draft || files.length ? await readComposerMessage(context, draft, files) : null;
    if (current && (current.mes || files.length)) chat.push(current);
    const reasoning = new PromptReasoning();
    const filesByChat = new Map();
    for (let i = chat.length - 1; i >= 0; i--) {
        const message = chat[i];
        const options = { isPrompt: true, depth: chat.length - i - (continuing ? 2 : 1) };
        const placement = message.is_user ? regex_placement.USER_INPUT : regex_placement.AI_OUTPUT;
        let content = getRegexedString(message.mes, placement, options);
        if (message.extra?.files?.length) {
            const attached = await textAttachments(message);
            filesByChat.set(message, attached);
            content = attached.map(file => file.text).filter(Boolean).join('\n\n') + '\n\n' + content;
        }
        const titles = [message.extra, ...(message.extra?.media ?? [])].filter(m => m?.append_title && m.title);
        if (titles.length) content += '\n\n' + titles.map(m => m.title).join('\n\n');
        message.mes = reasoning.addToMessage(content, getRegexedString(message.extra?.reasoning || '', regex_placement.REASONING, options),
            Boolean(continuing && i === chat.length - 1), message.extra?.reasoning_duration);
    }
    signal.throwIfAborted();
    const fields = context.getCharacterCardFields();
    const scan = chat.map(m => world_info_include_names ? m.name + ': ' + m.mes : m.mes).reverse();
    const note = context.extensionPrompts[NOTE_MODULE_NAME];
    const wi = await getWorldInfoPrompt(scan, getMaxPromptTokens(), true, {
        personaDescription: fields.persona, characterDescription: fields.description, characterPersonality: fields.personality,
        characterDepthPrompt: fields.charDepthPrompt, scenario: fields.scenario, creatorNotes: fields.creatorNotes, trigger: type,
    });
    const scannedNote = context.extensionPrompts[NOTE_MODULE_NAME];
    try {
        signal.throwIfAborted();
        const examples = parseMesExamples(fields.mesExamples, false);
        for (const { position, content } of wi.worldInfoExamples) {
            const parts = parseMesExamples(baseChatReplace(content), false);
            if (position === wi_anchor_position.before) examples.unshift(...parts);
            else examples.push(...parts);
        }
        const messages = setOpenAIMessages(chat);
        // setOpenAIMessages returns newest first. The prompt builder subsequently
        // reorders and inserts messages, so retain provenance by object identity.
        const filesBySource = new Map();
        messages.forEach((source, i) => {
            const attached = filesByChat.get(chat[chat.length - 1 - i]);
            if (attached) filesBySource.set(source, attached);
        });
        const draftSource = (text || files.length) && chat.at(-1) === current ? messages[0] : null;
        const restore = previewInjections(context, fields, wi, context.chat.filter(m => m.is_user).length + Number(chat.includes(current)));
        let prompt;
        try {
            [prompt] = await prepareOpenAIMessages({
                name2: context.name2, charDescription: fields.description, charPersonality: fields.personality,
                scenario: fields.scenario, worldInfoBefore: wi.worldInfoBefore, worldInfoAfter: wi.worldInfoAfter,
                extensionPrompts: context.extensionPrompts, bias: getBiasStrings(text, type).promptBias,
                type, quietPrompt: '', cyclePrompt: continuing ? chat.at(-1)?.mes : '',
                systemPromptOverride: fields.system, jailbreakPromptOverride: fields.jailbreak, messages,
                messageExamples: setOpenAIMessageExamples(context.powerUserSettings.strip_examples ? [] : examples),
            }, false);
        } finally {
            restore();
        }
        signal.throwIfAborted();
        if (!prompt?.length) throw new Error('没有生成可预览的消息，请检查角色和上下文预算。');
        const origins = new Map();
        const sources = new Map();
        const records = promptManager.messages.flatten().filter(m => m.content || m.tool_calls);
        records.forEach((record, index) => {
            const match = /^(?:toolCall-)?chatHistory-(\d+)$/.exec(record.identifier);
            const source = match && messages[Number(match[1]) - 1];
            if (source && !source.injected) {
                origins.set(prompt[index], source === draftSource ? 'current' : 'history');
                sources.set(prompt[index], source);
            }
            else if (record.role === 'tool') origins.set(prompt[index], 'history');
        });
        const data = { prompt };
        await context.eventSource.emit(context.eventTypes.GENERATE_AFTER_DATA, data, true);
        const { generate_data: body } = await createGenerationParameters(settings, getChatCompletionModel(settings), type, data.prompt);
        signal.throwIfAborted();
        await context.eventSource.emit(context.eventTypes.CHAT_COMPLETION_SETTINGS_READY, body);
        const kinds = body.messages.map(message => origins.get(message));
        const historyIndices = kinds.flatMap((kind, i) => kind === 'history' ? [i] : []);
        const attachments = body.messages.map(message => {
            const source = sources.get(message);
            return locateAttachments(message, source, filesBySource.get(source) ?? []);
        });
        const located = new Set(attachments.flat().map(item => item.file));
        const unlocated = [...(filesByChat.get(current) ?? []), ...(current?.extra.media ?? [])].filter(file => !located.has(file));
        return { body: JSON.parse(JSON.stringify(body)), currentIndex: kinds.indexOf('current'), historyIndices,
            hasDraft: Boolean(text || files.length), attachments, unlocated };
    } finally {
        if (note && scannedNote !== note && context.extensionPrompts[NOTE_MODULE_NAME] === scannedNote) context.extensionPrompts[NOTE_MODULE_NAME] = note;
    }
}
