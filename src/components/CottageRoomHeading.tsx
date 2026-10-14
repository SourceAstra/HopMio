import type { ReactNode } from 'react';
import { PageHeading } from './PageHeading';
import { Usagi } from './Usagi';
import { usagiArt } from '../theme/usagi';
import { cottageRoomInfo, cottageRoomScenes, type CottageRoom } from '../theme/cottageRooms';
import '../styles/cottage-rooms.css';

export function CottageRoomHeading({
  room,
  description,
  actions,
  backdrop,
}: {
  room: CottageRoom;
  description: string;
  actions?: ReactNode;
  backdrop?: string;
}) {
  const { name, icon: Icon } = cottageRoomInfo(room);
  const scene = cottageRoomScenes[room];
  const imageSrc = backdrop || (room === 'gallery' ? usagiArt.storyWall : usagiArt.workroom);
  return (
    <section
      className={`cottage-room-heading cottage-room-${room}`}
      aria-label={`${name} · 乌萨奇小屋`}
    >
      <img className="cottage-room-backdrop" src={imageSrc} alt="" aria-hidden="true" />
      <div className="cottage-room-copy">
        <span className="cottage-room-sign">
          <Icon size={15} />
          {scene.label}
        </span>
        <PageHeading title={name} description={description} actions={actions} />
      </div>
      <div className="cottage-room-companion">
        <Usagi size={150} />
        <p>{scene.companion}</p>
      </div>
    </section>
  );
}
