import { useState, useMemo } from 'react';
import {
  Lightbulb,
  Search,
  Sparkles,
  ArrowRight,
  ArrowLeft,
  Copy,
  Check,
  Compass,
} from 'lucide-react';
import { useStudio } from '../state/StudioContext';
import { PageHeading } from '../components/PageHeading';
import { Usagi } from '../components/Usagi';
import {
  INSPIRATION_ITEMS,
  INSPIRATION_CATEGORIES,
  type InspirationItem,
  type InspirationCategoryId,
} from '../theme/inspirations';

export function Inspirations() {
  const s = useStudio();
  const [activeCategory, setActiveCategory] = useState<InspirationCategoryId>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // 过滤后的灵感列表
  const filteredItems = useMemo(() => {
    return INSPIRATION_ITEMS.filter((item) => {
      const matchCategory =
        activeCategory === 'all' || item.category === activeCategory;
      const query = searchQuery.trim().toLowerCase();
      const matchQuery =
        !query ||
        item.title.toLowerCase().includes(query) ||
        item.desc.toLowerCase().includes(query) ||
        item.prompt.toLowerCase().includes(query) ||
        (item.tag && item.tag.toLowerCase().includes(query));
      return matchCategory && matchQuery;
    });
  }, [activeCategory, searchQuery]);

  // 一键以此灵感开启造物
  const startWithInspiration = (item: InspirationItem) => {
    void s.create(
      {
        mode: 'text',
        prompt: item.prompt,
        template: 'usagi',
        provider: 'parametric',
      },
      item.title,
    );
  };

  // 复制提示词
  const handleCopyPrompt = async (item: InspirationItem, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(item.prompt);
      setCopiedId(item.id);
      s.setNotice(`已复制灵感提示词：${item.title}`);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      s.setNotice('复制失败，请手动选取');
    }
  };

  // 各分类下的数量统计
  const countsByCategory = useMemo(() => {
    const counts: Record<string, number> = { all: INSPIRATION_ITEMS.length };
    INSPIRATION_ITEMS.forEach((it) => {
      counts[it.category] = (counts[it.category] || 0) + 1;
    });
    return counts;
  }, []);

  return (
    <div className="inspirations-page">
      <PageHeading
        title="乌萨奇的灵感宝箱"
        description="这里收纳了乌萨奇从小屋各处搜罗的海量奇思妙想！挑一个喜欢的点子，一键搬上造物桌开始创作。"
        actions={
          <div className="inspiration-heading-actions">
            <button
              className="secondary nav-back-btn"
              onClick={() => s.setRoom('hall')}
              title="推门回到小屋门厅"
            >
              <ArrowLeft size={16} />
              <span>返回小屋门厅</span>
            </button>
            <button
              className="primary"
              onClick={() => void s.create()}
              title="不使用预设，直接开启空白作品"
            >
              ＋ 自主开启造物
            </button>
          </div>
        }
      />

      {/* 乌萨奇灵感横幅 */}
      <section className="inspiration-hero-card" aria-label="灵感指引">
        <div className="inspiration-hero-usagi">
          <Usagi size={110} />
          <span className="inspiration-speech-bubble">呀哈！想要做点什么酷玩具？✦</span>
        </div>
        <div className="inspiration-hero-text">
          <div className="inspiration-hero-badge">
            <Sparkles size={14} />
            <span>海量奇思妙想 · 一键直达造物桌</span>
          </div>
          <h2>不知道从哪开始？翻翻乌萨奇的藏宝箱！</h2>
          <p>
            点击任意喜欢的灵感卡片，乌萨奇会自动帮你把想法和提示词填好，带你进入造物桌面直接开工！
          </p>
          <div className="inspiration-hero-stats">
            <div className="hero-stat-pill">
              <Lightbulb size={14} className="stat-icon-yellow" />
              <span>
                <strong>{INSPIRATION_ITEMS.length}</strong> 个奇思妙想
              </span>
            </div>
            <div className="hero-stat-pill">
              <Compass size={14} className="stat-icon-gold" />
              <span>
                <strong>5</strong> 大精选分类
              </span>
            </div>
            <div className="hero-stat-pill">
              <Sparkles size={14} className="stat-icon-orange" />
              <span>零门槛 · 极易3D打印</span>
            </div>
          </div>
        </div>
      </section>

      {/* 筛选与搜索工具条 */}
      <section className="inspiration-toolbar" aria-label="筛选与搜索">
        <div className="inspiration-category-pills" role="tablist">
          {INSPIRATION_CATEGORIES.map((cat) => {
            const isActive = activeCategory === cat.id;
            const count = countsByCategory[cat.id] || 0;
            return (
              <button
                key={cat.id}
                role="tab"
                aria-selected={isActive}
                className={`inspiration-cat-pill ${isActive ? 'active' : ''}`}
                onClick={() => setActiveCategory(cat.id)}
              >
                <span>{cat.label}</span>
                <span className="cat-count">({count})</span>
              </button>
            );
          })}
        </div>

        <div className="inspiration-search-box">
          <Search size={16} className="search-icon" />
          <input
            type="text"
            placeholder="搜索灵感点子、关键词（如：印章、猫、钥匙扣、恐龙）…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            aria-label="搜索灵感"
          />
          {searchQuery && (
            <button
              className="clear-search-btn"
              onClick={() => setSearchQuery('')}
              title="清空搜索"
            >
              ×
            </button>
          )}
        </div>
      </section>

      {/* 灵感卡片网格 */}
      <section className="inspiration-cards-section" aria-label="灵感列表">
        {filteredItems.length > 0 ? (
          <div className="inspiration-grid-showcase">
            {filteredItems.map((item) => (
              <article
                key={item.id}
                className={`inspiration-chest-card ${item.featured ? 'featured' : ''}`}
                onClick={() => startWithInspiration(item)}
                role="button"
                tabIndex={0}
                title={`以此开启造物：${item.title}`}
              >
                <div className="chest-card-header">
                  <span className="chest-card-emoji">{item.emoji}</span>
                  <div className="chest-card-titles">
                    <h3 className="chest-card-title">{item.title}</h3>
                    <div className="chest-card-badges">
                      <span className="chest-badge-category">{item.categoryLabel}</span>
                      {item.tag && <span className="chest-badge-tag">{item.tag}</span>}
                    </div>
                  </div>
                </div>

                <p className="chest-card-desc">{item.desc}</p>

                <div className="chest-prompt-preview">
                  <div className="prompt-label-row">
                    <span className="prompt-label">
                      <Lightbulb size={12} /> 造物提示词
                    </span>
                    <button
                      type="button"
                      className="prompt-copy-btn"
                      onClick={(e) => handleCopyPrompt(item, e)}
                      title="复制此提示词"
                    >
                      {copiedId === item.id ? (
                        <>
                          <Check size={12} /> 已复制
                        </>
                      ) : (
                        <>
                          <Copy size={12} /> 复制
                        </>
                      )}
                    </button>
                  </div>
                  <p className="prompt-text">“{item.prompt}”</p>
                </div>

                <div className="chest-card-footer">
                  <span className="chest-cta-text">
                    以此开启造物 <ArrowRight size={14} />
                  </span>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="inspiration-empty-state">
            <span className="empty-emoji">🔍</span>
            <h3>没有找到匹配的灵感</h3>
            <p>换个搜索词试试，或者直接喊出你的专属想法！</p>
            <div className="empty-actions">
              <button
                className="secondary"
                onClick={() => {
                  setSearchQuery('');
                  setActiveCategory('all');
                }}
              >
                清除筛选条件
              </button>
              <button className="primary" onClick={() => void s.create()}>
                直接去造物桌面开工
              </button>
            </div>
          </div>
        )}
      </section>

      {/* 底部引导号召 */}
      <section className="inspiration-footer-banner">
        <div className="footer-banner-content">
          <h3>脑海里还有其他奇思妙想？</h3>
          <p>“别动脑，喊出你的想法 —— 剩下的交给乌萨奇。”</p>
        </div>
        <button
          className="primary footer-start-btn"
          onClick={() => {
            s.setRoom('desk');
          }}
        >
          <span>进入造物桌面自由探索</span>
          <ArrowRight size={16} />
        </button>
      </section>
    </div>
  );
}
