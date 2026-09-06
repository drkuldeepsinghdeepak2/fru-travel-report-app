const ExcelJS = require('exceljs');

// Column headers we look for (case-insensitive, partial match) in the uploaded Travel Plan.
// This matches the "Monthly Travel Plan" template layout used by the office.
const HEADER_ALIASES = {
  date: ['date'],
  day: ['day'],
  locationFrom: ['location from'],
  locationTo: ['location to'],
  remarks: ['remarks'],
};

function findHeaderRow(worksheet) {
  let best = null;
  worksheet.eachRow((row, rowNumber) => {
    const values = row.values.map((v) => (v == null ? '' : String(v).toLowerCase().trim()));
    const hasDate = values.some((v) => v === 'date');
    const hasLocTo = values.some((v) => v.includes('location to'));
    const hasRemarks = values.some((v) => v.includes('remarks'));
    if (hasDate && hasLocTo && hasRemarks && !best) {
      best = rowNumber;
    }
  });
  return best;
}

function mapColumns(worksheet, headerRowNumber) {
  const headerRow = worksheet.getRow(headerRowNumber);
  const colMap = {};
  headerRow.eachCell((cell, colNumber) => {
    const text = String(cell.value || '').toLowerCase().trim();
    for (const [key, aliases] of Object.entries(HEADER_ALIASES)) {
      if (aliases.some((a) => text.includes(a)) && colMap[key] === undefined) {
        colMap[key] = colNumber;
      }
    }
  });
  return colMap;
}

function excelCellToString(cell) {
  if (cell == null) return '';
  if (cell instanceof Date) return cell;
  if (typeof cell === 'object' && cell.text) return cell.text;
  if (typeof cell === 'object' && cell.result != null) return cell.result;
  return cell;
}

/**
 * Reads the workbook buffer and returns an array of day-rows:
 * { date: Date, day: string, locationFrom: string, locationTo: string, remarks: string }
 * If multiple worksheets look like travel plans, picks the one with the most filled-in Remarks
 * (mirrors "Sheet3 vs Sheet3 (2)" duplicates we've seen, where one copy is stale).
 */
async function parseTravelPlanBuffer(buffer) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);

  let bestRows = [];
  for (const worksheet of workbook.worksheets) {
    const headerRowNumber = findHeaderRow(worksheet);
    if (!headerRowNumber) continue;
    const colMap = mapColumns(worksheet, headerRowNumber);
    if (colMap.date === undefined || colMap.locationTo === undefined) continue;

    const rows = [];
    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber <= headerRowNumber) return;
      const dateVal = excelCellToString(row.getCell(colMap.date).value);
      if (!dateVal) return;
      const date = dateVal instanceof Date ? dateVal : new Date(dateVal);
      if (isNaN(date.getTime())) return;

      rows.push({
        date,
        day: colMap.day ? String(excelCellToString(row.getCell(colMap.day).value) || '') : '',
        locationFrom: colMap.locationFrom ? String(excelCellToString(row.getCell(colMap.locationFrom).value) || '') : '',
        locationTo: colMap.locationTo ? String(excelCellToString(row.getCell(colMap.locationTo).value) || '') : '',
        remarks: colMap.remarks ? String(excelCellToString(row.getCell(colMap.remarks).value) || '') : '',
      });
    });

    const filledRemarks = rows.filter((r) => r.remarks && r.remarks.trim()).length;
    if (filledRemarks >= bestRows.filter((r) => r.remarks && r.remarks.trim()).length) {
      bestRows = rows;
    }
  }

  bestRows.sort((a, b) => a.date - b.date);
  return bestRows;
}

// Words that show up in admin/leave-day free-text notes (which sometimes get typed into the
// "Location To" cell on non-travel days) rather than in a real district name.
const NON_DISTRICT_KEYWORDS = [
  'followup', 'follow-up', 'update', 'regarding', 'preparation', 'meeting', 'training',
  'payment', 'performance', 'mastersheet', 'status', 'coordination', 'license', 'licence',
  'exam', 'sharing', 'joining', 'relieving', 'posting', 'certificate', 'inspection',
  'utilization', 'utilisation', 'office and', 'trainees', 'facilities where', 'blood cell',
  'blood', 'di and', ' di ', 'divison', 'division',
];
const NON_DISTRICT_EXACT = ['el', 'cl', 'holiday', 'barabafat', 'raksabandhan', 'noida', 'delhi station'];

function looksLikeRealDistrict(candidate) {
  const c = candidate.trim();
  if (!c) return false;
  const lower = c.toLowerCase();
  if (NON_DISTRICT_EXACT.includes(lower)) return false;
  if (NON_DISTRICT_KEYWORDS.some((kw) => lower.includes(kw))) return false;
  if (c.length > 28) return false; // real district/tehsil names are short
  if (c.split(/\s+/).length > 4) return false;
  return true;
}

// Extracts a plausible "district" from a Location To value like "Lucknow", "Lucknow-Unnao", "Raibareilly- Lucknow"
function extractDestinations(locationTo) {
  if (!locationTo) return [];
  return locationTo
    .split(/[-,/]/)
    .map((s) => s.trim())
    .filter((s) => s.length > 1 && !/noida/i.test(s))
    .filter(looksLikeRealDistrict);
}

// Pulls out facility-like mentions (FRU X, CHC X, DWH, DCH, BHU, GIMS, Medical College, CMO Office, etc.)
function extractFacilities(remarks) {
  if (!remarks) return [];
  const found = new Set();
  const patterns = [
    /\bFRU\s+[A-Z][a-zA-Z]*(?:\s+[A-Z][a-zA-Z]*)?/g,
    /\bCHC\s+[A-Z][a-zA-Z]*(?:\s+[A-Z][a-zA-Z]*)?/g,
    /\bDWH\b/gi,
    /\bDCH\b/gi,
    /\bBHU\b/gi,
    /\bGIMS\b/gi,
    /\bMedical College\b/gi,
    /\bCMO\s*Office\b/gi,
  ];
  for (const p of patterns) {
    const matches = remarks.match(p) || [];
    matches.forEach((m) => found.add(m.trim()));
  }
  return Array.from(found);
}

/**
 * Groups day-rows into trips. A new trip starts whenever the gap between two
 * consecutive travel days (rows with a non-empty Location To) exceeds 2 calendar
 * days (i.e. allows a normal weekend but not a longer gap / admin week).
 */
function groupIntoTrips(rows) {
  const travelRows = rows.filter((r) => r.locationTo && extractDestinations(r.locationTo).length > 0);
  const trips = [];
  let current = null;

  for (const row of travelRows) {
    if (!current) {
      current = { rows: [row], start: row.date, end: row.date };
    } else {
      const gapDays = Math.round((row.date - current.end) / (1000 * 60 * 60 * 24));
      if (gapDays <= 3) {
        current.rows.push(row);
        current.end = row.date;
      } else {
        trips.push(current);
        current = { rows: [row], start: row.date, end: row.date };
      }
    }
  }
  if (current) trips.push(current);
  return trips;
}

module.exports = { parseTravelPlanBuffer, groupIntoTrips, extractDestinations, extractFacilities };
