import { describePose } from './pose.js';

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
