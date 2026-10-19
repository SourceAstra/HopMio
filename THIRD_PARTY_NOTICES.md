# 第三方组件声明 (Third-Party Notices)

本文件列出呀哈造物（YaHa Craft）使用的第三方软件组件及其许可条款。各组件的版权归其各自作者所有。

安装包（二进制分发）包含「随包分发」部分列出的组件；「外部工具」部分由用户在安装时按脚本从官方源单独下载，不随安装包分发。

## 前端依赖（随包分发）

| 组件 | 版本 | 许可证 | 版权 |
| --- | --- | --- | --- |
| [React](https://react.dev) / react-dom | 19.x | MIT | Meta Platforms, Inc. 及贡献者 |
| [Three.js](https://threejs.org) | 0.186.x | MIT | 2010-2026 three.js 作者 |
| [lucide-react](https://lucide.dev) | 1.55.x | ISC | Lucide 贡献者 |

## 桌面与构建工具（开发依赖；Electron 运行时随安装包分发）

| 组件 | 许可证 |
| --- | --- |
| [Electron](https://www.electronjs.org) | MIT |
| [electron-builder](https://www.electron.build) | MIT |
| [Vite](https://vite.dev) / @vitejs/plugin-react | MIT |
| [TypeScript](https://www.typescriptlang.org) | Apache-2.0 |
| [esbuild](https://esbuild.github.io) | MIT |
| [Prettier](https://prettier.io) | MIT |
| [@playwright/test](https://playwright.dev) | Apache-2.0 |

## Python 引擎依赖（随安装包分发）

完整锁定版本见 [backend/requirements-lock.txt](backend/requirements-lock.txt)，直接依赖如下：

| 组件 | 许可证 |
| --- | --- |
| [numpy](https://numpy.org)、[scipy](https://scipy.org) | BSD-3-Clause |
| [trimesh](https://trimesh.org) | MIT |
| [shapely](https://shapely.readthedocs.io) | BSD-3-Clause |
| [Pillow](https://python-pillow.org) | MIT-CMU (HPND) |
| [opencv-python-headless](https://github.com/opencv/opencv-python) | Apache-2.0 |
| [httpx](https://www.python-httpx.org) | BSD-3-Clause |
| [pydantic](https://docs.pydantic.dev)（含 pydantic_core / Rust 依赖） | MIT |
| [keyring](https://github.com/jaraco/keyring) | MIT |
| [PyYAML](https://pyyaml.org) | MIT |
| [pytest](https://pytest.org) | MIT |
| [networkx](https://networkx.org) | BSD-3-Clause |
| [lxml](https://lxml.de) | BSD-3-Clause |
| [pycolmap](https://github.com/colmap/pycolmap) | BSD-3-Clause |
| [fonttools](https://fonttools.readthedocs.io) | MIT |

其余传递依赖（annotated-types、anyio、certifi、h11、httpcore、idna、iniconfig、jaraco.*、more-itertools、packaging、pluggy、Pygments、typing_extensions 等）遵循其各自上游许可证，均为 MIT / BSD / Apache-2.0 / Python-2.0 类宽松许可，名称与精确版本以锁定文件为准。

## Go 宿主

`cmd/server` 与 `core-go` 仅使用 Go 标准库（[Go](https://go.dev) BSD-style License，© The Go Authors），无第三方 Go 模块依赖。

## 外部工具（由用户单独安装，不随安装包分发）

以下工具通过项目脚本（`安装建模工具.cmd` / `scripts/install-*.py`）从官方发布源下载安装，作为独立进程调用：

| 工具 | 许可证 | 版权 |
| --- | --- | --- |
| [Blender](https://www.blender.org) 4.5 LTS | GPL-3.0 | Blender Foundation |
| [COLMAP](https://colmap.github.io) | BSD-3-Clause | COLMAP 作者 |
| [OpenMVS](https://github.com/cdcseacave/openMVS) | AGPL-3.0 | OpenMVS 贡献者 |
| [Bambu Studio](https://github.com/bambulab/BambuStudio) | AGPL-3.0 | Bambu Lab，基于 PrusaSlicer |

本项目与上述工具的版权方无隶属关系；拓竹（Bambu Lab）、Blender 等名称与商标归其各自所有者。

## 美术素材

`public/art/usagi` 与 `docs/images` 中的图片素材按 CC BY-NC 4.0 单独授权，角色形象说明与商业使用风险提示见 [NOTICE.md](NOTICE.md)。
