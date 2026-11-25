import { boardHeight, boardWidth } from './scene-board.js';

export function shapePoints(tool, [sx, sy], [x, y]) {
    if (tool === 'rect') return [[sx, sy], [x, sy], [x, y], [sx, y]];
    const width = x - sx, height = y - sy;
    if (tool === 'triangle') return [[sx + width / 2, Math.min(sy, y)], [sx, Math.max(sy, y)], [x, Math.max(sy, y)]];
    let rx = width / 2, ry = height / 2;
    if (tool === 'circle') {
        const radius = Math.min(Math.abs(rx), Math.abs(ry));
        rx = Math.sign(rx) * radius;
        ry = Math.sign(ry) * radius;
    }
    return Array.from({ length: 96 }, (_, i) => {
        const angle = i * Math.PI / 48;
        return [Math.round(sx + rx + rx * Math.cos(angle)), Math.round(sy + ry + ry * Math.sin(angle))];
    });
}

// Flatten the cubic segments into the same board coordinates used by hit testing,
// movement, PNG export and the text attachment.
export function penPoints(anchors, closed) {
    if (!anchors.length) return [];
    const points = [anchors[0].at];
    for (let i = 1; i < anchors.length + Number(closed); i++) {
        const a = anchors[i - 1], b = anchors[i % anchors.length];
        const steps = a.dx || a.dy || b.dx || b.dy ? 40 : 1;
        for (let step = 1; step <= steps; step++) {
            const t = step / steps, u = 1 - t;
            const cubic = (p, h, q, k) => Math.round(u ** 3 * p + 3 * u * u * t * (p + h)
                + 3 * u * t * t * (q - k) + t ** 3 * q);
            points.push([Math.max(0, Math.min(boardWidth, cubic(a.at[0], a.dx, b.at[0], b.dx))),
                Math.max(0, Math.min(boardHeight, cubic(a.at[1], a.dy, b.at[1], b.dy)))]);
        }
    }
    return points;
}

export function hasArea(points) {
    const first = points[0];
    const second = points.find(([x, y]) => x !== first[0] || y !== first[1]);
    return second && points.some(([x, y]) =>
        (second[0] - first[0]) * (y - first[1]) !== (second[1] - first[1]) * (x - first[0]));
}
