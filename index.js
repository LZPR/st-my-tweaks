import { tools } from './tools/index.js';
import { initPoseContext } from './tools/pose-context.js';

const settingsKey = 'st-my-tweaks';

function addToolRow(panel, tool, settings, context) {
    let stop;
    const getConfig = () => settings.config[tool.id] ?? {};
    const updateConfig = changes => {
        settings.config[tool.id] = { ...getConfig(), ...changes };
        context.saveSettingsDebounced();
    };
    const row = document.createElement('div');
    row.className = 'flex-container alignitemscenter';
    row.style.justifyContent = 'space-between';
    const label = document.createElement('label');
    label.className = 'checkbox_label';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    label.append(checkbox, tool.label);
    row.append(label);

    if (settings.enabled[tool.id] === true) {
        try {
            stop = tool.start(context, getConfig, updateConfig);
            checkbox.checked = true;
        } catch (error) {
            console.error(`[ST My Tweaks] Failed to start ${tool.id}`, error);
        }
    }

    checkbox.addEventListener('change', async () => {
        checkbox.disabled = true;
        try {
            if (checkbox.checked) {
                stop = tool.start(context, getConfig, updateConfig);
            } else {
                await stop();
                stop = undefined;
            }
        } catch (error) {
            checkbox.checked = !checkbox.checked;
            console.error(`[ST My Tweaks] Failed to toggle ${tool.id}`, error);
            toastr.error(error.message);
            return;
        } finally {
            checkbox.disabled = false;
        }

        settings.enabled[tool.id] = checkbox.checked;
        context.saveSettingsDebounced();
    });

    if (tool.renderSettings) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'menu_button menu_button_icon';
        button.title = `配置${tool.label}`;
        button.setAttribute('aria-haspopup', 'dialog');

        const icon = document.createElement('i');
        icon.className = 'fa-solid fa-gear';
        icon.setAttribute('aria-hidden', 'true');
        button.append(icon, '设置');

        button.addEventListener('click', async () => {
            button.disabled = true;
            try {
                const draft = structuredClone(getConfig());
                const content = document.createElement('div');
                const heading = document.createElement('h3');
                heading.textContent = tool.label;
                const canvas = document.createElement('div');
                content.append(heading, canvas);
                const validate = tool.renderSettings(canvas, draft);

                const result = await context.callGenericPopup(content, context.POPUP_TYPE.CONFIRM, '', {
                    okButton: '保存',
                    cancelButton: '取消',
                    leftAlign: true,
                    allowVerticalScrolling: true,
                    onClosing: popup => popup.result !== context.POPUP_RESULT.AFFIRMATIVE || !validate || validate(),
                });
                if (result === context.POPUP_RESULT.AFFIRMATIVE) {
                    settings.config[tool.id] = draft;
                    context.saveSettingsDebounced();
                    if (stop) {
                        tool.onSettingsChanged?.(draft);
                    }
                }
            } catch (error) {
                console.error(`[ST My Tweaks] Failed to configure ${tool.id}`, error);
            } finally {
                button.disabled = false;
                button.focus({ preventScroll: true });
            }
        });
        row.append(button);
    }

    panel.append(row);
}

function init() {
    const container = document.querySelector('#extensions_settings');
    const panelId = 'st-my-tweaks-settings';
    if (!container || document.getElementById(panelId)) {
        return;
    }

    const context = SillyTavern.getContext();
    initPoseContext(context);
    const settings = context.extensionSettings[settingsKey] ??= {};
    settings.enabled ??= {};
    settings.config ??= {};

    const panel = document.createElement('div');
    panel.id = panelId;
    panel.className = 'inline-drawer';

    const header = document.createElement('div');
    header.className = 'inline-drawer-toggle inline-drawer-header';
    header.tabIndex = 0;
    header.setAttribute('role', 'button');
    header.setAttribute('aria-expanded', 'false');
    header.setAttribute('aria-controls', `${panelId}-content`);
    header.addEventListener('click', () => {
        header.setAttribute('aria-expanded', String(header.getAttribute('aria-expanded') === 'false'));
    });
    header.addEventListener('keydown', event => {
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            header.click();
        }
    });
    const heading = document.createElement('strong');
    heading.textContent = 'ST My Tweaks';
    const icon = document.createElement('div');
    icon.className = 'inline-drawer-icon fa-solid fa-circle-chevron-down down';
    icon.setAttribute('aria-hidden', 'true');
    header.append(heading, icon);

    const content = document.createElement('div');
    content.className = 'inline-drawer-content';
    content.id = `${panelId}-content`;
    panel.append(header, content);

    if (tools.length === 0) {
        const empty = document.createElement('p');
        empty.textContent = '暂无工具';
        content.append(empty);
    }

    container.append(panel);
    for (const tool of tools) {
        addToolRow(content, tool, settings, context);
    }
}

init();
