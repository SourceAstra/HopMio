import { useState, useMemo, useRef } from 'react';
import { useStudio } from '../state/StudioContext';
import { MaterialsHero } from '../features/materials/MaterialsHero';
import { Upload } from '../features/materials/Upload';
import { AssetCard } from '../features/materials/AssetCard';
import { FolderTabBar, type FolderViewMode } from '../features/materials/FolderTabBar';
import { FolderDrawerSection } from '../features/materials/FolderDrawerSection';
import { CreateFolderModal } from '../features/materials/CreateFolderModal';
import { MoveFolderModal } from '../features/materials/MoveFolderModal';
import { BatchActionBar } from '../features/materials/BatchActionBar';
import { MaterialsEmptyState } from '../features/materials/MaterialsEmptyState';
import { PhotoPreviewModal } from '../features/materials/PhotoPreviewModal';
import { useMarqueeSelection } from '../features/materials/useMarqueeSelection';
import { call } from '../api/client';
import {
  BUILT_IN_FOLDERS,
  resolveAssetFolderId,
  getFolderMeta,
  isShelfMaterial,
  isModelAsset,
  isImageAsset,
  type MaterialFolder,
} from '../features/materials/folders';
import { FolderKanban } from 'lucide-react';
import type { Asset } from '../types';
import { selectMaterials } from '../features/materials/selection';
import '../styles/materials.css';

export function Materials() {
  const s = useStudio();
  const shelfContainerRef = useRef<HTMLElement>(null);

  // 1. 自定义文件夹与分类映射持久化状态
  const customFolders = s.materialLibrary.folders;
  const assetFolderMap = s.materialLibrary.assignments;

  // 统合所有可用文件夹（内置 + 自定义）
  const allFolders = useMemo(() => {
    return [...BUILT_IN_FOLDERS, ...customFolders];
  }, [customFolders]);

  // 2. 文件夹导航与视图状态
  const [activeFolderId, setActiveFolderId] = useState<string>('all');
  const [viewMode, setViewMode] = useState<FolderViewMode>('tab');
  const [searchQuery, setSearchQuery] = useState('');

  // 3. 模态弹窗与批量操作状态
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [movingAsset, setMovingAsset] = useState<Asset | null>(null);
  const [isBatchMoveModalOpen, setIsBatchMoveModalOpen] = useState(false);
  const [previewAsset, setPreviewAsset] = useState<Asset | null>(null);

  // 4. 纯净素材清单（按添加顺序排列，执行语义清洗，不与当前 3D 工程 spec 绑定）
  const orderedAssets = useMemo(() => {
    const list = [...s.assets];
    const seen = new Set<string>();
    return list.filter((a) => {
      // 依第一性原理过滤非素材（排除.blend源工程、内部清单及生成的重复成品模型）
      if (!isShelfMaterial(a)) return false;

      const key = `${a.kind}:${a.sha256}`;
      const duplicate = seen.has(key);
      seen.add(key);
      return !duplicate;
    });
  }, [s.assets]);

  // 5. 为每份素材计算归属文件夹（单一真实源 SSOT）
  const assetResolvedFolderMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const asset of orderedAssets) {
      map[asset.id] = resolveAssetFolderId(asset, assetFolderMap, allFolders);
    }
    return map;
  }, [orderedAssets, assetFolderMap, allFolders]);

  // 快速通过素材 ID 索引文件夹对象
  const folderMetaMap = useMemo(() => {
    const map: Record<string, MaterialFolder> = {};
    for (const asset of orderedAssets) {
      const folderId = assetResolvedFolderMap[asset.id] || 'photos';
      map[asset.id] = getFolderMeta(folderId, allFolders);
    }
    return map;
  }, [orderedAssets, assetResolvedFolderMap, allFolders]);

  // 6. 搜索过滤后的素材集合
  const searchMatchedAssets = useMemo(() => {
    if (!searchQuery.trim()) return orderedAssets;
    const q = searchQuery.toLowerCase();
    return orderedAssets.filter((a) => {
      const matchName = a.name.toLowerCase().includes(q);
      const matchExt = a.extension.toLowerCase().includes(q);
      const folderName = folderMetaMap[a.id]?.name.toLowerCase().includes(q);
      return matchName || matchExt || folderName;
    });
  }, [orderedAssets, searchQuery, folderMetaMap]);

  // 7. 计算每个分类文件夹的素材数量
  const folderCounts = useMemo(() => {
    const counts: Record<string, number> = { all: searchMatchedAssets.length };
    for (const folder of allFolders) {
      if (folder.id !== 'all') {
        counts[folder.id] = 0;
      }
    }
    for (const asset of searchMatchedAssets) {
      const fId = assetResolvedFolderMap[asset.id];
      if (fId && counts[fId] !== undefined) {
        counts[fId]++;
      }
    }
    return counts;
  }, [allFolders, searchMatchedAssets, assetResolvedFolderMap]);

  // 8. 当前视图内可见的素材列表
  const activeTabAssets = useMemo(() => {
    if (activeFolderId === 'all') {
      return searchMatchedAssets;
    }
    return searchMatchedAssets.filter((a) => assetResolvedFolderMap[a.id] === activeFolderId);
  }, [searchMatchedAssets, activeFolderId, assetResolvedFolderMap]);

  const visibleAssets = useMemo(() => {
    return viewMode === 'cabinet' && activeFolderId === 'all'
      ? searchMatchedAssets
      : activeTabAssets;
  }, [viewMode, activeFolderId, searchMatchedAssets, activeTabAssets]);

  const visibleAssetIds = useMemo(() => visibleAssets.map((a) => a.id), [visibleAssets]);

  // 9. 鼠标框选 / 拉选 / 连选核心 Hook（用于批量收纳与清理）
  const {
    selectedIds: batchSelectedIds,
    marqueeRect,
    toggleSelect: toggleBatchSelect,
    handleRangeSelect,
    selectAll,
    clearSelection,
    invertSelection,
  } = useMarqueeSelection({
    containerRef: shelfContainerRef,
    allAssetIds: visibleAssetIds,
  });

  // 创建新分类文件夹
  const handleCreateFolder = (newFolder: MaterialFolder) => {
    void s.act(async () => {
      await s.saveMaterials((current) => ({ ...current, folders: [...current.folders, newFolder] }));
      setActiveFolderId(newFolder.id);
      s.setNotice(`已创建「${newFolder.name}」收纳夹。`);
    });
  };

  // 删除自定义文件夹
  const handleDeleteFolder = (folderId: string) => {
    void s.act(async () => {
      await s.saveMaterials((current) => ({ ...current, folders: current.folders.filter((folder) => folder.id !== folderId), assignments: Object.fromEntries(Object.entries(current.assignments).filter(([, id]) => id !== folderId)) }));
      if (activeFolderId === folderId) setActiveFolderId('all');
      s.setNotice('分类已删除，素材保留在默认分类。');
    });
  };

  // 移动素材至目标文件夹
  const handleMoveAsset = (assetId: string, targetFolderId: string) => {
    void s.act(async () => {
      await s.saveMaterials((current) => ({ ...current, assignments: { ...current.assignments, [assetId]: targetFolderId } }));
      s.setNotice(`已放入「${getFolderMeta(targetFolderId, allFolders).name}」。`);
    });
  };

  // 批量移动所选素材
  const handleConfirmBatchMove = (targetFolderId: string) => {
    if (!batchSelectedIds.length) return;
    void s.act(async () => {
      await s.saveMaterials((current) => ({ ...current, assignments: { ...current.assignments, ...Object.fromEntries(batchSelectedIds.map((id) => [id, targetFolderId])) } }));
      clearSelection();
      setIsBatchMoveModalOpen(false);
      s.setNotice('所选素材已移入收纳夹。');
    });
  };

  // 批量删除所选素材
  const handleBatchDelete = async (ids: string[]) => {
    if (!ids.length || s.busy) return;

    const count = ids.length;
    if (
      !window.confirm(
        `从素材架移除选中的 ${count} 份素材？作品与历史版本中的引用将保留。`,
      )
    ) {
      return;
    }

    await s.act(async () => {
      const removed = new Set<string>();
      const failures: string[] = [];
      for (const id of ids) {
        try {
          await call('asset.delete', { id });
          removed.add(id);
        } catch (e) {
          failures.push((e as Error).message);
        }
      }

      s.setAssets((old) => old.map((asset) => removed.has(asset.id) ? { ...asset, archived: true } : asset));

      clearSelection();
      s.setNotice(`已移除 ${removed.size}/${count} 份素材。${failures.length ? failures[0] : '历史引用保留。'}`);
    });
  };

  // 围绕某份素材立项全新造物工程（通过过度页，隔离保护已有工程）
  const handleStartProjectWithAsset = (asset: Asset) => {
    const isModel = isModelAsset(asset);
    const targetMode = isModel ? 'import' : 'image';
    const nameBase = asset.name.replace(/\.[^/.]+$/, '');
    s.openNewProject({
      mode: targetMode,
      asset_ids: [asset.id],
      defaultName: `围绕「${nameBase}」造物`,
    });
  };

  // 围绕多选的素材批量立项全新造物工程
  const handleBatchStartProject = () => {
    if (!batchSelectedIds.length) return;
    const selected = s.assets.filter((asset) => batchSelectedIds.includes(asset.id));
    const models = selected.filter(isModelAsset);
    if (models.length && (models.length !== 1 || selected.length !== 1)) {
      s.setNotice('模型导入一次选择一个文件；照片请单独选为一组。');
      return;
    }
    const targetMode = models.length ? 'import' : selected.length >= (s.preferences?.reconstruction?.min_photos || 3) ? 'multiview' : 'image';
    s.openNewProject({
      mode: targetMode,
      asset_ids: [...batchSelectedIds],
      defaultName: models.length ? '导入模型作品' : `照片作品 · ${batchSelectedIds.length}张照片`,
    });
  };

  const addToCurrentProject = () => {
    if (!s.project) return;
    const photos = batchSelectedIds.filter((id) => isImageAsset(s.assets.find((asset) => asset.id === id)));
    if (photos.length !== batchSelectedIds.length) {
      s.setNotice('加入当前作品的参考材料请选择照片；模型文件请通过新建导入。');
      return;
    }
    const ids = [...new Set([...s.spec.asset_ids.filter((id) => isImageAsset(s.assets.find((asset) => asset.id === id))), ...photos])];
    const limit = ['silhouette', 'relief'].includes(s.spec.mode) ? 1 : 96;
    if (ids.length > limit) { s.setNotice(`当前方式最多选 ${limit} 张，请先在造物桌移除旧图。`); return; }
    s.setSpec((old) => selectMaterials(old, ids));
    clearSelection();
    s.setRoom('desk');
    s.setNotice('参考照片已加入当前作品，原模型与版本保留。');
  };

  const currentFolderMeta = getFolderMeta(activeFolderId, allFolders);

  return (
    <div className="materials-page-container">
      {/* 1. 顶部乌萨奇工坊素材库展台 */}
      <MaterialsHero
        totalShelfCount={searchMatchedAssets.length}
        folderCount={allFolders.filter((f) => f.id !== 'all').length}
      />

      {/* 2. 拖拽与点击上传卡片（添加素材） */}
      <section className="materials-upload-section">
        <Upload />
      </section>

      {/* 3. 素材架主展台与分类文件夹管理（提取与整理素材） */}
      <section className="materials-shelf-section" ref={shelfContainerRef}>
        {/* 素材架标题栏 */}
        <div className="shelf-header-row">
          <div className="shelf-title-wrap">
            <FolderKanban size={20} className="shelf-icon" />
            <h3>素材灵感架</h3>
            <span className="shelf-counter">
              共 <strong>{searchMatchedAssets.length}</strong> 份素材 · 支持按住鼠标左键<strong>拉选/框选</strong>多选
            </span>
          </div>
        </div>

        {/* 分类文件夹导航栏与视图切换工具 */}
        <FolderTabBar
          folders={allFolders}
          activeFolderId={activeFolderId}
          onSelectFolder={(id) => {
            setActiveFolderId(id);
            clearSelection();
          }}
          folderCounts={folderCounts}
          onOpenCreateModal={() => setIsCreateModalOpen(true)}
          onDeleteCustomFolder={handleDeleteFolder}
          viewMode={viewMode}
          onChangeViewMode={(mode) => {
            setViewMode(mode);
            clearSelection();
          }}
          searchQuery={searchQuery}
          onSearchChange={(q) => {
            setSearchQuery(q);
            clearSelection();
          }}
          disabled={s.busy}
        />

        {/* 4. 内容展现区域：单文件夹聚焦视图 VS 分类抽屉柜视图 */}
        {viewMode === 'cabinet' && activeFolderId === 'all' ? (
          /* === 抽屉收纳柜视图（全部文件夹分区分块展示） === */
          <div className="folder-cabinet-view">
            {allFolders
              .filter((f) => f.id !== 'all')
              .map((folder) => {
                const folderAssets = searchMatchedAssets.filter(
                  (a) => assetResolvedFolderMap[a.id] === folder.id,
                );
                // 仅展示有素材的文件夹或自定义文件夹
                if (folderAssets.length === 0 && folder.isBuiltIn) return null;

                return (
                  <FolderDrawerSection
                    key={folder.id}
                    folder={folder}
                    assets={folderAssets}
                    batchSelectedIds={batchSelectedIds}
                    folderMetaMap={folderMetaMap}
                    disabled={s.busy}
                    onDeleteAsset={(id) => void s.deleteAsset(id)}
                    onPreviewAsset={(asset) => setPreviewAsset(asset)}
                    onMoveAsset={(asset) => setMovingAsset(asset)}
                    onStartProjectAsset={handleStartProjectWithAsset}
                    onFocusFolder={(id) => {
                      setActiveFolderId(id);
                      setViewMode('tab');
                      clearSelection();
                    }}
                    onToggleBatchSelect={(id, e) => {
                      if (e.shiftKey) {
                        handleRangeSelect(id, visibleAssetIds);
                      } else {
                        toggleBatchSelect(id);
                      }
                    }}
                  />
                );
              })}

            {searchMatchedAssets.length === 0 && (
              <MaterialsEmptyState
                isFiltered={Boolean(searchQuery)}
                onResetFilter={() => setSearchQuery('')}
              />
            )}
          </div>
        ) : (
          /* === 单分类文件夹聚焦视图 === */
          <div className="folder-tab-focus-view">
            {/* 当前选中分类的状态标头 */}
            {activeFolderId !== 'all' && (
              <div className={`active-folder-banner scheme-${currentFolderMeta.colorScheme}`}>
                <div className="folder-banner-visual">
                  <span className="folder-banner-emoji" aria-hidden="true">
                    {currentFolderMeta.emoji}
                  </span>
                </div>
                <div className="folder-banner-meta">
                  <div className="folder-banner-title-row">
                    <h4>{currentFolderMeta.name}</h4>
                    <span className="folder-banner-count-pill">
                      <strong>{activeTabAssets.length}</strong> 份素材
                    </span>
                  </div>
                  <p className="folder-banner-desc">{currentFolderMeta.description}</p>
                </div>
              </div>
            )}

            {activeTabAssets.length > 0 ? (
              <div className="asset-grid modern-grid">
                {activeTabAssets.map((asset) => {
                  const isBatch = batchSelectedIds.includes(asset.id);

                  return (
                    <AssetCard
                      key={asset.id}
                      asset={asset}
                      folderMeta={folderMetaMap[asset.id]}
                      disabled={s.busy}
                      isBatchSelected={isBatch}
                      onDelete={() => void s.deleteAsset(asset.id)}
                      onPreview={() => setPreviewAsset(asset)}
                      onMoveFolder={() => setMovingAsset(asset)}
                      onStartProject={() => handleStartProjectWithAsset(asset)}
                      onToggleBatchSelect={(e) => {
                        if (e.shiftKey) {
                          handleRangeSelect(asset.id, visibleAssetIds);
                        } else {
                          toggleBatchSelect(asset.id);
                        }
                      }}
                    />
                  );
                })}
              </div>
            ) : (
              <MaterialsEmptyState
                isFiltered={Boolean(searchQuery || activeFolderId !== 'all')}
                onResetFilter={() => {
                  setSearchQuery('');
                  setActiveFolderId('all');
                }}
              />
            )}
          </div>
        )}

        {/* 鼠标框选拉选矩形覆盖层 */}
        {marqueeRect && (
          <div
            className="marquee-selection-box"
            style={{
              left: `${marqueeRect.left}px`,
              top: `${marqueeRect.top}px`,
              width: `${marqueeRect.width}px`,
              height: `${marqueeRect.height}px`,
            }}
          />
        )}
      </section>

      {/* 5. 批量管理悬浮动作条（用于框选后批量移入收纳夹或批量删除） */}
      <BatchActionBar
        selectedCount={batchSelectedIds.length}
        totalVisibleCount={visibleAssetIds.length}
        onSelectAll={() => selectAll(visibleAssetIds)}
        onInvert={() => invertSelection(visibleAssetIds)}
        onClear={clearSelection}
        onBatchStartProject={handleBatchStartProject}
        onAddToProject={s.project ? addToCurrentProject : undefined}
        onBatchDelete={() => void handleBatchDelete(batchSelectedIds)}
        onBatchMove={() => setIsBatchMoveModalOpen(true)}
        disabled={s.busy}
      />

      {/* 6. 大图全屏查看与素材提取弹窗 */}
      <PhotoPreviewModal
        asset={previewAsset}
        onClose={() => setPreviewAsset(null)}
        onStartProject={handleStartProjectWithAsset}
      />

      {/* 7. 新建分类文件夹弹窗 */}
      <CreateFolderModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onCreate={handleCreateFolder}
      />

      {/* 8. 移动单个/批量素材到分类文件夹弹窗 */}
      <MoveFolderModal
        asset={movingAsset}
        batchCount={isBatchMoveModalOpen ? batchSelectedIds.length : undefined}
        isOpen={Boolean(movingAsset) || isBatchMoveModalOpen}
        onClose={() => {
          setMovingAsset(null);
          setIsBatchMoveModalOpen(false);
        }}
        folders={allFolders}
        currentFolderId={
          movingAsset ? assetResolvedFolderMap[movingAsset.id] || 'photos' : ''
        }
        onSelectTargetFolder={(targetFolderId) => {
          if (isBatchMoveModalOpen) {
            handleConfirmBatchMove(targetFolderId);
          } else if (movingAsset) {
            handleMoveAsset(movingAsset.id, targetFolderId);
          }
        }}
        onOpenCreateFolder={() => setIsCreateModalOpen(true)}
      />
    </div>
  );
}
