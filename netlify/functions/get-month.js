const { connectLambda } = require('@netlify/blobs');
const { dataStore } = require('./utils/store');
const { requireAuth } = require('./utils/auth-helper');

exports.handler = async (event) => {
  connectLambda(event);
  let employeeCode;
  try {
    employeeCode = requireAuth(event);
  } catch {
    return { statusCode: 401, body: JSON.stringify({ error: 'Session expired. Please log in again.' }) };
  }

  const month = (event.queryStringParameters || {}).month;
  if (!month || !/^\d{4}-\d{2}$/.test(month)) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Month must be in YYYY-MM format.' }) };
  }

  try {
    const store = dataStore();
    const key = `${employeeCode}/${month}`;
    const existing = await store.get(key, { type: 'json' });
    return {
      statusCode: 200,
      body: JSON.stringify({
        hasTravelPlan: !!(existing && existing.travelPlanBase64),
        travelPlanFilename: existing ? existing.travelPlanFilename || null : null,
        tripReportText: existing ? existing.tripReportText || '' : '',
        updatedAt: existing ? existing.updatedAt || null : null,
      }),
    };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Server error: ' + err.message }) };
  }
};