const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'CHANGE-ME-set-a-real-secret-in-Netlify-env-vars';

function requireAuth(event) {
  const header = event.headers.authorization || event.headers.Authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : header;
  if (!token) {
    const err = new Error('UNAUTHENTICATED');
    err.code = 'UNAUTHENTICATED';
    throw err;
  }
  const payload = jwt.verify(token, JWT_SECRET); // throws if invalid/expired
  return payload.employeeCode;
}

module.exports = { requireAuth, JWT_SECRET };
