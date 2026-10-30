/**
 * PAF-IAST SCIENCE FESTA 2026 - OFFICIAL SEMINAR APPLICATION
 * Only Two Events:
 *  - Seminar 1: Wednesday, 4th November | 2:00 to 4:00 PM | B2 MPH (Dr. Hamad Ali)
 *  - Seminar 2: Thursday, 5th November | 2:00 to 4:00 PM | B2 MPH (Dr. Shah Faisal)
 * Venue: B2 MPH
 */

// Application State
let appStats = {
  seminar1: { registered: 0 },
  seminar2: { registered: 0 },
  totalAttendees: 0,
  checkedInCount: 0
};

let currentAttendee = null;

// ===================================================================
// INITIALIZATION
// ===================================================================
document.addEventListener('DOMContentLoaded', () => {
  fetchStats();
  updateChoiceSelection();
});

// Fetch Live Statistics
async function fetchStats() {
  try {
    const res = await fetch('/api/stats');
    if (!res.ok) throw new Error('Failed to load stats');
    appStats = await res.json();
  } catch (err) {
    console.warn('Could not fetch stats:', err);
  }
}

// ===================================================================
// REGISTRATION MODAL LOGIC
// ===================================================================
function openRegisterModal(preselectSeminar) {
  const modal = document.getElementById('register-modal');
  if (!modal) return;

  if (preselectSeminar === 'seminar1') {
    const opt = document.getElementById('opt-choice-sem1');
    if (opt) opt.checked = true;
  } else if (preselectSeminar === 'seminar2') {
    const opt = document.getElementById('opt-choice-sem2');
    if (opt) opt.checked = true;
  }
  updateChoiceSelection();

  modal.classList.add('open');

  setTimeout(() => {
    const nameInput = document.getElementById('form-name');
    if (nameInput) nameInput.focus();
  }, 100);
}

function closeRegisterModal() {
  const modal = document.getElementById('register-modal');
  if (modal) modal.classList.remove('open');
}

function updateChoiceSelection() {
  const choices = document.querySelectorAll('input[name="seminar-choice"]');
  choices.forEach(radio => {
    const card = radio.closest('.event-choice-radio-card');
    if (card) {
      if (radio.checked) {
        card.classList.add('selected');
      } else {
        card.classList.remove('selected');
      }
    }
  });
}

// Handle Form Submission
async function handleRegistrationSubmit(e) {
  e.preventDefault();

  const name = document.getElementById('form-name').value.trim();
  const universityId = document.getElementById('form-univ-id').value.trim();
  const phone = document.getElementById('form-phone').value.trim();
  const email = document.getElementById('form-email').value.trim();

  const selectedRadio = document.querySelector('input[name="seminar-choice"]:checked');
  const seminar = selectedRadio ? selectedRadio.value : 'seminar1';

  const submitBtn = document.getElementById('btn-submit-reg');
  const submitText = document.getElementById('submit-btn-text');

  if (submitBtn) submitBtn.disabled = true;
  if (submitText) submitText.innerText = "Generating Official Pass...";

  try {
    const res = await fetch('/api/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, universityId, phone, email, seminar })
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Registration failed');
    }

    currentAttendee = data.attendee;

    // Reset Form
    document.getElementById('registration-form').reset();
    closeRegisterModal();

    // Trigger celebration confetti
    if (window.confetti) {
      window.confetti({
        particleCount: 90,
        spread: 75,
        origin: { y: 0.6 }
      });
    }

    // Render and open ticket
    renderTicketData(currentAttendee);
    openTicketModal();
    fetchStats();

  } catch (err) {
    alert(err.message || 'Error occurred during registration');
  } finally {
    if (submitBtn) submitBtn.disabled = false;
    if (submitText) submitText.innerText = "Confirm Registration & Generate Ticket";
  }
}

// ===================================================================
// TICKET MODAL & RENDERING
// ===================================================================
function openTicketModal() {
  const modal = document.getElementById('ticket-modal');
  if (!modal) return;
  modal.classList.add('open');
}

function closeTicketModal() {
  const modal = document.getElementById('ticket-modal');
  if (modal) modal.classList.remove('open');
}

function renderTicketData(attendee) {
  if (!attendee) return;

  const isSeminar2 = (attendee.seminar === 'seminar2');

  // Ticket Card Theme
  const ticketCard = document.getElementById('active-vibrant-ticket');
  const badgePill = document.getElementById('ticket-badge-pill');
  const topicTitle = document.getElementById('t-pass-topic');
  const speakerTag = document.getElementById('t-pass-speaker');
  const dtTag = document.getElementById('t-pass-datetime');

  // Attendee Info
  const nameVal = document.getElementById('t-pass-name');
  const unividVal = document.getElementById('t-pass-univid');
  const phoneVal = document.getElementById('t-pass-phone');
  const emailVal = document.getElementById('t-pass-email');
  const codeVal = document.getElementById('t-pass-code');

  if (nameVal) nameVal.innerText = attendee.name;
  if (unividVal) unividVal.innerText = attendee.universityId || attendee.university_id;
  if (phoneVal) phoneVal.innerText = attendee.phone;
  if (emailVal) emailVal.innerText = attendee.email;
  if (codeVal) codeVal.innerText = attendee.id;

  if (isSeminar2) {
    if (ticketCard) ticketCard.className = 'vibrant-ticket-card ticket-aih-theme';
    if (badgePill) {
      badgePill.className = 't-badge-type badge-aih-pill';
      badgePill.innerText = 'SEMINAR 2 PASS';
    }
    if (topicTitle) topicTitle.innerText = 'Artificial Intelligence in Healthcare: Opportunities, Challenges, and the Future of Smart Medicine in Research, Practice, and Business';
    if (speakerTag) speakerTag.innerText = 'Speaker: Dr. Shah Faisal';
    if (dtTag) dtTag.innerText = 'Thursday, 5th Nov • 2:00 – 4:00 PM';
  } else {
    if (ticketCard) ticketCard.className = 'vibrant-ticket-card ticket-amr-theme';
    if (badgePill) {
      badgePill.className = 't-badge-type badge-amr-pill';
      badgePill.innerText = 'SEMINAR 1 PASS';
    }
    if (topicTitle) topicTitle.innerText = 'The Silent Pandemic: Antimicrobial Resistance and Its Global Health Implications';
    if (speakerTag) speakerTag.innerText = 'Speaker: Dr. Hamad Ali';
    if (dtTag) dtTag.innerText = 'Wednesday, 4th Nov • 2:00 – 4:00 PM';
  }

  // Generate sharp QR Code
  generateQrCode(attendee.id);
}

// Generate QR Code with Fallback
function generateQrCode(text) {
  const container = document.getElementById('ticket-qr-holder');
  if (!container) return;
  container.innerHTML = '';

  if (window.QRCode) {
    try {
      new QRCode(container, {
        text: text,
        width: 120,
        height: 120,
        colorDark: "#0F172A",
        colorLight: "#FFFFFF",
        correctLevel: QRCode.CorrectLevel.H
      });
      return;
    } catch (e) {
      console.warn('QRCode library error, using fallback:', e);
    }
  }

  // Canvas Fallback
  const canvas = document.createElement('canvas');
  canvas.width = 120;
  canvas.height = 120;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, 120, 120);
  ctx.fillStyle = '#0F172A';
  ctx.font = 'bold 11px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('PASS QR', 60, 45);
  ctx.font = '10px monospace';
  ctx.fillText(text, 60, 75);
  ctx.strokeRect(6, 6, 108, 108);
  container.appendChild(canvas);
}

// Print Pass
function printTicketPass() {
  window.print();
}

// Download High-Resolution PDF Ticket
async function downloadTicketPDF() {
  if (!currentAttendee) return;

  const attendee = currentAttendee;
  const isSeminar2 = (attendee.seminar === 'seminar2');

  const passTitle = isSeminar2
    ? "Artificial Intelligence in Healthcare: Smart Medicine, Research & Business"
    : "The Silent Pandemic: Antimicrobial Resistance & Global Health";

  const speakerName = isSeminar2 ? "Dr. Shah Faisal" : "Dr. Hamad Ali";
  const dateText = isSeminar2 ? "Thursday, 5th November 2026" : "Wednesday, 4th November 2026";
  const passCode = attendee.id;
  const univId = attendee.universityId || attendee.university_id || 'N/A';

  try {
    const { jsPDF } = window.jspdf || {};
    if (!jsPDF) {
      alert("PDF generator is initializing. You can use 'Print Pass'.");
      return;
    }

    const doc = new jsPDF({
      orientation: 'landscape',
      unit: 'mm',
      format: [210, 95]
    });

    // Dark sleek VIP background
    doc.setFillColor(15, 23, 42);
    doc.rect(0, 0, 210, 95, 'F');

    // Outer border
    if (isSeminar2) {
      doc.setDrawColor(249, 115, 22);
    } else {
      doc.setDrawColor(14, 165, 233);
    }
    doc.setLineWidth(1.2);
    doc.roundedRect(6, 6, 198, 83, 3, 3, 'S');

    // Header Strip
    doc.setFillColor(255, 255, 255);
    doc.rect(6, 6, 198, 14, 'F');

    doc.setTextColor(15, 23, 42);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10.5);
    doc.text("PAF-IAST SCIENCE SOCIETY  •  OFFICIAL ENTRY PASS", 12, 16);

    doc.setFontSize(8.5);
    doc.setTextColor(isSeminar2 ? 234 : 2, isSeminar2 ? 88 : 132, isSeminar2 ? 12 : 199);
    doc.text(isSeminar2 ? "DAY 2: AI IN HEALTHCARE" : "DAY 1: ANTIMICROBIAL RESISTANCE", 198, 16, { align: 'right' });

    // Main Left Column: Event details
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(11.5);
    doc.setFont("helvetica", "bold");
    const splitTitle = doc.splitTextToSize(passTitle, 130);
    doc.text(splitTitle, 12, 30);

    doc.setFontSize(9.5);
    doc.setTextColor(249, 115, 22);
    doc.text(`Speaker: ${speakerName}`, 12, 38);

    // Attendee Info Box
    doc.setFillColor(26, 36, 56);
    doc.setDrawColor(51, 65, 85);
    doc.roundedRect(12, 42, 132, 40, 2, 2, 'FD');

    doc.setFontSize(7);
    doc.setTextColor(148, 163, 184);
    doc.setFont("helvetica", "bold");
    doc.text("ATTENDEE NAME", 16, 48);
    doc.text("UNIVERSITY ID", 78, 48);
    doc.text("DATE & TIMING", 16, 60);
    doc.text("OFFICIAL VENUE", 78, 60);
    doc.text("PHONE NUMBER", 16, 72);
    doc.text("PERSONAL GMAIL", 78, 72);

    doc.setFontSize(8.5);
    doc.setTextColor(255, 255, 255);
    doc.text(attendee.name.substring(0, 30), 16, 53);
    doc.text(univId, 78, 53);
    doc.text(`${dateText.split(' ')[0]} ${dateText.split(' ')[1]} • 2:00-4:00 PM`, 16, 65);
    doc.text("B2 MPH (Multipurpose Hall)", 78, 65);
    doc.text(attendee.phone, 16, 77);
    doc.text(attendee.email.substring(0, 28), 78, 77);

    // Perforation line
    doc.setDrawColor(100, 116, 139);
    doc.setLineDashPattern([2, 2], 0);
    doc.line(152, 24, 152, 89);
    doc.setLineDashPattern([], 0);

    // Right Stub: QR Code & ID
    const qrCanvas = document.querySelector('#ticket-qr-holder canvas') || document.querySelector('#ticket-qr-holder img');
    if (qrCanvas) {
      let imgData = qrCanvas.toDataURL ? qrCanvas.toDataURL("image/png") : qrCanvas.src;
      doc.addImage(imgData, 'PNG', 160, 26, 38, 38);
    } else {
      doc.rect(160, 26, 38, 38, 'S');
      doc.text("QR PASS", 179, 45, { align: "center" });
    }

    doc.setFont("courier", "bold");
    doc.setFontSize(10);
    doc.setTextColor(255, 255, 255);
    doc.text(passCode, 179, 70, { align: 'center' });

    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(148, 163, 184);
    doc.text("Scan at B2 MPH Entrance", 179, 76, { align: 'center' });
    doc.text("PAF-IAST Science Society", 179, 82, { align: 'center' });

    doc.save(`PAFSS_Seminar_Ticket_${passCode}.pdf`);

  } catch (e) {
    console.error("PDF generation failed:", e);
    alert("Could not generate PDF directly. You can use 'Print Pass'.");
  }
}
