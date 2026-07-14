import { useCallback, useEffect, useRef, useState } from 'react';
import { projectsApi } from '../services/api';
import { onDocumentsChanged } from '../utils/projectDocumentsEvents';
import { onFramesChanged } from '../utils/projectFramesEvents';
import {
  type DocumentStatus,
  pickPreviewableDrawing,
  wiringScheduleFromVerifyData,
} from '../utils/documentAvailability';

const LOADING_DRAWING: DocumentStatus = { availability: 'loading' };
const LOADING_WIRING: DocumentStatus = { availability: 'loading' };
const MISSING_DRAWING: DocumentStatus = {
  availability: 'missing',
  message: 'No Drawing Uploaded',
};
const MISSING_WIRING: DocumentStatus = {
  availability: 'missing',
  message: 'No Wiring Schedule Uploaded',
};

function apiErrorMessage(err: unknown, fallback: string): string {
  const msg = (err as { response?: { data?: { message?: string } }; message?: string })?.response?.data?.message
    ?? (err as { message?: string })?.message;
  return typeof msg === 'string' && msg.trim() ? msg.trim() : fallback;
}

/**
 * Validates drawing + wiring schedule availability from the API for the
 * Project Information card (Supervisor Projects tab).
 */
export function useProjectPanelDocumentStatus(
  projectCode: string | undefined,
  panelId: string | undefined,
) {
  const [drawing, setDrawing] = useState<DocumentStatus>(LOADING_DRAWING);
  const [wiring, setWiring] = useState<DocumentStatus>(LOADING_WIRING);
  const drawingGenRef = useRef(0);
  const wiringGenRef = useRef(0);

  const refreshDrawings = useCallback(async (code: string, frameId: string | undefined, options?: { showLoading?: boolean }) => {
    if (!frameId) {
      drawingGenRef.current += 1;
      setDrawing({ availability: 'missing', message: 'Select a panel first' });
      return;
    }
    const gen = ++drawingGenRef.current;
    if (options?.showLoading !== false) setDrawing(LOADING_DRAWING);
    try {
      const raw = await projectsApi.panelDrawing(code, frameId);
      if (gen !== drawingGenRef.current) return;
      const slot = raw?.drawing_2d;
      const summaries = slot ? [{ id: slot.id, original_name: slot.original_name }] : [];
      const active = pickPreviewableDrawing(summaries);
      if (!active) {
        setDrawing(MISSING_DRAWING);
        return;
      }
      setDrawing({
        availability: 'available',
        drawing: active,
        fileName: active.original_name,
      });
    } catch (err) {
      if (gen !== drawingGenRef.current) return;
      setDrawing({
        availability: 'error',
        message: apiErrorMessage(err, 'Failed to check drawings for this panel.'),
      });
    }
  }, []);

  const refreshWiring = useCallback(async (code: string, frameId: string | undefined, options?: { showLoading?: boolean }) => {
    if (!frameId) {
      wiringGenRef.current += 1;
      setWiring({
        availability: 'missing',
        message: 'Select a panel first',
      });
      return;
    }
    const gen = ++wiringGenRef.current;
    if (options?.showLoading !== false) setWiring(LOADING_WIRING);
    try {
      const data = await projectsApi.verifyData(code, frameId);
      if (gen !== wiringGenRef.current) return;
      const cables = Array.isArray(data?.cables) ? data.cables : [];
      if (wiringScheduleFromVerifyData(data)) {
        setWiring({
          availability: 'available',
          fileName: data?.original_filename || undefined,
          cableCount: cables.length,
        });
        return;
      }
      setWiring(MISSING_WIRING);
    } catch (err) {
      if (gen !== wiringGenRef.current) return;
      setWiring({
        availability: 'error',
        message: apiErrorMessage(err, 'Failed to load wiring schedule for this panel.'),
      });
    }
  }, []);

  const refresh = useCallback((opts?: { drawing?: boolean; wiring?: boolean; showLoading?: boolean }) => {
    if (!projectCode) {
      drawingGenRef.current += 1;
      wiringGenRef.current += 1;
      setDrawing(MISSING_DRAWING);
      setWiring(MISSING_WIRING);
      return;
    }
    const refreshDrawing = opts?.drawing !== false;
    const refreshWiringSchedule = opts?.wiring !== false;
    const showLoading = opts?.showLoading;
    if (refreshDrawing) void refreshDrawings(projectCode, panelId, { showLoading });
    if (refreshWiringSchedule) void refreshWiring(projectCode, panelId, { showLoading });
  }, [projectCode, panelId, refreshDrawings, refreshWiring]);

  // Initial load + project/panel switch — show loading indicators.
  useEffect(() => {
    if (!projectCode) {
      drawingGenRef.current += 1;
      wiringGenRef.current += 1;
      setDrawing(MISSING_DRAWING);
      setWiring(MISSING_WIRING);
      return;
    }
    void refreshDrawings(projectCode, panelId, { showLoading: true });
    void refreshWiring(projectCode, panelId, { showLoading: true });
  }, [projectCode, panelId, refreshDrawings, refreshWiring]);

  useEffect(() => {
    if (!projectCode) return;
    return onFramesChanged((detail) => {
      if (detail.projectCode !== projectCode) return;
      refresh({ showLoading: false });
    });
  }, [projectCode, refresh]);

  useEffect(() => {
    if (!projectCode) return;
    return onDocumentsChanged((detail) => {
      if (detail.projectCode !== projectCode) return;
      if (detail.frameId && panelId && detail.frameId !== panelId) {
        if (detail.kind === 'wiring') return;
      }

      const refreshDrawing = detail.kind === 'drawing' || detail.kind === 'both';
      const refreshWiringSchedule = detail.kind === 'wiring' || detail.kind === 'both';
      const silent = { showLoading: false as const };

      if (detail.action === 'deleted') {
        if (refreshDrawing) setDrawing(MISSING_DRAWING);
        if (refreshWiringSchedule) setWiring(MISSING_WIRING);
        refresh({
          drawing: refreshDrawing,
          wiring: refreshWiringSchedule,
          ...silent,
        });
        return;
      }

      if (detail.action === 'replaced') {
        refresh({
          drawing: refreshDrawing,
          wiring: refreshWiringSchedule,
          ...silent,
        });
        return;
      }

      if (detail.kind === 'drawing') {
        refresh({ drawing: true, wiring: false, ...silent });
        return;
      }
      if (detail.kind === 'wiring') {
        refresh({ drawing: false, wiring: true, ...silent });
        return;
      }
      refresh(silent);
    });
  }, [projectCode, panelId, refresh]);

  return {
    drawing,
    wiring,
    refreshDrawings: () => (projectCode ? refreshDrawings(projectCode, panelId) : Promise.resolve()),
    refreshWiring: () => (projectCode ? refreshWiring(projectCode, panelId) : Promise.resolve()),
    refresh,
  };
}
