import { usagiArt } from '../theme/usagi';

export function House() {
  return (
    <img
      className="cottage cottage-art"
      src={usagiArt.cottage}
      alt="乌萨奇的小屋：橘色屋顶、圆木门与花草，乌萨奇在门口迎接你"
      draggable={false}
    />
  );
}
