const ExcelJS = require('exceljs');
const { monthLabel } = require('./aggregate');

const TITLE_COLOR = 'FF8B0000'; // dark maroon, matches the office template
const HIGHLIGHT_COLOR = 'FFFFC000'; // amber, used for the highlighted month's text

/**
 * districts: Map from aggregate() -> {visits, facilities:Set, notesByMonth: Map(month -> [snippets])}
 * options: { periodLabel, employee: {name, team, designation}, highlightMonth: 'YYYY-MM'|null }
 */
async function buildReportExcel(districts, options) {
  const { periodLabel, employee, highlightMonth } = options;
  const workbook = new ExcelJS.Workbook();
  const ws = workbook.addWorksheet('Sheet1');

  ws.columns = [
    { width: 6.3 },
    { width: 19.5 },
    { width: 13.1 },
    { width: 18 },
    { width: 15.1 },
    { width: 19.5 },
    { width: 29 },
    { width: 25.7 },
    { width: 95 },
  ];

  // Title row
  ws.mergeCells('A1:I1');
  const titleCell = ws.getCell('A1');
  titleCell.value = `Field Visit_${periodLabel}-FRU Activation Team`;
  titleCell.font = { bold: true, size: 16, color: { argb: TITLE_COLOR } };
  titleCell.alignment = { horizontal: 'center', vertical: 'center' };
  ws.getRow(1).height = 21;

  // "Place of Visit" merged sub-header
  ws.mergeCells('E2:I2');
  const placeCell = ws.getCell('E2');
  placeCell.value = 'Place of Visit';
  placeCell.font = { bold: true, size: 12, color: { argb: TITLE_COLOR } };
  placeCell.alignment = { horizontal: 'center', vertical: 'center' };
  ws.getRow(2).height = 24;

  // Column headers
  const headers = [
    'SL No.',
    'Name of the person',
    'Team',
    'Designation ',
    `Total no of Visit in ${periodLabel}`,
    'District name',
    'Facility Name/Block  Name',
    'Level of care(DH/CHC/CHC-FRU/PHC/SC- AAM/VHND Site)',
    'Key Discussion/Actionable points',
  ];
  const headerRow = ws.getRow(3);
  headers.forEach((h, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.value = h;
    cell.font = { bold: true };
    cell.alignment = { wrapText: true, vertical: 'center', horizontal: 'left' };
  });
  headerRow.height = 45;

  // Sort districts alphabetically
  const sortedDistricts = Array.from(districts.keys()).sort((a, b) => a.localeCompare(b));

  let rowIndex = 4;
  for (let i = 0; i < sortedDistricts.length; i++) {
    const name = sortedDistricts[i];
    const rec = districts.get(name);
    const row = ws.getRow(rowIndex);

    row.getCell(1).value = i + 1;
    row.getCell(2).value = employee.name || '';
    row.getCell(3).value = employee.team || '';
    row.getCell(4).value = employee.designation || '';
    row.getCell(5).value = rec.visits;
    row.getCell(6).value = name;
    row.getCell(7).value = Array.from(rec.facilities).join('\n');
    row.getCell(8).value = 'CHC FRU'; // best-effort default; review/edit as needed

    // Build the Key Discussion rich text, optionally highlighting one month's notes
    const richTextRuns = [];
    const months = Array.from(rec.notesByMonth.keys()).sort();
    months.forEach((m, idx) => {
      const label = `${monthLabel(m)}: `;
      const text = rec.notesByMonth.get(m).join(' ') + (idx < months.length - 1 ? '\n\n' : '');
      const isHighlighted = highlightMonth && m === highlightMonth;
      richTextRuns.push({ text: label, font: { bold: true, color: isHighlighted ? { argb: HIGHLIGHT_COLOR } : undefined } });
      richTextRuns.push({ text, font: isHighlighted ? { bold: true, color: { argb: HIGHLIGHT_COLOR } } : undefined });
    });
    if (richTextRuns.length) {
      row.getCell(9).value = { richText: richTextRuns };
    } else {
      row.getCell(9).value = '';
    }

    for (let c = 1; c <= 9; c++) {
      row.getCell(c).alignment = { wrapText: true, vertical: 'top', horizontal: 'left' };
    }

    // Rough auto height based on longest content in the row
    const longest = Math.max(
      String(row.getCell(7).value || '').length / 29,
      String(row.getCell(8).value || '').length / 25,
      months.reduce((acc, m) => acc + (rec.notesByMonth.get(m).join(' ').length || 0), 0) / 95
    );
    row.height = Math.max(30, Math.min(500, Math.ceil(longest + 1) * 14.5 + 6));

    rowIndex++;
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return buffer;
}

module.exports = { buildReportExcel };
