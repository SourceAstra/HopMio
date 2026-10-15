import { useRef, type KeyboardEvent } from 'react';
import {
  Sparkles,
  Mic,
  ImagePlus,
  Wand2,
  Send,
  X,
  MapPin,
} from 'lucide-react';
import { assetUrl } from '../../../api/client';
import type { Asset } from '../../../types';

interface ChatInputDockProps {
  mode: 'tune' | 'prompt';
  onModeChange: (mode: 'tune' | 'prompt') => void;
  text: string;
  onTextChange: (text: string) => void;
  onSubmit: () => void;
  isBusy: boolean;
  canTune: boolean;
  cloudReady: boolean;
  hasModel: boolean;
  selectedPartId?: string | null;
  selectedPointMm?: [number, number, number] | null;
  locationImage: Asset | null;
  locationPoint: [number, number] | null;
  onLocationImageChange: (asset: Asset | null) => void;
  onLocationPointChange: (point: [number, number] | null) => void;
  onVoiceInput: () => void;
  onOrganizeIdea?: () => void;
  hasPhotos: boolean;
  tuningSuggestions?: Array<{ label: string; value: string }>;
}

export function ChatInputDock({
  mode,
  onModeChange,
  text,
  onTextChange,
  onSubmit,
  isBusy,
  canTune,
  cloudReady,
  hasModel,
  selectedPartId,
  selectedPointMm,
  locationImage,
  locationPoint,
  onLocationImageChange,
  onLocationPointChange,
  onVoiceInput,
  onOrganizeIdea,
  hasPhotos,
  tuningSuggestions,
}: ChatInputDockProps) {
  const locationInputRef = useRef<HTMLInputElement>(null);

  const quickChips =
    mode === 'tune'
      ? tuningSuggestions || []
      : [
          { label: '🥕 胡萝卜印章', value: '乌萨奇同款胡萝卜手办印章，底部平整带抓握手柄' },
          { label: '✦ 80mm 元气立牌', value: '乌萨奇开心招手元气立牌，高80mm自带稳固底座' },
          { label: '🦖 呆萌小恐龙', value: '圆滚滚胖嘟嘟的呆萌绿色小恐龙桌面摆件' },
          { label: '🏷️ 名字钥匙扣', value: '带有挂绳圆孔的个性防丢名字钥匙扣，四周圆润倒角' },
        ];

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!isBusy && text.trim()) {
        onSubmit();
      }
    }
  };

  const placeholder =
    mode === 'tune'
      ? selectedPointMm
        ? '已选定 3D 表面红点处。描述你想怎么调整（按 Enter 发送）…'
        : '点选 3D 模型表面局部，输入调整想法（按 Enter 发送）…'
      : '喊出你的造物想法，或描述外貌、尺寸（按 Enter 发送）…';

  return (
    <div className="chat-input-dock">
      {/* 隐藏式标记截图上传 */}
      <input
        ref={locationInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        style={{ display: 'none' }}
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (!file) return;
          const reader = new FileReader();
          reader.onload = () => {
            // 上传由外层或这里快速处理
            const event = new CustomEvent('upload-location-image', { detail: file });
            window.dispatchEvent(event);
          };
          reader.readAsDataURL(file);
        }}
      />

      {/* 快捷推荐气泡滑轨 */}
      <div className="dock-quick-chips">
        {quickChips.map((chip) => (
          <button
            key={chip.label}
            type="button"
            className="dock-chip-pill"
            disabled={isBusy}
            onClick={() => {
              onTextChange(text ? `${text}，${chip.value}` : chip.value);
            }}
          >
            {chip.label}
          </button>
        ))}
      </div>

      {/* 模式感知切换条（仅在已有模型时可切换微调与整体重构） */}
      {hasModel && (
        <div className="dock-mode-selector">
          <button
            type="button"
            className={`mode-select-tab ${mode === 'tune' ? 'active' : ''}`}
            disabled={isBusy || !canTune}
            title={canTune ? '修改当前模型的局部细节' : '当前模型或 AI 服务暂不支持局部微调'}
            onClick={() => onModeChange('tune')}
          >
            <Wand2 size={12} />
            <span>✨ 细节微调</span>
            <span className="mode-dot" />
          </button>
          <button
            type="button"
            className={`mode-select-tab ${mode === 'prompt' ? 'active' : ''}`}
            onClick={() => onModeChange('prompt')}
          >
            <Sparkles size={12} />
            <span>✦ 整体灵感</span>
          </button>
        </div>
      )}

      {hasModel && !canTune && (
        <small className="tune-howto">
          当前模型或 AI 服务暂不支持局部微调。整体灵感会规划新造型，旧版本会保留。
        </small>
      )}

      {/* 统一输入框卡片 */}
      <div className="dock-input-box">
        {/* 模型已选局部坐标或标记提示条 */}
        {(selectedPointMm || selectedPartId) && mode === 'tune' && (
          <div className="dock-selection-badge">
            <MapPin size={11} className="badge-pin-icon" />
            <span>
              已锁定 3D 模型局部：
              {selectedPartId ? `【${selectedPartId}】` : ''}
              {selectedPointMm
                ? `坐标 (${selectedPointMm.map((v) => v.toFixed(1)).join(', ')} mm)`
                : ''}
            </span>
          </div>
        )}

        {/* 圈注截图附带预览栏 */}
        {locationImage && (
          <div className="dock-location-preview-bar">
            <div
              className="location-thumb"
              onClick={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                const x = Math.round(((e.clientX - rect.left) / rect.width) * 1000) / 10;
                const y = Math.round(((e.clientY - rect.top) / rect.height) * 1000) / 10;
                onLocationPointChange([x, y]);
              }}
              title="点击图片指定要修改的位置"
            >
              <img src={assetUrl(locationImage.id)} alt="圈注附图" />
              {locationPoint && (
                <i
                  className="location-dot"
                  style={{ left: `${locationPoint[0]}%`, top: `${locationPoint[1]}%` }}
                />
              )}
            </div>
            <div className="location-info">
              <span>{locationPoint ? `已标记点 (${locationPoint[0]}%, ${locationPoint[1]}%)` : '点击图片放置定位标记'}</span>
              <button
                type="button"
                className="location-remove-btn"
                onClick={() => {
                  onLocationImageChange(null);
                  onLocationPointChange(null);
                }}
              >
                <X size={11} /> 移除
              </button>
            </div>
          </div>
        )}

        <textarea
          className="dock-textarea"
          aria-label={mode === 'tune' ? '微调想法' : '造物灵感'}
          placeholder={placeholder}
          value={text}
          disabled={isBusy}
          onChange={(e) => onTextChange(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={2}
        />

        {/* 底部功能条与发送按钮 */}
        <div className="dock-actions-row">
          <div className="dock-tools-left">
            <button
              type="button"
              className="tool-btn"
              title="喊出你的想法（语音输入）"
              disabled={isBusy}
              onClick={onVoiceInput}
            >
              <Mic size={14} />
            </button>

            {mode === 'tune' && (
              <button
                type="button"
                className="tool-btn"
                title="上传圈注位置截图"
                disabled={isBusy}
                onClick={() => locationInputRef.current?.click()}
              >
                <ImagePlus size={14} />
              </button>
            )}

            {mode === 'prompt' && onOrganizeIdea && (
              <button
                type="button"
                className="tool-organize-btn"
                disabled={isBusy || (!text.trim() && !hasPhotos)}
                title="由 AI 智能整理文字和照片中的尺寸与要求"
                onClick={onOrganizeIdea}
              >
                <Sparkles size={12} /> 智能整理
              </button>
            )}

            {text && (
              <button
                type="button"
                className="tool-clear-btn"
                title="清空输入"
                onClick={() => onTextChange('')}
              >
                清空
              </button>
            )}
          </div>

          <div className="dock-tools-right">
            <span className="char-count-text">{text.length}/2000</span>
            <button
              type="button"
              className="dock-send-btn"
              disabled={isBusy || !text.trim() || (mode === 'tune' && (!canTune || !cloudReady))}
              onClick={onSubmit}
              title={mode === 'tune' ? '发送微调想法，由乌萨奇生成建议' : '发送创意想法，由乌萨奇智能整理'}
            >
              {isBusy ? (
                <span className="btn-loading-spinner" />
              ) : mode === 'tune' ? (
                <>
                  <Wand2 size={13} />
                  <span>整理建议</span>
                </>
              ) : (
                <>
                  <Sparkles size={13} />
                  <span>整理想法</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
