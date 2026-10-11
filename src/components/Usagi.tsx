import { usagiArt } from '../theme/usagi';

export function Usagi({ size = 100 }: { size?: number }) {
  return (
    <img
      className="usagi-character"
      src={usagiArt.companion}
      width={size}
      height={size}
      alt="乌萨奇：细长粉色耳朵、圆眼睛、开心的呀哈表情"
      draggable={false}
    />
  );
}
