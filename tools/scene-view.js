export function sceneView(paper, canvas, controls, isActive) {
    let zoom = 1, panX = 0, panY = 0;
    const fingers = new Map();
    const center = () => {
        const r = paper.getBoundingClientRect();
        return [r.left + r.width / 2, r.top + r.height / 2];
    };
    function render() {
        const limitX = (paper.clientWidth + canvas.offsetWidth * zoom) / 2;
        const limitY = (paper.clientHeight + canvas.offsetHeight * zoom) / 2;
        panX = Math.max(32 - limitX, Math.min(limitX - 32, panX));
        panY = Math.max(32 - limitY, Math.min(limitY - 32, panY));
        canvas.style.transform = `translate(${panX}px, ${panY}px) scale(${zoom})`;
        controls.querySelector('[data-reset]').textContent = Math.round(zoom * 100) + '%';
    }
    function scale(factor, from, to = from) {
        const next = Math.max(.25, Math.min(5, zoom * factor));
        const [cx, cy] = center();
        panX = to[0] - cx - (from[0] - cx - panX) * next / zoom;
        panY = to[1] - cy - (from[1] - cy - panY) * next / zoom;
        zoom = next;
        render();
    }
    controls.querySelector('[data-in]').onclick = () => scale(1.25, center());
    controls.querySelector('[data-out]').onclick = () => scale(1 / 1.25, center());
    controls.querySelector('[data-reset]').onclick = () => {
        zoom = 1;
        panX = panY = 0;
        render();
    };
    paper.addEventListener('wheel', event => {
        if (!isActive()) return;
        event.preventDefault();
        scale(event.deltaY < 0 ? 1.1 : 1 / 1.1, [event.clientX, event.clientY]);
    }, { passive: false });
    function measure() {
        const [a, b] = fingers.values();
        if (!b) return { at: a, distance: 1 };
        return { at: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2],
            distance: Math.max(1, Math.hypot(a[0] - b[0], a[1] - b[1])) };
    }
    paper.onpointerdown = event => {
        if (!isActive() || event.button !== 0 || fingers.size >= 2) return;
        fingers.set(event.pointerId, [event.clientX, event.clientY]);
        paper.setPointerCapture(event.pointerId);
    };
    paper.onpointermove = event => {
        if (!fingers.has(event.pointerId)) return;
        const previous = measure();
        fingers.set(event.pointerId, [event.clientX, event.clientY]);
        const current = measure();
        scale(current.distance / previous.distance, previous.at, current.at);
    };
    paper.onpointerup = paper.onpointercancel = paper.onlostpointercapture =
        event => fingers.delete(event.pointerId);
}
