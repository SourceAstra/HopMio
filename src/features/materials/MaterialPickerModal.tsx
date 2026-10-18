import { useState } from 'react';
import { Modal } from '../../components/Modal';
import { ShelfPicker } from './ShelfPicker';

interface PickerProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (ids: string[]) => void;
  currentAssetIds?: string[];
  title?: string;
  description?: string;
  limit?: number;
}

export function MaterialPickerModal(props: PickerProps) {
  return props.isOpen ? <PickerDialog {...props} /> : null;
}

function PickerDialog({
  onClose,
  onConfirm,
  currentAssetIds = [],
  title = '从素材灵感架挑选照片',
  description = '选择同一物体的照片，加入当前作品。',
  limit = 96,
}: PickerProps) {
  const [ids, setIds] = useState(currentAssetIds);
  return (
    <Modal title={title} onClose={onClose}>
      <p className="muted">{description}</p>
      <ShelfPicker value={ids} onChange={setIds} limit={limit} />
      <div className="shelf-picker-footer">
        <button type="button" className="secondary" onClick={onClose}>
          取消
        </button>
        <button
          type="button"
          className="primary"
          onClick={() => {
            onConfirm(ids);
            onClose();
          }}
        >
          确认选用
        </button>
      </div>
    </Modal>
  );
}
