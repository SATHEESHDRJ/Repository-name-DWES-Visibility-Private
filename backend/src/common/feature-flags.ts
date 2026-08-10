/**
 * DWES backend feature flags.
 *
 * Flags hide a feature without deleting code, data, or integration points, so
 * the feature can be restored by flipping the flag back on — no re-implementation.
 *
 * All flags default to the documented safe value so production behaviour is
 * unchanged unless an operator explicitly opts in.
 */

/** Read a boolean env flag; anything other than an explicit "true" is off. */
function envFlag(value: string | undefined): boolean {
  return String(value ?? '').trim().toLowerCase() === 'true';
}

/**
 * QA/QC inspection workflow.
 *
 * When ENABLED (true): completed panels must pass QA/QC review
 * (`review_status = 'ready_for_qc'` then `'approved'`) before the Production
 * Supervisor can submit a project to the Operations Director. Rework panels
 * also block submission.
 *
 * When DISABLED (default): the QA/QC review gate is bypassed — a genuinely
 * completed panel can be submitted directly. The supervisor confirmation
 * stamps an interim approval on the assignment so the existing review fields
 * remain consistent, but no fake QA/QC inspection record is created. The
 * QA/QC code, data model, and integration points stay intact for later
 * activation by setting `QA_QC_WORKFLOW_ENABLED=true`.
 */
export function qaQcWorkflowEnabled(): boolean {
  return envFlag(process.env.QA_QC_WORKFLOW_ENABLED);
}

/**
 * Asynchronous (BullMQ-backed) Excel wiring-schedule processing.
 *
 * When ENABLED: `POST /api/upload/wiring-schedule-mapped-async/:code` is available —
 * it stages the uploaded file, enqueues a `excel_parse` job on the existing JobsService
 * queue, and returns a job reference to poll via the existing `GET /api/jobs/:id`.
 * The job runs the exact same `UploadService.uploadMapped` parsing/persistence path as
 * the synchronous endpoint — no duplicated logic.
 *
 * When DISABLED (default): only the existing synchronous
 * `POST /api/upload/wiring-schedule-mapped/:code` endpoint exists, unchanged.
 */
export function asyncExcelProcessingEnabled(): boolean {
  return envFlag(process.env.DWES_ASYNC_EXCEL_PROCESSING);
}

/**
 * Asynchronous (BullMQ-backed) panel completion report (PDF) generation.
 *
 * When ENABLED: `POST /api/projects/:code/frames/:id/report-pdf-async` enqueues a
 * `pdf_report` job that runs the exact same `WiringDocumentService.generatePanelCompletionReport`
 * path used by the existing synchronous PDF endpoint, tracked via `GET /api/jobs/:id`.
 * The existing `GET /api/projects/:code/frames/:id/report-pdf` endpoint remains the
 * actual download mechanism — report generation is fast/deterministic enough that
 * re-running it synchronously for delivery once the job confirms success is cheap and
 * avoids storing a PDF binary in a job's Postgres `result` column.
 *
 * When DISABLED (default): only the existing synchronous report-pdf endpoint exists.
 */
export function asyncReportGenerationEnabled(): boolean {
  return envFlag(process.env.DWES_ASYNC_REPORT_GENERATION);
}