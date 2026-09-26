import ExcelJS from 'exceljs';

// ============================================
// TIPOS
// ============================================
export type ExcelCellType =
  | 'text'
  | 'number'
  | 'currency'
  | 'date'
  | 'datetime'
  | 'boolean'
  | 'status'
  | 'percent';

export interface ExcelColumn {
  header: string;
  key: string;
  width?: number;
  type?: ExcelCellType;
  /** Código de moneda para formatear cuando type = 'currency' */
  currencyCode?: string;
  /** Alineación por defecto del tipo; puedes sobrescribir */
  align?: 'left' | 'center' | 'right';
}

export type StatusTone = 'success' | 'warning' | 'error' | 'info' | 'default';

export interface ExcelSheet {
  name: string;
  columns: ExcelColumn[];
  rows: Record<string, unknown>[];
  /** Mapa de estado → tono, para colorear celdas con type='status' */
  statusMap?: Record<string, StatusTone>;
  /** Fila de totales al final (opcional) */
  totals?: Record<string, string | number>;
}

// ============================================
// COLORES DEL TEMA
// ============================================
const THEME = {
  headerBg: 'FF1E40AF', // azul oscuro
  headerFg: 'FFFFFFFF',
  borderColor: 'FFD1D5DB',
  rowAltBg: 'FFF9FAFB',
  totalsBg: 'FFF3F4F6',
  success: { bg: 'FFD1FAE5', fg: 'FF065F46' },
  warning: { bg: 'FFFEF3C7', fg: 'FF92400E' },
  error: { bg: 'FFFEE2E2', fg: 'FF991B1B' },
  info: { bg: 'FFDBEAFE', fg: 'FF1E40AF' },
  default: { bg: 'FFF3F4F6', fg: 'FF374151' },
} as const;

// ============================================
// HELPERS INTERNOS
// ============================================
function toNumber(value: unknown): number {
  if (value === null || value === undefined || value === '') return 0;
  const n = Number(value);
  return isNaN(n) ? 0 : n;
}

function toDate(value: unknown): Date | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(String(value));
  return isNaN(d.getTime()) ? null : d;
}

function getStatusTone(
  value: unknown,
  map?: Record<string, StatusTone>
): StatusTone {
  if (!value || !map) return 'default';
  const key = String(value);
  return map[key] ?? 'default';
}

// ============================================
// CREAR WORKBOOK CON UNA HOJA
// ============================================
export function buildExcelWorkbook(sheet: ExcelSheet): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();
  wb.creator = process.env.NEXT_PUBLIC_APP_NAME ?? 'POS';
  wb.created = new Date();

  const ws = wb.addWorksheet(sheet.name, {
    views: [{ state: 'frozen', ySplit: 1 }],
  });

  // --------------------------------------------
  // 1) Definir columnas (encabezado)
  // --------------------------------------------
  ws.columns = sheet.columns.map((col) => ({
    header: col.header,
    key: col.key,
    width: col.width ?? 18,
  }));

  // --------------------------------------------
  // 2) Estilo del encabezado
  // --------------------------------------------
  const headerRow = ws.getRow(1);
  headerRow.height = 26;
  headerRow.eachCell((cell) => {
    cell.font = {
      bold: true,
      color: { argb: THEME.headerFg },
      size: 11,
    };
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: THEME.headerBg },
    };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
    cell.border = {
      top: { style: 'thin', color: { argb: THEME.borderColor } },
      bottom: { style: 'thin', color: { argb: THEME.borderColor } },
      left: { style: 'thin', color: { argb: THEME.borderColor } },
      right: { style: 'thin', color: { argb: THEME.borderColor } },
    };
  });

  // --------------------------------------------
  // 3) Añadir filas de datos
  // --------------------------------------------
  const dataStartRow = 2;

  sheet.rows.forEach((row, index) => {
    const rowIndex = dataStartRow + index;
    const excelRow = ws.addRow(row);
    excelRow.height = 20;

    sheet.columns.forEach((col, colIndex) => {
      const cell = excelRow.getCell(colIndex + 1);
      const rawValue = row[col.key];
      const type = col.type ?? 'text';

      // -- formateo por tipo --
      switch (type) {
        case 'number': {
          cell.value = toNumber(rawValue);
          cell.numFmt = '#,##0.00';
          cell.alignment = { horizontal: col.align ?? 'right', vertical: 'middle' };
          break;
        }
        case 'currency': {
          cell.value = toNumber(rawValue);
          const code = col.currencyCode ?? '';
          cell.numFmt = code
            ? `"${code}" #,##0.00`
            : '"$" #,##0.00';
          cell.alignment = { horizontal: col.align ?? 'right', vertical: 'middle' };
          break;
        }
        case 'percent': {
          cell.value = toNumber(rawValue) / 100;
          cell.numFmt = '0.00%';
          cell.alignment = { horizontal: col.align ?? 'right', vertical: 'middle' };
          break;
        }
        case 'date': {
          const d = toDate(rawValue);
          cell.value = d ?? '';
          cell.numFmt = 'dd/mm/yyyy';
          cell.alignment = { horizontal: col.align ?? 'center', vertical: 'middle' };
          break;
        }
        case 'datetime': {
          const d = toDate(rawValue);
          cell.value = d ?? '';
          cell.numFmt = 'dd/mm/yyyy hh:mm';
          cell.alignment = { horizontal: col.align ?? 'center', vertical: 'middle' };
          break;
        }
        case 'boolean': {
          cell.value = rawValue ? 'Sí' : 'No';
          cell.alignment = { horizontal: 'center', vertical: 'middle' };
          break;
        }
        case 'status': {
          const tone = getStatusTone(rawValue, sheet.statusMap);
          const theme = THEME[tone];
          cell.value = rawValue ? String(rawValue) : '';
          cell.font = { bold: true, color: { argb: theme.fg } };
          cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: theme.bg },
          };
          cell.alignment = { horizontal: 'center', vertical: 'middle' };
          break;
        }
        case 'text':
        default: {
          cell.value = rawValue === null || rawValue === undefined ? '' : String(rawValue);
          cell.alignment = { horizontal: col.align ?? 'left', vertical: 'middle' };
        }
      }

      // -- borde --
      cell.border = {
        top: { style: 'thin', color: { argb: THEME.borderColor } },
        bottom: { style: 'thin', color: { argb: THEME.borderColor } },
        left: { style: 'thin', color: { argb: THEME.borderColor } },
        right: { style: 'thin', color: { argb: THEME.borderColor } },
      };
    });
  });

  // --------------------------------------------
  // 4) Filas alternas (zebra)
  // --------------------------------------------
  for (let i = 0; i < sheet.rows.length; i++) {
    if (i % 2 === 1) {
      const row = ws.getRow(dataStartRow + i);
      row.eachCell((cell) => {
        // Solo aplicamos si la celda no tiene fill propio (status)
        if (!cell.fill || (cell.fill as ExcelJS.Fill).type !== 'pattern') {
          cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: THEME.rowAltBg },
          };
        }
      });
    }
  }

  // --------------------------------------------
  // 5) Fila de totales (opcional)
  // --------------------------------------------
  if (sheet.totals) {
    const totalsRow = ws.addRow(sheet.totals);
    totalsRow.height = 22;

    sheet.columns.forEach((col, colIndex) => {
      const cell = totalsRow.getCell(colIndex + 1);
      const type = col.type ?? 'text';
      const value = sheet.totals![col.key];

      if (value !== undefined) {
        if (type === 'currency') {
          cell.value = toNumber(value);
          const code = col.currencyCode ?? '';
          cell.numFmt = code ? `"${code}" #,##0.00` : '"$" #,##0.00';
        } else if (type === 'number') {
          cell.value = toNumber(value);
          cell.numFmt = '#,##0.00';
        } else {
          cell.value = String(value);
        }
      }

      cell.font = { bold: true };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: THEME.totalsBg },
      };
      cell.border = {
        top: { style: 'double', color: { argb: THEME.borderColor } },
        bottom: { style: 'thin', color: { argb: THEME.borderColor } },
        left: { style: 'thin', color: { argb: THEME.borderColor } },
        right: { style: 'thin', color: { argb: THEME.borderColor } },
      };
      cell.alignment = {
        horizontal: type === 'text' ? 'left' : 'right',
        vertical: 'middle',
      };
    });
  }

  // --------------------------------------------
  // 6) Autofiltro
  // --------------------------------------------
  ws.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: sheet.columns.length },
  };

  return wb;
}

// ============================================
// CONVERTIR A BUFFER (para descarga en cliente)
// ============================================
export async function workbookToBuffer(
  wb: ExcelJS.Workbook
): Promise<Uint8Array> {
  const buf = await wb.xlsx.writeBuffer();
  return new Uint8Array(buf);
}