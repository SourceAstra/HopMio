import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { call } from '../api/client';
import type {
  Asset,
  Bootstrap,
  Job,
  ModelAdjustment,
  MaterialLibrary,
  Preferences,
  Profile,
  Project,
  Spec,
} from '../types';
import type { Room } from '../theme/rooms';
import { defaultSpec, editableSpec, isPhotoMode, providerForMode } from '../theme/modes';
import { hasCurrentPlan } from '../features/modeling/plan';
import { dataSnapshot } from '../utils/dataSnapshot';
import { printingReadiness } from '../features/printing/readiness';
import type { Mode } from '../types';
import { activeJobs, isActiveJob, stopJob } from './jobs';
import { isImageAsset, loadCustomFolders, loadAssetFolderMap } from '../features/materials/folders';

export interface NewProjectOptions {
  mode?: Mode;
  asset_ids?: string[];
  prompt?: string;
  defaultName?: string;
}

export interface JobConflictState {
  isOpen: boolean;
  actionTitle: string;
  taskCount: number;
  onConfirm: () => Promise<void> | void;
}

function useStudioState() {
  const [room, setRoom] = useState<Room>('hall');
  const [projects, setProjects] = useState<Project[]>([]);
  const [project, setProject] = useState<Project | null>(null);
  const [spec, setSpec] = useState<Spec>(defaultSpec);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [materialLibrary, setMaterialLibrary] = useState<MaterialLibrary>({
    schema_version: 1,
    version: 0,
    folders: [],
    assignments: {},
  });
  const materialLibraryRef = useRef(materialLibrary);
  const materialWrites = useRef(Promise.resolve());
  const saveMaterials = (update: (current: MaterialLibrary) => MaterialLibrary) => {
    const write = materialWrites.current.then(async () => {
      try {
        const result = await call<MaterialLibrary>(
          'materials.save',
          update(materialLibraryRef.current),
        );
        materialLibraryRef.current = result;
        setMaterialLibrary(result);
      } catch (error) {
        const refreshed = await call<MaterialLibrary>('materials.get');
        materialLibraryRef.current = refreshed;
        setMaterialLibrary(refreshed);
        throw error;
      }
    });
    materialWrites.current = write.catch(() => {});
    return write;
  };
  const [preferences, setPreferences] = useState<Preferences | null>(null);
  const [profile, setProfile] = useState<Profile>({
    machine: 'A1 mini',
    nozzle_mm: 0.4,
    layer_mm: 0.2,
    material: 'PLA',
    margin_mm: 5,
  });
  const [job, setJobState] = useState<Job | null>(null);
  const jobRef = useRef<Job | null>(null);
  const setJob = (value: Job | null) => {
    jobRef.current = value;
    setJobState(value);
  };
  const busyCount = useRef(0);
  const submitting = useRef(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [ready, setReady] = useState(false);
  const [newProjectModalOpen, setNewProjectModalOpen] = useState(false);
  const [newProjectOptions, setNewProjectOptions] = useState<NewProjectOptions | null>(null);
  const [jobConflict, setJobConflict] = useState<JobConflictState | null>(null);

  const openNewProject = async (options?: NewProjectOptions) => {
    await executeWithJobCheck(() => {
      setNewProjectOptions(options || null);
      setNewProjectModalOpen(true);
    });
  };

  const closeNewProject = () => {
    setNewProjectModalOpen(false);
    setNewProjectOptions(null);
  };

  const cancelCurrentJob = async () => {
    const current = jobRef.current;
    if (!current) return true;
    const result = await act(async () => {
      setNotice('正在停止当前任务…');
      const stopped = await stopJob(current.id);
      if (jobRef.current?.id === stopped.id) setJob(stopped);
      if (stopped.result?.project && currentId.current === stopped.project_id)
        adopt(stopped.result.project);
      await refresh();
      setNotice(
        stopped.status === 'succeeded'
          ? '任务已先完成，结果已保存。'
          : '当前任务已停止，已保存版本保留。',
      );
      return true;
    });
    return result === true;
  };
  const continueCurrentJob = async () => {
    const current = jobRef.current;
    await act(async () => {
      if (current) {
        const owner = await call<Project>('project.get', { id: current.project_id });
        adopt(owner);
        if (current.spec && current.base_revision_id === owner.revision_id)
          setSpec(current.prepared_spec || current.spec);
      }
      setJobConflict(null);
      closeNewProject();
      setRoom('desk');
    });
  };

  const executeWithJobCheck = async (
    action: () => Promise<void> | void,
    actionTitle = '开启新造物',
  ): Promise<boolean> => {
    if (submitting.current) return false;
    submitting.current = true;
    try {
      const runningJobs = await activeJobs();
      if (runningJobs.length) {
        setJob(runningJobs[0]);
        setJobConflict({
          isOpen: true,
          actionTitle,
          taskCount: runningJobs.length,
          onConfirm: async () => {
            if (submitting.current) return;
            submitting.current = true;
            try {
              for (const running of runningJobs) {
                setJob(running);
                if (!(await cancelCurrentJob())) return;
              }
              if ((await activeJobs()).length)
                throw new Error('检测到新的后台任务，请重新选择继续或停止。');
              setJobConflict(null);
              await action();
            } catch (error) {
              setNotice((error as Error).message);
            } finally {
              submitting.current = false;
            }
          },
        });
        return false;
      }
      await action();
      return true;
    } catch (error) {
      setNotice((error as Error).message);
      return false;
    } finally {
      submitting.current = false;
    }
  };
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
    busyCount.current++;
    setBusy(true);
    try {
      return await work();
    } catch (error) {
      setNotice((error as Error).message);
    } finally {
      busyCount.current--;
      setBusy(busyCount.current > 0);
    }
  };
  useEffect(() => {
    void act(async () => {
      const data = await call<Bootstrap>('bootstrap');
      setProjects(data.projects);
      const active = data.jobs.find(isActiveJob);
      const initial =
        data.projects.find((item) => item.id === active?.project_id) || data.projects[0];
      if (initial) {
        const project = initial;
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
      let library = data.material_library || {
        schema_version: 1 as const,
        version: 0,
        folders: [],
        assignments: {},
      };
      if (
        library.version === 0 &&
        (loadCustomFolders().length || Object.keys(loadAssetFolderMap()).length)
      ) {
        try {
          library = await call<MaterialLibrary>('materials.save', {
            ...library,
            folders: loadCustomFolders(),
            assignments: loadAssetFolderMap(),
          });
        } catch (error) {
          setNotice(`旧素材目录暂未迁移：${(error as Error).message}`);
        }
      }
      materialLibraryRef.current = library;
      setMaterialLibrary(library);
      setPreferences(data.settings);
      setProfile(data.profile);
      setReady(true);
    });
  }, []);
  useEffect(() => {
    if (!preferences) return;
    const previous = {
      light: document.body.classList.contains('theme-light'),
      dark: document.body.classList.contains('theme-dark'),
    };
    const light = ['light', 'sunshine'].includes(preferences.theme);
    document.body.classList.toggle('theme-light', light);
    document.body.classList.toggle('theme-dark', !light);
    return () => {
      document.body.classList.toggle('theme-light', previous.light);
      document.body.classList.toggle('theme-dark', previous.dark);
    };
  }, [preferences?.theme]);
  useEffect(() => {
    if (!ready) return;
    let disposed = false;
    const timer = setInterval(async () => {
      if (isActiveJob(jobRef.current)) return;
      try {
        const jobs = await activeJobs();
        if (!disposed && jobs[0] && !isActiveJob(jobRef.current)) setJob(jobs[0]);
      } catch {
        // 当前任务 ID 由独立轮询保留；下次继续发现其他标签页的任务。
      }
    }, 2500);
    return () => {
      disposed = true;
      clearInterval(timer);
    };
  }, [ready]);
  useEffect(() => {
    if (!job || !['queued', 'running'].includes(job.status)) return;
    if (jobView.current?.id !== job.id)
      jobView.current = { id: job.id, spec: dataSnapshot(currentSpec.current) };
    let canceled = false;
    let polling = false;
    const timer = setInterval(async () => {
      if (polling) return;
      polling = true;
      try {
        const update = await call<Job>('job.get', { id: job.id });
        if (canceled || jobRef.current?.id !== job.id) return;
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
        }
      } finally {
        polling = false;
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
      return p;
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
      setAssets((old) =>
        old.map((asset) => (asset.id === id ? { ...asset, archived: true } : asset)),
      );
      setNotice('素材已从素材架移除，作品与历史版本的引用保留。');
    });
  const generate = async (
    adjustment?: ModelAdjustment,
    requestSpec = spec,
    targetProjectId?: string,
  ) => {
    let submitted: Job | undefined;
    const activeId = targetProjectId || currentId.current || project?.id;
    const baseRevision = currentRevision.current;
    await executeWithJobCheck(
      async () => {
        submitted = await act(async () => {
          if (!activeId) return;
          const snapshot = dataSnapshot(requestSpec);
          const hasPhotos = requestSpec.asset_ids.some((id) =>
            isImageAsset(assets.find((asset) => asset.id === id)),
          );
          const targetMode =
            hasPhotos && requestSpec.mode !== 'import'
              ? ['silhouette', 'relief', 'image', 'multiview'].includes(requestSpec.mode)
                ? requestSpec.mode
                : requestSpec.asset_ids.length > 1
                  ? 'multiview'
                  : 'image'
              : requestSpec.mode;
          const effectiveSpec = {
            ...requestSpec,
            mode: targetMode,
            provider:
              adjustment || requestSpec.modeling_plan?.source_mesh
                ? requestSpec.provider
                : providerForMode(targetMode, requestSpec.provider),
          };
          const j = await call<Job>(adjustment ? 'model.adjust' : 'model.generate', {
            id: activeId,
            base_revision_id: baseRevision,
            spec: effectiveSpec,
            auto_photo: !adjustment && (isPhotoMode(effectiveSpec.mode) || hasPhotos),
            ...(adjustment && { adjustment }),
          });
          if (
            !adjustment &&
            j.spec &&
            currentId.current === activeId &&
            currentRevision.current === j.base_revision_id &&
            dataSnapshot(currentSpec.current) === snapshot
          )
            setSpec(j.spec);
          setJob(j);
          return j;
        });
      },
      adjustment ? '执行局部微调' : '开始 3D 建模',
    );
    return submitted;
  };
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
  const design = async (requestSpec = spec) =>
    executeWithJobCheck(
      () =>
        act(async () => {
          if (!project) return;
          const snapshot = dataSnapshot(requestSpec);
          const j = await call<Job>('model.plan', { id: project.id, spec: requestSpec });
          pendingPlan.current = { id: j.id, spec: snapshot };
          setJob(j);
        }).then(() => {}),
      '重新设计方案',
    );
  const check = async () =>
    act(async () => {
      if (!project) return;
      const p = await call<Project>('model.check', { id: project.id, profile });
      adopt(p);
      setRoom('check');
    });
  const slice = async () =>
    executeWithJobCheck(
      () =>
        act(async () => {
          if (!project) return;
          setJob(await call<Job>('model.slice', { id: project.id, profile }));
        }).then(() => {}),
      '开始切片',
    );
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
  const scanRequested =
    isPhotoMode(spec.mode) &&
    !spec.modeling_plan?.source_mesh &&
    (spec.photo_policy === 'surface' ||
      (spec.photo_policy !== 'parameters' &&
        spec.asset_ids.length >= (preferences?.reconstruction?.min_photos || 3)));
  const needsPlan = !scanRequested && spec.provider === 'parametric' && !hasCurrentPlan(spec);
  const generationBlock = !blenderReady
    ? '请先在家长设置配置本地 Blender。'
    : !hasPhotos && !spec.modeling_plan?.source_mesh && spec.mode !== 'text'
      ? '请先选择当前方式所需的素材。'
      : scanRequested && spec.asset_ids.length < (preferences?.reconstruction?.min_photos || 3)
        ? `请补充至少 ${preferences?.reconstruction?.min_photos || 3} 张同一物体的重叠视角照片。`
        : scanRequested && !preferences?.reconstruction?.available
          ? '实物重建引擎未就绪，请在家长设置查看配置。'
          : needsPlan && (!preferences?.cloud_enabled || !preferences?.chat_configured)
            ? '请先配置并开启 AI 服务，或选择本地模板造物。'
            : needsPlan && isPhotoMode(spec.mode) && !preferences?.chat_supports_images
              ? '照片参考设计需要支持图片输入的 AI 模型。'
              : '';
  const canGenerate = !generationBlock;
  return {
    room,
    setRoom,
    projects,
    project,
    spec,
    setSpec,
    assets,
    setAssets,
    materialLibrary,
    saveMaterials,
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
    openNewProject,
    closeNewProject,
    newProjectModalOpen,
    newProjectOptions,
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
    generationBlock,
    jobConflict,
    setJobConflict,
    cancelCurrentJob,
    continueCurrentJob,
    executeWithJobCheck,
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
