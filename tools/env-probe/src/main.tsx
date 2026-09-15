import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';

function EnvironmentProbe() {
  const [count, setCount] = useState(0);
  const [health, setHealth] = useState('正在连接后端');
  useEffect(() => {
    const controller = new AbortController();
    fetch('/probe/health', { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error('HTTP health failure');
        const data: unknown = await response.json();
        if (typeof data !== 'object' || data === null || !('ok' in data)
          || data.ok !== true || !('message' in data) || data.message !== '本地后端已连接') {
          throw new Error('Invalid probe response');
        }
        setHealth(data.message);
      })
      .catch(() => { if (!controller.signal.aborted) setHealth('后端连接失败'); });
    return () => controller.abort();
  }, []);
  return <main>
    <h1>环境验证样本</h1>
    <p>仅用于阶段1B，不是圆桌产品功能或样例讨论数据。</p>
    <button onClick={() => setCount((value) => value + 1)}>验证交互</button>
    <p aria-live="polite">操作次数：{count}</p>
    <p role="status">{health}</p>
  </main>;
}

const root = document.getElementById('root');
if (!root) throw new Error('Missing probe root');
createRoot(root).render(<EnvironmentProbe />);
