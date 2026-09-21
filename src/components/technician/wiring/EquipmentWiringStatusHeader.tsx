import { useState } from 'react';
import type { Cable } from '../../../types';
import { HardDrive } from '../../ui/icons';
import type { ExtendedCableStatus } from './wiring-utils';
import EquipmentStatusModal from './EquipmentStatusModal';

interface Props {
  cables: Cable[];
  status: Record<string, ExtendedCableStatus>;
  equipmentQuery: string;
  onEquipmentQueryChange?: (equipment: string) => void;
}

/** Progress-matrix EQUIP STATUS card — opens the existing Equipment Status popup. */
export default function EquipmentWiringStatusHeader({
  cables,
  status,
  equipmentQuery,
  onEquipmentQueryChange,
}: Props) {
  const [open, setOpen] = useState(false);
  const selected = equipmentQuery.trim();
  const value = selected || 'ALL';

  return (
    <>
      <button
        type="button"
        className="dwf-progress-card dwf-progress-card--equip"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
        title={selected ? `Equipment Status — ${selected}` : 'Equipment Status — All Equipment'}
        data-testid="equipment-wiring-status"
      >
        <span className="dwf-progress-card__label dwf-progress-card__label--equip">
          <HardDrive size={12} aria-hidden />
          Equip Status
        </span>
        <span className="dwf-progress-card__value">
          <span className="dwf-progress-card__count dwf-progress-card__count--text" title={value}>
            {value}
          </span>
        </span>
      </button>

      <EquipmentStatusModal
        open={open}
        cables={cables}
        status={status}
        equipmentQuery={equipmentQuery}
        onApplyFilter={equipment => onEquipmentQueryChange?.(equipment)}
        onClearFilter={() => onEquipmentQueryChange?.('')}
        onClose={() => setOpen(false)}
      />
    </>
  );
}
