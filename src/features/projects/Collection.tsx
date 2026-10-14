import { useState } from 'react';
import { ArrowUpRight, Plus } from 'lucide-react';
import { useStudio } from '../../state/StudioContext';
import { CottageRoomHeading } from '../../components/CottageRoomHeading';
import { Usagi } from '../../components/Usagi';
import { ProjectCard } from './ProjectCard';
import { ProjectStory } from './ProjectStory';
import { History } from './History';
import '../../styles/collection.css';

export function Collection({ mode }: { mode: 'library' | 'gallery' }) {
  const s = useStudio();
  const isGallery = mode === 'gallery';
  const projects = isGallery ? s.projects.filter((project) => project.exhibited) : s.projects;
  const [modal, setModal] = useState<{ kind: 'versions' | 'story'; id: string } | null>(null);
  const modalProject = modal && s.projects.find((project) => project.id === modal.id);
  const open = (kind: 'versions' | 'story', id: string) => {
    setModal({ kind, id });
  };
  return (
    <div className={`${mode}-page collection-page`}>
      <CottageRoomHeading
        room={mode}
        description={
          isGallery
            ? '这里展示从作品柜中选出的作品。每个作品都有故事，把我们的造物时光留在小屋里。'
            : '每个想法都有属于自己的位置。随时回顾每一次造物尝试，切换历史版本。'
        }
        actions={
          <div className="collection-toolbar-actions">
            {!isGallery && (
              <button className="secondary" onClick={() => s.setRoom('gallery')}>
                打开展厅 <ArrowUpRight size={15} />
              </button>
            )}
            <button
              className="primary"
              disabled={s.busy || s.running}
              onClick={() => (isGallery ? s.setRoom('library') : void s.create())}
            >
              {isGallery ? (
                '从作品柜选作品'
              ) : (
                <>
                  <Plus size={16} /> 新作品
                </>
              )}
            </button>
          </div>
        }
      />
      {!projects.length ? (
        <section className="collection-empty">
          <Usagi size={115} />
          <div>
            <h2>{isGallery ? '展厅，等你放入第一件作品' : '给小屋添一件自己的作品'}</h2>
            <p>
              {isGallery
                ? '在作品柜里选择喜欢的形状，点击“放入展厅”。'
                : '说出你的想法，乌萨奇陪你把它变成真实的形状。'}
            </p>
          </div>
        </section>
      ) : (
        <>
          <div className="collection-shelf-heading">
            <h2>
              {isGallery ? '我的小屋收藏' : '我的作品'} <span>{projects.length}</span>
            </h2>
            <p>{isGallery ? '这些作品都由你从作品柜选入。' : '点击作品看故事，点击版本切换形状。'}</p>
          </div>
          <div className="collection-grid">
            {projects.map((project) => (
              <ProjectCard
                key={project.id}
                project={project}
                onVersions={() => open('versions', project.id)}
                onStory={() => open('story', project.id)}
              />
            ))}
          </div>
        </>
      )}
      {modal?.kind === 'versions' && modalProject && (
        <History
          key={modalProject.id}
          project={modalProject}
          onClose={() => setModal(null)}
          onSelected={() => s.adopt(modalProject)}
        />
      )}
      {modal?.kind === 'story' && modalProject && (
        <ProjectStory key={modalProject.id} project={modalProject} onClose={() => setModal(null)} />
      )}
    </div>
  );
}
