# 版权与素材声明（NOTICE）

本文件说明仓库中不同内容的授权范围。代码与素材的授权是分开的。

## 代码与文档：MIT

源代码、构建脚本与文字文档按 [LICENSE](LICENSE)（MIT）授权。

## 美术素材：CC BY-NC 4.0

以下目录中的图片素材按 [知识共享署名-非商业性使用 4.0](https://creativecommons.org/licenses/by-nc/4.0/deed.zh) 授权：

- `public/art/usagi/**`（乌萨奇角色、小屋、展墙、应用图标）
- `docs/images/**`（文档与 README 截图、示意图）

即：转载或二次创作须署名本项目，且不得用于商业用途。如需商业授权，请先联系仓库维护者。

### ⚠️ 角色形象风险提示

“乌萨奇”角色形象与知名作品《ちいかわ》(Chiikawa) 中的乌萨奇高度相似。本项目素材为面向亲子教育场景的 AI 生成二创形象，仅供学习与研究。若计划商业发行或大规模公开分发，请先自行评估角色版权风险，或替换为原创吉祥物。

## 第三方商标与软件

- **Blender** © Blender Foundation（GPL，作为独立外部程序调用，不随本项目分发源码内的 Blender 本体）。
- **Bambu Studio / 拓竹（Bambu Lab）** 为 Bambu Lab Inc. 的产品与商标，本项目仅通过官方 CLI 与设备协议集成，与该公司无隶属关系。
- **COLMAP / OpenMVS** 按各自开源协议授权，作为外部工具调用。
- 前端依赖（React、Three.js、Electron 等）与后端 Python 依赖按各自 LICENSE 授权，详见 `package.json`、`pnpm-lock.yaml` 与 `backend/requirements-lock.txt`。

## 数据与隐私

- 本项目不收集用户数据；作品、对话与设置保存在本地。
- AI 密钥保存在系统凭据库，不进入源码、项目文件或日志。
