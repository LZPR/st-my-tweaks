import { getPhrases } from './editor-phrase-catalog.js';
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
    const lists = element('div', 'st-phrases-lists');
    const settings = element('section', 'st-phrase-settings');
    section.append(header, element('small', 'st-phrase-hint', '点选按钮设置短语，拖动可排序。虚线按钮已隐藏。'), lists);
    canvas.append(section, settings);

    let selected = phrases[0];
    const chips = new Map();

    function move(phrase, position, before) {
        if (before === phrase || (phrase.builtin && position !== 'both')) return;
        phrases.splice(phrases.indexOf(phrase), 1);
        phrase.position = position;
        phrases.splice(before ? phrases.indexOf(before) : phrases.length, 0, phrase);
    }

    function attachDrag(chip, phrase) {
        chip.onkeydown = event => {
            const siblings = phrases.filter(item => item.position === phrase.position);
            const index = siblings.indexOf(phrase);
            const direction = { ArrowLeft: -1, ArrowRight: 1 }[event.key];
            if (!direction || !siblings[index + direction]) return;
            event.preventDefault();
            move(phrase, phrase.position, siblings[index + (direction < 0 ? -1 : 2)]);
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
                const group = document.elementFromPoint(event.clientX, event.clientY)?.closest('.st-phrase-group');
                if (!lists.contains(group) || (phrase.builtin && group.dataset.position !== 'both')) return;
                const position = group.dataset.position;
                const before = phrases.find(item => {
                    if (item.position !== position) return false;
                    const rect = chips.get(item).getBoundingClientRect();
                    return event.clientY < rect.top || (event.clientY <= rect.bottom && event.clientX < rect.left + rect.width / 2);
                });
                marker = before ? chips.get(before) : group;
                marker.classList.add(before ? 'drop-before' : 'drop-end');
                return { position, before };
            }
            chip.onpointermove = event => {
                if (Math.hypot(event.clientX - down.clientX, event.clientY - down.clientY) >= 5) dragging = true;
                if (dragging) locate(event);
            };
            chip.onpointerup = event => {
                if (!dragging) return;
                const target = locate(event);
                if (target) move(phrase, target.position, target.before);
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
        for (const [position, label] of positions) {
            const group = element('div', 'st-phrase-group');
            group.dataset.position = position;
            const strip = element('div', 'st-phrase-strip');
            strip.setAttribute('role', 'group');
            strip.setAttribute('aria-label', label);
            group.append(element('h5', '', label), strip);
            lists.append(group);
            for (const phrase of phrases.filter(item => item.position === position)) {
                const chip = button(phrase.name || '新短语', 'st-phrase-chip');
                chip.setAttribute('aria-pressed', String(selected === phrase));
                chip.classList.toggle('muted', Boolean(phrase.hidden));
                chip.title = [phrase.name || '新短语', phrase.builtin ? '内置短语' : '自定义短语', phrase.hidden ? '已隐藏' : '显示中'].join(' · ');
                chip.onclick = () => {
                    select(phrase);
                    chips.get(phrase).focus({ preventScroll: true });
                };
                attachDrag(chip, phrase);
                chips.set(phrase, chip);
                strip.append(chip);
            }
            if (!strip.childElementCount) strip.append(element('small', 'st-phrase-empty', '暂无短语'));
        }
    }

    function select(phrase) {
        selected = phrase;
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
        if (phrase.builtin) {
            settings.append(element('p', 'st-phrase-hint', phrase.name + ' · 内置短语，可调整顺序和显示状态。'));
            return;
        }
        const fields = element('div', 'st-phrase-fields');
        function field(title, control) {
            const label = element('label', '', title);
            control.className = 'text_pole';
            label.append(control);
            fields.append(label);
        }
        const name = element('input');
        name.value = phrase.name;
        name.required = true;
        name.oninput = () => { phrase.name = name.value; drawLists(); };
        field('按钮名称', name);
        const position = element('select');
        for (const [value, label] of positions) position.add(new Option(label, value));
        position.value = phrase.position;
        position.onchange = () => { move(phrase, position.value); drawLists(); };
        field('显示位置', position);
        const text = element('textarea');
        text.rows = 2;
        text.required = true;
        text.value = phrase.text;
        text.oninput = () => { phrase.text = text.value; };
        field('填充文本', text);
        const remove = button('删除短语', 'st-phrase-action');
        remove.onclick = () => {
            phrases.splice(phrases.indexOf(phrase), 1);
            select(phrases[0]);
            add.focus();
        };
        fields.append(remove);
        settings.append(fields);
    }

    add.onclick = () => {
        const phrase = { name: '', text: '', position: 'both' };
        phrases.push(phrase);
        select(phrase);
        settings.querySelector('.st-phrase-fields input').focus();
    };
    select(selected);
    return () => {
        const invalid = phrases.find(item => !item.builtin && (!item.name.trim() || !item.text.length));
        if (!invalid) return true;
        select(invalid);
        const control = settings.querySelector(!invalid.name.trim() ? '.st-phrase-fields input' : 'textarea');
        control.focus();
        control.setCustomValidity(!invalid.name.trim() ? '请填写按钮名称' : '请填写填充文本');
        control.reportValidity();
        control.addEventListener('input', () => control.setCustomValidity(''), { once: true });
        return false;
    };
}
