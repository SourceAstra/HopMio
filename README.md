<div align="center">

<img src="public/art/usagi/app-icon.png" width="132" alt="呀哈造物应用图标" />

# 呀哈造物 · YaHa Craft

**别动脑，喊出你的想法 —— 剩下的交给乌萨奇 🐰**

面向 12 岁孩子和家长共同创作的乌萨奇主题 3D 造物工作台：\
喊出一句话、拍张照片或画一笔涂鸦，AI 规划参数、Blender 生成真实水密模型、Bambu Studio 完成真实切片，直通拓竹 3D 打印机。

[![Release](https://img.shields.io/github/v/release/SourceAstra/HopMio?style=flat-square&label=%E5%8F%91%E8%A1%8C%E7%89%88)](https://github.com/SourceAstra/HopMio/releases)
[![License](https://img.shields.io/badge/%E4%BB%A3%E7%A0%81-MIT-yellow?style=flat-square)](LICENSE)
[![Assets](https://img.shields.io/badge/%E7%B4%A0%E6%9D%90-CC%20BY--NC%204.0-orange?style=flat-square)](NOTICE.md)
![Platform](https://img.shields.io/badge/%E5%B9%B3%E5%8F%B0-Windows%20%7C%20Linux-blue?style=flat-square)
![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen?style=flat-square)

**[English](README.en.md)** · [系统设计规范](docs/呀哈造物系统详细设计规范.md) · [参与贡献](CONTRIBUTING.md) · [安全政策](SECURITY.md)

![呀哈造物主页：三栏造物大厅](docs/images/home.png)

</div>

<!-- RELEASE_VERSION_START -->
当前发布版本：**v0.1.2**。发行包与校验文件见 [GitHub Releases](https://github.com/SourceAstra/HopMio/releases)。
<!-- RELEASE_VERSION_END -->

---

## ✨ 它能做什么

孩子在造物大厅喊出一句大白话（“高 100mm，壁厚 3mm 的圆笔筒”），上传参考照片，或画一笔涂鸦，呀哈造物完成剩下的：

| 步骤 | 发生什么 |
| --- | --- |
| 1️⃣ 输入想法 | 大白话描述、参考照片、涂鸦或多视角照片 |
| 2️⃣ AI 梳理想法 | 结合聊天上下文整理成结构化方案，标注推测项，确认后进入生成 |
| 3️⃣ AI 蓝图规划 | 提取结构化几何参数；刻字、圆孔等明确要求必须落成真实工具步骤 |
| 4️⃣ 参数微调 | 右侧滑块精细调整，或直接说“耳朵大一点”执行限定到所选部件的自然语言补丁 |
| 5️⃣ 本地生成与审阅 | Blender 生成物理实体（真实字体挤出、圆柱减法、毫米级尺寸、流形水密核验），渲染图再由 AI 成品审阅把关 |

**两条建模路径**：AI 大模型规划参数 → Blender 制作设计；重叠照片 → COLMAP/OpenMVS 恢复表面 → Blender 制作制造副本。

**真实性承诺**：模型不执行 AI 返回的脚本；切片数据全部来自 Bambu Studio 官方 CLI 真实回执，拒绝前端估算；质量门槛与来源详见[系统设计规范](docs/呀哈造物系统详细设计规范.md)。

## 📸 界面一览

| 三栏造物桌 · 实时 3D + AI 对话 + 参数微调 | 乌萨奇展厅 · 亲子共创故事墙 |
| :---: | :---: |
| ![三栏造物桌](docs/images/workbench.png) | ![乌萨奇展厅](docs/images/gallery.png) |

| 小屋工坊 · 孩子的第一个代码入口 | 打印制造站 · 拓竹打印机真实切片与云打印 |
| :---: | :---: |
| ![小屋工坊](docs/images/workshop.png) | ![打印制造站](docs/images/printing.png) |

家长控制台独立门禁保护 AI 密钥与设备操作：

![家长安全门禁](docs/images/parental.png)

## 🚀 快速开始

### 方式一：Windows 安装包（推荐给使用者）

从 [GitHub Releases](https://github.com/SourceAstra/HopMio/releases) 下载 `YaHa-Craft-Setup-版本号-x64.exe`，双击按向导安装。安装包自带网页、桌面入口、Python 与引擎依赖，**无需安装 Node.js、Go 或系统 Python**；卸载不会删除 `%LOCALAPPDATA%\YaHaCraft\data` 中的作品与设置。面向 Windows 10/11 x64。

Blender、OpenMVS、Bambu Studio 作为独立三维工具安装（已有工具会自动识别），需要时在应用安装目录运行 `resources\tools\安装建模工具.cmd`。AI 模型地址与密钥在应用内“家长与设置”自行配置。

### 方式二：从源码运行（开发者）

需要 Node.js 24+、pnpm、Python 3.12 x64、Go 和 Blender 4.5 LTS（Blender 有自己的 Python 环境，不需要在项目虚拟环境安装 `bpy`）。

**Windows**：双击 [安装建模工具.cmd](安装建模工具.cmd) 安装三维工具，再运行 `启动YaHa.cmd`；或手动执行：

```powershell
py -3.12 -m venv .venv
.venv\Scripts\python.exe -m pip install -r backend\requirements-lock.txt
pnpm install --frozen-lockfile
.\安装建模工具.cmd
启动YaHa.cmd
```

**Linux**：

```bash
python3.12 -m venv .venv
.venv/bin/python -m pip install -r backend/requirements-lock.txt
pnpm install --frozen-lockfile
./setup.sh
./deploy.sh --foreground
```

网页访问 `http://127.0.0.1:5173`，保留终端按 Ctrl+C 停止。服务仅监听本机。

<details>
<summary><b>Linux 部署命令与环境变量</b></summary>

[deploy.sh](deploy.sh) 是 Linux 部署与启动的统一入口：默认编译 Go 宿主与前端，再后台启动宿主和 Python 引擎；不安装系统服务。PID 身份与日志保存在 `.artifacts/linux`。

```bash
./deploy.sh             # 编译后后台启动
./deploy.sh --start     # 使用已有程序后台启动，不编译
./deploy.sh --no-start  # 编译并更新程序，停止旧进程，不启动
./deploy.sh --stop      # 停止本项目后台进程及其子进程
./deploy.sh --status    # 查看本项目后台进程状态
./deploy.sh --restart   # 使用已有程序重启
tail -f .artifacts/linux/yaha.log
```

环境变量：`YAHA_PYTHON` 指定引擎解释器（默认 `.venv/bin/python`）；`YAHA_DATA_DIR` 指定作品目录（默认 `.state`）；`YAHA_PORT` 指定端口（默认 5173）；`YAHA_WEB_DIR` 指定前端资源目录（新构建统一写入 `.artifacts/web`）。不依赖 systemd，脚本只停止自己启动的进程。Windows 启动脚本会关闭占用 5173 的旧进程；Linux 端口冲突会直接报错。

</details>

<details>
<summary><b>Blender 路径与运行时配置</b></summary>

安装入口共用 [scripts/install-blender.py](scripts/install-blender.py)：从 Blender 官方源下载 4.5.14 LTS，验证官方 SHA-256 后解压，失败不会替换已有安装，无需管理员权限。

| 平台 | 默认 Blender 路径 |
| --- | --- |
| Linux | `~/.local/share/yaha-craft/blender/4.5.14/blender` |
| Windows | `%LOCALAPPDATA%\yaha-craft\blender\4.5.14\blender.exe` |

运行时读取 [config/modeling.yaml](config/modeling.yaml)，默认自动发现上述路径再查找 PATH；已有 Blender 可通过 `blender_path` 或 `YAHA_BLENDER` 指定**可执行文件**（路径可含空格，无需额外引号）。

```yaml
schema_version: yaha.modeling-runtime/v1
blender_path: auto
allowed_version: '4.5'
timeout_seconds: 300
max_faces: 200000
max_output_mb: 40
```

当前 Linux 已实测 Blender 4.5.14 LTS、OpenMVS 2.4.0、pycolmap 4.2.1、Bambu Studio 02.08.02.61 完成建模与切片；Windows 已完成工具安装与启动检查，完整制造流程仍需验收。

</details>

<details>
<summary><b>生成 Windows 安装包与发布</b></summary>

```powershell
pnpm package:windows         # 安装向导版（默认）
pnpm package:portable        # 可选：便携版
```

安装程序输出为 `release/YaHa-Craft-Setup-版本号-x64.exe`，旁边 `.sha256` 是校验文件；中间文件全部在 `.artifacts/package-windows/`，不会打包清理旧发行包与本机作品库。当前未配置代码签名，Windows 可能提示发布者未验证。

发布流程：先打包，再执行 `./publish.sh [版本号] [提交说明] --branch main` 更新版本号、提交、推送 tag 并把 `release/` 文件（含 SHA256）上传为 GitHub Release（需安装登录 `gh`）。脚本默认在拉取分支后自动递增 patch，发布前会展示待提交改动并请求确认。

</details>

## 🤖 AI 模型配置

进入“家长与设置”即可配置（无默认密码，首次进入自行设置）。支持保存多个大模型并随时切换，密钥保存到系统凭据库，不进入源码与日志。

- **模型发现**：填写 HTTPS 服务地址与 API Key 一键发现可用模型，或手动填写模型标识；地址支持 API 根地址或完整 `/chat/completions`、`/messages` 端点。
- **能力测试**：候选卡片可单独“测试文字能力 / 测试图片能力”（图片测试发送内置测试图核对识别，通过后自动启用图片能力）。
- **预算与等待**：每个模型可单独配置上下文窗口、最大输入/输出 Token、最长等待时间与思考强度。
- **启动预设**：[config/models.yaml](config/models.yaml) 提供启动预设，密钥通过环境变量注入。默认内置 GLM（智谱，多模态）与 DeepSeek 两个候选。

照片微调与生成后的成品审阅需要支持图像输入的模型；纯文本模型仍可用于参数规划。

## 🧱 技术栈与架构

**前端** React 19 + Three.js（硬件加速 3D 视口）· **桌面** Electron · **宿主** Go · **引擎** Python 3.12 · **几何** Blender 4.5 LTS · **重构** COLMAP / OpenMVS · **切片** Bambu Studio CLI

| 目录 | 职责 |
| --- | --- |
| `src/pages`、`src/features` | 房间、方案确认、参数、版本与打印界面 |
| `src/components`、`src/theme` | 共享组件、乌萨奇、预览与主题 |
| `desktop`、`shared` | 进程桥接与公开能力清单 |
| `cmd/server`、`core-go` | Go 宿主服务（可零 Node.js 依赖直接运行） |
| `backend/yaha/modeling` | 计划契约、参数编译、意图校验、成品审阅与网格复测 |
| `backend/yaha/reconstruction` | 照片观测、相机求解、通用表面与纹理 |
| `backend/yaha/slicing` | 官方预设展开、拓竹打印机切片与真实结果检查 |
| `backend/yaha/blender` | 在 Blender 内执行的可信工具与品牌资产 |
| `backend/yaha/geometry` | 图片输入准备与网格读取 |
| `backend/yaha/ai` | 模型注册与 JSON 协议适配 |
| `backend/yaha/storage` | SQLite、不可变版本及受控资产 |

<details>
<summary><b>造物对话与数据细节</b></summary>

- 对话随作品保存在本地 SQLite，刷新、重启或切换作品后可继续；每件作品最多 1000 条，按当前模型输入预算保留历史。
- “造物对话”统一了微调与灵感：助手在一次请求中判断继续修改、重新设计或先澄清，所有几何修改仍需确认；文字模型可直接执行参数与几何微调，启用图片能力的模型继续对照实际成品做视觉审阅，审阅失败不会降级为几何通过。
- 多窗口同时修改会话会提示冲突，避免静默覆盖；429 限流保留原模型并显示原因。
- 体检记录须匹配当前模型版本与打印配置才可进入打印准备台；体检页显示阻塞打印的具体原因。

</details>

## 📦 版本与资产交付

每次生成均产生**不可变版本快照**，支持无损回退与对比：

| 格式 | 用途 |
| --- | --- |
| `.blend` | 原始 Blender 场景与修改器，保留完整拓扑语义，支持外部高级编辑 |
| `.stl` / `.3mf` | 毫米级绝对尺度生产文件，100% 封闭水密，供 3D 打印直接使用 |
| `.glb` | 轻量预览格式，Three.js 实时交互与切面预览 |
| `.usagi` | 作品包（数据格式，不执行附带脚本） |

打印准备台集成官方 Bambu Studio CLI 执行**真实切片**，生成 `.gcode.3mf`，精确获取层数、耗材克数与打印时长；支持拓竹各型号打印机云协议直传实机与实时监控（需在家长设置绑定设备），并保留家长检查清单与密码确认。

## 🤝 参与贡献

代码、灵感点子、界面文案、模型模板与教程都欢迎！先读 [CONTRIBUTING.md](CONTRIBUTING.md) 了解环境搭建、测试命令与项目约定，孩子的参数与模板入口设计见[系统设计规范](docs/呀哈造物系统详细设计规范.md)。造物桌质量问题根因与修复记录见 [造物桌质量调试记录](docs/造物桌质量调试记录.md)。

## 📄 许可证

- **代码与文档**：[MIT License](LICENSE)
- **美术素材**（`public/art/usagi`、`docs/images`）：[CC BY-NC 4.0](https://creativecommons.org/licenses/by-nc/4.0/deed.zh)，详见 [NOTICE.md](NOTICE.md)

> ⚠️ “乌萨奇”角色形象与《ちいかわ》中的乌萨奇高度相似，素材为 AI 生成的非商业二创。计划商业发行前请评估角色版权风险，或替换为原创吉祥物（见 [NOTICE.md](NOTICE.md)）。
