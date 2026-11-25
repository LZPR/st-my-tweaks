import { joints } from './pose.js';
import { drawScene, isClassicPose, newPerson } from './pose-scene.js';

export function createPoseEditor() {
    const panel = document.createElement('div');
    panel.className = 'stmt-pose';
    panel.innerHTML = `<header><h2>姿态编辑</h2><span class="stmt-pose-count"></span></header>
        <div class="stmt-pose-people"><label>当前人物<select></select></label>
            <label>人物名称<input maxlength="32" type="text"></label>
            <button type="button">添加人物</button><button type="button">删除人物</button></div>
        <div class="stmt-pose-layout"><section class="stmt-pose-stage" aria-label="骨骼画布">
            <canvas width="800" height="880" aria-label="拖动关节，或使用关节列表和方向键调整"></canvas>
            <div class="stmt-pose-legend"><span>人物右侧</span><span>人物左侧</span></div>
        </section><section class="stmt-pose-controls">
            <label>移动部位<select></select></label>
            <small>只移动当前人物。选择关节后可轻点定位，或选「整个人物」拖动平移。</small>
            <button type="button" class="stmt-pose-undo" disabled>撤销</button>
            <label>姿态注释<textarea rows="3" placeholder="例如：右手举到耳旁，手掌朝前。"></textarea></label>
        </section></div>
        <div role="status" class="stmt-pose-status"></div>`;
    const canvas = panel.querySelector('canvas');
    const ctx = canvas.getContext('2d');
    const [personSelect, select] = panel.querySelectorAll('select');
    const name = panel.querySelector('.stmt-pose-people input');
    const [add, remove, undo] = panel.querySelectorAll('button');
    const note = panel.querySelector('textarea');
    const people = [newPerson(1)];
    let active = people[0], nextNumber = 2;
    const history = [];
    let selected = 4;
    let drag;
    select.add(new Option('整个人物', '-1'));
    for (const [index, [, label]] of joints.entries()) select.add(new Option(label, index));
    function render() {
        ctx.setTransform(2, 0, 0, 2, 0, 0);
        ctx.clearRect(0, 0, 400, 440);
        drawScene(ctx, people, active, selected);
        select.value = String(selected);
        undo.disabled = !history.length;
        canvas.setAttribute('aria-label', active.name + ' · ' + (joints[selected]?.[1] ?? '整个人物'));
    }
    function remember(revert) {
        history.push(revert);
        if (history.length > 100) history.shift();
    }
    let placeSelected = false;
    function refreshPeople() {
        personSelect.replaceChildren(...people.map(p => new Option(p.id + ' · ' + p.name, p.id)));
        personSelect.value = active.id;
        name.value = active.name;
        remove.disabled = people.length === 1;
        panel.querySelector('.stmt-pose-count').textContent = people.length + ' 人 · 正面视图';
        const legend = panel.querySelector('.stmt-pose-legend');
        if (isClassicPose(people)) legend.innerHTML = '<span>人物右侧</span><span>人物左侧</span>';
        else legend.textContent = active.id + ' · ' + active.name + '　实线：右侧 / 中线　虚线：左侧';
        legend.style.color = isClassicPose(people) ? '' : active.color;
        placeSelected = false;
        render();
    }
    personSelect.onchange = () => {
        cancelDrag();
        active = people.find(p => p.id === personSelect.value);
        refreshPeople();
    };
    add.onclick = () => {
        cancelDrag();
        const previous = active;
        const gap = offset => Math.min(...people.map(p => Math.abs(200 + offset - p.points[1][0])));
        const offset = [-72, 72, 0].sort((a, b) => gap(b) - gap(a))[0];
        const person = newPerson(nextNumber++, offset);
        remember(() => { people.splice(people.indexOf(person), 1); active = previous; });
        people.push(person);
        active = person;
        selected = -1;
        refreshPeople();
    };
    remove.onclick = () => {
        cancelDrag();
        if (people.length === 1) return;
        const person = active, index = people.indexOf(person);
        remember(() => { people.splice(index, 0, person); active = person; });
        people.splice(index, 1);
        active = people[Math.min(index, people.length - 1)];
        refreshPeople();
    };
    name.onchange = () => {
        const person = active, before = person.name;
        const after = name.value.trim() || before;
        if (before !== after) remember(() => { person.name = before; active = person; });
        person.name = after;
        refreshPeople();
    };
    function move(before, dx, dy) {
        const indices = selected < 0 ? before.keys() : [selected];
        const positions = selected < 0 ? before : [before[selected]];
        const xs = positions.map(p => p[0]), ys = positions.map(p => p[1]);
        dx = Math.max(12 - Math.min(...xs), Math.min(388 - Math.max(...xs), Math.round(dx)));
        dy = Math.max(12 - Math.min(...ys), Math.min(428 - Math.max(...ys), Math.round(dy)));
        for (const i of indices) active.points[i] = [before[i][0] + dx, before[i][1] + dy];
        render();
    }
    function finishMove(before) {
        const person = active, joint = selected;
        if (before.some(([x, y], i) => x !== person.points[i][0] || y !== person.points[i][1])) {
            remember(() => { active = person; selected = joint; person.points = before; });
        }
        render();
    }
    function position(event) {
        const box = canvas.getBoundingClientRect();
        return [(event.clientX - box.left) * 400 / box.width, (event.clientY - box.top) * 440 / box.height];
    }
    select.onchange = () => {
        const value = Number(select.value);
        cancelDrag();
        selected = value;
        placeSelected = true;
        render();
    };
    canvas.onpointerdown = event => {
        if (drag || event.button !== 0) return;
        const [x, y] = position(event);
        const radius = 22 * 400 / canvas.getBoundingClientRect().width;
        let nearest = -1, distance = radius;
        if (selected >= 0 && !placeSelected) active.points.forEach(([px, py], i) => {
            const d = Math.hypot(x - px, y - py);
            if (d < distance) { nearest = i; distance = d; }
        });
        placeSelected = false;
        if (nearest >= 0) selected = nearest;
        const before = active.points.slice();
        const [startX, startY] = selected >= 0 && nearest < 0 ? before[selected] : [x, y];
        drag = { id: event.pointerId, before, startX, startY };
        canvas.setPointerCapture(event.pointerId);
        canvas.focus({ preventScroll: true });
        move(before, x - startX, y - startY);
    };
    canvas.onpointermove = event => {
        if (drag?.id !== event.pointerId) return;
        const [x, y] = position(event);
        move(drag.before, x - drag.startX, y - drag.startY);
    };
    canvas.onpointerup = event => {
        if (drag?.id !== event.pointerId) return;
        finishMove(drag.before);
        drag = undefined;
        render();
    };
    function cancelDrag() {
        if (!drag) return;
        active.points = drag.before;
        drag = undefined;
        render();
    }
    canvas.onlostpointercapture = canvas.onpointercancel = event => {
        if (drag?.id === event.pointerId) cancelDrag();
    };
    canvas.tabIndex = 0;
    canvas.onkeydown = event => {
        const delta = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[event.key];
        if (!delta || drag) return;
        event.preventDefault();
        const before = active.points.slice();
        move(before, ...delta);
        finishMove(before);
    };
    undo.onclick = () => {
        if (drag || !history.length) return;
        history.pop()();
        refreshPeople();
    };
    refreshPeople();
    return { panel, people, note };
}
