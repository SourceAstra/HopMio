import { Sparkles, Mic, ImagePlus } from 'lucide-react';
import { useStudio } from '../../state/StudioContext';
import { Usagi } from '../../components/Usagi';
import { assetUrl, call } from '../../api/client';
import type { Spec } from '../../types';
export function IdeaPanel() {
  const s = useStudio();
  const image = s.assets.find((a) => a.id === s.spec.asset_ids[0] && a.kind === 'image');
  const patch = (data: Partial<Spec>) => s.setSpec((old) => ({ ...old, ...data }));
  const voice = () => {
    const Speech =
      (
        window as unknown as {
          SpeechRecognition?: new () => SpeechLike;
          webkitSpeechRecognition?: new () => SpeechLike;
        }
      ).SpeechRecognition ||
      (window as unknown as { webkitSpeechRecognition?: new () => SpeechLike })
        .webkitSpeechRecognition;
    if (!Speech) {
      s.setNotice('当前桌面环境不支持语音识别，可以直接输入想法。');
      return;
    }
    const recognition = new Speech();
    recognition.lang = 'zh-CN';
    recognition.onresult = (e) => patch({ prompt: e.results[0][0].transcript });
    recognition.onerror = () => s.setNotice('没有听清楚，请检查麦克风或用文字输入。');
    recognition.start();
  };
  return (
    <section className="panel idea-panel">
      <h2>
        <Sparkles size={20} /> 我的灵感
      </h2>
      <button className="inspiration" onClick={() => s.setRoom('materials')}>
        {image ? (
          <img src={assetUrl(image.id)} alt="我选择的灵感" />
        ) : (
          <>
            <span className="sketch-stars">✧ ♡ ✦</span>
            <Usagi size={126} />
            <span className="sketch-caption">今天，造点什么呀？</span>
          </>
        )}
      </button>
      <div className="prompt-box">
        <textarea
          aria-label="我的造物想法"
          placeholder="做一个乌萨奇摆件，高 80 毫米，细长耳朵、开心的呀哈表情。"
          maxLength={3000}
          value={s.spec.prompt}
          onChange={(e) => patch({ prompt: e.target.value })}
        />
        <div>
          <button className="icon-button" title="喊出你的想法" onClick={voice}>
            <Mic size={16} />
          </button>
          <span>{s.spec.prompt.length}/3000</span>
        </div>
      </div>
      <div className="small-actions">
        <button
          className="link"
          onClick={() =>
            void s.act(async () => {
              const spec = await call<Spec>('idea.interpret', {
                prompt: s.spec.prompt,
                spec: s.spec,
                cloud: false,
              });
              s.setSpec(spec);
              s.setNotice('本地规则已整理心意卡，请确认参数。');
            })
          }
        >
          整理心意卡
        </button>
        <button className="link" onClick={() => s.setRoom('materials')}>
          <ImagePlus size={14} /> 添加材料
        </button>
      </div>
      {s.spec.mode === 'text' && (
        <>
          <label>选择造物方式</label>
          <div className="choice-row">
            <button
              className={s.spec.provider === 'local' ? 'selected' : ''}
              onClick={() => patch({ provider: 'local' })}
            >
              🧩 参数模板<small>不花云端额度</small>
            </button>
            <button
              className={s.spec.provider === 'meshy' ? 'selected' : ''}
              onClick={() => patch({ provider: 'meshy' })}
            >
              ✨ AI 创作<small>需要家长配置</small>
            </button>
          </div>
          {s.spec.provider === 'local' && (
            <select
              aria-label="造物模板"
              value={s.spec.template}
              onChange={(e) => patch({ template: e.target.value })}
            >
              <option value="usagi">乌萨奇 · 呀哈摆件</option>
              {s.spec.template === 'bunny' && <option value="bunny">乌萨奇 · 旧版参数兼容</option>}
              <option value="cup">我的小笔筒</option>
              <option value="plaque">小屋名牌</option>
            </select>
          )}
        </>
      )}
      {s.spec.mode === 'relief' && (
        <select
          aria-label="浮雕类型"
          value={s.spec.relief_kind}
          onChange={(e) => patch({ relief_kind: e.target.value })}
        >
          <option value="relief">浅浮雕（明处凸起）</option>
          <option value="lithophane">透光照片（暗处加厚）</option>
        </select>
      )}
      <button
        className="primary generate"
        disabled={s.running || s.busy}
        onClick={() => void s.generate()}
      >
        <Sparkles size={20} />
        {s.running ? '乌萨奇造物中…' : '生成模型'}
      </button>
      <div className="guide-note">
        <Usagi size={55} />
        <p>
          {['image', 'multiview'].includes(s.spec.mode) || s.spec.provider === 'meshy'
            ? 'AI 会猜想形状。照片看不到的背面，需要你检查。'
            : '先看看轮廓，再决定要不要调整。每次尝试都有新版本！'}
        </p>
      </div>
    </section>
  );
}
interface SpeechLike {
  lang: string;
  start: () => void;
  onresult: (event: { results: { [i: number]: { [i: number]: { transcript: string } } } }) => void;
  onerror: () => void;
}
