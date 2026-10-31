/**
 * PAF-IAST SCIENCE FESTA 2026 - ORGANIZER & GATE ADMIN PORTAL
 * Theme: Pure White & Deep Navy Blue
 * Credentials: ID: pafss26 | Pass: seminar
 * Features:
 *  - Unified 2-Day Seminar Candidate Management
 *  - 300 PKR Payment Verification with High-Res Receipt Lightbox
 *  - 10-Second Revoke / Undo for Single & Bulk Deletions
 *  - Real-Time Gate QR Scanner with Payment Verification Gate
 *  - 100% Neon DB Sync & Hardware Accelerated Zero-Lag UI
 */

// Application State
let adminAuthenticated = false;
let localAttendeeCache = [];
let localScanHistory = [];
let html5Scanner = null;
let isScannerRunning = false;
let currentFilter = 'all';
let currentActiveReceiptAttendee = null;

// State for 10-Second Pending Deletion Revoke System
let pendingDeletion = null; // { type: 'single' | 'bulk', id, name, candidate, index, allCandidates, timeoutId, intervalId }

// Audio Feedback
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
      osc.frequency.setValueAtTime(587.33, now);
      osc.frequency.setValueAtTime(880, now + 0.1);
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
    // Ignore audio restrictions
  }
}

// ===================================================================
// INITIALIZATION
// ===================================================================
document.addEventListener('DOMContentLoaded', () => {
  startClock();

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
  document.getElementById('admin-login-screen').style.display = 'block';
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

// Handle Login (ID: pafss26, Pass: seminar)
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
  if (pendingDeletion) {
    commitPendingDeletion();
  }
  sessionStorage.removeItem('pafss_admin_token');
  adminAuthenticated = false;
  if (html5Scanner && isScannerRunning) {
    stopCameraScanner();
  }
  showLogin();
}

// ===================================================================
// TAB SWITCHING (SMOOTH & ZERO LAG)
// ===================================================================
function switchAdminTab(tabName) {
  const btnDir = document.getElementById('tab-btn-directory');
  const btnScan = document.getElementById('tab-btn-scanner');
  const paneDir = document.getElementById('tab-pane-directory');
  const paneScan = document.getElementById('tab-pane-scanner');

  if (tabName === 'directory') {
    btnDir.classList.add('active');
    btnScan.classList.remove('active');
    paneDir.style.display = 'block';
    paneScan.style.display = 'none';
    if (html5Scanner && isScannerRunning) {
      stopCameraScanner();
    }
  } else {
    btnScan.classList.add('active');
    btnDir.classList.remove('active');
    paneScan.style.display = 'block';
    paneDir.style.display = 'none';
  }
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
  const sTotal = document.getElementById('dash-total-count');
  const sVerified = document.getElementById('dash-verified-count');
  const sRevenue = document.getElementById('dash-revenue-text');
  const sPending = document.getElementById('dash-pending-count');
  const sChecked = document.getElementById('dash-checked-count');

  if (sTotal) sTotal.innerText = stats.totalAttendees || 0;
  if (sVerified) sVerified.innerText = stats.verifiedCount || 0;
  if (sRevenue) sRevenue.innerText = `Total: ${stats.totalRevenue || '0 PKR'}`;
  if (sPending) sPending.innerText = stats.pendingCount || 0;
  if (sChecked) sChecked.innerText = stats.checkedInCount || 0;
}

function updateStatsFromLocal() {
  const verifiedCount = localAttendeeCache.filter(a => a.paymentStatus === 'verified' || a.payment_status === 'verified').length;
  updateStatsUI({
    totalAttendees: localAttendeeCache.length,
    verifiedCount: verifiedCount,
    pendingCount: localAttendeeCache.filter(a => !(a.paymentStatus === 'verified' || a.payment_status === 'verified')).length,
    checkedInCount: localAttendeeCache.filter(a => a.checkedIn).length,
    totalRevenue: `${verifiedCount * 300} PKR`
  });
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
    const isVerified = (a.paymentStatus === 'verified' || a.payment_status === 'verified');
    
    if (currentFilter === 'verified' && !isVerified) return false;
    if (currentFilter === 'pending' && isVerified) return false;
    if (currentFilter === 'admitted' && !a.checkedIn) return false;

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
    tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; color: var(--text-muted); padding: 32px;">No candidate records found.</td></tr>`;
    return;
  }

  tbody.innerHTML = attendees.map(a => {
    const isVerified = (a.paymentStatus === 'verified' || a.payment_status === 'verified');
    const isRejected = (a.paymentStatus === 'rejected' || a.payment_status === 'rejected');

    // Payment Proof Thumbnail
    let proofHtml = `<span style="color: var(--text-muted); font-size: 0.76rem;">No file</span>`;
    if (a.paymentReceipt || a.payment_receipt) {
      const imgUrl = a.paymentReceipt || a.payment_receipt;
      proofHtml = `
        <div class="receipt-thumb-wrap" onclick="viewReceiptImage('${a.id}')" title="Click to inspect receipt">
          <img src="${imgUrl}" class="admin-receipt-thumb" alt="Payment Proof">
          <span class="zoom-icon-chip">🔍 Zoom</span>
        </div>
      `;
    }

    // Payment Status Badge & One-Click Actions
    let payHtml = '';
    if (isVerified) {
      payHtml = `
        <div style="display: flex; align-items: center; gap: 6px;">
          <span class="badge-status-verified">✅ Verified</span>
          <button class="btn-micro-action" onclick="verifyCandidatePayment('${a.id}', 'pending')" title="Revert to pending">Revert</button>
        </div>
      `;
    } else if (isRejected) {
      payHtml = `
        <div style="display: flex; align-items: center; gap: 6px;">
          <span class="badge-status-rejected">❌ Rejected</span>
          <button class="btn-micro-action btn-green" onclick="verifyCandidatePayment('${a.id}', 'verified')" title="Approve payment">Approve</button>
        </div>
      `;
    } else {
      payHtml = `
        <div>
          <span class="badge-status-pending">⏳ Pending (300 PKR)</span>
          <div style="display: flex; gap: 4px; margin-top: 4px;">
            <button class="btn-micro-action btn-green" onclick="verifyCandidatePayment('${a.id}', 'verified')">Approve</button>
            <button class="btn-micro-action btn-red" onclick="verifyCandidatePayment('${a.id}', 'rejected')">Reject</button>
          </div>
        </div>
      `;
    }

    // Gate Status Badge
    const gateBadge = a.checkedIn
      ? `<span class="h-badge-tag tag-first">Admitted (${new Date(a.checkedInAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})})</span>`
      : `<span class="h-badge-tag" style="background:var(--card-subtle); color:var(--text-muted);">Not Checked In</span>`;

    const univid = a.universityId || a.university_id || 'N/A';

    return `
      <tr>
        <td><code>${a.id}</code></td>
        <td>
          <strong style="color: var(--navy-dark); font-size: 0.92rem;">${a.name}</strong>
        </td>
        <td><span class="univ-id-chip">${univid}</span></td>
        <td>
          <div style="font-size: 0.8rem;">${a.phone}</div>
          <div style="font-size: 0.74rem; color: var(--text-muted);">${a.email}</div>
        </td>
        <td>${proofHtml}</td>
        <td>${payHtml}</td>
        <td>${gateBadge}</td>
        <td>
          <button class="btn-delete-row" onclick="deleteSingleCandidate('${a.id}', '${a.name.replace(/'/g, "\\'")}')" title="Delete Candidate">
            🗑️ Delete
          </button>
        </td>
      </tr>
    `;
  }).join('');
}

// Verify or Reject Payment via API
async function verifyCandidatePayment(id, status) {
  try {
    const res = await fetch(`/api/attendees/${id}/verify-payment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status })
    });

    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.message || 'Could not update payment status');
    }

    // Update local cache
    const idx = localAttendeeCache.findIndex(a => a.id.toUpperCase() === id.toUpperCase());
    if (idx !== -1) {
      localAttendeeCache[idx] = data.attendee;
    }

    renderDirectoryTable(localAttendeeCache);
    fetchDashboardData();

    if (currentActiveReceiptAttendee && currentActiveReceiptAttendee.id === id) {
      closeReceiptModal();
    }

  } catch (err) {
    alert(err.message || "Error updating payment status.");
  }
}

// Lightbox Modal: View full resolution receipt
function viewReceiptImage(attendeeId) {
  const attendee = localAttendeeCache.find(a => a.id.toUpperCase() === attendeeId.toUpperCase());
  if (!attendee) return;

  currentActiveReceiptAttendee = attendee;
  const modal = document.getElementById('receipt-modal');
  const img = document.getElementById('receipt-modal-img');
  const meta = document.getElementById('receipt-meta-bar');
  const actions = document.getElementById('receipt-actions-row');

  const receiptSrc = attendee.paymentReceipt || attendee.payment_receipt;
  if (!receiptSrc) {
    alert("No receipt image available for this candidate.");
    return;
  }

  img.src = receiptSrc;
  const isVerified = (attendee.paymentStatus === 'verified' || attendee.payment_status === 'verified');

  meta.innerHTML = `
    <div><strong>Candidate:</strong> ${attendee.name} (${attendee.universityId || attendee.university_id})</div>
    <div><strong>Ticket ID:</strong> <code>${attendee.id}</code> • <strong>Phone:</strong> ${attendee.phone}</div>
    <div><strong>Fee:</strong> 300 PKR • <strong>Current Status:</strong> <span style="font-weight: 800; color:${isVerified ? 'var(--status-green)':'var(--status-amber)'}">${isVerified ? 'VERIFIED' : 'PENDING'}</span></div>
  `;

  actions.innerHTML = `
    <button class="navy-primary-btn" onclick="verifyCandidatePayment('${attendee.id}', 'verified')" style="padding: 8px 18px;">
      ✅ Approve Payment (300 PKR)
    </button>
    <button class="glass-btn-danger" onclick="verifyCandidatePayment('${attendee.id}', 'rejected')" style="padding: 8px 18px;">
      ❌ Reject Payment
    </button>
    <button class="glass-btn-subtle" onclick="closeReceiptModal()" style="padding: 8px 18px;">
      Close
    </button>
  `;

  modal.classList.add('open');
}

function closeReceiptModal() {
  const modal = document.getElementById('receipt-modal');
  if (modal) modal.classList.remove('open');
  currentActiveReceiptAttendee = null;
}

// ===================================================================
// 10-SECOND REVOKE / UNDO DELETION SYSTEM
// ===================================================================
function showTransientToast(message, isError = false) {
  const toast = document.getElementById('admin-transient-toast');
  if (!toast) return;
  toast.innerText = message;
  toast.style.background = isError ? '#DC2626' : 'var(--navy-dark)';
  toast.style.display = 'block';
  toast.style.opacity = '1';
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => { toast.style.display = 'none'; }, 250);
  }, 3500);
}

function showRevokeToast(text, durationMs, onCommit) {
  const toast = document.getElementById('admin-revoke-toast');
  const textEl = document.getElementById('revoke-toast-text');
  const countEl = document.getElementById('revoke-countdown');
  const fillEl = document.getElementById('revoke-progress-fill');
  if (!toast) return { timeoutId: null, intervalId: null };

  textEl.innerText = text;
  toast.style.display = 'flex';
  toast.offsetHeight; // trigger reflow
  toast.classList.add('visible');

  let remainingSec = Math.ceil(durationMs / 1000);
  countEl.innerText = remainingSec;
  fillEl.style.transition = 'none';
  fillEl.style.width = '100%';

  requestAnimationFrame(() => {
    fillEl.style.transition = `width ${durationMs}ms linear`;
    fillEl.style.width = '0%';
  });

  const intervalId = setInterval(() => {
    remainingSec--;
    if (remainingSec > 0) {
      countEl.innerText = remainingSec;
    } else {
      clearInterval(intervalId);
    }
  }, 1000);

  const timeoutId = setTimeout(() => {
    clearInterval(intervalId);
    hideRevokeToast();
    if (onCommit) onCommit();
  }, durationMs);

  return { timeoutId, intervalId };
}

function hideRevokeToast() {
  const toast = document.getElementById('admin-revoke-toast');
  if (toast) {
    toast.classList.remove('visible');
    setTimeout(() => { toast.style.display = 'none'; }, 250);
  }
}

// Delete Single Candidate with 10-Second Revoke Window
function deleteSingleCandidate(id, name) {
  // If another deletion is already pending, finalize it immediately
  if (pendingDeletion) {
    commitPendingDeletion();
  }

  const candidateIndex = localAttendeeCache.findIndex(a => a.id.toUpperCase() === id.toUpperCase());
  if (candidateIndex === -1) return;
  const candidate = localAttendeeCache[candidateIndex];

  // Immediately pull candidate out of active view
  localAttendeeCache.splice(candidateIndex, 1);
  renderDirectoryTable(localAttendeeCache);
  updateStatsFromLocal();

  const duration = 10000;
  const { timeoutId, intervalId } = showRevokeToast(
    `Candidate "${name}" (${id}) scheduled for deletion.`,
    duration,
    () => {
      commitSingleDelete(id, name);
    }
  );

  pendingDeletion = {
    type: 'single',
    id: id,
    name: name,
    candidate: candidate,
    index: candidateIndex,
    timeoutId: timeoutId,
    intervalId: intervalId
  };
}

async function commitSingleDelete(id, name) {
  try {
    const res = await fetch(`/api/attendees/${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Error deleting candidate');
    showTransientToast(`Candidate "${name || id}" permanently deleted from database.`);
    fetchDashboardData();
  } catch (err) {
    console.error("Delete commit error:", err);
  } finally {
    if (pendingDeletion && pendingDeletion.id === id) {
      pendingDeletion = null;
    }
  }
}

// Delete All Candidates with 10-Second Revoke Window
function confirmDeleteAllCandidates() {
  if (localAttendeeCache.length === 0) {
    alert("There are no candidates in the directory to delete.");
    return;
  }

  if (!confirm(`⚠️ DANGER: Schedule deletion of ALL ${localAttendeeCache.length} candidates? You will have 10 seconds to revoke this action.`)) {
    return;
  }

  if (pendingDeletion) {
    commitPendingDeletion();
  }

  const allCandidatesBackup = localAttendeeCache.slice();
  localAttendeeCache = [];
  renderDirectoryTable([]);
  updateStatsUI({ totalAttendees: 0, verifiedCount: 0, pendingCount: 0, checkedInCount: 0, totalRevenue: '0 PKR' });

  const duration = 10000;
  const { timeoutId, intervalId } = showRevokeToast(
    `All ${allCandidatesBackup.length} candidates scheduled for deletion.`,
    duration,
    () => {
      commitBulkDelete();
    }
  );

  pendingDeletion = {
    type: 'bulk',
    allCandidates: allCandidatesBackup,
    timeoutId: timeoutId,
    intervalId: intervalId
  };
}

async function commitBulkDelete() {
  try {
    const res = await fetch('/api/attendees', { method: 'DELETE' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Error clearing candidates');
    showTransientToast("All candidates permanently deleted from database.");
    fetchDashboardData();
  } catch (err) {
    console.error("Bulk delete commit error:", err);
  } finally {
    if (pendingDeletion && pendingDeletion.type === 'bulk') {
      pendingDeletion = null;
    }
  }
}

function commitPendingDeletion() {
  if (!pendingDeletion) return;
  clearTimeout(pendingDeletion.timeoutId);
  clearInterval(pendingDeletion.intervalId);
  hideRevokeToast();

  if (pendingDeletion.type === 'single') {
    commitSingleDelete(pendingDeletion.id, pendingDeletion.name);
  } else if (pendingDeletion.type === 'bulk') {
    commitBulkDelete();
  }
}

function revokePendingDeletion() {
  if (!pendingDeletion) return;

  clearTimeout(pendingDeletion.timeoutId);
  clearInterval(pendingDeletion.intervalId);
  hideRevokeToast();

  if (pendingDeletion.type === 'single') {
    // Restore candidate back into local cache and UI
    localAttendeeCache.splice(pendingDeletion.index, 0, pendingDeletion.candidate);
    renderDirectoryTable(localAttendeeCache);
    updateStatsFromLocal();
    showTransientToast(`✅ Deletion revoked! Candidate "${pendingDeletion.candidate.name}" has been restored.`);
    fetchDashboardData();
  } else if (pendingDeletion.type === 'bulk') {
    // Restore all candidates back
    localAttendeeCache = pendingDeletion.allCandidates.slice();
    renderDirectoryTable(localAttendeeCache);
    updateStatsFromLocal();
    showTransientToast(`✅ Deletion revoked! All ${localAttendeeCache.length} candidate records have been restored.`);
    fetchDashboardData();
  }

  pendingDeletion = null;
}

// Export CSV
function exportDirectoryCSV() {
  if (!localAttendeeCache || localAttendeeCache.length === 0) {
    alert("No attendees to export.");
    return;
  }

  const headers = ["Ticket ID", "Name", "University ID", "Phone", "Personal Gmail", "Event", "Fee", "Payment Status", "Checked In", "Checked In Time"];
  const rows = localAttendeeCache.map(a => [
    `"${a.id}"`,
    `"${a.name.replace(/"/g, '""')}"`,
    `"${a.universityId || a.university_id || ''}"`,
    `"${a.phone}"`,
    `"${a.email}"`,
    `"2-Day Seminar Series (Dr. Hamad Ali & Dr. Shah Faisal)"`,
    `"300 PKR"`,
    `"${a.paymentStatus || a.payment_status || 'pending'}"`,
    a.checkedIn ? "YES" : "NO",
    `"${a.checkedInAt || ''}"`
  ]);

  const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", `PAFSS_Candidates_${new Date().toISOString().slice(0, 10)}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// ===================================================================
// QR CODE SCANNER (WITH PAYMENT STATUS GATE CHECK)
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
    () => {}
  ).then(() => {
    isScannerRunning = true;
    if (toggleBtn) {
      toggleBtn.innerText = "Stop Camera Scan";
      toggleBtn.className = "glass-btn-subtle";
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
        toggleBtn.innerText = "📷 Start Camera Scan";
        toggleBtn.className = "navy-primary-btn";
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

// Main QR Scan Processor
async function processTicketScan(ticketCode) {
  const now = Date.now();
  if (ticketCode === lastScannedText && now - lastScannedTimestamp < 2500) {
    return;
  }
  lastScannedText = ticketCode;
  lastScannedTimestamp = now;

  let clean = String(ticketCode || '').trim();
  const urlMatch = clean.match(/(PAFSS-26-\d+|AMR-26-\d+|AIH-26-\d+)/i);
  if (urlMatch) {
    clean = urlMatch[1];
  }
  const cleanUpper = clean.toUpperCase();

  // 1. Instant check in local cache ONLY by ticket ID or ticketHash
  const localMatch = localAttendeeCache.find(a => 
    (a.id && a.id.toUpperCase() === cleanUpper) ||
    (a.ticketHash && a.ticketHash.toUpperCase() === cleanUpper)
  );

  if (localMatch) {
    const isVerified = (localMatch.paymentStatus === 'verified' || localMatch.payment_status === 'verified');
    
    // Check payment verification
    if (!isVerified) {
      playSound('warning');
      renderPreviewResult({
        status: 'PAYMENT_PENDING',
        attendee: localMatch,
        message: `⚠️ PAYMENT UNVERIFIED! ${localMatch.name} has not cleared 300 PKR fee. Please verify in Admin.`
      });
      syncScanToServer(cleanUpper);
      return;
    }

    if (localMatch.checkedIn) {
      // ALREADY SCANNED ONCE (Duplicate alert with person's name)
      playSound('warning');
      const timeStr = localMatch.checkedInAt 
        ? new Date(localMatch.checkedInAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) 
        : 'Earlier';
      
      const newCount = Number(localMatch.scanCount || 1) + 1;
      localMatch.scanCount = newCount;

      renderPreviewResult({
        status: 'ALREADY_SCANNED',
        attendee: localMatch,
        checkedInAt: localMatch.checkedInAt,
        scanCount: newCount,
        message: `⚠️ Already Scanned! ${localMatch.name} was already admitted at ${timeStr}.`
      });
      syncScanToServer(cleanUpper);
      return;
    } else {
      // FIRST TIME SCAN -> Instant Green Admission with person's name
      playSound('success');
      const scanTime = new Date().toISOString();
      localMatch.checkedIn = true;
      localMatch.checkedInAt = scanTime;
      localMatch.scanCount = 1;

      renderPreviewResult({
        status: 'FIRST_CHECKIN',
        attendee: localMatch,
        message: `✅ Admitted: ${localMatch.name} (300 PKR Verified)`
      });

      renderDirectoryTable(localAttendeeCache);
      syncScanToServer(cleanUpper);
      return;
    }
  }

  // 2. Query server endpoint
  try {
    const res = await fetch('/api/scan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ticketId: cleanUpper })
    });

    const result = await res.json();
    if (!res.ok || result.status === 'INVALID') {
      playSound('error');
      renderPreviewResult({
        status: 'INVALID',
        message: result.message || `Wrong code! "${cleanUpper}" is not recognized as a registered participant pass.`
      });
    } else {
      if (result.status === 'FIRST_CHECKIN') {
        playSound('success');
      } else if (result.status === 'ALREADY_SCANNED' || result.status === 'PAYMENT_PENDING') {
        playSound('warning');
      }
      renderPreviewResult(result);
    }
    fetchDashboardData();
    loadScanHistory();

  } catch (err) {
    playSound('error');
    renderPreviewResult({
      status: 'INVALID',
      message: `Wrong code! "${cleanUpper}" is not recognized as a participant pass.`
    });
  }
}

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

  if (result.status === 'FIRST_CHECKIN') {
    banner.className = 'scan-status-banner banner-green';
    const a = result.attendee || {};
    const univid = a.universityId || a.university_id || 'N/A';
    const attendeeName = a.name || 'Participant';

    banner.innerHTML = `
      <span>✅ Admitted: ${attendeeName} (300 PKR Verified)</span>
    `;

    details.innerHTML = `
      <div style="font-size: 0.95rem; font-weight: 800; color: var(--status-green); margin-bottom: 6px;">
        ${attendeeName} has been verified and admitted for the 2-Day Seminar Series.
      </div>
      <div><strong>Candidate:</strong> ${attendeeName} • <strong>Univ ID:</strong> ${univid}</div>
      <div><strong>Venue:</strong> B2 MPH (Multipurpose Hall)</div>
      <div><strong>Ticket ID:</strong> <code>${a.id}</code> • <strong>Fee:</strong> 300 PKR Paid</div>
      <div><strong>Check-In Time:</strong> ${new Date(a.checkedInAt || Date.now()).toLocaleTimeString()}</div>
    `;

  } else if (result.status === 'PAYMENT_PENDING') {
    banner.className = 'scan-status-banner banner-amber';
    const a = result.attendee || {};
    const univid = a.universityId || a.university_id || 'N/A';
    const attendeeName = a.name || 'Participant';

    banner.innerHTML = `
      <span>⚠️ Payment Unverified: ${attendeeName}</span>
    `;

    details.innerHTML = `
      <div style="font-size: 0.95rem; font-weight: 800; color: var(--status-amber); margin-bottom: 6px;">
        ⚠️ This ticket has NOT been approved for the 300 PKR entry fee!
      </div>
      <div><strong>Candidate:</strong> ${attendeeName} • <strong>Univ ID:</strong> ${univid}</div>
      <div><strong>Ticket ID:</strong> <code>${a.id}</code></div>
      <div style="color: var(--status-red); font-weight: 700; margin-top: 4px;">Action Required: Direct candidate to the organizer desk or verify their receipt in Admin.</div>
    `;

  } else if (result.status === 'ALREADY_SCANNED') {
    banner.className = 'scan-status-banner banner-amber';
    const a = result.attendee || {};
    const univid = a.universityId || a.university_id || 'N/A';
    const attendeeName = a.name || 'Participant';
    const checkedTime = result.checkedInAt 
      ? new Date(result.checkedInAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) 
      : 'Earlier';

    banner.innerHTML = `
      <span>⚠️ Already Scanned: ${attendeeName}</span>
    `;

    details.innerHTML = `
      <div style="font-size: 0.95rem; font-weight: 800; color: var(--status-amber); margin-bottom: 6px;">
        ⚠️ DUPLICATE ENTRY: This pass was already admitted earlier!
      </div>
      <div><strong>Candidate:</strong> ${attendeeName} • <strong>Univ ID:</strong> ${univid}</div>
      <div><strong>Ticket ID:</strong> <code>${a.id}</code></div>
      <div><strong>First Check-In Time:</strong> ${checkedTime}</div>
      <div><strong>Total Scan Attempts:</strong> ${result.scanCount || a.scanCount || 2}</div>
    `;

  } else {
    banner.className = 'scan-status-banner banner-red';
    banner.innerHTML = `
      <span>❌ Wrong Code / Access Declined</span>
    `;
    details.innerHTML = `
      <div style="font-size: 0.92rem; font-weight: 800; color: var(--status-red); margin-bottom: 4px;">
        Wrong code! Unrecognized QR code.
      </div>
      <div style="color: var(--text-muted); font-size: 0.82rem;">
        ${result.message || 'Only official seminar tickets generated by this portal are accepted.'}
      </div>
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
    container.innerHTML = '<div style="color: var(--text-muted); font-size: 0.8rem; text-align: center; padding: 20px;">No scan history recorded yet.</div>';
    return;
  }

  container.innerHTML = history.map(item => {
    let tagClass = 'tag-first';
    let tagText = 'ADMITTED';

    if (item.status === 'PAYMENT_PENDING') {
      tagClass = 'badge-status-pending';
      tagText = 'FEE PENDING';
    } else if (item.status === 'ALREADY_SCANNED') {
      tagClass = 'badge-status-pending';
      tagText = 'DUPLICATE';
    } else if (item.status === 'INVALID') {
      tagClass = 'badge-status-rejected';
      tagText = 'WRONG CODE';
    }

    const timeStr = new Date(item.timestamp || item.scanned_at).toLocaleTimeString();
    const scanId = item.scanId || item.scan_id;

    return `
      <div class="history-item-row">
        <div>
          <strong style="color: var(--navy-dark); font-size: 0.86rem;">${item.attendeeName || item.attendee_name || 'Unknown'}</strong>
          <span style="color: var(--text-muted); margin-left: 4px;"><code>${item.ticketId || item.ticket_id}</code></span>
          <div style="font-size: 0.72rem; color: var(--text-muted);">${item.message || ''}</div>
        </div>
        <div style="text-align: right; display: flex; align-items: center; gap: 8px;">
          <div>
            <span class="${tagClass}" style="font-size: 0.7rem; padding: 2px 6px;">${tagText}</span>
            <div style="font-size: 0.68rem; color: var(--text-muted); margin-top: 2px;">${timeStr}</div>
          </div>
          <button class="btn-delete-row" style="padding: 2px 6px; font-size: 0.75rem;" onclick="deleteScanLogItem('${scanId}')" title="Delete scan log">×</button>
        </div>
      </div>
    `;
  }).join('');
}

// Delete Single Scan Log Item
async function deleteScanLogItem(scanId) {
  try {
    const res = await fetch(`/api/scan-history/${scanId}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('Error deleting log');

    localScanHistory = localScanHistory.filter(i => (i.scanId !== scanId && i.scan_id !== scanId));
    renderScanHistory(localScanHistory);
  } catch (err) {
    alert("Could not delete scan item.");
  }
}

// Clear Entire Scan History
async function clearLiveScanLog() {
  if (!confirm("Clear the entire live gate scan history log?")) return;
  try {
    await fetch('/api/scan-history/clear', { method: 'POST' });
    localScanHistory = [];
    renderScanHistory([]);
  } catch (e) {
    console.warn(e);
  }
}
