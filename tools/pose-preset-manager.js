import { presets, encodePresets, mergePresets } from './pose-presets.js';

export function renderPresetManager(container, draft) {
    const section = document.createElement('section');
    section.className = 'stmt-preset-manager';
    section.innerHTML = '<h4>姿态预设管理</h4><label><input type="checkbox" data-all> 全选</label>'
        + '<div class="stmt-preset-list"></div><div class="stmt-preset-buttons">'
        + '<button type="button" data-delete>删除所选</button><button type="button" data-export>导出所选</button>'
        + '<button type="button" data-import>导入 JSON</button></div><input type="file" accept=".json,application/json" multiple hidden>'
        + '<small role="status"></small>';
    container.append(section);
    const q = s => section.querySelector(s);
    const selected = new Set();
    const list = q('.stmt-preset-list'), all = q('[data-all]'), file = q('[type=file]'), status = q('[role=status]');
    let importing = false;
    function buttons() {
        const count = presets(draft).length;
        all.checked = count > 0 && selected.size === count;
        all.indeterminate = selected.size > 0 && !all.checked;
        all.disabled = !count || importing;
        q('[data-delete]').disabled = q('[data-export]').disabled = !selected.size || importing;
        q('[data-import]').disabled = importing;
    }
    function render() {
        list.replaceChildren(...presets(draft).map(({ name }) => {
            const row = document.createElement('label');
            const check = document.createElement('input');
            check.type = 'checkbox';
            check.checked = selected.has(name);
            check.onchange = () => {
                if (check.checked) selected.add(name);
                else selected.delete(name);
                buttons();
            };
            row.append(check, name);
            return row;
        }));
        buttons();
    }
    all.onchange = () => {
        selected.clear();
        if (all.checked) for (const item of presets(draft)) selected.add(item.name);
        render();
    };
    q('[data-delete]').onclick = () => {
        draft.posePresets = presets(draft).filter(p => !selected.has(p.name));
        status.textContent = '已移除 ' + selected.size + ' 项，保存设置后生效。';
        selected.clear();
        render();
    };
    q('[data-export]').onclick = () => {
        const items = presets(draft).filter(p => selected.has(p.name));
        const url = URL.createObjectURL(new Blob([encodePresets(items)], { type: 'application/json' }));
        const link = document.createElement('a');
        link.href = url;
        link.download = 'pose-presets.json';
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 30000);
    };
    q('[data-import]').onclick = () => file.click();
    file.onchange = async () => {
        const files = Array.from(file.files);
        if (!files.length) return;
        importing = true;
        buttons();
        try {
            const before = presets(draft);
            let items = before;
            for (const input of files) items = mergePresets(items, await input.text());
            draft.posePresets = items;
            status.textContent = '新增 ' + (items.length - before.length) + ' 项，保存设置后生效。';
        } catch (error) {
            status.textContent = error instanceof SyntaxError ? 'JSON 格式无效，本次导入已取消。' : error.message;
        } finally {
            importing = false;
            file.value = '';
            render();
        }
    };
    render();
    return () => !importing;
}
