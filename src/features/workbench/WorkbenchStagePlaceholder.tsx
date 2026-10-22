import { useState, useEffect } from 'react';
import {
  Sparkles,
  Camera,
  Layers,
  Wand2,
  Box,
  CheckCircle2,
  Scan,
  Compass,
  ArrowRight,
  Lightbulb,
  Cpu,
} from 'lucide-react';
import type { Job, Mode } from '../../types';
import { usagiArt } from '../../theme/usagi';
import { assetUrl } from '../../api/client';

interface WorkbenchStagePlaceholderProps {
  isRunning: boolean;
  job: Job | null;
  photoAssetIds: string[];
  prompt?: string;
  mode?: Mode;
  error?: string;
  onStartCraftText?: (prompt: string) => void;
  onStartCraftPhoto?: () => void;
  onFillPrompt?: (text: string) => void;
  onGoToMaterials?: () => void;
}

export function WorkbenchStagePlaceholder({
  isRunning,
  job,
  photoAssetIds = [],
  prompt = '',
  mode = 'text',
  error,
  onStartCraftText,
  onStartCraftPhoto,
  onFillPrompt,
  onGoToMaterials,
}: WorkbenchStagePlaceholderProps) {
  // 当前焦点的照片视角索引（用于多图走马灯）
  const [activePhotoIdx, setActivePhotoIdx] = useState(0);

  const photoCount = photoAssetIds.length;
  const isMultiPhoto = isRunning && photoCount > 1;
  const isSinglePhoto = isRunning && photoCount === 1;
  const isPureIdea = isRunning && photoCount === 0;
  const isIdle = !isRunning;

  // 多图建模模式下的自动视角轮播走马灯（每 2.6 秒平滑滚动到下一个视角）
  useEffect(() => {
    if (!isMultiPhoto) return;
    const timer = setInterval(() => {
      setActivePhotoIdx((prev) => (prev + 1) % photoCount);
    }, 2600);
    return () => clearInterval(timer);
  }, [isMultiPhoto, photoCount]);

  // 如果视角索引溢出，自动矫正
  useEffect(() => {
    if (activePhotoIdx >= photoCount && photoCount > 0) {
      setActivePhotoIdx(0);
    }
  }, [photoCount, activePhotoIdx]);

  // 1. 待机静候状态（尚未开始建模）
  if (isIdle) {
    return (
      <div className="stage-placeholder stage-idle-mode" data-testid="stage-idle">
        <div className="stage-idle-backdrop-glow" />
        <div className="stage-idle-content">
          <div className="stage-usagi-avatar-wrap">
            <img
              src={usagiArt.workroom}
              alt="乌萨奇造物工坊"
              className="stage-usagi-workroom-img"
              draggable={false}
            />
            <div className="stage-usagi-badge">
              <span className="badge-sparkle">✦</span>
              <span>乌萨奇造物台已就绪</span>
            </div>
          </div>

          <h2 className="stage-idle-title">别动脑，喊出你的想法！</h2>
          <p className="stage-idle-subtitle">
            剩下的交给乌萨奇——把你的奇思妙想或身边照片变成可打印的真实 3D 奇迹 ✨
          </p>

          {/* 两种造物通道引导卡片 */}
          <div className="stage-guide-cards">
            <div
              className="stage-guide-card guide-photo"
              onClick={() => {
                if (onStartCraftPhoto) {
                  onStartCraftPhoto();
                } else {
                  onGoToMaterials?.();
                }
              }}
              role="button"
              tabIndex={0}
            >
              <div className="guide-card-icon">
                <Camera size={22} />
              </div>
              <div className="guide-card-info">
                <strong>照片立体化</strong>
                <span>单张照片变浮雕立牌，或多角度全景重建</span>
              </div>
              <ArrowRight size={16} className="guide-arrow" />
            </div>

            <div
              className="stage-guide-card guide-text"
              onClick={() => {
                const targetText = prompt?.trim() || '呆萌乌萨奇桌上多功能收纳盒';
                if (onStartCraftText) {
                  onStartCraftText(targetText);
                } else {
                  onFillPrompt?.(targetText);
                }
              }}
              role="button"
              tabIndex={0}
            >
              <div className="guide-card-icon">
                <Wand2 size={22} />
              </div>
              <div className="guide-card-info">
                <strong>一句话描述想法</strong>
                <span>随手写下玩具、花瓶、日常收纳好物</span>
              </div>
              <ArrowRight size={16} className="guide-arrow" />
            </div>
          </div>

          {/* 灵感快捷胶囊推荐 */}
          <div className="stage-inspiration-dock">
            <span className="inspiration-label">
              <Lightbulb size={13} />
              点一下试试灵感：
            </span>
            <div className="inspiration-pills">
              {[
                '呆萌乌萨奇桌上多功能收纳盒',
                '几何莫兰迪风多边形小花瓶',
                '带旋转轮子的趣味迷你小车',
              ].map((idea) => (
                <button
                  key={idea}
                  type="button"
                  className="inspiration-pill-btn"
                  onClick={() => {
                    if (onStartCraftText) {
                      onStartCraftText(idea);
                    } else {
                      onFillPrompt?.(idea);
                    }
                  }}
                >
                  <span>✦</span> {idea}
                </button>
              ))}
            </div>
          </div>

          {error && <div className="stage-error-banner">{error}</div>}
        </div>
      </div>
    );
  }

  // 2. 多张照片建模中：全景摄影测量走马灯与雷达特征扫描
  if (isMultiPhoto) {
    const currentAssetId = photoAssetIds[activePhotoIdx] || photoAssetIds[0];
    return (
      <div className="stage-placeholder stage-multiview-mode" data-testid="stage-multiview">
        <div className="stage-radial-aurora" />

        <div className="multiview-scanner-container">
          {/* 顶部特征状态指示条 */}
          <div className="scanner-status-pill">
            <Scan size={14} className="spin-icon" />
            <span>
              正在配准视角 #{activePhotoIdx + 1} / {photoCount}
            </span>
            <span className="scanner-badge-tag">摄影测量特征提取</span>
          </div>

          {/* 居中主视角卡片（带激光雷达扫描与关键特征点网格） */}
          <div className="scanner-viewport-box">
            <div className="scanner-image-frame">
              <img
                src={assetUrl(currentAssetId)}
                alt={`视角 ${activePhotoIdx + 1}`}
                className="scanner-main-img"
              />

              {/* 垂直移动激光扫描线 */}
              <div className="scanner-laser-line" />

              {/* 动态脉冲特征追踪点（模拟 SIFT/ORB 空间特征检测） */}
              <div className="feature-keypoint kp-1" style={{ top: '24%', left: '32%' }} />
              <div className="feature-keypoint kp-2" style={{ top: '28%', left: '68%' }} />
              <div className="feature-keypoint kp-3" style={{ top: '56%', left: '48%' }} />
              <div className="feature-keypoint kp-4" style={{ top: '68%', left: '26%' }} />
              <div className="feature-keypoint kp-5" style={{ top: '72%', left: '74%' }} />
              <div className="feature-keypoint kp-6" style={{ top: '42%', left: '80%' }} />

              {/* 视窗四角科技定位标 */}
              <div className="corner-bracket corner-tl" />
              <div className="corner-bracket corner-tr" />
              <div className="corner-bracket corner-bl" />
              <div className="corner-bracket corner-br" />

              <div className="scanner-view-overlay-meta">
                <span>ANGLE: #{activePhotoIdx + 1}</span>
                <span>PTS: ~{1200 + activePhotoIdx * 140}</span>
              </div>
            </div>
          </div>

          {/* 底部自动流动胶卷轨道（走马灯缩略条） */}
          <div className="scanner-filmstrip-track">
            {photoAssetIds.map((id, idx) => {
              const isActive = idx === activePhotoIdx;
              return (
                <div
                  key={id}
                  className={`filmstrip-thumb-item ${isActive ? 'active' : ''}`}
                  onClick={() => setActivePhotoIdx(idx)}
                  role="button"
                  tabIndex={0}
                  title={`点击查看视角 #${idx + 1}`}
                >
                  <img src={assetUrl(id)} alt={`胶卷视角 ${idx + 1}`} />
                  <span className="filmstrip-index">#{idx + 1}</span>
                  {isActive && <div className="filmstrip-active-glow" />}
                </div>
              );
            })}
          </div>

          {/* 底部乌萨奇工匠解说 */}
          <div className="scanner-footer-brief">
            <div className="scanner-brief-pulse">
              <Sparkles size={16} />
            </div>
            <div className="scanner-brief-text">
              <strong>{job?.message || '乌萨奇正在提取多角度照片的空间特征与点云…'}</strong>
              <small>已锁定 {photoCount} 个观测方位，正在进行三维空间立体配准交汇</small>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // 3. 单张照片建模中：单图 2D→3D 深度立体赋形展台
  if (isSinglePhoto) {
    const singleAssetId = photoAssetIds[0];
    return (
      <div className="stage-placeholder stage-singlephoto-mode" data-testid="stage-singlephoto">
        <div className="stage-radial-aurora" />

        <div className="singlephoto-stage-content">
          <div className="singlephoto-status-pill">
            <Layers size={14} className="spin-icon" />
            <span>单张照片 · 深度立体赋形</span>
            <span className="scanner-badge-tag">2D ➔ 3D 智能推测</span>
          </div>

          {/* 居中 3D 透视浮动原图卡片 */}
          <div className="singlephoto-perspective-stage">
            <div className="singlephoto-3d-card">
              <img
                src={assetUrl(singleAssetId)}
                alt="参考照片"
                className="singlephoto-target-img"
              />
              <div className="singlephoto-shimmer" />
              <div className="scanner-laser-line" />

              {/* 3D 厚度投影边框 */}
              <div className="card-extrusion-layer card-extrusion-1" />
              <div className="card-extrusion-layer card-extrusion-2" />
              <div className="card-extrusion-layer card-extrusion-3" />

              {/* 四角定位标 */}
              <div className="corner-bracket corner-tl" />
              <div className="corner-bracket corner-tr" />
              <div className="corner-bracket corner-bl" />
              <div className="corner-bracket corner-br" />
            </div>
          </div>

          {/* 围绕展开的三大工匠物理指标推测指示 */}
          <div className="singlephoto-badges-flow">
            <div className="spec-badge-item active">
              <CheckCircle2 size={13} className="badge-check-icon" />
              <span>轮廓外缘提取 (Silhouette)</span>
            </div>
            <div className="spec-badge-item active pulse">
              <Compass size={13} className="badge-check-icon" />
              <span>深度法线推测 (Depth Normal)</span>
            </div>
            <div className="spec-badge-item">
              <Box size={13} className="badge-check-icon" />
              <span>平整底座与物理壁厚 (Shell & Base)</span>
            </div>
          </div>

          {/* 底部乌萨奇解说 */}
          <div className="singlephoto-footer-brief">
            <div className="scanner-brief-pulse">
              <Wand2 size={16} />
            </div>
            <div className="scanner-brief-text">
              <strong>{job?.message || '单张照片正在立体化变身…'}</strong>
              <small>乌萨奇正在根据光影自动推测背面轮廓与物理厚度，马上就能生成立体模型！✨</small>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // 4. 纯文字想法建模中：乌萨奇三维几何蓝图工坊
  return (
    <div className="stage-placeholder stage-pureidea-mode" data-testid="stage-pureidea">
      {/* 蓝图透视地坪与光幕 */}
      <div className="stage-blueprint-floor" />
      <div className="stage-radial-aurora" />

      <div className="pureidea-stage-content">
        <div className="pureidea-status-pill">
          <Cpu size={14} className="spin-icon" />
          <span>乌萨奇三维几何蓝图工坊</span>
          <span className="scanner-badge-tag">CSG 几何算力拓扑</span>
        </div>

        {/* 纯 CSS 3D 线框晶体自转装置（零额外 WebGL 开销，60fps 丝滑轻盈） */}
        <div className="wireframe-crystal-container">
          <div className="wireframe-crystal-spinner">
            <div className="crystal-ring ring-x" />
            <div className="crystal-ring ring-y" />
            <div className="crystal-ring ring-z" />
            <div className="crystal-cube-face face-front" />
            <div className="crystal-cube-face face-back" />
            <div className="crystal-cube-face face-left" />
            <div className="crystal-cube-face face-right" />
            <div className="crystal-cube-face face-top" />
            <div className="crystal-cube-face face-bottom" />
            {/* 核心发光灵感球 */}
            <div className="crystal-inner-core">
              <Sparkles size={20} className="crystal-sparkle" />
            </div>
          </div>
        </div>

        {/* 想法解析展示卡片 */}
        {prompt && (
          <div className="pureidea-prompt-capsule">
            <span className="prompt-label">💡 正在具象化想法：</span>
            <strong className="prompt-content">“{prompt}”</strong>
          </div>
        )}

        {/* 乌萨奇算力调配解说 */}
        <div className="pureidea-footer-brief">
          <div className="scanner-brief-pulse">
            <Box size={16} />
          </div>
          <div className="scanner-brief-text">
            <strong>{job?.message || '乌萨奇正在调配虚拟黏土与计算几何拓扑…'}</strong>
            <small>融合三维参数化原语与平滑倒角切削，打造物理可打印的坚实结构 ✨</small>
          </div>
        </div>
      </div>
    </div>
  );
}
