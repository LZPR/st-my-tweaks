import { boardWidth, boardHeight, blockPath, drawBoard, boardFiles } from './scene-board.js';

const palette = ['#88cbd3', '#819c72', '#d1ae79', '#b87262', '#657783', '#afa0be'];
const clamp = (n, lo, hi) => Math.max(lo, Math.min(n, hi));

export function createSceneEditor() {
    const panel = document.createElement('section');
    panel.className = 'stmt-pose stmt-scene';
    panel.innerHTML = `<header><h2>场景编辑</h2><small>800 × 560</small></header>
        <div class="stmt-scene-layout"><section class="stmt-scene-stage">
        <div class="stmt-scene-tools" aria-label="画板工具">
            <button type="button" data-tool="free">轮廓</button>
            <button type="button" data-tool="rect">矩形</button>
            <button type="button" data-tool="move">选择 / 移动</button>
        </div><div class="stmt-scene-paper"><canvas tabindex="0" aria-label="场景画板"></canvas></div>
        <small data-hint></small></section>
        <aside><section><h3>画笔颜色</h3><div class="stmt-scene-palette"></div></section>
        <section><h3>场景物体</h3><select aria-label="选择场景物体"></select></section>
        <fieldset><legend>物体属性</legend><label>名称<input data-name></label>
        <label>色块颜色<input type="color" data-color></label>
        <label>注释<textarea rows="3" placeholder="描述这个物体及其与周围的关系"></textarea></label>
        <button type="button" data-delete>删除色块</button></fieldset></aside></div>
        <small class="stmt-pose-status" role="status"></small>`;
    const find = selector => panel.querySelector(selector);
    const canvas = find('canvas');
    canvas.width = boardWidth;
    canvas.height = boardHeight;
    const blocks = [];
    let selected = -1, nextNumber = 1, tool, ink, gesture;
    const list = find('select'), name = find('[data-name]'), color = find('[data-color]'), note = find('textarea');
    function refresh() {
        list.replaceChildren(...blocks.map((b, i) => new Option(b.name, i)).reverse());
        if (!blocks.length) list.add(new Option('尚无物体', ''));
        list.disabled = !blocks.length;
        list.value = selected < 0 ? '' : String(selected);
        const block = blocks[selected];
        find('fieldset').disabled = !block;
        name.value = block?.name ?? '';
        color.value = block?.color ?? ink;
        note.value = block?.note ?? '';
        drawBoard(canvas, blocks, selected);
    }
    function chooseTool(value) {
        tool = value;
        for (const button of panel.querySelectorAll('[data-tool]')) {
            button.setAttribute('aria-pressed', String(button.dataset.tool === tool));
        }
        find('[data-hint]').textContent = {
            free: '沿物体边缘拖画，松开即可闭合色块。',
            rect: '从一个角拖到对角，松开即可添加矩形。',
            move: '点选物体后拖动。被遮住的物体可从列表选择。',
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
        if (!index) swatch.click();
    }
    list.onchange = () => { selected = Number(list.value); refresh(); };
    name.oninput = () => {
        blocks[selected].name = name.value;
        list.selectedOptions[0].textContent = name.value;
    };
    name.onchange = () => {
        blocks[selected].name = name.value.trim() || '未命名物体';
        refresh();
    };
    color.oninput = () => { blocks[selected].color = color.value; drawBoard(canvas, blocks, selected); };
    note.oninput = () => { blocks[selected].note = note.value; };
    find('[data-delete]').onclick = () => {
        blocks.splice(selected, 1);
        selected = Math.min(selected, blocks.length - 1);
        refresh();
    };
    function point(event) {
        const r = canvas.getBoundingClientRect();
        return [clamp(Math.round((event.clientX - r.left) * boardWidth / r.width), 0, boardWidth),
            clamp(Math.round((event.clientY - r.top) * boardHeight / r.height), 0, boardHeight)];
    }
    canvas.onpointerdown = event => {
        if (gesture || event.button !== 0) return;
        const start = point(event);
        gesture = { id: event.pointerId, start, tool, points: [start], color: ink };
        if (tool === 'move') {
            const ctx = canvas.getContext('2d');
            selected = blocks.findLastIndex(b => ctx.isPointInPath(blockPath(b.points), ...start));
            refresh();
            if (selected < 0) { gesture = null; return; }
            gesture.original = blocks[selected].points;
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
        const { points, tool: activeTool, color: fill } = gesture;
        gesture = null;
        if (activeTool !== 'move') {
            const [first, second] = points;
            if (second && points.some(([x, y]) =>
                (second[0] - first[0]) * (y - first[1]) !== (second[1] - first[1]) * (x - first[0]))) {
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
    chooseTool('free');
    refresh();
    return { panel, getFiles() {
        if (!blocks.length) throw new Error('请先在画板上画一个色块。');
        return boardFiles(structuredClone(blocks));
    } };
}
