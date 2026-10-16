// 数据快照只比较内容，JSON 对象字段的排列顺序不代表参数变化。
export function dataSnapshot(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(dataSnapshot).join(',')}]`;
  if (value && typeof value === 'object')
    return `{${Object.entries(value)
      .filter(([, item]) => item !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${dataSnapshot(item)}`)
      .join(',')}}`;
  return JSON.stringify(value) ?? 'null';
}
