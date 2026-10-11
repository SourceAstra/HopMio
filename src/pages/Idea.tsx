import { useStudio } from '../state/StudioContext';
import { PageHeading } from '../components/PageHeading';
import { call } from '../api/client';
import type { Spec } from '../types';
import { Usagi } from '../components/Usagi';
export function Idea() {
  const s = useStudio();
  return (
    <>
      <PageHeading
        title="心意卡"
        description="先一起确认：要做什么、多大、给谁、有没有乌萨奇猜错的地方。"
      />
      <div className="two-columns">
        <section className="panel form-panel">
          <h2>告诉乌萨奇你的想法</h2>
          <textarea
            aria-label="心意卡描述"
            rows={6}
            value={s.spec.prompt}
            onChange={(e) => s.setSpec((old) => ({ ...old, prompt: e.target.value }))}
          />
          <div className="button-row">
            <button
              className="secondary"
              disabled={s.busy}
              onClick={() =>
                void s.act(async () =>
                  s.setSpec(
                    await call<Spec>('idea.interpret', {
                      prompt: s.spec.prompt,
                      spec: s.spec,
                      cloud: false,
                    }),
                  ),
                )
              }
            >
              本地整理
            </button>
            <button
              className="primary"
              disabled={s.busy}
              onClick={() =>
                void s.act(async () =>
                  s.setSpec(
                    await call<Spec>('idea.interpret', {
                      prompt: s.spec.prompt,
                      spec: s.spec,
                      cloud: true,
                    }),
                  ),
                )
              }
            >
              AI 理解文字与照片
            </button>
          </div>
          <small>AI 理解需要多模态服务配置，也计入家长设置的云端次数。</small>
          <button
            className="secondary"
            disabled={s.busy || s.running}
            onClick={() => void s.generate(true)}
          >
            ✨ 先生成一张概念图（Meshy）
          </button>
        </section>
        <section className="panel idea-summary">
          <Usagi size={100} />
          <h2>我们准备做…</h2>
          <dl>
            <dt>形状</dt>
            <dd>
              {['usagi', 'bunny'].includes(s.spec.template)
                ? '乌萨奇 · 呀哈摆件'
                : s.spec.template === 'cup'
                  ? '笔筒'
                  : '自定义作品'}
            </dd>
            <dt>尺寸</dt>
            <dd>
              {s.spec.width_mm} × {s.spec.depth_mm} × {s.spec.height_mm} mm
            </dd>
            <dt>额外设计</dt>
            <dd>
              {[s.spec.base ? '带底座' : '', s.spec.hole ? '带挂孔' : '']
                .filter(Boolean)
                .join('、') || '保持原来的轮廓'}
            </dd>
          </dl>
          <h3>需要你确认</h3>
          {(s.spec.assumptions.length
            ? s.spec.assumptions
            : ['尺寸是默认值，可以在造物桌调整。', '照片里看不到的部分，AI 可能会猜错。']
          ).map((a, i) => (
            <p key={i} className="soft-notice">
              {a}
            </p>
          ))}
          <button className="primary" onClick={() => s.setRoom('desk')}>
            确认想法，去造物 →
          </button>
        </section>
      </div>
    </>
  );
}
