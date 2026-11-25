import { createPoseEditor } from './pose-editor.js';
import { createSceneEditor } from './scene-editor.js';
import { renderSceneImage } from './pose-scene.js';
import { poseMode, poseModes, sceneText } from './pose-export.js';
import { poseFileStem } from './pose-context.js';

async function poseImage(people) {
    const canvas = document.createElement('canvas');
    renderSceneImage(canvas, people);
    const image = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
    if (!image) throw new Error('骨架图生成失败，请重试。');
    return image;
}

async function poseFiles(people, note, mode, currentOnly) {
    const name = poseFileStem(currentOnly);
    const files = [];
    if (mode.image) files.push(new File([await poseImage(people)], name + '.png', { type: 'image/png' }));
    const text = sceneText(people, note, mode);
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

function menuEntry(title, icon) {
    const entry = document.createElement('button');
    entry.type = 'button';
    entry.className = 'list-group-item stmt-route-entry';
    entry.innerHTML = `<i class="fa-solid ${icon} fa-fw extensionsMenuExtensionButton" aria-hidden="true"></i><span>${title}</span>`;
    entry.setAttribute('aria-haspopup', 'dialog');
    return entry;
}

let syncEntry;
function start(context, getConfig) {
    const entry = menuEntry('姿态编辑', 'fa-person');
    const sceneEntry = menuEntry('场景编辑', 'fa-shapes');
    syncEntry = config => {
        if (config.showPoseEntry === false) entry.remove();
        else document.querySelector('#extensionsMenu').append(entry);
        if (config.showSceneEntry === false) sceneEntry.remove();
        else document.querySelector('#extensionsMenu').append(sceneEntry);
    };
    syncEntry(getConfig());
    let active;
    function close() {
        if (!active) return;
        active.close();
        active.remove();
        active = undefined;
    }
    function open(title, { panel, fullscreen, historyShortcut, getFiles }) {
        const dialog = document.createElement('dialog');
        dialog.className = 'stmt-pose-dialog';
        dialog.setAttribute('aria-label', title);
        if (historyShortcut) dialog.addEventListener('keydown', historyShortcut);
        const footer = document.createElement('footer');
        footer.innerHTML = '<button type="button">取消</button><button type="button" class="stmt-pose-attach">附加到消息</button>';
        const [cancel, attach] = footer.children;
        cancel.onclick = close;
        dialog.oncancel = event => {
            event.preventDefault();
            if (dialog.classList.contains('stmt-pose-fullscreen')) fullscreen(false);
            else close();
        };
        attach.onclick = async () => {
            attach.disabled = true;
            try {
                const files = await getFiles();
                if (active !== dialog) return;
                const transfer = new DataTransfer();
                for (const file of files) transfer.items.add(file);
                const paste = new ClipboardEvent('paste', { clipboardData: transfer, bubbles: true, cancelable: true });
                const composer = document.querySelector('#send_textarea');
                const input = document.querySelector('#file_form_input');
                if (!composer || !input || !paste.clipboardData?.files.length || composer.dispatchEvent(paste)
                    || !files.every(file => Array.from(input.files).some(item => item.name === file.name))) {
                    throw new Error('当前输入框未接收附件，请重试。');
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
    }
    entry.onclick = () => {
        if (active) return;
        const editor = createPoseEditor(poseMode(getConfig()).id,
            template => SillyTavern.getContext().substituteParams(template));
        open('姿态编辑', { ...editor, getFiles() {
            const draft = editor.getDraft();
            return poseFiles(draft.people, draft.note, poseMode({ poseMode: draft.mode }), getConfig().currentRequestOnly === true);
        } });
    };
    sceneEntry.onclick = () => {
        if (!active) open('场景编辑', createSceneEditor());
    };
    context.eventSource.on(context.eventTypes.CHAT_CHANGED, close);
    return () => {
        context.eventSource.removeListener(context.eventTypes.CHAT_CHANGED, close);
        close();
        entry.remove();
        sceneEntry.remove();
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
    const sceneLabel = document.createElement('label');
    sceneLabel.className = 'checkbox_label';
    const sceneCheckbox = document.createElement('input');
    sceneCheckbox.type = 'checkbox';
    sceneCheckbox.checked = draft.showSceneEntry !== false;
    sceneCheckbox.onchange = () => { draft.showSceneEntry = sceneCheckbox.checked; };
    sceneLabel.append(sceneCheckbox, '在输入框扩展菜单中显示「场景编辑」');
    const mode = modeSelector('默认发送档位', draft);
    const hint = document.createElement('small');
    const lifetime = document.createElement('label');
    lifetime.className = 'checkbox_label';
    const once = document.createElement('input');
    once.type = 'checkbox';
    once.checked = draft.currentRequestOnly === true;
    once.onchange = () => { draft.currentRequestOnly = once.checked; };
    lifetime.append(once, '姿态仅发送给当前请求');
    const lifetimeHint = document.createElement('small');
    lifetimeHint.textContent = '勾选后，新附加的姿态图、数据和注释仍可在聊天中查看。后续请求（包括重新生成）会跳过它们。';
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
        estimate.textContent = 'DeepSeek Flash 单人样本（每百次，空闲时段估价）：思考 '
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
    canvas.append(label, sceneLabel, mode.label, hint, estimate, status, lifetime, lifetimeHint);
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
