# 呀哈造物 · YaHa Craft

<!-- RELEASE_VERSION_START -->
当前发布版本：**v0.1.2**。发行包与校验文件见 [GitHub Releases](https://github.com/SourceAstra/HopMio/releases)。
<!-- RELEASE_VERSION_END -->

**别动脑，喊出你的想法--- 剩下的交给乌萨奇**

孩子和家长共同使用的乌萨奇主题造物工作台。React / Three.js 提供网页和预览，Electron 提供 Windows 桌面入口，Python 管理作品与任务。

当前提供两条建模路径：**AI大模型规划参数 → Blender 制作设计**，以及 **重叠照片 → COLMAP/OpenMVS 恢复表面 → Blender 制作制造副本**。人物、玩具、家用品与电器外形使用统一工具。模型不执行 AI 返回的脚本；质量门槛、来源与 A1 mini 实际切片见 [呀哈造物系统详细设计规范](docs/呀哈造物系统详细设计规范.md)。

---

## 🎨 核心空间与界面效果

### 默认主页：三栏造物桌
启动后默认进入晨曦暖白（Morning Pearl）创客风的三栏造物桌：左侧灵感输入与智能整理、中间 Three.js 硬件加速实时 3D 视口、右侧独立部件参数微调与版本时光机。

![三栏造物桌](docs/images/workbench.png)

### 小屋门厅：六种造物模式
在小屋门厅自由选择创作模式：大白话造物、画画变挂件、照片小浮雕、照片参考造物、多视角表面重构与老作品焕新。

![小屋门厅](docs/images/hall.jpg)

### 乌萨奇展厅：亲子共创故事墙
支持 3D 虚拟展台旋转摆放、上传实物打印成果照片，沉淀孩子的创意灵感、修改历程与软件成长记录。

![乌萨奇展厅](docs/images/gallery.jpg)

---

## 安装与启动

需要 Node.js 24+、pnpm、Python 3.12 x64 和 Blender 4.5 LTS。Blender 有自己的 Python 环境，不需要在项目虚拟环境安装 `bpy`。

Windows 在项目目录执行：

```powershell
py -3.12 -m venv .venv
.venv\Scripts\python.exe -m pip install -r backend\requirements-lock.txt
pnpm install --frozen-lockfile
.\安装建模工具.cmd
启动YaHa.cmd
```

先切换到目标分支，再执行 `./publish.sh [版本号] [提交说明] --branch main`。脚本更新 README 与 `package.json` 版本号，提交当前项目改动，拉取并推送指定分支和 tag；不会重新打包。`release/` 中已有文件会生成 SHA256 并上传，也可用 `--assets DIR` 指定其他目录。安装并登录 GitHub CLI `gh` 后会创建或更新 GitHub Release；没有发行包时只发布源码。脚本会先展示待提交改动并请求确认，排除本地作品库与日期截图。默认版本在拉取分支后自动递增 patch（例如 `0.1.2` → `0.1.3`）；默认分支为 `main`。

也可双击 [安装建模工具.cmd](安装建模工具.cmd) 安装 Blender、OpenMVS 和 Bambu Studio，再运行 `启动YaHa.cmd`。源码启动需要 Go；桌面专属文件交接通过 Windows 桌面发行版提供。

Linux 在项目目录执行：

```bash
python3.12 -m venv .venv
.venv/bin/python -m pip install -r backend/requirements-lock.txt
pnpm install --frozen-lockfile
./install-modeling.sh
./deploy.sh --foreground
```

网页访问 `http://127.0.0.1:5173`。保留启动终端，按 Ctrl+C 停止。服务仅监听本机；修改源码后需重新构建并重启。

安装入口共用 [scripts/install-blender.py](scripts/install-blender.py)，从 Blender 官方源下载 4.5.14 LTS，验证官方 SHA-256 后解压，执行版本检查，最后提交安装目录；失败不会替换已有安装。无需管理员权限。

| 平台 | 默认 Blender 路径 |
| --- | --- |
| Linux | `~/.local/share/yaha-craft/blender/4.5.14/blender` |
| Windows | `%LOCALAPPDATA%\yaha-craft\blender\4.5.14\blender.exe` |

运行时读取本项目 [config/modeling.yaml](config/modeling.yaml)，默认自动发现上述路径，再查找 PATH。已有 Blender 可通过 `blender_path` 或 `YAHA_BLENDER` 指定**可执行文件**；路径可以包含空格，配置不需要额外的 shell 引号。版本范围、超时、面数和单文件大小预算也在此配置。

```yaml
schema_version: yaha.modeling-runtime/v1
blender_path: auto
allowed_version: '4.5'
timeout_seconds: 300
max_faces: 200000
max_output_mb: 40
```

当前 Linux 已安装 Blender 4.5.14 LTS、OpenMVS 2.4.0、pycolmap 4.2.1 和 Bambu Studio 02.08.02.61，并实际完成建模与切片。Windows安装脚本及发布资源已实现，未做Windows实机验证。

## Linux 一键部署

[deploy.sh](deploy.sh) 是 Linux 部署与启动的统一入口。默认编译 Go 宿主与前端，再后台启动宿主和 Python 引擎；不安装系统服务、不设置自动启动。PID 身份与日志保存在 `.artifacts/linux`，脚本只停止自己启动的进程及其子进程。依赖和三维工具仍按上面的安装步骤配置。

```bash
./deploy.sh             # 编译后后台启动
./deploy.sh --start     # 使用已有程序后台启动，不编译
./deploy.sh --build     # 同默认行为
./deploy.sh --no-start  # 编译并更新程序，停止旧进程，不启动
./deploy.sh --stop      # 停止本项目后台进程及其子进程
./deploy.sh --status    # 查看本项目后台进程状态
./deploy.sh --restart   # 使用已有程序重启
./deploy.sh --foreground # 使用已有程序前台启动，Ctrl+C 停止
tail -f .artifacts/linux/yaha.log
```

不依赖 systemd。`YAHA_PYTHON` 可指定引擎解释器，默认优先使用 `.venv/bin/python`；`YAHA_DATA_DIR` 指定作品目录，默认 `.state`；`YAHA_PORT` 指定端口，默认 5173。`YAHA_WEB_DIR` 可指定前端资源目录，新构建统一写入 `.artifacts/web`；已有 `dist` 仅兼容读取。旧 `启动YaHa.sh` 和 `启动HopMio.sh` 转发到 `--start`。脚本不删除作品、不自动终止其他端口占用者；没有系统服务或登录时自动启动。

Windows 启动脚本会关闭占用 5173 的旧进程；Linux 端口冲突会直接报错。桌面发布仍是 Windows EXE，现有 `release/` 文件不会因源码修改自动更新。

## AI 配置与造物

### 1. 服务配置
在 [config/models.yaml](config/models.yaml) 中配置大模型提供商（支持环境变量注入或在应用“家长与设置”中安全保存）：
- **GLM (智谱)**：默认 Messages 端点，支持多模态图像理解，环境变量 `YAHA_AI_API_KEY`；
- **DeepSeek**：Chat Completions 端点，专注自然语言参数规划，环境变量 `YAHA_DEEPSEEK_API_KEY`。

### 2. 造物闭环 (四步工作流)
1. **输入想法**：在造物台输入大白话（如“高100mm，壁厚3mm的圆笔筒”）或在取材角上传参考照片；
2. **AI 蓝图规划**：点击“让 AI 设计方案”，大模型提取结构化参数，自动标注确定尺寸与推测项；
3. **参数微调**：在右侧面板通过滑块精细调整，或直接输入“耳朵大一点”执行自然语言局部补丁；
4. **本地几何生成**：调用后台受信任 Blender 引擎生成物理实体，自动完成毫米级尺寸与流形水密性核验。

---

## 资产管理、版本与真实打印

### 1. 资产交付与格式规范
每次生成均产生版本快照，支持无损回退与对比：
- `.blend`：原始 Blender 场景与修改器，保留完整拓扑语义，支持外部高级手动编辑；
- `.stl` / `.3mf`：毫米级绝对尺度生产文件，100% 封闭水密，供 3D 打印直接使用；
- `.glb`：轻量级预览格式，支持 Three.js 硬件加速视口实时交互与切面预览。

### 2. 拓竹 A1 mini 真实切片
- 在“打印准备台”选择耗材（PLA/PETG）、喷嘴与层高；
- 集成官方 Bambu Studio CLI 执行真实切片，生成 `.gcode.3mf`，精确获取层数、耗材克数与打印时长；
- 拒绝粗糙前端估算，所有制造数据与支撑分析均来自切片引擎真实回执。

> 完整系统拓扑、A+B 逆向重构管线与强类型数据契约，详见 [呀哈造物系统详细设计规范](docs/呀哈造物系统详细设计规范.md)。


## 代码边界

| 目录 | 职责 |
| --- | --- |
| `src/pages`、`src/features` | 房间、方案确认、参数、版本与打印界面 |
| `src/components`、`src/theme` | 共享组件、乌萨奇、预览与主题 |
| `desktop`、`shared` | 进程桥接与公开能力清单 |
| `backend/yaha/modeling` | 计划契约、参数编译、软件适配与网格复测 |
| `backend/yaha/reconstruction` | 照片观测、相机求解、通用表面与纹理 |
| `backend/yaha/slicing` | 官方预设展开、A1 mini切片与真实结果检查 |
| `backend/yaha/blender` | 在 Blender 内执行的可信工具与品牌资产 |
| `backend/yaha/geometry` | 图片输入准备与网格读取 |
| `backend/yaha/ai` | 模型注册与 JSON 协议适配 |
| `backend/yaha/storage` | SQLite、不可变版本及受控资产 |

孩子的参数与模板入口见 [呀哈造物系统详细设计规范](docs/呀哈造物系统详细设计规范.md)。遵照约定未编译、未运行自动测试。当前 Linux 已安装固定版本的 Blender 4.5.14、pycolmap 4.2.1、OpenMVS 2.4.0 和 Bambu Studio 02.08.02.61，已实际制作100×70×24 mm放样收纳盘并完成A1 mini真实切片。Windows实机、完整回归和实体打印由人类验收；参数几何通过检查不能替代外观与实物检查。
