const API = '/api';

const state = {
  token: localStorage.getItem('fru_token') || null,
  employeeCode: localStorage.getItem('fru_employeeCode') || null,
  name: localStorage.getItem('fru_name') || '',
  travelPlanBase64: null,
  travelPlanFilename: null,
};

const $ = (id) => document.getElementById(id);

function showDashboard() {
  $('login-screen').classList.add('hidden');
  $('dashboard-screen').classList.remove('hidden');
  $('whoami').textContent = `— ${state.name || state.employeeCode}`;
  populateMonthDropdown();
  loadMonthData();
}

function showLogin() {
  $('dashboard-screen').classList.add('hidden');
  $('login-screen').classList.remove('hidden');
}

// ---------- Month helpers ----------
const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];

function monthKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}
function monthLabel(key) {
  const [y, m] = key.split('-').map(Number);
  return `${MONTH_NAMES[m - 1]} ${y}`;
}
function last24Months() {
  const months = [];
  const now = new Date();
  for (let i = 0; i < 24; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push(monthKey(d));
  }
  return months; // most recent first
}

function populateMonthDropdown() {
  const select = $('monthSelect');
  select.innerHTML = '';
  const months = last24Months();
  months.forEach((m) => {
    const opt = document.createElement('option');
    opt.value = m;
    opt.textContent = monthLabel(m);
    select.appendChild(opt);
  });
  select.value = months[0];
  updateHighlightOptions();
}

function updateHighlightOptions() {
  const range = parseInt($('rangeSelect').value, 10);
  const asOf = $('monthSelect').value;
  const [y, m] = asOf.split('-').map(Number);
  const highlightSelect = $('highlightSelect');
  highlightSelect.innerHTML = '<option value="none">No highlight</option>';
  for (let i = range - 1; i >= 0; i--) {
    const d = new Date(y, m - 1 - i, 1);
    const key = monthKey(d);
    const opt = document.createElement('option');
    opt.value = key;
    opt.textContent = monthLabel(key);
    highlightSelect.appendChild(opt);
  }
}

// ---------- Auth ----------
$('loginBtn').addEventListener('click', async () => {
  const loginId = $('loginId').value.trim();
  const password = $('password').value;
  const fullName = $('fullName').value.trim();
  const team = $('team').value.trim();
  const designation = $('designation').value.trim();
  $('loginError').textContent = '';

  if (!loginId || !password) {
    $('loginError').textContent = 'Please enter a Login ID and password.';
    return;
  }

  try {
    const res = await fetch(`${API}/auth`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ loginId, password, name: fullName, team, designation }),
    });
    const data = await res.json();
    if (!res.ok) {
      $('loginError').textContent = data.error || 'Login failed.';
      return;
    }
    state.token = data.token;
    state.employeeCode = data.employeeCode;
    state.name = data.name || fullName;
    localStorage.setItem('fru_token', state.token);
    localStorage.setItem('fru_employeeCode', state.employeeCode);
    localStorage.setItem('fru_name', state.name);
    showDashboard();
  } catch (err) {
    $('loginError').textContent = 'Could not reach the server. Please try again.';
  }
});

$('logoutBtn').addEventListener('click', () => {
  localStorage.clear();
  state.token = null;
  showLogin();
});

function authHeaders() {
  return { Authorization: `Bearer ${state.token}` };
}

// ---------- Month data load/save ----------
async function loadMonthData() {
  const month = $('monthSelect').value;
  $('monthStatus').textContent = 'Loading...';
  $('travelPlanLabel').textContent = 'Drag & drop your Travel Plan .xlsx here, or click to browse';
  $('tripReportText').value = '';
  state.travelPlanBase64 = null;
  state.travelPlanFilename = null;

  try {
    const res = await fetch(`${API}/get-month?month=${month}`, { headers: authHeaders() });
    if (res.status === 401) { showLogin(); return; }
    const data = await res.json();
    if (data.hasTravelPlan) {
      $('travelPlanLabel').textContent = `Saved: ${data.travelPlanFilename}`;
    }
    $('tripReportText').value = data.tripReportText || '';
    $('monthStatus').textContent = data.updatedAt ? `Last saved ${new Date(data.updatedAt).toLocaleString()}` : 'No data saved yet for this month.';
  } catch {
    $('monthStatus').textContent = '';
  }
}

$('monthSelect').addEventListener('change', loadMonthData);

$('saveBtn').addEventListener('click', async () => {
  const month = $('monthSelect').value;
  $('saveStatus').textContent = 'Saving...';
  try {
    const res = await fetch(`${API}/save-month`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({
        month,
        travelPlanBase64: state.travelPlanBase64 || undefined,
        travelPlanFilename: state.travelPlanFilename || undefined,
        tripReportText: $('tripReportText').value,
      }),
    });
    if (res.status === 401) { showLogin(); return; }
    const data = await res.json();
    if (!res.ok) {
      $('saveStatus').textContent = data.error || 'Could not save.';
      return;
    }
    $('saveStatus').textContent = 'Saved ✓';
    state.travelPlanBase64 = null; // already persisted, no need to resend
  } catch {
    $('saveStatus').textContent = 'Could not reach the server.';
  }
});

// ---------- Travel plan drag & drop / file picker ----------
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

const dropTravelPlan = $('dropTravelPlan');
dropTravelPlan.addEventListener('click', () => $('travelPlanInput').click());
$('travelPlanInput').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (file) await handleTravelPlanFile(file);
});
['dragover', 'dragleave', 'drop'].forEach((evt) => {
  dropTravelPlan.addEventListener(evt, (e) => {
    e.preventDefault();
    dropTravelPlan.classList.toggle('dragover', evt === 'dragover');
  });
});
dropTravelPlan.addEventListener('drop', async (e) => {
  const file = e.dataTransfer.files[0];
  if (file) await handleTravelPlanFile(file);
});

async function handleTravelPlanFile(file) {
  if (!file.name.toLowerCase().endsWith('.xlsx')) {
    alert('Please upload an .xlsx file.');
    return;
  }
  state.travelPlanBase64 = await fileToBase64(file);
  state.travelPlanFilename = file.name;
  $('travelPlanLabel').textContent = `Selected: ${file.name} (click "Save" below to store it)`;
}

// ---------- Trip report drag & drop of .txt ----------
const dropTripReport = $('dropTripReport');
['dragover', 'dragleave', 'drop'].forEach((evt) => {
  dropTripReport.addEventListener(evt, (e) => {
    e.preventDefault();
    dropTripReport.classList.toggle('dragover', evt === 'dragover');
  });
});
dropTripReport.addEventListener('drop', async (e) => {
  const file = e.dataTransfer.files[0];
  if (!file) return;
  if (file.name.toLowerCase().endsWith('.txt')) {
    const text = await file.text();
    $('tripReportText').value = ($('tripReportText').value ? $('tripReportText').value + '\n\n' : '') + text;
  } else {
    alert('For now, please drop a plain .txt file, or paste your text directly into the box.');
  }
});

// ---------- Download report ----------
$('rangeSelect').addEventListener('change', updateHighlightOptions);

$('downloadBtn').addEventListener('click', async () => {
  const range = $('rangeSelect').value;
  const asOf = $('monthSelect').value;
  const highlightMonth = $('highlightSelect').value;
  $('downloadStatus').textContent = 'Building your report...';

  try {
    const res = await fetch(`${API}/generate-report?range=${range}&asOf=${asOf}&highlightMonth=${highlightMonth}`, {
      headers: authHeaders(),
    });
    if (res.status === 401) { showLogin(); return; }
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      $('downloadStatus').textContent = data.error || 'Could not generate the report.';
      return;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const disposition = res.headers.get('Content-Disposition') || '';
    const match = disposition.match(/filename="(.+)"/);
    a.download = match ? match[1] : 'Field_Visit_Report.xlsx';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    $('downloadStatus').textContent = 'Downloaded ✓';
  } catch {
    $('downloadStatus').textContent = 'Could not reach the server.';
  }
});

// ---------- Init ----------
if (state.token && state.employeeCode) {
  showDashboard();
} else {
  showLogin();
}
