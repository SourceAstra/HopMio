import { ChevronDown, MoreHorizontal, PencilLine, Trash2 } from 'lucide-react';
import { ModelViewer } from '../../components/ModelViewer';
import { useStudio } from '../../state/StudioContext';
import type { Project } from '../../types';

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
      <button
        className="collection-card-preview"
        onClick={handlePreviewClick}
        aria-label={`查看并编辑${project.name}`}
        aria-pressed={featured}
      >
        {modelId ? (
          <ModelViewer key={modelId} assetId={modelId} compact transparent />
        ) : (
          <span className="collection-card-empty">还在酝酿的小小想法</span>
        )}
      </button>
      <div className="collection-card-body">
        <div className="collection-card-title">
          <h2>{project.name}</h2>
          <details className="collection-card-menu">
            <summary aria-label={`${project.name}的更多操作`}>
              <MoreHorizontal size={19} />
            </summary>
            <div>
              <button onClick={onStory}>
                <PencilLine size={14} /> 名称与故事
              </button>
              <button
                className="collection-delete"
                disabled={s.busy || s.running}
                onClick={() => {
                  if (
                    window.confirm(`确定删除作品“${project.name}”及其所有版本吗？此操作无法撤销。`)
                  )
                    void s.deleteProject(project.id);
                }}
              >
                <Trash2 size={14} /> 删除作品
              </button>
            </div>
          </details>
        </div>
        <div className="collection-card-meta">
          <button
            className="collection-version-button"
            onClick={onVersions}
            disabled={!project.revision_count}
            aria-label={`${project.name}：${project.revision_count}个版本，点击切换`}
          >
            {project.revision_count ? `${project.revision_count} 个版本` : '尚未生成版本'}
            <ChevronDown size={13} />
          </button>
          {project.exhibited && <span className="collection-exhibited">已在展厅</span>}
        </div>
        <div className="collection-card-actions">
          <button
            className="primary"
            disabled={s.busy || s.running}
            onClick={() => {
              s.adopt(project);
              s.setRoom('desk');
            }}
          >
            继续造物
          </button>
          <button
            className="secondary"
            disabled={s.busy || s.running || (!project.exhibited && !project.model)}
            onClick={() => void s.updateProject(project.id, { exhibited: !project.exhibited })}
          >
            {project.exhibited ? '收回作品柜' : '放入展厅'}
          </button>
        </div>
      </div>
    </article>
  );
}
