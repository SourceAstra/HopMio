import { useState } from 'react';
import { useStudio } from '../../state/StudioContext';
import { call } from '../../api/client';
export function GuardianForm({ onUnlock }: { onUnlock: (token: string) => void }) {
  const s = useStudio();
  const [pin, setPin] = useState('');
  return (
    <section className="panel form-panel">
      <h2>{s.preferences?.pin_set ? '请家长解锁' : '和家长设置小屋口令'}</h2>
      <p>
        {s.preferences?.pin_set
          ? '云端服务与额度设置需要家长口令。'
          : '首次设置一个 6–12 位数字口令，由家长保管。'}
      </p>
      <label>
        家长口令
        <input
          type="password"
          aria-label="家长口令"
          inputMode="numeric"
          maxLength={12}
          value={pin}
          onChange={(e) => setPin(e.target.value)}
        />
      </label>
      <button
        className="primary"
        disabled={s.busy}
        onClick={() =>
          void s.act(async () => {
            const result = await call<{ token: string }>('settings.unlock', { pin });
            onUnlock(result.token);
            setPin('');
            s.setNotice('家长设置已解锁，有效 10 分钟。');
          })
        }
      >
        解锁设置
      </button>
      <small>这是家庭使用约定，不是操作系统级防护。</small>
    </section>
  );
}
