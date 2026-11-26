import { maskMacros, splitTraits } from './plist-format.js';

function button(label, click) {
    const el = document.createElement('button');
    el.type = 'button';
    el.textContent = label;
    el.onclick = click;
    return el;
}

export function openAttributeWizard(attributes, { unquote, display, resolve, save }) {
    const dialog = document.createElement('dialog');
    dialog.className = 'st-plist-choice';
    const header = document.createElement('header');
    const heading = document.createElement('h3');
    const close = button('×', () => dialog.close());
    close.className = 'pl-choice-close';
    close.setAttribute('aria-label', '取消');
    header.append(heading, close);
    const search = document.createElement('input');
    search.type = 'search';
    search.className = 'text_pole';
    const results = document.createElement('div');
    results.className = 'pl-choice-results';
    const custom = button('', () => {
        const text = search.value.trim();
        if (attribute) {
            let raw = text;
            const parts = splitTraits(raw);
            if (!parts || /[\[\]]/u.test(maskMacros(raw)) || splitTraits(raw, ';；')?.length !== 1)
                return report('请配对括号，并避开方括号和顶层分号。');
            if (parts.length > 1) raw = '"' + raw.replaceAll('\\', '\\\\').replaceAll('"', '\\"') + '"';
            if (present.has(unquote(raw))) return report('此参数已存在。');
            values.set(unquote(raw), raw);
            selected.add(unquote(raw));
            search.value = '';
            render();
        } else {
            if (/[:：=;；\[\]\r\n]/u.test(maskMacros(text)) || !splitTraits(text))
                return report('请填写有效的属性名称。');
            choose(resolve(text) ?? { name: text, common: [] });
        }
    });
    custom.className = 'pl-choice-custom';
    function report(message) {
        search.setCustomValidity(message);
        search.reportValidity();
    }
    const footer = document.createElement('footer');
    const back = button('上一步', () => {
        attribute = undefined;
        reset();
    });
    const confirm = button('', () => {
        save(attribute, [...selected].map(key => values.get(key)));
        dialog.close();
    });
    footer.append(back, confirm);
    dialog.append(header, search, results, custom, footer);
    let attribute;
    const values = new Map();
    const selected = new Set();
    let present;
    function choose(option) {
        attribute = option;
        selected.clear();
        values.clear();
        present = new Set((option.existing ?? []).map(unquote));
        for (const raw of [...option.common, ...(option.existing ?? [])]) {
            if (!values.has(unquote(raw))) values.set(unquote(raw), raw);
        }
        reset();
    }
    function reset() {
        search.value = '';
        search.setCustomValidity('');
        heading.textContent = attribute ? '选择参数 · ' + attribute.name : '选择属性';
        dialog.setAttribute('aria-label', heading.textContent);
        search.placeholder = attribute ? '搜索或输入自定义参数' : '搜索或输入属性名称';
        search.setAttribute('aria-label', search.placeholder);
        footer.hidden = !attribute;
        render();
        search.focus();
    }
    function render() {
        const text = search.value.trim();
        const query = text.toLocaleLowerCase();
        results.replaceChildren();
        function tile(label, exists, click) {
            const el = button(label, click);
            if (exists) {
                const badge = document.createElement('small');
                badge.textContent = '已有';
                el.className = 'pl-existing';
                el.append(badge);
            }
            results.append(el);
            return el;
        }
        if (attribute) {
            for (const [key, raw] of values) {
                if (!display(raw).toLocaleLowerCase().includes(query)) continue;
                const el = tile(display(raw), present.has(key), () => {
                    if (selected.has(key)) selected.delete(key);
                    else selected.add(key);
                    el.setAttribute('aria-pressed', String(selected.has(key)));
                    updateConfirm();
                });
                el.disabled = present.has(key);
                el.setAttribute('aria-pressed', String(selected.has(key)));
            }
            custom.hidden = !text || values.has(unquote(text));
            custom.textContent = '选择自定义参数「' + text + '」';
            updateConfirm();
        } else {
            for (const option of attributes) {
                if (option.name.toLocaleLowerCase().includes(query))
                    tile(option.name, !!option.existing, () => choose(option));
            }
            custom.hidden = !text || attributes.some(option => option.name === text);
            custom.textContent = (resolve(text)?.existing ? '选择已有属性「' : '使用属性名「') + text + '」';
        }
    }
    function updateConfirm() {
        confirm.disabled = !selected.size;
        confirm.textContent = (attribute.existing ? '追加参数' : '添加属性') + '（' + selected.size + '）';
    }
    search.oninput = () => { search.setCustomValidity(''); render(); };
    search.onkeydown = event => {
        if (event.key !== 'Enter' || event.isComposing) return;
        event.preventDefault();
        if (!custom.hidden) custom.click();
        else results.querySelector('button:not(:disabled)')?.click();
    };
    dialog.addEventListener('close', () => dialog.remove(), { once: true });
    document.body.append(dialog);
    dialog.showModal();
    reset();
}
