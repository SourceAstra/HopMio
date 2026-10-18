import { Sparkles, FolderKanban, Layers } from 'lucide-react';
import { Usagi } from '../../components/Usagi';
import { House } from '../../components/House';

export function MaterialsHero({
  totalShelfCount,
  folderCount,
}: {
  totalShelfCount: number;
  folderCount: number;
}) {
  return (
    <header className="materials-hero-banner" aria-label="取材角与素材中心">
      <div className="materials-hero-main">
        <div className="materials-hero-badge">
          <Sparkles size={13} />
          <span>USAGI&apos;S COTTAGE · 素材储藏角</span>
        </div>

        <h1 className="materials-hero-title">
          取材角
          <span className="materials-hero-subtitle"> · 素材收纳与灵感提取</span>
        </h1>

        <p className="materials-hero-desc">
          在这里集中保管你的生活照片、手绘线稿与 3D 模型素材。随时提取素材、整理分类或补充新材料。
        </p>

        {/* 状态统计指示 */}
        <div className="materials-hero-chips">
          <div className="materials-chip highlight">
            <Layers size={14} />
            <span>
              素材总数：
              <strong>{totalShelfCount}</strong> 份
            </span>
          </div>

          <div className="materials-chip">
            <FolderKanban size={14} />
            <span>
              收纳夹：
              <strong>{folderCount}</strong> 个分类
            </span>
          </div>
        </div>
      </div>

      {/* 右侧乌萨奇小屋陪伴与欢迎视觉 */}
      <div className="materials-hero-visual">
        <div className="materials-cottage-backdrop">
          <House />
        </div>
        <div className="materials-usagi-welcomer">
          <Usagi size={92} />
          <span className="materials-usagi-speech">呀哈！素材都整整齐齐！✦</span>
        </div>
      </div>
    </header>
  );
}
