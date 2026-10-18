import { useState, useMemo } from 'react';
import { useStudio } from '../../state/StudioContext';
import { CollectionHero } from './CollectionHero';
import { CollectionFilterBar, type CollectionFilterTab } from './CollectionFilterBar';
import { ProjectCard } from './ProjectCard';
import { CollectionEmptyState } from './CollectionEmptyState';
import { ProjectStory } from './ProjectStory';
import { History } from './History';
import '../../styles/collection.css';

export function Collection({ mode }: { mode: 'library' | 'gallery' }) {
  const s = useStudio();
  const isGallery = mode === 'gallery';

  // 搜索与过滤状态
  const [filterTab, setFilterTab] = useState<CollectionFilterTab>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // 模态弹窗状态
  const [modal, setModal] = useState<{ kind: 'versions' | 'story'; id: string } | null>(null);
  const modalProject = modal && s.projects.find((project) => project.id === modal.id);

  const openModal = (kind: 'versions' | 'story', id: string) => {
    setModal({ kind, id });
  };

  // 全量统计
  const totalCount = s.projects.length;
  const exhibitedCount = s.projects.filter((p) => p.exhibited).length;
  const printedCount = s.projects.filter((p) => p.printed).length;
  const storyCount = s.projects.filter((p) => Boolean(p.story?.trim())).length;

  // 基础列表（展厅仅包含已展出，作品柜包含全部）
  const baseProjects = useMemo(() => {
    return isGallery ? s.projects.filter((project) => project.exhibited) : s.projects;
  }, [isGallery, s.projects]);

  // 根据分类标签与搜索词进行筛选
  const filteredProjects = useMemo(() => {
    return baseProjects.filter((project) => {
      // 1. 分类 Tab 过滤
      if (filterTab === 'exhibited' && !project.exhibited) return false;
      if (filterTab === 'unexhibited' && project.exhibited) return false;
      if (filterTab === 'with_story' && !project.story?.trim()) return false;
      if (filterTab === 'printed' && !project.printed) return false;

      // 2. 关键词搜索
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const matchesName = project.name.toLowerCase().includes(query);
        const matchesStory = Boolean(project.story?.toLowerCase().includes(query));
        return matchesName || matchesStory;
      }

      return true;
    });
  }, [baseProjects, filterTab, searchQuery]);

  return (
    <div className={`collection-page ${mode}-page`}>
      {/* 1. 顶层统一乌萨奇工坊展台 */}
      <CollectionHero
        mode={mode}
        totalCount={totalCount}
        exhibitedCount={exhibitedCount}
        printedCount={printedCount}
        storyCount={storyCount}
        onSwitchMode={(target) => s.setRoom(target)}
        onCreateNew={() => s.openNewProject()}
        disabled={s.busy || s.running}
      />

      {/* 2. 统一筛选、搜索与操作工具栏 */}
      <CollectionFilterBar
        mode={mode}
        filter={filterTab}
        onFilterChange={setFilterTab}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        displayedCount={filteredProjects.length}
        onAction={() => (isGallery ? s.setRoom('library') : s.openNewProject())}
        actionDisabled={s.busy || s.running}
      />

      {/* 3. 展品/作品卡片网格与空状态 */}
      <main className="collection-shelf-content">
        {filteredProjects.length > 0 ? (
          <div className="collection-grid modern-collection-grid">
            {filteredProjects.map((project) => (
              <ProjectCard
                key={project.id}
                project={project}
                featured={isGallery}
                onVersions={() => openModal('versions', project.id)}
                onStory={() => openModal('story', project.id)}
              />
            ))}
          </div>
        ) : (
          <CollectionEmptyState
            mode={mode}
            isFiltered={Boolean(searchQuery || filterTab !== 'all')}
            onResetFilter={() => {
              setSearchQuery('');
              setFilterTab('all');
            }}
            onAction={() => (isGallery ? s.setRoom('library') : s.openNewProject())}
          />
        )}
      </main>

      {/* 4. 版本时光机弹窗 */}
      {modal?.kind === 'versions' && modalProject && (
        <History
          key={modalProject.id}
          project={modalProject}
          onClose={() => setModal(null)}
          onSelected={() => void s.refresh()}
        />
      )}

      {/* 5. 亲子共创故事弹窗 */}
      {modal?.kind === 'story' && modalProject && (
        <ProjectStory
          key={modalProject.id}
          project={modalProject}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
}
