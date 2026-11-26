import { getPhrases, reactionPresets } from './editor-phrase-catalog.js';
import { getToolbarScale } from './toolbar-scale.js';

const positions = new Map([['both', '输入框和全屏'], ['chat', '仅输入框'], ['fullscreen', '仅全屏']]);

function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
}

function button(text, className) {
    const node = element('button', className, text);
    node.type = 'button';
    return node;
}

export function addPhraseSettings(canvas, config) {
    const phrases = config.phrases = getPhrases(config);
    const section = element('section', 'st-phrases');
    const header = element('div', 'st-phrases-heading');
    const add = button('＋ 添加短语', 'st-phrase-action');
    header.append(element('h4', '', '快捷短语'), add);
    const legend = element('div', 'st-phrase-legend');
    for (const [position, label] of positions) {
        const item = element('span', '', label);
        item.dataset.position = position;
        legend.append(item);
    }
    const lists = element('div', 'st-phrase-strip');
    lists.setAttribute('role', 'group');
    lists.setAttribute('aria-label', '快捷短语');
    const settings = element('section', 'st-phrase-settings');
    const presets = element('section', 'st-phrase-presets');
    const presetHeading = element('div', 'st-phrases-heading');
    const addAll = button('全部添加', 'st-phrase-action');
    presetHeading.append(element('h4', '', '常用反应'), addAll);
    const presetButtons = element('div', 'st-phrase-preset-buttons');
    presets.append(presetHeading, presetButtons);
    section.append(header, element('small', 'st-phrase-hint', '点选按钮设置短语，拖动可排序。虚线按钮已隐藏。'), legend, lists);
    canvas.append(section, presets, settings);

    let selected = phrases[0];
    const chips = new Map();

    function addPresets(templates) {
        const additions = templates.filter(preset => !phrases.some(item => item.presetId === preset.id))
            .map(preset => ({ presetId: preset.id, name: preset.name, texts: [...preset.texts], position: 'both' }));
        if (!additions.length) return;
        phrases.push(...additions);
        select(additions[0]);
    }

    addAll.onclick = () => addPresets(reactionPresets);
    for (const preset of reactionPresets) {
        const addPreset = button('＋ ' + preset.name, 'st-phrase-action');
        addPreset.onclick = () => addPresets([preset]);
        presetButtons.append(addPreset);
    }

    function updatePresets() {
        const added = new Set(phrases.map(phrase => phrase.presetId));
        reactionPresets.forEach((preset, index) => {
            const control = presetButtons.children[index];
            control.disabled = added.has(preset.id);
            control.textContent = (control.disabled ? '✓ ' : '＋ ') + preset.name;
        });
        addAll.disabled = reactionPresets.every(preset => added.has(preset.id));
    }

    function move(phrase, before) {
        if (before === phrase) return;
        phrases.splice(phrases.indexOf(phrase), 1);
        phrases.splice(before ? phrases.indexOf(before) : phrases.length, 0, phrase);
    }

    function attachDrag(chip, phrase) {
        chip.onkeydown = event => {
            const index = phrases.indexOf(phrase);
            const direction = { ArrowLeft: -1, ArrowRight: 1 }[event.key];
            if (!direction || !phrases[index + direction]) return;
            event.preventDefault();
            move(phrase, phrases[index + (direction < 0 ? -1 : 2)]);
            select(phrase);
            chips.get(phrase).focus();
        };
        chip.onpointerdown = down => {
            if (down.button !== 0 || !down.isPrimary) return;
            chip.setPointerCapture(down.pointerId);
            let dragging = false;
            let marker;
            function locate(event) {
                marker?.classList.remove('drop-before', 'drop-end');
                if (!lists.contains(document.elementFromPoint(event.clientX, event.clientY))) return;
                const before = phrases.find(item => {
                    const rect = chips.get(item).getBoundingClientRect();
                    return event.clientY < rect.top || (event.clientY <= rect.bottom && event.clientX < rect.left + rect.width / 2);
                });
                marker = before ? chips.get(before) : lists;
                marker.classList.add(before ? 'drop-before' : 'drop-end');
                return { before };
            }
            chip.onpointermove = event => {
                if (Math.hypot(event.clientX - down.clientX, event.clientY - down.clientY) >= 5) dragging = true;
                if (dragging) locate(event);
            };
            chip.onpointerup = event => {
                if (!dragging) return;
                const target = locate(event);
                if (target) move(phrase, target.before);
                select(phrase);
            };
            chip.onlostpointercapture = () => {
                marker?.classList.remove('drop-before', 'drop-end');
                chip.onpointermove = chip.onpointerup = chip.onlostpointercapture = null;
            };
        };
    }

    function updateAppearance() {
        lists.style.setProperty('--phrase-scale', getToolbarScale(config) + '%');
        lists.style.setProperty('--phrase-align', config.alignment || 'center');
    }
    canvas.addEventListener('input', updateAppearance);
    canvas.addEventListener('change', updateAppearance);
    updateAppearance();

    function drawLists() {
        chips.clear();
        lists.replaceChildren();
        for (const phrase of phrases) {
            const chip = button(phrase.name || '新短语', 'st-phrase-chip');
            chip.dataset.position = phrase.position;
            chip.setAttribute('aria-pressed', String(selected === phrase));
            chip.classList.toggle('muted', Boolean(phrase.hidden));
            chip.title = [phrase.name || '新短语', positions.get(phrase.position), phrase.builtin ? '内置短语' : '自定义短语', phrase.hidden ? '已隐藏' : '显示中'].join(' · ');
            chip.onclick = () => {
                select(phrase);
                chips.get(phrase).focus({ preventScroll: true });
            };
            attachDrag(chip, phrase);
            chips.set(phrase, chip);
            lists.append(chip);
        }
    }

    function select(phrase) {
        selected = phrase;
        updatePresets();
        drawLists();
        settings.replaceChildren();
        const heading = element('div', 'st-phrases-heading');
        const visible = element('label', 'st-phrase-visible');
        const checkbox = element('input');
        checkbox.type = 'checkbox';
        checkbox.checked = !phrase.hidden;
        checkbox.onchange = () => { phrase.hidden = !checkbox.checked; drawLists(); };
        visible.append(checkbox, '显示在工具栏');
        heading.append(element('h4', '', '短语设置'), visible);
        settings.append(heading);
        const fields = element('div', 'st-phrase-fields');
        function field(title, control) {
            const label = element('label', '', title);
            control.className = 'text_pole';
            label.append(control);
            fields.append(label);
        }
        if (!phrase.builtin) {
            const name = element('input');
            name.value = phrase.name;
            name.required = true;
            name.oninput = () => { phrase.name = name.value; drawLists(); };
            field('按钮名称', name);
        }
        const position = element('select');
        for (const [value, label] of positions) position.add(new Option(label, value));
        position.value = phrase.position;
        position.onchange = () => { phrase.position = position.value; drawLists(); };
        field('显示位置', position);
        settings.append(fields);
        if (phrase.builtin) return;
        const alternatives = element('div', 'st-phrase-alternatives');
        const title = element('div', 'st-phrases-heading');
        const append = button('＋ 添加文本', 'st-phrase-action');
        title.append('填充文本', append);
        const inputs = element('div', 'st-phrase-inputs');
        alternatives.append(title, inputs);
        fields.append(alternatives);
        function drawTexts() {
            inputs.replaceChildren();
            phrase.texts.forEach((value, index) => {
                const row = element('div', 'st-phrase-text-row');
                const text = element('textarea', 'text_pole');
                text.rows = 2;
                text.required = true;
                text.setAttribute('aria-label', '填充文本 ' + (index + 1));
                text.value = value;
                text.oninput = () => { phrase.texts[index] = text.value; };
                row.append(text);
                if (phrase.texts.length > 1) {
                    const removeText = button('×', 'st-phrase-action');
                    removeText.setAttribute('aria-label', '删除填充文本 ' + (index + 1));
                    removeText.onclick = () => {
                        phrase.texts.splice(index, 1);
                        drawTexts();
                        inputs.querySelectorAll('textarea')[Math.min(index, phrase.texts.length - 1)].focus();
                    };
                    row.append(removeText);
                }
                inputs.append(row);
            });
        }
        append.onclick = () => {
            phrase.texts.push('');
            drawTexts();
            inputs.lastElementChild.querySelector('textarea').focus();
        };
        drawTexts();
        const remove = button('删除短语', 'st-phrase-action');
        remove.onclick = () => {
            phrases.splice(phrases.indexOf(phrase), 1);
            select(phrases[0]);
            add.focus();
        };
        fields.append(remove);
    }

    add.onclick = () => {
        const phrase = { name: '', texts: [''], position: 'both' };
        phrases.push(phrase);
        select(phrase);
        settings.querySelector('.st-phrase-fields input').focus();
    };
    select(selected);
    return () => {
        const invalid = phrases.find(item => !item.builtin && (!item.name.trim() || item.texts.includes('')));
        if (!invalid) return true;
        select(invalid);
        const control = !invalid.name.trim() ? settings.querySelector('.st-phrase-fields input')
            : settings.querySelectorAll('textarea')[invalid.texts.indexOf('')];
        control.focus();
        control.setCustomValidity(!invalid.name.trim() ? '请填写按钮名称' : '请填写填充文本');
        control.reportValidity();
        control.addEventListener('input', () => control.setCustomValidity(''), { once: true });
        return false;
    };
}
