import { drawPose, initialPose } from './pose.js';

const libraryVersion = 1;

function builtin(name, changes = {}) {
    const points = initialPose();
    for (const [joint, point] of Object.entries(changes)) points[joint] = point;
    return { name, points };
}

const defaults = [
    builtin('自然站立'),
    builtin('双臂平举', { 3: [100, 115], 4: [45, 115], 6: [300, 115], 7: [355, 115] }),
    builtin('右手挥手', { 3: [111, 91], 4: [119, 36] }),
    builtin('双手叉腰', { 3: [110, 161], 4: [163, 194], 6: [290, 161], 7: [237, 194] }),
    builtin('坐姿', { 9: [113, 242], 10: [110, 320], 12: [284, 242], 13: [285, 320] }),
    builtin('迈步', { 3: [126, 174], 4: [157, 215], 6: [285, 160], 7: [304, 207], 9: [126, 290], 10: [96, 365], 12: [267, 301], 13: [303, 365] }),
];

export function presets(config) {
    return config.posePresets ?? defaults;
}

// Preserve the target's hip midpoint where the board bounds allow it.
export function placePreset(points, target) {
    const offset = axis => {
        const shift = Math.round((target[8][axis] + target[11][axis] - points[8][axis] - points[11][axis]) / 2);
        const values = points.map(p => p[axis]);
        return Math.max(12 - Math.min(...values), Math.min((axis ? 428 : 388) - Math.max(...values), shift));
    };
    const dx = offset(0), dy = offset(1);
    return points.map(([x, y]) => [x + dx, y + dy]);
}

export function encodePresets(items) {
    return JSON.stringify({ version: libraryVersion, presets: items }, null, 2);
}

export function mergePresets(current, text) {
    const data = JSON.parse(text);
    if (data?.version !== libraryVersion || !Array.isArray(data.presets)) throw Error('请选择版本 1 的姿态预设 JSON 文件。');
    const result = [...current];
    for (const entry of data.presets) {
        const name = typeof entry?.name === 'string' && entry.name.trim();
        const points = entry?.points;
        if (!name || name.length > 80 || !Array.isArray(points) || points.length !== 18 ||
            !points.every(p => Array.isArray(p) && p.length === 2 && p.every((v, axis) =>
                Number.isInteger(v) && v >= 12 && v <= (axis ? 428 : 388)))) throw Error('预设名称或关节坐标无效，本次导入已取消。');
        if (result.some(p => p.name === name && JSON.stringify(p.points) === JSON.stringify(points))) continue;
        if (result.some(p => p.name === name)) throw Error('已有同名但姿态不同的预设「' + name + '」。请修改名称后导入。');
        result.push({ name, points });
    }
    return result;
}

export function matchingPresets(items, search) {
    const query = search.trim().toLocaleLowerCase();
    return items.filter(item => item.name.toLocaleLowerCase().includes(query));
}

export function poseThumbnail(points) {
    const canvas = document.createElement('canvas');
    canvas.className = 'stmt-preset-thumb';
    canvas.width = canvas.height = 192;
    canvas.setAttribute('aria-hidden', 'true');
    const xs = points.map(p => p[0]), ys = points.map(p => p[1]);
    const left = Math.min(...xs), right = Math.max(...xs), top = Math.min(...ys), bottom = Math.max(...ys);
    const scale = 168 / Math.max(24, right - left, bottom - top);
    const ctx = canvas.getContext('2d');
    ctx.setTransform(scale, 0, 0, scale, 96 - scale * (left + right) / 2, 96 - scale * (top + bottom) / 2);
    drawPose(ctx, points);
    return canvas;
}

export const searchField = '<label class="stmt-library-search"><i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i>'
    + '<input type="search" placeholder="搜索预设" aria-label="搜索预设"></label>';

export function presetTool({ getLibrary, saveLibrary, people, currentId, apply, dismiss }) {
    const box = document.createElement('section');
    box.className = 'stmt-preset-tool';
    box.hidden = true;
    box.innerHTML = '<div class="stmt-preset-heading"><h3><i class="fa-solid fa-layer-group" aria-hidden="true"></i> 姿态预设</h3><button type="button" aria-label="关闭预设">×</button></div>'
        + '<label class="stmt-preset-target">目标人物<select data-target></select></label>'
        + '<div class="stmt-preset-tabs" role="group" aria-label="预设操作"><button data-tab="load">加载预设</button><button data-tab="save">保存预设</button></div>'
        + '<div data-pane="load" class="stmt-library">' + searchField + '<div class="stmt-library-list" data-results></div></div>'
        + '<div data-pane="save" class="stmt-preset-save" hidden><div data-preview></div><label>预设名称<input maxlength="80" placeholder="为当前姿态命名"></label>'
        + '<button data-save><i class="fa-solid fa-bookmark" aria-hidden="true"></i> 保存到预设库</button></div><small role="status"></small>';
    const q = s => box.querySelector(s);
    const target = q('[data-target]'), search = q('[type=search]'), results = q('[data-results]'), name = q('[maxlength]'), status = q('[role=status]');
    const targetPerson = () => people().find(p => p.id === target.value);
    function list() {
        const matches = matchingPresets(getLibrary(), search.value);
        results.replaceChildren(...matches.map(item => {
            const row = document.createElement('button');
            row.type = 'button';
            row.className = 'stmt-library-row';
            row.innerHTML = '<span></span><i class="fa-solid fa-arrow-right" aria-hidden="true"></i>';
            row.firstChild.textContent = item.name;
            row.prepend(poseThumbnail(item.points));
            row.setAttribute('aria-label', '加载「' + item.name + '」到目标人物');
            row.onclick = () => {
                const person = targetPerson();
                if (person) { apply(person, item); dismiss(); }
            };
            return row;
        }));
        if (!matches.length) results.textContent = search.value ? '没有匹配的预设' : '预设库为空';
    }
    function preview() {
        const person = targetPerson();
        q('[data-preview]').replaceChildren(...(person ? [poseThumbnail(person.points)] : []));
    }
    function show(tab) {
        for (const button of box.querySelectorAll('[data-tab]')) button.setAttribute('aria-pressed', String(button.dataset.tab === tab));
        for (const pane of box.querySelectorAll('[data-pane]')) pane.hidden = pane.dataset.pane !== tab;
        status.textContent = '';
        if (tab === 'load') list();
        else preview();
    }
    target.onchange = preview;
    for (const button of box.querySelectorAll('[data-tab]')) button.onclick = () => show(button.dataset.tab);
    search.oninput = list;
    q('.stmt-preset-heading button').onclick = dismiss;
    q('[data-save]').onclick = () => {
        const title = name.value.trim(), person = targetPerson();
        if (!person) { status.textContent = '请重新选择目标人物。'; return; }
        if (!title) { status.textContent = '请填写预设名称。'; name.focus(); return; }
        if (getLibrary().some(p => p.name === title)) { status.textContent = '已有同名预设，请换一个名称。'; return; }
        saveLibrary([...getLibrary(), { name: title, points: structuredClone(person.points) }]);
        name.value = search.value = '';
        status.textContent = '已保存「' + title + '」';
    };
    return { box, open() {
        target.replaceChildren(...people().map(p => new Option(p.id + ' · ' + p.name, p.id)));
        target.value = currentId();
        search.value = name.value = '';
        show('load');
        box.hidden = false;
        q('[data-tab=load]').focus({ preventScroll: true });
    } };
}
