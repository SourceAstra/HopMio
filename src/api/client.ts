export async function call<T>(method: string, params: unknown = {}): Promise<T> {
  if (window.yaha) return window.yaha.call(method, params) as Promise<T>;
  const response = await fetch('/api/rpc', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ method, params }),
  });
  const answer = await response.json();
  if (answer.error) throw Object.assign(new Error(answer.error.message), { code: answer.error.code });
  if (!response.ok) throw new Error(`请求失败（HTTP ${response.status}），请检查服务连接。`);
  return answer.result as T;
}
export function assetUrl(id: string) {
  return window.yaha ? `yaha://assets/${id}` : `/api/assets/${id}`;
}
export async function download(id: string, name: string) {
  if (window.yaha?.desktop && !window.location.origin.startsWith('http')) {
    return window.yaha.save(id);
  }
  const response = await fetch(assetUrl(id));
  if (!response.ok) throw new Error(`获取文件失败（HTTP ${response.status}）`);
  const blob = await response.blob();

  // 优先采用系统原生另存为弹窗（直接由用户指定本地保存目录）
  if (typeof window !== 'undefined' && 'showSaveFilePicker' in window) {
    try {
      const ext = name.includes('.') ? '.' + name.split('.').pop()! : '';
      const handle = await (window as unknown as { showSaveFilePicker: (options: unknown) => Promise<FileSystemFileHandle> }).showSaveFilePicker({
        suggestedName: name,
        types: ext
          ? [
              {
                description: `${ext.toUpperCase()} 成果文件`,
                accept: { [blob.type || 'application/octet-stream']: [ext] },
              },
            ]
          : undefined,
      });
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      return { saved: true, userSide: true };
    } catch (err: unknown) {
      if ((err as Error)?.name === 'AbortError') return { canceled: true };
    }
  }

  // 兜底采用标准可靠的浏览器流式本地另存为
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.style.display = 'none';
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    if (a.parentNode) document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 1000);
  return { saved: true, userSide: true };
}
export async function fileBase64(file: File) {
  const limit = file.name.toLowerCase().endsWith('.usagi') ? 256 : 12;
  if (file.size > limit * 1024 * 1024) throw new Error(`文件超过 ${limit} MB，请先压缩。`);
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
