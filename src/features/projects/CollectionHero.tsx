import { Sparkles, Trophy, Library, Printer, BookOpen, Plus, ArrowRight } from 'lucide-react';
import { Usagi } from '../../components/Usagi';
import { House } from '../../components/House';

export function CollectionHero({
  mode,
  totalCount,
  exhibitedCount,
  printedCount,
  storyCount,
  onSwitchMode,
  onCreateNew,
  disabled,
}: {
  mode: 'gallery' | 'library';
  totalCount: number;
  exhibitedCount: number;
  printedCount: number;
  storyCount: number;
  onSwitchMode: (target: 'gallery' | 'library') => void;
  onCreateNew: () => void;
  disabled?: boolean;
}) {
  const isGallery = mode === 'gallery';

  return (
    <header className={`collection-hero-banner ${isGallery ? 'hero-gallery' : 'hero-library'}`} aria-label="作品与展厅总览">
      <div className="collection-hero-main">
        {/* 顶部小标与双向快速切换药丸 */}
        <div className="collection-hero-top-row">
          <div className="collection-hero-badge">
            <Sparkles size={13} />
            <span>USAGI&apos;S COTTAGE · 乌萨奇的小屋</span>
          </div>

          <div className="collection-room-switcher" role="tablist" aria-label="展厅与作品柜切换">
            <button
              type="button"
              role="tab"
              aria-selected={isGallery}
              className={`switcher-pill ${isGallery ? 'active' : ''}`}
              onClick={() => onSwitchMode('gallery')}
              title="切换到乌萨奇展厅"
            >
              <Trophy size={13} />
              <span>乌萨奇展厅 ({exhibitedCount})</span>
            </button>

            <button
              type="button"
              role="tab"
              aria-selected={!isGallery}
              className={`switcher-pill ${!isGallery ? 'active' : ''}`}
              onClick={() => onSwitchMode('library')}
              title="切换到作品柜"
            >
              <Library size={13} />
              <span>全部作品柜 ({totalCount})</span>
            </button>
          </div>
        </div>

        {/* 主标题与副标题 */}
        <h1 className="collection-hero-title">
          {isGallery ? '乌萨奇展厅' : '作品柜'}
          <span className="collection-hero-subtitle">
            {isGallery ? ' · 亲子共创故事墙' : ' · 灵感与版本档案'}
          </span>
        </h1>

        <p className="collection-hero-desc">
          {isGallery
            ? '这里展示从作品柜精选出的作品。每一件作品都凝聚着独一无二的造物记忆，把我们的创作故事长久留在小屋里。'
            : '每个奇思妙想都有属于自己的格子。随时翻看每一次造物尝试，自由切换历史版本，找回最喜欢的形状。'}
        </p>

        {/* 核心指标微章群 */}
        <div className="collection-hero-chips">
          <div className="collection-chip highlight">
            <Trophy size={14} />
            <span>
              展厅收录：
              <strong>{exhibitedCount}</strong> 件精选
            </span>
          </div>

          <div className="collection-chip">
            <Library size={14} />
            <span>
              全部创作：
              <strong>{totalCount}</strong> 个作品
            </span>
          </div>

          <div className="collection-chip">
            <BookOpen size={14} />
            <span>
              沉淀故事：
              <strong>{storyCount}</strong> 篇
            </span>
          </div>

          {printedCount > 0 && (
            <div className="collection-chip success">
              <Printer size={14} />
              <span>
                实体制造：
                <strong>{printedCount}</strong> 件
              </span>
            </div>
          )}

          {!isGallery && (
            <button
              type="button"
              className="primary collection-hero-cta"
              disabled={disabled}
              onClick={onCreateNew}
              title="开启一件全新的作品"
            >
              <Plus size={15} />
              <span>开启新作品</span>
            </button>
          )}

          {isGallery && totalCount > exhibitedCount && (
            <button
              type="button"
              className="secondary collection-hero-cta"
              disabled={disabled}
              onClick={() => onSwitchMode('library')}
              title="从作品柜挑选更多作品放入展厅"
            >
              <Library size={14} />
              <span>去作品柜挑选展品</span>
              <ArrowRight size={14} />
            </button>
          )}
        </div>
      </div>

      {/* 右侧乌萨奇小屋陪伴与欢迎视觉 */}
      <div className="collection-hero-visual">
        <div className="collection-cottage-backdrop">
          <House />
        </div>
        <div className="collection-usagi-welcomer">
          <Usagi size={92} />
          <span className="collection-usagi-speech">
            {isGallery ? '呀哈！看我的得意之作～✦' : '每个作品都值得珍藏～✦'}
          </span>
        </div>
      </div>
    </header>
  );
}
