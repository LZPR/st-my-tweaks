// ST keeps attachment metadata in chat history. A filename marker survives the
// initial save, which happens before MESSAGE_SENT. Mark the uploaded record too
// so later edits to its display title do not change its lifetime.
const singleUseName = /^姿态-仅本次-[0-9a-f]{32}\.(?:png|txt)$/i;

export function poseFileStem(currentOnly) {
    if (!currentOnly) return '姿态-' + Date.now();
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    return '姿态-仅本次-' + Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}

function temporary(item) {
    return item?.stmtPoseCurrentOnly === true || singleUseName.test(item?.name ?? item?.title ?? '');
}

// Receives a prompt copy. Never modify arrays or records shared with the chat.
export function omitPastPose(message) {
    const extra = message.extra;
    if (!message.is_user || !extra) return;
    const files = extra.files ?? [];
    const media = extra.media ?? [];
    if (!files.some(temporary) && !media.some(temporary)) return;
    const copy = { ...extra };
    if (files.some(temporary)) {
        copy.files = files.filter(item => !temporary(item));
        delete copy.fileLength;
    }
    if (media.some(temporary)) {
        copy.media = media.filter(item => !temporary(item));
        const index = copy.media.indexOf(media[extra.media_index]);
        copy.media_index = index < 0 ? Math.max(0, copy.media.length - 1) : index;
    }
    message.extra = copy;
}

export function initPoseContext(context) {
    let fresh;
    const clear = () => { fresh = undefined; };
    context.eventSource.on(context.eventTypes.CHAT_CHANGED, clear);
    context.eventSource.on(context.eventTypes.GENERATION_ENDED, clear);
    context.eventSource.on(context.eventTypes.MESSAGE_SENT, index => {
        clear();
        const extra = context.chat[index]?.extra;
        for (const item of [...(extra?.files ?? []), ...(extra?.media ?? [])]) {
            if (temporary(item)) {
                item.stmtPoseCurrentOnly = true;
                fresh = extra;
            }
        }
    });

    // Native generation interceptors receive the prompt copies after ST has
    // prepended file contents and before world info or any backend sees them.
    globalThis.stMyTweaksPoseContext = async (messages, _size, abort) => {
        const allowed = fresh;
        clear();
        try {
            for (const message of messages) {
                const original = message.extra;
                if (original === allowed) continue;
                omitPastPose(message);
                if (original === message.extra) continue;
                if (original.media?.some(item => temporary(item) && item.append_title && item.title)) {
                    const titles = extra => [extra, ...extra.media].filter(item => item?.append_title && item.title)
                        .map(item => item.title);
                    const suffix = '\n\n' + titles(original).join('\n\n');
                    if (!message.mes.endsWith(suffix)) throw new Error('无法分离姿态图片标题');
                    const kept = titles(message.extra);
                    message.mes = message.mes.slice(0, -suffix.length) + (kept.length ? '\n\n' + kept.join('\n\n') : '');
                }
                if (original.files === message.extra.files) continue;
                const { getFileAttachment } = await import('../../../../chats.js');
                const texts = await Promise.all(original.files.map(file => file.text || getFileAttachment(file.url)));
                const prefix = texts.filter(Boolean).join('\n\n') + '\n\n';
                const offset = message.mes.indexOf(prefix);
                if (offset < 0 || prefix.length !== original.fileLength) {
                    throw new Error('无法分离本次姿态与其他附件');
                }
                const kept = texts.filter((text, i) => text && !temporary(original.files[i]));
                const replacement = kept.length ? kept.join('\n\n') + '\n\n' : '';
                message.mes = message.mes.slice(0, offset) + replacement + message.mes.slice(offset + prefix.length);
                message.extra.fileLength = replacement.length;
            }
        } catch {
            toastr.error('未能从历史消息中分离仅本次使用的姿态附件，本次生成已停止。');
            abort(true);
        }
    };
}
