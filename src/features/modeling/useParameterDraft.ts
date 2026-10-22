import { useEffect, useRef, useState } from 'react';
import { call } from '../../api/client';
import { useStudio } from '../../state/StudioContext';
import type { ParameterCapability, ParameterDescription, ParameterPatch, Project } from '../../types';

type Draft = Record<string, string | boolean>;

function validValue(parameter: ParameterCapability, value: unknown) {
  if (parameter.control === 'switch') return typeof value === 'boolean';
  return typeof value === 'number' && Number.isFinite(value) && value >= parameter.min && value <= parameter.max &&
    Math.abs((value - parameter.min) / parameter.step - Math.round((value - parameter.min) / parameter.step)) <= 1e-6;
}

export function useParameterDraft(project: Project) {
  const s = useStudio();
  const [description, setDescription] = useState<ParameterDescription | null>(null);
  const [draft, setDraft] = useState<Draft>({});
  const current = useRef(draft);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const [submittedJob, setSubmittedJob] = useState<string | null>(null);
  const [autoApply, setAutoApply] = useState(true);
  const [jsonPending, setJsonPending] = useState(false);
  const stale = s.project?.id !== project.id || s.project?.revision_id !== project.revision_id;
  const blocked = s.busy || s.running || submitting || stale;
  const replace = (data: Draft) => { current.current = data; setDraft(data); };

  useEffect(() => {
    let active = true;
    setDescription(null);
    setError('');
    setJsonPending(false);
    void call<ParameterDescription>('model.parameters.describe', {
      schema_version: 1, id: project.id, base_revision_id: project.revision_id,
    }).then((data) => {
      if (!active) return;
      setDescription(data);
      replace(Object.fromEntries(Object.entries(data.parameters).map(([key, p]) => [key, typeof p.value === 'boolean' ? p.value : String(p.value)])));
    }).catch(async (failure: Error & { code?: string }) => {
      if (!active) return;
      if (failure.code === 'REVISION_CHANGED') {
        try {
          const latest = await s.refreshProject(project.id, project.revision_id);
          if (!active || (latest && latest.revision_id !== project.revision_id)) return;
        } catch (refreshError) {
          if (active) setError((refreshError as Error).message);
          return;
        }
      }
      if (active) setError(failure.message);
    });
    return () => { active = false; };
  }, [project.id, project.revision_id, retry]);

  const fields = Object.entries(description?.parameters || {});
  const readValues = () => Object.fromEntries(fields.map(([key, p]) => [key,
    p.control === 'switch' ? current.current[key] as boolean : Number(current.current[key])])) as Record<string, number | boolean>;
  const values = readValues();
  const valid = fields.length > 0 && fields.every(([key, p]) => current.current[key] !== '' && validValue(p, values[key]));
  const changes = fields.filter(([key, p]) => values[key] !== p.value);
  const request = (): ParameterPatch => {
    const latest = readValues();
    return {
      schema_version: 1, id: project.id, base_revision_id: project.revision_id!,
      parameters: Object.fromEntries(fields.filter(([key, p]) => latest[key] !== p.value).map(([key]) => [key, latest[key]])),
    };
  };
  const apply = async (json?: string, baseline?: Draft) => {
    if (blocked || submittingRef.current || !fields.length) return;
    if (json !== undefined && !loadJson(json, baseline)) return;
    const patch = request();
    if ((json === undefined && jsonPending) ||
      !fields.every(([key, p]) => current.current[key] !== '' && validValue(p, readValues()[key]))) return;
    if (!Object.keys(patch.parameters).length) {
      setError('参数与当前版本相同，没有可应用的变化。');
      return;
    }
    submittingRef.current = true;
    setSubmitting(true);
    setError('');
    try {
      const next = await s.applyParameters(patch, (failure) => setError(failure.message));
      if (next) setSubmittedJob(next.id);
    } finally { submittingRef.current = false; setSubmitting(false); }
  };
  const update = (key: string, value: string | boolean) => {
    replace({ ...current.current, [key]: value });
    setError('');
  };
  const commit = () => { if (autoApply) void apply(); };
  const loadJson = (text: string, baseline = current.current) => {
    try {
      let data: unknown = JSON.parse(text);
      if (!data || typeof data !== 'object' || Array.isArray(data)) throw Error('请输入参数键值对象。');
      if (Object.hasOwn(data, 'master_parameters') || Object.hasOwn(data, 'parameters')) {
        const envelope = data as Record<string, unknown>;
        const key = Object.hasOwn(envelope, 'master_parameters') ? 'master_parameters' : 'parameters';
        if (Object.keys(envelope).some((name) => ![key, 'schema_version', 'id', 'base_revision_id'].includes(name)))
          throw Error('参数包装中只能包含参数对象、版本号及作品身份。');
        if ((envelope.schema_version !== undefined && envelope.schema_version !== 1) ||
          (envelope.id !== undefined && envelope.id !== project.id) ||
          (envelope.base_revision_id !== undefined && envelope.base_revision_id !== project.revision_id))
          throw Error('JSON 的作品或来源版本与当前模型不一致。');
        data = envelope[key];
        if (!data || typeof data !== 'object' || Array.isArray(data)) throw Error(`${key} 必须是参数键值对象。`);
      }
      const entries = Object.entries(data);
      if (!entries.length) throw Error('请填写至少一个需要修改的参数。');
      if (!description) throw Error('作品参数尚未读取完成。');
      const unknown = entries.filter(([key]) => !Object.hasOwn(description.parameters, key)).map(([key]) => key);
      if (unknown.length) throw Error(`未识别参数：${unknown.join('、')}。当前版本可用：${fields.map(([key]) => key).join('、')}。`);
      for (const [key, value] of entries) {
        const parameter = description.parameters[key];
        if (!validValue(parameter, value)) throw Error(parameter.control === 'switch'
          ? `${parameter.display_label}（${key}）必须是 true 或 false。`
          : `${parameter.display_label}（${key}）须为 ${parameter.min}～${parameter.max} 的数值，步长 ${parameter.step}。`);
      }
      replace({ ...baseline, ...Object.fromEntries(entries.map(([key, value]) => [key, typeof value === 'boolean' ? value : String(value)])) });
      setJsonPending(false);
      setError('');
      return true;
    } catch (failure) {
      setError(failure instanceof SyntaxError ? 'JSON 格式不完整或不正确，请检查引号、逗号和括号。' : (failure as Error).message);
      return false;
    }
  };
  const reset = () => {
    replace(Object.fromEntries(fields.map(([key, p]) => [key, typeof p.value === 'boolean' ? p.value : String(p.value)])));
    setJsonPending(false);
    setError('');
  };
  const reload = async () => {
    try {
      await s.refreshProject(project.id, project.revision_id);
      setRetry((value) => value + 1);
    } catch (failure) { setError((failure as Error).message); }
  };
  const activeJob = s.job?.id === submittedJob ? s.job : null;
  return { fields, description, draft, values, changes, valid, blocked, stale, error, setError, retry: reload,
    submitting, activeJob, autoApply, setAutoApply, jsonPending, setJsonPending, update, commit, apply, request, loadJson, reset,
    blenderReady: !!s.preferences?.blender?.available };
}
