import { useState } from 'react';
import { X, FolderPlus, Sparkles } from 'lucide-react';
import type { MaterialFolder, FolderColorScheme } from './folders';

const PRESET_EMOJIS = ['📁', '🧸', '🦖', '🚗', '🚀', '🌸', '🎨', '🐱', '🐶', '⚙️', '💎', '⭐', '🍦', '🌈', '🏰', '🤖'];

const COLOR_OPTIONS: { id: FolderColorScheme; label: string; bg: string }[] = [
  { id: 'warm', label: '奶油暖黄', bg: '#fef3c7' },
  { id: 'amber', label: '日光琥珀', bg: '#fed7aa' },
  { id: 'blue', label: '晴空冰蓝', bg: '#bae6fd' },
  { id: 'purple', label: '梦幻紫晶', bg: '#e9d5ff' },
  { id: 'rose', label: '珊瑚粉红', bg: '#fecdd3' },
  { id: 'emerald', label: '青柠薄荷', bg: '#a7f3d0' },
];

export function CreateFolderModal({
  isOpen,
  onClose,
  onCreate,
}: {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (folder: MaterialFolder) => void;
}) {
  const [name, setName] = useState('');
  const [emoji, setEmoji] = useState('📁');
  const [colorScheme, setColorScheme] = useState<FolderColorScheme>('warm');
  const [description, setDescription] = useState('');
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setError('请输入文件夹名称');
      return;
    }
    if (trimmed.length > 15) {
      setError('文件夹名称最多 15 个字');
      return;
    }

    const newFolder: MaterialFolder = {
      id: `custom_${Date.now()}`,
      name: trimmed,
      emoji,
      description: description.trim() || '自定义收纳分类',
      isBuiltIn: false,
      colorScheme,
    };

    onCreate(newFolder);
    setName('');
    setDescription('');
    setEmoji('📁');
    setColorScheme('warm');
    setError('');
    onClose();
  };

  return (
    <div className="folder-modal-backdrop" onClick={onClose} role="dialog" aria-modal="true">
      <div className="folder-modal-box" onClick={(e) => e.stopPropagation()}>
        {/* 标题栏 */}
        <div className="folder-modal-header">
          <div className="folder-modal-title">
            <div className="modal-title-icon">
              <FolderPlus size={18} />
            </div>
            <div>
              <h3>新建素材收纳夹</h3>
              <p>分类存放专属手绘、恐龙、零件或特定主题灵感</p>
            </div>
          </div>

          <button type="button" className="folder-modal-close" onClick={onClose} aria-label="关闭">
            <X size={16} />
          </button>
        </div>

        {/* 表单内容 */}
        <form onSubmit={handleSubmit} className="folder-modal-form">
          {/* 选择表情图标 */}
          <div className="form-group">
            <label>选择文件夹图标</label>
            <div className="emoji-picker-grid">
              {PRESET_EMOJIS.map((e) => (
                <button
                  key={e}
                  type="button"
                  className={`emoji-choice-btn ${emoji === e ? 'active' : ''}`}
                  onClick={() => setEmoji(e)}
                >
                  {e}
                </button>
              ))}
            </div>
          </div>

          {/* 文件夹名称 */}
          <div className="form-group">
            <label htmlFor="folder-name-input">文件夹名称</label>
            <input
              id="folder-name-input"
              type="text"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (error) setError('');
              }}
              placeholder="例如：恐龙系列、手工作业、我的模型…"
              autoFocus
              maxLength={15}
            />
            {error && <span className="form-error-msg">{error}</span>}
          </div>

          {/* 色彩风格 */}
          <div className="form-group">
            <label>分类色彩标签</label>
            <div className="color-picker-row">
              {COLOR_OPTIONS.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  className={`color-choice-btn ${colorScheme === c.id ? 'active' : ''}`}
                  style={{ backgroundColor: c.bg }}
                  onClick={() => setColorScheme(c.id)}
                  title={c.label}
                >
                  {colorScheme === c.id && <Sparkles size={11} />}
                </button>
              ))}
            </div>
          </div>

          {/* 底部按钮 */}
          <div className="folder-modal-footer">
            <button type="button" className="secondary modal-btn" onClick={onClose}>
              取消
            </button>
            <button type="submit" className="primary modal-btn">
              创建文件夹
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
