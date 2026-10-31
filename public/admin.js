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
// TAB SWITCHING (SMOOTH & ZERO LAG) - 3 DEDICATED SECTIONS
// ===================================================================
function switchAdminTab(tabName) {
  const btnDir = document.getElementById('tab-btn-directory');
  const btnTickets = document.getElementById('tab-btn-tickets');
  const btnScan = document.getElementById('tab-btn-scanner');

  const paneDir = document.getElementById('tab-pane-directory');
  const paneTickets = document.getElementById('tab-pane-tickets');
  const paneScan = document.getElementById('tab-pane-scanner');

  if (tabName === 'directory') {
    if (btnDir) btnDir.classList.add('active');
    if (btnTickets) btnTickets.classList.remove('active');
    if (btnScan) btnScan.classList.remove('active');

    if (paneDir) paneDir.style.display = 'block';
    if (paneTickets) paneTickets.style.display = 'none';
    if (paneScan) paneScan.style.display = 'none';

    if (html5Scanner && isScannerRunning) {
      stopCameraScanner();
    }
  } else if (tabName === 'tickets') {
    if (btnTickets) btnTickets.classList.add('active');
    if (btnDir) btnDir.classList.remove('active');
    if (btnScan) btnScan.classList.remove('active');

    if (paneTickets) paneTickets.style.display = 'block';
    if (paneDir) paneDir.style.display = 'none';
    if (paneScan) paneScan.style.display = 'none';

    if (html5Scanner && isScannerRunning) {
      stopCameraScanner();
    }
    renderApprovedTicketsSection();
  } else if (tabName === 'scanner') {
    if (btnScan) btnScan.classList.add('active');
    if (btnDir) btnDir.classList.remove('active');
    if (btnTickets) btnTickets.classList.remove('active');

    if (paneScan) paneScan.style.display = 'block';
    if (paneDir) paneDir.style.display = 'none';
    if (paneTickets) paneTickets.style.display = 'none';
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
      updateApprovedTicketsBadge();
      handleTicketsSearch();
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
  updateApprovedTicketsBadge();
  handleTicketsSearch();
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

// ===================================================================
// SECTION: APPROVED TICKETS, GMAIL DISPATCH & HIGH-RES PDF PASSES
// (Only candidates approved in Admin appear in this dedicated section)
// ===================================================================

let currentDispatchAttendee = null;
let cachedUnivLogo = null;
let cachedSocietyLogo = null;

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function getApprovedCandidates() {
  return localAttendeeCache.filter(a => a.paymentStatus === 'verified' || a.payment_status === 'verified');
}

function updateApprovedTicketsBadge() {
  const approved = getApprovedCandidates();
  const countBadge = document.getElementById('tab-tickets-count');
  const totalDisplay = document.getElementById('tickets-verified-total');
  const batchCount = document.getElementById('batch-count-ready');

  if (countBadge) countBadge.innerText = approved.length;
  if (totalDisplay) totalDisplay.innerText = approved.length;
  if (batchCount) batchCount.innerText = approved.length;
}

function renderApprovedTicketsSection() {
  updateApprovedTicketsBadge();
  handleTicketsSearch();
}

function handleTicketsSearch() {
  const searchInput = document.getElementById('tickets-search-input');
  const query = searchInput ? searchInput.value.trim().toLowerCase() : '';
  const approved = getApprovedCandidates();

  const filtered = approved.filter(a => {
    if (!query) return true;
    const name = (a.name || '').toLowerCase();
    const id = (a.id || '').toLowerCase();
    const univId = (a.universityId || a.university_id || '').toLowerCase();
    const email = (a.email || '').toLowerCase();
    const phone = (a.phone || '').toLowerCase();
    return name.includes(query) || id.includes(query) || univId.includes(query) || email.includes(query) || phone.includes(query);
  });

  renderApprovedTicketsTable(filtered);
}

function renderApprovedTicketsTable(candidates) {
  const tbody = document.getElementById('tickets-tbody');
  if (!tbody) return;

  if (!candidates || candidates.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="8" style="text-align: center; color: var(--text-muted); padding: 36px;">
          No approved candidate tickets found. Once candidate payments (300 PKR) are approved in the Candidates tab, their tickets will immediately appear here.
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = candidates.map(a => {
    const univid = a.universityId || a.university_id || 'N/A';
    
    // Receipt thumbnail
    let proofHtml = `<span style="color: var(--text-muted); font-size: 0.76rem;">No file</span>`;
    const receiptSrc = a.paymentReceipt || a.payment_receipt;
    if (receiptSrc) {
      proofHtml = `
        <div class="receipt-thumb-wrap" onclick="viewReceiptImage('${a.id}')" title="Click to view payment proof">
          <img src="${receiptSrc}" class="admin-receipt-thumb" alt="Proof">
          <span class="zoom-icon-chip">🔍 Zoom</span>
        </div>
      `;
    }

    return `
      <tr>
        <td><code>${a.id}</code></td>
        <td>
          <strong style="color: var(--navy-dark); font-size: 0.92rem;">${escapeHtml(a.name)}</strong>
        </td>
        <td><span class="univ-id-chip">${escapeHtml(univid)}</span></td>
        <td><span style="font-size: 0.82rem; color: var(--navy-primary); font-weight: 600;">${escapeHtml(a.email)}</span></td>
        <td><span style="font-size: 0.8rem;">${escapeHtml(a.phone)}</span></td>
        <td>${proofHtml}</td>
        <td>
          <button class="btn-preview-ticket" onclick="openSingleGmailDispatch('${a.id}')" title="Inspect official pass and QR code">
            🎟️ View Ticket Pass
          </button>
        </td>
        <td>
          <div style="display: flex; gap: 6px; flex-wrap: wrap;">
            <button class="btn-dispatch-mail" onclick="openSingleGmailDispatch('${a.id}')" title="Open Gmail composer with details">
              ✉️ Send Mail
            </button>
            <button class="btn-dl-pdf" onclick="generateAttendeeTicketPDF('${a.id}')" title="Download high-res PDF entry pass">
              📥 Ticket PDF
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

// Preload logos into base64 data URLs for instantaneous PDF generation
async function preloadLogos() {
  if (!cachedUnivLogo) {
    cachedUnivLogo = await loadImageAsDataUrl('assets/university_logo.png');
  }
  if (!cachedSocietyLogo) {
    cachedSocietyLogo = await loadImageAsDataUrl('assets/society_logo.png');
  }
}

function loadImageAsDataUrl(url) {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'Anonymous';
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth || img.width;
        canvas.height = img.naturalHeight || img.height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);
        resolve(canvas.toDataURL('image/png'));
      } catch (e) {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

// ===================================================================
// INDIVIDUAL GMAIL DISPATCH MODAL & VISUAL TICKET PASS
// ===================================================================

function openSingleGmailDispatch(attendeeId) {
  const attendee = localAttendeeCache.find(a => a.id.toUpperCase() === attendeeId.toUpperCase());
  if (!attendee) {
    alert("Candidate record not found.");
    return;
  }

  currentDispatchAttendee = attendee;
  const univid = attendee.universityId || attendee.university_id || 'N/A';
  const cleanName = attendee.name.replace(/[^a-zA-Z0-9]/g, '_');

  // Populate Meta Header
  const toEl = document.getElementById('dispatch-email-to');
  const subEl = document.getElementById('dispatch-email-subject');
  const attEl = document.getElementById('dispatch-email-attachment');

  if (toEl) toEl.innerText = attendee.email;
  if (subEl) subEl.innerText = `Official Entry Pass - PAF-IAST Science Society 2-Day Seminar Series [Ticket ID: ${attendee.id}]`;
  if (attEl) attEl.innerText = `Ticket_${attendee.id}_${cleanName}.pdf (Auto-Downloaded on Send)`;

  // Populate Personalized Email Letter
  const letterBody = document.getElementById('email-letter-content');
  if (letterBody) {
    letterBody.innerHTML = `
      <p>Dear <strong>${escapeHtml(attendee.name)}</strong>,</p>

      <p>
        Congratulations! We are pleased to confirm that your registration and <strong>300 PKR entry fee</strong> for the upcoming <strong>PAF-IAST Science Society 2-Day Seminar Series</strong> have been successfully approved by the society.
      </p>

      <p style="margin-bottom: 6px;">
        Here are your official seminar and venue details:
      </p>

      <ul style="margin: 4px 0 14px 20px; font-size: 0.85rem; line-height: 1.6;">
        <li><strong>Official Venue:</strong> B2 MPH (Multipurpose Hall), Pak-Austria Fachhochschule: Institute of Applied Sciences and Technology (PAF-IAST), Mang, Haripur</li>
        <li><strong>Day 1 (Wednesday, 4th Nov • 2:00 – 4:00 PM):</strong> "The Silent Pandemic: Antimicrobial Resistance and Its Global Health Implications" — Speaker: <strong>Dr. Hamad Ali</strong></li>
        <li><strong>Day 2 (Thursday, 5th Nov • 2:00 – 4:00 PM):</strong> "Artificial Intelligence in Healthcare: Smart Medicine, Clinical Research &amp; Biotechnology" — Speaker: <strong>Dr. Shah Faisal</strong></li>
        <li><strong>Registration Ticket ID:</strong> <code style="font-weight: 800; color: #1E3A8A;">${escapeHtml(attendee.id)}</code></li>
        <li><strong>University ID:</strong> <strong>${escapeHtml(univid)}</strong></li>
        <li><strong>Payment Status:</strong> <span style="color: #059669; font-weight: 800;">VERIFIED (300 PKR)</span></li>
      </ul>

      <p>
        Your official entry ticket with your unique scannable QR code is attached below and ready for download. Please ensure you have this pass available on your mobile device or as a printed copy at the entrance of B2 MPH for admission scanning.
      </p>

      <p>
        We look forward to welcoming you to this transformative 2-day academic gathering!
      </p>

      <p style="margin-top: 14px; font-size: 0.82rem; color: #475569;">
        Warm regards,<br>
        <strong>PAF-IAST Science Society Organizing Committee</strong><br>
        Pak-Austria Fachhochschule: Institute of Applied Sciences and Technology (PAF-IAST)
      </p>
    `;
  }

  // Populate Mini Ticket Card Preview
  const pName = document.getElementById('preview-ticket-name');
  const pUniv = document.getElementById('preview-ticket-univid');
  const pDates = document.getElementById('preview-ticket-dates');
  const qrBox = document.getElementById('preview-ticket-qr');

  if (pName) pName.innerText = attendee.name;
  if (pUniv) pUniv.innerText = `Univ ID: ${univid}`;
  if (pDates) pDates.innerText = `Wed 4th & Thu 5th Nov • 2:00 – 4:00 PM • B2 MPH`;

  if (qrBox) {
    qrBox.innerHTML = '';
    new QRCode(qrBox, {
      text: attendee.id,
      width: 80,
      height: 80,
      colorDark: "#0A192F",
      colorLight: "#FFFFFF",
      correctLevel: QRCode.CorrectLevel.H
    });
  }

  const modal = document.getElementById('email-ticket-modal');
  if (modal) modal.classList.add('open');
}

function closeEmailTicketModal() {
  const modal = document.getElementById('email-ticket-modal');
  if (modal) modal.classList.remove('open');
  currentDispatchAttendee = null;
}

// Plain Text Email for Gmail Composer & Clipboard
function generatePlainEmailBody(attendee) {
  const univid = attendee.universityId || attendee.university_id || 'N/A';
  return `Dear ${attendee.name},

Congratulations! We are pleased to confirm that your registration and 300 PKR entry fee for the upcoming PAF-IAST Science Society 2-Day Seminar Series have been successfully approved by the society.

OFFICIAL EVENT & VENUE DETAILS:
-----------------------------------------------------------
• Event: PAF-IAST Science Society 2-Day Seminar Series
• Venue: B2 MPH (Multipurpose Hall), Pak-Austria Fachhochschule: Institute of Applied Sciences and Technology (PAF-IAST), Mang, Haripur

SEMINAR SCHEDULE:
• Day 1 (Wednesday, 4th Nov 2026 • 2:00 – 4:00 PM):
  "The Silent Pandemic: Antimicrobial Resistance and Its Global Health Implications"
  Speaker: Dr. Hamad Ali

• Day 2 (Thursday, 5th Nov 2026 • 2:00 – 4:00 PM):
  "Artificial Intelligence in Healthcare: Smart Medicine, Clinical Research & Biotechnology"
  Speaker: Dr. Shah Faisal

YOUR TICKET & CANDIDATE CREDENTIALS:
• Attendee Name: ${attendee.name}
• University ID: ${univid}
• Ticket Pass ID: ${attendee.id}
• Entry Fee Status: 300 PKR VERIFIED (Official 2-Day Admission)

GATE ADMISSION INSTRUCTIONS:
Please keep your official PDF entry ticket with you (either saved on your mobile device or printed out). Your unique QR code will be scanned at the entrance of B2 MPH for admission.

We look forward to an enlightening and inspiring two days together!

Warm regards,
PAF-IAST Science Society Organizing Committee
Pak-Austria Fachhochschule: Institute of Applied Sciences and Technology (PAF-IAST)`;
}

// 1-Click Launch Gmail Compose & Trigger PDF Download
async function launchGmailComposeDirectly() {
  if (!currentDispatchAttendee) return;
  const attendee = currentDispatchAttendee;

  // 1. Download candidate's PDF ticket immediately
  try {
    await generateAttendeeTicketPDF(attendee);
  } catch (err) {
    console.warn("Could not auto-download ticket PDF:", err);
  }

  // 2. Build pre-filled Gmail compose link
  const subject = `Official Entry Pass - PAF-IAST Science Society 2-Day Seminar [${attendee.id}]`;
  const body = generatePlainEmailBody(attendee);
  const gmailUrl = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(attendee.email)}&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

  // 3. Open Gmail Compose in a new tab
  window.open(gmailUrl, '_blank');

  showTransientToast(`🚀 Gmail Compose opened! Ticket PDF downloaded to your files to attach.`);
}

function copyEmailTextToClipboard() {
  if (!currentDispatchAttendee) return;
  const body = generatePlainEmailBody(currentDispatchAttendee);
  
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(body).then(() => {
      showTransientToast("📋 Personalized email text copied to clipboard!");
    }).catch(() => {
      fallbackCopyText(body);
    });
  } else {
    fallbackCopyText(body);
  }
}

function fallbackCopyText(text) {
  const ta = document.createElement('textarea');
  ta.value = text;
  document.body.appendChild(ta);
  ta.select();
  document.execCommand('copy');
  document.body.removeChild(ta);
  showTransientToast("📋 Email text copied to clipboard!");
}

function downloadCurrentCandidatePDF() {
  if (!currentDispatchAttendee) return;
  generateAttendeeTicketPDF(currentDispatchAttendee);
}

// ===================================================================
// HIGH-RESOLUTION PDF ENTRY PASS GENERATOR
// Includes official logos, crisp scannable QR code & pure white frame
// ===================================================================

async function generateAttendeeTicketPDF(attendeeOrId) {
  let attendee = attendeeOrId;
  if (typeof attendeeOrId === 'string') {
    attendee = localAttendeeCache.find(a => a.id.toUpperCase() === attendeeOrId.toUpperCase());
  }
  if (!attendee) {
    alert("Candidate record not found.");
    return;
  }

  await preloadLogos();

  const { jsPDF } = window.jspdf || window;
  if (!jsPDF) {
    alert("PDF generation engine not ready.");
    return;
  }

  // Generate QR code offscreen using QRCode library
  const qrContainer = document.getElementById('hidden-qr-generator') || document.createElement('div');
  qrContainer.innerHTML = '';
  new QRCode(qrContainer, {
    text: attendee.id,
    width: 256,
    height: 256,
    colorDark: "#000000",
    colorLight: "#FFFFFF",
    correctLevel: QRCode.CorrectLevel.H
  });

  // Brief pause for QR canvas rendering
  await new Promise(r => setTimeout(r, 60));

  const qrCanvas = qrContainer.querySelector('canvas') || qrContainer.querySelector('img');
  let qrDataUrl = '';
  if (qrCanvas) {
    qrDataUrl = qrCanvas.toDataURL ? qrCanvas.toDataURL('image/png') : qrCanvas.src;
  }

  // Landscape format: 220mm x 105mm
  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: [220, 105]
  });

  // Page background: Clean White / Light Slate
  doc.setFillColor(248, 250, 252);
  doc.rect(0, 0, 220, 105, 'F');

  // Main Ticket Body: Deep Navy Blue
  doc.setFillColor(10, 25, 47); // #0A192F
  doc.roundedRect(6, 6, 208, 93, 4, 4, 'F');

  // Top Header Bar
  doc.setFillColor(15, 34, 64); // #0F2240
  doc.roundedRect(6, 6, 208, 16, 4, 4, 'F');
  doc.rect(6, 16, 208, 6, 'F'); // square bottom of top bar

  // Embed Official Logos in Header
  if (cachedUnivLogo) {
    doc.addImage(cachedUnivLogo, 'PNG', 10, 8, 26, 12, undefined, 'FAST');
  }
  if (cachedSocietyLogo) {
    doc.addImage(cachedSocietyLogo, 'PNG', 39, 8, 12, 12, undefined, 'FAST');
  }

  // Header Titles
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(148, 163, 184); // #94A3B8
  doc.text("PAK-AUSTRIA FACHHOCHSCHULE: IAST", 54, 12);
  doc.setFontSize(10);
  doc.setTextColor(255, 255, 255);
  doc.text("PAF-IAST SCIENCE SOCIETY  •  OFFICIAL ENTRY PASS", 54, 18);

  // Pill badge: 2-DAY PASS
  doc.setFillColor(14, 165, 233); // Sky Blue #0EA5E9
  doc.roundedRect(172, 9, 36, 8, 4, 4, 'F');
  doc.setFontSize(7.5);
  doc.setTextColor(255, 255, 255);
  doc.text("2-DAY SEMINAR PASS", 190, 14.5, { align: 'center' });

  // Main Seminar Title
  doc.setFontSize(11);
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.text("2-Day Seminar Series: Antimicrobial Resistance & AI in Healthcare", 12, 29);

  // Speakers & Schedule Row
  doc.setFontSize(8.5);
  doc.setTextColor(249, 115, 22); // Orange Accent
  doc.text("Speakers: Dr. Hamad Ali & Dr. Shah Faisal", 12, 35);

  doc.setFontSize(7.5);
  doc.setTextColor(148, 163, 184);
  doc.setFont("helvetica", "normal");
  doc.text("• Day 1: Wed 4th Nov (2:00-4:00 PM) | AMR & Global Health  • Day 2: Thu 5th Nov (2:00-4:00 PM) | AI in Medicine", 12, 40);

  // Candidate Data Box
  doc.setFillColor(17, 34, 60);
  doc.setDrawColor(30, 58, 102);
  doc.roundedRect(12, 43, 138, 48, 2, 2, 'FD');

  const univid = attendee.universityId || attendee.university_id || 'N/A';

  doc.setFont("helvetica", "bold");
  doc.setFontSize(6.8);
  doc.setTextColor(148, 163, 184);
  doc.text("ATTENDEE NAME", 16, 49);
  doc.text("UNIVERSITY ID", 82, 49);

  doc.text("EVENT DATES & TIMING", 16, 62);
  doc.text("OFFICIAL VENUE", 82, 62);

  doc.text("PHONE NUMBER", 16, 75);
  doc.text("PERSONAL GMAIL", 82, 75);

  doc.setFontSize(8.5);
  doc.setTextColor(255, 255, 255);
  doc.text(attendee.name.substring(0, 32), 16, 55);
  doc.text(String(univid), 82, 55);

  doc.text("Wed 4th & Thu 5th Nov • 2:00 - 4:00 PM", 16, 68);
  doc.text("B2 MPH (Multipurpose Hall)", 82, 68);

  doc.text(attendee.phone || 'N/A', 16, 81);
  doc.text((attendee.email || 'N/A').substring(0, 30), 82, 81);

  // 300 PKR Verified Tag
  doc.setFillColor(16, 185, 129); // #10B981 Emerald Green
  doc.roundedRect(16, 84, 48, 5, 2, 2, 'F');
  doc.setFontSize(6);
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.text("✓ 300 PKR ENTRY FEE VERIFIED", 40, 87.5, { align: 'center' });

  // Perforation dashed divider line
  doc.setDrawColor(100, 116, 139);
  doc.setLineDashPattern([2, 2], 0);
  doc.line(155, 24, 155, 95);
  doc.setLineDashPattern([], 0);

  // Ticket Stub: Pure White Quiet Frame for Instant Scanner Detection
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(162, 26, 46, 46, 3, 3, 'F');

  if (qrDataUrl) {
    doc.addImage(qrDataUrl, 'PNG', 165, 29, 40, 40);
  }

  // Pass Code / Ticket ID
  doc.setFont("courier", "bold");
  doc.setFontSize(9.5);
  doc.setTextColor(255, 255, 255);
  doc.text(attendee.id, 185, 78, { align: 'center' });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.5);
  doc.setTextColor(148, 163, 184);
  doc.text("Scan at B2 MPH Entrance", 185, 83, { align: 'center' });
  doc.text("PAF-IAST Science Society", 185, 87, { align: 'center' });

  // Download PDF
  const cleanName = attendee.name.replace(/[^a-zA-Z0-9]/g, '_');
  doc.save(`PAFSS_Seminar_Ticket_${attendee.id}_${cleanName}.pdf`);
  return true;
}

// ===================================================================
// BATCH GMAIL DISPATCH & BULK TICKET EXPORT
// ===================================================================

function openBatchDispatchModal() {
  const approved = getApprovedCandidates();
  const countEl = document.getElementById('batch-count-ready');
  if (countEl) countEl.innerText = approved.length;

  const listContainer = document.getElementById('batch-candidates-list');
  if (listContainer) {
    if (approved.length === 0) {
      listContainer.innerHTML = '<div style="color: var(--text-muted); font-size: 0.82rem; text-align: center; padding: 24px;">No approved candidates found. Approve payments in the Candidates tab first.</div>';
    } else {
      listContainer.innerHTML = approved.map(a => {
        const univid = a.universityId || a.university_id || 'N/A';
        return `
          <div class="batch-candidate-row">
            <div>
              <strong style="color: var(--navy-dark);">${escapeHtml(a.name)}</strong>
              <span style="color: var(--text-muted); font-size: 0.76rem; margin-left: 6px;">(${escapeHtml(univid)})</span>
              <div style="font-size: 0.74rem; color: var(--navy-primary);">${escapeHtml(a.email)}</div>
            </div>
            <div style="display: flex; align-items: center; gap: 8px;">
              <code>${a.id}</code>
              <button class="btn-micro-action" onclick="openSingleGmailDispatch('${a.id}')" title="Send individual mail">✉️ Mail</button>
            </div>
          </div>
        `;
      }).join('');
    }
  }

  const modal = document.getElementById('batch-dispatch-modal');
  if (modal) modal.classList.add('open');
}

function closeBatchDispatchModal() {
  const modal = document.getElementById('batch-dispatch-modal');
  if (modal) modal.classList.remove('open');
}

function copyAllApprovedEmailsBCC() {
  const approved = getApprovedCandidates();
  if (approved.length === 0) {
    alert("No approved candidate emails found.");
    return;
  }

  const emails = approved.map(a => a.email).filter(Boolean).join(', ');
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(emails).then(() => {
      showTransientToast(`📋 Copied ${approved.length} approved emails to clipboard!`);
    }).catch(() => fallbackCopyText(emails));
  } else {
    fallbackCopyText(emails);
  }
}

function launchBatchGmailCompose() {
  const approved = getApprovedCandidates();
  if (approved.length === 0) {
    alert("No approved candidates available.");
    return;
  }

  const bccList = approved.map(a => a.email).filter(Boolean).join(',');
  const subject = `Official Entry Passes & Admission Guidelines - PAF-IAST Science Society 2-Day Seminar Series`;
  
  const body = `Dear Participants,

Congratulations! Your registrations and payments for the PAF-IAST Science Society 2-Day Seminar Series have been verified and approved.

Official Event & Venue Schedule:
-----------------------------------------------------------
• Venue: B2 MPH (Multipurpose Hall), Pak-Austria Fachhochschule: Institute of Applied Sciences and Technology (PAF-IAST), Mang, Haripur

• Day 1 (Wednesday, 4th Nov 2026 • 2:00 – 4:00 PM):
  "The Silent Pandemic: Antimicrobial Resistance and Its Global Health Implications"
  Speaker: Dr. Hamad Ali

• Day 2 (Thursday, 5th Nov 2026 • 2:00 – 4:00 PM):
  "Artificial Intelligence in Healthcare: Smart Medicine, Clinical Research & Biotechnology"
  Speaker: Dr. Shah Faisal

Gate Admission Instructions:
Please ensure you have your official seminar pass ready on your phone or printed. Each participant's individual pass will be scanned at the B2 MPH hall entrance.

We look forward to hosting you for two days of world-class scientific discussions and academic exploration!

Warm regards,
PAF-IAST Science Society Organizing Committee
Pak-Austria Fachhochschule: Institute of Applied Sciences and Technology (PAF-IAST)`;

  const gmailUrl = `https://mail.google.com/mail/?view=cm&fs=1&bcc=${encodeURIComponent(bccList)}&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  window.open(gmailUrl, '_blank');
  showTransientToast(`🚀 Gmail Compose launched with ${approved.length} approved candidates in BCC!`);
}

async function downloadAllApprovedTickets() {
  const approved = getApprovedCandidates();
  if (approved.length === 0) {
    alert("No approved candidates to download.");
    return;
  }

  showTransientToast(`Starting download of ${approved.length} ticket PDFs...`);

  for (let i = 0; i < approved.length; i++) {
    const candidate = approved[i];
    await generateAttendeeTicketPDF(candidate);
    showTransientToast(`Downloaded (${i + 1}/${approved.length}): ${candidate.name}`);
    if (i < approved.length - 1) {
      await new Promise(r => setTimeout(r, 400));
    }
  }

  showTransientToast(`✅ All ${approved.length} tickets downloaded successfully!`);
}

