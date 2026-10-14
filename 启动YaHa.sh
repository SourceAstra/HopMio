#!/usr/bin/env bash
# 兼容旧入口；部署与启动逻辑统一由 deploy.sh 维护。
exec "$(dirname -- "${BASH_SOURCE[0]}")/deploy.sh" --start "$@"
