import { useRef, useState, type CSSProperties, type PointerEvent } from 'react';
import { assetUrl } from '../../api/client';
import { useStudio } from '../../state/StudioContext';
import type { PhotoObservation } from '../../types';

type Point = [number, number];
const clamp = (value: number) => Math.max(0, Math.min(1, value));

export function PhotoRegion({
  observation,
  index,
}: {
  observation: PhotoObservation;
  index: number;
}) {
  const s = useStudio();
  const [mode, setMode] = useState<'region' | 'scale'>('region');
  const [points, setPoints] = useState<Point[]>(
    s.spec.reconstruction_plan?.scale_reference?.points || [],
  );
  const [distance, setDistance] = useState(
    String(s.spec.reconstruction_plan?.scale_reference?.distance_mm || ''),
  );
  const start = useRef<Point | null>(null);
  const rect = observation.region;
  const width = observation.width_px,
    height = observation.height_px;
  const patchRegion = (region: PhotoObservation['region']) =>
    s.setSpec((old) => ({
      ...old,
      reconstruction_plan: {
        ...old.reconstruction_plan!,
        observations: old.reconstruction_plan!.observations.map((item, i) =>
          i === index ? { ...item, region } : item,
        ),
      },
    }));
  const point = (event: PointerEvent<SVGSVGElement>): Point => {
    const bounds = event.currentTarget.getBoundingClientRect();
    return [
      clamp((event.clientX - bounds.left) / bounds.width),
      clamp((event.clientY - bounds.top) / bounds.height),
    ];
  };
  const marker = (event: PointerEvent<SVGSVGElement>) => {
    if (s.busy || s.running) return;
    const value = point(event);
    if (mode === 'scale') {
      setPoints((old) => (old.length === 1 ? [...old, value] : [value]));
      setDistance('');
      s.setSpec((old) => ({
        ...old,
        reconstruction_plan: { ...old.reconstruction_plan!, scale_reference: null },
      }));
      return;
    }
    start.current = value;
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const drag = (event: PointerEvent<SVGSVGElement>) => {
    if (!start.current || s.busy || s.running) return;
    const end = point(event),
      begin = start.current;
    const region: PhotoObservation['region'] = [
      Math.min(begin[0], end[0]),
      Math.min(begin[1], end[1]),
      Math.abs(begin[0] - end[0]),
      Math.abs(begin[1] - end[1]),
    ];
    if (region[2] >= 0.05 && region[3] >= 0.05) patchRegion(region);
  };
  const calibrate = (value: string) => {
    setDistance(value);
    const length = Number(value);
    const valid =
      points.length === 2 &&
      Number.isFinite(length) &&
      length > 0 &&
      length <= 10000 &&
      (points[0][0] - points[1][0]) ** 2 + (points[0][1] - points[1][1]) ** 2 >= 0.0001;
    s.setSpec((old) => ({
      ...old,
      reconstruction_plan: {
        ...old.reconstruction_plan!,
        scale_reference: valid
          ? {
              asset_id: old.reconstruction_plan!.source_asset_ids[0],
              points: points as [Point, Point],
              distance_mm: length,
            }
          : null,
      },
    }));
  };
  return (
    <div className="photo-region">
      <div className="surface-tabs" role="group" aria-label="照片标注工具">
        <button aria-pressed={mode === 'region'} onClick={() => setMode('region')}>
          主体范围
        </button>
        <button
          aria-pressed={mode === 'scale'}
          disabled={index !== 0}
          onClick={() => setMode('scale')}
        >
          实物标尺
        </button>
      </div>
      <div
        className="photo-region-image"
        style={{ '--photo-ratio': width / height } as CSSProperties}
      >
        <img src={assetUrl(observation.asset_id)} alt={`参考照片 ${index + 1}`} />
        <svg
          viewBox={`0 0 ${width} ${height}`}
          aria-label={mode === 'region' ? '拖动选择完整主体范围' : '点击已知长度的两个端点'}
          onPointerDown={marker}
          onPointerMove={drag}
          onPointerUp={() => {
            start.current = null;
          }}
          onPointerCancel={() => {
            start.current = null;
          }}
        >
          <rect
            className="photo-region-box"
            x={rect[0] * width}
            y={rect[1] * height}
            width={rect[2] * width}
            height={rect[3] * height}
          />
          {index === 0 &&
            points.map(([x, y], i) => (
              <g key={i}>
                <circle
                  className="photo-scale-point"
                  cx={x * width}
                  cy={y * height}
                  r={Math.min(width, height) / 65}
                />
                <text
                  x={x * width}
                  y={y * height}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fontSize={Math.min(width, height) / 48}
                >
                  {i + 1}
                </text>
              </g>
            ))}
        </svg>
      </div>
      {mode === 'region' ? (
        <>
          <small>拖出包含完整主体的范围；每个角度分别确认。</small>
          <div className="region-fields">
            {['左侧', '顶部', '宽度', '高度'].map((label, i) => (
              <label key={label}>
                {label}
                <input
                  type="number"
                  aria-label={`主体范围${label}百分比`}
                  min={i < 2 ? 0 : 5}
                  max={100}
                  step={0.5}
                  value={Number((rect[i] * 100).toFixed(1))}
                  disabled={s.busy || s.running}
                  onChange={(event) => {
                    const next = [...rect] as PhotoObservation['region'];
                    next[i] = Number(event.target.value) / 100;
                    if (
                      next[0] + next[2] <= 1 &&
                      next[1] + next[3] <= 1 &&
                      Math.min(next[2], next[3]) >= 0.05
                    )
                      patchRegion(next);
                  }}
                />
              </label>
            ))}
          </div>
        </>
      ) : (
        <>
          <small>在物体可见表面点选已知长度的两端，再填入实测距离。</small>
          <label className="scale-distance">
            两端实际距离{' '}
            <span>
              <input
                type="number"
                aria-label="标尺实际距离"
                min={0.1}
                max={10000}
                step={0.1}
                value={distance}
                disabled={points.length !== 2 || s.busy || s.running}
                onChange={(event) => calibrate(event.target.value)}
              />{' '}
              mm
            </span>
          </label>
          <button
            className="link"
            onClick={() => {
              setPoints([]);
              setDistance('');
              s.setSpec((old) => ({
                ...old,
                reconstruction_plan: { ...old.reconstruction_plan!, scale_reference: null },
              }));
            }}
          >
            清除标尺，按作品高度缩放
          </button>
        </>
      )}
    </div>
  );
}
