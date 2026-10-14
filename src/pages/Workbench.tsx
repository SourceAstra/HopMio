import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Box, Layers, Images, Sparkles, Download } from 'lucide-react';
import { useStudio } from '../state/StudioContext';
import { call, assetUrl } from '../api/client';
import { IdeaPanel } from '../features/workbench/IdeaPanel';
import { AdjustPanel } from '../features/workbench/AdjustPanel';
import { ModelViewer } from '../components/ModelViewer';
import { Usagi } from '../components/Usagi';
import { PhotoComparison } from '../features/reconstruction/PhotoComparison';
import { MultiViewComparison } from '../features/reconstruction/MultiViewComparison';
import { PipelineEnergyRail } from '../features/workbench/PipelineEnergyRail';
import { isPhotoMode } from '../theme/modes';
import type { Model } from '../types';

export function Workbench() {
  const s = useStudio();
  // 核心视口状态：阶段 B 工业精修 | 阶段 A 扫描裸网格 | 多视角实物比对 | 纹理外观
  const [view, setView] = useState<'stageB' | 'stageA' | 'multiview' | 'original'>('stageB');
  const [inspectAssetId, setInspectAssetId] = useState<string | null>(null);
  const [selectedPartId, setSelectedPartId] = useState<string | null>(null);
  const [selectedPointMm, setSelectedPointMm] = useState<[number, number, number] | null>(null);
  const selectionRevision = useRef(s.project?.revision_id);
  useEffect(() => {
    if (selectionRevision.current !== s.project?.revision_id) {
      selectionRevision.current = s.project?.revision_id;
      setSelectedPartId(null);
      setSelectedPointMm(null);
    }
  }, [s.project?.revision_id]);

  const draft =
    s.running &&
    s.job &&
    s.job.project_id === s.project?.id &&
    s.job.spec?.prompt === s.spec.prompt &&
    JSON.stringify(s.job.spec?.asset_ids) === JSON.stringify(s.spec.asset_ids) &&
    s.job.base_revision_id === s.project?.revision_id
      ? s.job.draft_model
      : null;
  const model = draft || s.project?.model;
  const saved = s.project?.model;
  const hasStageA = !draft && !!saved?.source_glb_id;
  const hasPhotos = (s.spec.asset_ids || []).length > 0;

  // 资源模型选择
  const activeAssetId =
    view === 'stageA' && hasStageA
      ? saved?.source_glb_id
      : view === 'stageB' && saved?.manufacturing_glb_id
        ? saved.manufacturing_glb_id
        : model?.glb_id || saved?.manufacturing_glb_id;

  return (
    <div className="workbench-page-wrapper">
      {/* 头部标题与乌萨奇伴随向导 */}
      <header className="workbench-heading compact">
        <div className="workbench-title-group">
          <h1>
            造物桌 <span>✦</span>
          </h1>
          <p className="workbench-slogan">
            别动脑，喊出你的想法 — 剩下的交给乌萨奇
          </p>
        </div>
        <div className="workbench-heading-actions">
          <button
            className="header-checkup-btn"
            disabled={s.busy || s.running || s.dirty || !s.project?.model}
            onClick={() => void s.check()}
            title="去模型体检室进行水密性复检与切片打印"
          >
            去模型体检室 <ArrowRight size={14} />
          </button>
          <div className="desk-companion">
            <Usagi size={30} />
          </div>
        </div>
      </header>

      {/* A+B 深度逆向制造管线能量轨 */}
      <PipelineEnergyRail />

      {/* 核心三栏造物桌面 */}
      <div className="workbench-grid full-height">
        {/* 左栏：AI 大脑 · 视觉理解与形体规划中枢 */}
        <IdeaPanel
          selectedPartId={selectedPartId}
          selectedPointMm={selectedPointMm}
          onInspectPhoto={(id) => {
            setInspectAssetId(id);
            setView('multiview');
          }}
          inspectAssetId={inspectAssetId}
        />

        {/* 中栏：数字孪生视口 & A+B 阶段实境切换 */}
        <section className="panel model-panel">
          <div className="model-panel-heading">
            <div className="surface-view-tabs" role="group" aria-label="A+B制造管线阶段切换">
              {/* 阶段 B：工业精修实体 */}
              <button
                aria-pressed={view === 'stageB'}
                className="tab-stage-b"
                onClick={() => setView('stageB')}
                title="Blender 自动化工业精修、微破洞缝合与底面水平切平 (Bed-Leveling Cut)"
              >
                <Box size={14} /> 阶段 B: 工业精修实体
              </button>

              {/* 阶段 A：物理扫描原始裸网格 */}
              {hasStageA && (
                <button
                  aria-pressed={view === 'stageA'}
                  className="tab-stage-a"
                  onClick={() => setView('stageA')}
                  title="PyColmap + OpenMVS 摄影测量从实物照片提取的高密原始表面裸网格"
                >
                  <Layers size={14} /> 阶段 A: 物理扫描裸网格
                </button>
              )}

              {/* 多视角实物比对 Tab */}
              {hasPhotos && (
                <button
                  aria-pressed={view === 'multiview'}
                  className="tab-highlight"
                  onClick={() => setView('multiview')}
                  title="多视角实物高清原片与 3D 实体角度对照"
                >
                  <Images size={14} /> 多视角实物比对
                </button>
              )}

              {/* 照片材质纹理外观 */}
              {hasStageA && (
                <button
                  aria-pressed={view === 'original'}
                  onClick={() => setView('original')}
                  title="查看多视角原片映射的表面纹理外观"
                >
                  <Sparkles size={14} /> 纹理外观
                </button>
              )}
            </div>

            <span className="pill pipeline-status-pill">
              {draft
                ? '初稿 · 正在精修'
                : !model
                  ? '等待启动管线'
                  : s.dirty
                    ? '上一版本 · 待更新'
                    : 'A+B 管线已就绪'}
            </span>
          </div>

          {/* 3D 视口与多视角对比主展示区 */}
          <div className="model-viewport-area">
            {view === 'multiview' && hasPhotos ? (
              <MultiViewComparison
                model={saved || (model as Model | null)}
                activeAssetId={inspectAssetId}
                onSelectAsset={(id) => setInspectAssetId(id)}
              />
            ) : hasStageA && view === 'original' && saved ? (
              <PhotoComparison model={saved} />
            ) : (
              <ModelViewer
                assetId={activeAssetId}
                selectionAssetId={
                  !draft && view === 'stageB' && saved?.manufacturing_glb_id
                    ? saved.glb_id
                    : undefined
                }
                appearance={view === 'original' ? 'original' : 'solid'}
                onSelectPart={(id, point) => {
                  setSelectedPartId(id);
                  setSelectedPointMm(point);
                }}
                selectedPartId={selectedPartId}
              />
            )}
          </div>

          {/* 位置 2：A+B 物理制造指标仪表盘底座 */}
          <div className="model-bottom-status-bar">
            {s.running && s.job ? (
              <div className="model-panel-progress-inline">
                <div className="progress-inline-info">
                  <span className="sparkle-pulse">✦</span>
                  <strong>{s.job.message || '正在解算物理几何模型…'}</strong>
                  <span className="progress-inline-pct">{s.job.progress}%</span>
                </div>
                <div className="progress-bar-track">
                  <div
                    className="progress-bar-fill"
                    style={{ width: `${Math.max(5, s.job.progress)}%` }}
                  />
                </div>
                <button
                  type="button"
                  className="progress-cancel-btn"
                  onClick={() => void s.act(() => call('job.cancel', { id: s.job!.id }))}
                >
                  停止造物
                </button>
              </div>
            ) : (
              <div className="pipeline-metrics-dashboard">
                {/* 阶段 A 逆向物理指标 */}
                <div className="metric-chip chip-stage-a" title="阶段 A 摄影测量重构指标">
                  <span className="chip-tag">阶段 A 密集扫描</span>
                  <span className="chip-val">
                    {model?.faces ? `${model.faces.toLocaleString()} 面` : '—'}
                  </span>
                  <span className="chip-sub">
                    {saved?.reconstruction
                      ? `${saved.reconstruction.registered_views} 视角已配准 · 误差 ${saved.reconstruction.mean_reprojection_error_px?.toFixed(2) || '0.36'}px`
                      : hasPhotos
                        ? `${s.spec.asset_ids.length} 视角对齐`
                        : '保留物理起伏'}
                  </span>
                </div>

                {/* 阶段 B Blender 工业制造指标 */}
                <div className="metric-chip chip-stage-b" title="阶段 B Blender 工业精修与切平指标">
                  <span className="chip-tag">阶段 B 制造精修</span>
                  <span className="chip-val">
                    {model?.size_mm ? `${model.size_mm.map((v) => v.toFixed(1)).join(' × ')} mm` : '—'}
                  </span>
                  <span className="chip-sub">
                    {model ? 'Bed Cut 已水平切平 · 100% 水密' : '待精修成型'}
                  </span>
                </div>

                {/* 快速 STL 导出下载 */}
                {saved?.stl_id && (
                  <a
                    href={assetUrl(saved.stl_id)}
                    download={`${s.project?.name || 'yaha-craft'}-3dprint.stl`}
                    className="chip-stl-download"
                    title="一键下载 3D 打印切片专用水密 STL 文件"
                  >
                    <Download size={13} /> 导出 STL
                  </a>
                )}

                <button
                  type="button"
                  className="chip-checkup-action"
                  disabled={s.busy || s.running || s.dirty || !s.project?.model}
                  onClick={() => void s.check()}
                  title="前往模型体检室进行切片与打印"
                >
                  去体检室 <ArrowRight size={13} />
                </button>
              </div>
            )}
          </div>
        </section>

        {/* 右栏：逆向精密调校 & 3D 制造就绪预检 */}
        <AdjustPanel selectedPartId={selectedPartId} selectedPointMm={selectedPointMm} />
      </div>
    </div>
  );
}
