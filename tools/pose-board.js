import { bones } from './pose.js';

function segmentDistance(x, y, [ax, ay], [bx, by]) {
    const dx = bx - ax, dy = by - ay;
    const length = dx * dx + dy * dy;
    const t = length ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / length)) : 0;
    return Math.hypot(x - ax - t * dx, y - ay - t * dy);
}

export function boardHits(people, x, y, radius) {
    const nodes = [], bodies = [];
    for (const p of people) {
        p.points.forEach(([px, py], joint) => {
            const distance = Math.hypot(px - x, py - y);
            if (distance <= radius) nodes.push({ id: p.id, joint, distance });
        });
        const distance = Math.min(...bones.map(([a, b]) => segmentDistance(x, y, p.points[a], p.points[b])));
        if (distance < radius * .7) bodies.push({ id: p.id, joint: -1, distance });
    }
    const byDistance = (a, b) => a.distance - b.distance;
    return [...nodes.sort(byDistance), ...bodies.sort(byDistance)];
}

export function scalePerson(points, factor) {
    const xs = points.map(p => p[0]), ys = points.map(p => p[1]);
    const left = Math.min(...xs), right = Math.max(...xs), top = Math.min(...ys), bottom = Math.max(...ys);
    const cx = (left + right) / 2, cy = (top + bottom) / 2;
    const halfWidth = (right - left) / 2, halfHeight = (bottom - top) / 2;
    const maximum = Math.min(halfWidth ? Math.min(cx - 12, 388 - cx) / halfWidth : Infinity,
        halfHeight ? Math.min(cy - 12, 428 - cy) / halfHeight : Infinity);
    const minimum = Math.min(1, 12 / Math.max(halfWidth, halfHeight));
    const k = Math.max(minimum, Math.min(maximum, factor));
    return points.map(([x, y]) => [Math.round(cx + (x - cx) * k), Math.round(cy + (y - cy) * k)]);
}

// Camera coordinates are in the fixed 400 × 440 drawing plane. They are never
// serialized with the scene or included in pose history.
export function boardCamera() {
    const view = { x: 0, y: 0, scale: 1 };
    const fingers = new Map();
    function constrain() {
        view.x = Math.max(24 - 400 * view.scale, Math.min(376, view.x));
        view.y = Math.max(24 - 440 * view.scale, Math.min(416, view.y));
    }
    function zoom(factor, anchor = [200, 220], target = anchor) {
        const scale = Math.max(.5, Math.min(5, view.scale * factor));
        view.x = target[0] - (anchor[0] - view.x) * scale / view.scale;
        view.y = target[1] - (anchor[1] - view.y) * scale / view.scale;
        view.scale = scale;
        constrain();
    }
    function gesture() {
        const [a, b] = fingers.values();
        if (!b) return { center: a, span: 0 };
        return { center: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], span: Math.hypot(a[0] - b[0], a[1] - b[1]) };
    }
    return { view, zoom,
        world: ([x, y]) => [(x - view.x) / view.scale, (y - view.y) / view.scale],
        reset: () => Object.assign(view, { x: 0, y: 0, scale: 1 }),
        start(id, point) { fingers.set(id, point); },
        move(id, point) {
            if (!fingers.has(id)) return;
            const before = gesture();
            fingers.set(id, point);
            const after = gesture();
            zoom(before.span && after.span ? after.span / before.span : 1, before.center, after.center);
        },
        end(id) { fingers.delete(id); },
        clear() { fingers.clear(); },
    };
}
