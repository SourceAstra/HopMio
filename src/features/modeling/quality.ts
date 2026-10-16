import type { Job, Model } from '../../types';

export function isGeometryOnly(model?: Model | null) {
  return (
    model?.design_review?.status === 'geometry_verified' &&
    model.design_review.scope === 'geometry_only'
  );
}

export function isModelDraft(model?: Model | null) {
  const review = model?.design_review || model?.photo_review;
  return !!review && review.status !== 'accepted' && !isGeometryOnly(model);
}

export function reconstructionReport(model?: Model | null, job?: Job | null) {
  if (job?.kind === 'generate' && job.status !== 'succeeded') {
    return job.reconstruction_quality;
  }
  return job?.status === 'succeeded'
    ? model?.reconstruction || job.reconstruction_quality
    : job?.reconstruction_quality || model?.reconstruction;
}
