#!/usr/bin/env bash
set -Eeuo pipefail

usage() {
  cat <<'EOF'
用法：./publish.sh [VERSION] [COMMIT_MESSAGE] [--branch BRANCH] [--yes]

示例：./publish.sh 0.1.3 "release: v0.1.3" --branch main

更新版本信息，提交变更，拉取并推送指定 GitHub 分支，创建版本 tag 和 GitHub Release。
脚本不会构建发行包；默认上传 release/ 中已有文件，可用 --assets DIR 指定其他目录。
--yes 跳过提交与发布确认；默认分支为 main。
EOF
}

ROOT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
cd "$ROOT_DIR"

VERSION=""
AUTO_VERSION=false
COMMIT_MESSAGE=""
BRANCH="main"
YES=false
ASSET_DIR="release"
POSITIONAL=()
while (($#)); do
  case "$1" in
    --branch)
      (($# >= 2)) || { usage >&2; exit 2; }
      BRANCH="$2"
      shift 2
      ;;
    --branch=*) BRANCH="${1#*=}"; shift ;;
    --assets)
      (($# >= 2)) || { usage >&2; exit 2; }
      ASSET_DIR="$2"
      shift 2
      ;;
    --assets=*) ASSET_DIR="${1#*=}"; shift ;;
    --yes|-y) YES=true; shift ;;
    --help|-h) usage; exit 0 ;;
    --*) echo "未知参数：$1" >&2; usage >&2; exit 2 ;;
    *) POSITIONAL+=("$1"); shift ;;
  esac
done
(( ${#POSITIONAL[@]} <= 2 )) || { usage >&2; exit 2; }
VERSION="${POSITIONAL[0]:-}"
COMMIT_MESSAGE="${POSITIONAL[1]:-}"

for tool in git node; do
  command -v "$tool" >/dev/null || { echo "缺少必要工具：$tool" >&2; exit 1; }
done
if command -v gh >/dev/null 2>&1; then
  gh auth status >/dev/null || { echo "GitHub CLI 尚未登录；请先运行 gh auth login。" >&2; exit 1; }
fi

if [[ -z "$VERSION" ]]; then AUTO_VERSION=true; fi
VERSION="${VERSION#v}"
if [[ "$AUTO_VERSION" != true ]]; then
  [[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || { echo "版本号必须为稳定 SemVer，例如 0.1.3。" >&2; exit 2; }
fi
ORIGIN_URL=$(git remote get-url origin)
[[ "$ORIGIN_URL" == *github.com* ]] || { echo "origin 不是 GitHub 地址：$ORIGIN_URL" >&2; exit 1; }
CURRENT_BRANCH=$(git branch --show-current)
[[ "$CURRENT_BRANCH" == "$BRANCH" ]] || {
  echo "当前分支是 '$CURRENT_BRANCH'，目标分支是 '$BRANCH'。请先切换到目标分支再运行。" >&2
  exit 1
}
if [[ "$ASSET_DIR" != /* ]]; then ASSET_DIR="$ROOT_DIR/$ASSET_DIR"; fi

confirm() {
  local prompt="$1" answer
  [[ "$YES" == true ]] && return 0
  read -r -p "$prompt [y/N] " answer
  [[ "$answer" == y || "$answer" == Y || "$answer" == yes || "$answer" == YES ]]
}

echo "目标分支：$BRANCH"
echo "GitHub：$ORIGIN_URL"
if [[ -n "$(git status --porcelain)" ]]; then
  echo
  echo "待纳入提交的工作区变更："
  git status --short
  echo "将排除本地作品库 .yaha/、根目录日期截图和 release/ 产物。"
  confirm "提交以上项目改动并继续发布？" || { echo "已取消，未提交改动。"; exit 1; }
  git add -A -- . ':(exclude).yaha' ':(exclude).yaha/**' ':(exclude)2026-*.png' ':(exclude)release' ':(exclude)release/**'
  if git diff --cached --name-only | grep -Eq '(^\.yaha/|^2026-[^/]*\.png$|^release/)'; then
    echo "暂存区包含作品库、日期截图或发行产物；请先取消暂存这些本地文件。" >&2
    exit 1
  fi
  if ! git diff --cached --quiet; then
    git commit -m "${COMMIT_MESSAGE:-chore: publish source changes}"
  fi
fi

echo "拉取 origin/$BRANCH …"
git fetch origin "$BRANCH" --tags
git pull --rebase origin "$BRANCH"
if [[ "$AUTO_VERSION" == true ]]; then
  VERSION=$(node -e 'const [a,b,c]=require("./package.json").version.split(".").map(Number); process.stdout.write(`${a}.${b}.${c+1}`)')
fi
[[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || { echo "版本号必须为稳定 SemVer，例如 0.1.3。" >&2; exit 2; }
TAG="v$VERSION"
COMMIT_MESSAGE="${COMMIT_MESSAGE:-release: $TAG}"
echo "发布版本：$TAG"
if git show-ref --verify --quiet "refs/tags/$TAG"; then
  echo "版本 tag 已存在：$TAG。请使用新的版本号。" >&2
  exit 1
fi

node - "$VERSION" <<'NODE'
const fs = require('node:fs');
const version = process.argv[2];
const packageFile = 'package.json';
const pkg = JSON.parse(fs.readFileSync(packageFile, 'utf8'));
pkg.version = version;
fs.writeFileSync(packageFile, `${JSON.stringify(pkg, null, 2)}\n`);

const readmeFile = 'README.md';
let readme = fs.readFileSync(readmeFile, 'utf8');
const start = '<!-- RELEASE_VERSION_START -->';
const end = '<!-- RELEASE_VERSION_END -->';
const section = `${start}\n当前发布版本：**v${version}**。发行包与校验文件见 [GitHub Releases](https://github.com/SourceAstra/HopMio/releases)。\n${end}`;
if (readme.includes(start) && readme.includes(end)) {
  readme = readme.replace(new RegExp(`${start}[\\s\\S]*?${end}`), section);
} else {
  readme = readme.replace(/^# 呀哈造物 · YaHa Craft\s*/m, `# 呀哈造物 · YaHa Craft\n\n${section}\n`);
}
fs.writeFileSync(readmeFile, readme);
NODE

if ! git diff --quiet -- package.json README.md; then
  git add package.json README.md
  git commit -m "release: $TAG"
fi

confirm "推送 $BRANCH 和 tag $TAG 到 GitHub？" || { echo "提交已完成，推送已取消。"; exit 1; }
git push origin "$BRANCH"
git tag -a "$TAG" -m "YaHa Craft $TAG"
git push origin "$TAG"

if command -v gh >/dev/null 2>&1; then
  ASSETS=()
  if [[ -d "$ASSET_DIR" ]]; then
    shopt -s nullglob
    for asset in "$ASSET_DIR"/*; do
      [[ -f "$asset" && "$(basename "$asset")" != SHA256SUMS* ]] && ASSETS+=("$asset")
    done
    shopt -u nullglob
  fi
  if ((${#ASSETS[@]})); then
    if command -v sha256sum >/dev/null 2>&1; then
      (cd "$ASSET_DIR" && sha256sum "${ASSETS[@]##*/}" > "SHA256SUMS-${VERSION}.txt")
    elif command -v shasum >/dev/null 2>&1; then
      (cd "$ASSET_DIR" && shasum -a 256 "${ASSETS[@]##*/}" > "SHA256SUMS-${VERSION}.txt")
    fi
    [[ ! -f "$ASSET_DIR/SHA256SUMS-${VERSION}.txt" ]] || ASSETS+=("$ASSET_DIR/SHA256SUMS-${VERSION}.txt")
  fi
  if gh release view "$TAG" >/dev/null 2>&1; then
    if ((${#ASSETS[@]})); then gh release upload "$TAG" "${ASSETS[@]}" --clobber; fi
  else
    NOTES="源码版本 $TAG。"
    if ((${#ASSETS[@]})); then
      gh release create "$TAG" "${ASSETS[@]}" --title "呀哈造物 $TAG" --notes "$NOTES"
    else
      gh release create "$TAG" --title "呀哈造物 $TAG" --notes "$NOTES"
      echo "未发现本地发行包，仅创建了源码 Release。可使用 --assets DIR 上传现成包。"
    fi
  fi
else
  echo "未安装 GitHub CLI（gh），分支和 tag 已推送；如需上传发行包，请安装 gh 后再次运行或手动创建 Release。"
fi

echo "发布完成：$TAG（$BRANCH）"
