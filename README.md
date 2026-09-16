# Luna · YouTube 英语学习助手

Chrome / Edge 插件，通过本机 Codex CLI 的 **ChatGPT 订阅登录**，使用 `gpt-5.6-luna` 讲解英文字幕中的词和短语。支持 Windows 和 macOS 上的 Chrome / Edge / Chromium，不需要 API key。macOS 安装支持已补齐；当前开发机为 Windows，尚未做 Mac 真机浏览器验证。

## Windows 第一次运行

需要 Node.js 22+、Codex CLI（本版验证使用 0.153.4）、Chrome 或 Edge。

1. 在项目目录打开 PowerShell，运行：

   ```powershell
   powershell -NoProfile -ExecutionPolicy Bypass -File scripts/install.ps1
   codex login
   ```

   通过浏览器使用 **ChatGPT 账户**登录。安装脚本只注册当前 Windows 用户的浏览器本机通信程序，不需要管理员权限。Node 与 Codex 的路径会写入 `.local/runtime.json` 和启动脚本。浏览器会自动启动本地程序，无须手动保持终端运行。

2. 打开 `chrome://extensions` 或 `edge://extensions`，开启“开发者模式”，点击“加载已解压的扩展程序”，选择本项目的 **`extension` 文件夹**。

   扩展 ID 应为 `aeofkpgbodbdljhlibnnhbjkalpjenid`。请保留 `manifest.json` 中的 `key`，否则会导致本机连接失败。

3. 点击浏览器工具栏的 Luna 图标，点击“检测 Codex 连接”。应显示“已通过 ChatGPT 订阅登录”。
4. 打开或刷新一个 YouTube 英文视频，在右下角面板点击“开始学习”。插件会**自动开启 CC，并切换到英文字幕**。

没有 `npm install` 或打包步骤：运行代码只使用 Node 内置模块，`extension` 目录可以直接加载。浏览器插件必须由你在浏览器扩展页加载一次。

## macOS 第一次运行

需要 Node.js 22+、Codex CLI 和 Chrome、Edge 或 Chromium。Safari 不适用这个浏览器插件。Intel 和 Apple Silicon 使用相同的项目安装命令，Node / Codex 本身需安装适合当前 Mac 的版本。

1. 先在 Mac 终端确认工具可用：

   ```sh
   node --version
   codex --version
   ```

   缺少 Node 时，从 [Node.js 官网](https://nodejs.org/)安装 22 或更新版本。缺少 Codex 时，按 [OpenAI 官方 Codex CLI 安装说明](https://learn.chatgpt.com/docs/codex/cli)安装。仅安装或登录 ChatGPT Desktop 不代表插件已经可以调用 CLI，以以上命令和后面的连接检测为准。

2. 将项目克隆到固定目录，注册本地连接，并在这台 Mac 登录：

   ```sh
   mkdir -p ~/code
   cd ~/code
   git clone https://github.com/ccdr4gon/youtube_translate.git
   cd youtube_translate
   npm run install:host
   codex login
   npm run doctor
   ```

   如果已经克隆过项目，在原目录执行 `git pull` 和 `npm run install:host` 即可。登录选择 ChatGPT 账户；不会改用 API key。项目没有依赖安装或构建步骤，无须在项目内运行 `npm install`。

3. 在 Chrome 打开 `chrome://extensions`（Edge 为 `edge://extensions`），开启开发者模式，点击“加载已解压的扩展程序”，选择 `~/code/youtube_translate/extension`。macOS 文件选择窗口可按 Cmd+Shift+G 输入该路径。
4. 点击 Luna 图标 →“检测 Codex 连接”，应显示“已通过 ChatGPT 订阅登录”。再刷新 YouTube 视频，点击“开始学习”。无需保持终端、Codex 或 ChatGPT Desktop 窗口打开。

安装仅登记当前 macOS 用户，不使用 sudo；生成可执行启动脚本，并固定当前 Node 和 Codex 的绝对路径，兼容 Homebrew / nvm 的常见安装位置。浏览器登记文件位于：

- `~/Library/Application Support/Google/Chrome/NativeMessagingHosts/com.local.youtube_luna.json`
- `~/Library/Application Support/Microsoft Edge/NativeMessagingHosts/com.local.youtube_luna.json`
- `~/Library/Application Support/Chromium/NativeMessagingHosts/com.local.youtube_luna.json`

这些路径针对浏览器稳定版和默认用户数据目录。Beta / Dev / Canary 或自定义用户数据目录尚未自动登记。

若找不到 Codex，可以显式指定：

```sh
npm run install:host -- --codex-path "$(command -v codex)"
```

更新 Node / Codex 后如果连接失效，重新执行安装命令；不要删除或移动项目文件夹。换项目目录时，先在原目录卸载本地登记，再在新目录安装。两台电脑各自保存已掌握词、等级、面板位置和分析缓存，目前不会同步；不要把 Windows 的 `.local` 或登录文件复制到 Mac。

卸载 Mac 的本地连接（保留项目和登录信息）：

```sh
npm run install:host -- --uninstall
```

仅想检查生成文件而暂不登记浏览器，可运行 `npm run install:host -- --prepare-only`。

## 如何使用

- 开始学习和学习期间切换视频时，会自动选择英文字幕：优先人工英文字幕，其次是自动生成的英文字幕。默认中文或其他语言会被切换；英文字幕上的自动翻译也会关闭。没有英文字幕时会停止并提示，不会用其他语言字幕调用模型。
- “我的英语水平”默认 B1，只显示估计为 B2、C1、C2 的词和短语。选 A1 会讲解更多；选 C2 时没有更高等级，面板不显示词语。
- 等级是模型对当前语境的估计，并非权威词表。播放时每段最多选 5 个表达；暂停时暂时取消等级和已掌握筛选，优先补充附近三句的词汇，最多 40 个表达，仍不包含人名、语气词和单独的功能词。
- 优先讲解词组、习语、俚语及熟词的特殊含义。卡片解释当前句子的意思；短语中较难的单词会额外标注“本义”，例如 granted 的“被给予的；被承认的”。
- 点击“已掌握”隐藏该词的基本形式；这个选择会在其他视频中继续生效。工具栏弹窗可以清空名单。
- 面板宽度为 280px，拖动标题栏可移动并记住位置；“−”收起，点击“Luna”展开。全屏和窗口尺寸变化时，面板会保持在可见区域。点击卡片时间重听原句。
- 暂停视频时，立即切到附近三句的全等级词汇；已有结果立即显示，缺失讲解优先请求模型并逐条补上。通常是当前句及前后句，视频边缘凑足三句；只有滚动字幕时只能使用已收到的最近句子。恢复播放后恢复原等级、已掌握筛选和播放列表。
- 点击“停止学习”取消正在处理及排队的请求；错误发生后自动停止，手动点击“开始学习”重试。

## 字幕与响应速度

优先复用播放器已经收到的英文字幕，或尝试读取观看页面已有的英文字幕轨，按约 20 秒分段，提前准备未来约 40 秒的解释。模型完成后，卡片按视频播放时间显示，待学习词保留在当前视频的列表中，不会因字幕滚动或模型回复慢而过期。新词追加在下方，面板自动滚动到底部；点击“已掌握”隐藏。刷新页面或切换视频会重置当前列表。

YouTube 可能阻止完整字幕读取。插件会改为读取播放器当前显示的英文字幕，**讲解会落后于原句**。已收集字幕按顺序排队，不再因超过 50 秒被跳过；字幕持续增加比模型处理快时，延迟会累积。面板显示等待秒数和未完成字幕数。也可以手动展开 YouTube 的英文视频文稿，再点击“重新读取字幕”。获取字幕不依赖 YouTube Data API，不上传浏览器 cookies，不抓取其他页面。

自动切换使用 YouTube 播放器的内部方法，并检查实际字幕语言和 CC 开关；这些方法可能随 YouTube 更新而变化。如果自动切换失败，面板会明确提示你手动选择 English 后重试。

本地程序持续运行 `codex app-server`，使用 Luna 的 `none` 推理设置。模型每完成一条词语解释就立即送到卡片，不必等整段生成结束。当前字幕稳定约 0.6 秒后即可排队，发送前附带前文。首次分析需要等待模型回复；暂停会优先分析附近三句，恢复播放会取消未完成的暂停请求并继续播放队列。无标点的自动字幕按停顿或最多约 12 秒组成句组；字幕不足三句时分析现有内容，无法凭空获取尚未出现的字幕。跳转时旧请求会取消，新位置优先；广告期间不分析。

这是普通点播视频优先的试用版。直播只能使用出现后的字幕。YouTube 字幕接口与页面结构可能变化；没有英文字幕时不能分析。不会自动录音或做语音识别。

## 检查与故障排除

```powershell
npm run doctor    # 检查 CLI 版本和订阅登录，不调用模型
npm run smoke     # 真实调用一次 Luna，消耗少量订阅额度
node scripts/benchmark.mjs # 四组真实语境/俚语测试，记录首条与完整回复耗时
npm run check     # 语法、JSON、扩展文件检查
npm test          # 核心行为与本机通信测试，模型回复用测试替身
```

- **本地程序未连接**：运行 `npm run install:host`，确认扩展 ID，然后再次检测。Codex 更新导致可执行文件位置改变时，也重新运行安装脚本。
- **CLI 找不到**：可指定实际可执行文件：`powershell -NoProfile -ExecutionPolicy Bypass -File scripts/install.ps1 -CodexPath 'C:\path\to\codex.exe'`。
- **未登录**：在当前电脑的普通终端运行 `codex login`。受限或隔离的执行环境可能无法读取 Windows 登录凭据；以你正常终端和插件的检测结果为准。
- **当前是 API key 登录**：请通过 `codex login` 切换到 ChatGPT 账户。本项目会拒绝 API key 登录，不自动切换计费方式。
- **额度不足**：等待订阅额度恢复后手动重试。与其他 Codex 使用共享账户额度。
- **更新本项目后**：在浏览器扩展管理页重新加载 Luna，再刷新 YouTube。也可在工具栏 Luna 弹窗点击“重新加载插件”。单独刷新视频可能仍使用 Chrome 缓存的旧内容脚本。
- **长时间等待**：每个模型请求最多等待 90 秒；多个标签页串行处理。建议先只开一个学习视频。
- **没有词语**：确认英文字幕正在出现，尝试 A2 或 A1，或等待播放到已分析的位置。手动更改字幕语言后，点击“重新读取字幕”会重新切回英文。

可选浏览器测试使用 Playwright，不是运行依赖：安装 Playwright，或将 `PLAYWRIGHT_MODULE_PATH` 指向已有 Playwright 目录，执行 `node scripts/browser-test.mjs`。该测试使用真实扩展和模拟视频/回复。`node scripts/browser-test.mjs --native` 则检查真实的扩展→本机程序→订阅登录，不发起模型分析。默认使用 Windows Edge，其他浏览器可通过 `BROWSER_PATH` 指定。

## 数据与代码位置

- `extension/content.js`：字幕收集、播放跟随、开始/停止、跳转处理。
- `extension/page-bridge.js`：在 YouTube 页面读取字幕轨；无法读取时回退。
- `extension/panel.js`、`panel.css`：讲解卡片和分级界面。
- `extension/background.js`：本机通信、请求取消、最近 120 段结果缓存。
- `extension/core.js`：字幕整理、等级筛选、输入与输出核对。
- `native/app-server.mjs`：常驻 Codex 连接、逐条解析讲解、取消与订阅登录检查。
- `native/codex.mjs`：共享教学要求和 CLI 路径查找，保留单次命令调用；固定调用 `gpt-5.6-luna`，通过标准输入传字幕，通过固定格式读取结果。
- `native/host.mjs`：浏览器启动的本地程序；串行安排模型请求。
- `scripts/install.mjs`：统一安装入口，自动选择当前系统。
- `scripts/install-macos.mjs`：生成 macOS 启动脚本并登记 Chrome、Edge、Chromium。
- `scripts/install.ps1`：保留 Windows 当前用户的注册表安装方式。

设置、已掌握名单和分析结果保存在浏览器扩展存储中。分析时，一小段字幕及前文通过 Codex 发送给 OpenAI。模型仍在云端计算。项目不读取或复制 `auth.json`，不在浏览器存储登录凭据；Codex 自行管理订阅登录。模型执行使用只读模式并关闭 shell、浏览器、插件等不需要的能力；字幕只作为待分析数据。

Windows 卸载本地连接：`powershell -NoProfile -ExecutionPolicy Bypass -File scripts/install.ps1 -Uninstall`，然后在浏览器移除扩展。此操作保留项目文件。

## 接入依据

- [Codex 订阅登录](https://learn.chatgpt.com/docs/auth)
- [Codex App Server 与逐条输出](https://learn.chatgpt.com/docs/app-server)
- [Luna 支持的推理设置](https://developers.openai.com/api/docs/models/gpt-5.6-luna)
- [Codex 程序调用与固定格式输出](https://learn.chatgpt.com/docs/non-interactive-mode)
- [Edge 本机通信与 macOS 登记路径](https://learn.microsoft.com/en-us/microsoft-edge/extensions/developer-guide/native-messaging)
- [Chrome 本机通信](https://developer.chrome.com/docs/extensions/develop/concepts/native-messaging)
- [YouTube 官方字幕下载权限限制](https://developers.google.com/youtube/v3/docs/captions/download)
