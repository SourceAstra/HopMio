// 使用隔离作品目录验证发布目录中的真实 Electron + 内置 Python，不启动切片或打印。
import { _electron as electron } from '@playwright/test';
import assert from 'node:assert/strict';
import path from 'node:path';
const root=process.cwd();
const env={...process.env, YAHA_DATA_DIR:path.join(root,'.artifacts/verification/packaged-app-data')};
delete env.ELECTRON_RUN_AS_NODE;
delete env.PYTHONHOME;
delete env.PYTHONPATH;
const app=await electron.launch({executablePath:path.join(root,'.artifacts/package-windows/output/win-unpacked/呀哈造物.exe'),env,timeout:60000});
try{
  assert(await app.evaluate(({app})=>app.isPackaged));
  const page=await app.firstWindow();
  await page.getByRole('button',{name:/造物桌面/}).waitFor({timeout:60000});
  const result=await page.evaluate(async()=>{
    const bootstrap=await window.yaha.call('bootstrap',{});
    return {projects:bootstrap.projects.length,hasModel:!!bootstrap.projects[0]?.model};
  });
  assert.equal(result.projects,1);assert(result.hasModel);
  await page.getByRole('button',{name:/小屋设置|家长与设置|设置/}).first().click();
  await page.getByRole('tab',{name:/模型配置/}).waitFor();
  await page.getByRole('button',{name:'保存此模型预算',exact:true}).waitFor();
  await page.screenshot({path:'.artifacts/verification/packaged-app.png'});
  console.log('真实桌面发行目录启动通过：内置 Python、作品模型、设置 Tab 与预算入口均可用。');
}finally{await app.close();}
