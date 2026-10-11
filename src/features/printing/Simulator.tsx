import { useEffect, useState } from 'react';
export function Simulator() {
  const [progress, setProgress] = useState(0);
  const [running, setRunning] = useState(false);
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(
      () =>
        setProgress((p) => {
          if (p >= 100) {
            setRunning(false);
            return 100;
          }
          return p + 2;
        }),
      300,
    );
    return () => clearInterval(timer);
  }, [running]);
  return (
    <section className="panel form-panel">
      <span className="pill">教学模拟 · 没有连接设备</span>
      <h2>看看打印如何一层层发生</h2>
      <div className="printer-animation">
        <div className="printer-frame">
          <div className="printer-head" style={{ left: `${15 + (progress % 30)}%` }} />
          <div className="printed-object" style={{ height: `${Math.max(5, progress)}px` }} />
          <div className="printer-bed" />
        </div>
      </div>
      <progress value={progress} max={100} />
      <p>
        {progress}% ·{' '}
        {running ? '正在演示逐层制造' : progress === 100 ? '模拟完成' : '点击开始，了解打印过程'}
      </p>
      <button
        className="secondary"
        onClick={() => {
          setProgress(0);
          setRunning(!running);
        }}
      >
        {running ? '停止模拟' : '开始教学模拟'}
      </button>
    </section>
  );
}
