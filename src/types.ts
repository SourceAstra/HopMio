export type Mode = 'text' | 'silhouette' | 'relief' | 'image' | 'multiview' | 'import';
export interface Spec {
  schema_version: number;
  mode: Mode;
  prompt: string;
  template: string;
  provider: string;
  height_mm: number;
  width_mm: number;
  depth_mm: number;
  thickness_mm: number;
  ear_scale: number;
  base: boolean;
  hole: boolean;
  hole_shape: string;
  relief_kind: string;
  asset_ids: string[];
  assumptions: string[];
}
export interface Model {
  stl_id: string;
  glb_id: string;
  size_mm: number[];
  faces: number;
  volume_mm3: number;
  origin: string;
}
export interface Report {
  profile: Profile;
  revision_id: string;
  profile_hash: string;
  can_prepare: boolean;
  size_mm: number[];
  components: number;
  items: { name: string; status: 'pass' | 'warn' | 'fail'; detail: string }[];
}
export interface Project {
  id: string;
  name: string;
  spec: Spec;
  model: Model | null;
  revision_id: string | null;
  revision_count: number;
  validation: Report | null;
  story: string;
  exhibited: boolean;
  printed: boolean;
  updated_at: string;
}
export interface Asset {
  id: string;
  name: string;
  extension: string;
  kind: string;
  bytes: number;
}
export interface Job {
  id: string;
  project_id: string;
  kind: string;
  status: string;
  progress: number;
  message: string;
  remote_id?: string;
  result?: { project?: Project; asset?: Asset };
}
export interface Profile {
  machine: string;
  nozzle_mm: number;
  layer_mm: number;
  material: string;
  margin_mm: number;
}
export interface Preferences {
  cloud_enabled: boolean;
  daily_limit: number;
  meshy_model: string;
  chat_url: string;
  chat_model: string;
  theme: string;
  pin_set: boolean;
  meshy_configured: boolean;
  chat_configured: boolean;
}
export interface Revision {
  id: string;
  reason: string;
  created_at: string;
  model: Model;
  spec: Spec;
}
export interface Bootstrap {
  projects: Project[];
  assets: Asset[];
  settings: Preferences;
  profile: Profile;
  jobs: Job[];
}
declare global {
  interface Window {
    yaha?: {
      desktop: boolean;
      call: (method: string, params?: unknown) => Promise<unknown>;
      save: (id: string) => Promise<{ canceled?: boolean; saved?: boolean }>;
      openStudio: (id: string) => Promise<{ handed_off?: boolean; canceled?: boolean }>;
    };
  }
}
