export async function call<T>(method: string, params: unknown = {}): Promise<T> {
  if (window.yaha) return window.yaha.call(method, params) as Promise<T>;
  const response = await fetch('/api/rpc', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ method, params }),
  });
  const answer = await response.json();
  if (answer.error) throw new Error(answer.error.message);
  return answer.result as T;
}
export function assetUrl(id: string) {
  return window.yaha ? `yaha://assets/${id}` : `/api/assets/${id}`;
}
export async function download(id: string, name: string) {
  if (window.yaha) return window.yaha.save(id);
  const response = await fetch(assetUrl(id));
  const url = URL.createObjectURL(await response.blob());
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
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
