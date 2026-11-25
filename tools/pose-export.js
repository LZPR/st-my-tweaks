import { describePose, joints } from './pose.js';
import { isClassicPose } from './pose-scene.js';

export const poseModes = [
    { id: 'summary', label: '仅文本 · 几何摘要', image: false, text: 'summary' },
    { id: 'text', label: '仅文本 · 完整数据', image: false, text: 'full' },
    { id: 'image', label: '仅图片', image: true, text: 'note' },
    { id: 'mixed', label: '图文 · 图片与几何摘要', image: true, text: 'summary' },
    { id: 'full', label: '图文 · 图片与完整数据', image: true, text: 'full' },
];

export function poseMode(config) {
    return poseModes.find(mode => mode.id === config.poseMode)
        ?? poseModes.find(mode => mode.id === (config.includePoseData === false ? 'image' : 'full'));
}

export function poseText(points, note, mode) {
    if (mode.text === 'note') return note.trim() ? note : '';
    const data = describePose(points, note, 800, 880);
    if (mode.text === 'full') return JSON.stringify(data, null, 2);
    const summary = ['正面二维姿态。按人物自身左右，腕部距离单位为像素。'];
    for (const [side, label] of [['R', '右'], ['L', '左']]) {
        const g = data.geometry[side];
        summary.push(label + '侧：腕距图底 ' + g.腕的高度_从图底向上像素
            + '，腕高于同侧肩 ' + g.腕高于同侧肩的像素
            + '，腕越过颈中线 ' + g.腕越过颈部中线的像素
            + '，膝内角 ' + (g.膝内角_度 === null ? '未定义' : g.膝内角_度 + '°') + '。');
    }
    if (note.trim()) summary.push('注释：' + note);
    return summary.join('\n');
}

export function sceneText(people, note, mode) {
    if (mode.text === 'note' || isClassicPose(people)) return poseText(people[0].points, note, mode);
    if (mode.text === 'summary') {
        const lines = people.map(person => {
            const pos = index => person.points[index].map(v => v * 2).join(',');
            return person.id + ' · ' + person.name + '\n' + poseText(person.points, '', mode)
                + '\n共享画面坐标（x 向右，y 向下）：颈(' + pos(1) + ')，右腕(' + pos(4) + ')，左腕(' + pos(7) + ')。';
        });
        for (const person of people) {
            for (const index of [4, 7]) {
                const [x, y] = person.points[index];
                for (const other of people) {
                    if (other === person) continue;
                    const distances = other.points.map(([px, py]) => Math.hypot(px - x, py - y) * 2);
                    const nearest = Math.min(...distances);
                    if (nearest <= 12) {
                        lines.push(person.id + ' ' + joints[index][1] + ' 与 ' + other.id + ' '
                            + joints[distances.indexOf(nearest)][1] + ' 的二维投影相距 ' + Math.round(nearest) + ' 像素。');
                    }
                }
            }
        }
        if (note.trim()) lines.push('场景注释：' + note);
        return lines.join('\n\n');
    }
    return JSON.stringify({
        version: 2, skeleton: 'OpenPose COCO_18', view: 'front', width: 800, height: 880,
        coordinates: '所有人物共用主图像素坐标，左上角为原点，x 向右，y 向下。',
        legend: '按 ID 和颜色区分人物。实线为人物自身右侧或中线，虚线为左侧。下方分图逐人显示同一姿态。',
        people: people.map(({ id, name, color, points }) => {
            const { joints, geometry } = describePose(points, '', 800, 880);
            return { id, name, color, joints, geometry };
        }),
        note,
    }, null, 2);
}
