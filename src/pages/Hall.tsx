import {
  Sparkles,
  ArrowRight,
  Compass,
  Plus,
  Clock,
  FolderOpen,
  Armchair,
  Layers,
  Lightbulb,
} from 'lucide-react';
import { useStudio } from '../state/StudioContext';
import { providerForMode } from '../theme/modes';
import { House } from '../components/House';
import { Usagi } from '../components/Usagi';
import type { Mode } from '../types';

import { INSPIRATION_ITEMS } from '../theme/inspirations';

export function Hall() {
  const s = useStudio();

  // 开启新作品向导（过度页）
  const enterMode = (modeId: Mode) => {
    s.openNewProject({ mode: modeId });
  };

  return (
    <div className="hall-page-container">
      {/* 顶部乌萨奇小屋迎接主展台 (Hero Sanctuary) */}
      <section className="hall-hero-banner" aria-label="小屋迎接">
        <div className="hall-hero-visual">
          <div className="hall-cottage-wrap">
            <House />
          </div>
          <div className="hall-usagi-welcomer">
            <Usagi size={100} />
            <span className="hall-usagi-speech">呀哈！欢迎回家！✦</span>
          </div>
        </div>

        <div className="hall-hero-content">
          <div className="hall-hero-badge">
            <Sparkles size={14} />
            <span>乌萨奇小屋造物之旅 · 欢迎光临</span>
          </div>
          <h1 className="hall-hero-title">
            别动脑，喊出你的想法
            <span className="hall-title-highlight"> — 剩下的交给乌萨奇</span>
          </h1>
          <p className="hall-hero-desc">
            这里是专为孩子与家长设计的 3D 造物桌。无论是脑海里的一句话、随手拍的照片，
            还是纸上的涂鸦线条，乌萨奇都会在 Blender 雕刻台上把它们变成触手可及的模型。
          </p>

          <div className="hall-hero-actions">
            {s.project && (
              <button
                className="hall-cta-primary"
                onClick={() => s.setRoom('desk')}
                title="回到当前造物工作台"
              >
                <Armchair size={18} />
                <span>走进造物桌继续【{s.project.name}】</span>
                <ArrowRight size={16} />
              </button>
            )}

            <button
              className="hall-cta-secondary"
              onClick={() => s.openNewProject()}
              disabled={s.busy}
              title="开启一件全新的作品"
            >
              <Plus size={16} />
              <span>开启新作品</span>
            </button>
          </div>

          {s.running && (
            <div className="hall-running-pill" onClick={() => s.setRoom('desk')}>
              <span className="running-dot" />
              <span>乌萨奇正在进行 3D 推演与造型雕刻中，点击可进入造物桌查看实时进度</span>
            </div>
          )}
        </div>
      </section>

      {/* 四大造物大门 (Creation Pathways) */}
      <section className="hall-section" aria-label="选择造物方式">
        <div className="hall-section-header">
          <div className="section-title-wrap">
            <Compass size={20} className="section-icon" />
            <h2>选择你的造物大门</h2>
          </div>
          <span className="section-subtitle">挑一种顺手的方式，让灵感在小屋长出形状</span>
        </div>

        <div className="hall-mode-bento">
          {/* 模式 1: 喊出一个想法 */}
          <div
            className="hall-mode-card featured"
            role="button"
            tabIndex={0}
            onClick={() => enterMode('text')}
          >
            <div className="mode-card-badge-row">
              <span className="mode-card-emoji">💬</span>
              <span className="mode-badge-pill highlight">新手推荐 · 最快速</span>
            </div>
            <h3>喊出一个想法</h3>
            <p>只要用一句话描述你想要的东西，AI 大脑与 Blender 实时雕刻成型。</p>
            <div className="mode-card-footer">
              <span className="mode-action-link">
                立即说出愿望 <ArrowRight size={14} />
              </span>
            </div>
          </div>

          {/* 模式 2: 多角度照片建模 */}
          <div
            className="hall-mode-card"
            role="button"
            tabIndex={0}
            onClick={() => enterMode('multiview')}
          >
            <div className="mode-card-badge-row">
              <span className="mode-card-emoji">📸</span>
              <span className="mode-badge-pill">真机环绕拍摄</span>
            </div>
            <h3>多视角实物还原</h3>
            <p>绕着心爱的粘土、手办或小玩具拍一圈照片，稠密推演完整 3D 轮廓。</p>
            <div className="mode-card-footer">
              <span className="mode-action-link">
                选用照片开启还原 <ArrowRight size={14} />
              </span>
            </div>
          </div>

          {/* 模式 3: 单张照片变立体 */}
          <div
            className="hall-mode-card"
            role="button"
            tabIndex={0}
            onClick={() => enterMode('image')}
          >
            <div className="mode-card-badge-row">
              <span className="mode-card-emoji">🧸</span>
              <span className="mode-badge-pill">参考创作</span>
            </div>
            <h3>照片参考创作</h3>
            <p>按照片设计完整三维造型，深度与背面含 AI 推测；精确还原实物请选择多视角重建。</p>
            <div className="mode-card-footer">
              <span className="mode-action-link">
                选择心意照片 <ArrowRight size={14} />
              </span>
            </div>
          </div>

          {/* 模式 4: 画画变挂件 */}
          <div
            className="hall-mode-card"
            role="button"
            tabIndex={0}
            onClick={() => enterMode('silhouette')}
          >
            <div className="mode-card-badge-row">
              <span className="mode-card-emoji">🎨</span>
              <span className="mode-badge-pill">随手涂鸦</span>
            </div>
            <h3>手绘涂鸦变挂件</h3>
            <p>在纸上随手勾勒黑白轮廓，一键拉伸挤出带钥匙孔的个性小吊坠。</p>
            <div className="mode-card-footer">
              <span className="mode-action-link">
                导入手绘线稿 <ArrowRight size={14} />
              </span>
            </div>
          </div>
        </div>

        {/* 辅助模式快捷栏 */}
        <div className="hall-aux-modes">
          <button
            className="aux-mode-chip"
            onClick={() => enterMode('import')}
            title="导入已有的 3D 模型进行体检与打印"
          >
            <FolderOpen size={15} />
            <span>老作品焕新（导入 STL / GLB / 3MF）</span>
          </button>
          <button
            className="aux-mode-chip"
            onClick={() => enterMode('relief')}
            title="将照片灰度转换为立体雕刻浮雕"
          >
            <Layers size={15} />
            <span>照片小浮雕（明暗深度映射）</span>
          </button>
        </div>
      </section>

      {/* 底部精简导航跳板：灵感宝箱与造物足迹（保留 4 / 5，简洁高效） */}
      <section className="hall-portal-grid">
        {/* 4. 乌萨奇的灵感宝箱 */}
        <div
          className="hall-portal-card inspiration-portal"
          role="button"
          tabIndex={0}
          onClick={() => s.setRoom('inspirations')}
          title="打开乌萨奇的灵感宝箱，查看全部想法"
        >
          <div className="portal-card-header">
            <div className="portal-title-wrap">
              <Lightbulb size={18} className="shelf-icon-yellow" />
              <h3>乌萨奇的灵感宝箱</h3>
            </div>
            <span className="shelf-link-btn">
              <span>查看全部 ({INSPIRATION_ITEMS.length})</span>
              <ArrowRight size={13} />
            </span>
          </div>
          <p className="portal-card-tip">
            探索 24+ 个精选造物奇思妙想 · 实用文具、治愈萌宠与解压玩具一网打尽
          </p>
        </div>

        {/* 5. 最近的造物足迹 */}
        <div
          className="hall-portal-card recent-portal"
          role="button"
          tabIndex={0}
          onClick={() => s.setRoom('library')}
          title="去作品柜查看全部历史作品与版本"
        >
          <div className="portal-card-header">
            <div className="portal-title-wrap">
              <Clock size={18} className="shelf-icon-brown" />
              <h3>最近的造物足迹</h3>
            </div>
            <span className="shelf-link-btn">
              <span>全部 ({s.projects.length})</span>
              <ArrowRight size={13} />
            </span>
          </div>
          <p className="portal-card-tip">
            {s.projects.length > 0
              ? `已保存 ${s.projects.length} 件历史造物 · 查看每一次版本记录`
              : '每一次造物尝试都会在此留下足迹 · 点击去作品柜查看'}
          </p>
        </div>
      </section>
    </div>
  );
}
