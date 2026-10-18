import { Save, ShieldCheck, Check } from 'lucide-react';

export function SettingsSavebar({
  dirty,
  saving,
  notice,
  onSave,
}: {
  dirty: boolean;
  saving: boolean;
  notice?: string;
  onSave: () => void;
}) {
  return (
    <div className="parent-savebar-wrapper">
      {notice && (
        <div className="parent-save-notice" role="status">
          <Check size={14} className="notice-icon" />
          <span>{notice}</span>
        </div>
      )}

      <footer className="model-savebar parent-savebar">
        <div className="savebar-left-meta">
          <span className={`model-save-dot ${dirty ? 'dirty' : ''}`} />
          <div className="savebar-copy">
            <strong>{dirty ? '有未保存的设置更改' : '所有配置已保存并就绪'}</strong>
            <small>
              <ShieldCheck size={12} className="shield-icon" />
              API 密钥与凭据加密保存在系统凭据库，物理成果保存在本地
            </small>
          </div>
        </div>

        <button
          type="button"
          className="primary parent-save-btn"
          disabled={saving || !dirty}
          onClick={onSave}
          title={dirty ? '点击保存所有更改' : '当前所有设置均已保存'}
        >
          <Save size={16} className={saving ? 'model-spinning' : ''} />
          <span>{saving ? '正在加密保存…' : '保存所有设置'}</span>
        </button>
      </footer>
    </div>
  );
}
