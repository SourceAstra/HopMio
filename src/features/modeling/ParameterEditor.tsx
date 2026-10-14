import { useStudio } from '../../state/StudioContext';
import { LockKeyhole, UnlockKeyhole } from 'lucide-react';

export function ParameterEditor({ selectedPartId }: { selectedPartId?: string | null } = {}) {
  const s = useStudio();
  const key = s.spec.provider === 'reconstruction' ? 'reconstruction_plan' : 'modeling_plan';
  const plan =
    key === 'modeling_plan' && s.running
      ? s.job?.prepared_spec?.modeling_plan || s.spec[key]
      : s.spec[key];
  if (!plan) return null;
  return (
    <div className="modeling-parameters">
      {Object.entries(plan.parameters).map(([name, parameter]) => {
        const isHighlighted = !!selectedPartId && (
          name.toLowerCase().includes(selectedPartId.toLowerCase()) ||
          (selectedPartId === 'usagi' && (name.startsWith('head') || name.startsWith('usagi'))) ||
          (selectedPartId.startsWith('arm') && name.startsWith('arm')) ||
          (selectedPartId.startsWith('foot') && name.startsWith('foot'))
        );
        return (
          <div className={`parameter-field ${isHighlighted ? 'highlighted' : ''}`} key={name}>
            <label htmlFor={`parameter-${key}-${name}`}>{parameter.label}</label>
          <div className="number-field">
            <input
              type="number"
              id={`parameter-${key}-${name}`}
              aria-label={parameter.label}
              step={0.1}
              min={-2000}
              max={2000}
              value={parameter.value}
              disabled={
                s.busy ||
                s.running ||
                (name === 'height' && !!s.spec.reconstruction_plan?.scale_reference)
              }
              onChange={(event) => {
                if (!event.target.value || !event.target.validity.valid) return;
                const value = Number(event.target.value);
                s.setSpec((old) => {
                  const current = old[key]!;
                  return {
                    ...old,
                    [key]: {
                      ...current,
                      parameters: {
                        ...current.parameters,
                        [name]: {
                          ...current.parameters[name],
                          value,
                          ...(key === 'modeling_plan' && { locked: true }),
                        },
                      },
                    },
                  };
                });
              }}
            />
            <small>
              {parameter.unit === 'deg' ? '°' : parameter.unit === 'ratio' ? '倍' : 'mm'}
            </small>
            {key === 'modeling_plan' && (
              <button
                type="button"
                className="parameter-lock"
                aria-label={`${parameter.locked ? '解除固定' : '固定'}${parameter.label}`}
                title={
                  parameter.locked
                    ? '补充照片时保留此值，点击解除固定'
                    : '允许根据新照片调整，点击固定此值'
                }
                aria-pressed={!!parameter.locked}
                disabled={s.busy || s.running}
                onClick={() =>
                  s.setSpec((old) => ({
                    ...old,
                    modeling_plan: {
                      ...old.modeling_plan!,
                      parameters: {
                        ...old.modeling_plan!.parameters,
                        [name]: {
                          ...old.modeling_plan!.parameters[name],
                          locked: !parameter.locked,
                        },
                      },
                    },
                  }))
                }
              >
                {parameter.locked ? <LockKeyhole size={14} /> : <UnlockKeyhole size={14} />}
              </button>
            )}
          </div>
        </div>
      );
    })}
  </div>
  );
}
