import { useState } from 'react';
import { PageHeading } from '../components/PageHeading';
import { useStudio } from '../state/StudioContext';
import { defaultSpec } from '../theme/modes';
import type { Spec } from '../types';
export function Workshop() {
  const s = useStudio();
  const [code, setCode] = useState(
    JSON.stringify(
      { template: 'usagi', height_mm: 80, width_mm: 48, depth_mm: 36, base: true },
      null,
      2,
    ),
  );
  const apply = () => {
    try {
      const value = JSON.parse(code);
      const keys = [
        'template',
        'height_mm',
        'width_mm',
        'depth_mm',
        'thickness_mm',
        'bottom_mm',
        'base',
        'hole',
        'hole_shape',
      ];
      if (Object.keys(value).some((k) => !keys.includes(k)))
        throw new Error('这个练习只允许修改显示的造物参数。');
      s.setSpec({ ...defaultSpec, ...value, prompt: '我在小屋工坊修改的作品' } as Spec);
      s.setRoom('desk');
      s.setNotice('你的修改已带到造物桌，点击生成看看结果。');
    } catch (e) {
      s.setNotice((e as Error).message);
    }
  };
  return (
    <>
      <PageHeading
        title="小屋工坊"
        description="这是你的第一个软件作品。先改一点点，看变化，再认识真正的代码。"
      />
      <div className="two-columns">
        <section className="panel form-panel">
          <span className="pill">练习 01 · 认识参数</span>
          <h2>给乌萨奇改一个尺寸</h2>
          <p>把 height_mm 从 80 改成 100。把 base 改成 true，乌萨奇就有底座了。</p>
          <textarea
            className="code-editor"
            aria-label="造物参数代码"
            rows={14}
            spellCheck={false}
            value={code}
            onChange={(e) => setCode(e.target.value)}
          />
          <button className="primary" onClick={apply}>
            把我的修改带到造物桌 →
          </button>
        </section>
        <section className="panel form-panel">
          <h2>我可以从这些地方开始</h2>
          <div className="lesson">
            <strong>🎨 修改小屋颜色</strong>
            <code>src/styles/tokens.css</code>
            <p>找到 --accent，试一试自己喜欢的黄色。</p>
          </div>
          <div className="lesson">
            <strong>🧩 修改造物参数</strong>
            <code>backend/yaha/modeling/templates.py</code>
            <p>修改参数和部件关系，交给 Blender 完成实际几何。</p>
          </div>
          <div className="lesson">
            <strong>🏡 修改房间名字</strong>
            <code>src/theme/rooms.ts</code>
            <p>修改 name，给房间起一个自己的名字。</p>
          </div>
          <p className="soft-notice">工坊参数只作为数据读取。作品包和上传文件不会执行代码。</p>
        </section>
      </div>
    </>
  );
}
