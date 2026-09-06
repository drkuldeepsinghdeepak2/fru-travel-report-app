const { connectLambda } = require('@netlify/blobs');
const { dataStore, usersStore } = require('./utils/store');
const { requireAuth } = require('./utils/auth-helper');
const { aggregate } = require('./utils/aggregate');
const { buildReportExcel } = require('./utils/buildReportExcel');

const RANGE_LABELS = { 1: 'last 1 month', 3: 'last 3 months', 6: 'last 6 months', 12: 'last 1 year' };

function monthsBack(count, asOfMonth) {
  const [y, m] = asOfMonth.split('-').map(Number);
  const result = [];
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(y, m - 1 - i, 1);
    result.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  return result;
}

exports.handler = async (event) => {
  connectLambda(event);
  let employeeCode;
  try {
    employeeCode = requireAuth(event);
  } catch {
    return { statusCode: 401, body: JSON.stringify({ error: 'Session expired. Please log in again.' }) };
  }

  const params = event.queryStringParameters || {};
  const rangeMonths = parseInt(params.range, 10);
  const asOfMonth = params.asOf || new Date().toISOString().slice(0, 7);
  const highlightMonth = params.highlightMonth && params.highlightMonth !== 'none' ? params.highlightMonth : null;

  if (![1, 3, 6, 12].includes(rangeMonths)) {
    return { statusCode: 400, body: JSON.stringify({ error: 'range must be 1, 3, 6, or 12.' }) };
  }

  try {
    const uStore = usersStore();
    const dStore = dataStore();
    const profile = (await uStore.get(employeeCode, { type: 'json' })) || {};

    const months = monthsBack(rangeMonths, asOfMonth);
    const monthsData = [];
    for (const month of months) {
      const key = `${employeeCode}/${month}`;
      const record = await dStore.get(key, { type: 'json' });
      let travelPlanBuffer = null;
      if (record && record.travelPlanBase64) {
        travelPlanBuffer = Buffer.from(record.travelPlanBase64, 'base64');
      }
      monthsData.push({
        month,
        travelPlanBuffer,
        tripReportText: record ? record.tripReportText || '' : '',
      });
    }

    const districts = await aggregate(monthsData);

    if (districts.size === 0) {
      return {
        statusCode: 404,
        body: JSON.stringify({ error: 'No travel plan data found for the selected period yet.' }),
      };
    }

    const buffer = await buildReportExcel(districts, {
      periodLabel: RANGE_LABELS[rangeMonths],
      employee: { name: profile.name, team: profile.team, designation: profile.designation },
      highlightMonth,
    });

    const filename = `Field_Visit_${RANGE_LABELS[rangeMonths].replace(/\s+/g, '_')}_${employeeCode}.xlsx`;

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
      body: buffer.toString('base64'),
      isBase64Encoded: true,
    };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Server error: ' + err.message }) };
  }
};