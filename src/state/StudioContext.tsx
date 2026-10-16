import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { call } from '../api/client';
import type {
  Asset,
  Bootstrap,
  Job,
  ModelAdjustment,
  Preferences,
  Profile,
  Project,
  Spec,
} from '../types';
import type { Room } from '../theme/rooms';
import { defaultSpec, editableSpec, isPhotoMode } from '../theme/modes';
import { hasCurrentPlan } from '../features/modeling/plan';
import { dataSnapshot } from '../utils/dataSnapshot';
import { printingReadiness } from '../features/printing/readiness';

function useStudioState() {
  const [room, setRoom] = useState<Room>('hall');
  const [projects, setProjects] = useState<Project[]>([]);
  const [project, setProject] = useState<Project | null>(null);
  const [spec, setSpec] = useState<Spec>(defaultSpec);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [preferences, setPreferences] = useState<Preferences | null>(null);
  const [profile, setProfile] = useState<Profile>({
    machine: 'A1 mini',
    nozzle_mm: 0.4,
    layer_mm: 0.2,
    material: 'PLA',
    margin_mm: 5,
  });
  const [job, setJob] = useState<Job | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [ready, setReady] = useState(false);
  const currentId = useRef<string | null>(null);
  const currentRevision = useRef<string | null>(null);
  const currentSpec = useRef(spec);
  currentSpec.current = spec;
  const pendingPlan = useRef<{ id: string; spec: string } | null>(null);
  const jobView = useRef<{ id: string; spec: string } | null>(null);
  const adopt = (p: Project, preserveSpec = false) => {
    const sameVersion = currentId.current === p.id && currentRevision.current === p.revision_id;
    currentId.current = p.id;
    currentRevision.current = p.revision_id;
    setProject(p);
    setSpec((old) => (sameVersion || preserveSpec ? old : editableSpec(p.spec)));
    setProjects((old) => [p, ...old.filter((x) => x.id !== p.id)]);
  };
  const refresh = async () => {
    const list = await call<Project[]>('project.list');
    setProjects(list);
    return list;
  };
  const act = async <T,>(work: () => Promise<T>): Promise<T | undefined> => {
    setBusy(true);
    try {
      return await work();
    } catch (error) {
      setNotice((error as Error).message);
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    void act(async () => {
      const data = await call<Bootstrap>('bootstrap');
      setProjects(data.projects);
      if (data.projects[0]) {
        const project = data.projects[0];
        adopt(project);
        const latest = data.jobs
          .filter((item) => item.project_id === project.id)
          .sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
        if (latest?.base_revision_id === project.revision_id) {
          if (
            ['queued', 'running', 'failed', 'canceled', 'interrupted'].includes(latest.status) &&
            latest.spec
          ) {
            setSpec(
              ['queued', 'running'].includes(latest.status) || latest.kind === 'adjust'
                ? latest.spec
                : latest.prepared_spec || latest.spec,
            );
            setJob(latest);
            if (latest.kind === 'plan' && ['queued', 'running'].includes(latest.status))
              pendingPlan.current = { id: latest.id, spec: dataSnapshot(latest.spec) };
          } else if (
            latest.kind === 'plan' &&
            latest.status === 'succeeded' &&
            latest.result?.spec
          ) {
            setSpec(latest.result.spec);
          }
        }
      }
      setAssets(data.assets);
      setPreferences(data.settings);
      setProfile(data.profile);
      setReady(true);
    });
  }, []);
  useEffect(() => {
    if (!job || !['queued', 'running'].includes(job.status)) return;
    if (jobView.current?.id !== job.id)
      jobView.current = { id: job.id, spec: dataSnapshot(currentSpec.current) };
    let canceled = false;
    const timer = setInterval(async () => {
      try {
        const update = await call<Job>('job.get', { id: job.id });
        if (canceled) return;
        setJob(update);
        if (update.status === 'succeeded') {
          if (update.result?.spec) {
            if (
              currentId.current === update.project_id &&
              currentRevision.current === update.result.base_revision_id &&
              pendingPlan.current?.id === update.id &&
              pendingPlan.current.spec === dataSnapshot(currentSpec.current)
            ) {
              setSpec(update.result.spec);
              setNotice(
                update.result.spec.provider === 'reconstruction'
                  ? '照片检查完成。可以一键建模，主体范围和标尺按需调整。'
                  : '乌萨奇的方案准备好了。确认部件和推测后，按方案生成模型。',
              );
            } else {
              setNotice('想法、材料或版本已经改变，这份方案没有覆盖当前设计。请重新设计。');
            }
            pendingPlan.current = null;
            return;
          }
          if (update.result?.project && currentId.current === update.project_id)
            adopt(
              update.result.project,
              jobView.current?.id === update.id &&
                dataSnapshot(currentSpec.current) !== jobView.current.spec,
            );
          setNotice(
            update.kind === 'slice'
              ? '实际切片已完成，可以下载 A1 mini 打印文件。'
              : update.message,
          );
          await refresh();
        } else if (['failed', 'canceled', 'interrupted'].includes(update.status)) {
          if (
            update.kind !== 'adjust' &&
            update.prepared_spec &&
            currentId.current === update.project_id &&
            currentRevision.current === update.base_revision_id &&
            dataSnapshot(currentSpec.current) === dataSnapshot(update.spec)
          )
            setSpec(update.prepared_spec);
          setNotice(update.message);
        }
      } catch (e) {
        if (!canceled) {
          setNotice((e as Error).message);
          setJob(null);
        }
      }
    }, 1000);
    return () => {
      canceled = true;
      clearInterval(timer);
    };
  }, [job?.id, job?.status]);
  const create = async (customSpec?: Partial<Spec>, name?: string) =>
    act(async () => {
      const p = await call<Project>('project.create', {
        name: name || '我的新作品',
        spec: customSpec ? { ...defaultSpec, ...customSpec } : defaultSpec,
      });
      adopt(p);
      setRoom('desk');
    });
  const updateProject = async (
    id: string,
    changes: Partial<Pick<Project, 'name' | 'story' | 'exhibited'>>,
  ) =>
    act(async () => {
      const updated = await call<Project>('project.update', { id, ...changes });
      const metadata = {
        name: updated.name,
        story: updated.story,
        exhibited: updated.exhibited,
        updated_at: updated.updated_at,
      };
      setProjects((old) => old.map((p) => (p.id === id ? { ...p, ...metadata } : p)));
      setProject((old) => (old?.id === id ? { ...old, ...metadata } : old));
      if (changes.exhibited !== undefined)
        setNotice(changes.exhibited ? '作品已放入乌萨奇展厅。' : '作品已收回作品柜。');
      return updated;
    });
  const deleteProject = async (id: string) =>
    act(async () => {
      await call('project.delete', { id });
      setProjects((old) => {
        const remaining = old.filter((p) => p.id !== id);
        if (currentId.current === id) {
          if (remaining.length > 0) {
            adopt(remaining[0]);
          } else {
            currentId.current = null;
            currentRevision.current = null;
            setProject(null);
            setSpec(defaultSpec);
          }
        }
        return remaining;
      });
      setNotice('作品已从作品柜中删除。');
    });
  const deleteRevision = async (projectId: string, revisionId: string) =>
    act(async () => {
      const updated = await call<Project>('project.delete_revision', {
        project_id: projectId,
        revision_id: revisionId,
      });
      adopt(updated);
      await refresh();
      setNotice('指定版本已删除。');
      return updated;
    });
  const selectRevision = async (projectId: string, revisionId: string) =>
    act(async () => {
      const updated = await call<Project>('project.select_revision', {
        id: projectId,
        revision_id: revisionId,
      });
      adopt(updated);
      setNotice('已切换作品版本，其他版本仍保存在作品柜。');
      return updated;
    });
  const deleteAsset = async (id: string) =>
    act(async () => {
      await call('asset.delete', { id });
      setAssets((old) => old.filter((a) => a.id !== id));
      setSpec((old) => ({
        ...old,
        asset_ids: old.asset_ids.filter((aid) => aid !== id),
      }));
      setNotice('素材已从素材架移除。');
    });
  const generate = async (adjustment?: ModelAdjustment, requestSpec = spec) =>
    act(async () => {
      if (!project) return;
      const snapshot = dataSnapshot(spec);
      const hasPhotos = requestSpec.asset_ids.length > 0;
      const targetMode = hasPhotos
        ? ['silhouette', 'relief', 'image', 'multiview'].includes(requestSpec.mode)
          ? requestSpec.mode
          : requestSpec.asset_ids.length > 1
            ? 'multiview'
            : 'image'
        : requestSpec.mode;
      const effectiveSpec = {
        ...requestSpec,
        mode: targetMode,
      };
      const j = await call<Job>(adjustment ? 'model.adjust' : 'model.generate', {
        id: project.id,
        spec: effectiveSpec,
        auto_photo: !adjustment && (isPhotoMode(effectiveSpec.mode) || hasPhotos),
        ...(adjustment && { adjustment }),
      });
      if (
        j.spec &&
        currentId.current === project.id &&
        currentRevision.current === j.base_revision_id &&
        dataSnapshot(currentSpec.current) === snapshot
      )
        setSpec(j.spec);
      setJob(j);
      return j;
    });
  const organizeIdea = async (
    overridePrompt?: string,
    history?: Array<{ role: 'user' | 'assistant'; content: string }>,
  ) =>
    act(async () => {
      const activePrompt = overridePrompt !== undefined ? overridePrompt : spec.prompt;
      const targetSpec = overridePrompt !== undefined ? { ...spec, prompt: overridePrompt } : spec;
      const id = currentId.current;
      const revision = currentRevision.current;
      const cloud = !!preferences?.cloud_enabled && !!preferences?.chat_configured;
      const organized = await call<Spec>('idea.interpret', {
        prompt: activePrompt,
        spec: targetSpec,
        cloud,
        history,
      });
      if (
        currentId.current !== id ||
        currentRevision.current !== revision ||
        dataSnapshot(currentSpec.current) !== dataSnapshot(spec)
      ) {
        setNotice('想法、材料或版本已改变，本次整理未覆盖当前设计。');
        return null;
      }
      const finalPrompt = (organized.prompt && organized.prompt.trim()) || activePrompt;
      const updatedSpec: Spec = {
        ...organized,
        prompt: finalPrompt,
        modeling_plan: null,
        reconstruction_plan: null,
      };
      setSpec(updatedSpec);
      setNotice(
        cloud
          ? 'AI 已整理尺寸和要求，乌萨奇的推测建议已送达聊天框。'
          : '已用本地规则整理尺寸和要求，建议已送达聊天框；配置开启 AI 可智能理解照片。',
      );
      return updatedSpec;
    });
  const design = async () =>
    act(async () => {
      if (!project) return;
      const snapshot = dataSnapshot(spec);
      const j = await call<Job>('model.plan', { id: project.id, spec });
      pendingPlan.current = { id: j.id, spec: snapshot };
      setJob(j);
    });
  const check = async () =>
    act(async () => {
      if (!project) return;
      const p = await call<Project>('model.check', { id: project.id, profile });
      adopt(p);
      setRoom('check');
    });
  const slice = async () =>
    act(async () => {
      if (!project) return;
      setJob(await call<Job>('model.slice', { id: project.id, profile }));
    });
  const dirty = !!project && dataSnapshot(spec) !== dataSnapshot(project.spec);
  const running = !!job && ['queued', 'running'].includes(job.status);
  const printReadiness = printingReadiness(project, profile, dirty, busy, running);
  const profileMatches = printReadiness.profileMatches;
  const canPrepare = printReadiness.canPrepare;
  const sliceMatches =
    !!project?.slicing &&
    project.slicing.revision_id === project.revision_id &&
    dataSnapshot(profile) === dataSnapshot(project.slicing.profile) &&
    !dirty;
  const blenderReady = preferences ? !!preferences.blender?.available : true;
  const hasPhotos = spec.asset_ids.length > 0;
  const canGenerate = blenderReady && (hasPhotos ? true : spec.mode === 'text' ? true : false);
  return {
    room,
    setRoom,
    projects,
    project,
    spec,
    setSpec,
    assets,
    setAssets,
    preferences,
    setPreferences,
    profile,
    setProfile,
    job,
    setJob,
    busy,
    notice,
    setNotice,
    ready,
    adopt,
    refresh,
    act,
    create,
    updateProject,
    deleteProject,
    deleteRevision,
    deleteAsset,
    selectRevision,
    generate,
    organizeIdea,
    design,
    check,
    slice,
    sliceMatches,
    dirty,
    profileMatches,
    canPrepare,
    printReadiness,
    canGenerate,
    running: !!job && ['queued', 'running'].includes(job.status),
  };
}
type Studio = ReturnType<typeof useStudioState>;
const Context = createContext<Studio | null>(null);
export function StudioProvider({ children }: { children: ReactNode }) {
  return <Context.Provider value={useStudioState()}>{children}</Context.Provider>;
}
export function useStudio() {
  const state = useContext(Context);
  if (!state) throw new Error('StudioProvider missing');
  return state;
}
