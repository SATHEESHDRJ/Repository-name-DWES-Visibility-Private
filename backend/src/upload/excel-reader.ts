import * as ExcelJS from 'exceljs';

export interface ExcelSheet {
  name: string;
  headers: string[];
  rows: unknown[][];
  headerRow: number;
  dataRowCount: number;
}

export interface ExcelReadResult {
  sheets: ExcelSheet[];
  bestSheet?: string;
}

/**
 * Safe Excel reader using exceljs (no SheetJS/xlsx vulnerabilities).
 * Reads Excel files with limits to prevent DoS.
 */
export class SafeExcelReader {
  private static readonly MAX_ROWS = 50000;
  private static readonly MAX_COLS = 200;
  private static readonly MAX_CELL_LENGTH = 50000;
  private static readonly MAX_SHEETS = 100;

  /**
   * Read Excel file headers and metadata for preview
   */
  static async readHeaders(buffer: Uint8Array): Promise<ExcelReadResult> {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'DWES SafeExcelReader';
    
    await workbook.xlsx.load(buffer as any);
    
    if (workbook.worksheets.length > this.MAX_SHEETS) {
      throw new Error(`Too many sheets (max ${this.MAX_SHEETS})`);
    }

    const sheets: ExcelSheet[] = [];
    
    for (const worksheet of workbook.worksheets) {
      if (worksheet.state === 'hidden' || worksheetsHidden(worksheet)) continue;
      
      const result = this.readSheet(worksheet);
      if (result) {
        sheets.push(result);
      }
    }
    
    if (sheets.length === 0) {
      throw new Error('No readable sheets found in workbook');
    }

    // Score sheets by how many wiring-related keywords they have
    const VFY_KW = ['ferrule', 'cable', 'wire', 'source', 'dest', 'terminal', 's.no', 'sno', 'color', 'size', 'length'];
    for (const sheet of sheets) {
      const headerText = sheet.headers.join(' ').toLowerCase();
      sheet['score'] = VFY_KW.filter(kw => headerText.includes(kw)).length;
    }
    sheets.sort((a, b) => (b['score'] || 0) - (a['score'] || 0));
    
    return {
      sheets,
      bestSheet: sheets[0]?.name,
    };
  }

  /**
   * Read full sheet data for parsing (with row limits)
   */
  static async readSheetData(
    buffer: Uint8Array,
    sheetName: string,
    headerRowOverride?: number,
  ): Promise<{
    headers: string[];
    rows: unknown[][];
    headerRow: number;
    rawHeaders: string[];
  }> {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as any);
    
    const worksheet = workbook.getWorksheet(sheetName) || workbook.worksheets[0];
    if (!worksheet) {
      throw new Error(`Sheet "${sheetName}" not found`);
    }

    return this.readSheetFull(worksheet, headerRowOverride);
  }

  /**
   * Extract metadata from first sheet (panel name, voltage, etc.)
   */
  static async extractMetadata(buffer: Uint8Array): Promise<{
    metadata: Record<string, string>;
    sheetCount: number;
    sheetNames: string[];
  }> {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as any);
    
    const firstSheet = workbook.worksheets[0];
    const meta: Record<string, string> = {};
    
    if (firstSheet) {
      const rows = this.getRows(firstSheet, 15);
      for (const row of rows) {
        const cells = row.map(c => String(c ?? '').trim());
        for (let i = 0; i < cells.length - 1; i++) {
          const key = cells[i].toLowerCase();
          if (key.includes('panel')) meta['panel_name'] = cells[i + 1];
          if (key.includes('voltage')) meta['voltage'] = cells[i + 1];
          if (key.includes('station') || key.includes('substation')) meta['substation'] = cells[i + 1];
          if (key.includes('client') || key.includes('customer')) meta['client'] = cells[i + 1];
        }
      }
    }
    
    return {
      metadata: meta,
      sheetCount: workbook.worksheets.length,
      sheetNames: workbook.worksheets.map(w => w.name),
    };
  }

  private static readSheet(worksheet: ExcelJS.Worksheet): ExcelSheet | null {
    const rowCount = worksheet.actualRowCount || 0;
    if (rowCount === 0) return null;

    // Same header cleaning + full data rows as parse/upload path so the
    // mapping UI shows every cable row (including the first) with matching headers.
    const full = this.readSheetFull(worksheet);
    if (full.headers.every(h => !h)) return null;

    const rows = full.rows.map(row => {
      const out: unknown[] = new Array(full.headers.length).fill('');
      for (let i = 0; i < full.headers.length; i++) {
        out[i] = this.cellDisplay(row[i]);
      }
      return out;
    });

    return {
      name: worksheet.name,
      headers: full.headers,
      rows,
      headerRow: full.headerRow,
      dataRowCount: rows.length,
    };
  }

  private static readSheetFull(
    worksheet: ExcelJS.Worksheet,
    headerRowOverride?: number,
  ): { headers: string[]; rows: unknown[][]; headerRow: number; rawHeaders: string[] } {
    const headerRowIdx = headerRowOverride ?? this.findHeaderRow(worksheet);
    const headerRow = worksheet.getRow(headerRowIdx + 1);
    
    const rawHeaders: string[] = [];
    let colCount = 0;
    headerRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      if (colCount >= this.MAX_COLS) return;
      const val = cell?.value;
      rawHeaders[colNumber - 1] = val ? String(val).trim() : '';
      colCount++;
    });

    // Clean headers (same logic as excel-headers.ts)
    const headers = rawHeaders.map(h => this.cleanExcelHeader(h));
    
    // Read data rows
    const rows: unknown[][] = [];
    let dataRowCount = 0;
    for (let r = headerRowIdx + 2; r <= Math.min(worksheet.rowCount, headerRowIdx + 1 + this.MAX_ROWS); r++) {
      if (dataRowCount >= this.MAX_ROWS) break;
      const row = worksheet.getRow(r);
      if (!this.hasData(row)) continue;
      
      const rowData: unknown[] = [];
      row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        if (colCount >= this.MAX_COLS) return;
        const val = cell?.value;
        rowData[colNumber - 1] = val !== undefined && val !== null ? val : '';
      });
      rows.push(rowData);
      dataRowCount++;
    }

    return { headers, rows, headerRow: headerRowIdx, rawHeaders };
  }

  private static findHeaderRow(worksheet: ExcelJS.Worksheet): number {
    const VFY_KW = ['ferrule', 'cable', 'wire', 'source', 'dest', 'terminal', 's.no', 'sno', 'color', 'size', 'length'];
    const maxCheck = Math.min(20, worksheet.rowCount || 0);
    
    for (let i = 1; i <= maxCheck; i++) {
      const row = worksheet.getRow(i);
      let text = '';
      row.eachCell({ includeEmpty: true }, (cell) => {
        text += ' ' + String(cell?.value ?? '').toLowerCase();
      });
      if (VFY_KW.some(kw => text.includes(kw))) return i - 1;
    }
    
    // Fallback: first row with >= 3 non-empty cells
    for (let i = 1; i <= maxCheck; i++) {
      const row = worksheet.getRow(i);
      let count = 0;
      row.eachCell({ includeEmpty: true }, (cell) => {
        if (String(cell?.value ?? '').trim()) count++;
      });
      if (count >= 3) return i - 1;
    }
    
    return 0;
  }

  private static getRows(worksheet: ExcelJS.Worksheet, maxRows: number): unknown[][] {
    const rows: unknown[][] = [];
    for (let i = 1; i <= Math.min(worksheet.rowCount || 0, maxRows); i++) {
      const row = worksheet.getRow(i);
      const rowData: unknown[] = [];
      row.eachCell({ includeEmpty: true }, (cell) => {
        rowData.push(cell?.value ?? '');
      });
      rows.push(rowData);
    }
    return rows;
  }

  private static hasData(row: ExcelJS.Row): boolean {
    let has = false;
    row.eachCell({ includeEmpty: true }, (cell) => {
      if (this.cellDisplay(cell?.value).trim()) has = true;
    });
    return has;
  }

  /** Flatten ExcelJS cell values (formula/richText/Date) for UI + empty-row checks. */
  private static cellDisplay(val: unknown): string {
    if (val == null || val === '') return '';
    if (typeof val === 'string' || typeof val === 'number' || typeof val === 'boolean') {
      return String(val).trim();
    }
    if (val instanceof Date) return val.toISOString();
    if (typeof val === 'object') {
      const o = val as Record<string, unknown>;
      if (Array.isArray(o.richText)) {
        return (o.richText as { text?: string }[]).map(t => t.text ?? '').join('').trim();
      }
      if ('text' in o) return String(o.text ?? '').trim();
      if ('result' in o) return this.cellDisplay(o.result);
      if ('hyperlink' in o && 'text' in o) return String(o.text ?? '').trim();
    }
    return String(val).trim();
  }

  private static cleanExcelHeader(h: unknown): string {
    let s = String(h ?? '').trim();
    s = s.replace(/^['"]|['"]$/g, '');
    s = s.replace(/[\r\n]+/g, ' ');
    s = s.replace(/\s{2,}/g, ' ');
    return s;
  }
}

function worksheetsHidden(worksheet: ExcelJS.Worksheet): boolean {
  return worksheet.state === 'hidden' || worksheet.state === 'veryHidden';
}

/** Standalone helper functions for backward compatibility with existing imports */

export async function readHeaders(buffer: Uint8Array): Promise<ExcelReadResult> {
  return SafeExcelReader.readHeaders(buffer);
}

export async function readSheetData(
  buffer: Uint8Array,
  sheetName: string,
  headerRowOverride?: number,
): Promise<{
  headers: string[];
  rows: unknown[][];
  headerRow: number;
  rawHeaders: string[];
}> {
  return SafeExcelReader.readSheetData(buffer, sheetName, headerRowOverride);
}

export async function extractMetadata(buffer: Uint8Array): Promise<{
  metadata: Record<string, string>;
  sheetCount: number;
  sheetNames: string[];
}> {
  return SafeExcelReader.extractMetadata(buffer);
}