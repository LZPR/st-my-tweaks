import { editorSelector, editorsChanged, getToolbar, isEnabled, locateEditor, locations, quickPromptSelector, renderLocations } from './prompt-toolbar.js';
import { attributeName, findBlocks, maskMacros, splitTraits, writeBlocks } from './plist-format.js';
import { sortView } from './plist-sort.js';
import { openChoice } from './plist-choice.js';
import { highlightSection } from './plist-find.js';
import { markDuplicate, repeated } from './plist-duplicates.js';
import { parameterSelection } from './plist-selection.js';
import { defaults, getPresets } from './plist-presets.js';

let refreshTool;
let nextParameterEdit = 0;
const windowSizes = [70, 85, 95, 100];
const defaultPrefixes = { character: "{{char}}'s ", persona: "{{user}}'s " };

function prefixFor(config, locationId) {
    return config.prefixes?.[locationId] ?? defaultPrefixes[locationId] ?? '';
}

function maxRows(config) {
    return Number.isSafeInteger(config.maxRows) && config.maxRows > 0 ? config.maxRows : 6;
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
    fold: 'm5 9 7 7 7-7',
    find: 'M16 16l5 5M18 10a8 8 0 1 1-16 0 8 8 0 1 1 16 0',
    add: 'M12 5v14M5 12h14',
    block: 'M14 3H5v16h7M9 8h7M9 12h4M18 13v8M14 17h8',
    remove: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 10v7M14 10v7',
    done: 'm5 12 4 4L19 6',
    close: 'm6 6 12 12M6 18 18 6',
    undo: 'M9 4 3 10l6 6M3 10h11a6 6 0 0 1 0 12',
    redo: 'm15 4 6 6-6 6m6-6H10a6 6 0 0 0 0 12',
    sort: 'M6 3v18m-4-14 4-4 4 4m4 10 4 4 4-4M18 3v18',
    library: 'M4 4h6v16H4zM13 5l5-1 3 15-5 1z',
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

function choiceButton(title, labels, choose, allowCustom = false) {
    const button = action(title, () => openChoice({ title, labels, choose, allowCustom }));
    button.className = 'pl-choice-trigger';
    button.setAttribute('aria-haspopup', 'dialog');
    return button;
}

function invalid(input, message) {
    input.focus();
    toastr.error(message, 'PLists 编辑器');
    return false;
}

function macroField() {
    const field = element('textarea');
    field.rows = 1;
    field.dataset.macros = 'true';
    field.dataset.macrosAutocomplete = 'always';
    return field;
}

function wrapper(value) {
    if (/^"(?:\\[\s\S]|[^"\\])*"$/u.test(value)) return '"';
    if (/^“(?:\\[\s\S]|[^”\\])*”$/u.test(value)) return '”';
    return '';
}

function unquote(value) {
    const end = wrapper(value);
    if (!end) return value;
    return value.slice(1, -1).replace(/\\([\\"”])/gu, (pair, c) => c === end || c === '\\' ? c : pair);
}

function enclose(value, end) {
    return (end === '”' ? '“' : '"') + value.replaceAll('\\', '\\\\').replaceAll(end, '\\' + end) + end;
}

function rowList(container, initial, presets = [], prefix = '', usePrefix = () => false, quoteToggle, changed, signal) {
    const list = box('pl-rows');
    const rows = [];
    function markNames() {
        const names = rows.map(row => attributeName(row.appliedPrefix, row.key.value));
        const duplicates = repeated(names);
        rows.forEach((row, i) => markDuplicate(row.key, duplicates.has(names[i]), '片段内属性重复'));
    }
    let pending;
    const finish = () => !pending || pending();
    function add({ name = '', value = '', draft } = {}, appliedPrefix = '') {
        const line = box('pl-row');
        const keyBox = box('pl-key');
        const key = macroField();
        key.value = appliedPrefix && name.startsWith(appliedPrefix) ? name.slice(appliedPrefix.length) : name;
        key.placeholder = '属性名称';
        key.setAttribute('aria-label', '属性名称');
        // Size to soft-wrapped text even when a previously hidden section opens.
        const measure = element('span');
        measure.setAttribute('aria-hidden', 'true');
        const measureKey = () => { measure.textContent = key.value + ' '; };
        measureKey();
        key.addEventListener('input', measureKey);
        key.addEventListener('input', markNames);
        key.addEventListener('input', () => changed?.('name-' + rows.indexOf(row)));
        key.addEventListener('scroll', () => { measure.scrollTop = key.scrollTop; });
        keyBox.append(measure, key);
        const nameCell = box('pl-name-cell');
        const prefixTag = element('small', appliedPrefix);
        prefixTag.hidden = !appliedPrefix;
        nameCell.append(prefixTag);
        nameCell.append(keyBox);
        const initialItems = (splitTraits(value) ?? [value]).map(x => x.trim()).filter(Boolean);
        const items = [...initialItems];
        const display = raw => quoteToggle?.checked ? unquote(raw) : raw;
        let refreshDrawer;
        const chips = box('pl-chips');
        const parameters = box('pl-parameters');
        const count = box('pl-count', 'small');
        const fold = iconButton('折叠参数', 'fold', () => {
            if (!drawer.hidden && !finish()) return;
            parameters.hidden = !parameters.hidden;
            fold.title = parameters.hidden ? '展开参数' : '折叠参数';
            fold.setAttribute('aria-label', fold.title);
            fold.setAttribute('aria-expanded', String(!parameters.hidden));
        });
        fold.setAttribute('aria-expanded', 'true');
        nameCell.prepend(fold);
        parameters.append(element('small', '参数'), chips, count);
        const drawer = box('pl-drawer');
        drawer.hidden = true;
        const row = { key, appliedPrefix, read: () => items.length === initialItems.length && items.every((v, i) => v === initialItems[i])
            ? value : items.join(', ') };
        rows.push(row);

        function inspect(index, restoredDraft) {
            if (!finish()) return;
            index ??= items.length;
            const editing = index < items.length;
            const input = macroField();
            let raw = editing ? items[index] : '';
            let hidden = Boolean(quoteToggle?.checked);
            input.value = display(raw);
            function rawInput() {
                const originalDisplay = hidden ? unquote(raw) : raw;
                if (input.value === originalDisplay) return raw;
                const end = hidden && wrapper(raw);
                return end ? enclose(input.value, end) : input.value.trim();
            }
            input.placeholder = '输入一个参数';
            input.setAttribute('aria-label', '参数内容');
            const close = () => {
                pending = undefined;
                row.draft = undefined;
                refreshDrawer = undefined;
                drawer.hidden = true;
                drawer.onkeydown = null;
                drawer.replaceChildren();
                paint();
            };
            const group = restoredDraft?.group ?? ++nextParameterEdit;
            const originalRaw = raw;
            row.draft = () => {
                const text = rawInput();
                return text === originalRaw ? undefined : { index, text, group };
            };
            input.addEventListener('input', () => changed?.(group));
            const commit = () => {
                let next = rawInput();
                if (!next && editing) return invalid(input, '请输入参数，或点击删除图标。');
                if (next && (/[\[\]]/u.test(maskMacros(next)) || splitTraits(next, ';；')?.length !== 1))
                    return invalid(input, '请配对括号，并避开方括号和顶层分号。');
                if (splitTraits(next).length > 1) next = enclose(next, '"');
                if (next) items[index] = next;
                close();
                changed?.(group);
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
                changed?.(group);
                chips.children[Math.min(index, items.length)].focus();
            }));
            const cancel = () => { close(); changed?.(group); chips.children[index].focus(); };
            drawer.append(iconButton('取消参数编辑', 'close', cancel));
            const renderChoices = () => {
                drawer.querySelector('.pl-choice-trigger')?.remove();
                if (editing) return;
                const name = key.value.trim();
                const preset = presets.find(p => p.name === name)
                    ?? presets.find(p => prefix && prefix + p.name === name);
                const choices = (splitTraits(preset?.value ?? '') ?? []).map(v => v.trim()).filter(v => v && !items.includes(v));
                if (choices.length) drawer.append(choiceButton('选择常用参数', choices.map(display), i => {
                    raw = choices[i];
                    input.value = display(raw);
                    commitFocus();
                }));
            };
            renderChoices();
            refreshDrawer = () => {
                raw = rawInput();
                hidden = quoteToggle.checked;
                input.value = display(raw);
                renderChoices();
            };
            // ST consumes completion keys on the textarea. Handle remaining editing keys as they bubble.
            drawer.onkeydown = event => {
                if (event.target !== input || event.isComposing || event.defaultPrevented) return;
                if (event.key === 'Escape' || (event.key === 'Enter' && !event.shiftKey)) {
                    event.preventDefault();
                    event.stopPropagation();
                    if (event.key === 'Escape') cancel();
                    else commitFocus();
                }
            };
            drawer.hidden = false;
            if (restoredDraft) {
                raw = restoredDraft.text;
                input.value = display(raw);
            } else {
                input.focus();
                input.select();
            }
        }
        function paint() {
            count.textContent = items.length + ' 个参数';
            chips.replaceChildren();
            const names = items.map(unquote);
            const duplicates = repeated(names);
            items.forEach((item, i) => {
                const label = display(item);
                const chip = action(label, () => inspect(i));
                chip.className = 'pl-chip';
                markDuplicate(chip, duplicates.has(names[i]), '属性内参数重复');
                chip.title = '编辑参数 · ' + label;
                chips.append(chip);
            });
            chips.append(iconButton('添加参数', 'add', () => inspect()));
        }
        paint();
        const refreshQuotes = () => { paint(); refreshDrawer?.(); };
        quoteToggle?.addEventListener('change', refreshQuotes, { signal });
        const menu = box('pl-row-menu', 'details');
        const trigger = element('summary', '…');
        trigger.setAttribute('aria-label', '属性操作');
        trigger.title = '属性操作';
        const actions = box('pl-row-actions');
        if (prefix) {
            const togglePrefix = action(appliedPrefix ? '移除前缀' : '添加前缀', () => {
                row.appliedPrefix = row.appliedPrefix ? '' : prefix;
                prefixTag.textContent = row.appliedPrefix;
                prefixTag.hidden = !row.appliedPrefix;
                togglePrefix.textContent = row.appliedPrefix ? '移除前缀' : '添加前缀';
                menu.open = false;
                trigger.focus();
                markNames();
                changed?.();
            });
            actions.append(togglePrefix);
        }
        menu.append(trigger, actions);
        menu.addEventListener('focusout', event => {
            if (!menu.contains(event.relatedTarget)) menu.open = false;
        });
        menu.addEventListener('keydown', event => {
            if (event.key === 'Escape' && menu.open) {
                event.preventDefault();
                event.stopPropagation();
                menu.open = false;
                trigger.focus();
            }
        });
        const remove = action('删除属性', () => {
            if (!drawer.hidden) pending = undefined;
            quoteToggle?.removeEventListener('change', refreshQuotes);
            rows.splice(rows.indexOf(row), 1);
            markNames();
            line.remove();
            changed?.();
        });
        actions.append(remove);
        line.append(nameCell, parameters, menu, drawer);
        list.append(line);
        if (draft) inspect(draft.index, draft);
        return key;
    }
    for (const row of initial) {
        if ('appliedPrefix' in row) {
            add({ ...row, name: row.appliedPrefix + row.name }, row.appliedPrefix);
            continue;
        }
        const suffix = row.name.startsWith(prefix) ? row.name.slice(prefix.length) : '';
        // Split only when rejoining the displayed fields will reproduce the original name.
        const matchesPrefix = suffix && suffix === suffix.trim() && !suffix.startsWith(prefix);
        add(row, matchesPrefix ? prefix : '');
    }
    markNames();
    const addRow = choiceButton('添加属性', presets.map(p => p.name), (i, text) => {
        if (finish()) {
            add({ name: presets[i]?.name ?? text }, usePrefix() ? prefix : '').focus();
            markNames();
            changed?.();
        }
    }, true);
    const foot = box('pl-add-row');
    foot.append(addRow);
    container.append(list, foot);
    function read() {
        if (!finish()) return null;
        const result = [];
        for (const row of rows) {
            const name = row.key.value.trim();
            const value = row.read();
            if (!name && !value) continue;
            if (!name || /[:：=;；\[\]\r\n]/u.test(maskMacros(name)) || splitTraits(name) === null || !value) {
                invalid(row.key, !value ? '请至少添加一个参数，或删除此属性。' : '请填写有效的属性名称。');
                return null;
            }
            result.push({ name: attributeName(row.appliedPrefix, name), value });
        }
        return result;
    }
    return { read, finish, get count() { return rows.length; }, snapshot: () => rows.map(row => ({
        name: row.key.value, appliedPrefix: row.appliedPrefix, value: row.read(), draft: row.draft?.(),
    })) };
}

async function edit(context, editor, source, locationId, getConfig, updateConfig, active) {
    const config = getConfig();
    const original = editor.value;
    const sourceValue = source.value;
    const blocks = findBlocks(original);
    const panel = box('st-plist');
    panel.style.setProperty('--pl-max-rows', maxRows(config));
    panel.dataset.windowSize = windowSize(config);
    const heading = box('pl-heading');
    const prefix = prefixFor(config, locationId);
    const quoteLabel = box('pl-toggle', 'label');
    const quoteToggle = element('input');
    quoteToggle.type = 'checkbox';
    quoteToggle.checked = config.hideQuotes === true;
    quoteToggle.addEventListener('change', () => updateConfig({ hideQuotes: quoteToggle.checked }));
    quoteLabel.append(quoteToggle, box('pl-check', 'span'), '隐藏引号');
    const picker = element('select');
    picker.setAttribute('aria-label', '切换片段');
    const navigation = box('pl-navigation');
    const pickerBox = box('pl-picker');
    pickerBox.append(picker);
    const undo = iconButton('撤销', 'undo', () => travel(-1));
    const redo = iconButton('重做', 'redo', () => travel(1));
    const organize = iconButton('整理模式', 'sort', () => {
        if (!sorting) {
            const current = picker.selectedIndex;
            for (const [i, section] of readers.entries()) {
                show(i);
                if (!section.finish()) return;
            }
            show(current);
        }
        setSorting(!sorting);
    });
    organize.setAttribute('aria-pressed', 'false');
    const newBlock = iconButton('新增片段', 'block', () => {
        addBlock([]);
        record();
    });
    const findButton = iconButton('查找当前片段', 'find', () => toggleFind(findBar.hidden));
    findButton.setAttribute('aria-expanded', 'false');
    navigation.append(findButton, undo, redo, organize, pickerBox, newBlock);
    const title = box('pl-title');
    const total = box('pl-total', 'small');
    title.append(element('h3', 'PLists 编辑器'), total);
    heading.append(title, quoteLabel, navigation);
    panel.append(heading);
    const sections = element('div');
    const findBar = box('pl-find');
    findBar.hidden = true;
    const query = element('input');
    query.type = 'search';
    query.placeholder = '查找当前片段';
    query.setAttribute('aria-label', query.placeholder);
    const matchCount = element('small');
    matchCount.setAttribute('role', 'status');
    findBar.append(query, matchCount, iconButton('关闭查找', 'close', () => toggleFind(false)));
    panel.append(findBar);
    let highlightedSection;
    function refreshFind() {
        const current = sections.children[picker.selectedIndex];
        if (highlightedSection && (highlightedSection !== current || findBar.hidden)) {
            highlightSection(highlightedSection, '');
            highlightedSection = undefined;
        }
        if (findBar.hidden || !current) return;
        const count = highlightSection(current, query.value);
        highlightedSection = current;
        matchCount.textContent = count + ' 处匹配';
    }
    function toggleFind(open) {
        findBar.hidden = !open;
        findButton.setAttribute('aria-expanded', String(open));
        refreshFind();
        (open ? query : findButton).focus();
    }
    query.addEventListener('input', refreshFind);
    query.addEventListener('keydown', event => {
        if (!event.isComposing && (event.key === 'Enter' || event.key === 'Escape')) {
            event.preventDefault();
            event.stopPropagation();
            if (event.key === 'Escape') toggleFind(false);
        }
    });
    const sortPanel = element('div');
    sortPanel.hidden = true;
    const hint = element('p', '拖动属性或参数可跨组排序。也可先点选一项，再点选插入位置。');
    hint.className = 'pl-sort-hint';
    let sorting = false;
    const readers = [];
    const batch = box('st-plist-batch');
    batch.setAttribute('role', 'toolbar');
    batch.setAttribute('aria-label', '参数多选');
    batch.hidden = true;
    const selectedCount = element('strong');
    const removeSelected = iconButton('删除', 'remove', () => {
        const state = snapshot();
        const index = picker.selectedIndex;
        visitSelected(state, (row, values, chosen) => {
            row.value = values.filter((_, i) => !chosen.has(i)).join(', ');
        });
        selection.exit();
        restore(state, index);
        record(undefined, index);
    });
    const storeSelected = iconButton('加入词库', 'library', async () => {
        const values = [];
        visitSelected(snapshot(), (_, items, chosen) => {
            for (const i of chosen) values.push(items[i]);
        });
        const presets = getPresets(getConfig());
        const form = box('pl-library-target');
        form.append(element('h3', '加入常用词库'));
        const label = element('label', '目标属性');
        const target = element('select');
        presets.forEach((p, i) => target.append(new Option(p.name, String(i))));
        target.append(new Option('新建属性…', 'new'));
        const name = element('input');
        name.className = 'text_pole';
        name.placeholder = '新属性名称';
        name.setAttribute('aria-label', name.placeholder);
        const toggleName = () => { name.hidden = target.value !== 'new'; };
        target.addEventListener('change', toggleName);
        toggleName();
        label.append(target);
        form.append(label, name, element('p', '已选 ' + values.length + ' 个参数，重复项会自动跳过。'));
        const result = await context.callGenericPopup(form, context.POPUP_TYPE.CONFIRM, '', {
            okButton: '添加', cancelButton: '取消', leftAlign: true,
            onClosing(popup) {
                if (popup.result !== context.POPUP_RESULT.AFFIRMATIVE || target.value !== 'new') return true;
                const text = name.value.trim();
                return Boolean(text && !/[:：=;；\[\]\r\n]/u.test(maskMacros(text)) && splitTraits(text))
                    || invalid(name, '请填写有效的词库属性名称。');
            },
        });
        if (result !== context.POPUP_RESULT.AFFIRMATIVE || !panel.isConnected) return;
        const next = structuredClone(getPresets(getConfig()));
        const targetName = target.value === 'new' ? name.value.trim() : presets[Number(target.value)].name;
        const attribute = next.find(row => row.name === targetName) ?? { name: targetName, value: '' };
        const known = new Set((splitTraits(attribute.value) ?? []).map(v => unquote(v.trim())));
        const additions = [];
        for (const value of values) {
            const text = unquote(value);
            if (known.has(text)) continue;
            known.add(text);
            additions.push(value);
        }
        if (!next.includes(attribute)) next.push(attribute);
        if (additions.length) {
            attribute.value = [attribute.value, ...additions].filter(Boolean).join(', ');
            updateConfig({ presets: next });
        }
        const state = snapshot();
        selection.exit();
        restore(state, picker.selectedIndex);
        toastr.success('已添加 ' + additions.length + ' 个参数。', '常用词库');
    });
    const done = iconButton('完成', 'done', () => selection.exit());
    for (const button of [removeSelected, storeSelected, done]) button.append(button.title);
    batch.append(selectedCount, removeSelected, storeSelected, done);
    batch.addEventListener('keydown', event => {
        if (event.key === 'Escape') {
            event.preventDefault();
            event.stopPropagation();
            selection.exit();
            picker.focus();
        }
    });
    const selection = parameterSelection(panel, sections, () => {
        const current = picker.selectedIndex;
        for (const [i, section] of readers.entries()) {
            show(i);
            if (!section.finish()) return false;
        }
        show(current);
        return true;
    }, (on, selected) => {
        if (batch.hidden === on) {
            if (on) panel.closest('dialog')?.querySelector('.popup-controls')?.before(batch);
            batch.hidden = !on;
            for (const el of [undo, redo, organize, newBlock, quoteLabel,
                ...sections.querySelectorAll('.pl-name-cell, .pl-row-menu, .pl-icon, .pl-add-row')]) el.inert = on;
        }
        selectedCount.textContent = '已选 ' + selected.size + ' 项';
        removeSelected.disabled = storeSelected.disabled = selected.size === 0;
    });
    function visitSelected(state, visit) {
        Array.from(sections.children).forEach((section, b) => {
            section.querySelectorAll('.pl-row').forEach((line, r) => {
                const chosen = new Set();
                line.querySelectorAll('.pl-chip').forEach((chip, i) => {
                    if (selection.selected.has(chip)) chosen.add(i);
                });
                if (!chosen.size) return;
                const row = state[b][r];
                const values = (splitTraits(row.value) ?? [row.value]).map(v => v.trim()).filter(Boolean);
                visit(row, values, chosen);
            });
        });
    }
    let listeners = new AbortController();
    const history = [];
    let position = -1;
    function updateHeader() {
        undo.disabled = position <= 0;
        redo.disabled = position >= history.length - 1;
        total.textContent = '共 ' + readers.reduce((sum, section) => sum + section.count, 0) + ' 个属性';
    }
    function record(group, index = picker.selectedIndex) {
        refreshFind();
        const state = JSON.stringify(snapshot());
        if (history[position]?.state === state) return;
        history.splice(position + 1);
        if (position > 0 && group && history[position].group === group && history[position].index === index) {
            history.pop();
            position--;
        }
        if (history[position]?.state !== state) {
            history.push({ state, group, index });
            if (history.length > 101) history.shift();
            position = history.length - 1;
        }
        updateHeader();
    }
    function travel(direction) {
        const next = position + direction;
        if (!history[next]) return;
        const index = history[Math.max(position, next)].index;
        position = next;
        const state = JSON.parse(history[position].state);
        if (sorting && state.some(rows => rows.some(row => row.draft))) setSorting(false);
        restore(state, Math.min(index, state.length - 1));
        if (sorting) paintSort();
        updateHeader();
        const focusUndo = redo.disabled || (direction < 0 && !undo.disabled);
        (focusUndo ? undo : redo).focus();
    }
    function snapshot() {
        return readers.map(section => section.snapshot());
    }
    function restore(state, index) {
        listeners.abort();
        listeners = new AbortController();
        sections.replaceChildren();
        picker.replaceChildren();
        readers.length = 0;
        state.forEach(addBlock);
        show(index);
    }
    function paintSort() {
        sortPanel.replaceChildren(hint, sortView(snapshot(), raw => quoteToggle.checked ? unquote(raw) : raw, (state, index) => {
            restore(state, index);
            record(undefined, index);
            paintSort();
        }, unquote));
    }
    function setSorting(on) {
        if (on && !findBar.hidden) toggleFind(false);
        findButton.hidden = on;
        sorting = on;
        organize.setAttribute('aria-pressed', String(on));
        sections.hidden = pickerBox.hidden = newBlock.hidden = on;
        sortPanel.hidden = !on;
        if (on) paintSort();
        else sortPanel.replaceChildren();
    }
    quoteToggle.addEventListener('change', () => {
        if (sorting) paintSort();
        else queueMicrotask(refreshFind);
    });
    panel.addEventListener('keydown', event => {
        if (selection.active) {
            if (event.key === 'Escape') {
                event.preventDefault();
                event.stopPropagation();
                selection.exit();
            }
            return;
        }
        if (event.isComposing || event.altKey || !(event.ctrlKey || event.metaKey)) return;
        const key = event.key.toLowerCase();
        if (key === 'f' && !sorting) {
            event.preventDefault();
            event.stopPropagation();
            toggleFind(true);
            query.select();
            return;
        }
        if (event.target === query) return;
        if (key !== 'z' && key !== 'y') return;
        event.preventDefault();
        event.stopPropagation();
        travel(key === 'y' || event.shiftKey ? 1 : -1);
    });
    function show(index) {
        picker.selectedIndex = index;
        Array.from(sections.children).forEach((node, i) => { node.hidden = i !== index; });
        refreshFind();
    }
    picker.addEventListener('change', () => show(picker.selectedIndex));
    function addBlock(rows) {
        const section = box('pl-section');
        picker.append(new Option('片段 ' + (readers.length + 1)));
        const index = readers.length;
        readers.push(rowList(section, rows, getPresets(getConfig()), prefix, () => config.usePrefix !== false, quoteToggle,
            group => record(group, index), listeners.signal));
        sections.append(section);
        show(readers.length - 1);
    }
    blocks.forEach(block => addBlock(block.rows));
    if (!blocks.length) addBlock([]);
    show(0);
    record();
    panel.append(sections, batch, sortPanel);
    const writable = () => active() && editor.isConnected && source.isConnected &&
        ![editor, source].some(node => node.matches(':disabled, [readonly]')) &&
        original === editor.value && sourceValue === source.value;
    let next;
    const sourceChanged = '原编辑框已变更，请重新打开 PLists 编辑器。';
    const result = await context.callGenericPopup(panel, context.POPUP_TYPE.CONFIRM, '', {
        okButton: '保存', cancelButton: '取消', leftAlign: true, allowVerticalScrolling: true,
        onClosing(popup) {
            if (popup.result !== context.POPUP_RESULT.AFFIRMATIVE) return true;
            if (selection.active) selection.exit();
            if (!writable()) {
                toastr.error(sourceChanged, 'PLists 编辑器');
                return false;
            }
            const drafts = [];
            if (sorting) setSorting(false);
            for (const [i, { read }] of readers.entries()) {
                show(i);
                const draft = read();
                if (!draft) return false;
                drafts.push(draft);
            }
            next = writeBlocks(original, blocks, drafts);
            return true;
        },
    });
    if (result === context.POPUP_RESULT.AFFIRMATIVE && next !== undefined && next !== original) {
        if (!writable()) {
            toastr.error(sourceChanged, 'PLists 编辑器');
            return;
        }
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
        const rowsLabel = element('label', '编辑框上限行数 ');
        const limit = element('input');
        limit.type = 'number';
        limit.min = '1';
        limit.value = String(maxRows(config));
        limit.addEventListener('change', () => {
            if (limit.validity.valid && Number.isSafeInteger(limit.valueAsNumber))
                config.maxRows = limit.valueAsNumber;
            limit.value = String(maxRows(config));
        });
        rowsLabel.append(limit);
        canvas.append(sizeLabel, rowsLabel);
        const prefixSettings = element('details');
        prefixSettings.append(element('summary', '新增属性前缀'));
        const automatic = element('input');
        automatic.type = 'checkbox';
        automatic.checked = config.usePrefix !== false;
        automatic.addEventListener('change', () => { config.usePrefix = automatic.checked; });
        const automaticLabel = element('label');
        automaticLabel.append(automatic, ' 新增属性时自动添加前缀');
        prefixSettings.append(automaticLabel);
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
        const library = element('details');
        library.append(element('summary', '常用属性与参数'));
        const actions = box('pl-library-actions');
        const section = box('st-plist');
        const file = element('input');
        file.type = 'file';
        file.accept = '.json,application/json';
        file.hidden = true;
        let read, revision = 0, loading = false;
        function replaceLibrary(rows) {
            section.replaceChildren();
            read = rowList(section, rows).read;
        }
        file.addEventListener('change', async () => {
            const selected = file.files[0];
            if (!selected) return;
            const current = ++revision;
            file.value = '';
            loading = true;
            try {
                const rows = JSON.parse((await selected.text()).replace(/^\uFEFF/u, ''));
                if (current !== revision) return;
                if (!Array.isArray(rows) || !rows.every(row =>
                    typeof row?.name === 'string' && row.name.trim() && !/[:：=;；\[\]\r\n]/u.test(maskMacros(row.name))
                    && splitTraits(row.name) && typeof row.value === 'string' && row.value.trim()
                    && !/[\[\]]/u.test(maskMacros(row.value)) && splitTraits(row.value, ';；')?.length === 1
                    && splitTraits(row.value)?.every(item => item.trim()))) {
                    throw new Error();
                }
                replaceLibrary(rows.map(({ name, value }) => ({ name, value })));
                toastr.success('词库已导入，保存后生效。');
            } catch {
                if (current === revision) toastr.error('导入失败，请选择有效的 PLists 词库 JSON 文件。');
            } finally {
                if (current === revision) loading = false;
            }
        });
        actions.append(action('导入 JSON', () => file.click()), action('导出 JSON', () => {
            const rows = read();
            if (!rows) return;
            const url = URL.createObjectURL(new Blob([JSON.stringify(rows, null, 2)], { type: 'application/json' }));
            const link = element('a');
            link.href = url;
            link.download = 'plists-presets.json';
            link.click();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
        }), action('恢复默认', () => {
            revision++;
            loading = false;
            replaceLibrary(defaults);
            toastr.success('默认词库已载入，保存后生效。');
        }));
        library.append(actions, file, section);
        canvas.append(library);
        replaceLibrary(getPresets(config));
        return () => {
            if (loading) {
                toastr.info('正在读取词库文件，请稍后保存。');
                return false;
            }
            for (const input of prefixFields) {
                if (/[:：=;；\[\]]/u.test(maskMacros(input.value)) || splitTraits(input.value) === null) {
                    prefixSettings.open = true;
                    return invalid(input, '请配对括号，并避开属性分隔符和方括号。');
                }
            }
            const wasOpen = library.open;
            library.open = true;
            const presets = read();
            if (!presets) return false;
            library.open = wasOpen;
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
                    void edit(context, editor, source, location.id, getConfig, updateConfig, () => views.get(editor) === view);
                });
                button.className = 'st-my-tweaks-plist-button';
                button.title = '编辑 PLists';
                button.setAttribute('aria-label', button.title);
                button.setAttribute('aria-haspopup', 'dialog');
                const icon = element('i');
                icon.className = 'fa-solid fa-list';
                icon.setAttribute('aria-hidden', 'true');
                button.append(icon);
                toolbar.prepend(button);
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
