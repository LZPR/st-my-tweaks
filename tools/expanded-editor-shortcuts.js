import { createToolbarScaleSetting, getToolbarScale } from './toolbar-scale.js';
import { addPhraseSettings } from './editor-phrases.js';

import { getPhrases } from './editor-phrase-catalog.js';

const chatEditorSelector = 'textarea#send_textarea';
const editorSelector = `textarea.maximized_textarea, ${chatEditorSelector}`;
const toolbarClass = 'st-my-tweaks-editor-shortcuts';
const chatToolbarClass = 'st-my-tweaks-chat-shortcuts';
const alignments = new Map([['left', '左对齐'], ['center', '居中'], ['right', '右对齐']]);
const doubleQuotes = ['“', '”'];
const singleQuotes = ['‘', '’'];
const closingQuotes = new Map([['“', '”'], ['‘', '’'], ['"', '"'], ["'", "'"]]);

function findEnclosingQuotes(value, start, end) {
    const stack = [];
    let enclosing;

    for (const { 0: mark, index } of value.matchAll(/\\[\s\S]|[“”‘’"']/g)) {
        // Ignore escaped marks and apostrophes inside words.
        if (mark.length > 1 || ((mark === "'" || mark === '’')
            && /\p{Script=Latin}['’]\p{Script=Latin}/u.test(value.slice(index - 1, index + 2)))) {
            continue;
        }

        const matchingIndex = stack.findLastIndex(opening => opening.close === mark);
        if (matchingIndex !== -1) {
            const opening = stack[matchingIndex];
            stack.length = matchingIndex;
            const coversSelection = start === end
                ? opening.index < start && index >= end
                : opening.index <= start && index + 1 >= end;
            if (coversSelection && (!enclosing || opening.index > enclosing.start)) {
                enclosing = { start: opening.index, end: index + 1, single: mark === '’' || mark === "'" };
            }
        } else if (closingQuotes.has(mark)) {
            stack.push({ index, close: closingQuotes.get(mark) });
        }
    }

    return enclosing;
}

function replaceRange(editor, start, end, text, selectionStart, selectionEnd = selectionStart) {
    const { selectionDirection } = editor;
    editor.setRangeText(text, start, end);
    editor.focus({ preventScroll: true });
    editor.setSelectionRange(selectionStart, selectionEnd, selectionDirection);
    editor.dispatchEvent(new Event('input', { bubbles: true }));
}

function toggleQuotes(editor) {
    const { value, selectionStart: start, selectionEnd: end } = editor;
    const enclosing = findEnclosingQuotes(value, start, end);

    if (start !== end && enclosing) {
        const { start: open, end: close } = enclosing;
        const includesQuotes = open === start && close === end;
        const insideQuotes = open + 1 === start && close - 1 === end;
        if (includesQuotes || insideQuotes) {
            const inner = value.slice(open + 1, close - 1);
            replaceRange(editor, open, close, inner, open, open + inner.length);
            return;
        }
    }

    const [open, close] = enclosing && !enclosing.single ? singleQuotes : doubleQuotes;
    replaceRange(editor, start, end, open + value.slice(start, end) + close, start + 1, end + 1);
}

function togglePair(editor, pair) {
    const { value, selectionStart: start, selectionEnd: end } = editor;
    const [open, close] = pair;
    // Match delimiters in context so selecting two adjacent pairs never strips their outer marks.
    const stack = [];
    if (start !== end) {
        for (let i = 0; i < value.length; i++) {
            const mark = value[i];
            if (mark === '\\') { i++; continue; }
            if (mark === close && stack.length) {
                const left = stack.pop();
                if ((left === start && i + 1 === end) || (left + 1 === start && i === end)) {
                    const inner = value.slice(left + 1, i);
                    replaceRange(editor, left, i + 1, inner, left, left + inner.length);
                    return;
                }
            } else if (mark === open) {
                stack.push(i);
            }
        }
    }
    replaceRange(editor, start, end, open + value.slice(start, end) + close, start + 1, end + 1);
}

function applyToolbarSettings(toolbar, config) {
    toolbar.style.justifyContent = alignments.has(config.alignment) ? config.alignment : 'center';
    for (const button of toolbar.children) {
        button.style.zoom = `${getToolbarScale(config)}%`;
    }
}

function renderSettings(canvas, config) {
    canvas.classList.add('st-shortcut-settings');
    const locations = document.createElement('div');
    locations.className = 'st-shortcut-locations';
    locations.append('启用位置');
    for (const [key, title] of [['chatEnabled', '输入框'], ['fullscreenEnabled', '全屏编辑框']]) {
        const label = document.createElement('label');
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.checked = config[key] !== false;
        checkbox.onchange = () => { config[key] = checkbox.checked; };
        label.append(checkbox, title);
        locations.append(label);
    }

    const alignmentLabel = document.createElement('label');
    alignmentLabel.className = 'flex-container flexFlowColumn';
    const alignment = document.createElement('select');
    alignment.className = 'text_pole';
    for (const [value, text] of alignments) {
        const option = document.createElement('option');
        option.value = value;
        option.textContent = text;
        alignment.append(option);
    }
    alignment.value = alignments.has(config.alignment) ? config.alignment : 'center';
    alignment.addEventListener('change', () => { config.alignment = alignment.value; });
    alignmentLabel.append('快捷栏对齐', alignment);

    const appearance = document.createElement('div');
    appearance.className = 'st-shortcut-appearance';
    appearance.append(alignmentLabel, createToolbarScaleSetting(config, '按钮缩放'));
    canvas.append(locations, appearance);
    return addPhraseSettings(canvas, config);
}

function createToolbar(getEditor, config, position) {
    const toolbar = document.createElement('div');
    toolbar.className = `flex-container wide100p ${toolbarClass}`;
    toolbar.style.flex = '0 0 auto';
    toolbar.style.flexWrap = 'wrap';
    toolbar.style.direction = 'ltr';
    toolbar.setAttribute('role', 'group');
    toolbar.setAttribute('aria-label', position === 'chat' ? '聊天快捷输入' : '全屏编辑快捷输入');
    // Keep the textarea focused and preserve its selection when tapping a shortcut.
    toolbar.addEventListener('pointerdown', event => event.preventDefault());

    const shortcuts = getPhrases(config).filter(p => !p.hidden && (p.position === 'both' || p.position === position));
    for (const shortcut of shortcuts) {
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = shortcut.name;
        button.dataset.position = shortcut.position;
        if (shortcut.builtin === 'quotes') {
            button.setAttribute('aria-label', '插入或切换引号');
        }
        button.addEventListener('click', () => {
            const editor = getEditor();
            if (!editor) {
                return;
            }
            if (shortcut.builtin === 'quotes') {
                toggleQuotes(editor);
            } else if (shortcut.builtin && shortcut.text === undefined) {
                togglePair(editor, shortcut.name);
            } else {
                const { selectionStart: start, selectionEnd: end } = editor;
                replaceRange(editor, start, end, shortcut.text, start + shortcut.text.length);
            }
        });
        toolbar.append(button);
    }

    applyToolbarSettings(toolbar, config);
    return toolbar;
}

function addToolbar(editor, config) {
    if (!editor.isConnected) {
        return;
    }

    if (editor.matches(chatEditorSelector)) {
        const row = editor.closest('#send_form > #nonQRFormItems');
        const form = row?.parentElement;
        if (config.chatEnabled === false || !form || form.querySelector(`:scope > .${chatToolbarClass}`)) {
            return;
        }

        const getChatEditor = () => form.querySelector(`:scope > #nonQRFormItems > ${chatEditorSelector}`);
        const toolbar = createToolbar(getChatEditor, config, 'chat');
        toolbar.classList.add(chatToolbarClass);
        // Tabbing away should leave the composer without focusing a control that then disappears.
        for (const button of toolbar.children) {
            button.tabIndex = -1;
        }
        row.after(toolbar);
    } else if (config.fullscreenEnabled !== false && !editor.nextElementSibling?.classList.contains(toolbarClass)) {
        editor.after(createToolbar(() => editor, config, 'fullscreen'));
    }
}

export const expandedEditorShortcuts = {
    id: 'expanded-editor-shortcuts',
    label: '编辑快捷输入',
    renderSettings,
    onSettingsChanged(config) {
        document.querySelectorAll(`.${toolbarClass}`).forEach(toolbar => toolbar.remove());
        document.querySelectorAll(editorSelector).forEach(editor => addToolbar(editor, config));
    },
    start(_context, getConfig) {
        const mountToolbar = editor => addToolbar(editor, getConfig());
        const observer = new MutationObserver(records => {
            for (const { addedNodes } of records) {
                for (const node of addedNodes) {
                    if (!(node instanceof Element) || !node.isConnected) {
                        continue;
                    }
                    if (node.matches(editorSelector)) {
                        mountToolbar(node);
                    }
                    node.querySelectorAll(editorSelector).forEach(mountToolbar);
                }
            }
        });

        document.querySelectorAll(editorSelector).forEach(mountToolbar);
        observer.observe(document.body, { childList: true, subtree: true });

        return () => {
            observer.disconnect();
            document.querySelectorAll(`.${toolbarClass}`).forEach(toolbar => toolbar.remove());
        };
    },
};
