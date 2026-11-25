import { boardWidth, boardHeight, blockPath, drawBoard, boardFiles } from './scene-board.js';
import { sceneView } from './scene-view.js';

const palette = ['#88cbd3', '#819c72', '#d1ae79', '#b87262', '#657783', '#afa0be'];
const clamp = (n, lo, hi) => Math.max(lo, Math.min(n, hi));
const paths = {
    free: 'M3 17c4-9 6 6 10-3 M9 13l2-5 7-6 3 3-7 7z',
    rect: 'M4 5h16v14H4z', move: 'M5 3l15 9-7 2-3 7z',
    view: 'M8 12V6a1.5 1.5 0 0 1 3 0v5-7a1.5 1.5 0 0 1 3 0v7-6a1.5 1.5 0 0 1 3 0v7-4a1.5 1.5 0 0 1 3 0v6c0 5-3 8-7 8-3 0-5-2-7-5l-3-4c-1-2 1-3 3-2l2 2z',
    undo: 'M9 4 4 9l5 5 M5 9h9a6 6 0 0 1 0 12',
    redo: 'm15 4 5 5-5 5 M19 9h-9a6 6 0 0 0 0 12',
    delete: 'M4 7h16 M9 7V4h6v3 M6 7l1 14h10l1-14 M10 10v7 M14 10v7',
};
function icon(id) {
    return `<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"
        stroke-linecap="round" stroke-linejoin="round"><path d="${paths[id]}"/></svg>`;
}
function toolButton(id, label, attr) {
    return `<button type="button" ${attr}="${id}" aria-label="${label}" title="${label}">${icon(id)}</button>`;
}

export function createSceneEditor(saved) {
    const panel = document.createElement('section');
    panel.className = 'stmt-pose stmt-scene';
    panel.innerHTML = `<header><h2>场景编辑</h2><button type="button" data-new>新建画布</button></header>
        <div class="stmt-scene-layout"><section class="stmt-scene-stage">
        <div class="stmt-scene-tools" role="group" aria-label="画板工具">
            ${[['free','轮廓'], ['rect','矩形'], ['move','选择 / 移动'], ['view','查看']].map(([id,label]) => toolButton(id,label,'data-tool')).join('')}
            ${toolButton('undo','撤销 (Ctrl+Z)','data-action')}${toolButton('redo','还原 (Ctrl+Shift+Z)','data-action')}
        </div><div class="stmt-scene-paper"><canvas tabindex="0" aria-label="场景画板"></canvas></div>
        <div class="stmt-scene-bottom"><div class="stmt-scene-palette" role="group" aria-label="画笔颜色"></div>
        <div class="stmt-scene-zoom" hidden><button type="button" data-out aria-label="缩小">−</button><button type="button" data-reset title="复位视图" aria-label="复位视图">100%</button><button type="button" data-in aria-label="放大">+</button></div></div>
        <small data-hint></small></section>
        <aside><section><h3>场景物体</h3><ul aria-label="场景物体"></ul></section>
        <fieldset><legend>物体属性</legend><label>名称<input data-name></label>
        <label>色块颜色<input type="color" data-color></label>
        <label>注释<textarea rows="3" placeholder="描述这个物体及其与周围的关系"></textarea></label>
        </fieldset></aside></div>
        <small class="stmt-pose-status" role="status"></small>`;
    const find = selector => panel.querySelector(selector);
    const canvas = find('canvas');
    canvas.width = boardWidth;
    canvas.height = boardHeight;
    let blocks = saved?.blocks ?? [];
    let selected = saved?.selected ?? -1, nextNumber = saved?.nextNumber ?? 1, tool, ink, gesture;
    const list = find('ul'), name = find('[data-name]'), color = find('[data-color]'), note = find('textarea');
    const past = saved?.past ?? [], future = saved?.future ?? [];
    let editing;
    // Point arrays are replaced on move; snapshots can share their geometry.
    const snapshot = () => ({ blocks: blocks.map(b => ({ ...b })), selected, nextNumber });
    function buttons() {
        find('[data-action=undo]').disabled = !past.length;
        find('[data-action=redo]').disabled = !future.length;
    }
    function record(before = snapshot()) {
        past.push(before);
        if (past.length > 80) past.shift();
        future.length = 0;
        buttons();
    }
    function restore(from, to) {
        if (!from.length || gesture) return;
        editing = null;
        to.push(snapshot());
        ({ blocks, selected, nextNumber } = from.pop());
        refresh();
    }
    find('[data-action=undo]').onclick = () => restore(past, future);
    find('[data-action=redo]').onclick = () => restore(future, past);
    function historyShortcut(event) {
        if (!(event.ctrlKey || event.metaKey) || event.altKey || event.isComposing) return;
        const key = event.key.toLowerCase();
        if (key !== 'z' && key !== 'y') return;
        event.preventDefault();
        event.stopPropagation();
        if (key === 'y' || event.shiftKey) restore(future, past);
        else restore(past, future);
    }
    function refresh() {
        list.replaceChildren(...blocks.map((b, i) => {
            const row = document.createElement('li');
            row.innerHTML = `<button type="button" data-pick><i></i><span></span></button><button type="button" data-delete>${icon('delete')}</button>`;
            const [pick, remove] = row.children;
            pick.setAttribute('aria-pressed', String(i === selected));
            pick.querySelector('span').textContent = b.name;
            row.style.setProperty('--ink', b.color);
            remove.setAttribute('aria-label', '删除' + b.name);
            remove.title = '删除' + b.name;
            pick.onclick = () => { if (!gesture) { selected = i; refresh(); } };
            remove.onclick = () => {
                if (gesture) return;
                record();
                blocks.splice(i, 1);
                if (i < selected) selected--;
                selected = Math.min(selected, blocks.length - 1);
                refresh();
            };
            return row;
        }).reverse());
        if (!blocks.length) list.append(Object.assign(document.createElement('li'), { textContent: '尚无物体' }));
        buttons();
        const block = blocks[selected];
        find('fieldset').disabled = !block;
        name.value = block?.name ?? '';
        color.value = block?.color ?? ink;
        note.value = block?.note ?? '';
        drawBoard(canvas, blocks, selected);
    }
    function chooseTool(value) {
        tool = value;
        find('.stmt-scene-stage').dataset.mode = value;
        find('.stmt-scene-zoom').hidden = value !== 'view';
        find('.stmt-scene-palette').hidden = value === 'view';
        for (const button of panel.querySelectorAll('[data-tool]')) {
            button.setAttribute('aria-pressed', String(button.dataset.tool === tool));
        }
        find('[data-hint]').textContent = {
            free: '沿物体边缘拖画，松开即可闭合色块。',
            rect: '从一个角拖到对角，松开即可添加矩形。',
            move: '点选物体后拖动。被遮住的物体可从列表选择。',
            view: '拖动平移，滚轮或双指缩放。点百分比复位。',
        }[tool];
    }
    for (const button of panel.querySelectorAll('[data-tool]')) button.onclick = () => chooseTool(button.dataset.tool);
    for (const [index, hex] of palette.entries()) {
        const swatch = document.createElement('button');
        swatch.type = 'button';
        swatch.style.setProperty('--ink', hex);
        swatch.setAttribute('aria-label', ['湖蓝', '草绿', '沙黄', '砖红', '石灰蓝', '淡紫'][index]);
        swatch.onclick = () => {
            ink = hex;
            for (const item of swatch.parentElement.children) item.setAttribute('aria-pressed', String(item === swatch));
        };
        find('.stmt-scene-palette').append(swatch);
        if (hex === (saved?.ink ?? palette[0])) swatch.click();
    }
    for (const [field, key] of [[name, 'name'], [color, 'color'], [note, 'note']]) {
        field.oninput = () => {
            if (!blocks[selected]) return;
            if (editing !== field) record();
            editing = field;
            blocks[selected][key] = field.value;
            const row = list.children[blocks.length - 1 - selected];
            if (field === name) row.querySelector('span').textContent = name.value;
            if (field === color) {
                row.style.setProperty('--ink', color.value);
                drawBoard(canvas, blocks, selected);
            }
        };
        field.onchange = () => {
            editing = null;
            if (field === name && blocks[selected]) {
                blocks[selected].name = name.value.trim() || '未命名物体';
                name.value = blocks[selected].name;
                const row = list.children[blocks.length - 1 - selected];
                row.querySelector('span').textContent = name.value;
                const remove = row.querySelector('[data-delete]');
                remove.title = '删除' + name.value;
                remove.setAttribute('aria-label', remove.title);
            }
        };
        field.onblur = () => { editing = null; };
    }
    sceneView(find('.stmt-scene-paper'), canvas, find('.stmt-scene-zoom'), () => tool === 'view');
    function point(event) {
        const r = canvas.getBoundingClientRect();
        return [clamp(Math.round((event.clientX - r.left) * boardWidth / r.width), 0, boardWidth),
            clamp(Math.round((event.clientY - r.top) * boardHeight / r.height), 0, boardHeight)];
    }
    canvas.onpointerdown = event => {
        if (tool === 'view' || gesture || event.button !== 0) return;
        const start = point(event);
        gesture = { id: event.pointerId, start, tool, points: [start], color: ink };
        if (tool === 'move') {
            const ctx = canvas.getContext('2d');
            selected = blocks.findLastIndex(b => ctx.isPointInPath(blockPath(b.points), ...start));
            refresh();
            if (selected < 0) { gesture = null; return; }
            gesture.original = blocks[selected].points;
            gesture.before = snapshot();
        }
        canvas.setPointerCapture(event.pointerId);
    };
    function track(event) {
        const g = gesture;
        const [x, y] = point(event), [sx, sy] = g.start;
        if (g.tool === 'move') {
            let dx = x - sx, dy = y - sy;
            for (const [px, py] of g.original) {
                dx = clamp(dx, -px, boardWidth - px);
                dy = clamp(dy, -py, boardHeight - py);
            }
            blocks[selected].points = g.original.map(([px, py]) => [px + dx, py + dy]);
            drawBoard(canvas, blocks, selected);
        } else {
            if (g.tool === 'rect') g.points = [g.start, [x, sy], [x, y], [sx, y]];
            else if (Math.hypot(x - g.points.at(-1)[0], y - g.points.at(-1)[1]) >= 3) g.points.push([x, y]);
            drawBoard(canvas, [...blocks, g], blocks.length);
        }
    }
    canvas.onpointermove = event => { if (gesture?.id === event.pointerId) track(event); };
    canvas.onpointerup = event => {
        if (gesture?.id !== event.pointerId) return;
        track(event);
        const { points, tool: activeTool, color: fill, original, before } = gesture;
        gesture = null;
        if (activeTool === 'move') {
            const [x, y] = blocks[selected].points[0];
            if (x !== original[0][0] || y !== original[0][1]) record(before);
        } else {
            const [first, second] = points;
            if (second && points.some(([x, y]) =>
                (second[0] - first[0]) * (y - first[1]) !== (second[1] - first[1]) * (x - first[0]))) {
                record();
                blocks.push({ points, color: fill, name: '物体 ' + nextNumber++, note: '' });
                selected = blocks.length - 1;
                find('[role=status]').textContent = '';
            }
        }
        refresh();
    };
    canvas.onlostpointercapture = canvas.onpointercancel = event => {
        if (gesture?.id !== event.pointerId) return;
        if (gesture.original) blocks[selected].points = gesture.original;
        gesture = null;
        refresh();
    };
    function cancelGesture() {
        if (gesture?.original) blocks[selected].points = gesture.original;
        gesture = null;
    }
    find('[data-new]').onclick = () => {
        cancelGesture();
        blocks = [];
        selected = -1;
        nextNumber = 1;
        past.length = future.length = 0;
        editing = null;
        find('[role=status]').textContent = '';
        find('[data-reset]').click();
        find('.stmt-scene-palette button').click();
        chooseTool('free');
        refresh();
    };
    chooseTool(saved?.tool ?? 'free');
    refresh();
    return { panel, historyShortcut, suspend() {
        cancelGesture();
        return { ...snapshot(), past, future, tool, ink };
    }, getFiles(stem) {
        if (!blocks.length) throw new Error('请先在画板上画一个色块。');
        return boardFiles(structuredClone(blocks), stem);
    } };
}
