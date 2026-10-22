// 检查真实前端调用与宿主公开能力一致，防止入口调用不存在的操作。
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { parseSync } from 'vite';
import { publicMethods } from '../../shared/methods.ts';

const failures=[];
let calls=0;
for (const entry of await fs.readdir('src',{recursive:true,withFileTypes:true})) {
  if (!entry.isFile() || !/\.tsx?$/.test(entry.name)) continue;
  const file=path.join(entry.parentPath,entry.name);
  const source=parseSync(file,await fs.readFile(file,'utf8'));
  assert.deepEqual(source.errors,[],`${file} 解析失败`);
  function visit(node) {
    if (!node || typeof node!=='object') return;
    if (node.type==='CallExpression' && node.callee.type==='Identifier' && node.callee.name==='call' && typeof node.arguments[0]?.value==='string') {
      calls++;
      if (!publicMethods.has(node.arguments[0].value)) failures.push(`${file}: ${node.arguments[0].value}`);
    }
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) value.forEach(visit);
      else if (value && typeof value==='object') visit(value);
    }
  }
  visit(source.program);
}
assert(calls>0,'没有找到前端RPC调用，检查器未覆盖源码');
assert.deepEqual(failures,[],'前端存在宿主未公开的RPC调用');
console.log(`前端 ${calls} 处静态RPC调用与公开能力一致。`);
