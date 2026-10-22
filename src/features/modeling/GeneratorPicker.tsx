import { useEffect, useRef, useState } from 'react';
import { call } from '../../api/client';
import { useStudio } from '../../state/StudioContext';
import type { GeneratorDefinition, Project } from '../../types';

export function GeneratorPicker({ project, onScript }: { project: Project; onScript?: () => void }) {
  const s = useStudio();
  const [generators, setGenerators] = useState<GeneratorDefinition[]>([]);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [submittedJob, setSubmittedJob] = useState<string | null>(null);
  const pending = useRef(false);
  const current = project.spec.modeling_plan?.generator;
  useEffect(() => {
    let active = true;
    setError('');
    void call<GeneratorDefinition[]>('model.generators.list').then((items) => {
      if (active) setGenerators(items);
    }).catch((failure: Error) => { if (active) setError(failure.message); });
    return () => { active = false; };
  }, [reload]);
  const blocked = s.busy || s.running || submitting || !s.preferences?.blender?.available ||
    s.project?.id !== project.id || s.project?.revision_id !== project.revision_id;
  const adopt = async (item: GeneratorDefinition) => {
    if (blocked || pending.current || !project.revision_id) return;
    pending.current = true;
    setSubmitting(true);
    setError('');
    try {
      const next = await s.applyGenerator({ schema_version: 1, id: project.id, base_revision_id: project.revision_id,
        generator: { id: item.id, version: item.version } }, (failure) => setError(failure.message));
      if (next) setSubmittedJob(next.id);
    } finally { pending.current = false; setSubmitting(false); }
  };
  return <details className="parameter-generators">
    <summary>{current ? '当前采用参数化生成器' : '采用参数化生成器'}</summary>
    <p className="parameter-control-help">直接生成新形体，再用参数调整；原模型保留在历史版本中。</p>
    {!generators.length && !error && <p role="status">正在读取生成器…</p>}
    {generators.map((item) => {
      const selected = current?.id === item.id && current.version === item.version;
      return <div className="parameter-generator" key={`${item.id}:${item.version}`}>
        <strong>{item.title} <small>v{item.version}</small></strong>
        <p className="parameter-control-help">{item.description}</p>
        {selected && onScript && <button type="button" onClick={onScript}>编辑 Blender 脚本 · 调整造型</button>}
        <button type="button" disabled={blocked || selected} onClick={() => void adopt(item)}>
          {selected ? '已采用 · 使用上方参数调整' : submitting ? '正在提交…' : '采用并生成新版本'}
        </button>
      </div>;
    })}
    {!s.preferences?.blender?.available && <p className="parameter-control-help">请先在家长设置配置本地 Blender。</p>}
    <div aria-live="polite">
      {s.job?.id === submittedJob && <p>{s.job.message}{['queued', 'running'].includes(s.job.status) ? ` · ${s.job.progress}%` : ''}</p>}
      {error && <p>{error} {!generators.length && <button type="button" onClick={() => setReload((value) => value + 1)}>重新读取</button>}</p>}
    </div>
  </details>;
}
