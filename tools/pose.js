// OpenPose COCO_18 order. Coordinates use a 400 × 440 front-view plane.
export const joints = [
    ['Nose', '鼻尖', 200, 64], ['Neck', '颈部', 200, 112],
    ['RShoulder', '右肩', 155, 115], ['RElbow', '右肘', 126, 184], ['RWrist', '右腕', 101, 241],
    ['LShoulder', '左肩', 245, 115], ['LElbow', '左肘', 274, 184], ['LWrist', '左腕', 299, 241],
    ['RHip', '右髋', 173, 228], ['RKnee', '右膝', 165, 312], ['RAnkle', '右踝', 152, 398],
    ['LHip', '左髋', 227, 228], ['LKnee', '左膝', 235, 312], ['LAnkle', '左踝', 248, 398],
    ['REye', '右眼', 190, 55], ['LEye', '左眼', 210, 55],
    ['REar', '右耳', 179, 63], ['LEar', '左耳', 221, 63],
];

export const colors = { R: '#ffae70', L: '#67d9d0', center: '#f3f3ee' };
export const initialPose = () => joints.map(([, , x, y]) => [x, y]);
const bones = [[1, 0], [1, 2], [2, 3], [3, 4], [1, 5], [5, 6], [6, 7],
    [1, 8], [8, 9], [9, 10], [1, 11], [11, 12], [12, 13],
    [0, 14], [14, 16], [0, 15], [15, 17]];

function jointColor(index) {
    return colors[joints[index][0][0]] ?? colors.center;
}

// Caller sets the transform from pose units to display or output pixels.
export function drawPose(ctx, points, selected = -1) {
    ctx.lineCap = 'round';
    for (const [a, b] of bones) {
        ctx.strokeStyle = jointColor(b);
        ctx.lineWidth = b >= 14 ? 3 : 7;
        ctx.beginPath();
        ctx.moveTo(...points[a]);
        ctx.lineTo(...points[b]);
        ctx.stroke();
    }
    points.forEach(([x, y], index) => {
        ctx.fillStyle = jointColor(index);
        ctx.strokeStyle = '#17232a';
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        ctx.arc(x, y, index >= 14 ? 4 : 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        if (selected === index) {
            ctx.strokeStyle = 'white';
            ctx.beginPath();
            ctx.arc(x, y, 11, 0, Math.PI * 2);
            ctx.stroke();
        }
    });
}
