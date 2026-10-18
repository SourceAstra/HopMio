import React, { useState, useEffect } from 'react';
import { X, Sparkles, Wand2, Lightbulb, Smile, Tag, Layers, FileText } from 'lucide-react';
import type { InspirationItem } from '../../theme/inspirations';
import { CATEGORY_LABELS } from './inspirationsStore';

interface InspirationEditorModalProps {
  isOpen: boolean;
  initialData?: InspirationItem | null;
  onSave: (data: {
    title: string;
    emoji: string;
    prompt: string;
    desc: string;
    category: InspirationItem['category'];
    categoryLabel: string;
    tag?: string;
    featured?: boolean;
    isCustom?: boolean;
  }) => void;
  onClose: () => void;
}

const PRESET_EMOJIS = [
  '🐰', '🥕', '🚀', '🧸', '🌟', '🐱', '🛸', '🎁', 
  '🎨', '🌈', '🧩', '🍕', '🦖', '💖', '🚗', '🧁'
];

const PRESET_TAGS = [
  '小朋友专属', '超萌治愈', '桌面陪伴', '开学必备', 
  '解压神器', '心意礼物', '益智好玩', '极易打印'
];

const CATEGORY_OPTIONS: { id: InspirationItem['category']; label: string }[] = [
  { id: 'custom', label: '✨ 小朋友脑洞' },
  { id: 'usagi', label: '🐰 乌萨奇专属' },
  { id: 'school', label: '🎒 校园与实用' },
  { id: 'pets', label: '🧸 治愈萌宠' },
  { id: 'toys', label: '🧩 益智与解压' },
  { id: 'gifts', label: '🎁 节日与心意' },
];

export function InspirationEditorModal({
  isOpen,
  initialData,
  onSave,
  onClose,
}: InspirationEditorModalProps) {
  const isEditing = Boolean(initialData);

  const [title, setTitle] = useState('');
  const [emoji, setEmoji] = useState('✨');
  const [category, setCategory] = useState<InspirationItem['category']>('custom');
  const [desc, setDesc] = useState('');
  const [prompt, setPrompt] = useState('');
  const [tag, setTag] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  // 同步初始化数据
  useEffect(() => {
    if (isOpen) {
      if (initialData) {
        setTitle(initialData.title || '');
        setEmoji(initialData.emoji || '✨');
        setCategory(initialData.category || 'custom');
        setDesc(initialData.desc || '');
        setPrompt(initialData.prompt || '');
        setTag(initialData.tag || '');
      } else {
        setTitle('');
        setEmoji('✨');
        setCategory('custom');
        setDesc('');
        setPrompt('');
        setTag('小朋友专属');
      }
      setErrorMsg('');
    }
  }, [isOpen, initialData]);

  if (!isOpen) return null;

  // 🪄 乌萨奇魔法提示词补全（根据标题和分类生成 3D 打印友好的 Prompt）
  const handleMagicPrompt = () => {
    const rawTitle = title.trim();
    if (!rawTitle) {
      setErrorMsg('请先写下灵感名称，乌萨奇才能施展魔法写提示词哦！');
      return;
    }
    setErrorMsg('');

    let generated = '';
    if (category === 'usagi') {
      generated = `乌萨奇同款${rawTitle}，圆润大头与欢快的ω嘴巴，平整加重稳固底座，易于单色或多色3D打印`;
    } else if (category === 'school') {
      generated = `${rawTitle}，适合书桌随身使用的多功能小件，平整底面无尖角，兼顾实用与美观，免支撑极易打印`;
    } else if (category === 'pets') {
      generated = `呆萌可爱的${rawTitle}手办摆件，圆滚滚的治愈身形，平稳底面，细节纹理清晰生动`;
    } else if (category === 'toys') {
      generated = `一体成型的${rawTitle}趣味减压玩具，边角圆润倒角，手感舒适顺滑，经久耐玩`;
    } else if (category === 'gifts') {
      generated = `充满心意的精致${rawTitle}纪念伴手礼，平整底面，带精美浮雕细节与穿孔挂绳孔`;
    } else {
      generated = `立体3D造型的${rawTitle}，底面平整稳固，四周圆润倒角，单色或多色一体成型，极易3D打印`;
    }

    setPrompt(generated);
    if (!desc.trim()) {
      setDesc(`小朋友专属创作的${rawTitle}，好玩又实用！`);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setErrorMsg('请给灵感起一个好听的名字吧！');
      return;
    }

    const finalPrompt = prompt.trim() || `${title.trim()}，平整底座稳固站立，单色一体成型3D打印`;
    const finalDesc = desc.trim() || `充满奇思妙想的${title.trim()}`;

    onSave({
      title: title.trim(),
      emoji: emoji.trim() || '💡',
      category,
      categoryLabel: CATEGORY_LABELS[category] || '小朋友脑洞',
      desc: finalDesc,
      prompt: finalPrompt,
      tag: tag.trim() || undefined,
      isCustom: true,
    });

    onClose();
  };

  return (
    <div className="craft-launch-overlay" onClick={onClose} role="dialog" aria-modal="true">
      <div
        className="craft-launch-card inspiration-editor-card"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 顶部标题栏 */}
        <div className="launch-card-header">
          <div className="launch-card-title-group">
            <span className="launch-card-icon-badge">
              <Lightbulb size={20} className="icon-gold" />
            </span>
            <div>
              <h2 className="launch-card-title">
                {isEditing ? '✏️ 修改造物灵感' : '✨ 记下小朋友的造物灵感'}
              </h2>
              <p className="launch-card-subtitle">
                别藏在脑袋里，写下你的奇思妙想，乌萨奇随时帮你搬上造物桌！
              </p>
            </div>
          </div>
          <button
            type="button"
            className="launch-modal-close-btn"
            onClick={onClose}
            aria-label="关闭"
          >
            <X size={18} />
          </button>
        </div>

        {errorMsg && (
          <div className="inspiration-form-error" role="alert">
            <span>⚠️ {errorMsg}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="inspiration-editor-form">
          {/* 灵感名称与 Emoji 徽章 */}
          <div className="editor-form-row">
            <div className="editor-form-field flex-1">
              <label htmlFor="insp-title" className="editor-label">
                <FileText size={14} /> 灵感名称 <span className="required-star">*</span>
              </label>
              <input
                id="insp-title"
                type="text"
                className="launch-name-input"
                placeholder="例如：会发光的乌萨奇飞碟、双筒小兔笔筒…"
                value={title}
                onChange={(e) => {
                  setTitle(e.target.value);
                  if (errorMsg) setErrorMsg('');
                }}
                maxLength={30}
                autoFocus
              />
            </div>

            <div className="editor-form-field emoji-field">
              <label htmlFor="insp-emoji" className="editor-label">
                <Smile size={14} /> 贴纸
              </label>
              <input
                id="insp-emoji"
                type="text"
                className="launch-name-input emoji-input-box"
                value={emoji}
                onChange={(e) => setEmoji(e.target.value)}
                maxLength={4}
              />
            </div>
          </div>

          {/* 快捷 Emoji 选择条 */}
          <div className="preset-emojis-bar">
            <span className="bar-hint">选个可爱贴纸：</span>
            <div className="preset-emojis-list">
              {PRESET_EMOJIS.map((item) => (
                <button
                  key={item}
                  type="button"
                  className={`emoji-bubble-btn ${emoji === item ? 'active' : ''}`}
                  onClick={() => setEmoji(item)}
                >
                  {item}
                </button>
              ))}
            </div>
          </div>

          {/* 所属分类 */}
          <div className="editor-form-field">
            <label className="editor-label">
              <Layers size={14} /> 灵感分类
            </label>
            <div className="category-select-pills" role="radiogroup">
              {CATEGORY_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  role="radio"
                  aria-checked={category === opt.id}
                  className={`category-pill-btn ${category === opt.id ? 'active' : ''}`}
                  onClick={() => setCategory(opt.id)}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* 3D 雕刻提示词（带一键魔法填充） */}
          <div className="editor-form-field">
            <div className="editor-label-with-action">
              <label htmlFor="insp-prompt" className="editor-label">
                <Sparkles size={14} /> 3D 雕刻提示词 (Prompt)
              </label>
              <button
                type="button"
                className="magic-prompt-btn"
                onClick={handleMagicPrompt}
                title="乌萨奇根据灵感名称自动补充适合3D打印的专业提示词"
              >
                <Wand2 size={13} />
                <span>🪄 乌萨奇帮我写 3D 提示词</span>
              </button>
            </div>
            <textarea
              id="insp-prompt"
              rows={3}
              className="editor-textarea"
              placeholder="告诉乌萨奇雕刻细节（如：加重平整底座、无尖角、一体成型打印等），也可以点击上方魔法按钮帮写！"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
            />
          </div>

          {/* 一句话简介 */}
          <div className="editor-form-field">
            <label htmlFor="insp-desc" className="editor-label">
              💡 玩法或用途一句话简介
            </label>
            <input
              id="insp-desc"
              type="text"
              className="launch-name-input"
              placeholder="一句话介绍它好玩在哪里（如：写作业时的元气陪伴，平整稳固站立）"
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              maxLength={60}
            />
          </div>

          {/* 灵感标签快捷选择 */}
          <div className="editor-form-field">
            <label htmlFor="insp-tag" className="editor-label">
              <Tag size={14} /> 灵感标签
            </label>
            <div className="tag-input-row">
              <input
                id="insp-tag"
                type="text"
                className="launch-name-input tag-input-box"
                placeholder="如：超萌、礼物、解压"
                value={tag}
                onChange={(e) => setTag(e.target.value)}
                maxLength={12}
              />
              <div className="preset-tags-list">
                {PRESET_TAGS.map((t) => (
                  <button
                    key={t}
                    type="button"
                    className={`tag-chip-btn ${tag === t ? 'active' : ''}`}
                    onClick={() => setTag(t)}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* 底部按钮栏 */}
          <div className="inspiration-editor-actions">
            <button
              type="button"
              className="secondary launch-btn-cancel"
              onClick={onClose}
            >
              取消
            </button>
            <button type="submit" className="primary launch-btn-primary">
              <Sparkles size={16} />
              <span>{isEditing ? '保存修改' : '✨ 收进灵感宝箱'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
