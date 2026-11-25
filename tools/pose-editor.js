import { joints } from './pose.js';
import { drawScene, isClassicPose, newPerson } from './pose-scene.js';
import { poseModes } from './pose-export.js';
import { poseTree } from './pose-tree.js';

export function createPoseEditor(defaultMode, resolveName) {
    const panel = document.createElement('div');
    panel.className = 'stmt-pose';
    panel.innerHTML = `<header><h2>姿态编辑</h2><div class="stmt-pose-actions">
        <button type="button" data-action="undo" title="撤销 (Ctrl+Z)" aria-label="撤销"><i class="fa-solid fa-rotate-left"></i></button>
        <button type="button" data-action="redo" title="还原 (Ctrl+Shift+Z)" aria-label="还原"><i class="fa-solid fa-rotate-right"></i></button>
        <button type="button" data-action="fullscreen" title="全屏编辑" aria-label="全屏编辑" aria-pressed="false"><i class="fa-solid fa-expand"></i></button></div></header>
        <div class="stmt-pose-layout"><section class="stmt-pose-stage" aria-label="骨骼画布">
        <canvas width="800" height="880" tabindex="0"></canvas><div class="stmt-pose-legend"></div></section>
        <aside class="stmt-pose-sidebar"><nav aria-label="姿态场景"><h3>场景</h3><div role="tree" aria-label="场景树"></div></nav>
        <section class="stmt-pose-inspector"><h3></h3>
        <div data-page="people"><button type="button" data-action="add">添加人物</button></div>
        <div data-page="person"><label>人物名称<input maxlength="128" placeholder="{{char}} 或 {{user}}"></label>
        <small>可使用 ST 宏。拖动画布可平移整个人物。</small>
        <button type="button" data-action="remove">删除人物</button></div>
        <div data-page="joint"><small>拖动关节或轻点画布定位。画布获得焦点后，可用方向键微调。</small></div>
        <div data-page="note"><textarea rows="3" aria-label="场景注释" placeholder="例如：右手搭在对方肩上。"></textarea></div>
        <div data-page="mode"><select aria-label="本次发送档位"></select></div></section></aside></div>
        <div role="status" class="stmt-pose-status"></div>`;
    const find = selector => panel.querySelector(selector);
    const action = key => find('[data-action="' + key + '"]');
    const canvas = find('canvas'), ctx = canvas.getContext('2d');
    const name = find('input'), note = find('textarea'), mode = find('select');
    for (const item of poseModes) mode.add(new Option(item.label, item.id));
    let nextNumber = 1;
    function makePerson(offset) {
        const person = newPerson(nextNumber++, offset);
        person.template = person.id === 'P1' ? '{{char}}' : person.id === 'P2' ? '{{user}}' : person.name;
        person.name = resolveName(person.template) || person.name;
        return person;
    }
    let state = { people: [makePerson(0)], note: '', mode: defaultMode };
    let activeId = 'P1', selected = 4, node = 'P1/4', placeSelected = false;
    let drag, typing;
    const past = [], future = [];
    const person = () => state.people.find(p => p.id === activeId);
    const snapshot = () => structuredClone({ state, activeId, selected, node, nextNumber });
    const renderTree = poseTree(find('[role="tree"]'), choose);
    function buttons() {
        action('undo').disabled = !past.length;
        action('redo').disabled = !future.length;
    }
    function record(before = snapshot()) {
        past.push(before);
        future.length = 0;
        typing = undefined;
        buttons();
    }
    function resolvePerson() {
        const p = person();
        p.template = p.template.trim() || p.id;
        p.name = resolveName(p.template) || p.id;
    }
    function restore(from, to) {
        cancelDrag();
        if (!from.length) return;
        if (typing === name) resolvePerson();
        to.push(snapshot());
        ({ state, activeId, selected, node, nextNumber } = from.pop());
        typing = undefined;
        placeSelected = false;
        refresh(true);
    }
    function paint() {
        ctx.setTransform(2, 0, 0, 2, 0, 0);
        ctx.clearRect(0, 0, 400, 440);
        drawScene(ctx, state.people, person(), selected);
        const part = joints[selected]?.[1] ?? '整个人物';
        canvas.setAttribute('aria-label', person().name + ' · ' + part);
        const legend = find('.stmt-pose-legend');
        legend.textContent = isClassicPose(state.people) ? '橙色：人物右侧　青色：人物左侧'
            : person().id + ' · ' + person().name + '　实线：右侧 / 中线　虚线：左侧';
    }
    function refresh(reveal = false) {
        renderTree(state.people, node, reveal);
        const page = ['people', 'note', 'mode'].includes(node) ? node : selected < 0 ? 'person' : 'joint';
        for (const el of panel.querySelectorAll('[data-page]')) el.hidden = el.dataset.page !== page;
        const captions = { people: '人物管理', note: '场景注释', mode: '本次发送档位', person: person().id + ' · ' + person().name,
            joint: person().name + ' / ' + (joints[selected]?.[1] ?? '') };
        find('.stmt-pose-inspector h3').textContent = captions[page];
        name.value = person().template;
        note.value = state.note;
        mode.value = state.mode;
        action('remove').disabled = state.people.length === 1;
        buttons();
        paint();
    }
    function choose(key) {
        cancelDrag();
        node = key;
        const [id, joint] = key.split('/');
        if (state.people.some(p => p.id === id)) {
            activeId = id;
            selected = joint === undefined ? -1 : Number(joint);
            placeSelected = selected >= 0;
        }
        refresh();
    }
    action('add').onclick = () => {
        record();
        const gap = offset => Math.min(...state.people.map(p => Math.abs(200 + offset - p.points[1][0])));
        const p = makePerson([-72, 72, 0].sort((a, b) => gap(b) - gap(a))[0]);
        state.people.push(p);
        activeId = node = p.id;
        selected = -1;
        placeSelected = false;
        refresh(true);
    };
    action('remove').onclick = () => {
        if (state.people.length === 1) return;
        record();
        const index = state.people.indexOf(person());
        state.people.splice(index, 1);
        activeId = node = state.people[Math.min(index, state.people.length - 1)].id;
        selected = -1;
        placeSelected = false;
        refresh(true);
    };
    function editField(el, update) {
        el.oninput = () => {
            if (typing !== el) { record(); typing = el; }
            update(el.value);
        };
        el.onblur = () => {
            if (typing !== el) return;
            typing = undefined;
            if (el === name) {
                resolvePerson();
                name.value = person().template;
                const title = person().id + ' · ' + person().name;
                find('.stmt-pose-inspector h3').textContent = title;
                const row = find('[data-node="' + activeId + '"]');
                if (row) row.lastChild.textContent = title;
                paint();
            }
        };
    }
    editField(name, value => { person().template = value; });
    editField(note, value => { state.note = value; });
    mode.onchange = () => { record(); state.mode = mode.value; };
    action('undo').onclick = () => restore(past, future);
    action('redo').onclick = () => restore(future, past);
    function historyShortcut(event) {
        if (event.isComposing || event.altKey || !(event.ctrlKey || event.metaKey)) return;
        const key = event.key.toLowerCase();
        if (key !== 'z' && key !== 'y') return;
        event.preventDefault();
        event.stopPropagation();
        if (key === 'y' || event.shiftKey) restore(future, past);
        else restore(past, future);
    }
    function fullscreen(on) {
        panel.closest('dialog').classList.toggle('stmt-pose-fullscreen', on);
        const btn = action('fullscreen');
        btn.setAttribute('aria-pressed', String(on));
        btn.title = on ? '退出全屏' : '全屏编辑';
        btn.setAttribute('aria-label', btn.title);
        btn.firstElementChild.className = 'fa-solid ' + (on ? 'fa-compress' : 'fa-expand');
    }
    action('fullscreen').onclick = () => fullscreen(action('fullscreen').getAttribute('aria-pressed') === 'false');

    function move(before, dx, dy) {
        const positions = selected < 0 ? before : [before[selected]];
        const xs = positions.map(p => p[0]), ys = positions.map(p => p[1]);
        dx = Math.max(12 - Math.min(...xs), Math.min(388 - Math.max(...xs), Math.round(dx)));
        dy = Math.max(12 - Math.min(...ys), Math.min(428 - Math.max(...ys), Math.round(dy)));
        for (const i of selected < 0 ? before.keys() : [selected]) person().points[i] = [before[i][0] + dx, before[i][1] + dy];
        paint();
    }
    function position(event) {
        const box = canvas.getBoundingClientRect();
        return [(event.clientX - box.left) * 400 / box.width, (event.clientY - box.top) * 440 / box.height];
    }
    function beginMove() {
        const before = snapshot();
        return { before, points: person().points.slice(), owner: person() };
    }
    function finishMove(step) {
        if (step.points.some(([x, y], i) => x !== step.owner.points[i][0] || y !== step.owner.points[i][1])) record(step.before);
    }
    canvas.onpointerdown = event => {
        if (drag || event.button !== 0) return;
        const [x, y] = position(event);
        let nearest = -1, distance = 22 * 400 / canvas.getBoundingClientRect().width;
        if (selected >= 0 && !placeSelected) person().points.forEach(([px, py], i) => {
            const d = Math.hypot(x - px, y - py);
            if (d < distance) { nearest = i; distance = d; }
        });
        placeSelected = false;
        if (nearest >= 0) selected = nearest;
        node = selected < 0 ? activeId : activeId + '/' + selected;
        canvas.focus({ preventScroll: true });
        refresh(true);
        const [startX, startY] = selected >= 0 && nearest < 0 ? person().points[selected] : [x, y];
        drag = { ...beginMove(), id: event.pointerId, startX, startY };
        canvas.setPointerCapture(event.pointerId);
        move(drag.points, x - startX, y - startY);
    };
    canvas.onpointermove = event => {
        if (drag?.id !== event.pointerId) return;
        const [x, y] = position(event);
        move(drag.points, x - drag.startX, y - drag.startY);
    };
    canvas.onpointerup = event => {
        if (drag?.id !== event.pointerId) return;
        finishMove(drag);
        drag = undefined;
    };
    function cancelDrag() {
        if (!drag) return;
        drag.owner.points = drag.points;
        drag = undefined;
        paint();
    }
    canvas.onlostpointercapture = canvas.onpointercancel = event => {
        if (drag?.id === event.pointerId) cancelDrag();
    };
    panel.addEventListener('pointerdown', event => {
        if (drag && event.target !== canvas) cancelDrag();
    }, true);
    canvas.onkeydown = event => {
        const delta = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[event.key];
        if (!delta || drag) return;
        event.preventDefault();
        const step = beginMove();
        move(step.points, ...delta);
        finishMove(step);
    };
    refresh(true);
    return { panel, fullscreen, historyShortcut, getDraft() {
        if (typing === name) resolvePerson();
        return structuredClone(state);
    } };
}
