import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { ArrowRight, Braces, RotateCcw, Zap } from 'lucide-react';
import type { Project } from '../../types';
import { useParameterDraft } from './useParameterDraft';
import { GeneratorPicker } from './GeneratorPicker';
import { ScriptEditor } from './ScriptEditor';
import '../../styles/parameter-dialog.css';

const units = { mm: 'mm', deg: '°', ratio: '倍' };
const showValue = (value: number | boolean) => typeof value === 'boolean' ? value ? '开启' : '关闭' : value;

export function ParameterPanel({ project, preview, onChat }: { project: Project; preview?: ReactNode; onChat?: () => void }) {
  const p = useParameterDraft(project);
  const controlId = useId();
  const [editor, setEditor] = useState<'fields' | 'json'>('fields');
  const [mode, setMode] = useState<'parameters' | 'script'>('parameters');
  const [scriptOpened, setScriptOpened] = useState(false);
  const openScript = () => { setScriptOpened(true); setMode('script'); };
  const [json, setJson] = useState('');
  const jsonBase = useRef(p.draft);
  useEffect(() => { setEditor('fields'); setJson(''); }, [project.id, project.revision_id]);
  const openEditor = () => {
    if (editor === 'json') {
      if (!p.jsonPending || p.loadJson(json)) setEditor('fields');
    } else {
      jsonBase.current = { ...p.draft };
      setJson(JSON.stringify({ master_parameters: p.values }, null, 2)); p.setJsonPending(false); setEditor('json');
    }
  };
  const exportRequest = () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(p.request(), null, 2)], { type: 'application/json' }));
    const anchor = document.createElement('a');
    anchor.href = url; anchor.download = 'blender-recompute.json'; anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const running = p.activeJob && ['queued', 'running'].includes(p.activeJob.status);
  const applyDisabledReason = p.stale ? '作品已切换版本，请重新打开参数。'
    : p.blocked ? running ? `${p.activeJob!.message} · ${p.activeJob!.progress}%` : '正在处理其他操作，请稍候。'
      : !p.description ? p.error || '正在读取当前作品的可用参数。'
        : !p.blenderReady ? '本地 Blender 未就绪，请在家长设置检查。'
          : editor === 'fields' && (!p.valid || p.jsonPending) ? '请修正参数后应用。'
            : editor === 'fields' && !p.changes.length ? '参数与当前版本相同，修改数值后即可应用。' : '';
  const feedback = applyDisabledReason || p.error ||
    (running ? `${p.activeJob!.message} · ${p.activeJob!.progress}%` :
      p.activeJob?.status === 'failed' || p.activeJob?.status === 'canceled' ? p.activeJob.message :
        !p.blenderReady ? '请先在家长设置配置本地 Blender。' :
          p.jsonPending ? '请修正 JSON 后应用。' : p.description && !p.valid ? '请按控件范围与步长填写数值。' :
            p.changes.length ? `已调整 ${p.changes.length} 项 · 应用后保存新版本` : 'Blender 本地重算 · 无需 AI 服务');

  return <div className="parameter-panel">
    <div className="parameter-mode-switch" role="group" aria-label="本地微调方式">
      <button type="button" aria-pressed={mode === 'parameters'} onClick={() => setMode('parameters')}>参数调整</button>
      <button type="button" aria-pressed={mode === 'script'} onClick={openScript}>Blender 脚本</button>
    </div>
    <div className="parameter-mode-content" hidden={mode !== 'parameters'}>
    <div className={`parameter-panel-layout ${preview ? 'parameter-panel-with-preview' : ''}`}>
      {preview}
      <section className="parameter-dialog-editor" aria-label="作品主参数">
        <div className="parameter-dialog-editor-heading"><h3>{editor === 'fields' ? '调整参数' : 'JSON 主参数'}</h3>
          <button onClick={openEditor} disabled={!p.description || p.blocked} aria-pressed={editor === 'json'}><Braces size={15} />{editor === 'fields' ? 'JSON' : '返回参数'}</button></div>
        {!p.description && !p.error && <p className="parameter-dialog-status" role="status">正在读取作品参数…</p>}
        {p.description && editor === 'fields' && <div className="parameter-dialog-fields">{p.fields.map(([key, parameter]) =>
          <div className="parameter-control" data-changed={p.values[key] !== parameter.value} key={key}>
            <div className="parameter-dialog-field">
              <label htmlFor={`${controlId}-${key}`}><span>{parameter.display_label}</span>{p.values[key] !== parameter.value && <small>{showValue(parameter.value)} <ArrowRight size={10} /></small>}</label>
              {parameter.control === 'switch' ? <input id={`${controlId}-${key}`} className="parameter-switch" type="checkbox" role="switch" checked={p.draft[key] === true} disabled={p.blocked}
                onChange={(event) => { p.update(key, event.target.checked); p.commit(); }} /> :
                <span className="parameter-dialog-number"><input id={`${controlId}-${key}`} type="number" min={parameter.min} max={parameter.max} step={parameter.step}
                  value={typeof p.draft[key] === 'string' ? p.draft[key] as string : ''} disabled={p.blocked}
                  onChange={(event) => p.update(key, event.target.value)} /><small>{units[parameter.unit]}</small></span>}
            </div>
            {parameter.control === 'slider' && <input className="parameter-slider" type="range" aria-label={`${parameter.display_label}滑块`} min={parameter.min} max={parameter.max} step={parameter.step}
              value={typeof p.values[key] === 'number' && Number.isFinite(p.values[key]) ? p.values[key] as number : parameter.value} disabled={p.blocked}
              onChange={(event) => p.update(key, event.target.value)} onPointerUp={p.commit}
              onKeyUp={(event) => { if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown'].includes(event.key)) p.commit(); }} />}
            {parameter.description && <p className="parameter-control-help">{parameter.description}</p>}
          </div>)}{!p.fields.length && <p className="parameter-dialog-status">当前作品未声明可调主参数。</p>}</div>}
        {p.description && editor === 'json' && <div className="parameter-dialog-json"><textarea spellCheck={false} aria-label="JSON 主参数" value={json} disabled={p.blocked}
          onChange={(event) => {
            setJson(event.target.value);
            p.setJsonPending(true);
            p.loadJson(event.target.value, jsonBase.current);
          }} /><div>
          <button onClick={exportRequest} disabled={p.blocked || !p.valid || !p.changes.length || p.jsonPending}>导出重算请求</button></div>
          <p className="parameter-control-help">当前版本可用参数：{p.fields.map(([key]) => key).join('、')}。请保留实际参数名。</p></div>}
        <div className="parameter-dialog-feedback" aria-live="polite"><p>{feedback}{p.error && !p.description && <button onClick={p.retry}>重新读取</button>}</p></div>
        <GeneratorPicker key={`${project.id}:${project.revision_id}`} project={project} onScript={openScript} />
        {onChat && <button className="parameter-dialog-chat" onClick={onChat}>想改造型？和乌萨奇聊聊 <ArrowRight size={13} /></button>}
      </section>
    </div>
    <footer className="parameter-dialog-footer">
      <button className="parameter-dialog-reset" disabled={p.blocked || !p.description || (!p.changes.length && !p.jsonPending)} onClick={() => { p.reset(); setEditor('fields'); }}><RotateCcw size={14} />恢复原值</button>
      <label className="parameter-auto-apply" title="滑块松开或开关切换后执行，并保存新版本"><input type="checkbox" checked={p.autoApply} disabled={p.blocked} onChange={(event) => p.setAutoApply(event.target.checked)} />松手应用</label>
      <button className="parameter-dialog-apply" disabled={!!applyDisabledReason} title={applyDisabledReason || undefined}
        onClick={() => void p.apply(editor === 'json' ? json : undefined, jsonBase.current)}><Zap size={14} />{p.submitting ? '正在提交…' : '立即应用参数'}</button>
    </footer>
    </div>
    {scriptOpened && <div className="parameter-mode-content" hidden={mode !== 'script'}><ScriptEditor key={`${project.id}:${project.revision_id}`} project={project} preview={preview} /></div>}
  </div>;
}
