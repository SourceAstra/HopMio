## 做了什么

<!-- 简述改动内容与动机，附上关联 Issue 编号（如 Closes #12） -->

## 改动范围

- [ ] 前端界面（`src/`）
- [ ] 造物引擎（`backend/yaha/`）
- [ ] 桌面端（`desktop/`）
- [ ] Go 宿主（`cmd/`、`core-go/`）
- [ ] 构建/脚本/文档
- [ ] 其他：

## 如何验证

<!-- 运行了哪些检查，结果如何；UI 改动请附截图 -->

- [ ] `pnpm build`
- [ ] `PYTHONPATH=backend .venv/bin/python -m pytest tests/engine -q`（涉及引擎时）
- [ ] `node --experimental-strip-types --test tests/ui/*.mjs`（涉及对话/契约时）
- [ ] 手动验证步骤：

## 检查清单

- [ ] 没有把演示/估算显示为真实生成或切片结果
- [ ] 密钥没有进入源码、前端、项目文件或日志
- [ ] 乌萨奇主题使用现有素材与角色特征（如涉及界面）
- [ ] 构建中间产物在 `.artifacts/`，未在根目录新建 dist/build 目录
