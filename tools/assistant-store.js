import { neutralCharacterName } from '../../../../../script.js';
import { getCurrentUserHandle } from '../../../../user.js';

function openAssistantStore(name) {
    const request = indexedDB.open(name, 1);
    request.onupgradeneeded = () => request.result.createObjectStore('chats', { keyPath: 'id' });
    const ready = new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });

    async function read() {
        const db = await ready;
        return new Promise((resolve, reject) => {
            const store = db.transaction('chats').objectStore('chats');
            const query = store.getAll();
            query.onsuccess = () => resolve(query.result);
            query.onerror = () => reject(query.error);
        });
    }

    // Compare revisions inside the write transaction so another tab cannot overwrite a newer turn.
    async function write(chat) {
        const db = await ready;
        const next = { ...chat, revision: chat.revision + 1, updated: Date.now() };
        return new Promise((resolve, reject) => {
            const tx = db.transaction('chats', 'readwrite');
            const store = tx.objectStore('chats');
            const query = store.get(chat.id);
            tx.onabort = () => reject(tx.error ?? new Error('聊天已在其它标签页更改，请重新打开。'));
            tx.oncomplete = () => resolve(next);
            query.onsuccess = () => {
                if ((query.result?.revision ?? 0) !== chat.revision) return tx.abort();
                store.put(next);
            };
        });
    }
    return { read, write, close: () => ready.then(db => db.close()).catch(() => {}) };
}

// Convert chats saved by the earlier standalone composer on first open.
function nativeMessages(chat) {
    if (chat.native || !chat.messages.length) return chat.messages;
    const messages = [];
    for (const msg of chat.messages) {
        const base = { name: msg.role === 'user' ? 'User' : neutralCharacterName,
            is_user: msg.role === 'user', is_system: false, send_date: chat.updated, mes: msg.content ?? '', extra: {} };
        if (msg.tool_calls) {
            if (msg.content) messages.push(base);
            const invocations = msg.tool_calls.map(call => ({
                id: call.id, name: call.function.name, parameters: call.function.arguments,
                result: chat.messages.find(result => result.tool_call_id === call.id)?.content ?? '',
            }));
            messages.push({ ...base, name: 'System', is_system: true, mes: '角色描述', extra: { tool_invocations: invocations } });
        } else if (msg.role !== 'tool') messages.push(base);
    }
    return messages;
}


export async function migrateAssistantChats(context, card) {
    const name = 'st-my-tweaks-assistant-' + getCurrentUserHandle();
    if (indexedDB.databases && !(await indexedDB.databases()).some(db => db.name === name)) return;
    const store = openAssistantStore(name);
    try {
        for (const record of await store.read()) {
            if (record.migrated) continue;
            // Stable names and a header marker make retries after an interrupted migration safe.
            const label = String(record.title || '助手聊天').replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').slice(0, 55);
            const file = label + ' - ' + record.id;
            const request = async (action, data) => {
                const response = await fetch('/api/chats/' + action, {
                    method: 'POST', headers: context.getRequestHeaders(),
                    body: JSON.stringify({ avatar_url: card.avatar, file_name: file, ...data }),
                });
                if (!response.ok) throw new Error('旧助手聊天迁移失败，请重新打开助手重试。');
                return response;
            };
            const existing = await (await request('get', {})).json();
            if (!Array.isArray(existing)) throw new Error('无法读取助手聊天文件。');
            if (!existing.length) {
                const chat_metadata = { ...record.metadata, stmtAssistantId: record.id, integrity: record.id };
                await request('save', { ch_name: card.name, chat: [{ chat_metadata, user_name: 'unused', character_name: 'unused' }, ...nativeMessages(record)] });
            } else if (existing[0]?.chat_metadata?.stmtAssistantId !== record.id) {
                throw new Error('同名聊天文件已存在，请在 ST 中改名后重试迁移。');
            }
            await store.write({ ...record, migrated: true });
        }
    } finally {
        await store.close();
    }
}
