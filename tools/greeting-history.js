export function greetingBatchSize(config) {
    const size = config.greetingBatchSize;
    return Number.isInteger(size) && size >= 1 && size <= 50 ? size : 8;
}

// Keep only the opening text. The chat API returns the header followed by messages.
export function createGreetingHistory(request, character, excludedChat, batchSize, searching, changed) {
    const entries = [];
    let files, cursor = 0, pending, error = false;

    function state() {
        return { entries, loading: !!pending, error, more: !files || cursor < files.length };
    }

    function pause() {
        pending?.abort();
        pending = undefined;
    }

    async function load() {
        if (pending || !state().more) return;
        const controller = new AbortController();
        const { signal } = controller;
        pending = controller;
        error = false;
        changed();
        try {
            if (!files) {
                const list = await request('characters/chats', { avatar_url: character.avatar, simple: true }, signal);
                if (signal.aborted) return;
                files = (Array.isArray(list) ? list : []).map(file => file.file_id ?? file.file_name.replace(/\.jsonl$/i, ''))
                    .filter(id => id && id !== excludedChat).reverse();
            }
            do {
                const end = Math.min(files.length, cursor + batchSize);
                while (cursor < end) {
                    const chunk = files.slice(cursor, Math.min(end, cursor + 3));
                    const openings = await Promise.all(chunk.map(async file => {
                        const data = await request('chats/get', {
                            avatar_url: character.avatar, ch_name: character.name, file_name: file,
                        }, signal);
                        return { file, text: data?.[1]?.mes };
                    }));
                    if (signal.aborted) return;
                    entries.push(...openings.filter(item => typeof item.text === 'string' && item.text.trim()));
                    cursor += chunk.length;
                }
                changed();
            } while (searching() && cursor < files.length && !signal.aborted);
        } catch {
            if (!signal.aborted) error = true;
        } finally {
            if (pending === controller) {
                pending = undefined;
                changed();
            }
        }
    }
    return { state, load, pause };
}
