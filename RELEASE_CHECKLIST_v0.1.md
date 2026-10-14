# 呀哈造物 v0.1 发布准备

盘点日期：2026-10-14  
候选包版本：`0.1.2`（当前 `package.json` 版本；属于 `v0.1` 系列）  
状态：**Windows 发布阻塞，未生成发行包**

## 本地数据

- `.state/yaha.sqlite3` 是当前作品库；本次复核时有 21 个作品、53 个版本、390 项素材、116 个任务。该数据库仍由应用使用，保留；计数是盘点时快照。
- 暂未关联作品版本的素材仍是已登记的素材架内容，予以保留。
- 已删除旧库快照 `.state/db.sqlite` 及其 WAL/SHM 辅助文件。核对时其中作品、版本、素材和任务 ID 均已存在于当前库，没有独有记录；旧 `quota` 设置与当前值不同，随废弃快照一并清除。
- `.state/`、`.astramap/` 和 `/bin/` 已加入 Git 忽略规则，避免本地作品、工具数据和可执行文件进入发布源代码。
- 当前作品、素材和运行记录均予以保留。`release/` 当前不存在。

## 发布阻断项

- 已补齐最小 Electron 桌面桥、资源协议和 Windows x64 便携包脚本；发布入口为 `pnpm package:windows`，完整 `config/` 随包提供，Python 与应用代码一同封装。
- Windows 发布脚本要求在 Windows x64 执行，并使用项目 `.venv` 中的 Python 3.12。当前工作环境为 Linux，无法生成或实机验证 Windows EXE。
- 当前 `deploy.sh` 仅支持 Linux，现有 `bin/yaha` 是 Linux x86-64 程序，不能作为 Windows 发行包。
- 尚无 `release/YaHa-Craft-0.1.2-Windows.exe`，也没有对 Windows 发行包进行验证。
- Windows 宿主的 Python 解释器发现和子进程树清理已修正，但仍未在 Windows 实机验证；源码启动还需要 Go 1.22+。
- 桌面作品库现在默认位于 `%LOCALAPPDATA%\YaHaCraft\data`，可用 `YAHA_DATA_DIR` 覆盖；尚未验证旧安装数据迁移。
- 当前三维运行时要求 Windows x64；32 位 Windows 不在支持范围内。发布说明和安装程序应明确标注 x64。

## 发布前完成条件

- 在 Windows x64 上生成 EXE，并确认 Python 运行时打包、首次启动、数据目录、Blender 安装和作品迁移路径。
- 在 Windows 环境生成 EXE，确认安装、首次启动、数据目录、Blender 安装和作品迁移路径。
- 完成人工验收后，再将最终 EXE 放入 `release/`；中间文件继续放在 `.artifacts/`。

本次删除已确认无独有记录的旧库快照，合并过时的人物方案转发页，并记录发布状态；没有编译、运行测试或创建发行包。
