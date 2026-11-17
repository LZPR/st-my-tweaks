const editorSelector = 'textarea.maximized_textarea';
const toolbarClass = 'st-my-tweaks-editor-shortcuts';
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

function addToolbar(editor) {
    if (!editor.isConnected || editor.nextElementSibling?.classList.contains(toolbarClass)) {
        return;
    }

    const toolbar = document.createElement('div');
    toolbar.className = `flex-container ${toolbarClass}`;
    toolbar.style.flex = '0 0 auto';
    toolbar.setAttribute('role', 'group');
    toolbar.setAttribute('aria-label', '全屏编辑快捷输入');
    // Keep the textarea focused and preserve its selection when tapping a shortcut.
    toolbar.addEventListener('mousedown', event => event.preventDefault());

    for (const label of ['{{char}}', '{{user}}', '“”']) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'menu_button';
        button.style.minHeight = '36px';
        button.textContent = label;
        if (label === '“”') {
            button.setAttribute('aria-label', '插入或切换引号');
            button.addEventListener('click', () => toggleQuotes(editor));
        } else {
            button.addEventListener('click', () => {
                const { selectionStart: start, selectionEnd: end } = editor;
                replaceRange(editor, start, end, label, start + label.length);
            });
        }
        toolbar.append(button);
    }

    editor.after(toolbar);
}

export const expandedEditorShortcuts = {
    id: 'expanded-editor-shortcuts',
    label: '全屏编辑快捷输入',
    start() {
        const observer = new MutationObserver(records => {
            for (const { addedNodes } of records) {
                for (const node of addedNodes) {
                    if (!(node instanceof Element) || !node.isConnected) {
                        continue;
                    }
                    if (node.matches(editorSelector)) {
                        addToolbar(node);
                    }
                    node.querySelectorAll(editorSelector).forEach(addToolbar);
                }
            }
        });

        document.querySelectorAll(editorSelector).forEach(addToolbar);
        observer.observe(document.body, { childList: true, subtree: true });

        return () => {
            observer.disconnect();
            document.querySelectorAll(`.${toolbarClass}`).forEach(toolbar => toolbar.remove());
        };
    },
};
