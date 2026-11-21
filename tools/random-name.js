import { editFilters } from './name-filters.js';
import { librarySource, normalizeFilters, parseLibrary, pickName, renderLibrarySettings } from './name-library.js';

const fieldSelector = 'input#character_name_pole, dialog.popup textarea.popup-input';
const rowClass = 'st-my-tweaks-name-row';
const nameHeadings = ['New name:', 'Enter a name for this persona:', 'Rename Persona'];

function isNameField(field, context) {
    if (field.id === 'character_name_pole') return true;
    const content = field.closest('dialog.popup').querySelector('.popup-content');
    if (!content || field.style.display === 'none') return false;
    if (content.querySelector('.onboarding')) return true;
    const title = (content.querySelector('h3') ?? content).textContent.trim();
    return nameHeadings.some(key => title === key || title === context.translate?.(key));
}

export const randomName = {
    id: 'random-name',
    label: '角色随机取名',
    renderSettings: renderLibrarySettings,
    start(context, getConfig, updateConfig) {
        let active = true;
        let timer;
        let source;
        let library;
        function currentLibrary() {
            const current = librarySource(getConfig());
            if (current !== source) {
                library = parseLibrary(current);
                source = current;
            }
            return library;
        }

        function mount(field) {
            if (!field.isConnected || field.parentElement.classList.contains(rowClass) || !isNameField(field, context)) return;
            const row = document.createElement('div');
            row.className = rowClass;
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'menu_button';
            const icon = document.createElement('i');
            icon.className = 'fa-solid fa-dice-five';
            icon.setAttribute('aria-hidden', 'true');
            button.append(icon);
            button.title = '随机取名，长按或按 Shift+Enter 设置条件';
            button.setAttribute('aria-label', button.title);
            const focused = document.activeElement === field;
            field.before(row);
            row.append(field, button);
            if (focused) field.focus({ preventScroll: true });

            const editable = () => field.isConnected && !field.disabled && !field.readOnly;
            async function configure() {
                if (!editable()) return;
                const library = currentLibrary();
                const filters = normalizeFilters(getConfig().filters, library);
                if (await editFilters(context, library, filters) && active) updateConfig({ filters });
            }
            let held = false;
            const cancelTimer = () => clearTimeout(timer);
            button.addEventListener('pointerdown', event => {
                if (!event.isPrimary || event.button !== 0) return;
                cancelTimer();
                held = false;
                timer = setTimeout(() => {
                    held = true;
                    void configure();
                }, 500);
            });
            for (const type of ['pointerup', 'pointercancel', 'pointerleave']) {
                button.addEventListener(type, cancelTimer);
            }
            button.addEventListener('contextmenu', event => event.preventDefault());
            button.addEventListener('keydown', event => {
                if (event.shiftKey && event.key === 'Enter') {
                    event.preventDefault();
                    if (!event.repeat) void configure();
                }
            });
            button.addEventListener('click', event => {
                if (held && event.detail !== 0 || !editable()) return;
                const library = currentLibrary();
                const name = pickName(library, normalizeFilters(getConfig().filters, library), field.value);
                if (!name) {
                    void context.callGenericPopup('没有符合当前条件的名字。请长按取名按钮调整条件。', context.POPUP_TYPE.TEXT);
                    return;
                }
                field.value = name;
                field.dispatchEvent(new Event('input', { bubbles: true }));
                field.dispatchEvent(new Event('change', { bubbles: true }));
                field.focus({ preventScroll: true });
            });
        }

        const observer = new MutationObserver(records => {
            for (const { addedNodes } of records) {
                for (const node of addedNodes) {
                    if (!(node instanceof Element) || !node.isConnected) continue;
                    if (node.matches(fieldSelector)) mount(node);
                    node.querySelectorAll(fieldSelector).forEach(mount);
                }
            }
        });
        document.querySelectorAll(fieldSelector).forEach(mount);
        observer.observe(document.body, { childList: true, subtree: true });
        return () => {
            active = false;
            clearTimeout(timer);
            observer.disconnect();
            for (const row of document.querySelectorAll('.' + rowClass)) {
                row.replaceWith(...row.querySelectorAll(fieldSelector));
            }
        };
    },
};
