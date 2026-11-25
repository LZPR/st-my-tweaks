import { initialPose } from './pose.js';

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

export function presetTool({ getLibrary, saveLibrary, people, currentId, apply, dismiss }) {
    const box = document.createElement('section');
    box.className = 'stmt-preset-tool';
    box.hidden = true;
    box.innerHTML = '<div class="stmt-preset-heading"><h3>单人姿态预设</h3><button type="button" aria-label="关闭预设">×</button></div>'
        + '<label>目标人物<select data-target></select></label>'
        + '<label>搜索预设<input type="search" placeholder="输入姿态名称"></label>'
        + '<select aria-label="匹配的预设" size="4" data-results></select><button data-load>应用到目标人物</button>'
        + '<label>保存目标人物的姿态<input maxlength="80" placeholder="新预设名称"></label><button data-save>保存预设</button><small role="status"></small>';
    const q = s => box.querySelector(s);
    const target = q('[data-target]'), search = q('[type=search]'), results = q('[data-results]'), name = q('[maxlength]'), status = q('[role=status]');
    const targetPerson = () => people().find(p => p.id === target.value);
    function list() {
        const query = search.value.trim().toLocaleLowerCase();
        const matches = getLibrary().filter(p => p.name.toLocaleLowerCase().includes(query));
        results.replaceChildren(...matches.map(p => new Option(p.name, p.name)));
        results.selectedIndex = matches.length ? 0 : -1;
        q('[data-load]').disabled = !matches.length;
        status.textContent = matches.length ? '' : '没有匹配的预设';
    }
    search.oninput = list;
    q('.stmt-preset-heading button').onclick = dismiss;
    q('[data-load]').onclick = () => {
        const item = getLibrary().find(p => p.name === results.value);
        if (item && targetPerson()) { apply(targetPerson(), item); dismiss(); }
    };
    q('[data-save]').onclick = () => {
        const title = name.value.trim();
        const person = targetPerson();
        if (!person) { status.textContent = '请重新选择目标人物。'; return; }
        if (!title) { status.textContent = '请填写预设名称。'; name.focus(); return; }
        if (getLibrary().some(p => p.name === title)) { status.textContent = '已有同名预设，请换一个名称。'; return; }
        saveLibrary([...getLibrary(), { name: title, points: structuredClone(person.points) }]);
        name.value = search.value = '';
        list();
        results.value = title;
        status.textContent = '已保存「' + title + '」';
    };
    return { box, open() {
        target.replaceChildren(...people().map(p => new Option(p.id + ' · ' + p.name, p.id)));
        target.value = currentId();
        search.value = name.value = '';
        list();
        box.hidden = false;
        target.focus({ preventScroll: true });
    } };
}
