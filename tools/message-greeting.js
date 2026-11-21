export function greetingCharacter(context, entry) {
    if (context.groupId == null) return context.characters[context.characterId];
    if (entry.is_user || entry.is_system || !entry.original_avatar) return undefined;
    return context.characters.find(character => character.avatar === entry.original_avatar);
}

async function characterRequest(context, route, body) {
    const response = await fetch(`/api/characters/${route}`, {
        method: 'POST', headers: context.getRequestHeaders(), body: JSON.stringify(body),
    });
    if (!response.ok) throw new Error(`Character request failed (${response.status})`);
    return response;
}

function greetingPicker(name, text, first, alternatives) {
    const panel = document.createElement('div');
    const label = document.createElement('label');
    label.textContent = `将这条消息应用到「${name}」的开场白`;
    const select = document.createElement('select');
    select.className = 'text_pole';
    select.add(new Option('新建备选开场白', 'new'));
    select.add(new Option('覆盖主开场白', 'first'));
    alternatives.forEach((greeting, index) => {
        const excerpt = greeting.replace(/\s+/g, ' ').trim().slice(0, 28);
        select.add(new Option(`覆盖备选开场白 ${index + 1} · ${excerpt}`, String(index)));
    });
    const oldText = document.createElement('textarea');
    const newText = document.createElement('textarea');
    for (const [field, title] of [[oldText, '将被覆盖的开场白'], [newText, '将写入的消息']]) {
        field.readOnly = true;
        field.rows = 3;
        field.className = 'text_pole';
        field.setAttribute('aria-label', title);
    }
    newText.value = text;
    oldText.hidden = true;
    select.addEventListener('change', () => {
        oldText.hidden = select.value === 'new';
        oldText.value = select.value === 'first' ? first : alternatives[Number(select.value)] ?? '';
    });
    label.append(select);
    panel.append(label, oldText, newText);
    return { panel, select };
}

export async function applyMessageGreeting(message, isEnabled) {
    const context = SillyTavern.getContext();
    const id = Number(message.getAttribute('mesid'));
    const entry = context.chat[id];
    const text = entry.mes;
    const { avatar, name } = greetingCharacter(context, entry);
    const readCard = async () => (await characterRequest(context, 'get', { avatar_url: avatar })).json();
    const stillCurrent = () => {
        const live = SillyTavern.getContext();
        return isEnabled() && message.isConnected && live.chatId === context.chatId && live.chat[id] === entry
            && entry.mes === text && greetingCharacter(live, entry)?.avatar === avatar;
    };
    const card = await readCard();
    if (!stillCurrent()) return;
    const first = card.first_mes ?? card.data?.first_mes ?? '';
    const alternatives = card.data?.alternate_greetings ?? [];
    const { panel, select } = greetingPicker(name, text, first, alternatives);
    const result = await context.callGenericPopup(panel, context.POPUP_TYPE.CONFIRM, '', {
        okButton: '应用', cancelButton: '取消', leftAlign: true,
    });
    if (result !== context.POPUP_RESULT.AFFIRMATIVE || !stillCurrent()) return;

    const latest = await readCard();
    if (!stillCurrent()) return;
    if (select.value === 'first') {
        const editor = document.querySelector('#firstmessage_textarea');
        const editingCard = () => document.querySelector('#avatar_url_pole')?.value === avatar;
        if ((latest.first_mes ?? latest.data?.first_mes ?? '') !== first
            || (editor && editingCard() && editor.value !== first)) {
            toastr.warning('主开场白已变化，请重新选择。');
            return;
        }
        await characterRequest(context, 'edit-attribute', {
            avatar_url: avatar, ch_name: latest.name, field: 'first_mes', value: text,
        });
        if (editor && editingCard() && editor.value === first) editor.value = text;
        const cached = context.characters.find(character => character.avatar === avatar);
        if (cached) {
            cached.first_mes = text;
            if (cached.data) cached.data.first_mes = text;
        }
    } else {
        const updated = [...(latest.data?.alternate_greetings ?? [])];
        if (select.value === 'new') {
            updated.push(text);
        } else {
            const index = Number(select.value);
            if (updated.length !== alternatives.length || updated[index] !== alternatives[index]) {
                toastr.warning('备选开场白已变化，请重新选择。');
                return;
            }
            updated[index] = text;
        }
        await characterRequest(context, 'merge-attributes', { avatar, data: { alternate_greetings: updated } });
        const cached = context.characters.find(character => character.avatar === avatar);
        if (cached?.data) cached.data.alternate_greetings = updated;
    }
    toastr.success('已保存角色开场白。');
}
