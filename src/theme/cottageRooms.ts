import { rooms } from './rooms';

export type CottageRoom = 'check' | 'prepare' | 'print' | 'workshop' | 'gallery' | 'library';
export const cottageRoomScenes: Record<CottageRoom, { label: string; companion: string }> = {
  check: { label: '乌萨奇的检查看板', companion: '一起检查，让作品更结实。' },
  prepare: { label: '乌萨奇的备料工作台', companion: '选好材料，再看看每一层。' },
  print: { label: '乌萨奇的制造角', companion: '和家长一起，把想法变成实物。' },
  workshop: { label: '乌萨奇的小小实验室', companion: '改一个参数，发现新的形状。' },
  gallery: { label: '亲子共创故事墙', companion: '把我们的造物故事，留在小屋里。' },
  library: { label: '乌萨奇的作品柜', companion: '每个想法，都有属于自己的位置。' },
};
export function cottageRoomInfo(room: CottageRoom) {
  return rooms.find((item) => item.id === room)!;
}
