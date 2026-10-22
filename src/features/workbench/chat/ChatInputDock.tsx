import { useRef, type KeyboardEvent } from 'react';
import { Mic, ImagePlus, Send, X, MapPin } from 'lucide-react';
import { assetUrl } from '../../../api/client';
import type { Asset } from '../../../types';

interface ChatInputDockProps {
  text: string;
  onTextChange: (text: string) => void;
  onSubmit: () => void;
  isBusy: boolean;
  hasModel: boolean;
  selectedPartId?: string | null;
  selectedPointMm?: [number, number, number] | null;
  locationImage: Asset | null;
  locationPoint: [number, number] | null;
  onLocationImageChange: (asset: Asset | null) => void;
  onLocationPointChange: (point: [number, number] | null) => void;
  onVoiceInput: () => void;
}

export function ChatInputDock({
  text,
  onTextChange,
  onSubmit,
  isBusy,
  hasModel,
  selectedPartId,
  selectedPointMm,
  locationImage,
  locationPoint,
  onLocationImageChange,
  onLocationPointChange,
  onVoiceInput,
}: ChatInputDockProps) {
  const locationInputRef = useRef<HTMLInputElement>(null);

  const quickChips =
    hasModel ? [] : [
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

  const placeholder = selectedPointMm
    ? '已选定模型位置，直接说说想怎么改，也可以聊新的想法…'
    : hasModel
      ? '继续聊这个作品：加文字、改尺寸，或重新设计（Enter 发送）…'
      : '喊出你的造物想法，或描述外貌、尺寸（Enter 发送）…';

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

      {/* 统一输入框卡片 */}
      <div className="dock-input-box">
        {/* 模型已选局部坐标或标记提示条 */}
        {(selectedPointMm || selectedPartId) && (
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
              <span>
                {locationPoint
                  ? `已标记点 (${locationPoint[0]}%, ${locationPoint[1]}%)`
                  : '点击图片放置定位标记'}
              </span>
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
          aria-label="造物对话"
          placeholder={placeholder}
          value={text}
          disabled={isBusy}
          onChange={(e) => onTextChange(e.target.value)}
          onKeyDown={handleKeyDown}
          maxLength={2000}
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

            <button
              type="button"
              className="tool-btn"
              title="上传圈注位置截图"
              disabled={isBusy}
              onClick={() => locationInputRef.current?.click()}
            >
              <ImagePlus size={14} />
            </button>

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
              disabled={isBusy || !text.trim()}
              onClick={onSubmit}
              title="继续与乌萨奇讨论这个作品"
            >
              {isBusy ? (
                <span className="btn-loading-spinner" />
              ) : (
                <>
                  <Send size={13} />
                  <span>发送</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
