import { user_avatar } from '../../../../personas.js';
import { create_save } from '../../../../../script.js';
import {
    editorSelector, editorsChanged, getToolbar, isEnabled, locateEditor, renderLocations,
    promptManagerEditorSelector, quickPromptSelector, responsePresetSelectors,
} from './prompt-toolbar.js';

let refreshTool;

function renderSettings(canvas, config) {
    renderLocations(canvas, config);
    canvas.append(document.createElement('hr'));
    for (const [key, text] of [
        ['deleteOnApply', '应用后删除该草稿'],
        ['reverse', '反转操作（单击管理，长按保存）'],
    ]) {
        const label = document.createElement('label');
        label.className = 'checkbox_label';
        const input = document.createElement('input');
        input.type = 'checkbox';
        input.checked = config[key] === true;
        input.onchange = () => { config[key] = input.checked; };
        label.append(input, text);
        canvas.append(label);
    }
}

function icon(name) {
    const glyph = document.createElement('i');
    glyph.className = 'fa-solid ' + name;
    glyph.setAttribute('aria-hidden', 'true');
    return glyph;
}

function makeButton(label, glyph, variant, action) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'menu_button stmt-draft-' + variant;
    button.append(icon(glyph), label);
    button.onclick = action;
    return button;
}

function openManager(context, drafts, apply, remove) {
    const panel = document.createElement('div');
    panel.className = 'stmt-draft-manager';
    const heading = document.createElement('h3');
    heading.append(icon('fa-layer-group'), '草稿管理');
    const list = document.createElement('div');
    panel.append(heading, list);
    const popup = new context.Popup(panel, context.POPUP_TYPE.TEXT, '', {
        okButton: '关闭', leftAlign: true, allowVerticalScrolling: true,
    });
    popup.okButton.prepend(icon('fa-xmark'), ' ');

    function showEmpty() {
        list.textContent = '当前编辑框还没有草稿。';
    }
    if (!drafts.length) showEmpty();
    for (const draft of drafts) {
        const row = document.createElement('details');
        row.name = 'stmt-prompt-drafts';
        const summary = document.createElement('summary');
        const time = document.createElement('time');
        time.dateTime = draft.date.toISOString();
        time.append(icon('fa-clock'), draft.date.toLocaleTimeString());
        const snippet = document.createElement('span');
        snippet.className = 'stmt-draft-snippet';
        snippet.textContent = draft.text.trim().slice(0, 160) || '（空文本）';
        summary.append(time, snippet, icon('fa-chevron-down'));

        const actions = document.createElement('div');
        actions.className = 'stmt-draft-actions';
        actions.append(makeButton('应用', 'fa-arrow-right-to-bracket', 'apply', () => apply(draft)),
            makeButton('删除', 'fa-trash-can', 'delete', () => {
                const next = row.nextElementSibling ?? row.previousElementSibling;
                remove(draft);
                row.remove();
                if (!drafts.length) showEmpty();
                (next?.querySelector('summary') ?? popup.okButton).focus();
            }));
        const body = document.createElement('div');
        body.className = 'stmt-draft-preview';
        body.textContent = draft.text || '（空文本）';
        row.append(summary, actions, body);
        list.append(row);
    }
    return popup;
}

export const promptDrafts = {
    id: 'prompt-drafts',
    label: '编辑草稿',
    renderSettings,
    onSettingsChanged() { refreshTool?.(); },
    start(context, getConfig) {
        const views = new Map();
        const buckets = new Map();
        // ST keeps greetings as strings and rebuilds the dialog after a confirmed deletion.
        const greetingLists = new WeakMap();
        let nextGreeting = 0;
        let createSession = 0;
        let manager;

        function greetingList() {
            const owner = document.querySelector('#avatar_url_pole')?.value;
            const creating = document.querySelector('#form_create')?.getAttribute('actiontype') === 'createcharacter';
            const values = creating ? create_save.alternate_greetings
                : SillyTavern.getContext().characters.find(card => card?.avatar === owner)?.data?.alternate_greetings;
            if (!Array.isArray(values)) return;
            let list = greetingLists.get(values);
            if (!list) {
                list = { ids: [], deleting: null };
                greetingLists.set(values, list);
            }
            if (values.length < list.ids.length) {
                if (values.length === list.ids.length - 1 && list.deleting !== null) {
                    list.ids.splice(list.deleting, 1);
                } else {
                    list.ids.length = 0;
                }
                list.deleting = null;
            }
            while (list.ids.length < values.length) list.ids.push(++nextGreeting);
            return list;
        }

        function targetKey(source, location) {
            let parts;
            switch (location.id) {
                case 'character': {
                    const creating = document.querySelector('#form_create')?.getAttribute('actiontype') === 'createcharacter';
                    const owner = creating ? createSession : document.querySelector('#avatar_url_pole')?.value;
                    const row = source.closest('.alternate_greeting');
                    parts = [creating ? 'create' : 'edit', owner, row ? greetingList()?.ids[row.dataset.index] : source.id];
                    break;
                }
                case 'persona':
                    parts = [user_avatar, source.id];
                    break;
                case 'worldInfo': {
                    const row = source.closest('.world_entry');
                    parts = [row.querySelector('.move_entry_button')?.dataset.currentWorld, row.getAttribute('uid'), source.name];
                    break;
                }
                case 'aiResponse': {
                    const api = [...responsePresetSelectors].find(([, selector]) => source.matches(selector))?.[0];
                    const item = source.matches(promptManagerEditorSelector)
                        ? document.querySelector('#completion_prompt_manager_popup_entry_form_save')?.dataset.pmPrompt
                        : source.dataset.pmPrompt ?? source.id;
                    parts = [api, context.getPresetManager(api)?.getSelectedPresetName(), source.id, item];
                    break;
                }
            }
            if (parts?.every(value => value != null && value !== '')) return JSON.stringify([location.id, ...parts]);
        }

        function attach(editor, source, location) {
            const toolbar = getToolbar(editor);
            const button = document.createElement('button');
            button.type = 'button';
            button.innerHTML = '<i class="fa-solid fa-file-pen" aria-hidden="true"></i>';
            toolbar.append(button);
            const keyNow = () => targetKey(source, location);
            const openedKey = editor !== source ? keyNow() : undefined;
            const valid = key => key && editor.isConnected && source.isConnected && !editor.matches(':disabled, [readonly]')
                && !source.matches(':disabled, [readonly]') && isEnabled(location, getConfig())
                && (editor === source || openedKey === key) && keyNow() === key;

            function run(long, key) {
                if (!valid(key)) {
                    toastr.info('编辑目标已变更或无法识别，请重新打开编辑框。');
                    return;
                }
                const drafts = buckets.get(key) ?? [];
                if (long === Boolean(getConfig().reverse)) {
                    drafts.unshift({ text: editor.value, date: new Date() });
                    buckets.set(key, drafts);
                    toastr.success('草稿已保存');
                    return;
                }
                if (manager) return;
                const remove = draft => {
                    const index = drafts.indexOf(draft);
                    if (index >= 0) drafts.splice(index, 1);
                    if (!drafts.length) buckets.delete(key);
                };
                const popup = openManager(context, drafts, draft => {
                    if (valid(key)) {
                        editor.value = draft.text;
                        editor.dispatchEvent(new Event('input', { bubbles: true }));
                        if (source.matches(quickPromptSelector) && document.activeElement !== source) {
                            source.dispatchEvent(new FocusEvent('blur'));
                        }
                        if (getConfig().deleteOnApply) remove(draft);
                    } else {
                        toastr.info('编辑目标已变更，草稿仍保留。');
                    }
                    void popup.completeAffirmative();
                }, remove);
                manager = popup;
                void popup.show().finally(() => { manager = undefined; });
            }

            let timer, pressedKey, held;
            const cancel = () => clearTimeout(timer);
            button.onpointerdown = event => {
                if (!event.isPrimary || event.button !== 0) return;
                cancel();
                pressedKey = keyNow();
                held = false;
                timer = setTimeout(() => { held = true; run(true, pressedKey); }, 500);
            };
            button.onpointerleave = button.onpointerup = button.onpointercancel = cancel;
            button.oncontextmenu = event => event.preventDefault();
            button.onclick = event => {
                if (!event.detail || !held) run(false, event.detail ? pressedKey : keyNow());
            };
            button.onkeydown = event => {
                if (event.key === 'Enter' && event.shiftKey) {
                    event.preventDefault();
                    if (!event.repeat) run(true, keyNow());
                }
            };
            return {
                update() {
                    button.title = getConfig().reverse ? '单击管理草稿，长按保存草稿' : '单击保存草稿，长按管理草稿';
                    button.setAttribute('aria-label', button.title);
                },
                remove() {
                    cancel();
                    button.remove();
                    if (!toolbar.childElementCount) toolbar.remove();
                },
            };
        }

        function refresh() {
            for (const [editor, view] of views) {
                const { location } = locateEditor(editor);
                if (!editor.isConnected || !location || !isEnabled(location, getConfig())) {
                    view.remove();
                    views.delete(editor);
                }
            }
            for (const editor of document.querySelectorAll(editorSelector)) {
                const { source, location } = locateEditor(editor);
                if (!location || !isEnabled(location, getConfig())) continue;
                if (!views.has(editor)) views.set(editor, attach(editor, source, location));
                views.get(editor).update();
            }
        }

        function onGreetingAction(event) {
            const button = event.target.closest?.('.move_up_alternate_greeting, .move_down_alternate_greeting, .delete_alternate_greeting, .add_alternate_greeting');
            if (!button) return;
            const list = greetingList();
            if (!list || button.matches('.add_alternate_greeting')) return;
            const index = Number(button.closest('.alternate_greeting').dataset.index);
            if (button.matches('.delete_alternate_greeting')) {
                list.deleting = index;
                return;
            }
            const other = index + (button.matches('.move_up_alternate_greeting') ? -1 : 1);
            if (other >= 0 && other < list.ids.length) {
                [list.ids[index], list.ids[other]] = [list.ids[other], list.ids[index]];
            }
        }
        document.addEventListener('click', onGreetingAction, true);
        const observer = new MutationObserver(records => {
            if (records.some(r => r.attributeName === 'actiontype' && r.target.getAttribute('actiontype') === 'createcharacter')) {
                createSession++;
            }
            if (editorsChanged(records)) refresh();
        });
        observer.observe(document.body, { childList: true, subtree: true });
        const form = document.getElementById('form_create');
        if (form) observer.observe(form, { attributes: true, childList: true, subtree: true, attributeFilter: ['actiontype'] });
        refreshTool = refresh;
        refresh();
        return () => {
            observer.disconnect();
            document.removeEventListener('click', onGreetingAction, true);
            void manager?.completeNegative();
            refreshTool = undefined;
            for (const view of views.values()) view.remove();
            views.clear();
            buckets.clear();
        };
    },
};
