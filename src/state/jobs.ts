import { call } from '../api/client';
import type { Job } from '../types';

export const isActiveJob = (job?: Job | null) =>
  !!job && ['queued', 'running'].includes(job.status);

export async function activeJobs() {
  return (await call<Job[]>('job.list')).filter(isActiveJob);
}

export async function stopJob(id: string): Promise<Job> {
  let job = await call<Job>('job.cancel', { id });
  const deadline = Date.now() + 30_000;
  while (isActiveJob(job)) {
    if (Date.now() >= deadline)
      throw new Error('任务仍在停止中，请等待当前步骤退出后重试；尚未开启新造物。');
    await new Promise((resolve) => setTimeout(resolve, 500));
    job = await call<Job>('job.get', { id });
  }
  return job;
}
