// A stroke paints the same checked state across every row it crosses.
export function enableMessageDrag(list, boxes, setChecked) {
    let stroke, frame;
    function stop() {
        cancelAnimationFrame(frame);
        stroke = undefined;
    }
    function paint() {
        const rect = list.getBoundingClientRect();
        const y = Math.max(rect.top + 1, Math.min(stroke.y, rect.bottom - 1));
        const row = document.elementFromPoint(stroke.x, y)?.closest('[data-message-index]');
        if (!row || !list.contains(row)) return;
        const next = Number(row.dataset.messageIndex);
        for (let i = Math.min(stroke.last, next); i <= Math.max(stroke.last, next); i++) {
            setChecked(i, stroke.on);
        }
        stroke.last = next;
    }
    function scroll() {
        if (!stroke || !list.isConnected) return stop();
        const rect = list.getBoundingClientRect();
        const up = Math.max(0, rect.top + 30 - stroke.y);
        const down = Math.max(0, stroke.y - rect.bottom + 30);
        const delta = Math.sign(down - up) * Math.min(16, Math.ceil(Math.abs(down - up) / 3));
        if (!delta) return;
        const before = list.scrollTop;
        list.scrollTop += delta;
        paint();
        if (list.scrollTop !== before) frame = requestAnimationFrame(scroll);
    }
    list.addEventListener('pointerdown', event => {
        const rail = event.target.closest('.stmt-message-rail');
        if (!rail || !event.isPrimary || event.button !== 0) return;
        const i = Number(rail.parentElement.dataset.messageIndex);
        event.preventDefault();
        list.setPointerCapture(event.pointerId);
        stroke = { id: event.pointerId, x: event.clientX, y: event.clientY, last: i, on: !boxes[i].checked };
        setChecked(i, stroke.on);
    });
    list.addEventListener('pointermove', event => {
        if (event.pointerId !== stroke?.id || event.clientY === stroke.y) return;
        stroke.y = event.clientY;
        paint();
        cancelAnimationFrame(frame);
        frame = requestAnimationFrame(scroll);
    });
    for (const type of ['pointercancel', 'lostpointercapture', 'pointerup']) {
        list.addEventListener(type, event => { if (stroke?.id === event.pointerId) stop(); });
    }
    return stop;
}
