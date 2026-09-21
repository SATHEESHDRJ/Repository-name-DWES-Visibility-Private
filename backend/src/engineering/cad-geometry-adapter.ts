/**
 * CadGeometryAdapter — replaceable CAD parser boundary for Mode A.
 *
 * LICENSING GATE: no CAD parser is bundled into DWES until licences of the
 * direct + transitive dependency tree are reviewed and approved. Until then
 * Mode A stays behind DWES_CAD_GEOMETRY_ENABLED=false (default) and this
 * adapter returns unavailable diagnostics so Mode B schematic always runs.
 *
 * Forbidden without explicit approval:
 *  - GPL converters bundled into closed DWES
 *  - Embedding a Vue CAD app inside React
 *  - Autodesk APS/Forge or any cloud CAD upload service
 */

export type CadParseStatus =
  | 'disabled'
  | 'licence_rejected'
  | 'parser_unavailable'
  | 'unsupported_format'
  | 'parse_failed'
  | 'incomplete_geometry'
  | 'ok';

export interface CadExtractedDevice {
  extractedTag: string;
  blockOrEntityId: string;
  x: number;
  y: number;
  width?: number;
  height?: number;
  rotation?: number;
  terminals: Array<{ terminalReference: string; x: number; y: number }>;
}

export interface CadExtractedRoute {
  entityId: string;
  points: Array<{ x: number; y: number }>;
  layer?: string;
}

export interface CadParseResult {
  status: CadParseStatus;
  drawingRevision?: string | null;
  devices: CadExtractedDevice[];
  routes: CadExtractedRoute[];
  diagnostics: string[];
}

export interface CadGeometryAdapter {
  readonly id: string;
  readonly enabled: boolean;
  canParse(filename: string, mimeType?: string): boolean;
  parse(buffer: Buffer, filename: string): Promise<CadParseResult>;
}

/** Capability flag — Mode A remains off until a licensed parser is approved. */
export function isCadGeometryEnabled(): boolean {
  return String(process.env.DWES_CAD_GEOMETRY_ENABLED || '').toLowerCase() === 'true';
}

export class DisabledCadGeometryAdapter implements CadGeometryAdapter {
  readonly id = 'disabled-cad-adapter';
  readonly enabled = false;

  canParse(_filename: string, _mimeType?: string): boolean {
    return false;
  }

  async parse(_buffer: Buffer, filename: string): Promise<CadParseResult> {
    return {
      status: isCadGeometryEnabled() ? 'parser_unavailable' : 'disabled',
      devices: [],
      routes: [],
      diagnostics: [
        'Mode A CAD geometry is not active.',
        `DWES_CAD_GEOMETRY_ENABLED=${isCadGeometryEnabled() ? 'true' : 'false'} (default false).`,
        'No Autodesk APS/Forge or cloud CAD service is used.',
        'No GPL CAD converter is bundled.',
        `Requested file: ${filename || '(none)'}.`,
        'Falling back to Mode B automatic Excel schematic.',
      ],
    };
  }
}

/** Singleton adapter — swap implementation only after licence approval. */
export const cadGeometryAdapter: CadGeometryAdapter = new DisabledCadGeometryAdapter();
