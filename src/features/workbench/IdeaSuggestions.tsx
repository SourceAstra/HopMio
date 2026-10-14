import { useStudio } from '../../state/StudioContext';

export function IdeaSuggestions() {
  const { spec } = useStudio();
  if (!spec.assumptions.length) return null;
  return (
    <details className="idea-suggestions" open>
      <summary>乌萨奇的推测建议 · 请确认</summary>
      <ul>
        {spec.assumptions.map((item, index) => <li key={index}>{item}</li>)}
      </ul>
    </details>
  );
}
