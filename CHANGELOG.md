# 更新日志 (Changelog)

呀哈造物（YaHa Craft）的所有重要变更记录在此文件。

遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/) 规范与[语义化版本](https://semver.org/lang/zh-CN/)。发布版本号由 [publish.sh](publish.sh) 在发布时自动递增 patch 位。

## [0.1.2] - 2026-10-19

首个开源公开版本。亲子共创的乌萨奇主题 AI 3D 造物工作台：一句话 / 照片 / 涂鸦 → AI 规划参数 → Blender 生成真实水密模型 → Bambu Studio 真实切片，直连拓竹打印机。

### 新增

- **造物工作台**：三栏造物桌（乌萨奇 AI 对话 / Three.js 硬件加速 3D 视口 / 参数微调面板）、小屋门厅多种造物模式、作品展厅与版本时光机、家长安全门禁。
- **AI 造物链路**：大白话理解 → 结构化方案确认 → 参数规划 → Blender 可信几何生成（真实字体挤出刻字、圆柱减法开孔、毫米级尺寸与流形水密核验）→ 渲染图 AI 成品审阅，未通过保留草稿。
- **造物对话**：随作品保存在本地 SQLite 的连续会话；自然语言参数补丁限定到所选部件；截图圈注定位微调（需图片模型）；多窗口冲突提示。
- **取材角素材库**：素材文件夹、批量操作、框选多选、挑素材与移动弹窗。
- **拓竹云打印**：账号认证、设备绑定、切片 3MF 预签名直传与 MQTT TLS 实时遥测（`backend/yaha/devices/bambu_cloud.py`）。
- **打印制造站**：官方 Bambu Studio CLI 真实切片（层数 / 耗材 / 时长真实回执）、家长检查清单与密码确认、STL / 3MF / GLB / BLEND / `.usagi` 作品包导出。
- **照片造物**：照片小浮雕、多视角照片 COLMAP/OpenMVS 表面重建后 Blender 制造副本。
- **小屋工坊**：孩子的第一个代码入口——改参数、改主题色、给房间起名。
- **多模型 AI 设置**：候选模型管理、文字/图片能力测试、服务地址发现模型、上下文与输出预算、思考强度；密钥保存到系统凭据库，不进入源码与日志。
- **版本与交付**：每次生成产生不可变版本快照（`.blend` / `.stl` / `.3mf` / `.glb`），无损回退与对比。
- **构建与发布**：Windows 安装包 / 便携版打包脚本，Linux `deploy.sh` 一键部署，`publish.sh` 版本递增与 GitHub Release 发布。
- **开源材料**：MIT（代码）+ CC BY-NC 4.0（美术素材）分离授权、中英双语 README、CONTRIBUTING / SECURITY、Issue 与 PR 模板、第三方依赖声明。

### 变更

- 造物大厅与造物桌整合为统一 Hero 入口，作品状态卡直达 3D 视口。
- 网格编辑能力（`backend/yaha/modeling/mesh_editing.py`）支持局部部件修改。

### 修复

- Windows 打包前校验 pnpm 环境与版本一致性。
- 保存流程保护已提交文件内容，避免覆盖丢失。
- 云端造物前置家长开启校验（`AI_DISABLED`），未开启时明确报错而非静默失败。

[0.1.2]: https://github.com/SourceAstra/HopMio/releases/tag/v0.1.2
