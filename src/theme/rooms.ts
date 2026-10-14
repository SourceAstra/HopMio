import {
  Armchair,
  House,
  Images,
  ShieldCheck,
  Package,
  Printer,
  Library,
  Sparkles,
  Wrench,
  Settings,
  Compass,
  Hammer,
  Trophy,
  Lightbulb,
} from 'lucide-react';

export const rooms = [
  { id: 'hall', name: '小屋门厅', icon: House, hint: '造物起点与迎宾' },
  { id: 'inspirations', name: '灵感宝箱', icon: Lightbulb, hint: '海量造物奇思妙想' },
  { id: 'desk', name: '造物桌', icon: Armchair, hint: '让想法长出形状' },
  { id: 'materials', name: '取材角', icon: Images, hint: '照片、画与灵感' },
  { id: 'check', name: '模型体检室', icon: ShieldCheck, hint: '给作品做个检查' },
  { id: 'prepare', name: '打印准备台', icon: Package, hint: '打包带去打印' },
  { id: 'print', name: '打印站', icon: Printer, hint: '和家长一起制造' },
  { id: 'library', name: '作品柜', icon: Library, hint: '每次尝试都值得留下' },
  { id: 'gallery', name: '乌萨奇展厅', icon: Sparkles, hint: '每个作品都有故事' },
  { id: 'workshop', name: '小屋工坊', icon: Wrench, hint: '我也能修改软件' },
  { id: 'settings', name: '家长与设置', icon: Settings, hint: '陪伴与云端配置' },
] as const;

export type Room = (typeof rooms)[number]['id'];

export interface NavCategory {
  id: string;
  name: string;
  tagline: string;
  icon: typeof Armchair;
  badge?: string;
  rooms: Room[];
  defaultRoom: Room;
}

export const navCategories: NavCategory[] = [
  {
    id: 'hall',
    name: '小屋门厅',
    tagline: '推门进屋 · 造物起点',
    icon: House,
    badge: '主页',
    rooms: ['hall'],
    defaultRoom: 'hall',
  },
  {
    id: 'desk',
    name: '造物桌面',
    tagline: '3D主控台 · 动口即造物',
    icon: Armchair,
    rooms: ['desk'],
    defaultRoom: 'desk',
  },
  {
    id: 'inspiration',
    name: '取材角',
    tagline: '照片素材 · 模型导入',
    icon: Compass,
    rooms: ['materials'],
    defaultRoom: 'materials',
  },
  {
    id: 'manufacturing',
    name: '体检制造',
    tagline: '模型体检 · 切片与打印',
    icon: Hammer,
    rooms: ['check', 'prepare', 'print'],
    defaultRoom: 'check',
  },
  {
    id: 'showcase',
    name: '作品展厅',
    tagline: '荣誉展台 · 版本档案',
    icon: Trophy,
    rooms: ['gallery', 'library'],
    defaultRoom: 'gallery',
  },
  {
    id: 'workshop',
    name: '小屋工坊',
    tagline: '小小极客 · 编程与探索',
    icon: Wrench,
    badge: '探索',
    rooms: ['workshop'],
    defaultRoom: 'workshop',
  },
];
