import { editorSelector, editorsChanged, getToolbar, isEnabled, locateEditor, locations, quickPromptSelector, renderLocations } from './prompt-toolbar.js';
import { findBlocks, splitTraits, writeBlocks } from './plist-format.js';

const defaults = [
    { name: '性别', value: '男, 女' },
    { name: '外貌', value: '长发, 短发, 卷发, 直发' },
    { name: '性格', value: '活泼, 腼腆, 温和, 冷静' },
];
let refreshTool;
const windowSizes = [70, 85, 95, 100];
const defaultPrefixes = { character: "{{char}}'s ", persona: "{{user}}'s " };

function prefixFor(config, locationId) {
    return config.prefixes?.[locationId] ?? defaultPrefixes[locationId] ?? '';
}

function windowSize(config) {
    return windowSizes.includes(config.windowSize) ? config.windowSize : 95;
}

function element(tag, text) {
    const node = document.createElement(tag);
    if (text) node.textContent = text;
    return node;
}

function action(label, run) {
    const button = element('button', label);
    button.type = 'button';
    button.className = 'menu_button';
    button.addEventListener('click', run);
    return button;
}

const paths = {
    add: 'M12 5v14M5 12h14',
    block: 'M14 3H5v16h7M9 8h7M9 12h4M18 13v8M14 17h8',
    remove: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 10v7M14 10v7',
    done: 'm5 12 4 4L19 6',
    close: 'm6 6 12 12M6 18 18 6',
};

function iconButton(label, icon, run) {
    const button = action('', run);
    button.className = 'pl-icon';
    button.title = label;
    button.setAttribute('aria-label', label);
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    const path = document.createElementNS(svg.namespaceURI, 'path');
    path.setAttribute('d', paths[icon]);
    svg.append(path);
    button.append(svg);
    return button;
}

function box(className, tag = 'div') {
    const node = element(tag);
    node.className = className;
    return node;
}

function options(label, items, choose) {
    const select = element('select');
    select.setAttribute('aria-label', label);
    select.append(new Option(label, ''));
    items.forEach((item, i) => select.append(new Option(item, String(i))));
    select.addEventListener('change', () => {
        const index = select.selectedIndex - 1;
        select.selectedIndex = 0;
        if (index >= 0) choose(index);
    });
    return select;
}

function invalid(input, message) {
    input.setCustomValidity(message);
    input.reportValidity();
    input.setCustomValidity('');
    return false;
}

function rowList(container, initial, presets = [], prefix = '', usePrefix = () => false) {
    const header = box('pl-columns');
    header.append(element('span', '属性'), element('span', '参数'));
    const list = box('pl-rows');
    const rows = [];
    let pending;
    const finish = () => !pending || pending();
    function add({ name = '', value = '' } = {}, appliedPrefix = '') {
        const line = box('pl-row');
        const keyBox = box('pl-key');
        const key = element('textarea');
        key.rows = 1;
        key.value = appliedPrefix && name.startsWith(appliedPrefix) ? name.slice(appliedPrefix.length) : name;
        key.placeholder = '属性名称';
        key.setAttribute('aria-label', '属性名称');
        // Size to soft-wrapped text even when a previously hidden section opens.
        const measure = element('span');
        measure.setAttribute('aria-hidden', 'true');
        const measureKey = () => { measure.textContent = key.value + ' '; };
        measureKey();
        key.addEventListener('input', measureKey);
        keyBox.append(measure, key);
        const nameCell = box('pl-name-cell');
        if (appliedPrefix) nameCell.append(element('small', appliedPrefix));
        nameCell.append(keyBox);
        const initialItems = (splitTraits(value) ?? [value]).map(x => x.trim()).filter(Boolean);
        const items = [...initialItems];
        const chips = box('pl-chips');
        const drawer = box('pl-drawer');
        drawer.hidden = true;
        const row = { key, appliedPrefix, read: () => items.length === initialItems.length && items.every((v, i) => v === initialItems[i])
            ? value : items.join(', ') };
        rows.push(row);

        function inspect(index) {
            if (!finish()) return;
            index ??= items.length;
            const editing = index < items.length;
            const input = element('textarea');
            input.rows = 1;
            input.value = editing ? items[index] : '';
            input.placeholder = '输入一个参数';
            input.setAttribute('aria-label', '参数内容');
            const close = () => {
                pending = undefined;
                drawer.hidden = true;
                drawer.replaceChildren();
                paint();
            };
            const commit = () => {
                let next = input.value.trim();
                if (!next && editing) return invalid(input, '请输入参数，或点击删除图标。');
                if (next && (/[\[\]]/u.test(next) || splitTraits(next, ';；')?.length !== 1))
                    return invalid(input, '请配对括号，并避开方括号和顶层分号。');
                if (splitTraits(next).length > 1) next = '"' + next.replaceAll('\\', '\\\\').replaceAll('"', '\\"') + '"';
                if (next) items[index] = next;
                close();
                return true;
            };
            pending = commit;
            const commitFocus = () => {
                if (commit()) chips.children[Math.min(index, items.length)].focus();
            };
            drawer.replaceChildren(input, iconButton('确认参数', 'done', commitFocus));
            if (editing) drawer.append(iconButton('删除参数', 'remove', () => {
                items.splice(index, 1);
                close();
                chips.children[Math.min(index, items.length)].focus();
            }));
            const cancel = () => { close(); chips.children[index].focus(); };
            drawer.append(iconButton('取消参数编辑', 'close', cancel));
            if (!editing) {
                const name = key.value.trim();
                const preset = presets.find(p => p.name === name)
                    ?? presets.find(p => prefix && prefix + p.name === name);
                const choices = (splitTraits(preset?.value ?? '') ?? []).map(v => v.trim()).filter(v => v && !items.includes(v));
                if (choices.length) drawer.append(options('选择常用参数…', choices, i => {
                    input.value = choices[i];
                    commitFocus();
                }));
            }
            input.addEventListener('keydown', event => {
                if (event.isComposing) return;
                if (event.key === 'Escape' || (event.key === 'Enter' && !event.shiftKey)) {
                    event.preventDefault();
                    event.stopPropagation();
                    if (event.key === 'Escape') cancel();
                    else commitFocus();
                }
            });
            drawer.hidden = false;
            input.focus();
            input.select();
        }
        function paint() {
            chips.replaceChildren();
            items.forEach((item, i) => {
                const chip = action(item, () => inspect(i));
                chip.className = 'pl-chip';
                chip.title = '编辑参数 · ' + item;
                chips.append(chip);
            });
            chips.append(iconButton('添加参数', 'add', () => inspect()));
        }
        paint();
        const remove = iconButton('删除属性', 'remove', () => {
            if (!drawer.hidden) pending = undefined;
            rows.splice(rows.indexOf(row), 1);
            line.remove();
        });
        line.append(nameCell, chips, remove, drawer);
        list.append(line);
        return key;
    }
    initial.forEach(row => add(row));
    const addRow = options('添加属性…', ['自定义属性', ...presets.map(p => p.name)], i => {
        if (finish()) add({ name: presets[i - 1]?.name ?? '' }, usePrefix() ? prefix : '').focus();
    });
    const foot = box('pl-add-row');
    foot.append(addRow);
    container.append(header, list, foot);
    return () => {
        if (!finish()) return null;
        const result = [];
        for (const row of rows) {
            const name = row.key.value.trim();
            const value = row.read();
            if (!name && !value) continue;
            if (!name || /[:：=;；\[\]\r\n]/u.test(name) || splitTraits(name) === null || !value) {
                invalid(row.key, !value ? '请至少添加一个参数，或删除此属性。' : '请填写有效的属性名称。');
                return null;
            }
            const fullName = name.startsWith(row.appliedPrefix) ? name : row.appliedPrefix + name;
            result.push({ name: fullName, value });
        }
        return result;
    };
}

async function edit(context, editor, source, locationId, config, updateConfig, active) {
    const original = editor.value;
    const sourceValue = source.value;
    const blocks = findBlocks(original);
    const panel = box('st-plist');
    panel.dataset.windowSize = windowSize(config);
    const heading = box('pl-heading');
    const prefix = prefixFor(config, locationId);
    const toggleLabel = box('pl-toggle', 'label');
    const toggle = element('input');
    toggle.type = 'checkbox';
    toggle.checked = config.usePrefix !== false;
    toggle.addEventListener('change', () => updateConfig({ usePrefix: toggle.checked }));
    toggleLabel.title = prefix ? '新增属性前缀：' + prefix : '此区域的前缀为空，可在工具设置中修改';
    toggleLabel.append(toggle, box('pl-check', 'span'), '添加前缀');
    const picker = element('select');
    picker.setAttribute('aria-label', '切换片段');
    const navigation = box('pl-navigation');
    const pickerBox = box('pl-picker');
    pickerBox.append(picker);
    navigation.append(pickerBox, iconButton('新增片段', 'block', () => addBlock([])));
    heading.append(element('h3', 'PLists 编辑器'), toggleLabel, navigation);
    panel.append(heading);
    const sections = element('div');
    const readers = [];
    function show(index) {
        picker.selectedIndex = index;
        Array.from(sections.children).forEach((node, i) => { node.hidden = i !== index; });
    }
    picker.addEventListener('change', () => show(picker.selectedIndex));
    function addBlock(rows) {
        const section = box('pl-section');
        picker.append(new Option('片段 ' + (readers.length + 1)));
        readers.push(rowList(section, rows, config.presets ?? defaults, prefix, () => toggle.checked));
        sections.append(section);
        show(readers.length - 1);
    }
    blocks.forEach(block => addBlock(block.rows));
    if (!blocks.length) addBlock([]);
    show(0);
    const error = element('p');
    error.setAttribute('role', 'alert');
    panel.append(sections, error);
    const writable = () => active() && editor.isConnected && source.isConnected &&
        ![editor, source].some(node => node.matches(':disabled, [readonly]')) &&
        original === editor.value && sourceValue === source.value;
    let next;
    const result = await context.callGenericPopup(panel, context.POPUP_TYPE.CONFIRM, '', {
        okButton: '保存', cancelButton: '取消', leftAlign: true, allowVerticalScrolling: true,
        onClosing(popup) {
            if (popup.result !== context.POPUP_RESULT.AFFIRMATIVE) return true;
            if (!writable()) {
                error.textContent = '原编辑框已变更，请取消并重新打开。';
                return false;
            }
            const drafts = [];
            for (const [i, read] of readers.entries()) {
                show(i);
                const draft = read();
                if (!draft) return false;
                drafts.push(draft);
            }
            next = writeBlocks(original, blocks, drafts);
            return true;
        },
    });
    if (result === context.POPUP_RESULT.AFFIRMATIVE && next !== undefined && next !== original && writable()) {
        editor.value = next;
        editor.dispatchEvent(new Event('input', { bubbles: true }));
        if (source.matches(quickPromptSelector) && document.activeElement !== source) {
            source.dispatchEvent(new FocusEvent('blur'));
        }
    }
}

export const plistEditor = {
    id: 'plist-editor',
    label: 'PLists 编辑器',
    renderSettings(canvas, config) {
        renderLocations(canvas, config);
        const sizeLabel = element('label', '编辑窗口大小 ');
        const size = element('select');
        for (const percent of windowSizes) size.append(new Option(percent + '%', String(percent)));
        size.value = String(windowSize(config));
        size.addEventListener('change', () => { config.windowSize = Number(size.value); });
        sizeLabel.append(size);
        canvas.append(sizeLabel);
        const prefixSettings = element('details');
        prefixSettings.append(element('summary', '新增属性前缀'));
        const prefixFields = [];
        for (const { id, label } of locations) {
            const field = element('label', label);
            const input = element('input');
            input.className = 'text_pole';
            input.value = prefixFor(config, id);
            input.placeholder = '无前缀';
            input.addEventListener('input', () => {
                config.prefixes ??= {};
                config.prefixes[id] = input.value;
            });
            field.append(input);
            prefixSettings.append(field);
            prefixFields.push(input);
        }
        canvas.append(prefixSettings);
        canvas.append(element('h4', '常用属性与参数'));
        const section = box('st-plist');
        canvas.append(section);
        const read = rowList(section, config.presets ?? defaults);
        return () => {
            for (const input of prefixFields) {
                if (/[:：=;；\[\]]/u.test(input.value) || splitTraits(input.value) === null) {
                    prefixSettings.open = true;
                    return invalid(input, '请配对括号，并避开属性分隔符和方括号。');
                }
            }
            const presets = read();
            if (!presets) return false;
            config.presets = presets;
            return true;
        };
    },
    onSettingsChanged() { refreshTool?.(); },
    start(context, getConfig, updateConfig) {
        const views = new Map();
        function refresh() {
            const config = getConfig();
            for (const [editor, view] of views) {
                const { source, location } = locateEditor(editor);
                if (editor.isConnected && source === view.source && location && isEnabled(location, config)) continue;
                view.remove();
                views.delete(editor);
            }
            for (const editor of document.querySelectorAll(editorSelector)) {
                if (views.has(editor)) continue;
                const { source, location } = locateEditor(editor);
                if (!location || !isEnabled(location, config)) continue;
                const toolbar = getToolbar(editor);
                const button = action('', () => {
                    if ([editor, source].some(node => node.matches(':disabled, [readonly]'))) return;
                    void edit(context, editor, source, location.id, getConfig(), updateConfig, () => views.get(editor) === view);
                });
                button.className = 'st-my-tweaks-plist-button';
                button.title = '编辑 PLists';
                button.setAttribute('aria-label', button.title);
                button.setAttribute('aria-haspopup', 'dialog');
                const icon = element('i');
                icon.className = 'fa-solid fa-list';
                icon.setAttribute('aria-hidden', 'true');
                button.append(icon);
                toolbar.append(button);
                const view = { source, remove() {
                    button.remove();
                    if (!toolbar.childElementCount) toolbar.remove();
                } };
                views.set(editor, view);
            }
        }
        const observer = new MutationObserver(records => { if (editorsChanged(records)) refresh(); });
        observer.observe(document.body, { childList: true, subtree: true });
        refreshTool = refresh;
        refresh();
        return () => {
            observer.disconnect();
            refreshTool = undefined;
            for (const view of views.values()) view.remove();
            views.clear();
        };
    },
};
