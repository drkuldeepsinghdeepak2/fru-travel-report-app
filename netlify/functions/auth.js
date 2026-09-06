const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { connectLambda } = require('@netlify/blobs');
const { usersStore } = require('./utils/store');
const { JWT_SECRET } = require('./utils/auth-helper');

exports.handler = async (event) => {
  connectLambda(event);
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed.' }) };
  }

  let loginId, password, name, team, designation;
  try {
    ({ loginId, password, name, team, designation } = JSON.parse(event.body || '{}'));
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid request body.' }) };
  }

  if (!loginId || !password) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Login ID and password are both required.' }) };
  }
  // Login ID can be anything the person picks (e.g. their first name) — not a fixed list.
  // Store it case-insensitively so "Kuldeep" and "kuldeep" are treated as the same account.
  const code = String(loginId).trim().toLowerCase();
  if (password.length < 4) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Password must be at least 4 characters.' }) };
  }

  try {
    const store = usersStore();
    const existing = await store.get(code, { type: 'json' });

    if (!existing) {
      const passwordHash = await bcrypt.hash(password, 10);
      await store.setJSON(code, {
        employeeCode: code,
        name: name || '',
        team: team || '',
        designation: designation || '',
        passwordHash,
        createdAt: new Date().toISOString(),
      });
      const token = jwt.sign({ employeeCode: code }, JWT_SECRET, { expiresIn: '30d' });
      return {
        statusCode: 200,
        body: JSON.stringify({ token, isNewAccount: true, employeeCode: code, name: name || '', team: team || '', designation: designation || '' }),
      };
    }

    const match = await bcrypt.compare(password, existing.passwordHash);
    if (!match) {
      return { statusCode: 401, body: JSON.stringify({ error: 'Incorrect password for this Login ID.' }) };
    }
    const token = jwt.sign({ employeeCode: code }, JWT_SECRET, { expiresIn: '30d' });
    return {
      statusCode: 200,
      body: JSON.stringify({
        token,
        isNewAccount: false,
        employeeCode: code,
        name: existing.name || '',
        team: existing.team || '',
        designation: existing.designation || '',
      }),
    };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Server error: ' + err.message }) };
  }
};