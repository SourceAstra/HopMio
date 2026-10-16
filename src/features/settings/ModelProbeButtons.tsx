import { useEffect, useRef, useState } from 'react';
import { call } from '../../api/client';
import { MessageSquare, ScanEye, LoaderCircle } from 'lucide-react';

export function ModelProbeButtons({
  connection,
  disabled,
  onImageVerified,
}: {
  connection: {
    url: string;
    protocol: string;
    model: string;
    api_key: string;
    saved_id?: string;
  };
  disabled: boolean;
  onImageVerified: () => void;
}) {
  const [busy, setBusy] = useState('');
  const [results, setResults] = useState<Record<string, { error: boolean; message: string }>>({});
  const generation = useRef(0);
  useEffect(() => {
    generation.current++;
    setResults({});
    setBusy('');
    return () => {
      generation.current++;
    };
  }, [
    connection.url,
    connection.model,
    connection.protocol,
    connection.api_key,
    connection.saved_id,
  ]);
  async function test(kind: 'text' | 'image') {
    const current = ++generation.current;
    setBusy(kind);
    try {
      const result = await call<{ latency_ms: number; message: string; supports_images: boolean }>(
        'settings.models.test',
        { ...connection, kind },
      );
      if (current !== generation.current) return;
      setResults((previous) => ({
        ...previous,
        [kind]: {
          error: false,
          message: `${kind === 'image' ? '图片' : '文字'}测试通过 · ${result.latency_ms} ms。${result.message}`,
        },
      }));
      if (kind === 'image' && result.supports_images) onImageVerified();
    } catch (error) {
      if (current !== generation.current) return;
      setResults((previous) => ({
        ...previous,
        [kind]: {
          error: true,
          message: `${kind === 'image' ? '图片' : '文字'}测试：${(error as Error).message}`,
        },
      }));
    } finally {
      if (current === generation.current) setBusy('');
    }
  }
  return (
    <div className="model-probes">
      <div className="model-actions">
        <button
          type="button"
          className="secondary"
          disabled={disabled || !!busy}
          onClick={() => void test('text')}
        >
          {busy === 'text' ? (
            <LoaderCircle size={14} className="model-spinning" />
          ) : (
            <MessageSquare size={14} />
          )}
          {busy === 'text' ? '正在测试文字…' : '测试文字能力'}
        </button>
        <button
          type="button"
          className="secondary"
          disabled={disabled || !!busy}
          onClick={() => void test('image')}
        >
          {busy === 'image' ? (
            <LoaderCircle size={14} className="model-spinning" />
          ) : (
            <ScanEye size={14} />
          )}
          {busy === 'image' ? '正在识别测试图…' : '测试图片能力'}
        </button>
      </div>
      {Object.entries(results).map(([kind, result]) => (
        <p key={kind} role="status" className={`model-status${result.error ? ' error' : ''}`}>
          {result.message}
        </p>
      ))}
      <small className="model-probe-note">使用内置测试图，服务商可能计费。</small>
    </div>
  );
}
