/** Frame/panel is verified and ready for technician assignment. */
export function isVerifiedFrame(frame: { compare_status?: string } | null | undefined): boolean {
  return frame?.compare_status === 'validated' || frame?.compare_status === 'verified';
}
