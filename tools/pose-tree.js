import { joints } from './pose.js';

const regions = [
    ['头颈', [0, 1, 14, 15, 16, 17]], ['右臂', [2, 3, 4]], ['左臂', [5, 6, 7]],
    ['右腿', [8, 9, 10]], ['左腿', [11, 12, 13]],
];

// Keep expansion and keyboard focus independent of the selected editing target.
export function poseTree(tree, choose) {
    const expanded = new Set(['people', 'P1']);
    let rows = [], focused = 'P1', people, selected, marked;
    function render(persons, selection, reveal = false, group = marked) {
        people = persons;
        selected = selection;
        marked = group;
        const focusInside = tree.contains(document.activeElement);
        if (reveal) {
            focused = selection;
            const [id, part] = selection.split('/');
            if (persons.some(p => p.id === id)) {
                expanded.add('people');
                expanded.add(id);
                if (part !== undefined) {
                    const region = regions.find(([, indices]) => indices.includes(Number(part)));
                    if (region) expanded.add(id + '/' + region[0]);
                }
            }
        }
        rows = [];
        function row(key, title, depth, parent, icon, branch = false, color) {
            rows.push({ key, title, depth, parent, icon, branch, color });
            return expanded.has(key);
        }
        if (row('people', '人物管理', 1, '', 'fa-users', true)) {
            for (const p of persons) {
                if (!row(p.id, p.id + ' · ' + p.name, 2, 'people', 'fa-circle', true, p.color)) continue;
                for (const [label, indices] of regions) {
                    const group = p.id + '/' + label;
                    if (!row(group, label, 3, p.id, 'fa-code-branch', true)) continue;
                    for (const i of indices) row(p.id + '/' + i, joints[i][1], 4, group, 'fa-circle-dot');
                }
            }
        }
        row('note', '场景注释', 1, '', 'fa-pen');
        row('mode', '发送档位', 1, '', 'fa-paperclip');
        if (!rows.some(r => r.key === focused)) focused = rows[0].key;
        tree.replaceChildren(...rows.map(r => {
            const button = document.createElement('button');
            button.type = 'button';
            button.dataset.node = r.key;
            button.setAttribute('role', 'treeitem');
            button.setAttribute('aria-level', r.depth);
            button.setAttribute('aria-selected', String(marked ? marked.has(r.key) : r.key === selected));
            button.tabIndex = r.key === focused ? 0 : -1;
            button.style.setProperty('--depth', r.depth - 1);
            const caret = document.createElement('span');
            caret.className = 'stmt-pose-caret';
            caret.setAttribute('aria-hidden', 'true');
            if (r.branch) {
                button.setAttribute('aria-expanded', String(expanded.has(r.key)));
                caret.textContent = expanded.has(r.key) ? '▾' : '▸';
            }
            const icon = document.createElement('i');
            icon.className = 'fa-solid ' + r.icon;
            icon.setAttribute('aria-hidden', 'true');
            if (r.color) icon.style.color = r.color;
            button.append(caret, icon, r.title);
            return button;
        }));
        if (focusInside) tree.querySelector('[tabindex="0"]')?.focus({ preventScroll: true });
    }
    function toggle(key) {
        if (!expanded.delete(key)) expanded.add(key);
        render(people, selected);
    }
    tree.onclick = event => {
        const button = event.target.closest('[data-node]');
        if (!button) return;
        focused = button.dataset.node;
        const item = rows.find(r => r.key === focused);
        if (item.branch && (event.target.closest('.stmt-pose-caret') || item.depth === 3)) return toggle(item.key);
        if (item.branch) expanded.add(item.key);
        choose(item.key);
    };
    tree.onkeydown = event => {
        const index = rows.findIndex(r => r.key === event.target.dataset.node);
        if (index < 0) return;
        const item = rows[index];
        let target;
        switch (event.key) {
            case 'ArrowDown': target = rows[index + 1]; break;
            case 'ArrowUp': target = rows[index - 1]; break;
            case 'Home': target = rows[0]; break;
            case 'End': target = rows.at(-1); break;
            case 'ArrowLeft':
                if (item.branch && expanded.has(item.key)) toggle(item.key);
                else target = rows.find(r => r.key === item.parent);
                break;
            case 'ArrowRight':
                if (item.branch && !expanded.has(item.key)) toggle(item.key);
                else if (item.branch) target = rows[index + 1];
                break;
            default: return;
        }
        event.preventDefault();
        if (target) {
            focused = target.key;
            render(people, selected);
            tree.querySelector('[tabindex="0"]').scrollIntoView({ block: 'nearest' });
        }
    };
    return render;
}
