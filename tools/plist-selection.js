// Long press starts selection. Each stroke paints the state opposite its first chip.
export function parameterSelection(panel, sections, prepare, update) {
    const selected = new Set();
    let active = false;
    let stroke, timer, frame;
    function mark(chip, on) {
        if (!chip || selected.has(chip) === on) return;
        if (on) selected.add(chip);
        else selected.delete(chip);
        chip.setAttribute('aria-pressed', String(on));
        update(active, selected);
    }
    function stopStroke() {
        clearTimeout(timer);
        cancelAnimationFrame(frame);
        stroke = undefined;
    }
    function exit() {
        stopStroke();
        active = false;
        selected.clear();
        panel.classList.remove('pl-selecting');
        for (const chip of sections.querySelectorAll('.pl-chip[aria-pressed]')) chip.removeAttribute('aria-pressed');
        update(active, selected);
    }
    function begin(chip) {
        const parent = chip.parentElement;
        const index = Array.from(parent.children).indexOf(chip);
        if (!prepare()) return;
        active = true;
        panel.classList.add('pl-selecting');
        for (const item of sections.querySelectorAll('.pl-chip')) item.setAttribute('aria-pressed', 'false');
        mark(parent.children[index], true);
    }
    function hit(x, y) {
        const el = document.elementFromPoint(x, y)?.closest('.pl-chip');
        return el && sections.contains(el) ? el : null;
    }
    function scroll() {
        if (!active || !stroke || !panel.isConnected) return;
        for (let el = sections.parentElement; el; el = el.parentElement) {
            if (el.scrollHeight <= el.clientHeight || !/auto|scroll/.test(getComputedStyle(el).overflowY)) continue;
            const rect = el.getBoundingClientRect();
            if (stroke.y < rect.top + 32) el.scrollTop -= 10;
            else if (stroke.y > rect.bottom - 32) el.scrollTop += 10;
            break;
        }
        mark(hit(stroke.x, stroke.y), stroke.on);
        frame = requestAnimationFrame(scroll);
    }
    sections.addEventListener('pointerdown', event => {
        const chip = event.target.closest('.pl-chip');
        if (!chip || !event.isPrimary || event.button !== 0) return;
        stopStroke();
        stroke = { id: event.pointerId, x: event.clientX, y: event.clientY, on: !selected.has(chip) };
        if (active) {
            sections.setPointerCapture(event.pointerId);
            mark(chip, stroke.on);
        } else {
            timer = setTimeout(() => {
                if (!chip.isConnected || !chip.getClientRects().length) return stopStroke();
                sections.setPointerCapture(event.pointerId);
                begin(chip);
            }, 450);
        }
    });
    sections.addEventListener('pointermove', event => {
        if (!stroke || stroke.id !== event.pointerId) return;
        if (!active) {
            if (Math.hypot(event.clientX - stroke.x, event.clientY - stroke.y) > 7) stopStroke();
            return;
        }
        // Interpolate over coalesced moves so a quick swipe also hits small chips.
        const dx = event.clientX - stroke.x, dy = event.clientY - stroke.y;
        const steps = Math.ceil(Math.hypot(dx, dy) / 8);
        for (let i = 1; i <= steps; i++) mark(hit(stroke.x + dx * i / steps, stroke.y + dy * i / steps), stroke.on);
        stroke.x = event.clientX;
        stroke.y = event.clientY;
        cancelAnimationFrame(frame);
        frame = requestAnimationFrame(scroll);
    });
    sections.addEventListener('touchmove', event => {
        if (active && stroke && event.cancelable) event.preventDefault();
    }, { passive: false });
    for (const type of ['pointerup', 'pointercancel']) {
        sections.addEventListener(type, stopStroke);
    }
    sections.addEventListener('lostpointercapture', event => { if (event.target === sections) stopStroke(); });
    sections.addEventListener('pointerleave', () => { if (!active) stopStroke(); });
    sections.addEventListener('contextmenu', event => {
        if (event.target.closest('.pl-chip')) event.preventDefault();
    });
    sections.addEventListener('click', event => {
        if (!active) return;
        event.stopPropagation();
        const chip = event.target.closest('.pl-chip');
        if (chip && event.detail === 0) mark(chip, !selected.has(chip));
    }, true);
    sections.addEventListener('keydown', event => {
        const chip = event.target.closest('.pl-chip');
        if (chip && !active && event.shiftKey && event.key === 'Enter') {
            event.preventDefault();
            event.stopPropagation();
            begin(chip);
        }
    });
    return { selected, exit, get active() { return active; } };
}
