import { ChevronDown, MoreHorizontal, PencilLine, Trash2, Trophy, Printer, BookOpen, Armchair, Download, Package } from 'lucide-react';
import { ModelViewer } from '../../components/ModelViewer';
import { useStudio } from '../../state/StudioContext';
import { call, download } from '../../api/client';
import type { Project, Asset } from '../../types';

export function ProjectCard({
  project,
  featured = false,
  onFeature,
  onVersions,
  onStory,
}: {
  project: Project;
  featured?: boolean;
  onFeature?: () => void;
  onVersions: () => void;
  onStory: () => void;
}) {
  const s = useStudio();
  const modelId = project.model?.manufacturing_glb_id || project.model?.glb_id;

  const handlePreviewClick = () => {
    if (onFeature) {
      onFeature();
    } else {
      s.adopt(project);
      s.setRoom('desk');
    }
  };

  return (
    <article className={`collection-card ${featured ? 'is-featured' : ''}`}>
      {/* 3D 展台悬浮视口 */}
      <div className="card-podium-wrap">
        <button
          className="collection-card-preview"
          onClick={handlePreviewClick}
          aria-label={`查看并编辑${project.name}`}
          aria-pressed={featured}
        >
          {modelId ? (
            <ModelViewer key={modelId} assetId={modelId} compact transparent />
          ) : (
            <div className="collection-card-empty-prompt">
              <span className="card-empty-icon">🌱</span>
              <span>还在酝酿的小小想法</span>
            </div>
          )}
        </button>

        {/* 展品与打印徽章 */}
        <div className="card-floating-badges">
          {project.exhibited && (
            <span className="badge-exhibited">
              <Trophy size={11} />
              <span>展品</span>
            </span>
          )}

          {project.printed && (
            <span className="badge-printed">
              <Printer size={11} />
              <span>实物已制成</span>
            </span>
          )}
        </div>
      </div>

      <div className="collection-card-body">
        {/* 标题与更多菜单 */}
        <div className="collection-card-title">
          <h2 title={project.name}>{project.name}</h2>
          <details className="collection-card-menu">
            <summary aria-label={`${project.name}的更多操作`}>
              <MoreHorizontal size={18} />
            </summary>
            <div>
              <button onClick={onStory}>
                <PencilLine size={14} /> 名称与故事
              </button>
              {project.model && (
                <>
                  <button
                    disabled={s.busy || s.running}
                    onClick={() => {
                      void s.act(async () => {
                        const asset = await call<Asset>('project.export', { id: project.id, format: 'usagi' });
                        const res = await download(asset.id, `${project.name}.usagi`);
                        if (res?.saved) s.setNotice(`作品包 ${project.name}.usagi 已成功保存到您的本地设备！`);
                      });
                    }}
                    title="下载完整工程与资产作品包保存到本地电脑"
                  >
                    <Package size={14} /> 保存作品包 (.usagi)
                  </button>
                  <button
                    disabled={s.busy || s.running}
                    onClick={() => {
                      void s.act(async () => {
                        const asset = await call<Asset>('project.export', { id: project.id, format: 'stl' });
                        const res = await download(asset.id, `${project.name}.stl`);
                        if (res?.saved) s.setNotice(`STL 模型文件已成功保存到您的本地设备！`);
                      });
                    }}
                    title="导出 3D 打印水密 STL 文件保存到本地电脑"
                  >
                    <Download size={14} /> 导出 STL 模型
                  </button>
                </>
              )}
              <button
                className="collection-delete"
                disabled={s.busy || s.running}
                onClick={() => {
                  if (
                    window.confirm(`确定删除作品“${project.name}”及其所有版本吗？此操作无法撤销。`)
                  ) {
                    void s.deleteProject(project.id);
                  }
                }}
              >
                <Trash2 size={14} /> 删除作品
              </button>
            </div>
          </details>
        </div>

        {/* 亲子共创故事摘录条 */}
        {project.story ? (
          <div
            className="card-story-quote"
            onClick={onStory}
            role="button"
            tabIndex={0}
            title="点击修改造物故事"
          >
            <BookOpen size={12} className="story-quote-icon" />
            <p>“{project.story}”</p>
          </div>
        ) : (
          <button
            type="button"
            className="card-add-story-btn"
            onClick={onStory}
            title="为这件作品记录一段亲子故事"
          >
            <BookOpen size={12} />
            <span>+ 记录一段造物故事</span>
          </button>
        )}

        {/* 版本时光机与状态 */}
        <div className="collection-card-meta">
          <button
            className="collection-version-button"
            onClick={onVersions}
            disabled={!project.revision_count}
            aria-label={`${project.name}：${project.revision_count}个版本，点击切换`}
          >
            <span>{project.revision_count ? `${project.revision_count} 个版本时光机` : '尚未生成版本'}</span>
            <ChevronDown size={13} />
          </button>
        </div>

        {/* 底部操作按键 */}
        <div className="collection-card-actions">
          <button
            className="primary card-desk-btn"
            disabled={s.busy || s.running}
            onClick={() => {
              s.adopt(project);
              s.setRoom('desk');
            }}
            title="载入工程进入造物桌面"
          >
            <Armchair size={15} />
            <span>走进造物桌</span>
          </button>

          <button
            className={`secondary card-exhibit-btn ${project.exhibited ? 'is-exhibited' : ''}`}
            disabled={s.busy || s.running || (!project.exhibited && !project.model)}
            onClick={() => void s.updateProject(project.id, { exhibited: !project.exhibited })}
            title={project.exhibited ? '从展厅收回至作品柜' : '精选并放入乌萨奇展厅'}
          >
            <Trophy size={14} />
            <span>{project.exhibited ? '收回作品柜' : '放入展厅'}</span>
          </button>
        </div>
      </div>
    </article>
  );
}
