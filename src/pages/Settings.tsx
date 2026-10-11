import { useEffect, useState } from 'react';
import { PageHeading } from '../components/PageHeading';
import { GuardianForm } from '../features/settings/GuardianForm';
import { CloudForm } from '../features/settings/CloudForm';
import { useStudio } from '../state/StudioContext';
import { call } from '../api/client';
import type { Job } from '../types';
export function Settings() {
  const s = useStudio();
  const [token, setToken] = useState('');
  const [jobs, setJobs] = useState<Job[]>([]);
  useEffect(() => {
    void s.act(async () => setJobs(await call<Job[]>('job.list')));
  }, []);
  return (
    <>
      <PageHeading
        title="家长与设置"
        description="陪孩子一起创造，也一起管理云端服务、隐私与任务。"
      />
      <div className="two-columns">
        {token ? <CloudForm token={token} /> : <GuardianForm onUnlock={setToken} />}
        <section className="panel form-panel">
          <h2>小屋现在有什么能力</h2>
          <p>🧩 本地模板、轮廓与浮雕：可直接使用</p>
          <p>
            ✨ Meshy：
            {s.preferences?.meshy_configured ? '已配置密钥，等待实际调用' : '尚未配置密钥'}
          </p>
          <p>
            💬 AI 理解：
            {s.preferences?.chat_configured ? '已配置密钥，需服务支持图片和 JSON' : '尚未配置密钥'}
          </p>
          <p>🖨️ 打印机：Bambu Studio 交接，教学模拟</p>
          <h3>最近造物任务</h3>
          {jobs.slice(0, 8).map((j) => (
            <div className="task-row" key={j.id}>
              <strong>
                {j.kind === 'concept' ? '概念图' : '模型造物'} · {j.status}
              </strong>
              <p>{j.message}</p>
              {j.remote_id && <code>云端编号：{j.remote_id}</code>}
              {j.remote_id && ['failed', 'interrupted', 'canceled'].includes(j.status) && (
                <button
                  className="secondary"
                  disabled={s.busy || s.running}
                  onClick={() =>
                    void s.act(async () => {
                      s.setJob(await call<Job>('job.resume', { id: j.id }));
                      s.setNotice('继续查询原云端任务，没有重新提交生成请求。');
                    })
                  }
                >
                  继续查看原任务
                </button>
              )}
            </div>
          ))}
          {!jobs.length && <p>还没有任务记录。</p>}
        </section>
      </div>
    </>
  );
}
