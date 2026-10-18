import { useEffect, useState } from 'react';
import { Check, Clock3, Trash2 } from 'lucide-react';
import { call } from '../../api/client';
import { ModelViewer } from '../../components/ModelViewer';
import { Modal } from '../../components/Modal';
import { useStudio } from '../../state/StudioContext';
import type { Project, Revision } from '../../types';
import { isModelDraft } from '../modeling/quality';

export function History({
  project,
  onClose,
  onSelected,
}: {
  project: Project;
  onClose: () => void;
  onSelected: () => void;
}) {
  const s = useStudio();
  const [history, setHistory] = useState<Revision[]>([]);
  const [selectedId, setSelectedId] = useState(project.revision_id);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    void call<Revision[]>('project.history', { id: project.id })
      .then((items) => {
        if (!active) return;
        setHistory(items);
        setSelectedId((old) =>
          items.some((item) => item.id === old) ? old : project.revision_id || items[0]?.id || null,
        );
      })
      .catch((failure: Error) => {
        if (active) setError(failure.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [project.id, project.revision_id, project.revision_count, retry]);
  const selected = history.find((item) => item.id === selectedId);
  const number = history.length - history.findIndex((item) => item.id === selectedId);
  const modelId = selected?.model?.manufacturing_glb_id || selected?.model?.glb_id;
  const isCurrent = selectedId === project.revision_id;
  return (
    <Modal title={`${project.name} · 切换版本`} onClose={onClose}>
      <p className="collection-modal-intro">
        先看看每一次的形状，再选一个继续造物。切换不会新增版本，其他版本都保留。
      </p>
      {loading ? (
        <p className="collection-modal-status" role="status">
          正在取出作品版本…
        </p>
      ) : error ? (
        <div className="collection-modal-status" role="alert">
          <p>{error}</p>
          <button className="secondary" onClick={() => setRetry((value) => value + 1)}>
            重新读取版本
          </button>
        </div>
      ) : !history.length ? (
        <p className="collection-modal-status">生成第一个模型后，造物旅程会记在这里。</p>
      ) : (
        <div className="revision-picker">
          <div className="revision-preview">
            {modelId ? (
              <ModelViewer key={modelId} assetId={modelId} compact transparent />
            ) : (
              <p>这一版没有模型预览</p>
            )}
            <div>
              <span className="revision-kicker">VERSION {String(number).padStart(2, '0')}</span>
              <h3>{selected?.reason}</h3>
              {isModelDraft(selected?.model) && <p className="surface-warning">候选草稿 · 未通过造型审阅，选择查看不代表已达到成品质量。</p>}
              <p>{selected && new Date(selected.created_at).toLocaleString('zh-CN')}</p>
            </div>
          </div>
          <div className="revision-timeline" aria-label="选择要预览的版本">
            {history.map((revision, index) => (
              <button
                key={revision.id}
                className={`revision-option ${revision.id === selectedId ? 'is-selected' : ''}`}
                aria-pressed={revision.id === selectedId}
                onClick={() => setSelectedId(revision.id)}
              >
                <span className="revision-number">
                  {String(history.length - index).padStart(2, '0')}
                </span>
                <span>
                  <strong>{revision.reason}</strong>
                  <small>
                    <Clock3 size={11} />{' '}
                    {new Date(revision.created_at).toLocaleString('zh-CN', {
                      month: 'numeric',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </small>
                </span>
                {revision.id === project.revision_id && <em>当前</em>}
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="collection-modal-actions">
        {selected && (
          <button
            className="collection-delete"
            disabled={s.busy || s.running || loading}
            onClick={() => {
              if (window.confirm(`删除第 ${number} 版（${selected.reason}）？其他版本会保留。`))
                void s.deleteRevision(project.id, selected.id);
            }}
          >
            <Trash2 size={14} /> 删除此版本
          </button>
        )}
        <button
          className="primary"
          disabled={!selected || isCurrent || s.busy || s.running || loading}
          onClick={() => {
            if (
              s.project?.id === project.id &&
              s.dirty &&
              !window.confirm('当前有尚未生成的参数修改。切换版本会替换这些参数，继续吗？')
            )
              return;
            if (selected)
              void s.selectRevision(project.id, selected.id).then((updated) => {
                if (updated) {
                  onSelected();
                  onClose();
                }
              });
          }}
        >
          <Check size={15} />{' '}
          {!selected ? '选择一个版本' : isCurrent ? '正在使用这一版' : '切换到这一版'}
        </button>
      </div>
    </Modal>
  );
}
