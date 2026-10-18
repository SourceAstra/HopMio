import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Box, Layers, Images, Sparkles, Download, Clock3, Printer, PanelRightClose, PanelRightOpen } from 'lucide-react';
import { useStudio } from '../state/StudioContext';
import { isModelDraft, isGeometryOnly, reconstructionReport } from '../features/modeling/quality';
import { GeometryReviewNotice } from '../features/modeling/GeometryReviewNotice';
import { call, assetUrl, download } from '../api/client';
import { IdeaPanel } from '../features/workbench/IdeaPanel';
import { AdjustPanel } from '../features/workbench/AdjustPanel';
import { History } from '../features/projects/History';
import { ModelViewer } from '../components/ModelViewer';
import { Usagi } from '../components/Usagi';
import { PhotoComparison } from '../features/reconstruction/PhotoComparison';
import { MultiViewComparison } from '../features/reconstruction/MultiViewComparison';
import { PipelineEnergyRail } from '../features/workbench/PipelineEnergyRail';
import { isPhotoMode, providerForMode } from '../theme/modes';
import { WorkbenchHeader } from '../features/workbench/WorkbenchHeader';
import { WorkbenchStagePlaceholder } from '../features/workbench/WorkbenchStagePlaceholder';
import { HeroCraftHome } from '../features/workbench/HeroCraftHome';
import { CraftLaunchModal, type LaunchParams } from '../features/workbench/CraftLaunchModal';
import type { Model, Asset, Mode, Spec } from '../types';
import { isImageAsset } from '../features/materials/folders';

export function Workbench() {
  const s = useStudio();
  const photoIds = s.spec.asset_ids.filter((id) => isImageAsset(s.assets.find((asset) => asset.id === id)));
  const hasPhotos = photoIds.length > 0;

  // 核心视口状态：阶段 B 工业精修 | 阶段 A 扫描裸网格 | 多视角实物比对 | 纹理外观
  const [view, setView] = useState<'stageB' | 'stageA' | 'multiview' | 'original'>('stageB');

  const [inspectAssetId, setInspectAssetId] = useState<string | null>(null);
  const [selectedPartId, setSelectedPartId] = useState<string | null>(null);
  const [selectedPointMm, setSelectedPointMm] = useState<[number, number, number] | null>(null);
  const [inspectStage, setInspectStage] = useState<number | null>(() => window.innerWidth > 1400 ? 2 : null);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [activePane, setActivePane] = useState<'model' | 'chat' | 'parameters'>('model');

  // 3D 视口抽屉状态：默认在首页大聊天框时收起，当推演中或用户点击浮标时呼出
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  const selectionRevision = useRef(s.project?.revision_id);
  const prevRunningRef = useRef(s.running);

  // 监听实体生成生命周期：当任务运行时自动展开 3D 抽屉以便用户实时查看
  useEffect(() => {
    if (s.running) {
      setIsDrawerOpen(true);
    }
  }, [s.running]);

  // 监听返回首页事件 (点击 Logo 时一键收起 3D 抽屉回到纯净大聊天框)
  useEffect(() => {
    const handleResetHome = () => {
      setIsDrawerOpen(false);
    };
    window.addEventListener('yaha-reset-home', handleResetHome);
    return () => window.removeEventListener('yaha-reset-home', handleResetHome);
  }, []);

  // 监听实体生成生命周期：当实体生成完成时，若有参考照片，默认自动切换为多视角实物对比视角
  useEffect(() => {
    if (prevRunningRef.current && !s.running && hasPhotos) {
      setView('multiview');
    }
    prevRunningRef.current = s.running;
  }, [s.running, hasPhotos]);

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
  const scan = reconstructionReport(saved, s.job?.project_id === s.project?.id ? s.job : null);
  const hasStageA = !draft && !!saved?.source_glb_id;

  // 资源模型选择：优先选用 Blender 水密精修制造实体 saved?.manufacturing_glb_id，确保模型真实展现
  const activeAssetId =
    view === 'stageA' && hasStageA
      ? saved?.source_glb_id
      : draft?.glb_id || saved?.manufacturing_glb_id || model?.glb_id || saved?.glb_id;

  // 首页造物启程过渡卡状态 (命名与任务感知仲裁)
  const [launchModalOpen, setLaunchModalOpen] = useState(false);
  const [launchParams, setLaunchParams] = useState<LaunchParams | null>(null);

  // 从首页大聊天框发起造物 -> 呼出造物启程过渡卡 (不直接硬切，给用户命名与冲突感知)
  const handleStartCraftFromHome = (params: LaunchParams) => {
    setLaunchParams(params);
    setLaunchModalOpen(true);
  };

  // 用户在过渡卡确认开启新造物 (必定创建新作品，且直达造物桌自动开工)
  const handleConfirmLaunch = async (finalProjectName: string) => {
    if (!launchParams) return;

    // 1. 若当前后台正有旧任务，先终止旧任务
    if (s.running && s.job) {
      await s.cancelCurrentJob();
    }

    // 2. 构筑全新干净的造物 Spec
    const nextSpec: Spec = {
      ...s.spec,
      mode: launchParams.mode,
      prompt: launchParams.prompt,
      asset_ids: launchParams.assetIds,
      provider: providerForMode(launchParams.mode),
    };
    s.setSpec(nextSpec);

    // 3. 首页发起的，必定是发起一个新作品
    const newProject = await s.create(nextSpec, finalProjectName);

    // 4. 关闭过渡卡，打开 3D 抽屉
    setLaunchModalOpen(false);
    setIsDrawerOpen(true);

    // 5. 立即开启造物雕刻流程 (直接触发生成，进入造物桌直接开工，无需二次回车)
    if (newProject?.id) {
      await s.generate(undefined, nextSpec, newProject.id);
    }
  };

  // 用户在过渡卡选择取消本次，继续查看当前已有雕刻
  const handleInspectCurrentJob = async () => {
    setLaunchModalOpen(false);
    await s.continueCurrentJob();
    setIsDrawerOpen(true);
  };

  // 若 3D 抽屉收起，渲染首页大聊天框 (对齐 Mint 标杆)
  if (!isDrawerOpen) {
    return (
      <div className="workbench-page-wrapper home-chat-mode">
        <HeroCraftHome
          onStartCraft={handleStartCraftFromHome}
          onOpen3DDrawer={() => setIsDrawerOpen(true)}
          hasModel={Boolean(model)}
          isRunning={Boolean(s.running)}
        />
        {/* 首页造物启程过渡卡 (新作品命名 + 正在造物感知与冲突仲裁) */}
        {launchParams && (
          <CraftLaunchModal
            isOpen={launchModalOpen}
            params={launchParams}
            onClose={() => setLaunchModalOpen(false)}
            onConfirmLaunch={handleConfirmLaunch}
            onInspectCurrentJob={handleInspectCurrentJob}
            mockConflict={Boolean((window as any).__showMockConflict)}
          />
        )}
        {/* 历史版本时光机弹窗 */}
        {showHistoryModal && s.project && (
          <History
            project={s.project}
            onClose={() => setShowHistoryModal(false)}
            onSelected={() => setShowHistoryModal(false)}
          />
        )}
      </div>
    );
  }

  return (
    <div className="workbench-page-wrapper drawer-3d-active">
      {/* 1. 顶部工坊主控台身份卡与快捷动作 */}
      <WorkbenchHeader
        projectName={s.project?.name || '无标题造物工程'}
        mode={s.spec.mode}
        isDirty={s.dirty}
        isRunning={s.running}
        isBusy={s.busy}
        revisionCount={s.project?.revision_count || 1}
        hasModel={!!s.project?.model}
        onRename={(newName) => {
          if (s.project) {
            void s.updateProject(s.project.id, { name: newName });
          }
        }}
        onCreateNew={() => s.openNewProject()}
        onGoToPrint={() => s.setRoom('print')}
        onOpenHistory={() => setShowHistoryModal(true)}
        onExportLocal={(format) => {
          if (!s.project) return;
          void s.act(async () => {
            const asset = await call<Asset>('project.export', { id: s.project!.id, format });
            const filename = s.project!.name + (format === 'usagi' ? '.usagi' : '.' + format);
            const res = await download(asset.id, filename);
            if (res?.saved) {
              s.setNotice(`已成功将 ${filename} 保存到您的本地设备！`);
            }
          });
        }}
      />

      {/* A+B 深度逆向制造管线能量轨 */}
      <details className="workbench-pipeline-details">
        <summary>{s.running ? s.job?.message || '正在造物…' : '造物进度与技术详情'}</summary>
        <PipelineEnergyRail activeStage={inspectStage} onSelectStage={(stage) => { setInspectStage(stage); setActivePane('parameters'); }} />
      </details>
      <nav className="workbench-mobile-tabs" aria-label="造物桌工作区">
        <button aria-pressed={activePane === 'model'} onClick={() => { setActivePane('model'); setInspectStage(null); }}>模型</button>
        <button aria-pressed={activePane === 'chat'} onClick={() => { setActivePane('chat'); setInspectStage(null); }}>对话</button>
        <button aria-pressed={activePane === 'parameters'} onClick={() => { setInspectStage(2); setActivePane('parameters'); }}>参数</button>
      </nav>

      {/* 核心造物桌面：左侧对话微调中枢 + 右侧呼出式 3D 抽屉面板 */}
      <div
        data-active-pane={activePane}
        className={`workbench-grid full-height with-slide-drawer ${inspectStage !== null ? 'with-stage-drawer' : ''}`}
      >
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

        {/* 右栏抽屉：数字孪生 3D 视口 & 阶段实境 */}
        <section className="panel model-panel slide-out-drawer">
          <div className="model-panel-heading">
            <div className="surface-view-tabs" role="group" aria-label="A+B制造管线阶段切换">
              {/* 收起 3D 视口按钮 */}
              <button
                type="button"
                className="drawer-close-toggle-btn"
                onClick={() => setIsDrawerOpen(false)}
                title="收起 3D 视口，返回极简大聊天框"
              >
                <PanelRightClose size={14} />
                <span>收起 3D</span>
              </button>

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

            {/* 顶栏右侧元信息：管线就绪药丸 + 收纳进来的版本胶囊切换 */}
            <div className="model-panel-heading-meta">
              <span className="pill pipeline-status-pill">
                {draft
                  ? '初稿 · 正在精修'
                  : !model
                    ? '等待启动管线'
                    : s.dirty
                      ? '上一版本 · 待更新'
                      : isGeometryOnly(saved)
                        ? '几何已更新 · 外观待确认'
                        : isModelDraft(saved)
                          ? '待改进草稿 · 未通过造型审阅'
                          : saved?.photo_fidelity?.status === 'observed_surface'
                            ? '观测表面已恢复 · 待实物核对'
                            : '制造模型已生成'}
              </span>

              {s.project && (
                <button
                  type="button"
                  className="model-version-trigger-pill"
                  onClick={() => setShowHistoryModal(true)}
                  title="点击查看历史版本时光机、切换版本或删除版本"
                >
                  <Clock3 size={13} className="version-pill-icon" />
                  <span className="version-pill-label">版本</span>
                  <span className="version-pill-count">
                    {s.project.revision_count ? `${s.project.revision_count}版` : 'v1'}
                  </span>
                  <span className="version-pill-arrow">▾</span>
                </button>
              )}
            </div>
          </div>

          {/* 3D 视口与多视角对比主展示区 */}
          <div className="model-viewport-area">
            {!activeAssetId ? (
              <WorkbenchStagePlaceholder
                isRunning={Boolean(s.running && s.job)}
                job={s.job}
                photoAssetIds={photoIds}
                prompt={s.spec.prompt}
                mode={s.spec.mode}
                onFillPrompt={(text) => s.setSpec({ ...s.spec, prompt: text })}
                onGoToMaterials={() => s.setRoom('materials')}
              />
            ) : view === 'multiview' && hasPhotos ? (
              <MultiViewComparison
                model={saved || (model as Model | null)}
                modelAssetId={activeAssetId}
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
          {!draft && <GeometryReviewNotice model={saved} />}
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
                  onClick={() => void s.cancelCurrentJob()}
                >
                  停止造物
                </button>
              </div>
            ) : (
              <div className="pipeline-metrics-dashboard">
                {/* 阶段 A 逆向物理指标 */}
                <div className="metric-chip chip-stage-a" title="阶段 A 摄影测量重构指标">
                  <span className="chip-tag">
                    {scan
                      ? '阶段 A 表面重建'
                      : s.spec.provider === 'reconstruction'
                        ? '等待表面重建'
                        : '参数几何模型'}
                  </span>
                  <span className="chip-val">
                    {typeof scan?.dense_points === 'number'
                      ? `${scan.dense_points.toLocaleString()} 稠密点`
                      : scan?.source_faces
                        ? `${scan.source_faces.toLocaleString()} 扫描面`
                        : model?.faces
                          ? `${model.faces.toLocaleString()} 面`
                          : '—'}
                  </span>
                  <span className="chip-sub">
                    {scan
                      ? `${scan.registered_views}/${scan.input_views} 视角配准 · 误差 ${scan.mean_reprojection_error_px?.toFixed(2) ?? '未提供'}px`
                      : hasPhotos
                        ? `${s.spec.asset_ids.length} 张参考照片 · 视角包含估计`
                        : '文字参数设计 · 无实物扫描'}
                  </span>
                </div>

                {/* 阶段 B Blender 工业制造指标 */}
                <div className="metric-chip chip-stage-b" title="阶段 B Blender 工业精修与切平指标">
                  <span className="chip-tag">阶段 B 制造精修</span>
                  <span className="chip-val">
                    {model?.size_mm
                      ? `${model.size_mm.map((v) => v.toFixed(1)).join(' × ')} mm`
                      : '—'}
                  </span>
                  <span className="chip-sub">
                    {model
                      ? isModelDraft(saved)
                        ? '造型审阅未通过 · 待改进草稿'
                        : s.project?.validation?.can_prepare
                          ? '制造体检已通过'
                          : '模型已生成 · 待制造体检'
                      : '待精修成型'}
                  </span>
                </div>

                {/* 快速 STL 导出下载到用户侧设备 */}
                {saved?.stl_id && (
                  <button
                    type="button"
                    className="chip-stl-download"
                    title="一键下载 3D 打印水密 STL 文件到本地设备"
                    onClick={() => {
                      void download(saved.stl_id, `${s.project?.name || 'yaha-craft'}-3dprint.stl`).then((res) => {
                        if (res?.saved) s.setNotice('STL 模型已成功保存到您的本地设备！');
                      });
                    }}
                  >
                    <Download size={13} /> 导出 STL
                  </button>
                )}

                <button
                  type="button"
                  className="chip-checkup-action"
                  disabled={s.busy || s.running || s.dirty || !s.project?.model}
                  onClick={() => s.setRoom('print')}
                  title="前往打印制造站进行切片与实机打印"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}
                >
                  <Printer size={13} />
                  <span>去打印</span>
                  <ArrowRight size={13} />
                </button>
              </div>
            )}
          </div>
        </section>

        {/* 右栏抽屉：点击顶部管线阶段节点时展开检视与微调，平时隐藏 */}
        {inspectStage !== null && (
          <AdjustPanel
            key={s.project?.id}
            selectedPartId={selectedPartId}
            selectedPointMm={selectedPointMm}
            activeStage={inspectStage}
            onClose={() => { setInspectStage(null); setActivePane('model'); }}
          />
        )}
      </div>

      {/* 历史版本时光机弹窗：由 3D 实体位置区域的版本胶囊直接唤起 */}
      {showHistoryModal && s.project && (
        <History
          project={s.project}
          onClose={() => setShowHistoryModal(false)}
          onSelected={() => setShowHistoryModal(false)}
        />
      )}
    </div>
  );
}
