# Explorer gap crosswalk (post-[Explore LIVE TB oversized/OCR gaps](c3f21369-b580-4698-9ebb-5e687617c0c3))

Date: 2026-09-21  
Source: explore agent findings vs master-continuation implementation.

| Explorer priority | Status after master continuation | Evidence / location |
|-------------------|----------------------------------|---------------------|
| 1. OCR packaging (Dockerfile.api / sidecar) | **Closed in code** (API image path) — restore container already had OCR; Dockerfile.api now installs tesseract + drawing-intelligence | `infra/docker/Dockerfile.api`; live probe pytesseract 5.3.0 |
| 2. PDF memory guards (viewer + cli_analyse) | **Closed** | `oversized-page.util.ts`, `clampPdfCanvas.ts`, `PdfDocumentViewer.tsx`, `cli_analyse.py` downscale, `oversized-page.test.cjs` |
| 3. Cut/Strip portfolio aggregate API | **Closed** | `aggregateCrimpingKpis`, `GET /api/supervisor/crimping-portfolio`, Status Preparation chips |
| 4. Mid Change / reassign 409 | **Already present on backend**; UI surfaces API message via `confirmAsync` / `messageFrom` | `tech.service.ts` ConflictException; `PanelAssignmentModal.tsx` |

## Remaining (unchanged NO-GO / PARTIAL items)

- Rebuild/redeploy restore API image so portfolio route + Dockerfile OCR layer ship (Owner approve)
- Original oversized pixmap **browser** acceptance still open
- Optional dedicated 409→auto-reload toast not required (backend message already actionable)
- Compose OCR sidecar not added (API-image path chosen instead)

No additional code follow-up required from the explore report beyond this crosswalk.
