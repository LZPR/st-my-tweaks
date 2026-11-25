export const boardWidth = 800;
export const boardHeight = 560;
export const paperColor = '#fbf7ed';

export function blockPath(points) {
    const path = new Path2D();
    path.moveTo(...points[0]);
    for (const point of points.slice(1)) path.lineTo(...point);
    path.closePath();
    return path;
}

export function drawBoard(canvas, blocks, selected = -1) {
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = paperColor;
    ctx.fillRect(0, 0, boardWidth, boardHeight);
    blocks.forEach((block, index) => {
        const path = blockPath(block.points);
        ctx.fillStyle = block.color;
        ctx.fill(path);
        if (index === selected) {
            ctx.save();
            ctx.strokeStyle = '#242729';
            ctx.lineWidth = 3;
            ctx.setLineDash([7, 6]);
            ctx.stroke(path);
            ctx.restore();
        }
    });
}

export async function boardFiles(blocks, stem) {
    const canvas = document.createElement('canvas');
    canvas.width = boardWidth;
    canvas.height = boardHeight;
    drawBoard(canvas, blocks);
    const png = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
    if (!png) throw new Error('场景图生成失败，请重试。');
    const text = [
        `场景画板 ${boardWidth} × ${boardHeight} 像素。原点为左上角，横坐标向右，纵坐标向下。色块按由远到近的叠放顺序排列。`,
        ...blocks.map(({ name, color, points, note }, i) => {
            const xs = points.map(point => point[0]);
            const ys = points.map(point => point[1]);
            const range = values => [values.reduce((a, b) => Math.min(a, b)), values.reduce((a, b) => Math.max(a, b))];
            return `${i + 1}. ${name}（${color}） 横向范围 ${range(xs).join('–')}，纵向范围 ${range(ys).join('–')}`
                + (note.trim() ? '\n   注释：' + note : '');
        }),
    ].join('\n');

    return [new File([png], stem + '.png', { type: 'image/png' }),
        new File([text], stem + '.txt', { type: 'text/plain' })];
}
