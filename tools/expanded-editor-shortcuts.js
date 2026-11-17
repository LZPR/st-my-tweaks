const chatEditorSelector = 'textarea#send_textarea';
const editorSelector = `textarea.maximized_textarea, ${chatEditorSelector}`;
const toolbarClass = 'st-my-tweaks-editor-shortcuts';
const chatToolbarClass = 'st-my-tweaks-chat-shortcuts';
const alignments = new Map([['left', '左对齐'], ['center', '居中'], ['right', '右对齐']]);
const minScale = 75;
const maxScale = 150;
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

function getScale(config) {
    const { scale } = config;
    return Number.isFinite(scale) && scale >= minScale && scale <= maxScale ? scale : 100;
}

function applyToolbarSettings(toolbar, config) {
    toolbar.style.justifyContent = alignments.has(config.alignment) ? config.alignment : 'center';
    for (const button of toolbar.children) {
        button.style.zoom = `${getScale(config)}%`;
    }
}

function renderSettings(canvas, config) {
    canvas.classList.add('flex-container', 'flexFlowColumn');

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

    const scaleLabel = document.createElement('label');
    scaleLabel.className = 'flex-container flexFlowColumn';
    const scaleText = document.createElement('span');
    const scale = document.createElement('input');
    scale.type = 'range';
    scale.min = String(minScale);
    scale.max = String(maxScale);
    scale.step = '5';
    scale.value = String(getScale(config));
    scaleText.textContent = `按钮缩放 ${scale.value}%`;
    scale.setAttribute('aria-valuetext', `${scale.value}%`);
    scale.addEventListener('input', () => {
        config.scale = scale.valueAsNumber;
        scaleText.textContent = `按钮缩放 ${scale.value}%`;
        scale.setAttribute('aria-valuetext', `${scale.value}%`);
    });
    scaleLabel.append(scaleText, scale);
    canvas.append(alignmentLabel, scaleLabel);
}

function createToolbar(getEditor, config, label) {
    const toolbar = document.createElement('div');
    toolbar.className = `flex-container wide100p ${toolbarClass}`;
    toolbar.style.flex = '0 0 auto';
    toolbar.style.flexWrap = 'wrap';
    toolbar.style.direction = 'ltr';
    toolbar.setAttribute('role', 'group');
    toolbar.setAttribute('aria-label', label);
    // Keep the textarea focused and preserve its selection when tapping a shortcut.
    toolbar.addEventListener('pointerdown', event => event.preventDefault());

    for (const shortcut of ['{{char}}', '{{user}}', '“”']) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'menu_button';
        button.style.minHeight = '36px';
        button.textContent = shortcut;
        if (shortcut === '“”') {
            button.setAttribute('aria-label', '插入或切换引号');
        }
        button.addEventListener('click', () => {
            const editor = getEditor();
            if (!editor) {
                return;
            }
            if (shortcut === '“”') {
                toggleQuotes(editor);
            } else {
                const { selectionStart: start, selectionEnd: end } = editor;
                replaceRange(editor, start, end, shortcut, start + shortcut.length);
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
        if (!form || form.querySelector(`:scope > .${chatToolbarClass}`)) {
            return;
        }

        const getChatEditor = () => form.querySelector(`:scope > #nonQRFormItems > ${chatEditorSelector}`);
        const toolbar = createToolbar(getChatEditor, config, '聊天快捷输入');
        toolbar.classList.add(chatToolbarClass);
        // Tabbing away should leave the composer without focusing a control that then disappears.
        for (const button of toolbar.children) {
            button.tabIndex = -1;
        }
        row.before(toolbar);
    } else if (!editor.nextElementSibling?.classList.contains(toolbarClass)) {
        editor.after(createToolbar(() => editor, config, '全屏编辑快捷输入'));
    }
}

export const expandedEditorShortcuts = {
    id: 'expanded-editor-shortcuts',
    label: '编辑快捷输入',
    renderSettings,
    onSettingsChanged(config) {
        document.querySelectorAll(`.${toolbarClass}`).forEach(toolbar => applyToolbarSettings(toolbar, config));
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
