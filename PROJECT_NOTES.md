# Bohan's Avatar — 项目固化笔记 (PROJECT NOTES)

> **目的**：未来 Claude 会话被压缩 / 重启后，第一时间读这份文件就能恢复全部上下文，不用再从聊天记录里反复挖。
> **更新原则**：每修一次大 bug、加一次重要功能、改一次架构，请把"根因 + 修法 + 文件位置 + commit 哈希"补进相应章节。

---

## 1. 项目一句话

一个单文件 (`index.html`) 的 3D 虚拟形象语音聊天 Web App。用户点麦克风说话 → Whisper 转文字 → OpenAI/DeepSeek 生成回复 → Fish Audio 流式 TTS 朗读 → 3D 形象同步张嘴。

## 2. 部署 / 访问

| 项目 | 值 |
|---|---|
| 自定义域名 | `bohan.partykeys.org` |
| Vercel 域名 | `bohan-tau.vercel.app` |
| GitHub 仓库 | `https://github.com/partybohan/Bohan1.0` |
| 默认分支 | `main` |
| 域名解析 | Namecheap CNAME → Vercel |
| 管理员入口 | URL 加 `?admin=1` 才显示 Settings 面板 |

部署流程：本地改 → `git add -A && git commit -m "..." && git push origin main` → Vercel 自动构建 → 几十秒后线上生效。

> ⚠️ **沙箱推不动 GitHub**：Claude 的沙箱代理对 github.com:443 的 CONNECT 请求会返回 403。**所有 git push 必须由用户在自己 Mac 终端里执行**：
> ```bash
> cd ~/Documents/my-avatar-app && git push origin main
> ```

## 3. 文件清单

```
my-avatar-app/
├── index.html               # 主前端（~3000 行，所有 UI / 三维 / 状态机都在这里）
├── api/
│   ├── chat.js              # Edge Function：代理 OpenAI/DeepSeek 聊天（流式）
│   ├── transcribe.js        # Serverless Function：代理 Whisper STT（base64）
│   ├── tts.js               # Edge Function：代理 Fish Audio TTS（流式）
│   └── test.js              # 诊断端点
├── avatar.glb               # 高清形象 41.5 MB（首选）
├── avatar_compressed.glb    # 压缩形象 19.3 MB（fallback / 弱网）
├── manifest.json            # PWA manifest
├── sw.js                    # Service Worker（极简，主要做缓存）
├── server.py                # 本地起 HTTP 服务用（开发用）
├── vercel.json              # Vercel 路由 + 缓存策略（API no-store，静态 1h）
├── 启动.command / 启动Avatar.command  # 本地双击启动脚本
└── PROJECT_NOTES.md         # ← 你正在看的这份
```

## 4. 技术栈

- **前端**：原生 HTML/CSS/JS 单文件，无打包，无框架
- **3D**：Three.js r128 + GLTFLoader + OrbitControls（CDN 引入）
- **后端**：Vercel Serverless / Edge Functions（Node 18+）
- **聊天 LLM**：OpenAI（默认）或 DeepSeek（中国大陆备用）
- **STT**：OpenAI Whisper（首选）/ 浏览器 `webkitSpeechRecognition`（fallback）
- **TTS**：Fish Audio 流式接口（句子级分块 + 并行打字机）

## 5. 环境变量（Vercel 控制台）

| Key | 用途 |
|---|---|
| `OPENAI_API_KEY` | Chat + Whisper |
| `DEEPSEEK_API_KEY` | Chat（备用） |
| `FISH_API_KEY` | TTS |

## 6. 核心状态机（必懂）

```
'idle' → 'listening' → 'thinking' → 'speaking' → 'idle'
```

UI 状态切换在 `setState(s)` 函数里，`voiceHint` 文案 + 按钮高亮 + 取消按钮显示都靠它。**任何分支结束都必须把状态归 'idle'，否则 UI 卡死。**

## 7. 语音流程（点一次开始 / 再点一次停止）

```
用户点击 voiceBtn (toggleVoice)
  ├─ 已在录 → stopVoice() → mediaRecorder.stop()
  │                          ↓ onstop
  │                      transcribeAndSend(blob)
  │                          ↓
  │                      /api/transcribe → 文字
  │                          ↓
  │                      sendMessage(文字)
  │
  └─ 没在录 → await hasProxy()  ← 必须 await，决定走哪条路
              ├─ 有 proxy 或 openaiKey → startVoiceRecording() → MediaRecorder
              └─ 都没有但浏览器支持 → startBrowserSTT() (webkitSpeechRecognition)
```

## 8. 已修过的关键 BUG（含根因，避免重复踩坑）

### Bug 1：所有按钮失灵（commit `906b443`）

**症状**：点"说话"等按钮完全没反应。
**根因**：`applyLang()` 在脚本解析时（line 898）就执行，里面 `typeof voiceMode` 访问了用 `let` 在 line 1417 声明的变量，处于 **TDZ（Temporal Dead Zone）**。
**关键陷阱**：`typeof` 对**未声明**变量返回 `"undefined"`，对**已声明但未初始化**（TDZ 里）的 `let/const` **会抛 ReferenceError**！抛错后所有 `const voiceBtn = ...`、`const sendBtn = ...` 都未执行，所有 onclick 自然全失效。
**修法**：
```js
let vm = 'original';
try { vm = voiceMode; } catch(e) { /* TDZ on first applyLang() */ }
```
**教训**：脚本顶部就执行的函数，禁止访问后面 `let` 声明的变量。要么前置声明，要么 try/catch 兜底。

### Bug 2：录音卡在"正在听"（commit `500b69f`）

**症状**：按一下开始录音，再按一下停止，UI 一直卡在"正在听"。
**根因**：硬编码 `mimeType: 'audio/webm'` 在 Safari 上 `new MediaRecorder()` 直接抛错，没 try/catch，`onstop` 永远不触发。
**修法**：
- `pickMimeType()` 按浏览器能力探测：webm → mp4 → ogg → 默认
- `audioFilename()` 把 mimeType 映射成正确扩展名传给 Whisper（Whisper 靠扩展名嗅探格式）
- 全链路 try/catch + `onerror` 处理 + 5 秒安全 timeout 强制归 idle
- `_recMime` 缓存当前 mime 用来构造 Blob

### Bug 3：第一次点语音没反应，发完一条文字后才正常（commit `8b3dbb5`）

**症状（用户原话）**："以前语音非常好用 你现在改的语音没反应了 得先文字回复之后才正常"
**根因**：模块级 `let _proxyAvailable = null`，由 `hasProxy()` 异步探测后才赋 `true/false`。`toggleVoice()` 第一次被调用时 `_proxyAvailable` 还是 `null`，`canWhisper` 判定为假 → 走了不靠谱的浏览器 STT 分支。先发一条文字会触发 `hasProxy()`，于是后面的语音才走对路径。
**修法**：
- `toggleVoice()` 改 `async`，开头 `await hasProxy()` 强制拿到结果再决策
- `DOMContentLoaded` 里预热：`hasProxy().then(ok => console.log('[Init] proxy available:', ok));`
**教训**：任何"模块级 let + 异步赋值"的全局开关，使用前要么 await 探测函数，要么提供 ready promise，绝不能凭 null 直接判断。

### Bug 4：聊天历史变量未声明就用（commit `cc3c208`）

**症状**：脚本致命错误，整个页面挂掉。
**修法**：把 `chatHistory` 声明前置。
**教训**：一类问题 —— 顶部立即执行的代码访问后面声明的变量。和 Bug 1 同源。

## 9. UI / 行为约定

- **Settings 面板**：默认对普通用户隐藏；URL 带 `?admin=1` 才出现（commit `6baf17f`）。
- **语言切换**：右上"中/EN"按钮 + 国旗（commit `9c0ac5d`）。
- **形象语音切换**：右上"原声/卡通"按钮（commit `ebdb90b`）。
- **聊天历史**：localStorage 持久化，下次进入自动恢复，带时间戳（commit `cd89df4`）。
- **中国大陆兼容**：DeepSeek + 浏览器 STT（commit `ab324da`）。
- **TTS 优化**：句子级分块 + 第一段更激进切分让"开口"更快（commit `668b090`、`c3fcf32`）。

## 10. 排错速查（Debug Cheatsheet）

打开浏览器 DevTools → Console，按场景看：

| 现象 | 第一时间查 |
|---|---|
| 按钮全没反应 | Console 有没有 ReferenceError；检查 applyLang() 里有没有访问后声明的 let |
| 语音点了没反应 | `[Init] proxy available:` 打印了吗；`hasProxy()` 是不是 await 了 |
| 录音卡"正在听" | `[Mic] Using mimeType:` 打印了什么；`mediaRecorder.onerror` 触发没 |
| Whisper 报 invalid format | `audioFilename()` 给的扩展名和实际 blob mime 是否一致 |
| TTS 没声音 | Network 面板看 `/api/tts` 是不是 200 + 流；`FISH_API_KEY` 在 Vercel 配了吗 |
| 线上没更新 | `git log origin/main` 看推上去没；Vercel 控制台看本次部署日志 |
| 跨域报错 | `vercel.json` 里 CORS 头；各 api/*.js 里 `Access-Control-Allow-Origin` |

## 11. 常用命令

```bash
# 本地起服务（端口 8000）
cd ~/Documents/my-avatar-app && python3 server.py

# 看待推 commit
git log origin/main..HEAD --oneline

# 推到 Vercel（必须在用户 Mac 上执行，沙箱推不了）
git push origin main

# 本地强制刷新（绕过 Service Worker 缓存）：浏览器里 Cmd+Shift+R
```

## 12. 已知遗留 / 待确认

- [ ] commit `8b3dbb5`（语音首次点击修复）需要用户在 Mac 终端里 push 到 GitHub
- [ ] 上线后端到端验证：第一次进页面、不发文字直接点语音，能否正常录-停-转-答-说

## 13. 参考资料更新记录（禅宗小僧角色 system prompt）

| 日期 | 来源 PDF | 改动摘要 |
|---|---|---|
| 2026-04-16 | `H610T_Week1_9_10_v5.pdf`（342 页，Liao Cheng 课件） | 重写 `DEFAULTS.systemPrompt` 中【自我反思式教育 / H610T】整段（六维度"我是谁"、投射 vs 反思、标签 vs 实在、知识双刃剑/Mann Gulch、embodied enlightenment、finger pointing at moon）；【禅宗】段补三则公案（达摩见梁武帝"无功德/廓然无圣/不识"、达摩 + 慧可"觅心了不可得"、怀海"刚才在哭现在在笑"）；同步更新"# 怎么挑视角"路由提示。改动文件：`index.html` 唯一一处。修改方式：直接编辑 `DEFAULTS.systemPrompt` 数组字面量。验证：`node` 解析 systemPrompt 数组通过（82 行，4070 字符）。 |

> 角色 system prompt 是**硬编码**在 `index.html` 的 `DEFAULTS.systemPrompt` 数组里的，不是读外部 PDF 文件。换参考资料 = 改这个数组。沙箱 `/uploads/` 只读，旧 PDF 删不掉也不影响线上行为。

## 14. 编辑这份文件的规矩

- 每次修完大 bug，在 §8 加一节："Bug N：标题（commit hash）/ 症状 / 根因 / 修法 / 教训"
- 改了文件结构 → 更新 §3
- 改了状态机或语音流程 → 更新 §6 / §7
- 加了新环境变量 → 更新 §5
- 这份文件**进 git**。下次会话只要读到它，就能跳过反复排查。

---

_最后更新：2026-04-16 — 项目固化版本 v1（基于 commit `8b3dbb5`）_
