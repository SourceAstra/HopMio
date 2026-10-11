import {
  Armchair,
  House,
  Images,
  Heart,
  ShieldCheck,
  Package,
  Printer,
  Library,
  Sparkles,
  Wrench,
  Settings,
} from 'lucide-react';
export const rooms = [
  { id: 'desk', name: '造物桌', icon: Armchair, hint: '让想法长出形状' },
  { id: 'hall', name: '小屋门厅', icon: House, hint: '选择你的造物方式' },
  { id: 'materials', name: '取材角', icon: Images, hint: '照片、画与灵感' },
  { id: 'idea', name: '心意卡', icon: Heart, hint: '把想法说清楚' },
  { id: 'check', name: '模型体检室', icon: ShieldCheck, hint: '给作品做个检查' },
  { id: 'prepare', name: '打印准备台', icon: Package, hint: '打包带去打印' },
  { id: 'print', name: '打印站', icon: Printer, hint: '和家长一起制造' },
  { id: 'library', name: '作品柜', icon: Library, hint: '每次尝试都值得留下' },
  { id: 'gallery', name: '乌萨奇展厅', icon: Sparkles, hint: '每个作品都有故事' },
  { id: 'workshop', name: '小屋工坊', icon: Wrench, hint: '我也能修改软件' },
  { id: 'settings', name: '家长与设置', icon: Settings, hint: '陪伴与云端配置' },
] as const;
export type Room = (typeof rooms)[number]['id'];
