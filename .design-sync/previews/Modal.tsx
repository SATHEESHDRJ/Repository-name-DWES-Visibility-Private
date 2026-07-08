import { Modal, Button } from 'dwes';

export function ConfirmDialog() {
  return (
    <Modal
      title="Complete Frame A12"
      size="sm"
      onClose={() => {}}
      footer={
        <>
          <Button variant="secondary">Cancel</Button>
          <Button variant="primary">Complete &amp; submit</Button>
        </>
      }
    >
      <p style={{ margin: 0 }}>
        All 142 cables on this frame are wired and verified. Mark the frame complete and submit it for QC?
      </p>
    </Modal>
  );
}
