import { useState, useRef, useEffect } from 'react';
import {
  Sparkles,
  ArrowRight,
  Plus,
  Pencil,
  Check,
  FolderDot,
  Clock3,
  Download,
  Package,
  ChevronDown,
  Printer,
} from 'lucide-react';
import { Usagi } from '../../components/Usagi';
import { modes } from '../../theme/modes';
import type { Mode } from '../../types';

export function WorkbenchHeader({
  projectName,
  mode,
  isDirty,
  isRunning,
  isBusy,
  revisionCount,
  hasModel,
  onRename,
  onCreateNew,
  onGoToCheckup,
  onGoToPrint,
  onOpenHistory,
  onExportLocal,
}: {
  projectName: string;
  mode: Mode;
  isDirty: boolean;
  isRunning: boolean;
  isBusy: boolean;
  revisionCount: number;
  hasModel: boolean;
  onRename: (newName: string) => void;
  onCreateNew: () => void;
  onGoToCheckup?: () => void;
  onGoToPrint?: () => void;
  onOpenHistory: () => void;
  onExportLocal?: (format: 'stl' | 'usagi') => void;
}) {
  const [isEditingName, setIsEditingName] = useState(false);
  const [nameInput, setNameInput] = useState(projectName);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setNameInput(projectName);
  }, [projectName]);

  useEffect(() => {
    if (isEditingName) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [isEditingName]);

  const handleSaveName = () => {
    const trimmed = nameInput.trim();
    if (trimmed && trimmed !== projectName) {
      onRename(trimmed);
    } else {
      setNameInput(projectName);
    }
    setIsEditingName(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSaveName();
    } else if (e.key === 'Escape') {
      setNameInput(projectName);
      setIsEditingName(false);
    }
  };

  const currentModeMeta = modes.find((m) => m.id === mode) || {
    name: '造物模式',
    emoji: '✦',
    badge: '模式',
  };

  return (
    <header className="workbench-heading compact enhanced-workbench-header" aria-label="造物桌主控台">
      {/* 左侧：页面大标题与乌萨奇口号 */}
      <div className="workbench-title-group">
        <div className="workbench-brand-title">
          <h1>
            造物桌 <span>✦</span>
          </h1>
          <p className="workbench-slogan" title="呀哈造物标语">
            别动脑，喊出你的想法 — 剩下的交给乌萨奇
          </p>
        </div>

        {/* 核心：当前工程状态身份卡片 (Project Status Capsule) */}
        <div className="workbench-project-capsule">
          <FolderDot size={14} className="project-capsule-icon" />

          {/* 工程名称与内联即时编辑 */}
          {isEditingName ? (
            <div className="project-name-edit-wrap">
              <input
                ref={inputRef}
                type="text"
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                onBlur={handleSaveName}
                onKeyDown={handleKeyDown}
                maxLength={30}
                className="project-name-input"
                aria-label="修改工程名称"
              />
              <button
                type="button"
                className="project-name-save-btn"
                onClick={handleSaveName}
                title="保存名称"
              >
                <Check size={12} />
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="project-name-display-btn"
              onClick={() => setIsEditingName(true)}
              title="点击修改作品名称"
            >
              <span className="project-name-text">{projectName || '无标题造物'}</span>
              <Pencil size={11} className="name-edit-pencil" />
            </button>
          )}

          {/* 模式微标 */}
          <span className="capsule-mode-tag" title={`当前玩法：${currentModeMeta.name}`}>
            <span className="mode-emoji">{currentModeMeta.emoji}</span>
            <span>{currentModeMeta.name}</span>
          </span>

          {/* 状态与存盘指示灯 */}
          <div className="capsule-sync-indicator">
            {isRunning ? (
              <span className="sync-status running">
                <span className="status-dot pulse-blue" />
                <span>生成中</span>
              </span>
            ) : isDirty ? (
              <span className="sync-status dirty">
                <span className="status-dot amber" />
                <span>待更新</span>
              </span>
            ) : (
              <span className="sync-status saved">
                <span className="status-dot green" />
                <span>已存盘</span>
              </span>
            )}
          </div>

          {/* 版本快捷切换入口 */}
          <button
            type="button"
            className="capsule-version-btn"
            onClick={onOpenHistory}
            title="查看历史版本时光机"
          >
            <Clock3 size={11} />
            <span>v{revisionCount}</span>
          </button>
        </div>
      </div>

      {/* 右侧：全局快捷动作与乌萨奇伴侣 */}
      <div className="workbench-heading-actions">
        {/* 一键新建作品 */}
        <button
          type="button"
          className="header-new-project-btn"
          disabled={isBusy || isRunning}
          onClick={onCreateNew}
          title="开启一件全新的作品"
        >
          <Plus size={13} />
          <span>新建作品</span>
        </button>

        {/* 保存到本地电脑 */}
        {hasModel && onExportLocal && (
          <details className="header-export-dropdown" title="将当前作品成果保存到您的本地电脑设备">
            <summary className="header-export-btn" role="button" aria-haspopup="true">
              <Download size={13} />
              <span>保存到本地</span>
              <ChevronDown size={11} />
            </summary>
            <div className="header-export-menu">
              <button
                type="button"
                disabled={isBusy || isRunning}
                onClick={(e) => {
                  (e.currentTarget.closest('details') as HTMLDetailsElement)?.removeAttribute('open');
                  onExportLocal('stl');
                }}
                title="导出 3D 打印水密 STL 文件保存到本地电脑"
              >
                <Download size={13} />
                <span>导出 STL 模型 (.stl)</span>
              </button>
              <button
                type="button"
                disabled={isBusy || isRunning}
                onClick={(e) => {
                  (e.currentTarget.closest('details') as HTMLDetailsElement)?.removeAttribute('open');
                  onExportLocal('usagi');
                }}
                title="导出完整工程、材料与模型作品包保存到本地电脑"
              >
                <Package size={13} />
                <span>保存作品包 (.usagi)</span>
              </button>
            </div>
          </details>
        )}

        {/* 去打印制造站 */}
        <button
          type="button"
          className="header-checkup-btn"
          disabled={isBusy || isRunning || isDirty || !hasModel}
          onClick={onGoToPrint || onGoToCheckup}
          title="去打印制造站进行物理切片与实机打印"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
        >
          <Printer size={14} />
          <span>去打印</span>
          <ArrowRight size={14} />
        </button>

        {/* 乌萨奇灵动头像向导 */}
        <div className="desk-companion" title="乌萨奇：随时随地把灵感变成实物！">
          <Usagi size={32} />
        </div>
      </div>
    </header>
  );
}
