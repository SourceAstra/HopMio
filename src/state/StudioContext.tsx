import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { call } from '../api/client';
import type { Asset, Bootstrap, Job, Preferences, Profile, Project, Spec } from '../types';
import type { Room } from '../theme/rooms';
import { defaultSpec } from '../theme/modes';

function useStudioState() {
  const [room, setRoom] = useState<Room>('desk');
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
  const adopt = (p: Project) => {
    const sameVersion = currentId.current === p.id && currentRevision.current === p.revision_id;
    currentId.current = p.id;
    currentRevision.current = p.revision_id;
    setProject(p);
    setSpec((old) => (sameVersion ? old : p.spec));
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
      if (data.projects[0]) adopt(data.projects[0]);
      setAssets(data.assets);
      setPreferences(data.settings);
      setProfile(data.profile);
      setReady(true);
    });
  }, []);
  useEffect(() => {
    if (!job || !['queued', 'running'].includes(job.status)) return;
    let canceled = false;
    const timer = setInterval(async () => {
      try {
        const update = await call<Job>('job.get', { id: job.id });
        if (canceled) return;
        setJob(update);
        if (update.status === 'succeeded') {
          if (update.result?.project && currentId.current === update.project_id)
            adopt(update.result.project);
          if (update.result?.asset) {
            const asset = update.result.asset;
            setAssets((old) => [asset, ...old]);
            if (currentId.current === update.project_id)
              setSpec((old) => ({
                ...old,
                asset_ids: [asset.id],
                mode: 'image',
                provider: 'meshy',
              }));
          }
          setNotice(
            update.kind === 'concept'
              ? '概念图已放进取材角，可继续照片变立体。'
              : '呀哈！新版本已经放进作品柜。',
          );
          await refresh();
        } else if (['failed', 'canceled'].includes(update.status)) setNotice(update.message);
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
  const create = async () =>
    act(async () => {
      const p = await call<Project>('project.create', { name: '我的新作品', spec: defaultSpec });
      adopt(p);
      setRoom('desk');
    });
  const generate = async (concept = false, adjust = false) =>
    act(async () => {
      if (!project) return;
      const j = await call<Job>(
        concept ? 'model.concept' : adjust ? 'model.adjust' : 'model.generate',
        { id: project.id, spec },
      );
      setJob(j);
    });
  const check = async () =>
    act(async () => {
      if (!project) return;
      const p = await call<Project>('model.check', { id: project.id, profile });
      adopt(p);
      setRoom('check');
    });
  const dirty = !!project && JSON.stringify(spec) !== JSON.stringify(project.spec);
  const profileMatches =
    !!project?.validation && JSON.stringify(profile) === JSON.stringify(project.validation.profile);
  const canPrepare = !!project?.validation?.can_prepare && profileMatches && !dirty;
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
    generate,
    check,
    dirty,
    profileMatches,
    canPrepare,
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
