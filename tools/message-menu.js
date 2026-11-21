import { createToolbarScaleSetting, getToolbarScale } from './toolbar-scale.js';
import { applyMessageGreeting, greetingCharacter } from './message-greeting.js';

const actions = [
    { key: 'greeting', label: '添加至开场白', icon: 'fa-comment-medical' },
    { key: 'rewind', label: '回溯', icon: 'fa-clock-rotate-left' },
    { key: 'remove', label: '删除', icon: 'fa-trash' },
];
const options = [
    ['floating', '点击三个点打开悬浮菜单'],
    ['hold', '长按消息打开菜单（取代长按复制）'],
    ...actions.map(({ key, label }) => [key, `显示「${label}」`]),
];
const controls = 'a, button, input, textarea, select, summary, [contenteditable="true"], [role="button"], .mes_button, .mes_edit_buttons, .swipe_left, .swipe_right';
let refresh;

function menuButton(label, iconClasses, callback) {
    const button = document.createElement('button');
    button.type = 'button';
    const icon = document.createElement('i');
    icon.classList.add(...iconClasses);
    icon.setAttribute('aria-hidden', 'true');
    button.append(icon, label);
    button.addEventListener('click', callback);
    return button;
}

export const messageMenu = {
    id: 'message-menu',
    label: '消息操作菜单',
    renderSettings(canvas, draft) {
        for (const [key, text] of options) {
            const label = document.createElement('label');
            label.className = 'checkbox_label';
            const input = document.createElement('input');
            input.type = 'checkbox';
            input.checked = draft[key] !== false;
            input.addEventListener('change', () => { draft[key] = input.checked; });
            label.append(input, text);
            canvas.append(label);
        }
        canvas.append(createToolbarScaleSetting(draft, '悬浮菜单缩放'));
    },
    onSettingsChanged() { refresh?.(); },
    start(context, getConfig) {
        const chat = document.querySelector('#chat');
        const controller = new AbortController();
        const { signal } = controller;
        const enabled = key => getConfig()[key] !== false;
        let menu, press, anchor;
        let suppressClick = false;
        let busy = false;

        function close() {
            menu?.remove();
            menu = anchor = undefined;
        }

        function cancelPress() {
            clearTimeout(press?.timer);
            press = undefined;
        }

        function offersAction(message, key) {
            if (!enabled(key)) return false;
            if (key !== 'greeting') return true;
            const live = SillyTavern.getContext();
            const entry = live.chat[Number(message.getAttribute('mesid'))];
            return Boolean(entry?.mes?.trim() && greetingCharacter(live, entry)?.avatar);
        }

        async function runAction(message, key) {
            if (key !== 'greeting') return remove(message, key);
            if (busy || !offersAction(message, key)) return;
            busy = true;
            try {
                await applyMessageGreeting(message, () => !signal.aborted && enabled(key));
            } catch {
                toastr.error('无法读写角色开场白，请检查连接后重试。');
            } finally {
                busy = false;
            }
        }

        async function remove(message, key) {
            if (busy || !message.isConnected || !enabled(key)) return;
            const id = Number(message.getAttribute('mesid'));
            const current = SillyTavern.getContext();
            if (!Number.isInteger(id) || !current.chat[id]) return;
            const rewind = key === 'rewind';
            const targets = current.chat.slice(id, rewind ? undefined : id + 1);
            const prompt = rewind
                ? `回溯将删除消息 #${id} 及其后的所有消息，共 ${targets.length} 条。确定回溯吗？`
                : `确定删除消息 #${id} 吗？`;
            busy = true;
            try {
                const result = await context.callGenericPopup(prompt, context.POPUP_TYPE.CONFIRM, '', {
                    okButton: rewind ? '回溯' : '删除', cancelButton: '取消',
                });
                if (result !== context.POPUP_RESULT.AFFIRMATIVE) return;
                if (targets.some((target, offset) => current.chat[id + offset] !== target)) {
                    toastr.warning('消息已变化，操作已停止。');
                    return;
                }
                for (let offset = targets.length - 1; offset >= 0; offset--) {
                    const live = SillyTavern.getContext();
                    const index = id + offset;
                    if (signal.aborted || !enabled(key)) return;
                    if (document.body.matches('[data-generating="true"], [data-swiping="true"]')) {
                        toastr.warning('请等消息生成或切换完成后再操作。');
                        return;
                    }
                    if (!message.isConnected || current.chatId !== live.chatId || live.chat[index] !== targets[offset]
                        || live.chat[id] !== targets[0] || (rewind && live.chat.length !== index + 1)) {
                        toastr.warning('消息已变化，操作已停止。');
                        return;
                    }
                    await live.deleteMessage(index, undefined, false, false);
                    if (live.chat[index] === targets[offset]) {
                        toastr.warning('消息未能删除，操作已停止。');
                        return;
                    }
                }
            } catch (error) {
                console.error('[ST My Tweaks] Message deletion failed', error);
                toastr.error('删除操作未完成，请检查聊天记录。');
            } finally {
                busy = false;
            }
        }

        function open(message, x, y) {
            close();
            if (!message.isConnected || !chat.contains(message)) return;
            const original = message.querySelector('.mes_buttons');
            if (!original || !original.getClientRects().length) return;
            menu = document.createElement('div');
            menu.className = 'stmt-message-menu';
            menu.style.setProperty('--stmt-menu-scale', getToolbarScale(getConfig()) / 100);
            menu.setAttribute('role', 'group');
            menu.setAttribute('aria-label', '消息操作');
            anchor = message;
            const buttons = original.querySelectorAll('.extraMesButtons > *, :scope > .mes_button:not(.extraMesButtonsHint)');
            for (const source of buttons) {
                const style = getComputedStyle(source);
                if (source.hasAttribute('data-stmt-action') || source.hidden || source.matches(':disabled, [aria-disabled="true"]')
                    || style.display === 'none' || style.visibility === 'hidden') continue;
                const label = source.title || source.getAttribute('aria-label') || source.dataset.tooltip || source.textContent.trim();
                if (!label) continue;
                const glyph = source.querySelector('i') ?? source;
                const classes = [...glyph.classList].filter(name => name.startsWith('fa-') || ['fa', 'fas', 'far'].includes(name));
                menu.append(menuButton(label, classes.length ? classes : ['fa-solid', 'fa-circle-dot'], event => {
                    close();
                    if (source.isConnected) source.dispatchEvent(new MouseEvent('click', {
                        bubbles: true, cancelable: true, shiftKey: event.shiftKey, ctrlKey: event.ctrlKey,
                        metaKey: event.metaKey, altKey: event.altKey,
                    }));
                }));
            }
            for (const { key, label, icon } of actions.filter(action => offersAction(message, action.key))) {
                menu.append(menuButton(label, ['fa-solid', icon], () => {
                    close();
                    void runAction(message, key);
                }));
            }
            document.body.append(menu);
            const rect = menu.getBoundingClientRect();
            menu.style.left = Math.max(8, Math.min(x, document.documentElement.clientWidth - rect.width - 8)) + 'px';
            menu.style.top = Math.max(8, Math.min(y, window.innerHeight - rect.height - 8)) + 'px';
            menu.firstElementChild?.focus({ preventScroll: true });
        }

        function addInline(message) {
            if (enabled('floating')) return;
            const bar = message.querySelector('.mes_buttons .extraMesButtons');
            if (!bar) return;
            for (const { key, label, icon } of actions) {
                if (!offersAction(message, key) || bar.querySelector(`[data-stmt-action="${key}"]`)) continue;
                const button = menuButton(label, ['fa-solid', icon], () => void runAction(message, key));
                button.className = 'mes_button stmt-inline-action';
                button.dataset.stmtAction = key;
                bar.append(button);
            }
        }

        function clearInline() {
            chat.querySelectorAll('.stmt-inline-action').forEach(button => button.remove());
        }
        refresh = () => {
            close();
            cancelPress();
            chat.classList.toggle('stmt-message-hold', enabled('hold'));
            chat.classList.toggle('stmt-message-floating', enabled('floating'));
            clearInline();
            chat.querySelectorAll('.mes[mesid]').forEach(addInline);
        };
        const observer = new MutationObserver(records => {
            if (anchor && !anchor.isConnected) close();
            for (const record of records) {
                for (const node of record.addedNodes) {
                    if (node.nodeType === 1 && node.matches('.mes[mesid]')) addInline(node);
                }
            }
        });
        observer.observe(chat, { childList: true });
        refresh();

        const capture = { capture: true, signal };
        document.addEventListener('click', event => {
            if (suppressClick && event.detail) {
                suppressClick = false;
                event.preventDefault();
                event.stopImmediatePropagation();
                return;
            }
            const hint = event.target.closest?.('#chat .extraMesButtonsHint');
            if (!hint) return;
            if (!enabled('floating')) {
                addInline(hint.closest('.mes'));
                return;
            }
            event.preventDefault();
            event.stopImmediatePropagation();
            const rect = hint.getBoundingClientRect();
            open(hint.closest('.mes'), rect.left, rect.bottom);
        }, capture);

        document.addEventListener('pointerdown', event => {
            cancelPress();
            suppressClick = false;
            if (menu?.contains(event.target)) return;
            close();
            const message = event.target.closest?.('#chat .mes[mesid]');
            if (!message || !enabled('hold') || event.pointerType === 'mouse' || event.button !== 0
                || !event.isPrimary || event.target.closest(controls)) return;
            const { clientX: x, clientY: y, pointerId } = event;
            const timer = setTimeout(() => {
                open(message, x, y);
                suppressClick = Boolean(menu);
                cancelPress();
            }, 500);
            press = { x, y, pointerId, timer };
        }, capture);
        document.addEventListener('pointermove', event => {
            if (press?.pointerId === event.pointerId && Math.hypot(event.clientX - press.x, event.clientY - press.y) > 10) cancelPress();
        }, capture);
        for (const type of ['pointerup', 'pointercancel']) document.addEventListener(type, cancelPress, capture);
        chat.addEventListener('contextmenu', event => {
            if ((press || suppressClick || event.pointerType === 'touch') && enabled('hold')
                && event.target.closest('.mes') && !event.target.closest(controls)) {
                event.preventDefault();
                event.stopPropagation();
            }
        }, capture);
        document.addEventListener('scroll', event => {
            if (menu?.contains(event.target)) return;
            cancelPress();
            close();
        }, capture);
        window.addEventListener('resize', close, { signal });
        document.addEventListener('keydown', event => {
            if (menu && event.key === 'Escape') {
                event.preventDefault();
                event.stopPropagation();
                close();
            }
        }, capture);
        return () => {
            controller.abort();
            observer.disconnect();
            close();
            cancelPress();
            clearInline();
            chat.classList.remove('stmt-message-hold', 'stmt-message-floating');
            refresh = undefined;
        };
    },
};
