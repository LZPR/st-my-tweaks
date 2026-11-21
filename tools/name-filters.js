import { filterOptions } from './name-library.js';

const labels = { gender: '性别', style: '风格', length: '姓名字数', surname: '姓氏' };

function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
}

function surnamePicker(grid, values, selected) {
    const details = element('details', 'nf-surnames');
    const summary = element('summary');
    const search = element('input', 'text_pole');
    search.type = 'search';
    search.placeholder = '搜索姓氏';
    search.setAttribute('aria-label', '搜索姓氏');
    const empty = element('p', 'nf-muted', '没有匹配的姓氏');
    empty.hidden = true;
    search.addEventListener('input', () => {
        const query = search.value.trim();
        let count = 0;
        for (const button of grid.children) {
            button.hidden = !button.textContent.includes(query);
            if (!button.hidden) count++;
        }
        empty.hidden = count > 0;
    });
    function refresh() {
        summary.textContent = selected.length ? selected.join('、') : `选择姓氏（${values.length}）`;
    }
    refresh();
    details.append(summary, search, grid, empty);
    return { details, refresh };
}

function resetButton(text, label, action) {
    const button = element('button', 'nf-reset', text);
    button.type = 'button';
    button.setAttribute('aria-label', label);
    button.addEventListener('click', action);
    return button;
}

export async function editFilters(context, library, filters) {
    const content = element('div', 'st-name-filters');
    const header = element('header', 'nf-header');
    const title = element('h3', '', '随机取名条件');
    const help = element('p', 'nf-muted', '每项可多选，姓名字数包含姓氏。');
    const clearGroups = [];
    const resetAll = resetButton('全部不限', '清除所有取名条件', () => clearGroups.forEach(clear => clear()));
    const refreshAll = () => resetAll.disabled = Object.values(filters).every(values => !values.length);
    const titleRow = element('div', 'nf-title-row');
    titleRow.append(title, resetAll);
    header.append(titleRow, help);
    content.append(header);
    for (const [key, values] of Object.entries(filterOptions(library))) {
        const section = element('section', 'nf-section');
        const heading = element('div', 'nf-heading');
        heading.append(element('h4', '', labels[key]));
        const grid = element('div', 'nf-options');
        grid.setAttribute('role', 'group');
        grid.setAttribute('aria-label', labels[key]);
        const selected = filters[key];
        const picker = key === 'surname' ? surnamePicker(grid, values, selected) : null;
        function refresh() {
            reset.disabled = !selected.length;
            picker?.refresh();
            refreshAll();
        }
        function clear() {
            selected.length = 0;
            for (const button of grid.children) button.setAttribute('aria-pressed', 'false');
            refresh();
        }
        clearGroups.push(clear);
        const reset = resetButton('不限', `清除${labels[key]}条件`, clear);
        heading.append(reset);
        refresh();
        for (const value of values) {
            const button = element('button', 'nf-option', key === 'length' ? `${value} 字` : value);
            button.type = 'button';
            button.setAttribute('aria-pressed', String(selected.includes(value)));
            button.addEventListener('click', () => {
                const index = selected.indexOf(value);
                if (index < 0) selected.push(value);
                else selected.splice(index, 1);
                button.setAttribute('aria-pressed', String(index < 0));
                refresh();
            });
            grid.append(button);
        }
        section.append(heading, picker?.details ?? grid);
        content.append(section);
    }
    const result = await context.callGenericPopup(content, context.POPUP_TYPE.CONFIRM, '', {
        okButton: '保存条件', cancelButton: '取消', leftAlign: true, allowVerticalScrolling: true,
    });
    return result === context.POPUP_RESULT.AFFIRMATIVE;
}
