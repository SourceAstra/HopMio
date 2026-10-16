import { ShieldCheck, Sparkles } from 'lucide-react';
import { Usagi } from '../../components/Usagi';

export function ModelSettingsHeader({
  count,
  ready,
  active,
}: {
  count: number;
  ready: number;
  active?: string;
}) {
  return (
    <header className="model-settings-hero">
      <div className="model-hero-copy">
        <span className="model-eyebrow">
          <Sparkles size={14} /> 乌萨奇的灵感搭档
        </span>
        <h2>为小屋连接更多聪明伙伴</h2>
        <p>连接服务、发现模型，再用文字和图片试一试。选好搭档，让想法继续长大。</p>
        <div className="model-hero-stats">
          <span>
            <strong>{count}</strong> 个候选模型
          </span>
          <span>
            <strong>{ready}</strong> 个已配密钥
          </span>
          <span>
            <ShieldCheck size={14} /> 密钥由系统安全保管
          </span>
        </div>
      </div>
      <div className="model-hero-companion">
        <Usagi size={96} />
        <span>呀哈，一起试试！</span>
      </div>
      <div className="model-current">
        <span className="model-live-dot" />
        <span>当前选择</span>
        <strong>{active || '还没有选择模型'}</strong>
      </div>
    </header>
  );
}
