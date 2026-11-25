import { joints } from './pose.js';
import { drawScene, newPerson } from './pose-scene.js';
import { boardCamera, boardHits, scalePerson } from './pose-board.js';
import { poseModes } from './pose-export.js';
import { poseTree } from './pose-tree.js';
import { placePreset, presetTool } from './pose-presets.js';

export function createPoseEditor(defaultMode, resolveName, saved, library) {
    const panel = document.createElement('div');
    panel.className = 'stmt-pose';
    panel.innerHTML = `<header><h2>姿态编辑</h2><div class="stmt-pose-actions">
        <button type="button" data-action="undo" title="撤销 (Ctrl+Z)" aria-label="撤销"><i class="fa-solid fa-rotate-left"></i></button>
        <button type="button" data-action="redo" title="还原 (Ctrl+Shift+Z)" aria-label="还原"><i class="fa-solid fa-rotate-right"></i></button>
        <button type="button" data-action="fullscreen" title="全屏编辑" aria-label="全屏编辑" aria-pressed="false"><i class="fa-solid fa-expand"></i></button></div></header>
        <div class="stmt-pose-layout"><section class="stmt-pose-stage" aria-label="骨骼画布">
        <canvas width="800" height="880" tabindex="0"></canvas><div class="stmt-pose-legend"></div>
        <div class="stmt-board-dock">
        <div class="stmt-board-adjust" hidden><button type="button" data-step="-1" aria-label="缩小">−</button>
        <output></output><button type="button" data-step="1" aria-label="放大">＋</button>
        <button type="button" data-action="fit">复位视图</button></div>
        <div class="stmt-board-tools" role="toolbar" aria-label="画板工具"></div></div>
        <div class="stmt-board-menu" hidden><label class="stmt-board-scope">可选择的人物<select aria-label="可选择的人物"></select></label><button data-command="whole">选择整个人物</button>
        <button data-command="add">添加人物</button><button data-command="person">人物设置</button>
        <button data-command="note">场景注释</button><button data-command="mode">发送档位</button>
        <button data-command="new">新建画布</button><button data-command="attach">附加到消息</button></div></section>
        <aside class="stmt-pose-sidebar"><nav aria-label="姿态场景"><h3>场景</h3><div role="tree" aria-label="场景树" aria-multiselectable="true"></div></nav>
        <section class="stmt-pose-inspector"><button type="button" data-action="dismiss" aria-label="关闭画板面板">×</button><h3></h3>
        <div data-page="people"><button type="button" data-action="add">添加人物</button></div>
        <div data-page="person"><label>人物名称<input maxlength="128" placeholder="{{char}} 或 {{user}}"></label>
        <small>可使用 ST 宏。用移动工具拖动整个人物。</small>
        <button type="button" data-action="remove">删除人物</button></div>
        <div data-page="joint"><small>点选关节，拖框可选多个关节。重复点按可切换重叠目标。「⋯」可限制选择范围。</small></div>
        <div data-page="group"><small>用选择工具重新框选，或用移动工具拖动已选关节。</small></div>
        <div data-page="note"><textarea rows="3" aria-label="场景注释" placeholder="例如：右手搭在对方肩上。"></textarea></div>
        <div data-page="mode"><select aria-label="本次发送档位"></select></div></section></aside></div>
        <div role="status" class="stmt-pose-status"></div>`;
    const find = selector => panel.querySelector(selector);
    const action = key => find('[data-action="' + key + '"]');
    const canvas = find('canvas'), ctx = canvas.getContext('2d');
    const name = find('input'), note = find('textarea'), mode = find('[data-page=mode] select');
    const scope = find('.stmt-board-scope select');
    for (const item of poseModes) mode.add(new Option(item.label, item.id));
    let nextNumber = 1;
    function makePerson(offset) {
        const person = newPerson(nextNumber++, offset);
        person.template = person.id === 'P1' ? '{{char}}' : person.id === 'P2' ? '{{user}}' : person.name;
        person.name = resolveName(person.template) || person.name;
        return person;
    }
    let state = { people: [makePerson(0)], note: '', mode: defaultMode };
    let activeId = 'P1', selected = 4, node = 'P1/4';
    // null uses the single target above. An empty rectangle selects no joints.
    let group = null, scopeId = '';
    const eligible = () => state.people.filter(p => !scopeId || p.id === scopeId);
    const camera = boardCamera();
    const tools = { select: ['选择', 'arrow-pointer'], move: ['移动', 'arrows-up-down-left-right'],
        scale: ['缩放', 'up-right-and-down-left-from-center'], view: ['查看', 'hand'] };
    let tool = 'select', cycle;
    const toolbar = find('.stmt-board-tools'), adjust = find('.stmt-board-adjust'), menu = find('.stmt-board-menu');
    for (const [id, [label, icon]] of Object.entries(tools)) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.dataset.tool = id;
        btn.innerHTML = '<i aria-hidden="true" class="fa-solid fa-' + icon + '"></i> ' + label;
        btn.onclick = () => setTool(id);
        toolbar.append(btn);
    }
    const presetButton = document.createElement('button');
    presetButton.type = 'button';
    presetButton.textContent = '预设';
    presetButton.setAttribute('aria-expanded', 'false');
    toolbar.append(presetButton);
    const more = document.createElement('button');
    more.type = 'button';
    more.textContent = '⋯';
    more.setAttribute('aria-label', '画板操作');
    more.setAttribute('aria-expanded', 'false');
    toolbar.append(more);
    let drag, typing;
    const past = saved?.past ?? [], future = saved?.future ?? [];
    if (saved) {
        ({ state, activeId, selected, node, nextNumber, group, scopeId } = saved);
        Object.assign(camera.view, saved.view);
        for (const p of state.people) p.name = resolveName(p.template) || p.id;
    }
    const person = () => state.people.find(p => p.id === activeId);
    const snapshot = () => structuredClone({ state, activeId, selected, node, nextNumber, group });
    let renderTree = poseTree(find('[role="tree"]'), choose);
    const presets = presetTool({ ...library, people: eligible, currentId: () => activeId,
        dismiss() { closePanels(); presetButton.focus(); },
        apply(target, item) {
            const points = placePreset(item.points, target.points);
            if (points.some(([x, y], i) => x !== target.points[i][0] || y !== target.points[i][1])) record();
            target.points = points;
            choose(target.id);
        },
    });
    panel.append(presets.box);
    presetButton.onclick = () => {
        const show = presets.box.hidden;
        cancelDrag();
        closePanels();
        if (show) { presetButton.setAttribute('aria-expanded', 'true'); presets.open(); }
    };
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
        closePanels();
        if (typing === name) resolvePerson();
        to.push(snapshot());
        ({ state, activeId, selected, node, nextNumber, group } = from.pop());
        constrainSelection();
        typing = undefined;
        cycle = undefined;
        refresh(true);
    }
    function constrainSelection() {
        if (!state.people.some(p => p.id === scopeId)) scopeId = '';
        if (group && scopeId) group = group.filter(hit => hit.id === scopeId);
        if (scopeId && activeId !== scopeId) {
            activeId = node = scopeId;
            selected = -1;
            group ??= [];
        }
        if (group?.length) {
            ({ id: activeId, joint: selected } = group[0]);
            if (!['people', 'note', 'mode'].includes(node)) node = activeId + '/' + selected;
        }
    }
    function scopeOptions() {
        scope.replaceChildren(new Option('所有人', ''), ...state.people.map(p => new Option(p.id + ' · ' + p.name, p.id)));
        scope.value = scopeId;
    }
    scope.onchange = () => {
        cancelDrag();
        scopeId = scope.value;
        cycle = undefined;
        constrainSelection();
        closePanels();
        refresh(true);
    };
    function frame() {
        const box = canvas.getBoundingClientRect();
        const bottom = panel.closest('.stmt-pose-fullscreen') ? 112 : 60;
        const room = Math.max(1, box.height - 36 - bottom);
        const fit = Math.max(.01, Math.min(box.width / 400, room / 440));
        return { box, fit, left: (box.width - 400 * fit) / 2, top: 36 + (room - 440 * fit) / 2 };
    }
    function paint() {
        const { box, fit, left, top } = frame();
        if (!box.width || !box.height) return;
        const dpr = window.devicePixelRatio || 1;
        const w = Math.round(box.width * dpr), h = Math.round(box.height * dpr);
        if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
        ctx.resetTransform();
        ctx.clearRect(0, 0, w, h);
        const v = camera.view;
        ctx.setTransform(dpr * fit * v.scale, 0, 0, dpr * fit * v.scale, dpr * (left + fit * v.x), dpr * (top + fit * v.y));
        const highlighted = drag?.preview ?? group;
        drawScene(ctx, state.people, person(), highlighted ? -1 : selected);
        if (drag?.corner) {
            const [x, y] = drag.origin, [right, bottom] = drag.corner;
            ctx.fillStyle = 'rgba(102,192,255,.16)';
            ctx.fillRect(x, y, right - x, bottom - y);
            ctx.strokeStyle = '#8bd3ff';
            ctx.lineWidth = 1.5 / (fit * v.scale);
            ctx.strokeRect(x, y, right - x, bottom - y);
        }
        if (highlighted && tool !== 'scale') {
            ctx.lineWidth = 2 / (fit * v.scale);
            ctx.strokeStyle = '#fff';
            const owners = new Map(state.people.map(p => [p.id, p]));
            for (const { id, joint } of highlighted) {
                const [x, y] = owners.get(id).points[joint];
                ctx.beginPath();
                ctx.arc(x, y, 8, 0, 2 * Math.PI);
                ctx.stroke();
            }
        }
        if ((!highlighted && selected < 0) || tool === 'scale') {
            const xs = person().points.map(p => p[0]), ys = person().points.map(p => p[1]);
            ctx.strokeStyle = '#ddd'; ctx.lineWidth = 1 / (fit * v.scale); ctx.setLineDash([5, 4]);
            ctx.strokeRect(Math.min(...xs) - 8, Math.min(...ys) - 8, Math.max(...xs) - Math.min(...xs) + 16, Math.max(...ys) - Math.min(...ys) + 16);
            ctx.setLineDash([]);
        }
        const part = tool === 'scale' ? '整个人物' : joints[selected]?.[1] ?? '整个人物';
        const legend = find('.stmt-pose-legend');
        let caption = person().id + ' · ' + person().name + ' / ' + part;
        if (highlighted && tool !== 'scale') caption = highlighted.length ? '已选 ' + highlighted.length + ' 个关节' : '未选中关节';
        legend.textContent = caption + (scopeId ? ' · 限 ' + scopeId : '');
        canvas.setAttribute('aria-label', legend.textContent);
        adjust.querySelector('output').textContent = tool === 'view' ? '视图 ' + Math.round(v.scale * 100) + '%' : '整个人物';
    }
    function refresh(reveal = false) {
        scopeOptions();
        const marks = group && new Set(group.map(({ id, joint }) => id + '/' + joint));
        if (marks && ['people', 'note', 'mode'].includes(node)) marks.add(node);
        renderTree(eligible(), node, reveal, marks);
        const page = ['people', 'note', 'mode'].includes(node) ? node : group ? 'group' : selected < 0 ? 'person' : 'joint';
        for (const el of panel.querySelectorAll('[data-page]')) el.hidden = el.dataset.page !== page;
        const captions = { people: '人物管理', note: '场景注释', mode: '本次发送档位', person: person().id + ' · ' + person().name,
            group: '已选 ' + (group?.length ?? 0) + ' 个关节', joint: person().name + ' / ' + (joints[selected]?.[1] ?? '') };
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
            group = null;
            activeId = id;
            selected = joint === undefined ? -1 : Number(joint);
            cycle = undefined;
        }
        refresh();
    }
    action('add').onclick = () => {
        record();
        const gap = offset => Math.min(...state.people.map(p => Math.abs(200 + offset - p.points[1][0])));
        const p = makePerson([-72, 72, 0].sort((a, b) => gap(b) - gap(a))[0]);
        state.people.push(p);
        if (!scopeId) {
            group = null;
            activeId = node = p.id;
            selected = -1;
        }
        cycle = undefined;
        refresh(true);
    };
    action('remove').onclick = () => {
        if (state.people.length === 1) return;
        record();
        const index = state.people.indexOf(person());
        state.people.splice(index, 1);
        group = null;
        if (scopeId === activeId) scopeId = '';
        activeId = node = state.people[Math.min(index, state.people.length - 1)].id;
        selected = -1;
        cycle = undefined;
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
                scopeOptions();
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
        if (presets.box.contains(event.target)) return;
        if (event.isComposing || event.altKey || !(event.ctrlKey || event.metaKey)) return;
        const key = event.key.toLowerCase();
        if (key !== 'z' && key !== 'y') return;
        event.preventDefault();
        event.stopPropagation();
        if (key === 'y' || event.shiftKey) restore(future, past);
        else restore(past, future);
    }
    function fullscreen(on) {
        cancelDrag();
        closePanels();
        panel.closest('dialog').classList.toggle('stmt-pose-fullscreen', on);
        const btn = action('fullscreen');
        btn.setAttribute('aria-pressed', String(on));
        btn.title = on ? '退出全屏' : '全屏编辑';
        btn.setAttribute('aria-label', btn.title);
        btn.firstElementChild.className = 'fa-solid ' + (on ? 'fa-compress' : 'fa-expand');
        paint();
    }
    action('fullscreen').onclick = () => fullscreen(action('fullscreen').getAttribute('aria-pressed') === 'false');

    function closePanels() {
        const visible = !presets.box.hidden || !menu.hidden || panel.classList.contains('stmt-board-inspecting');
        presets.box.hidden = true;
        presetButton.setAttribute('aria-expanded', 'false');
        menu.hidden = true;
        more.setAttribute('aria-expanded', 'false');
        panel.classList.remove('stmt-board-inspecting');
        return visible;
    }
    more.onclick = () => {
        const show = menu.hidden;
        closePanels();
        menu.hidden = !show;
        more.setAttribute('aria-expanded', String(show));
    };
    menu.onclick = event => {
        const cmd = event.target.closest('[data-command]')?.dataset.command;
        if (!cmd) return;
        closePanels();
        if (cmd === 'new') {
            if (!window.confirm('新建画布会清空当前姿态、注释和撤销记录。继续吗？')) return;
            cancelDrag();
            past.length = future.length = 0;
            nextNumber = 1;
            state = { people: [makePerson(0)], note: '', mode: defaultMode };
            activeId = 'P1'; selected = 4; node = 'P1/4';
            group = null; scopeId = ''; typing = undefined;
            camera.reset();
            renderTree = poseTree(find('[role="tree"]'), choose);
            find('.stmt-pose-status').textContent = '';
            setTool('select');
            refresh(true);
            return;
        }
        if (cmd === 'attach') { panel.closest('dialog').querySelector('.stmt-pose-attach').click(); return; }
        if (cmd === 'add') action('add').click();
        else choose(['whole', 'person'].includes(cmd) ? activeId : cmd);
        if (cmd === 'add' && scopeId) return;
        if (cmd === 'whole') setTool('move');
        else if (panel.closest('.stmt-pose-fullscreen')) panel.classList.add('stmt-board-inspecting');
    };
    action('dismiss').onclick = () => { closePanels(); canvas.focus(); };
    function setTool(id) {
        cancelDrag();
        closePanels();
        tool = id;
        cycle = undefined;
        for (const btn of toolbar.querySelectorAll('[data-tool]')) btn.setAttribute('aria-pressed', String(btn.dataset.tool === id));
        canvas.dataset.tool = id;
        adjust.hidden = id !== 'scale' && id !== 'view';
        action('fit').hidden = id !== 'view';
        paint();
    }

    function move(before, dx, dy) {
        if (!before.length) return;
        const positions = before.map(target => target.point);
        const xs = positions.map(p => p[0]), ys = positions.map(p => p[1]);
        dx = Math.max(12 - Math.min(...xs), Math.min(388 - Math.max(...xs), Math.round(dx)));
        dy = Math.max(12 - Math.min(...ys), Math.min(428 - Math.max(...ys), Math.round(dy)));
        for (const { owner, joint, point } of before) owner.points[joint] = [point[0] + dx, point[1] + dy];
        paint();
    }
    function position(event) {
        const { box, fit, left, top } = frame();
        return [(event.clientX - box.left - left) / fit, (event.clientY - box.top - top) / fit];
    }
    function beginMove() {
        const before = snapshot();
        const points = person().points.slice();
        const targets = tool === 'scale' || (!group && selected < 0)
            ? points.map((_, joint) => ({ id: activeId, joint }))
            : group ?? [{ id: activeId, joint: selected }];
        const owners = new Map(state.people.map(p => [p.id, p]));
        const entries = targets.map(({ id, joint }) => {
            const owner = owners.get(id);
            return { owner, joint, point: owner.points[joint] };
        });
        return { before, points, entries };
    }
    function finishMove(step) {
        if (step.entries.some(({ owner, joint, point }) => point[0] !== owner.points[joint][0] || point[1] !== owner.points[joint][1])) record(step.before);
    }
    function pick(event) {
        const [x, y] = camera.world(position(event));
        const radius = (event.pointerType === 'touch' ? 19 : 12) / (frame().fit * camera.view.scale);
        const hits = boardHits(eligible(), x, y, radius);
        if (!hits.length) { cycle = undefined; group = []; node = activeId; refresh(); return; }
        group = null;
        const previous = cycle && Math.hypot(event.clientX - cycle.x, event.clientY - cycle.y) <= 6;
        // Keep the first tap's ordering when a finger lands a few pixels off center.
        const targets = previous && cycle.hits.every(h => hits.some(other => other.id === h.id && other.joint === h.joint))
            ? cycle.hits : hits;
        const index = targets === cycle?.hits ? (cycle.index + 1) % targets.length : 0;
        cycle = { hits: targets, index, x: event.clientX, y: event.clientY };
        ({ id: activeId, joint: selected } = targets[index]);
        node = selected < 0 ? activeId : activeId + '/' + selected;
        refresh(true);
    }
    function adjustSize(factor) {
        if (tool === 'view') camera.zoom(factor);
        else {
            const step = beginMove();
            person().points = scalePerson(step.points, factor);
            finishMove(step);
        }
        paint();
    }
    for (const btn of adjust.querySelectorAll('[data-step]')) btn.onclick = () => adjustSize(1.15 ** Number(btn.dataset.step));
    action('fit').onclick = () => { camera.reset(); paint(); };
    canvas.onwheel = event => {
        if (tool !== 'view') return;
        event.preventDefault();
        camera.zoom(Math.exp(-Math.sign(event.deltaY) * .12), position(event));
        paint();
    };
    canvas.onpointerdown = event => {
        if (event.button !== 0 || drag) return;
        closePanels();
        canvas.focus({ preventScroll: true });
        canvas.setPointerCapture(event.pointerId);
        if (tool === 'view') { camera.start(event.pointerId, position(event)); return; }
        drag = { id: event.pointerId, origin: camera.world(position(event)), x: event.clientX, y: event.clientY,
            step: tool === 'select' ? null : beginMove() };
    };
    function applyDrag(event) {
        if (tool === 'select' && (drag.corner || Math.hypot(event.clientX - drag.x, event.clientY - drag.y) > 8)) {
            drag.corner = camera.world(position(event));
            const [x, y] = drag.origin, [right, bottom] = drag.corner;
            drag.preview = [];
            for (const p of eligible()) p.points.forEach(([px, py], joint) => {
                if (px >= Math.min(x, right) && px <= Math.max(x, right) && py >= Math.min(y, bottom) && py <= Math.max(y, bottom)) {
                    drag.preview.push({ id: p.id, joint });
                }
            });
            paint();
        } else if (tool === 'move') {
            const [x, y] = camera.world(position(event));
            move(drag.step.entries, x - drag.origin[0], y - drag.origin[1]);
        } else if (tool === 'scale') {
            person().points = scalePerson(drag.step.points, Math.exp((drag.y - event.clientY) / 140));
            paint();
        }
    }
    canvas.onpointermove = event => {
        if (tool === 'view' && canvas.hasPointerCapture(event.pointerId)) {
            camera.move(event.pointerId, position(event));
            paint();
        } else if (drag?.id === event.pointerId) applyDrag(event);
    };
    canvas.onpointerup = event => {
        camera.end(event.pointerId);
        if (drag?.id !== event.pointerId) return;
        if (drag.step) { applyDrag(event); finishMove(drag.step); }
        else {
            applyDrag(event);
            if (!drag.corner) pick(event);
            else {
                group = drag.preview;
                cycle = undefined;
                node = activeId;
                constrainSelection();
                refresh(true);
            }
        }
        drag = undefined;
        paint();
    };
    function cancelDrag() {
        camera.clear();
        if (drag?.step) for (const { owner, joint, point } of drag.step.entries) owner.points[joint] = point;
        drag = undefined;
        paint();
    }
    canvas.onlostpointercapture = canvas.onpointercancel = event => {
        camera.end(event.pointerId);
        if (drag?.id === event.pointerId) cancelDrag();
    };
    panel.addEventListener('pointerdown', event => {
        if (!presets.box.hidden && !presets.box.contains(event.target) && event.target !== presetButton) closePanels();
        if (drag && event.target !== canvas) cancelDrag();
    }, true);
    canvas.onkeydown = event => {
        const delta = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[event.key];
        if (!delta || drag || tool !== 'move') return;
        event.preventDefault();
        const step = beginMove();
        move(step.entries, ...delta);
        finishMove(step);
    };
    const observer = new ResizeObserver(paint);
    observer.observe(canvas);
    refresh(true);
    setTool(saved?.tool ?? 'select');
    return { panel, fullscreen, closePanels, historyShortcut, suspend() {
        cancelDrag();
        if (typing === name) resolvePerson();
        observer.disconnect();
        return { state, activeId, selected, node, nextNumber, group, scopeId, past, future, tool, view: camera.view };
    }, getDraft() {
        if (typing === name) resolvePerson();
        return structuredClone(state);
    } };
}
