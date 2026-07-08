import { useState } from 'react';
import { ButtonHintPopover } from 'dwes';

export function AnchoredHint() {
  const [el, setEl] = useState<HTMLButtonElement | null>(null);
  return (
    <div style={{ padding: '1rem 15rem 1rem 1rem' }}>
      <button ref={setEl} className="btn-primary" type="button">Complete frame</button>
      {el && (
        <ButtonHintPopover
          anchorEl={el}
          message="Verify all cables first."
          duration={9999999}
          onDismiss={() => {}}
        />
      )}
    </div>
  );
}
