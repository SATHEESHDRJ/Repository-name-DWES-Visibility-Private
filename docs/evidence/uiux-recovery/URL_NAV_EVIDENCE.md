# URL-addressable navigation — evidence

Date: 2026-09-19 (re-proven after history fix)  
Hook: `src/hooks/useDashboardUrl.ts`

## Wired surfaces

| Role | Param | Behavior |
|------|--------|----------|
| Supervisor | `?tab=projects\|status\|live-tb` | Tab change pushes history; back/forward restore tab |
| Supervisor Projects | `?project=&panel=` | Deep-link + user dropdown changes push; remount sync uses `replace` so forward is not wiped |
| Director | `?tab=live_status\|submitted_panels\|monitoring` | Same tab pattern |
| Technician | `?view=panels\|tablet\|full` | Tablet / Full View addressable |

## Runtime proof (local restore `:5275`, supervisor1)

| Step | URL |
|------|-----|
| 1 Start | `/supervisor?tab=projects&project=002&panel=frame_1784977437763_0_ahv74` |
| 2 Click Status | `/supervisor?tab=status&project=002&panel=frame_…` |
| 3 `history.back()` | `/supervisor?tab=projects&project=002&panel=frame_…` |
| 4 `history.forward()` | `/supervisor?tab=status&project=002&panel=frame_…` |

Result: **backOk=true**, **forwardOk=true**, **projectKept=true** (CDP Runtime.evaluate 2026-09-19).

## Fix applied this pass

ProjectsTab remount hydration previously called `setProjectPanel(..., false)` with empty selection and wiped the forward stack. Sync write-back now uses hydrate guards + `replace: true`; intentional project/panel dropdown changes still `push`.

## TECHNICAL PASS

URL nav is **TECHNICAL PASS** with this evidence. Overall UI/UX remains **PENDING OWNER VISUAL ACCEPTANCE**.
