import { useState } from 'react';
import { Box, Scan, Layers, CheckCircle2, AlertTriangle, Copy, Check, Terminal, ExternalLink, RefreshCw } from 'lucide-react';
import type { Preferences } from '../../types';

export function WorkshopEnginesPanel({
  preferences,
  onRefresh,
}: {
  preferences?: Preferences;
  onRefresh?: () => void;
}) {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const copyText = (key: string, text: string) => {
    void navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const blender = preferences?.blender;
  const slicer = preferences?.slicer;
  const reconstruction = preferences?.reconstruction;

  const isBlenderReady = Boolean(blender?.available);
  const isSlicerReady = Boolean(slicer?.available);
  const isReconReady = Boolean(reconstruction?.available);

  return (
    <div className="workshop-engines-container">
      {/* 头部标题与重新检测 */}
      <div className="engines-header-bar">
        <div>
          <h3>工坊造物引擎与运行状态</h3>
          <p>小屋依托底层三维几何与制造工具链，确保从抽象提示词到真实物理打印的完整闭环。</p>
        </div>
        {onRefresh && (
          <button type="button" className="secondary icon-btn-refresh" onClick={onRefresh} title="重新检测底层环境">
            <RefreshCw size={14} />
            <span>检测环境</span>
          </button>
        )}
      </div>

      {/* 核心引擎卡片三列 Bento Grid */}
      <div className="engines-cards-grid">
        {/* 引擎 1: Blender 建模引擎 */}
        <section className={`engine-card ${isBlenderReady ? 'status-ready' : 'status-missing'}`}>
          <div className="engine-card-top">
            <div className="engine-icon-wrap blender">
              <Box size={24} />
            </div>
            <div className="engine-meta">
              <div className="engine-title-row">
                <h4>Blender 几何建模引擎</h4>
                <span className={`engine-badge ${isBlenderReady ? 'ready' : 'missing'}`}>
                  {isBlenderReady ? <CheckCircle2 size={12} /> : <AlertTriangle size={12} />}
                  {isBlenderReady ? '已连接' : '待配置'}
                </span>
              </div>
              <span className="engine-version-label">
                {isBlenderReady ? `版本：${blender?.version || '4.x'}` : (blender?.message || '尚未检测到可执行环境')}
              </span>
            </div>
          </div>

          <p className="engine-desc">
            负责乌萨奇 3D 几何生成、参数化装配、布尔雕刻及制造网格导出的本地核心引擎。
          </p>

          <div className="engine-action-box">
            <span className="action-box-title">
              <Terminal size={12} /> 安装与排障命令：
            </span>
            <div className="command-row">
              <code>Windows: 安装建模工具.cmd</code>
              <button
                type="button"
                className="copy-btn"
                onClick={() => copyText('win-blender', '安装建模工具.cmd')}
                title="复制命令"
              >
                {copiedKey === 'win-blender' ? <Check size={12} className="copied" /> : <Copy size={12} />}
              </button>
            </div>
            <div className="command-row">
              <code>Linux: ./setup.sh --blender</code>
              <button
                type="button"
                className="copy-btn"
                onClick={() => copyText('nix-blender', './setup.sh --blender')}
                title="复制命令"
              >
                {copiedKey === 'nix-blender' ? <Check size={12} className="copied" /> : <Copy size={12} />}
              </button>
            </div>
          </div>
        </section>

        {/* 引擎 2: 表面多视角重建引擎 */}
        <section className={`engine-card ${isReconReady ? 'status-ready' : 'status-missing'}`}>
          <div className="engine-card-top">
            <div className="engine-icon-wrap reconstruction">
              <Scan size={24} />
            </div>
            <div className="engine-meta">
              <div className="engine-title-row">
                <h4>多视角三维重建引擎</h4>
                <span className={`engine-badge ${isReconReady ? 'ready' : 'missing'}`}>
                  {isReconReady ? <CheckCircle2 size={12} /> : <AlertTriangle size={12} />}
                  {isReconReady ? '能力完备' : '基础模式'}
                </span>
              </div>
              <span className="engine-version-label">
                {reconstruction?.message || '根据实物照片提取特征点重构'}
              </span>
            </div>
          </div>

          <p className="engine-desc">
            处理取材角上传的多角度实物照片，通过稀疏特征点匹配解算相机姿态并重构稠密立体表面。
          </p>

          <div className="engine-specs-box">
            <div className="spec-row">
              <span>支持照片数量：</span>
              <strong>{reconstruction ? `${reconstruction.min_photos} ~ ${reconstruction.max_photos} 张照片` : '2 ~ 16 张'}</strong>
            </div>
            <div className="spec-row">
              <span>存储隔离原则：</span>
              <strong>原始扫描与网格独立留存</strong>
            </div>
          </div>
        </section>

        {/* 引擎 3: A1 mini 3D 打印切片制造引擎 */}
        <section className={`engine-card ${isSlicerReady ? 'status-ready' : 'status-missing'}`}>
          <div className="engine-card-top">
            <div className="engine-icon-wrap slicer">
              <Layers size={24} />
            </div>
            <div className="engine-meta">
              <div className="engine-title-row">
                <h4>A1 mini 3D 打印切片引擎</h4>
                <span className={`engine-badge ${isSlicerReady ? 'ready' : 'missing'}`}>
                  {isSlicerReady ? <CheckCircle2 size={12} /> : <AlertTriangle size={12} />}
                  {isSlicerReady ? '已配置' : '待配置'}
                </span>
              </div>
              <span className="engine-version-label">
                {slicer?.version ? `版本：${slicer.version}` : (slicer?.message || '制造切片环境检测中')}
              </span>
            </div>
          </div>

          <p className="engine-desc">
            针对拓扑网格进行分层解算、耗材挤出路径规划与 G-code 生成，为实体制造做好准备。
          </p>

          <div className="engine-specs-box">
            <div className="spec-row">
              <span>切片可执行文件：</span>
              <strong className="code-text" title={slicer?.executable || slicer?.message}>
                {slicer?.executable ? slicer.executable.split(/[/\\]/).pop() : '内置切片管道'}
              </strong>
            </div>
            <div className="spec-row">
              <span>物理安全隔离：</span>
              <strong>测试与预览严禁静默触发打印</strong>
            </div>
          </div>
        </section>
      </div>

      {/* 底部完整工具安装指南横幅 */}
      <div className="engines-guide-banner">
        <div className="guide-banner-content">
          <h4>💡 如何一键安装或更新工坊所有核心依赖？</h4>
          <p>
            Windows 用户在项目根目录运行 <code>安装建模工具.cmd</code>；Linux 用户运行 <code>./setup.sh</code>。安装完成后重新启动乌萨奇小屋，即可自动识别并接入所有引擎。
          </p>
        </div>
      </div>
    </div>
  );
}
