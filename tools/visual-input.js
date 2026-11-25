import { createPoseEditor } from './pose-editor.js';
import { describePose, drawPose } from './pose.js';

async function poseFiles(points, note) {
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
    const data = describePose(points, note, canvas.width, canvas.height);
    const name = '姿态-' + Date.now();
    return [new File([image], name + '.png', { type: 'image/png' }),
        new File([JSON.stringify(data, null, 2)], name + '.txt', { type: 'text/plain' })];
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
                const files = await poseFiles(structuredClone(points), note.value);
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
    canvas.append(label);
}

export const visualInput = {
    id: 'visual-input', label: '可视化输入', start, renderSettings,
    onSettingsChanged: config => syncEntry?.(config),
};
