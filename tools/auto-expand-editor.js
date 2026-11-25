import { isEnabled, renderLocations } from './prompt-toolbar.js';

const fields = [
    { id: 'description_textarea', label: '角色描述' },
    { id: 'firstmessage_textarea', label: '主要开场白' },
    { id: 'persona_description', label: '用户设定描述' },
    { id: 'curEditTextarea', label: '消息正文' },
];

function expandEditor(id) {
    const button = document.querySelector(`.editor_maximize[data-for="${id}"]`);
    if (button) {
        button.click();
    } else if (id === 'curEditTextarea') {
        // The message editor has no expand button. Use SillyTavern's delegated click handler.
        const trigger = document.createElement('button');
        trigger.type = 'button';
        trigger.hidden = true;
        trigger.className = 'editor_maximize';
        trigger.dataset.for = id;
        document.body.append(trigger);
        try {
            trigger.click();
        } finally {
            trigger.remove();
        }
    }
}

export const autoExpandEditor = {
    id: 'auto-expand-editor',
    label: '单击全屏编辑',
    renderSettings(canvas, draft) {
        renderLocations(canvas, draft, fields);
    },
    start(context, getConfig) {
        function handleClick({ target }) {
            if (!(target instanceof HTMLTextAreaElement) || target.readOnly || target.disabled) return;
            const field = fields.find(field => field.id === target.id);
            if (field && isEnabled(field, getConfig())) {
                expandEditor(field.id);
            }
        }

        document.addEventListener('click', handleClick);
        return () => document.removeEventListener('click', handleClick);
    },
};
