# ST My Tweaks

ST My Tweaks 是一个 SillyTavern 实用工具包。每个工具都有独立开关，开关状态随 SillyTavern 用户设置保存。

## 本地安装

将扩展目录软链接到 SillyTavern 的 `public/scripts/extensions/third-party/st-my-tweaks`。在扩展仓库根目录运行 PowerShell，把示例中的 SillyTavern 路径换成实际路径。

```powershell
$stRoot = 'C:\path\to\SillyTavern'
$extension = (Get-Location).Path
$link = Join-Path $stRoot 'public\scripts\extensions\third-party\st-my-tweaks'
New-Item -ItemType SymbolicLink -Path $link -Target $extension
```

Windows 创建符号链接需要启用开发者模式或使用有相应权限的 PowerShell。对于本机目录，也可将命令中的 `SymbolicLink` 换成 `Junction` 来创建目录联接。

安装后刷新 SillyTavern，在「扩展」面板中展开 **ST My Tweaks**。源码由浏览器直接加载，无需安装依赖或运行构建。

## 编辑快捷输入

在 **ST My Tweaks** 中开启「编辑快捷输入」。聚焦聊天输入框时，快捷栏出现在输入框上方，移开焦点后隐藏。点击其他编辑框旁的全屏图标时，快捷栏出现在编辑框与「确定」按钮之间。两处均提供 `{{char}}`、`{{user}}` 和 `“”` 三个按钮。

- 宏按钮在光标处插入对应的宏，有选区时替换选中的文字。
- 引号按钮在光标处插入一对引号，光标留在中间。有选区时包裹整段文字，选区正好带有一对引号或正好选中引号内的全文时去掉这一对。只选中引号内的一部分时，使用另一种引号包裹。

点击工具旁的「设置」可选择左对齐、居中或右对齐，并将按钮缩放设为 75%–150%。默认居中、100%。点击「保存」后设置立即生效，并随 SillyTavern 用户设置保存。

## 新增工具

在 `tools/` 下创建工具模块，并在 `tools/index.js` 的 `tools` 数组中注册。每个工具提供三个必填字段。

- `id` 是稳定的标识，用于保存开关状态。
- `label` 是扩展面板显示的名称。
- `start(context, getConfig)` 在启用时同步执行。`context` 是 `SillyTavern.getContext()` 返回的对象，`getConfig()` 返回该工具当前已保存的配置。`start` 返回清理函数，关闭时移除工具创建的界面、监听器和定时器等资源。工具没有资源需要释放时，返回空函数即可。

需要配置界面的工具可以提供 `renderSettings(canvas, draft)`。扩展负责弹窗、保存和取消，工具将自己的控件添加到 `canvas`，将用户的修改写入可序列化的 `draft`。工具也可以提供 `onSettingsChanged(config)`，在已启用且用户保存时更新现有界面。没有保存过的配置会以空对象传给工具，由工具提供默认值。

工具默认关闭。用户开启后会立即启动，刷新页面时会根据保存的设置重新启动。
