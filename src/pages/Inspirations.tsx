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
  Plus,
  Pencil,
  Trash2,
  RotateCcw,
  Filter,
} from 'lucide-react';
import { useStudio } from '../state/StudioContext';
import { PageHeading } from '../components/PageHeading';
import { Usagi } from '../components/Usagi';
import {
  INSPIRATION_CATEGORIES,
  type InspirationItem,
  type InspirationCategoryId,
} from '../theme/inspirations';
import { useInspirations } from '../features/inspirations/inspirationsStore';
import { InspirationEditorModal } from '../features/inspirations/InspirationEditorModal';
import { InspirationDeleteConfirmModal } from '../features/inspirations/InspirationDeleteConfirmModal';

export function Inspirations() {
  const s = useStudio();
  const { items, addItem, updateItem, deleteItem, resetDefaults } = useInspirations();

  const [activeCategory, setActiveCategory] = useState<InspirationCategoryId>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // 弹窗状态
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<InspirationItem | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deletingItem, setDeletingItem] = useState<InspirationItem | null>(null);

  // 过滤后的灵感列表
  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      let matchCategory = true;
      if (activeCategory === 'custom') {
        matchCategory = Boolean(item.isCustom) || item.category === 'custom';
      } else if (activeCategory !== 'all') {
        matchCategory = item.category === activeCategory;
      }

      const query = searchQuery.trim().toLowerCase();
      const matchQuery =
        !query ||
        item.title.toLowerCase().includes(query) ||
        item.desc.toLowerCase().includes(query) ||
        item.prompt.toLowerCase().includes(query) ||
        (item.tag && item.tag.toLowerCase().includes(query));

      return matchCategory && matchQuery;
    });
  }, [items, activeCategory, searchQuery]);

  // 各分类下的数量统计
  const countsByCategory = useMemo(() => {
    const counts: Record<string, number> = { all: items.length };
    let customCount = 0;

    items.forEach((it) => {
      counts[it.category] = (counts[it.category] || 0) + 1;
      if (it.isCustom || it.category === 'custom') {
        customCount++;
      }
    });

    counts.custom = customCount;
    return counts;
  }, [items]);

  // 一键以此灵感开启造物：回到首页并装填灵感提示词
  const startWithInspiration = (item: InspirationItem) => {
    s.setSpec({
      ...s.spec,
      mode: 'text',
      prompt: item.prompt,
    });
    s.setRoom('desk');
    s.setNotice(`✦ 已装填灵感：「${item.title}」，点击发送开启造物！`);
    window.dispatchEvent(
      new CustomEvent('yaha-apply-inspiration', {
        detail: {
          prompt: item.prompt,
          name: item.title,
        },
      }),
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

  // 打开新增弹窗
  const handleOpenAdd = () => {
    setEditingItem(null);
    setEditorOpen(true);
  };

  // 打开编辑弹窗
  const handleOpenEdit = (item: InspirationItem, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingItem(item);
    setEditorOpen(true);
  };

  // 打开删除确认
  const handleOpenDelete = (item: InspirationItem, e: React.MouseEvent) => {
    e.stopPropagation();
    setDeletingItem(item);
    setDeleteConfirmOpen(true);
  };

  // 保存新增或修改
  const handleSaveInspiration = (data: {
    title: string;
    emoji: string;
    prompt: string;
    desc: string;
    category: InspirationItem['category'];
    categoryLabel: string;
    tag?: string;
    isCustom?: boolean;
  }) => {
    if (editingItem) {
      updateItem(editingItem.id, data);
      s.setNotice(`✦ 已更新灵感：「${data.title}」`);
    } else {
      addItem(data);
      s.setNotice(`✦ 乌萨奇已将「${data.title}」妥善收进宝箱！`);
      // 自动切换到全部或脑洞标签以展示最新成果
      if (activeCategory !== 'all' && activeCategory !== 'custom') {
        setActiveCategory('custom');
      }
    }
  };

  // 确认删除
  const handleConfirmDelete = () => {
    if (deletingItem) {
      deleteItem(deletingItem.id);
      s.setNotice(`已放飞灵感：「${deletingItem.title}」`);
      setDeletingItem(null);
    }
  };

  // 恢复默认灵感
  const handleResetDefaults = () => {
    if (window.confirm('确定要恢复乌萨奇官方预置灵感库吗？这将重置所有灵感为初始宝箱。')) {
      resetDefaults();
      s.setNotice('已恢复乌萨奇官方预设灵感库！');
    }
  };

  return (
    <div className="inspirations-page">
      <PageHeading
        title="乌萨奇的灵感宝箱"
        description="这里收纳了乌萨奇与小朋友的全部奇思妙想！你可以记下新点子，挑选喜欢的点子一键搬上造物桌。"
        actions={
          <div className="inspiration-heading-actions">
            <button
              type="button"
              className="primary inspiration-add-btn"
              onClick={handleOpenAdd}
              title="写下小朋友自己的奇思妙想"
            >
              <Plus size={16} />
              <span>＋ 记下我的灵感</span>
            </button>
            <button
              type="button"
              className="secondary nav-back-btn"
              onClick={() => s.setRoom('hall')}
              title="推门回到小屋门厅"
            >
              <ArrowLeft size={16} />
              <span>返回小屋大厅</span>
            </button>
            <button
              type="button"
              className="secondary reset-btn"
              onClick={handleResetDefaults}
              title="重置为官方预置宝箱"
            >
              <RotateCcw size={14} />
              <span>恢复预设</span>
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
            点击任意喜欢的灵感卡片，乌萨奇会自动帮你把想法和提示词填好，带你进入造物桌面直接开工！小朋友也可以随时点击右上角「＋ 记下我的灵感」，存下专属小脑洞。
          </p>
          <div className="inspiration-hero-stats">
            <div className="hero-stat-pill">
              <Lightbulb size={14} className="stat-icon-yellow" />
              <span>
                <strong>{items.length}</strong> 个奇思妙想
              </span>
            </div>
            <div className="hero-stat-pill">
              <Sparkles size={14} className="stat-icon-gold" />
              <span>
                <strong>{countsByCategory.custom || 0}</strong> 个小朋友脑洞
              </span>
            </div>
            <div className="hero-stat-pill">
              <Compass size={14} className="stat-icon-orange" />
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

        {/* 右侧筛选组合：分类下拉框 + 关键词搜索 */}
        <div className="inspiration-toolbar-right">
          <div className="inspiration-select-wrapper" title="选择分类快速筛选">
            <Filter size={14} className="select-icon" />
            <select
              className="inspiration-category-select"
              value={activeCategory}
              onChange={(e) => setActiveCategory(e.target.value as InspirationCategoryId)}
              aria-label="按分类快速下拉选择"
            >
              {INSPIRATION_CATEGORIES.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.label} ({countsByCategory[cat.id] || 0})
                </option>
              ))}
            </select>
          </div>

          <div className="inspiration-search-box">
            <Search size={16} className="search-icon" />
            <input
              type="text"
              placeholder="搜索灵感点子（如：激光剑、飞龙、笔筒、开书器）…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              aria-label="搜索灵感"
            />
            {searchQuery && (
              <button
                type="button"
                className="clear-search-btn"
                onClick={() => setSearchQuery('')}
                title="清空搜索"
              >
                ×
              </button>
            )}
          </div>
        </div>
      </section>

      {/* 灵感卡片网格 */}
      <section className="inspiration-cards-section" aria-label="灵感列表">
        {filteredItems.length > 0 ? (
          <div className="inspiration-grid-showcase">
            {filteredItems.map((item) => (
              <article
                key={item.id}
                className={`inspiration-chest-card ${item.featured ? 'featured' : ''} ${item.isCustom ? 'custom-chest-card' : ''}`}
                onClick={() => startWithInspiration(item)}
                role="button"
                tabIndex={0}
                title={`以此开启造物：${item.title}`}
              >
                <div className="chest-card-header">
                  <span className="chest-card-emoji">{item.emoji}</span>
                  <div className="chest-card-titles">
                    <div className="chest-title-row">
                      <h3 className="chest-card-title">{item.title}</h3>
                      {item.isCustom && (
                        <span className="chest-badge-custom">
                          <Sparkles size={11} /> 小朋友创作
                        </span>
                      )}
                    </div>
                    <div className="chest-card-badges">
                      <span className="chest-badge-category">{item.categoryLabel}</span>
                      {item.tag && <span className="chest-badge-tag">{item.tag}</span>}
                    </div>
                  </div>

                  {/* 卡片右上角独立快捷操作工具条 */}
                  <div className="chest-card-actions" onClick={(e) => e.stopPropagation()}>
                    <button
                      type="button"
                      className="chest-action-btn edit-btn"
                      onClick={(e) => handleOpenEdit(item, e)}
                      title="编辑灵感"
                      aria-label="编辑灵感"
                    >
                      <Pencil size={13} />
                    </button>
                    <button
                      type="button"
                      className="chest-action-btn delete-btn"
                      onClick={(e) => handleOpenDelete(item, e)}
                      title="放飞删除灵感"
                      aria-label="删除灵感"
                    >
                      <Trash2 size={13} />
                    </button>
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
            <span className="empty-emoji">
              {activeCategory === 'custom' ? '✨' : '🔍'}
            </span>
            <h3>
              {activeCategory === 'custom'
                ? '小朋友还没有记下自己的小脑洞'
                : '没有找到匹配的灵感'}
            </h3>
            <p>
              {activeCategory === 'custom'
                ? '快点击上方「＋ 记下我的灵感」，写下第一个奇思妙想吧！'
                : '换个搜索词试试，或者直接喊出你的专属想法！'}
            </p>
            <div className="empty-actions">
              {activeCategory === 'custom' ? (
                <button
                  type="button"
                  className="primary inspiration-add-btn"
                  onClick={handleOpenAdd}
                >
                  <Plus size={16} /> 立即记下第一个灵感
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => {
                      setSearchQuery('');
                      setActiveCategory('all');
                    }}
                  >
                    清除筛选条件
                  </button>
                  <button
                    type="button"
                    className="primary"
                    onClick={() => s.setRoom('desk')}
                  >
                    直接去造物桌面开工
                  </button>
                </>
              )}
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
          type="button"
          className="primary footer-start-btn"
          onClick={() => {
            s.setRoom('desk');
          }}
        >
          <span>进入造物桌面自由探索</span>
          <ArrowRight size={16} />
        </button>
      </section>

      {/* 录入与编辑弹窗 */}
      <InspirationEditorModal
        isOpen={editorOpen}
        initialData={editingItem}
        onSave={handleSaveInspiration}
        onClose={() => {
          setEditorOpen(false);
          setEditingItem(null);
        }}
      />

      {/* 删除确认弹窗 */}
      <InspirationDeleteConfirmModal
        isOpen={deleteConfirmOpen}
        item={deletingItem}
        onConfirm={handleConfirmDelete}
        onClose={() => {
          setDeleteConfirmOpen(false);
          setDeletingItem(null);
        }}
      />
    </div>
  );
}
