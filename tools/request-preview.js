import { previewDialog } from './request-preview-view.js';

function start(context) {
    const entry = document.createElement('button');
    entry.type = 'button';
    entry.className = 'list-group-item stmt-route-entry';
    entry.innerHTML = '<i class="fa-solid fa-list-check fa-fw extensionsMenuExtensionButton" aria-hidden="true"></i><span>预览请求</span>';
    entry.setAttribute('aria-haspopup', 'dialog');
    document.querySelector('#extensionsMenu').append(entry);
    let active;
    let pending = false;
    function close() {
        if (!active) return;
        active.controller.abort();
        active.dialog.close();
        active.dialog.remove();
        active = null;
    }
    entry.onclick = async () => {
        if (active || pending) return;
        const { dialog, render, status } = previewDialog();
        const controller = new AbortController();
        active = { dialog, controller };
        pending = true;
        dialog.querySelector('.stmt-rp-close').onclick = close;
        dialog.oncancel = e => { e.preventDefault(); close(); };
        document.body.append(dialog);
        dialog.showModal();
        try {
            const { buildRequestPreview } = await import('./request-preview-data.js');
            controller.signal.throwIfAborted();
            const snapshot = await buildRequestPreview(SillyTavern.getContext(), controller.signal);
            if (!controller.signal.aborted) render(snapshot);
        } catch (error) {
            if (!controller.signal.aborted) status('无法预览。' + error.message);
        } finally {
            pending = false;
        }
    };
    context.eventSource.on(context.eventTypes.CHAT_CHANGED, close);
    return () => {
        context.eventSource.removeListener(context.eventTypes.CHAT_CHANGED, close);
        close();
        entry.remove();
    };
}

export const requestPreview = { id: 'request-preview', label: '预览请求', start };
