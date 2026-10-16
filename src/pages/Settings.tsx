import { useEffect, useState } from 'react';
import { PageHeading } from '../components/PageHeading';
import { CloudForm } from '../features/settings/CloudForm';
import { useStudio } from '../state/StudioContext';
import { call } from '../api/client';
import type { Job } from '../types';
export function Settings() {
  const s = useStudio();
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
      <div className="settings-layout">
        {s.preferences && <CloudForm />}
        <details className="panel settings-runtime">
          <summary>
            <strong>小屋能力与最近任务</strong>
            <span>查看建模、重建与打印工具状态</span>
          </summary>
          <div className="form-panel settings-runtime-body">
            <p>
              🧩 本地建模：
              {s.preferences?.blender?.available
                ? s.preferences.blender.version
                : s.preferences?.blender?.message || '读取中'}
            </p>
            {!s.preferences?.blender?.available && (
              <p className="soft-notice">
                Windows 运行“安装建模工具.cmd”；Linux 运行 ./setup.sh --blender，安装后重启小屋。
              </p>
            )}
            <p>
              💬 AI 理解与参数建模：
              {s.preferences?.chat_configured
                ? s.preferences.chat_supports_images
                  ? `已配置密钥（${s.preferences.chat_model || '云端模型'}），可提交文字与照片方案`
                  : `已配置密钥（${s.preferences.chat_model || '云端模型'}），仅提交文字方案`
                : '尚未配置密钥'}
            </p>
            <p>表面重建：{s.preferences?.reconstruction?.message || '读取中'}</p>
            <p>A1 mini 切片：{s.preferences?.slicer?.message || '读取中'}</p>
            <p className="soft-notice">
              安装完整工具：Windows 运行“安装建模工具.cmd”；Linux 运行
              ./setup.sh。原始扫描、制造网格与切片文件分别保存。
            </p>
            <h3>最近造物任务</h3>
            {jobs.slice(0, 8).map((j) => (
              <div className="task-row" key={j.id}>
                <strong>
                  {j.kind === 'plan'
                    ? '建模方案'
                    : j.kind === 'adjust'
                      ? 'AI 细节调整'
                      : j.kind === 'repair'
                        ? '网格修复'
                        : j.kind === 'slice'
                          ? '实际切片'
                          : '模型造物'}{' '}
                  · {j.status}
                </strong>
                <p>{j.message}</p>
                {j.diagnostics && (
                  <details>
                    <summary>查看建模记录</summary>
                    <pre className="modeling-log">{j.diagnostics.log}</pre>
                  </details>
                )}
              </div>
            ))}
            {!jobs.length && <p>还没有任务记录。</p>}
          </div>
        </details>
      </div>
    </>
  );
}
