/**
 * PAF-IAST SCIENCE FESTA 2026 - STANDALONE ADMIN GATE PORTAL
 * Credentials: ID: pafss26 | Pass: seminar
 * Features: Neon DB Integration, Real-Time QR Gate Scanning, Instant Cache Validation, Scanned History Log
 */

// Application State
let adminAuthenticated = false;
let localAttendeeCache = [];
let localScanHistory = [];
let html5Scanner = null;
let isScannerRunning = false;
let currentFilter = 'all';

// Synthesized Audio Feedback
let audioCtx = null;
function getAudioContext() {
  if (!audioCtx) {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (AudioContext) audioCtx = new AudioContext();
  }
  return audioCtx;
}

function playSound(type) {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    if (ctx.state === 'suspended') ctx.resume();

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    const now = ctx.currentTime;

    if (type === 'success') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, now); // D5
      osc.frequency.setValueAtTime(880, now + 0.1); // A5
      gain.gain.setValueAtTime(0.18, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
      osc.start(now);
      osc.stop(now + 0.35);
    } else if (type === 'warning') {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(440, now);
      osc.frequency.setValueAtTime(349.23, now + 0.12);
      gain.gain.setValueAtTime(0.25, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
      osc.start(now);
      osc.stop(now + 0.35);
    } else if (type === 'error') {
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(180, now);
      gain.gain.setValueAtTime(0.2, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
      osc.start(now);
      osc.stop(now + 0.3);
    }
  } catch (e) {
    // Ignore audio restriction
  }
}

// ===================================================================
// INITIALIZATION
// ===================================================================
document.addEventListener('DOMContentLoaded', () => {
  startClock();

  // Check saved session
  if (sessionStorage.getItem('pafss_admin_token') === 'authorized') {
    adminAuthenticated = true;
    showDashboard();
  } else {
    showLogin();
  }
});

function startClock() {
  const clock = document.getElementById('admin-clock');
  if (!clock) return;
  setInterval(() => {
    clock.innerText = new Date().toLocaleTimeString();
  }, 1000);
}

// Switch Views
function showLogin() {
  document.getElementById('admin-login-screen').style.display = 'flex';
  document.getElementById('admin-dashboard-screen').style.display = 'none';
  document.getElementById('btn-admin-signout').style.display = 'none';
  setTimeout(() => {
    const idInput = document.getElementById('admin-id-input');
    if (idInput) idInput.focus();
  }, 100);
}

function showDashboard() {
  document.getElementById('admin-login-screen').style.display = 'none';
  document.getElementById('admin-dashboard-screen').style.display = 'block';
  document.getElementById('btn-admin-signout').style.display = 'inline-flex';

  fetchDashboardData();
  loadScanHistory();
}

// Handle Login (Credentials: ID: pafss26, Pass: seminar)
async function handleLoginSubmit(e) {
  e.preventDefault();
  const idInput = document.getElementById('admin-id-input').value.trim();
  const passInput = document.getElementById('admin-pass-input').value.trim();

  try {
    const res = await fetch('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: idInput, password: passInput })
    });

    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.message || 'Invalid credentials');
    }

    sessionStorage.setItem('pafss_admin_token', 'authorized');
    adminAuthenticated = true;
    playSound('success');
    showDashboard();

  } catch (err) {
    playSound('error');
    alert(err.message || 'Login failed. Please verify ID and Password.');
  }
}

function adminSignOut() {
  sessionStorage.removeItem('pafss_admin_token');
  adminAuthenticated = false;
  if (html5Scanner && isScannerRunning) {
    stopCameraScanner();
  }
  showLogin();
}

// ===================================================================
// DATA FETCHING & DIRECTORY
// ===================================================================
async function fetchDashboardData() {
  try {
    const [statsRes, attendeesRes] = await Promise.all([
      fetch('/api/stats'),
      fetch('/api/attendees')
    ]);

    if (statsRes.ok) {
      const stats = await statsRes.json();
      updateStatsUI(stats);
    }

    if (attendeesRes.ok) {
      localAttendeeCache = await attendeesRes.json();
      renderDirectoryTable(localAttendeeCache);
    }
  } catch (err) {
    console.warn("Could not fetch latest data:", err);
  }
}

function updateStatsUI(stats) {
  const s1 = document.getElementById('dash-sem1-count');
  const s2 = document.getElementById('dash-sem2-count');
  const sChecked = document.getElementById('dash-checked-count');
  const sTotal = document.getElementById('dash-total-count');

  if (s1) s1.innerText = stats.seminar1 ? stats.seminar1.registered : 0;
  if (s2) s2.innerText = stats.seminar2 ? stats.seminar2.registered : 0;
  if (sChecked) sChecked.innerText = stats.checkedInCount || 0;
  if (sTotal) sTotal.innerText = stats.totalAttendees || 0;
}

function setFilter(filter, btn) {
  currentFilter = filter;
  document.querySelectorAll('.admin-filter-pill').forEach(p => p.classList.remove('active'));
  if (btn) btn.classList.add('active');
  handleDirectorySearch();
}

function handleDirectorySearch() {
  const query = document.getElementById('dir-search-input').value.trim().toLowerCase();

  const filtered = localAttendeeCache.filter(a => {
    if (currentFilter === 'seminar1' && a.seminar !== 'seminar1') return false;
    if (currentFilter === 'seminar2' && a.seminar !== 'seminar2') return false;
    if (currentFilter === 'checked' && !a.checkedIn) return false;

    if (query) {
      const matchName = (a.name || '').toLowerCase().includes(query);
      const matchId = (a.id || '').toLowerCase().includes(query);
      const matchUnivId = (a.universityId || a.university_id || '').toLowerCase().includes(query);
      const matchPhone = (a.phone || '').toLowerCase().includes(query);
      const matchEmail = (a.email || '').toLowerCase().includes(query);
      return matchName || matchId || matchUnivId || matchPhone || matchEmail;
    }
    return true;
  });

  renderDirectoryTable(filtered);
}

function renderDirectoryTable(attendees) {
  const tbody = document.getElementById('directory-tbody');
  if (!tbody) return;

  if (!attendees || attendees.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: var(--text-muted); padding: 24px;">No attendees registered yet.</td></tr>`;
    return;
  }

  tbody.innerHTML = attendees.map(a => {
    const semName = a.seminar === 'seminar1'
      ? '<span style="color:#0284C7; font-weight:700;">AMR (Nov 4)</span>'
      : '<span style="color:#F97316; font-weight:700;">AI Health (Nov 5)</span>';

    const gateBadge = a.checkedIn
      ? `<span class="h-badge-tag tag-first">Admitted (${new Date(a.checkedInAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})})</span>`
      : `<span class="h-badge-tag" style="background:#F1F5F9; color:#64748B;">Not Checked In</span>`;

    const univid = a.universityId || a.university_id || 'N/A';

    return `
      <tr>
        <td><code>${a.id}</code></td>
        <td><strong>${a.name}</strong></td>
        <td>${univid}</td>
        <td>${a.phone}</td>
        <td>${a.email}</td>
        <td>${semName}</td>
        <td>${gateBadge}</td>
      </tr>
    `;
  }).join('');
}

// Export CSV
function exportDirectoryCSV() {
  if (!localAttendeeCache || localAttendeeCache.length === 0) {
    alert("No attendees to export.");
    return;
  }

  const headers = ["Ticket ID", "Name", "University ID", "Phone", "Personal Gmail", "Event", "Checked In", "Checked In Time"];
  const rows = localAttendeeCache.map(a => [
    `"${a.id}"`,
    `"${a.name.replace(/"/g, '""')}"`,
    `"${a.universityId || a.university_id || ''}"`,
    `"${a.phone}"`,
    `"${a.email}"`,
    `"${a.seminar === 'seminar1' ? 'Antimicrobial Resistance (Dr. Hamad Ali)' : 'AI in Healthcare (Dr. Shah Faisal)'}"`,
    a.checkedIn ? "YES" : "NO",
    `"${a.checkedInAt || ''}"`
  ]);

  const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", `PAFSS_Attendees_${new Date().toISOString().slice(0, 10)}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// ===================================================================
// QR CODE SCANNER (WITH OFFLINE / INSTANT LOCAL CACHE VALIDATION)
// ===================================================================
function toggleCameraScanner() {
  if (isScannerRunning) {
    stopCameraScanner();
  } else {
    startCameraScanner();
  }
}

function startCameraScanner() {
  if (!window.Html5Qrcode) {
    alert("Camera QR Engine not loaded. Please use manual entry.");
    return;
  }

  const toggleBtn = document.getElementById('btn-camera-toggle');
  html5Scanner = new Html5Qrcode("admin-qr-reader");

  const config = {
    fps: 10,
    qrbox: { width: 220, height: 220 }
  };

  html5Scanner.start(
    { facingMode: "environment" },
    config,
    (decodedText) => {
      processTicketScan(decodedText);
    },
    (errorMessage) => {
      // scanning actively
    }
  ).then(() => {
    isScannerRunning = true;
    if (toggleBtn) {
      toggleBtn.innerText = "Stop Camera Scan";
      toggleBtn.className = "glass-btn glass-btn-subtle";
    }
  }).catch((err) => {
    console.error("Camera access error:", err);
    alert("Camera permission denied or camera unavailable. Please use the manual ticket ID box.");
  });
}

function stopCameraScanner() {
  if (html5Scanner && isScannerRunning) {
    html5Scanner.stop().then(() => {
      isScannerRunning = false;
      const toggleBtn = document.getElementById('btn-camera-toggle');
      if (toggleBtn) {
        toggleBtn.innerText = "Start Camera Scan";
        toggleBtn.className = "glass-btn glass-btn-sky";
      }
    }).catch(e => console.warn(e));
  }
}

function processManualEntry() {
  const input = document.getElementById('manual-ticket-id');
  if (!input) return;
  const val = input.value.trim();
  if (!val) {
    input.focus();
    return;
  }
  processTicketScan(val);
  input.value = '';
}

async function handleFileQrScan(e) {
  const file = e.target.files && e.target.files[0];
  if (!file) return;

  try {
    if (!html5Scanner) {
      html5Scanner = new Html5Qrcode("admin-qr-reader");
    }
    const decodedText = await html5Scanner.scanFile(file, true);
    processTicketScan(decodedText);
  } catch (err) {
    console.warn("File scan error:", err);
    alert("Could not detect a clear QR code in this image. Please ensure the QR code is centered and legible.");
  } finally {
    e.target.value = '';
  }
}

let lastScannedText = '';
let lastScannedTimestamp = 0;

// Main QR Scan Processor (Fast Local Validation + Sync to Neon DB)
async function processTicketScan(ticketCode) {
  const now = Date.now();
  if (ticketCode === lastScannedText && now - lastScannedTimestamp < 2500) {
    return; // throttle duplicate trigger
  }
  lastScannedText = ticketCode;
  lastScannedTimestamp = now;

  const clean = ticketCode.trim().toUpperCase();

  // 1. Instant check in local cache (Works even without internet!)
  const localMatch = localAttendeeCache.find(a => 
    (a.id && a.id.toUpperCase() === clean) ||
    (a.ticketHash && a.ticketHash.toUpperCase() === clean) ||
    (a.universityId && a.universityId.toUpperCase() === clean) ||
    (a.university_id && a.university_id.toUpperCase() === clean)
  );

  if (localMatch) {
    if (localMatch.checkedIn) {
      // ALREADY SCANNED ONCE (Duplicate alert)
      playSound('warning');
      const timeStr = localMatch.checkedInAt ? new Date(localMatch.checkedInAt).toLocaleTimeString() : 'Earlier';
      renderPreviewResult({
        status: 'ALREADY_SCANNED',
        attendee: localMatch,
        checkedInAt: localMatch.checkedInAt
      });
      syncScanToServer(clean);
      return;
    } else {
      // FIRST TIME SCAN -> Instant local admission
      playSound('success');
      const scanTime = new Date().toISOString();
      localMatch.checkedIn = true;
      localMatch.checkedInAt = scanTime;
      renderPreviewResult({
        status: 'FIRST_CHECKIN',
        attendee: localMatch,
        message: `PASS VERIFIED: ${localMatch.name} admitted successfully!`
      });
      syncScanToServer(clean);
      return;
    }
  }

  // 2. If not found in local cache, send directly to server
  try {
    const res = await fetch('/api/scan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ticketId: clean })
    });

    const result = await res.json();
    renderPreviewResult(result);
    fetchDashboardData();
    loadScanHistory();

  } catch (err) {
    playSound('error');
    renderPreviewResult({
      status: 'INVALID',
      message: `Invalid or unrecognized QR code: "${clean}"`
    });
  }
}

// Background sync to server
async function syncScanToServer(ticketId) {
  try {
    await fetch('/api/scan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ticketId })
    });
    fetchDashboardData();
    loadScanHistory();
  } catch (e) {
    console.warn("Could not sync scan to server:", e);
  }
}

// Render Preview Result in Admin Scanner
function renderPreviewResult(result) {
  const previewCard = document.getElementById('scan-result-card');
  const placeholder = document.getElementById('scan-result-placeholder');
  const banner = document.getElementById('scan-result-banner');
  const details = document.getElementById('scan-result-details');

  if (!previewCard || !banner || !details) return;

  placeholder.style.display = 'none';
  previewCard.style.display = 'block';
  previewCard.className = 'scan-result-card';

  if (result.status === 'FIRST_CHECKIN') {
    previewCard.classList.add('scan-first-time');
    banner.innerHTML = `
      <span style="font-size: 1.3rem;">✅</span>
      <span>${result.message || 'PASS VERIFIED &amp; ADMITTED'}</span>
    `;

    const a = result.attendee;
    const univid = a.universityId || a.university_id || 'N/A';
    details.innerHTML = `
      <div><strong>Attendee Name:</strong> ${a.name}</div>
      <div><strong>University ID:</strong> ${univid}</div>
      <div><strong>Seminar:</strong> ${a.speaker} • B2 MPH</div>
      <div><strong>Ticket ID:</strong> <code>${a.id}</code></div>
      <div><strong>Verified Time:</strong> ${new Date(a.checkedInAt || Date.now()).toLocaleTimeString()}</div>
    `;

  } else if (result.status === 'ALREADY_SCANNED') {
    previewCard.classList.add('scan-already-checked');
    const checkedTime = result.checkedInAt ? new Date(result.checkedInAt).toLocaleTimeString() : 'Earlier';

    banner.innerHTML = `
      <span style="font-size: 1.3rem;">⚠️</span>
      <span>ALREADY SCANNED ONCE! (Admitted at ${checkedTime})</span>
    `;

    const a = result.attendee;
    const univid = a.universityId || a.university_id || 'N/A';
    details.innerHTML = `
      <div style="color: #B45309; font-weight: 800;">⚠️ DUPLICATE ENTRY ATTEMPT</div>
      <div><strong>Attendee Name:</strong> ${a.name}</div>
      <div><strong>University ID:</strong> ${univid}</div>
      <div><strong>Seminar:</strong> ${a.speaker} • B2 MPH</div>
      <div><strong>Ticket ID:</strong> <code>${a.id}</code></div>
      <div><strong>Initial Check-In:</strong> ${checkedTime}</div>
    `;

  } else {
    previewCard.classList.add('scan-invalid');
    banner.innerHTML = `
      <span style="font-size: 1.3rem;">❌</span>
      <span>INVALID QR CODE / TICKET NOT FOUND</span>
    `;
    details.innerHTML = `
      <div style="color: #B91C1C;">${result.message || 'The scanned QR code is not recognized in the database.'}</div>
    `;
  }
}

// Load and Render Scan History Log
async function loadScanHistory() {
  try {
    const res = await fetch('/api/scan-history');
    if (!res.ok) return;
    localScanHistory = await res.json();
    renderScanHistory(localScanHistory);
  } catch (e) {
    console.warn("Could not load scan history:", e);
  }
}

function renderScanHistory(history) {
  const container = document.getElementById('admin-scan-history-list');
  if (!container) return;

  if (!history || history.length === 0) {
    container.innerHTML = '<div style="color: var(--text-muted); font-size: 0.78rem; text-align: center; padding: 12px;">No scan history yet.</div>';
    return;
  }

  container.innerHTML = history.map(item => {
    let tagClass = 'tag-first';
    let tagText = 'FIRST CHECK-IN';

    if (item.status === 'ALREADY_SCANNED') {
      tagClass = 'tag-dup';
      tagText = 'DUPLICATE SCAN';
    } else if (item.status === 'INVALID') {
      tagClass = 'tag-inv';
      tagText = 'INVALID CODE';
    }

    const timeStr = new Date(item.timestamp || item.scanned_at).toLocaleTimeString();

    return `
      <div class="history-row-item">
        <div>
          <strong style="color: var(--text-main);">${item.attendeeName || item.attendee_name || 'Unknown'}</strong>
          <span style="color: var(--text-muted); margin-left: 4px;"><code>${item.ticketId || item.ticket_id}</code></span>
          <div style="font-size: 0.7rem; color: var(--text-muted);">${item.seminar || ''}</div>
        </div>
        <div style="text-align: right;">
          <span class="h-badge-tag ${tagClass}">${tagText}</span>
          <div style="font-size: 0.68rem; color: var(--text-muted); margin-top: 2px;">${timeStr}</div>
        </div>
      </div>
    `;
  }).join('');
}

async function clearLiveScanLog() {
  if (!confirm("Clear the live scan history log?")) return;
  try {
    await fetch('/api/scan-history/clear', { method: 'POST' });
    loadScanHistory();
  } catch (e) {
    console.warn(e);
  }
}

