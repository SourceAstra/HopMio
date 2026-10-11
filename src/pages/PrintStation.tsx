import { useState } from 'react';
import { PageHeading } from '../components/PageHeading';
import { Simulator } from '../features/printing/Simulator';
import { ExportButtons } from '../features/printing/ExportButtons';
export function PrintStation() {
  const [checked, setChecked] = useState<string[]>([]);
  const checklist = [
    '家长已检查首层、薄壁与支撑',
    '打印板干净，材料与喷嘴配置正确',
    '打印机周围留出空间，不触摸热喷嘴与热床',
    '在 Bambu Studio 或打印机上由家长确认开始',
  ];
  return (
    <>
      <PageHeading
        title="打印站"
        description="真正的制造，由你和家长一起完成。小屋不会自动向打印机发送任务。"
      />
      <div className="two-columns">
        <Simulator />
        <section className="panel form-panel">
          <h2>和家长一起检查</h2>
          {checklist.map((text) => (
            <label className="checklist" key={text}>
              <input
                type="checkbox"
                checked={checked.includes(text)}
                onChange={(e) =>
                  setChecked((old) =>
                    e.target.checked ? [...old, text] : old.filter((t) => t !== text),
                  )
                }
              />
              {text}
            </label>
          ))}
          <ExportButtons />
          <p className="soft-notice">
            当前采用 Bambu Studio 文件交接。未接入真实打印机状态；模拟进度不会标记作品已打印。
          </p>
        </section>
      </div>
    </>
  );
}
