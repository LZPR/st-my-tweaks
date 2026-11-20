import { createToolbarScaleSetting, getToolbarScale } from './toolbar-scale.js';

const quickPromptSelector = '#ai_response_configuration textarea[data-pm-prompt]';
const promptManagerEditorSelector = 'textarea#completion_prompt_manager_popup_entry_form_prompt';
const responsePresetSelectors = new Map([
    ['openai', [
        quickPromptSelector,
        promptManagerEditorSelector,
        ...[
            'impersonation_prompt_textarea',
            'wi_format_textarea',
            'scenario_format_textarea',
            'personality_format_textarea',
            'group_nudge_prompt_textarea',
            'newchat_prompt_textarea',
            'newgroupchat_prompt_textarea',
            'newexamplechat_prompt_textarea',
            'continue_nudge_prompt_textarea',
            'send_if_empty_textarea',
            'claude_assistant_prefill',
            'claude_assistant_impersonation',
        ].map(id => `#ai_response_configuration textarea#${id}`),
    ].join(', ')],
    ['novel', '#ai_response_configuration textarea#nai_preamble_textarea'],
    ['textgenerationwebui', '#ai_response_configuration textarea#negative_prompt_textgenerationwebui'],
]);
const locations = [
    {
        id: 'character',
        label: '角色管理',
        selector: [
            'textarea#description_textarea',
            'textarea#firstmessage_textarea',
            'textarea#personality_textarea',
            'textarea#scenario_pole',
            'textarea#mes_example_textarea',
            'textarea#system_prompt_textarea',
            'textarea#post_history_instructions_textarea',
            'textarea#depth_prompt_prompt',
            '.alternate_greetings_list textarea.alternate_greeting_text',
        ].join(', '),
    },
    {
        id: 'persona',
        label: '用户角色管理',
        selector: 'textarea#persona_description',
    },
    {
        id: 'worldInfo',
        label: '世界书',
        selector: '#world_popup_entries_list .world_entry textarea[name="content"]',
    },
    {
        id: 'aiResponse',
        label: 'AI 响应配置',
        selector: [...responsePresetSelectors.values()].join(', '),
    },
];
const expandedSelector = 'textarea.maximized_textarea[data-for]';
const editorSelector = [...locations.map(location => location.selector), expandedSelector].join(', ');
const maxUndoSteps = 100;
const deletionGroupDelay = 750;
const groupedDeletionTypes = new Set(['deleteContentBackward', 'deleteContentForward', 'deleteWordBackward', 'deleteWordForward']);
const actions = [
    { id: 'undo', label: '撤销', icon: 'fa-rotate-left' },
    { id: 'redo', label: '还原', icon: 'fa-rotate-right' },
    { id: 'reset', label: '重置为编辑前的文本', icon: 'fa-clock-rotate-left' },
];
let refreshTool;

function snapshot(editor) {
    return {
        value: editor.value,
        start: editor.selectionStart,
        end: editor.selectionEnd,
        direction: editor.selectionDirection,
    };
}

function updateViews(history) {
    const { source, current, initial, views, undo, redo, composing } = history;
    for (const [editor, { buttons }] of views) {
        if (editor !== source && editor.value !== current.value && !composing) {
            editor.value = current.value;
        }
        buttons.undo.disabled = composing || undo.length === 0;
        buttons.redo.disabled = composing || redo.length === 0;
        buttons.reset.disabled = composing || current.value === initial.value;
    }
}

function rebase(history) {
    history.current = history.initial = snapshot(history.source);
    history.undo.length = 0;
    history.redo.length = 0;
    history.composing = null;
    history.lastDeletion = null;
    updateViews(history);
}

function syncSource(history) {
    if (!history.composing && history.source.value !== history.current.value) {
        rebase(history);
    }
}

function pushUndo(history) {
    history.undo.push(history.current);
    if (history.undo.length > maxUndoSteps) {
        history.undo.shift();
    }
}

function rememberChange(history, editor, event) {
    const { current, lastDeletion } = history;
    if (editor.value !== current.value) {
        const next = snapshot(editor);
        const inputType = event?.inputType;
        const isCaretDeletion = groupedDeletionTypes.has(inputType) && current.start === current.end && next.start === next.end;
        const continuesDeletion = isCaretDeletion && lastDeletion?.editor === editor && lastDeletion.inputType === inputType
            && lastDeletion.caret === current.start && event.timeStamp - lastDeletion.time <= deletionGroupDelay;
        if (!continuesDeletion) {
            pushUndo(history);
        }
        history.lastDeletion = isCaretDeletion
            ? { editor, inputType, caret: next.start, time: event.timeStamp }
            : null;
        history.current = next;
        history.redo.length = 0;
    }
    updateViews(history);
}

function applyAction(history, editor, action) {
    syncSource(history);
    if (history.composing || editor.matches(':disabled, [readonly]') || !history.source.isConnected) {
        return;
    }

    history.lastDeletion = null;
    const { current, initial, undo, redo } = history;
    let next;
    switch (action) {
        case 'undo':
            next = undo.pop();
            if (next) redo.push(current);
            break;
        case 'redo':
            next = redo.pop();
            if (next) undo.push(current);
            break;
        case 'reset':
            if (current.value !== initial.value) {
                next = initial;
                pushUndo(history);
                redo.length = 0;
            }
            break;
    }
    if (!next) {
        return;
    }

    history.current = next;
    editor.value = next.value;
    editor.setSelectionRange(next.start, next.end, next.direction);
    editor.dispatchEvent(new Event('input', { bubbles: true }));
    // ST saves Quick Prompts on blur. An unfocused source has no later blur event.
    if (history.source.matches(quickPromptSelector) && document.activeElement !== history.source) {
        history.source.dispatchEvent(new FocusEvent('blur'));
    }
    updateViews(history);
}

function attachView(history, editor) {
    const listeners = new AbortController();
    const options = { signal: listeners.signal };
    const toolbar = document.createElement('div');
    toolbar.className = 'st-my-tweaks-prompt-history';
    toolbar.setAttribute('role', 'group');
    toolbar.setAttribute('aria-label', '提示词编辑历史');
    toolbar.addEventListener('pointerdown', event => event.preventDefault(), options);

    const buttons = {};
    for (const { id, label, icon } of actions) {
        const button = document.createElement('button');
        button.type = 'button';
        button.title = label;
        button.setAttribute('aria-label', label);
        const glyph = document.createElement('i');
        glyph.className = `fa-solid ${icon}`;
        glyph.setAttribute('aria-hidden', 'true');
        button.append(glyph);
        button.addEventListener('click', () => applyAction(history, editor, id), options);
        buttons[id] = button;
        toolbar.append(button);
    }
    editor.before(toolbar);

    const endDeletion = () => { history.lastDeletion = null; };
    editor.addEventListener('focus', () => syncSource(history), options);
    editor.addEventListener('blur', endDeletion, options);
    editor.addEventListener('pointerdown', endDeletion, options);
    editor.addEventListener('beforeinput', event => {
        if (history.composing || event.isComposing) {
            return;
        }
        syncSource(history);
        history.current = snapshot(editor);
        if (event.cancelable && (event.inputType === 'historyUndo' || event.inputType === 'historyRedo')) {
            event.preventDefault();
            applyAction(history, editor, event.inputType === 'historyUndo' ? 'undo' : 'redo');
        }
    }, options);
    editor.addEventListener('keydown', event => {
        if (event.defaultPrevented || event.isComposing || history.composing || event.altKey) {
            return;
        }
        const key = event.key.toLowerCase();
        if ((event.ctrlKey || event.metaKey) && key === 'z') {
            event.preventDefault();
            applyAction(history, editor, event.shiftKey ? 'redo' : 'undo');
        } else if (event.ctrlKey && !event.shiftKey && key === 'y') {
            event.preventDefault();
            applyAction(history, editor, 'redo');
        }
    }, options);
    editor.addEventListener('compositionstart', () => {
        endDeletion();
        syncSource(history);
        history.current = snapshot(editor);
        history.composing = editor;
        updateViews(history);
    }, options);
    editor.addEventListener('compositionend', () => {
        history.composing = null;
        rememberChange(history, editor);
    }, options);
    editor.addEventListener('input', event => {
        if (!history.composing && !event.isComposing) {
            rememberChange(history, editor, event);
        }
    }, options);

    history.views.set(editor, {
        toolbar,
        buttons,
        remove() {
            if (history.lastDeletion?.editor === editor) {
                endDeletion();
            }
            listeners.abort();
            toolbar.remove();
        },
    });
    syncSource(history);
    updateViews(history);
    return toolbar;
}

function isEnabled(location, config) {
    return config[location.id] !== false;
}

function renderSettings(canvas, config) {
    canvas.classList.add('flex-container', 'flexFlowColumn');
    for (const location of locations) {
        const label = document.createElement('label');
        label.className = 'checkbox_label';
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.checked = isEnabled(location, config);
        checkbox.addEventListener('change', () => { config[location.id] = checkbox.checked; });
        label.append(checkbox, location.label);
        canvas.append(label);
    }
    canvas.append(createToolbarScaleSetting(config, '工具栏缩放'));
}

export const promptEditHistory = {
    id: 'prompt-edit-history',
    label: '提示词编辑工具栏',
    renderSettings,
    onSettingsChanged() {
        refreshTool?.();
    },
    start(context, getConfig) {
        const histories = new Map();
        const refresh = () => {
            const config = getConfig();
            const scale = getToolbarScale(config) / 100;
            for (const [source, history] of histories) {
                for (const [editor, view] of history.views) {
                    if (!source.isConnected || !editor.isConnected || !isEnabled(history.location, config)) {
                        view.remove();
                        history.views.delete(editor);
                        if (history.composing === editor) {
                            history.composing = null;
                            rememberChange(history, source);
                        }
                    }
                }
                if (history.views.size === 0) {
                    histories.delete(source);
                }
            }

            for (const editor of document.querySelectorAll(editorSelector)) {
                const source = editor.matches(expandedSelector) ? document.getElementById(editor.dataset.for) : editor;
                const location = locations.find(item => source?.matches(item.selector));
                if (!location || !isEnabled(location, config)) {
                    continue;
                }
                if (!histories.has(source)) {
                    const initial = snapshot(source);
                    histories.set(source, {
                        source, location, initial, current: initial,
                        undo: [], redo: [], views: new Map(), composing: null, lastDeletion: null,
                    });
                }
                const history = histories.get(source);
                const toolbar = history.views.get(editor)?.toolbar ?? attachView(history, editor);
                toolbar.style.setProperty('--st-my-tweaks-prompt-history-scale', String(scale));
            }
        };

        const rebaseLocation = id => {
            for (const history of histories.values()) {
                if (history.location.id === id) rebase(history);
            }
        };
        const onCharacterOpened = () => rebaseLocation('character');
        const onPersonaChanged = () => rebaseLocation('persona');
        const onPresetChanged = ({ apiId } = {}) => {
            const selector = responsePresetSelectors.get(apiId);
            if (!selector) {
                return;
            }
            for (const [source, history] of histories) {
                if (source.matches(selector)) {
                    rebase(history);
                }
            }
        };
        const eventSource = context.eventSource;
        const events = context.eventTypes ?? context.event_types;
        const subscriptions = [
            [events?.CHARACTER_EDITOR_OPENED, onCharacterOpened],
            [events?.PERSONA_CHANGED, onPersonaChanged],
            [events?.PRESET_CHANGED, onPresetChanged],
        ].filter(([event]) => event);
        for (const [event, listener] of subscriptions) {
            eventSource.on(event, listener);
        }

        const characterForm = document.getElementById('form_create');
        const promptManagerForm = document.getElementById('completion_prompt_manager_popup_edit');
        const observer = new MutationObserver(records => {
            if (characterForm?.getAttribute('actiontype') === 'createcharacter'
                && records.some(record => record.target === characterForm && record.type === 'attributes')) {
                onCharacterOpened();
            }
            // The Prompt Manager reuses one textarea for different prompt entries.
            if (records.some(record => record.target === promptManagerForm && record.type === 'attributes')) {
                const history = histories.get(promptManagerForm.querySelector(promptManagerEditorSelector));
                if (history) {
                    rebase(history);
                }
            }
            if (records.some(record => [...record.addedNodes, ...record.removedNodes].some(node =>
                node instanceof Element && (node.matches(editorSelector) || node.querySelector(editorSelector))))) {
                refresh();
            }
        });
        observer.observe(document.body, { childList: true, subtree: true });
        if (characterForm) {
            observer.observe(characterForm, { attributes: true, attributeFilter: ['actiontype'] });
        }
        if (promptManagerForm) {
            observer.observe(promptManagerForm, { attributes: true, attributeFilter: ['style'] });
        }

        // ST swaps the values of two existing editors when moving an alternate greeting.
        const onGreetingMove = event => {
            const button = event.target.closest?.('.move_up_alternate_greeting, .move_down_alternate_greeting');
            if (!button) return;
            const greeting = button.closest('.alternate_greeting');
            const adjacent = button.matches('.move_up_alternate_greeting')
                ? greeting?.previousElementSibling : greeting?.nextElementSibling;
            if (!adjacent?.matches('.alternate_greeting')) return;

            queueMicrotask(() => {
                for (const block of [greeting, adjacent]) {
                    const history = histories.get(block.querySelector('textarea.alternate_greeting_text'));
                    if (history) rebase(history);
                }
            });
        };
        document.addEventListener('click', onGreetingMove, true);
        refreshTool = refresh;
        refresh();

        return () => {
            refreshTool = undefined;
            observer.disconnect();
            document.removeEventListener('click', onGreetingMove, true);
            for (const [event, listener] of subscriptions) {
                eventSource.removeListener(event, listener);
            }
            for (const { views } of histories.values()) {
                for (const view of views.values()) view.remove();
            }
            histories.clear();
        };
    },
};
