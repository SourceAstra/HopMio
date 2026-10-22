import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Code2, Copy, Download, Play, Save, Upload } from 'lucide-react';
import { assetUrl, call, download } from '../../api/client';
import { ModelViewer } from '../../components/ModelViewer';
import { useStudio } from '../../state/StudioContext';
import type { Project, Revision, ScriptDescription, ScriptDocument, ScriptInspection } from '../../types';
import { scriptPrompt } from './scriptPrompt';
import { dataSnapshot } from '../../utils/dataSnapshot';
import '../../styles/script-editor.css';

const empty: ScriptDocument = { schema_version: 1, source: '', operation: 'replace', coordinate_unit: 'mm', entrypoint: 'script', parameters: {}, expected_size_mm: null };

export function ScriptEditor({ project, preview }: { project: Project; preview?: ReactNode }) {
  const s = useStudio();
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const editor = useRef<HTMLTextAreaElement>(null);
  const alive = useRef(true);
  const sourceRevision = useRef(0);
  const [document, setDocument] = useState<ScriptDocument>(empty);
  const [description, setDescription] = useState<ScriptDescription>();
  const [controls, setControls] = useState<ScriptInspection['controls']>({});
  const [parameterDraft, setParameterDraft] = useState<Record<string, string>>({});
  const [promptText, setPromptText] = useState('');
  const [dimensions, setDimensions] = useState(['', '', '']);
  const [message, setMessage] = useState('正在读取生成脚本…');
  const [error, setError] = useState('');
  const [working, setWorking] = useState(false);
  const [jobId, setJobId] = useState<string>();
  const [candidate, setCandidate] = useState<Revision>();
  const [candidateInput, setCandidateInput] = useState('');
  const [cursor, setCursor] = useState({ line: 1, column: 1 });
  const [reload, setReload] = useState(0);
  const revision = project.revision_id;
  const target = { schema_version: 1 as const, id: project.id, base_revision_id: revision! };
  const job = s.job?.id === jobId ? s.job : undefined;
  const blocked = working || s.busy || s.running || !description || s.project?.id !== project.id || s.project?.revision_id !== revision;
  const requestDocument = () => {
    const expected = dimensions.some(Boolean) ? dimensions.map(Number) as [number, number, number] : null;
    if (expected && (dimensions.some((value) => !value.trim()) || expected.some((value) => !Number.isFinite(value) || value < 0.8 || value > 500)))
      throw new Error('目标尺寸须完整填写宽、深、高，范围为 0.8～500 mm；全部留空则只显示实测尺寸。');
    const parameters = { ...document.parameters };
    for (const [key, control] of Object.entries(controls)) {
      const text = parameterDraft[key];
      const value = typeof control.value === 'boolean' ? parameters[key] ?? control.value
        : text === undefined ? parameters[key] ?? control.value : Number(text);
      if (typeof value === 'number' && (text?.trim() === '' || !Number.isFinite(value) || value < control.min || value > control.max))
        throw new Error(`${control.display_label} 须填写 ${control.min}～${control.max} 之间的数值。`);
      parameters[key] = value;
    }
    return { ...document, parameters, expected_size_mm: expected };
  };
  const perform = async (action: () => Promise<void>) => {
    setWorking(true); setError('');
    try { await action(); } catch (failure) { if (alive.current) setError((failure as Error).message); }
    finally { if (alive.current) setWorking(false); }
  };
  useEffect(() => {
    alive.current = true;
    let active = true;
    void call<ScriptDescription>('model.scripts.describe', target).then(async (result) => {
      if (!active) return;
      setDescription(result);
      const saved = { ...empty, ...result.document };
      setDocument(saved);
      setCandidate(result.candidate || undefined);
      setCandidateInput(result.candidate_document ? dataSnapshot(result.candidate_document) : '');
      setDimensions(saved.expected_size_mm?.map(String) || ['', '', '']);
      setMessage(result.document ? '已读取当前版本的脚本与参数。' : '粘贴外部大模型生成的脚本，或导入 .py 文件。');
      if (saved.source.trim()) {
        try {
          const parsed = await call<ScriptInspection>('model.scripts.inspect', { ...target, document: saved });
          if (active && sourceRevision.current === 0) {
            setControls(parsed.controls);
            setDocument((old) => ({ ...old, parameters: parsed.parameters }));
          }
        } catch (failure) { if (active) setError((failure as Error).message); }
      }
    }).catch((failure: Error) => { if (active) setError(failure.message); });
    return () => { active = false; alive.current = false; };
  }, [project.id, revision, reload]);
  useEffect(() => {
    const current = s.job;
    if (!description || !current?.preview_only || current.project_id !== project.id || current.base_revision_id !== revision || current.id === jobId) return;
    setJobId(current.id);
  }, [s.job?.id, description, project.id, revision]);
  useEffect(() => {
    if (job?.status !== 'succeeded' || !job.result?.candidate_revision_id) return;
    let active = true;
    void call<Revision[]>('project.history', { id: project.id }).then(async (items) => {
      const saved = items.find((item) => item.id === job.result!.candidate_revision_id);
      if (!saved?.model.script_document_id) throw new Error('候选版本不存在，请重新运行预览。');
      const response = await fetch(assetUrl(saved.model.script_document_id));
      if (!response.ok) throw new Error('读取候选脚本失败，请重新打开面板。');
      const source = await response.json();
      if (active) { setCandidate(saved); setCandidateInput(dataSnapshot(source)); setMessage('候选模型已就绪，请检查造型后采用。'); }
    }).catch((failure: Error) => { if (active) setError(failure.message); });
    return () => { active = false; };
  }, [job?.id, job?.status, job?.result?.candidate_revision_id, project.id]);
  const updateSource = (source: string) => { sourceRevision.current++; setDocument((old) => ({ ...old, source, parameters: {} })); setControls({}); setParameterDraft({}); setMessage('脚本已修改，保存草稿或运行预览。'); };
  const inspect = () => perform(async () => {
    const parsed = await call<ScriptInspection>('model.scripts.inspect', { ...target, document: requestDocument() });
    if (!alive.current) return;
    setControls(parsed.controls); setParameterDraft({}); setDocument((old) => ({ ...old, parameters: parsed.parameters }));
    setMessage(Object.keys(parsed.controls).length ? '已读取 PARAMETERS，修改数值后运行预览。' : '语法检查通过。此脚本未声明 PARAMETERS，可直接修改代码。');
  });
  const run = () => perform(async () => {
    let payload = requestDocument();
    const parsed = await call<ScriptInspection>('model.scripts.inspect', { ...target, document: payload });
    if (!alive.current) return;
    payload = { ...payload, parameters: parsed.parameters };
    setDocument(payload); setControls(parsed.controls); setParameterDraft({});
    const next = await s.previewScript({ ...target, document: payload }, (failure) => { if (alive.current) setError(failure.message); });
    if (next && alive.current) { setJobId(next.id); setCandidate(undefined); setCandidateInput(dataSnapshot(payload)); setMessage('正在生成候选模型…'); }
  });
  let inputChanged = false;
  try { inputChanged = candidateInput !== dataSnapshot(requestDocument()); } catch { inputChanged = true; }
  const candidateId = candidate?.model.manufacturing_glb_id || candidate?.model.glb_id;
  const statusMessage = job && ['queued', 'running'].includes(job.status) ? `${job.message} · ${job.progress}%` : message;

  return <div className="script-workspace">
    <div className="parameter-panel-layout parameter-panel-with-preview">
      {candidateId ? <section className="parameter-dialog-preview" aria-label="脚本候选预览">
        <ModelViewer key={candidateId} assetId={candidateId} compact transparent />
        <div className="parameter-dialog-model-caption"><strong>脚本候选 · 尚未采用</strong><span>实测 {candidate!.model.size_mm.map((value) => value.toFixed(2)).join(' × ')} mm</span></div>
        <p>检查造型后采用；原模型保留在版本记录中。</p>
      </section> : preview}
      <section className="parameter-dialog-editor script-editor" aria-label="Blender 脚本编辑器">
        <div className="script-toolbar">
          <button type="button" disabled={working} onClick={() => void perform(async () => {
            const text = scriptPrompt(project, requestDocument(), description?.blender_version || '');
            try {
              await navigator.clipboard.writeText(text);
              if (alive.current) setMessage('建模约定已复制，请追加造型要求后发送给外部大模型。');
            } catch { if (alive.current) { setPromptText(text); setMessage('浏览器未允许直接复制，请从下方文本框选择并复制提示词。'); } }
          })}><Copy size={14} />复制给大模型的提示词</button>
          <button type="button" disabled={blocked} onClick={() => input.current?.click()}><Upload size={14} />导入 .py</button>
          <input ref={input} type="file" accept=".py,text/x-python,text/plain" hidden onChange={(event) => {
            const file = event.target.files?.[0]; event.target.value = '';
            if (file) void perform(async () => { if (file.size > 200_000) throw new Error('脚本超过 200 KB，请缩小后导入。'); const text = await file.text(); if (alive.current) updateSource(text); });
          }} />
        </div>
        {promptText && <details className="script-prompt" open><summary>给大模型的提示词</summary><textarea aria-label="给大模型的提示词" readOnly value={promptText} onFocus={(event) => event.currentTarget.select()} /></details>}
        <div className="script-options">
          <label className="script-entrypoint" htmlFor={`${id}-entrypoint`}>脚本形式<select id={`${id}-entrypoint`} value={document.entrypoint} disabled={blocked}
            onChange={(event) => setDocument((old) => ({ ...old, entrypoint: event.target.value as ScriptDocument['entrypoint'] }))}>
            <option value="script">直接运行整段脚本</option><option value="build">调用 build(ctx, params)</option>
          </select></label>
          <label htmlFor={`${id}-operation`}>执行方式<select id={`${id}-operation`} value={document.operation} disabled={blocked}
            onChange={(event) => setDocument((old) => ({ ...old, operation: event.target.value as ScriptDocument['operation'] }))}>
            <option value="replace">重新生成造型</option><option value="edit" disabled={!description?.source_model_id}>修改当前模型</option>
          </select></label>
          <label htmlFor={`${id}-unit`}>代码坐标单位<select id={`${id}-unit`} value={document.coordinate_unit} disabled={blocked}
            onChange={(event) => setDocument((old) => ({ ...old, coordinate_unit: event.target.value as ScriptDocument['coordinate_unit'] }))}>
            <option value="mm">毫米 · 60 = 60 mm</option><option value="m">米 · 0.06 = 60 mm</option>
          </select></label>
        </div>
        {document.operation === 'edit' && <p className="parameter-control-help">脚本通过 ctx.current 访问当前网格。<button type="button" disabled={!description?.source_model_id || working} onClick={() => void perform(async () => { await download(description!.source_model_id!, '当前模型.glb'); })}><Download size={12} />下载模型给大模型参考</button></p>}
        <label className="script-source-label" htmlFor={`${id}-source`}><Code2 size={14} />生成脚本 <span>Python · {description?.blender_version || 'Blender'}</span></label>
        <textarea ref={editor} id={`${id}-source`} className="script-source" spellCheck={false} autoCapitalize="off" autoCorrect="off" disabled={blocked} value={document.source}
          placeholder={'# 在此粘贴 Blender Python 脚本\n# 支持直接运行的脚本，或 def build(ctx, params): …'}
          onChange={(event) => updateSource(event.target.value)} onSelect={(event) => {
            const before = event.currentTarget.value.slice(0, event.currentTarget.selectionStart);
            setCursor({ line: before.split('\n').length, column: before.length - before.lastIndexOf('\n') });
          }} onKeyDown={(event) => {
            if (event.key !== 'Tab') return;
            event.preventDefault(); const node = event.currentTarget; const start = node.selectionStart;
            updateSource(node.value.slice(0, start) + '    ' + node.value.slice(node.selectionEnd));
            requestAnimationFrame(() => editor.current?.setSelectionRange(start + 4, start + 4));
          }} />
        <div className="script-code-footer"><span>第 {cursor.line} 行，第 {cursor.column} 列 · {document.source.split('\n').length} 行</span>
          <button type="button" disabled={blocked || !document.source.trim()} onClick={() => void inspect()}>检查语法 · 读取参数</button></div>
        {Object.keys(controls).length > 0 && <fieldset className="script-parameters"><legend>脚本参数</legend>{Object.entries(controls).map(([key, control]) =>
          <label key={key} htmlFor={`${id}-${key}`}><span>{control.display_label}<small>{control.unit === 'ratio' ? '' : control.unit}</small></span>
            {typeof control.value === 'boolean' ? <input id={`${id}-${key}`} type="checkbox" disabled={blocked} checked={(document.parameters[key] ?? control.value) === true}
              onChange={(event) => setDocument((old) => ({ ...old, parameters: { ...old.parameters, [key]: event.target.checked } }))} /> :
              <input id={`${id}-${key}`} type="number" disabled={blocked} min={control.min} max={control.max} step={control.step}
                value={parameterDraft[key] ?? String(document.parameters[key] ?? control.value)}
                onChange={(event) => setParameterDraft((old) => ({ ...old, [key]: event.target.value }))} />}</label>
        )}</fieldset>}
        <fieldset className="script-dimensions"><legend>目标尺寸（可选，mm）</legend><p className="parameter-control-help">完整填写后按 ±0.05 mm 复测；留空仅显示实际尺寸。</p>
          <div>{['宽', '深', '高'].map((label, index) => <label key={label} htmlFor={`${id}-size-${index}`}>{label}<input id={`${id}-size-${index}`} type="number" min="0.8" max="500" step="0.1" placeholder="不限" disabled={blocked} value={dimensions[index]}
            onChange={(event) => setDimensions((old) => old.map((value, i) => i === index ? event.target.value : value))} /></label>)}</div>
        </fieldset>
        {description && !description.execution.available && <p className="script-error">{description.execution.message}</p>}
        <div className="script-status" aria-live="polite"><p>{statusMessage}</p>{error && <p className="script-error">{error}</p>}
          {job && ['failed', 'canceled', 'interrupted'].includes(job.status) && <p className="script-error">{job.message}</p>}
          {!description && error && <button type="button" disabled={working} onClick={() => { setError(''); setReload((value) => value + 1); }}>重新读取</button>}
        </div>
        {job?.script_diagnostics && <details className="script-log"><summary>脚本运行日志</summary><pre>{job.script_diagnostics.log}</pre></details>}
        {candidate && inputChanged && <p className="parameter-control-help">脚本或参数已修改，请重新预览后采用。</p>}
      </section>
    </div>
    <footer className="parameter-dialog-footer script-actions">
      {job && ['queued', 'running'].includes(job.status) && <button type="button" disabled={working || s.busy} onClick={() => void perform(async () => { await call('job.cancel', { id: job.id }); setMessage('已请求停止，正在等待任务结束。'); })}>停止运行</button>}
      <button type="button" disabled={blocked} onClick={() => void perform(async () => {
        await call('model.scripts.save', { ...target, document: requestDocument() }); if (alive.current) setMessage('草稿已保存；尚未执行。');
      })}><Save size={14} />保存草稿</button>
      <button type="button" className="parameter-dialog-apply" disabled={blocked || !description?.execution.available || !document.source.trim()} onClick={() => void run()}><Play size={14} />运行并预览</button>
      {candidate && <button type="button" className="parameter-dialog-apply" disabled={blocked || inputChanged} onClick={() => void perform(async () => {
        await s.adoptScript(project.id, revision!, candidate.id, requestDocument(), (failure) => { if (alive.current) setError(failure.message); });
      })}>采用此版本</button>}
    </footer>
  </div>;
}
