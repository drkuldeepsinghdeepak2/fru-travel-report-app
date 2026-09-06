const { getStore } = require('@netlify/blobs');

// One store for user accounts (employeeCode -> password hash etc.)
function usersStore() {
  return getStore('users');
}

// One store for monthly data (travel plan file + trip report text) per employee
function dataStore() {
  return getStore('travel-data');
}

module.exports = { usersStore, dataStore };
