import { tools } from './tools/index.js';

const settingsKey = 'st-my-tweaks';

function addToolSwitch(panel, tool, enabled, context) {
    let stop;
    const label = document.createElement('label');
    label.className = 'checkbox_label';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    label.append(checkbox, tool.label);
    panel.append(label);

    if (enabled[tool.id] === true) {
        try {
            stop = tool.start(context);
            checkbox.checked = true;
        } catch (error) {
            console.error(`[ST My Tweaks] Failed to start ${tool.id}`, error);
        }
    }

    checkbox.addEventListener('change', () => {
        try {
            if (checkbox.checked) {
                stop = tool.start(context);
            } else {
                stop();
                stop = undefined;
            }
        } catch (error) {
            checkbox.checked = !checkbox.checked;
            console.error(`[ST My Tweaks] Failed to toggle ${tool.id}`, error);
            return;
        }

        enabled[tool.id] = checkbox.checked;
        context.saveSettingsDebounced();
    });
}

function init() {
    const container = document.querySelector('#extensions_settings');
    const panelId = 'st-my-tweaks-settings';
    if (!container || document.getElementById(panelId)) {
        return;
    }

    const context = SillyTavern.getContext();
    const settings = context.extensionSettings[settingsKey] ??= {};
    const enabled = settings.enabled ??= {};

    const panel = document.createElement('details');
    panel.id = panelId;
    panel.className = 'extension_container';

    const heading = document.createElement('summary');
    heading.textContent = 'ST My Tweaks';
    panel.append(heading);

    if (tools.length === 0) {
        const empty = document.createElement('p');
        empty.textContent = '暂无工具';
        panel.append(empty);
    }

    container.append(panel);
    for (const tool of tools) {
        addToolSwitch(panel, tool, enabled, context);
    }
}

init();
