import { splitTraits } from './plist-format.js';

function parts(row) {
    return (splitTraits(row.value) ?? [row.value]).map(value => value.trim()).filter(Boolean);
}

// Destination indices describe insertion slots before the source is removed.
export function moveItem(blocks, source, target) {
    const fromRows = blocks[source.block];
    const toRows = blocks[target.block];
    let from = fromRows;
    let to = toRows;
    let index = source.row;
    let slot = target.row;
    if (source.item !== undefined) {
        from = parts(fromRows[source.row]);
        to = fromRows === toRows && source.row === target.row ? from : parts(toRows[target.row]);
        index = source.item;
        slot = target.item ?? to.length;
    }
    if (from === to && slot > index) slot--;
    if (from === to && slot === index) return false;
    to.splice(slot, 0, from.splice(index, 1)[0]);
    if (source.item !== undefined) {
        fromRows[source.row].value = from.join(', ');
        toRows[target.row].value = to.join(', ');
    }
    return true;
}

export function sortView(blocks, display, move) {
    const view = document.createElement('div');
    view.className = 'pl-sort';
    let selected, pointer, marker, frame;
    const positions = new WeakMap();
    function control(label, position, kind, parent) {
        const el = document.createElement('button');
        el.type = 'button';
        el.textContent = label;
        el.className = 'pl-sort-' + kind;
        positions.set(el, position);
        parent.append(el);
        return el;
    }
    blocks.forEach((rows, block) => {
        const group = document.createElement('section');
        const title = document.createElement('h4');
        title.textContent = '片段 ' + (block + 1);
        group.append(title);
        rows.forEach((attribute, row) => {
            const line = document.createElement('div');
            line.className = 'pl-sort-row';
            const name = attribute.appliedPrefix + attribute.name;
            control(name || '未命名属性', { block, row }, 'key', line);
            const values = document.createElement('div');
            values.className = 'pl-sort-values';
            positions.set(values, { block, row });
            const items = parts(attribute);
            items.forEach((raw, item) => control(display(raw) || '空参数', { block, row, item }, 'item', values));
            const count = document.createElement('small');
            count.className = 'pl-sort-count';
            count.textContent = items.length + ' 个参数';
            values.append(count);
            line.append(values);
            group.append(line);
        });
        control('移至片段末尾', { block, row: rows.length }, 'end', group);
        view.append(group);
    });

    function select(el) {
        selected?.classList.remove('pl-picked');
        selected = el;
        marker?.removeAttribute('data-drop');
        marker = undefined;
        el?.classList.add('pl-picked');
    }
    function destination(el, x, y) {
        if (!selected || !el || !view.contains(el)) return;
        const row = el.closest('.pl-sort-row');
        const source = positions.get(selected);
        let node = el.closest('button, .pl-sort-values');
        if (source.item === undefined && row) node = row.querySelector('.pl-sort-key');
        if (source.item !== undefined && row && !node) node = row.querySelector('.pl-sort-values');
        const position = positions.get(node);
        if (!position || (source.item !== undefined && node.classList.contains('pl-sort-end'))) return;
        const target = { ...position };
        const rect = (source.item === undefined && row ? row : node).getBoundingClientRect();
        let side = 'inside';
        if (source.item === undefined && row) {
            side = y > rect.top + rect.height / 2 ? 'after' : 'before';
            if (side === 'after') target.row++;
        } else if (target.item !== undefined) {
            side = x > rect.left + rect.width / 2 ? 'after' : 'before';
            if (side === 'after') target.item++;
        }
        return { node, target, side };
    }
    function drop(hit) {
        const source = positions.get(selected);
        select(null);
        if (hit && moveItem(blocks, source, hit.target)) move(blocks, hit.target.block);
    }
    function hover() {
        const { x, y } = pointer;
        const hit = destination(document.elementFromPoint(x, y), x, y);
        marker?.removeAttribute('data-drop');
        marker = hit?.node;
        if (marker) marker.dataset.drop = hit.side;
        return hit;
    }
    function scroll() {
        if (!view.isConnected || !pointer?.dragging) return;
        for (let el = view.parentElement; el; el = el.parentElement) {
            if (el.scrollHeight <= el.clientHeight || !/auto|scroll/.test(getComputedStyle(el).overflowY)) continue;
            const rect = el.getBoundingClientRect();
            if (pointer.y < rect.top + 36) el.scrollTop -= 12;
            if (pointer.y > rect.bottom - 36) el.scrollTop += 12;
            break;
        }
        hover();
        frame = requestAnimationFrame(scroll);
    }
    view.addEventListener('pointerdown', event => {
        const el = event.target.closest('.pl-sort-key, .pl-sort-item');
        if (!el || !event.isPrimary || event.button !== 0) return;
        pointer = { el, x: event.clientX, y: event.clientY, id: event.pointerId };
        el.setPointerCapture(event.pointerId);
    });
    view.addEventListener('pointermove', event => {
        if (!pointer || pointer.id !== event.pointerId) return;
        if (!pointer.dragging) {
            if (Math.hypot(event.clientX - pointer.x, event.clientY - pointer.y) < 5) return;
            select(pointer.el);
            pointer.dragging = true;
            frame = requestAnimationFrame(scroll);
        }
        pointer.x = event.clientX;
        pointer.y = event.clientY;
        hover();
    });
    let skipClick = false;
    view.addEventListener('pointerup', event => {
        if (!pointer || pointer.id !== event.pointerId) return;
        if (pointer.dragging) {
            skipClick = true;
            drop(destination(document.elementFromPoint(event.clientX, event.clientY), event.clientX, event.clientY));
            setTimeout(() => { skipClick = false; }, 0);
        }
        pointer = undefined;
        cancelAnimationFrame(frame);
    });
    view.addEventListener('lostpointercapture', () => {
        if (pointer?.dragging) select(null);
        pointer = undefined;
        cancelAnimationFrame(frame);
    });
    view.addEventListener('click', event => {
        if (skipClick) return;
        const el = event.target.closest('button');
        if (!selected) {
            if (el && !el.classList.contains('pl-sort-end')) select(el);
        } else if (el === selected) select(null);
        else drop(destination(event.target));
    });
    view.addEventListener('keydown', event => {
        if (event.key === 'Escape' && selected) {
            event.preventDefault();
            event.stopPropagation();
            select(null);
        }
    });
    return view;
}
