export const quickPromptSelector = '#ai_response_configuration textarea[data-pm-prompt]';
export const promptManagerEditorSelector = 'textarea#completion_prompt_manager_popup_entry_form_prompt';
export const responsePresetSelectors = new Map([
    ['openai', [
        quickPromptSelector,
        promptManagerEditorSelector,
        ...[
            'impersonation_prompt_textarea',
            'wi_format_textarea',
            'scenario_format_textarea',
            'personality_format_textarea',
            'group_nudge_prompt_textarea',
            'newchat_prompt_textarea',
            'newgroupchat_prompt_textarea',
            'newexamplechat_prompt_textarea',
            'continue_nudge_prompt_textarea',
            'send_if_empty_textarea',
            'claude_assistant_prefill',
            'claude_assistant_impersonation',
        ].map(id => `#ai_response_configuration textarea#${id}`),
    ].join(', ')],
    ['novel', '#ai_response_configuration textarea#nai_preamble_textarea'],
    ['textgenerationwebui', '#ai_response_configuration textarea#negative_prompt_textgenerationwebui'],
]);
export const locations = [
    {
        id: 'character',
        label: '角色管理',
        selector: [
            'textarea#description_textarea',
            'textarea#firstmessage_textarea',
            'textarea#personality_textarea',
            'textarea#scenario_pole',
            'textarea#mes_example_textarea',
            'textarea#system_prompt_textarea',
            'textarea#post_history_instructions_textarea',
            'textarea#depth_prompt_prompt',
            '.alternate_greetings_list textarea.alternate_greeting_text',
        ].join(', '),
    },
    {
        id: 'persona',
        label: '用户角色管理',
        selector: 'textarea#persona_description',
    },
    {
        id: 'worldInfo',
        label: '世界书',
        selector: '#world_popup_entries_list .world_entry textarea[name="content"]',
    },
    {
        id: 'aiResponse',
        label: 'AI 响应配置',
        selector: [...responsePresetSelectors.values()].join(', '),
    },
];
export const expandedSelector = 'textarea.maximized_textarea[data-for]';
export const editorSelector = [...locations.map(location => location.selector), expandedSelector].join(', ');
export function isEnabled(location, config) {
    return config[location.id] !== false;
}

export function renderLocations(canvas, config) {
    canvas.classList.add('flex-container', 'flexFlowColumn');
    for (const location of locations) {
        const label = document.createElement('label');
        label.className = 'checkbox_label';
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.checked = isEnabled(location, config);
        checkbox.addEventListener('change', () => { config[location.id] = checkbox.checked; });
        label.append(checkbox, location.label);
        canvas.append(label);
    }
}

export function getToolbar(editor) {
    const existing = editor.previousElementSibling;
    if (existing?.classList.contains('st-my-tweaks-prompt-history')) return existing;
    const toolbar = document.createElement('div');
    toolbar.className = 'st-my-tweaks-prompt-history';
    toolbar.setAttribute('role', 'group');
    toolbar.setAttribute('aria-label', '提示词编辑工具栏');
    toolbar.addEventListener('pointerdown', event => event.preventDefault());

    editor.before(toolbar);
    return toolbar;
}

export function locateEditor(editor) {
    const source = editor.matches(expandedSelector) ? document.getElementById(editor.dataset.for) : editor;
    const location = locations.find(item => source?.matches(item.selector));
    return { source, location };
}

export function editorsChanged(records) {
    return records.some(record => [...record.addedNodes, ...record.removedNodes].some(node =>
        node instanceof Element && (node.matches(editorSelector) || node.querySelector(editorSelector))));
}
