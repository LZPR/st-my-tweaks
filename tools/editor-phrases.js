import { getPhrases } from './editor-phrase-catalog.js';

const positions = new Map([['both', '都有'], ['chat', '仅输入框'], ['fullscreen', '仅全屏']]);

function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
}

function button(text, title) {
    const node = element('button', 'st-phrase-action', text);
    node.type = 'button';
    node.title = title;
    node.setAttribute('aria-label', title);
    return node;
}

export function addPhraseSettings(canvas, config) {
    const phrases = config.phrases = getPhrases(config);
    const section = element('section', 'st-phrases');
    const header = element('div', 'st-phrases-heading');
    const add = button('＋ 添加短语', '添加短语');
    header.append(element('h4', '', '快捷短语'), add);
    const lists = element('div', 'st-phrases-lists');
    section.append(header, lists);
    canvas.append(section);
    let editing;
    const rows = new Map();
    const groups = new Map();

    function move(phrase, position, before) {
        if (before === phrase || (phrase.builtin && position !== 'both')) return;
        phrases.splice(phrases.indexOf(phrase), 1);
        phrase.position = position;
        phrases.splice(before ? phrases.indexOf(before) : phrases.length, 0, phrase);
    }

    function attachHandle(handle, phrase) {
        handle.addEventListener('keydown', event => {
            const siblings = phrases.filter(item => item.position === phrase.position);
            const index = siblings.indexOf(phrase);
            const direction = { ArrowUp: -1, ArrowDown: 1 }[event.key];
            if (!direction || !siblings[index + direction]) return;
            event.preventDefault();
            move(phrase, phrase.position, siblings[index + (direction < 0 ? -1 : 2)]);
            render();
            rows.get(phrase).querySelector('button').focus();
        });
        handle.addEventListener('pointerdown', event => {
            if (event.button !== 0 || !event.isPrimary) return;
            event.preventDefault();
            handle.setPointerCapture(event.pointerId);
            const row = rows.get(phrase);
            row.classList.add('moving');
            let target;
            function locate(e) {
                lists.querySelector('.drop-before, .drop-end')?.classList.remove('drop-before', 'drop-end');
                target = undefined;
                const hit = document.elementFromPoint(e.clientX, e.clientY);
                const group = hit?.closest('.st-phrase-group');
                if (!lists.contains(group)) return;
                const position = group.dataset.position;
                const before = phrases.find(item => {
                    if (item.position !== position) return false;
                    const rect = rows.get(item).getBoundingClientRect();
                    return e.clientY < rect.top + rect.height / 2;
                });
                target = { position, before };
                (before ? rows.get(before) : group).classList.add(before ? 'drop-before' : 'drop-end');
            }
            handle.onpointermove = locate;
            handle.onpointerup = e => {
                if (target) {
                    locate(e);
                    if (target) move(phrase, target.position, target.before);
                }
                render();
            };
            handle.onlostpointercapture = () => {
                row.classList.remove('moving');
                lists.querySelector('.drop-before, .drop-end')?.classList.remove('drop-before', 'drop-end');
                handle.onpointermove = handle.onpointerup = handle.onlostpointercapture = null;
            };
        });
    }

    function editor(phrase, preview) {
        const panel = element('div', 'st-phrase-fields');
        function field(title, control) {
            const label = element('label', '', title);
            control.className = 'text_pole';
            label.append(control);
            panel.append(label);
        }
        const name = element('input');
        name.value = phrase.name;
        name.required = true;
        name.oninput = () => {
            phrase.name = name.value;
            preview.firstElementChild.textContent = phrase.name || '新短语';
        };
        field('按钮名称', name);
        const position = element('select');
        for (const [value, label] of positions) position.add(new Option(label, value));
        position.value = phrase.position;
        position.onchange = () => {
            move(phrase, position.value);
            render();
            rows.get(phrase).querySelector('select').focus();
        };
        field('显示位置', position);
        const text = element('textarea');
        text.rows = 2;
        text.required = true;
        text.value = phrase.text;
        text.oninput = () => {
            phrase.text = text.value;
            preview.lastElementChild.textContent = phrase.builtin ? '内置短语' : phrase.text || '填写短语内容';
        };
        field('填充文本', text);
        const remove = button('删除短语', '删除短语');
        remove.onclick = () => {
            phrases.splice(phrases.indexOf(phrase), 1);
            editing = undefined;
            render();
            add.focus();
        };
        panel.append(remove);
        return panel;
    }

    function render() {
        rows.clear();
        groups.clear();
        lists.replaceChildren();
        for (const [position, label] of positions) {
            const group = element('div', 'st-phrase-group');
            group.dataset.position = position;
            group.append(element('h5', '', position === 'both' ? '输入框和全屏' : label));
            groups.set(position, group);
            lists.append(group);
        }
        for (const phrase of phrases) {
            const row = element('div', 'st-phrase-row');
            const handle = button('⠿', '拖动排序或更改分组，也可用上下方向键排序');
            handle.classList.add('st-phrase-handle');
            attachHandle(handle, phrase);
            const edit = button('', '编辑短语');
            edit.classList.add('st-phrase-edit');
            edit.setAttribute('aria-expanded', String(editing === phrase));
            edit.append(element('strong', '', phrase.name || '新短语'), element('small', '', phrase.text || '填写短语内容'));
            edit.disabled = Boolean(phrase.builtin);
            edit.onclick = () => {
                editing = editing === phrase ? undefined : phrase;
                render();
                rows.get(phrase).querySelector(editing ? 'input' : '.st-phrase-edit').focus();
            };
            const visibility = button('', '切换短语显示');
            function updateVisibility() {
                visibility.textContent = phrase.hidden ? '已隐藏' : '显示中';
                visibility.setAttribute('aria-pressed', String(!phrase.hidden));
                row.classList.toggle('muted', Boolean(phrase.hidden));
            }
            visibility.onclick = () => { phrase.hidden = !phrase.hidden; updateVisibility(); };
            updateVisibility();
            row.append(handle, edit, visibility);
            if (editing === phrase) row.append(editor(phrase, edit));
            groups.get(phrase.position).append(row);
            rows.set(phrase, row);
        }
        for (const group of groups.values()) {
            if (group.childElementCount === 1) group.append(element('small', 'st-phrase-empty', '暂无短语'));
        }
    }

    add.onclick = () => {
        editing = { name: '', text: '', position: 'both' };
        phrases.push(editing);
        render();
        rows.get(editing).querySelector('input').focus();
    };
    render();
    return () => {
        const invalid = phrases.find(item => !item.builtin && (!item.name.trim() || !item.text.length));
        if (!invalid) return true;
        editing = invalid;
        render();
        const control = rows.get(invalid).querySelector(!invalid.name.trim() ? 'input' : 'textarea');
        control.focus();
        control.setCustomValidity('请填写' + (!invalid.name.trim() ? '按钮名称' : '填充文本'));
        control.reportValidity();
        control.addEventListener('input', () => control.setCustomValidity(''), { once: true });
        return false;
    };
}
