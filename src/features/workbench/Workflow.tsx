import { Check } from 'lucide-react';
import { useStudio } from '../../state/StudioContext';
import type { Room } from '../../theme/rooms';
const steps: { name: string; room: Room }[] = [
  { name: '灵感', room: 'materials' },
  { name: '心意卡', room: 'idea' },
  { name: '造物', room: 'desk' },
  { name: '体检', room: 'check' },
  { name: '打印', room: 'prepare' },
  { name: '展示', room: 'gallery' },
];
export function Workflow() {
  const s = useStudio();
  return (
    <div className="workflow">
      {steps.map((step, i) => (
        <button
          key={step.room}
          className={step.room === s.room ? 'active' : i < 2 && s.project?.model ? 'complete' : ''}
          onClick={() => s.setRoom(step.room)}
        >
          <span>{i < 2 && s.project?.model ? <Check size={17} /> : i + 1}</span>
          <small>{step.name}</small>
        </button>
      ))}
    </div>
  );
}
