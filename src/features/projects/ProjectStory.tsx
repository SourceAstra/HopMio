import { useState } from 'react';
import { Modal } from '../../components/Modal';
import { useStudio } from '../../state/StudioContext';
import type { Project } from '../../types';

export function ProjectStory({ project, onClose }: { project: Project; onClose: () => void }) {
  const s = useStudio();
  const [name, setName] = useState(project.name);
  const [story, setStory] = useState(project.story);
  return (
    <Modal title="给作品留一个故事" onClose={onClose}>
      <form
        className="collection-story-form"
        onSubmit={(event) => {
          event.preventDefault();
          void s.updateProject(project.id, { name: name.trim(), story }).then((updated) => {
            if (updated) onClose();
          });
        }}
      >
        <label>
          作品名称
          <input
            autoFocus
            required
            maxLength={80}
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        <label>
          作品故事
          <textarea
            rows={5}
            maxLength={4000}
            value={story}
            onChange={(event) => setStory(event.target.value)}
            placeholder="为什么想做它？我们一起发现了什么？"
          />
        </label>
        <div className="collection-modal-actions">
          <button type="button" className="secondary" onClick={onClose}>
            稍后再写
          </button>
          <button type="submit" className="primary" disabled={s.busy || !name.trim()}>
            保存故事
          </button>
        </div>
      </form>
    </Modal>
  );
}
