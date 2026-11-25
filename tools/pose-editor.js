import { drawPose, initialPose, joints } from './pose.js';

export function createPoseEditor() {
    const panel = document.createElement('div');
    panel.className = 'stmt-pose';
    panel.innerHTML = `<header><h2>姿态编辑</h2><span>单人 · 正面视图</span></header>
        <div class="stmt-pose-layout"><section class="stmt-pose-stage" aria-label="骨骼画布">
            <canvas width="800" height="880" aria-label="拖动关节，或使用关节列表和方向键调整"></canvas>
            <div class="stmt-pose-legend"><span>人物右侧</span><span>人物左侧</span></div>
        </section><section class="stmt-pose-controls">
            <label>当前关节<select></select></label>
            <small>拖动圆点调整姿态。也可先选关节，再轻点画布定位，或按方向键微调。</small>
            <button type="button" class="stmt-pose-undo" disabled>撤销移动</button>
            <label>姿态注释<textarea rows="3" placeholder="例如：右手举到耳旁，手掌朝前。"></textarea></label>
        </section></div>
        <div role="status" class="stmt-pose-status"></div>`;
    const canvas = panel.querySelector('canvas');
    const ctx = canvas.getContext('2d');
    const select = panel.querySelector('select');
    const undo = panel.querySelector('button');
    const note = panel.querySelector('textarea');
    const points = initialPose();
    const history = [];
    let selected = 4;
    let drag;
    for (const [index, [, label]] of joints.entries()) select.add(new Option(label, index));
    function render() {
        ctx.setTransform(2, 0, 0, 2, 0, 0);
        ctx.clearRect(0, 0, 400, 440);
        drawPose(ctx, points, selected);
        select.value = String(selected);
        undo.disabled = !history.length;
        canvas.setAttribute('aria-label', '骨骼画布，当前关节：' + joints[selected][1]);
    }
    function remember(index, before) {
        if (points[index].every((v, axis) => v === before[axis])) return;
        history.push({ index, before });
        if (history.length > 100) history.shift();
    }
    function move(x, y) {
        points[selected] = [Math.max(12, Math.min(388, Math.round(x))),
            Math.max(12, Math.min(428, Math.round(y)))];
        render();
    }
    function position(event) {
        const box = canvas.getBoundingClientRect();
        return [(event.clientX - box.left) * 400 / box.width, (event.clientY - box.top) * 440 / box.height];
    }
    let placeSelected = false;
    select.onchange = () => {
        selected = select.selectedIndex;
        placeSelected = true;
        render();
    };
    canvas.onpointerdown = event => {
        if (drag || event.button !== 0) return;
        const [x, y] = position(event);
        const radius = 22 * 400 / canvas.getBoundingClientRect().width;
        let nearest = -1, distance = radius;
        if (!placeSelected) points.forEach(([px, py], i) => {
            const d = Math.hypot(x - px, y - py);
            if (d < distance) { nearest = i; distance = d; }
        });
        placeSelected = false;
        if (nearest >= 0) selected = nearest;
        const before = points[selected];
        drag = { id: event.pointerId, before, dx: nearest < 0 ? 0 : before[0] - x, dy: nearest < 0 ? 0 : before[1] - y };
        canvas.setPointerCapture(event.pointerId);
        canvas.focus({ preventScroll: true });
        move(x + drag.dx, y + drag.dy);
    };
    canvas.onpointermove = event => {
        if (drag?.id !== event.pointerId) return;
        const [x, y] = position(event);
        move(x + drag.dx, y + drag.dy);
    };
    canvas.onpointerup = event => {
        if (drag?.id !== event.pointerId) return;
        remember(selected, drag.before);
        drag = undefined;
        render();
    };
    canvas.onlostpointercapture = canvas.onpointercancel = event => {
        if (drag?.id !== event.pointerId) return;
        points[selected] = drag.before;
        drag = undefined;
        render();
    };
    canvas.tabIndex = 0;
    canvas.onkeydown = event => {
        const delta = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[event.key];
        if (!delta || drag) return;
        event.preventDefault();
        const before = points[selected];
        move(before[0] + delta[0], before[1] + delta[1]);
        remember(selected, before);
        render();
    };
    undo.onclick = () => {
        if (drag || !history.length) return;
        const step = history.pop();
        selected = step.index;
        points[selected] = step.before;
        render();
    };
    render();
    return { panel, points, note };
}
