const previousDefault = `姓氏 | 沈 江 林 顾 苏 陆 云 叶 白 程 温 唐 慕容 上官
男 | 古风 | 云岫 景行 怀瑾 望舒 归舟 长卿
女 | 古风 | 清蘅 疏桐 照雪 知微 令仪 映棠
男 | 网文风 | 星野 临渊 凌霄 烬川 逐辰 行舟
女 | 网文风 | 星澜 云栖 见月 绯宁 今夏 追萤
男 | 现代 | 亦航 书远 明朗 言川 奕安 时予
女 | 现代 | 以晴 一禾 可欣 予宁 安歌 思乔`;

const originalFullLibrary = `男 | 古风 | 沈·云岫 江·景行 林·怀瑾 顾·望舒 苏·归舟 陆·长卿 云·砚之 叶·修竹 白·鹤眠 程·清晏
男 | 古风 | 温·子衡 唐·闻笙 慕容·照川 上官·明庭 陈·观澜 李·思齐 许·慎言 周·承璧 吴·庭筠 徐·砚秋
男 | 古风 | 何·疏桐 谢·问津 宋·知礼 萧·彦清 裴·玄度 秦·书白 韩·听松 柳·南山 杜·风举 贺·行简
男 | 古风 | 江·云深 沈·怀玉 林·鸣珂 陆·若谷 苏·行止 程·舒怀 叶·崇文 白·思邈 温·允中 唐·敬之
男 | 古风 | 李·延章 陈·怀远 许·临溪 周·清越 顾·秉烛 徐·既明 上官·鸣皋 谢·知常 宋·青崖 裴·渡江
女 | 古风 | 沈·清蘅 江·疏影 林·照雪 顾·知微 苏·令仪 陆·映棠 云·采薇 叶·月皎 白·素衣 程·玉笙
女 | 古风 | 温·含章 唐·晚照 上官·静姝 慕容·佩兰 秦·听雨 柳·青萝 李·怀珠 陈·绣屏 周·盈袖 许·折枝
女 | 古风 | 谢·花朝 萧·云绮 吴·清霜 徐·玉衡 何·明珰 杜·芳洲 韩·弦歌 宋·含烟 贺·秋澜 裴·湘灵
女 | 古风 | 苏·幽篁 江·月满 林·栖梧 沈·素秋 白·芷兰 顾·雪汀 温·琼枝 陆·迎霜 程·南絮 唐·疏梅
女 | 古风 | 李·清漪 陈·念慈 许·若蘅 周·兰因 徐·令月 叶·溪亭 慕容·照水 上官·朝露 柳·映葭 宋·松筠
男 | 网文风 | 叶·星野 陆·临渊 顾·凌霄 沈·烬川 江·逐辰 林·行舟 苏·惊鸿 楚·无咎 萧·北溟 秦·破晓
男 | 网文风 | 王·曜石 张·知锋 周·星渡 徐·玄序 陈·天衡 许·夜航 李·苍梧 唐·照临 韩·凌岳 谢·长曜
男 | 网文风 | 方·烁风 程·藏锋 白·霆川 温·云驰 贺·燃星 宋·烬明 裴·朔野 杜·越岭 易·沉璧 蓝·风眠
男 | 网文风 | 江·扶光 沈·昼白 林·寂舟 陆·鸣沙 顾·见山 叶·斩秋 苏·问穹 萧·星弈 秦·北望 楚·惊弦
男 | 网文风 | 李·夜阑 陈·沧海 周·岚起 徐·千屿 许·凛冬 唐·应龙 欧阳·乘风 司徒·烛照 韩·聆霆 白·孤城
女 | 网文风 | 叶·星澜 陆·云栖 顾·见月 沈·绯宁 江·今夏 林·追萤 苏·弦月 楚·听澜 萧·浮灯 秦·夜璃
女 | 网文风 | 王·青羽 张·银湾 周·熹微 徐·遥光 陈·星瓷 许·流萤 李·时雨 唐·千寻 韩·知眠 谢·雀翎
女 | 网文风 | 方·明绯 程·朝歌 白·霜序 温·予光 贺·焰心 宋·北辰 裴·鸢尾 杜·澄空 易·逐月 蓝·七弦
女 | 网文风 | 江·晚星 沈·昭影 林·栖迟 陆·晴岚 顾·聆雪 叶·砚歌 苏·梦汐 萧·初烬 秦·雾里 楚·夕曜
女 | 网文风 | 李·南枝 陈·晓雾 周·乌衣 徐·荒雪 许·铃音 唐·镜羽 欧阳·灯宵 司徒·问晴 韩·雪燃 白·流晖
男 | 现代 | 李·亦航 王·书远 张·明朗 刘·言川 陈·奕安 杨·时予 赵·浩然 黄·景程 周·嘉树 吴·泽宇
男 | 现代 | 徐·乐天 孙·思源 胡·子昂 朱·诚毅 高·俊逸 梁·柏言 郑·一鸣 罗·维嘉 宋·启帆 谢·博文
男 | 现代 | 韩·承泽 唐·凯文 何·子谦 林·宇恒 钟·明哲 冯·云松 彭·致远 于·知行 董·嘉诚 袁·志新
男 | 现代 | 李·奕帆 王·家明 张·文彦 刘·亦晨 陈·思成 杨·向阳 赵·浩宇 黄·书扬 周·铭轩 吴·立恒
男 | 现代 | 徐·嘉良 孙·天佑 胡·凯宁 朱·泽楷 高·雨泽 梁·子健 郑·维安 罗·安和 宋·哲远 谢·言嘉
女 | 现代 | 李·以晴 王·一禾 张·可欣 刘·予宁 陈·安歌 杨·思乔 赵·嘉怡 黄·悦然 周·佳音 吴·雨桐
女 | 现代 | 徐·舒宁 孙·芷涵 胡·欣妍 朱·晓晨 高·诗雅 梁·明慧 郑·心悦 罗·念初 宋·若琳 谢·安琪
女 | 现代 | 韩·思妍 唐·佳宜 何·乐言 林·映彤 钟·语欣 冯·依晨 彭·心妤 于·佳禾 董·梦舒 袁·晓蕾
女 | 现代 | 李·知夏 王·心然 张·曼宁 刘·雨欣 陈·以安 杨·可心 赵·书颖 黄·欣冉 周·悦嘉 吴·思萌
女 | 现代 | 徐·安雅 孙·语桐 胡·婉晴 朱·昕怡 高·若溪 梁·舒颜 郑·佳蔚 罗·艺宁 宋·言欢 谢·希悦`;

export function librarySource(config) {
    const saved = config.library;
    const normalized = saved?.trim().replaceAll('\r\n', '\n');
    return !saved || normalized === previousDefault || normalized === originalFullLibrary ? defaultLibrary : saved;
}

export const defaultLibrary = originalFullLibrary + `
男 | 古风 | 沈·珩
女 | 古风 | 江·蘅
男 | 网文风 | 陆·朔
女 | 网文风 | 叶·翎
男 | 现代 | 周·朗
女 | 现代 | 林·悦`;

const splitNames = value => value.split(/[\s,，、]+/u).filter(Boolean);

export function parseLibrary(source) {
    const surnames = new Set();
    const surnameSamples = [];
    const groups = [];
    for (const [index, line] of source.split(/\r?\n/).entries()) {
        if (!line.trim()) continue;
        const [first, second, third, ...extra] = line.split('|').map(part => part.trim());
        if (first === '姓氏' && second && third === undefined && splitNames(second).length) {
            splitNames(second).forEach(name => surnames.add(name));
        } else if (['男', '女'].includes(first) && second && third && !extra.length && splitNames(third).length) {
            const names = splitNames(third).map(entry => {
                if (!entry.includes('·')) return entry;
                const [surname, name, ...rest] = entry.split('·');
                if (!surname || !name || rest.length) throw new Error(`第 ${index + 1} 行的「${entry}」应写成「姓·名」。`);
                surnameSamples.push(surname);
                return name;
            });
            groups.push({ gender: first, style: second, names });
        } else {
            throw new Error(`第 ${index + 1} 行格式有误，请参照上方示例。`);
        }
    }
    const samples = [...surnameSamples, ...surnames];
    if (!samples.length || !groups.length) throw new Error('名字库至少需要一个姓氏和一组名字。');
    const lengths = new Map();
    const segmenter = new Intl.Segmenter('zh', { granularity: 'grapheme' });
    function wordLengths(words) {
        const sizes = new Set();
        for (const word of words) {
            if (!lengths.has(word)) lengths.set(word, [...segmenter.segment(word)].length);
            sizes.add(lengths.get(word));
        }
        return [...sizes];
    }
    const surnameSizes = wordLengths(samples);
    const givenSizes = wordLengths(groups.flatMap(group => group.names));
    const fullLengths = [...new Set(surnameSizes.flatMap(size => givenSizes.map(n => size + n)))].sort((a, b) => a - b);
    return { surnames: [...new Set(samples)], surnameSamples: samples, groups, lengths, fullLengths };
}

export function filterOptions(library) {
    return {
        gender: [...new Set(library.groups.map(group => group.gender))],
        style: [...new Set(library.groups.map(group => group.style))],
        length: library.fullLengths,
        surname: library.surnames,
    };
}

export function normalizeFilters(filters, library) {
    return Object.fromEntries(Object.entries(filterOptions(library)).map(([key, options]) =>
        [key, options.filter(value => filters?.[key]?.includes(value))]));
}

export function pickName(library, filters, previous) {
    const matches = (key, value) => !filters[key].length || filters[key].includes(value);
    const names = [...new Set(library.groups
        .filter(group => matches('gender', group.gender) && matches('style', group.style))
        .flatMap(group => group.names))];
    const choices = new Map();
    function namesFor(surname) {
        const size = library.lengths.get(surname);
        if (!choices.has(size)) {
            choices.set(size, names.filter(name => matches('length', size + library.lengths.get(name))));
        }
        return choices.get(size);
    }
    const surnames = library.surnameSamples.filter(value => matches('surname', value) && namesFor(value).length);
    if (!surnames.length) return '';
    const pick = values => values[Math.floor(Math.random() * values.length)];
    const surname = pick(surnames);
    const eligible = namesFor(surname);
    const name = pick(eligible);
    if (surname + name !== previous) return surname + name;
    if (eligible.length > 1) return surname + pick(eligible.filter(candidate => candidate !== name));
    const alternatives = surnames.filter(candidate => candidate !== surname);
    if (alternatives.length) {
        const next = pick(alternatives);
        return next + pick(namesFor(next));
    }
    return previous;
}

export function renderLibrarySettings(canvas, draft) {
    const label = document.createElement('label');
    label.textContent = '名字库';
    const help = document.createElement('p');
    help.textContent = '每行一组，例如「女 | 古风 | 江·清蘅 上官·知微」。姓名之间用空格隔开，姓和名之间用「·」。取名时按姓氏在全库出现的次数抽姓，再从符合条件的名字中抽名。';
    const editor = document.createElement('textarea');
    editor.className = 'text_pole';
    editor.rows = 10;
    editor.spellcheck = false;
    editor.value = librarySource(draft);
    label.append(editor);

    const status = document.createElement('p');
    status.setAttribute('role', 'status');
    const file = document.createElement('input');
    file.type = 'file';
    file.accept = '.txt,text/plain';
    file.hidden = true;
    const actions = document.createElement('div');
    actions.className = 'st-my-tweaks-name-actions';
    function action(text, run) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'menu_button';
        button.textContent = text;
        button.addEventListener('click', run);
        actions.append(button);
    }
    let importing = false;
    file.addEventListener('change', async () => {
        const selected = file.files[0];
        if (!selected) return;
        importing = true;
        try {
            const source = await selected.text();
            parseLibrary(source);
            editor.value = source;
            status.textContent = '已导入，保存后生效。';
        } catch (error) {
            status.textContent = '导入失败：' + error.message;
        } finally {
            file.value = '';
            importing = false;
        }
    });
    function validate() {
        if (importing) {
            status.textContent = '正在读取名字库。';
            return false;
        }
        try {
            const library = parseLibrary(editor.value);
            draft.library = editor.value;
            draft.filters = normalizeFilters(draft.filters, library);
            return true;
        } catch (error) {
            status.textContent = error.message;
            editor.focus();
            return false;
        }
    }
    action('导入 TXT', () => file.click());
    action('导出 TXT', () => {
        if (!validate()) return;
        const url = URL.createObjectURL(new Blob([editor.value], { type: 'text/plain;charset=utf-8' }));
        const link = document.createElement('a');
        link.href = url;
        link.download = '角色名字库.txt';
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        status.textContent = '已导出当前名字库。';
    });
    canvas.append(help, label, actions, file, status);
    return validate;
}
