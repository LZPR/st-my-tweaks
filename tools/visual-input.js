import { createPoseEditor } from './pose-editor.js';
import { drawPose } from './pose.js';
import { poseMode, poseModes, poseText } from './pose-export.js';

async function poseImage(points) {
    const canvas = document.createElement('canvas');
    canvas.width = 800;
    canvas.height = 880;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#17232a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.scale(2, 2);
    drawPose(ctx, points);
    const image = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
    if (!image) throw new Error('骨架图生成失败，请重试。');
    return image;
}

async function poseFiles(points, note, mode) {
    const name = '姿态-' + Date.now();
    const files = [];
    if (mode.image) files.push(new File([await poseImage(points)], name + '.png', { type: 'image/png' }));
    const text = poseText(points, note, mode);
    if (text) files.push(new File([text], name + '.txt', { type: 'text/plain' }));
    return files;
}

function modeSelector(title, config) {
    const label = document.createElement('label');
    const select = document.createElement('select');
    select.className = 'text_pole';
    for (const mode of poseModes) select.add(new Option(mode.label, mode.id));
    select.value = poseMode(config).id;
    label.append(title, select);
    return { label, select };
}

let syncEntry;
function start(context, getConfig) {
    const entry = document.createElement('button');
    entry.type = 'button';
    entry.className = 'list-group-item stmt-route-entry';
    entry.innerHTML = '<i class="fa-solid fa-person fa-fw extensionsMenuExtensionButton" aria-hidden="true"></i><span>姿态编辑</span>';
    entry.setAttribute('aria-haspopup', 'dialog');
    syncEntry = config => {
        if (config.showPoseEntry === false) entry.remove();
        else document.querySelector('#extensionsMenu').append(entry);
    };
    syncEntry(getConfig());
    let active;
    function close() {
        if (!active) return;
        active.close();
        active.remove();
        active = undefined;
    }
    entry.onclick = () => {
        if (active) return;
        const { panel, points, note } = createPoseEditor();
        const mode = modeSelector('本次发送档位', getConfig());
        panel.querySelector('.stmt-pose-controls').append(mode.label);
        const dialog = document.createElement('dialog');
        dialog.className = 'stmt-pose-dialog';
        dialog.setAttribute('aria-label', '姿态编辑');
        const footer = document.createElement('footer');
        footer.innerHTML = '<button type="button">取消</button><button type="button" class="stmt-pose-attach">附加到消息</button>';
        const [cancel, attach] = footer.children;
        cancel.onclick = close;
        dialog.oncancel = event => { event.preventDefault(); close(); };
        attach.onclick = async () => {
            attach.disabled = true;
            try {
                const files = await poseFiles(structuredClone(points), note.value, poseMode({ poseMode: mode.select.value }));
                if (active !== dialog) return;
                const transfer = new DataTransfer();
                for (const file of files) transfer.items.add(file);
                const paste = new ClipboardEvent('paste', { clipboardData: transfer, bubbles: true, cancelable: true });
                const composer = document.querySelector('#send_textarea');
                const input = document.querySelector('#file_form_input');
                if (!composer || !input || !paste.clipboardData?.files.length || composer.dispatchEvent(paste)
                    || !files.every(file => Array.from(input.files).some(item => item.name === file.name))) {
                    throw new Error('当前输入框未接收姿态附件，请重试。');
                }
                close();
                composer.focus({ preventScroll: true });
            } catch (error) {
                panel.querySelector('[role=status]').textContent = error.message;
            } finally {
                attach.disabled = false;
            }
        };
        dialog.append(panel, footer);
        document.body.append(dialog);
        active = dialog;
        dialog.showModal();
    };
    context.eventSource.on(context.eventTypes.CHAT_CHANGED, close);
    return () => {
        context.eventSource.removeListener(context.eventTypes.CHAT_CHANGED, close);
        close();
        entry.remove();
        syncEntry = undefined;
    };
}

function renderSettings(canvas, draft) {
    const label = document.createElement('label');
    label.className = 'checkbox_label';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = draft.showPoseEntry !== false;
    checkbox.onchange = () => { draft.showPoseEntry = checkbox.checked; };
    label.append(checkbox, '在输入框扩展菜单中显示「姿态编辑」');
    const mode = modeSelector('默认发送档位', draft);
    const hint = document.createElement('small');
    hint.textContent = '摘要包含双腕位置与膝角；完整数据另含 18 个关节坐标。所有档位均保留手写注释。';
    const estimate = document.createElement('p');
    estimate.setAttribute('aria-live', 'polite');
    // Snapshot of the paired benchmark in docs/pose-tiers.md, not a live quote.
    const benchmark = {
        summary: ['8/72', '0.79', '36/72', '0.03'],
        text: ['72/72', '0.49', '53/72', '0.07'],
        image: ['0/72', '0.88', '31/72', '0.06'],
        mixed: ['10/72', '0.85', '44/72', '0.07'],
        full: ['66/72', '0.57', '60/72', '0.10'],
    };
    function showEstimate() {
        const [thinkingScore, thinkingCost, fastScore, fastCost] = benchmark[mode.select.value];
        estimate.textContent = 'DeepSeek Flash 样本（每百次，空闲时段估价）：思考 '
            + thinkingScore + ' 题正确，约 ¥' + thinkingCost + '；非思考 '
            + fastScore + ' 题正确，约 ¥' + fastCost + '。输出上限 2048 token。';
    }
    mode.select.onchange = () => {
        draft.poseMode = mode.select.value;
        showEstimate();
    };
    showEstimate();
    const status = document.createElement('p');
    status.setAttribute('role', 'status');
    status.textContent = '正在检查当前连接的图片内联状态…';
    canvas.append(label, mode.label, hint, estimate, status);
    showInlineStatus(status);
}

async function showInlineStatus(status) {
    try {
        const { isImageInliningSupported, getChatCompletionModel } = await import('../../../../openai.js');
        const ctx = SillyTavern.getContext();
        if (ctx.mainApi !== 'openai') {
            status.textContent = '当前连接未使用聊天补全，ST 不会通过此路径内联骨架图。';
            return;
        }
        const settings = ctx.chatCompletionSettings;
        const model = getChatCompletionModel(settings) || '当前模型';
        const support = isImageInliningSupported() ? 'ST 已启用图片内联。'
            : settings.media_inlining ? 'ST 未将当前模型识别为可内联图片。'
                : 'ST 已关闭「发送内联媒体」。';
        status.textContent = model + ' · ' + support;
    } catch {
        status.textContent = '无法读取 ST 的图片内联状态，可在「预览请求」中检查。';
    }
}

export const visualInput = {
    id: 'visual-input', label: '可视化输入', start, renderSettings,
    onSettingsChanged: config => syncEntry?.(config),
};
