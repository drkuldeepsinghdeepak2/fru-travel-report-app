const { connectLambda } = require('@netlify/blobs');
const { dataStore } = require('./utils/store');
const { requireAuth } = require('./utils/auth-helper');

exports.handler = async (event) => {
  connectLambda(event);
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed.' }) };
  }

  let employeeCode;
  try {
    employeeCode = requireAuth(event);
  } catch {
    return { statusCode: 401, body: JSON.stringify({ error: 'Session expired. Please log in again.' }) };
  }

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid request body.' }) };
  }

  const { month, travelPlanBase64, travelPlanFilename, tripReportText } = body;
  if (!month || !/^\d{4}-\d{2}$/.test(month)) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Month must be in YYYY-MM format.' }) };
  }

  try {
    const store = dataStore();
    const key = `${employeeCode}/${month}`;
    const existing = (await store.get(key, { type: 'json' })) || {};

    const updated = {
      ...existing,
      month,
      tripReportText: tripReportText !== undefined ? tripReportText : existing.tripReportText || '',
      updatedAt: new Date().toISOString(),
    };

    if (travelPlanBase64) {
      updated.travelPlanBase64 = travelPlanBase64;
      updated.travelPlanFilename = travelPlanFilename || 'travel-plan.xlsx';
    }

    await store.setJSON(key, updated);
    return { statusCode: 200, body: JSON.stringify({ ok: true }) };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Server error: ' + err.message }) };
  }
};