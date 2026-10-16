export type Mode = 'text' | 'silhouette' | 'relief' | 'image' | 'multiview' | 'import';
export type Scalar =
  | number
  | { parameter: string }
  | { op: 'add' | 'subtract' | 'multiply' | 'divide'; args: [Scalar, Scalar] };
export interface Parameter {
  value: number;
  label: string;
  unit: 'mm' | 'deg' | 'ratio';
  locked?: boolean;
}
export interface GeometryStep {
  id: string;
  name: string;
  operation: 'add' | 'subtract' | 'intersect';
  shape:
    | 'box'
    | 'rounded_box'
    | 'text'
    | 'cylinder'
    | 'ellipsoid'
    | 'star'
    | 'polygon'
    | 'revolve'
    | 'loft'
    | 'sweep'
    | 'cushion'
    | 'cup'
    | 'usagi';
  size_mm: [Scalar, Scalar, Scalar] | null;
  coordinate_origin?: 'bounds_center' | 'local_origin';
  relative_to?: string | null;
  center_mm: [Scalar, Scalar, Scalar];
  rotation_deg: [Scalar, Scalar, Scalar];
  points: [Scalar, Scalar][];
  sections?: {
    z_mm: Scalar;
    width_mm: Scalar;
    depth_mm: Scalar;
    offset_mm: [Scalar, Scalar];
    exponent: number;
  }[];
  path?: {
    position_mm: [Scalar, Scalar, Scalar];
    width_mm: Scalar;
    depth_mm: Scalar;
    twist_deg: Scalar;
  }[];
  cap?: 'round' | 'flat';
  camber?: number;
  wall_mm: Scalar;
  bottom_mm: Scalar;
  bevel_mm: Scalar;
  corner_radius_mm?: Scalar;
  text?: string;
}
export interface Measurement {
  feature: string;
  expected_mm: number;
  measured_mm: number | null;
  error_mm: number | null;
  max_error_mm: number;
  status: 'pass' | 'fail' | 'unverified';
}
export interface GeometryPlan {
  schema_version: 2 | 3 | 4 | 5 | 6;
  title: string;
  source_prompt: string;
  source_asset_ids: string[];
  model_label: string;
  parameters: Record<string, Parameter>;
  steps: GeometryStep[];
  surface?: { height_mm: Scalar; voxel_mm: Scalar; smooth_iterations: number } | null;
  reference_views?: {
    photo_index: number;
    yaw_deg: number;
    elevation_deg: number;
    region: [number, number, number, number];
    full_object: boolean;
  }[];
  constraints: { feature: string; expected_mm: Scalar; max_error_mm: number }[];
  assumptions: string[];
}
export interface PhotoObservation {
  asset_id: string;
  sha256: string;
  width_px: number;
  height_px: number;
  blur_score: number;
  feature_count: number;
  region: [number, number, number, number];
  warnings: string[];
}
export interface ReconstructionPlan {
  schema_version: 1;
  kind: 'surface';
  title: string;
  source_prompt: string;
  source_asset_ids: string[];
  observations: PhotoObservation[];
  parameters: Record<string, Parameter>;
  scale_reference?: {
    asset_id: string;
    points: [[number, number], [number, number]];
    distance_mm: number;
  } | null;
  assumptions: string[];
}
export interface ReconstructionQuality {
  schema_version?: 'yaha.reconstruction-quality/v1';
  input_views: number;
  registered_views: number;
  sparse_points: number;
  dense_points?: number;
  mean_reprojection_error_px: number;
  unregistered_asset_ids: string[];
  registered_asset_ids?: string[];
  registration_ratio?: number;
  reference_asset_id?: string | null;
  warnings?: string[];
  scale_status?: 'target_height' | 'reference_distance' | null;
  imported_history?: boolean;
  source_faces?: number;
  voxel_mm?: number;
  scale_ratio?: number;
  removed_components?: number;
  removed_volume_ratio?: number;
  textured_surface_ratio?: number | null;
  untextured_faces?: number | null;
  repairs: string[];
}
export interface Spec {
  schema_version: number;
  mode: Mode;
  prompt: string;
  template: string;
  provider: string;
  photo_policy?: 'auto' | 'parameters' | 'surface';
  modeling_plan?: GeometryPlan | null;
  reconstruction_plan?: ReconstructionPlan | null;
  height_mm: number;
  width_mm: number;
  depth_mm: number;
  thickness_mm: number;
  bottom_mm: number;
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
  blend_id?: string;
  manifest_id?: string;
  source_glb_id?: string;
  manufacturing_glb_id?: string;
  comparison_id?: string;
  reference_id?: string;
  reconstruction?: ReconstructionQuality;
  design_review?: {
    schema_version: 'yaha.design-review/v1';
    status: 'accepted' | 'draft_retained' | 'geometry_verified';
    scope: 'design_intent' | 'geometry_only';
    visual_status?: 'unverified';
    message: string;
    findings?: Record<'identity' | 'features' | 'lettering' | 'adjustment' | 'preservation', {
      status: 'pass' | 'revise' | 'unverified';
      observation: string;
    }>;
  };
  photo_fidelity?: {
    schema_version: 'yaha.photo-fidelity/v1';
    appearance_status?: 'accepted' | 'unverified';
    review_scope?: 'photo_reference' | 'design_intent';
    basis: 'calibrated_views' | 'estimated_views' | 'photo_reference';
    status: 'observed_surface' | 'outline_draft';
    input_views: number;
    used_views: number;
    unregistered_asset_ids: string[];
    reprojection_error_px: number | null;
    silhouette_iou: number | null;
    textured_surface_ratio: number | null;
    warnings: string[];
  };
  photo_review?: {
    schema_version?: 'yaha.photo-review/v2';
    status: 'accepted' | 'refined' | 'unchanged' | 'draft_retained';
    scope?: 'photo_reference' | 'design_intent';
    input_views: number;
    passes: number;
    revisions?: number;
    findings?: Record<'silhouette' | 'proportions' | 'pose' | 'parts' | 'details', {
      status: 'pass' | 'revise' | 'unverified';
      observation: string;
      photo_indices: number[];
    }>;
    message?: string;
  };
  outline_fit?: {
    status: string;
    camera_status?: 'estimated';
    input_views?: number;
    used_views?: number;
    before_iou?: number;
    after_iou?: number;
    message?: string;
  };
  adjustment?: ModelAdjustment & { changes: string[]; parts: string[] };
  preview_units?: 'mm' | 'm';
  precision_status?: 'verified' | 'unverified';
  measurements?: Measurement[];
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
  slicing?: SliceReport | null;
  story: string;
  exhibited: boolean;
  printed: boolean;
  updated_at: string;
}
export interface Asset {
  id: string;
  sha256: string;
  name: string;
  extension: string;
  kind: string;
  bytes: number;
}
export interface ModelAdjustment {
  schema_version: 1;
  instruction: string;
  target_part_id?: string;
  location_asset_id?: string;
  location_point?: [number, number];
}
export interface Job {
  error_code?: string;
  id: string;
  project_id: string;
  kind: string;
  spec?: Spec;
  prepared_spec?: Spec;
  adjustment?: ModelAdjustment;
  draft_model?: Pick<Model, 'glb_id' | 'size_mm' | 'faces' | 'origin'> | null;
  base_revision_id?: string | null;
  created_at: string;
  status: string;
  progress: number;
  message: string;
  diagnostics?: { exit_code: number | null; log: string };
  reconstruction_diagnostics?: { stage: string; exit_code: number | null; log: string };
  slicing_diagnostics?: { stage: string; exit_code: number | null; log: string };
  ai_diagnostics?: {
    phase: string;
    elapsed_seconds: number;
    received_chars?: number;
    text_chars?: number;
    usage?: Record<string, unknown>;
    error_code?: string;
    error_type?: string;
  };
  reconstruction_quality?: ReconstructionQuality;
  photo_matching?: {
    schema_version: 'yaha.photo-matching/v1';
    input_views: number;
    pair_count: number;
    connected_views: number;
    largest_group_views: number;
    groups: string[][];
    isolated_asset_ids: string[];
    feature_counts: { asset_id: string; count: number }[];
  };
  result?: {
    project?: Project;
    asset?: Asset;
    spec?: Spec;
    base_revision_id?: string | null;
  };
}
export interface Profile {
  machine: string;
  nozzle_mm: number;
  layer_mm: number;
  material: string;
  margin_mm: number;
}
export interface SliceReport {
  status: 'sliced';
  asset_id: string;
  report_id: string;
  revision_id: string;
  profile: Profile;
  layers: number;
  extrusion_moves: number;
  estimated_time: string | null;
  filament_grams: string | null;
  filament_mm: string | null;
  support: string;
  support_used?: boolean;
  warnings?: { msg: string; level: string; error_code: string }[];
  slicer_version: string;
  print_file_sha256: string;
  physical_printed: false;
}
export interface AIModelItem {
  context_window_tokens?: number;
  max_input_tokens?: number;
  max_tokens?: number;
  timeout_seconds?: number;
  reasoning_effort?: 'low' | 'medium' | 'high' | 'max' | null;
  id: string;
  name: string;
  model: string;
  url: string;
  protocol: 'chat' | 'messages';
  supports_images: boolean;
  has_key?: boolean;
}
export interface Preferences {
  cloud_enabled: boolean;
  daily_limit: number;
  chat_url: string;
  chat_model: string;
  chat_protocol?: 'chat' | 'messages';
  chat_registry_configured?: boolean;
  chat_supports_images?: boolean;
  active_model?: string;
  models?: AIModelItem[];
  theme: string;
  blender?: { available: boolean; version?: string; message: string };
  slicer?: { available: boolean; version?: string; message: string; executable?: string };
  reconstruction?: { available: boolean; message: string; min_photos: number; max_photos: number };
  pin_set: boolean;
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
