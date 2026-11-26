STOA 6.0.0 · Slim Portable Edition
================================

这是经过体积优化的 STOA 本地网页版，保留当前全部功能、完整字体与四份官方样本。

6.0.0：古希腊语默认字体改为内置 Noto Serif STOA（旧项目中的 Vusillus 会自动回退，亦可自行导入本地字体）；关闭或刷新页面前新增未保存更改提醒；修复 LaTeX 导出中的字符与配置转义；便携版内置本地服务器限制仅响应 127.0.0.1 / localhost 并禁用目录列表；项目以 GPL-3.0-or-later 开源发布。

5.9.7：四个语言页面采用 2026-09-08 提供的新示例，Translation 默认开启，可直接查看预览译文，也可手动关闭。OMNI 提示词仅对西班牙语、法语、德语、意大利语、葡萄牙语加强紧凑 Morphology 缩写要求。More · Token Editor 位于左侧 02 · TOKEN EDITOR 标题旁。Latin 示例采用设备本地 Times New Roman；导出前需按下文说明加载对应字体。

2026-09-07 修正版：修复 New blank document 和空白 Project 导入；新建会清空内容与页眉页脚（保留该页面默认 Header Right），OMNI 同时清除示例语言识别信息。空白页可以继续新增 token，或导入新的 AI 分析。空白状态不提供 PDF/PNG 导出。

启动方式
--------

macOS：双击“Start-STOA-macOS.command”。
Windows：双击“Start-STOA-Windows.bat”。

启动脚本会运行随包附带的轻量本地服务器，并自动打开一个新的 STOA 页面。通常地址为：

http://127.0.0.1:8765/

使用期间请保持启动窗口打开，结束时关闭窗口即可。启动脚本需要 Python 3。若 8765 端口已被占用，服务器会自动选择其他可用端口；此时请使用启动器自动打开的新页面，不要继续使用旧标签页、书签或手动输入的 8765 地址。

重要：此瘦身版的完整字体使用无损压缩资源，启动服务器会透明解压，预览、PDF、PNG 和 LaTeX 仍使用原始字体数据。必须通过上述启动脚本运行；不要直接双击 index.html。

如果 PDF 或 PNG 导出提示无法读取本地资源，请检查浏览器地址：正确地址应以 http://127.0.0.1 开头，而不能以 file:// 开头。请关闭错误页面，重新双击对应系统的 STOA 启动脚本，并在导出完成前保持启动窗口打开。

数据说明
--------

5.9.4 字体提示：Pinyin/Romanization 已使用完整 Liberation Sans 字库。Times New Roman 为设备本地字体，首次使用矢量 PDF 导出前，请在 Typography 中点击“Load Times New Roman from this device”；不支持读取本机字体的浏览器，请使用“Import font”导入自己的 Regular、Bold、Italic、Bold Italic 字体文件。程序不会再把 Times New Roman 静默替换为其他字体。用户字体不会随项目文件传输，换电脑后需要重新导入。

每次通过 macOS 或 Windows 启动脚本重新打开 STOA，程序都会以开发者定义的默认设置和官方示例开始。在当次页面使用期间，切换语言不会清除当前编辑；刷新页面或重新运行启动脚本则视为一次新的打开。刷新、退出或重新启动前，请使用 Export Project 保存需要继续的工作；下次可通过 Import Project 恢复。“Restore Sample”会随时恢复一份全新的官方样本副本。

跨电脑传输文档与排版时，请使用 STOA 的 Export Project 和 Import Project。仅复制程序文件夹不会迁移文档。已导入的用户字体、MDX/MDD 词典不属于文档工作状态，新启动不会自动删除它们。

LSJ、OLD 等词典不再随程序附带。可在 Ancient Greek、Latin 或 Classical Chinese 页面导入自己的 MDX/MDD 词典。导入的词典仅保存在当前设备的当前浏览器中，不会被 Export Project 带走，也不会自动迁移到另一台电脑。

official-samples 文件夹保存 Ancient Greek、Latin、Classical Chinese 和 OMNI 四份官方样本的可见核验副本；程序内部的不可变样本已经编译进 index.html。
