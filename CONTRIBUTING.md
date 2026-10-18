# 参与贡献 · Contributing

感谢你愿意为「呀哈造物」出力！这是一个给孩子和家长的乌萨奇主题造物工作台，贡献不限于代码——灵感点子、界面文案、模型模板、教程和问题反馈同样重要。

## 快速上手

| 环境 | 要求 |
| --- | --- |
| Node.js | 24+ |
| 包管理 | pnpm |
| Python | 3.12 x64 |
| Go | 源码运行需要 |
| 三维工具 | Blender 4.5 LTS（安装脚本会自动下载） |

### 安装依赖（Linux / macOS）

```bash
python3.12 -m venv .venv
.venv/bin/python -m pip install -r backend/requirements-lock.txt
pnpm install --frozen-lockfile
./setup.sh          # 安装 Blender / OpenMVS / Bambu Studio（可选，按需）
```

Windows 对应步骤见 [README](README.md#从源码运行)，可双击 `安装建模工具.cmd` 与 `启动YaHa.cmd`。

### 运行

```bash
./deploy.sh --foreground   # 编译 Go 宿主与前端并前台启动，访问 http://127.0.0.1:5173
```

日常页面调试无需重新打包；改动后重新构建并重启即可。

### 检查与测试

```bash
# TypeScript 类型检查 + 前端构建
pnpm build

# 引擎（Python）测试
PYTHONPATH=backend .venv/bin/python -m pytest tests/engine -q

# Python 代码风格
.venv/bin/python -m pip install -r backend/requirements-dev.txt
.venv/bin/python -m ruff check backend scripts

# 前端契约测试
node --experimental-strip-types --test tests/ui/*.mjs
```

改动提交前请运行与改动范围相称的检查（见 [AGENTS.md](AGENTS.md)「实现与真实性」）。

## 项目结构速览

| 目录 | 职责 |
| --- | --- |
| `src/pages`、`src/features` | 房间、造物桌、方案确认、参数、版本与打印界面 |
| `src/components`、`src/theme` | 共享组件、乌萨奇主题与文案 |
| `desktop`、`shared` | Electron 进程桥接与公开能力清单 |
| `cmd/server`、`core-go` | Go 宿主服务 |
| `backend/yaha/modeling` | 计划契约、参数编译、意图校验、成品审阅 |
| `backend/yaha/reconstruction` | 照片观测、相机求解、表面与纹理 |
| `backend/yaha/slicing` | A1 mini 切片与真实结果检查 |
| `backend/yaha/blender` | 在 Blender 内执行的可信工具 |
| `backend/yaha/storage` | SQLite、不可变版本与受控资产 |
| `tests/engine`、`tests/ui` | 引擎测试与前端契约测试 |

## 约定（必读）

1. **按功能拆分文件**：不把页面、业务逻辑堆进单个文件；文件变大或职责混杂时及时拆分。
2. **乌萨奇主题一致**：角色必须复用 `src/components/Usagi.tsx`、`src/theme/usagi.ts` 与 `public/art/usagi` 现有素材，不得用通用兔子替代（详见 [AGENTS.md](AGENTS.md)）。
3. **真实与演示分开**：本地算法、真实云端 AI 与模拟设备明确区分，不把估算或占位显示为真实结果。
4. **安全底线**：密钥不进入源码/前端/项目文件/日志；导入项目不自动执行附带脚本；测试不得触发真实打印。
5. **交付物**：构建中间产物放 `.artifacts/`，Windows EXE 放 `release/`，不要在根目录新建 `dist/`、`build/` 等目录。

## 提交 Pull Request

1. Fork 仓库并从 `main` 拉取特性分支（如 `feat/photo-relief`）。
2. 保证 `pnpm build` 与相关测试通过；UI 改动请附截图。
3. PR 描述写清：做了什么、为什么、如何验证。涉及孩子可见文案时说明用词考虑。
4. 保持 PR 聚焦一件事，大改动先开 Issue 讨论。

## 报告问题

提 Issue 请选择对应模板（Bug 报告 / 功能建议），并附上：
- 复现步骤与预期/实际行为；
- 系统环境（Windows/Linux、应用版本）；
- 如涉及建模或打印，说明使用的造物模式与工具（Blender/Bambu Studio）版本。

安全问题请勿公开 Issue，参见 [SECURITY.md](SECURITY.md)。
