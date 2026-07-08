import { Toast } from 'dwes';

export function Warning() {
  return (
    <Toast
      message="Verify all cables before completing this frame."
      tone="warn"
      duration={9999999}
      onDismiss={() => {}}
    />
  );
}
