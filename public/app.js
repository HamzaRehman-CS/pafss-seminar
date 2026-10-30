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

// Generate High-Density Sharp QR Code (Pure Black #000000 on Pure White #FFFFFF)
function generateQrCode(text) {
  const container = document.getElementById('ticket-qr-holder');
  if (!container) return;
  container.innerHTML = '';

  const cleanText = String(text || '').trim().toUpperCase();

  if (window.QRCode) {
    try {
      new QRCode(container, {
        text: cleanText,
        width: 220,
        height: 220,
        colorDark: "#000000",
        colorLight: "#FFFFFF",
        correctLevel: QRCode.CorrectLevel.H
      });
      return;
    } catch (e) {
      console.warn('QRCode library error, using fallback:', e);
    }
  }

  // High-contrast clean canvas fallback
  const canvas = document.createElement('canvas');
  canvas.width = 200;
  canvas.height = 200;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, 200, 200);
  ctx.fillStyle = '#000000';
  ctx.font = 'bold 15px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('ENTRY PASS', 100, 80);
  ctx.font = 'bold 16px monospace';
  ctx.fillText(cleanText, 100, 115);
  ctx.lineWidth = 4;
  ctx.strokeStyle = '#000000';
  ctx.strokeRect(10, 10, 180, 180);
  container.appendChild(canvas);
}

// Print Pass
function printTicketPass() {
  window.print();
}

// Download High-Resolution PDF Ticket (Exact Visual Clone of Screen Ticket, Never Cut Off)
async function downloadTicketPDF() {
  if (!currentAttendee) return;

  const attendee = currentAttendee;
  const passCode = attendee.id;
  const ticketElement = document.getElementById('active-vibrant-ticket');
  if (!ticketElement) return;

  // Visual button feedback
  const downloadBtn = document.querySelector('.ticket-actions-row button:first-child');
  const originalBtnHtml = downloadBtn ? downloadBtn.innerHTML : '';
  if (downloadBtn) {
    downloadBtn.disabled = true;
    downloadBtn.innerHTML = `
      <span class="glass-icon-wrapper">⏳</span>
      <span>Generating PDF Ticket...</span>
    `;
  }

  // Off-screen rendering wrapper to guarantee perfect unclipped desktop proportions
  let offscreenWrapper = null;

  try {
    // 1. Ensure all original images (logos & QR) are completely loaded
    const origImgs = ticketElement.querySelectorAll('img');
    await Promise.all(Array.from(origImgs).map(img => {
      if (img.complete) return Promise.resolve();
      return new Promise(res => { img.onload = img.onerror = res; });
    }));

    // Brief delay to ensure QR canvas is painted
    await new Promise(r => setTimeout(r, 120));

    if (window.html2canvas) {
      // Create off-screen sandbox of fixed width 780px so PDF is always identical regardless of device/screen width
      offscreenWrapper = document.createElement('div');
      offscreenWrapper.style.position = 'fixed';
      offscreenWrapper.style.left = '-9999px';
      offscreenWrapper.style.top = '0';
      offscreenWrapper.style.width = '780px';
      offscreenWrapper.style.zIndex = '-9999';
      offscreenWrapper.style.opacity = '0';
      offscreenWrapper.style.pointerEvents = 'none';

      const clone = ticketElement.cloneNode(true);
      clone.style.width = '780px';
      clone.style.maxWidth = '780px';
      clone.style.minWidth = '780px';
      clone.style.margin = '0';
      clone.style.display = 'block';

      // Copy any canvas data from original to clone (especially the QR code)
      const origCanvases = ticketElement.querySelectorAll('canvas');
      const cloneCanvases = clone.querySelectorAll('canvas');
      for (let i = 0; i < origCanvases.length; i++) {
        if (cloneCanvases[i]) {
          cloneCanvases[i].width = origCanvases[i].width;
          cloneCanvases[i].height = origCanvases[i].height;
          const ctx = cloneCanvases[i].getContext('2d');
          ctx.drawImage(origCanvases[i], 0, 0);
        }
      }

      offscreenWrapper.appendChild(clone);
      document.body.appendChild(offscreenWrapper);

      // Wait for clone images to be ready
      const cloneImgs = clone.querySelectorAll('img');
      await Promise.all(Array.from(cloneImgs).map(img => {
        if (img.complete) return Promise.resolve();
        return new Promise(res => { img.onload = img.onerror = res; });
      }));

      // 2. High-resolution raster capture of the EXACT card shown on screen
      const canvas = await window.html2canvas(clone, {
        scale: 3, // 3x High-DPI for crisp typography & 100% scannable QR
        useCORS: true,
        allowTaint: true,
        backgroundColor: null,
        logging: false,
        width: 780,
        windowWidth: 1200
      });

      const imgData = canvas.toDataURL('image/png', 1.0);
      const { jsPDF } = window.jspdf || window;

      if (!jsPDF) {
        throw new Error("jsPDF not loaded");
      }

      // Proportional dimensions for clean ticket format with margins
      const canvasWidth = canvas.width;
      const canvasHeight = canvas.height;
      const ticketMmWidth = 210;
      const ticketMmHeight = (canvasHeight * ticketMmWidth) / canvasWidth;

      const pageMargin = 12;
      const pageWidth = ticketMmWidth + (pageMargin * 2);
      const pageHeight = ticketMmHeight + (pageMargin * 2);

      const doc = new jsPDF({
        orientation: 'landscape',
        unit: 'mm',
        format: [pageWidth, pageHeight]
      });

      // Ambient background matching the clean portal
      doc.setFillColor(248, 250, 252);
      doc.rect(0, 0, pageWidth, pageHeight, 'F');

      // Place exact visual clone of ticket centered with clean margins
      doc.addImage(imgData, 'PNG', pageMargin, pageMargin, ticketMmWidth, ticketMmHeight, undefined, 'FAST');

      doc.save(`PAFSS_Seminar_Pass_${passCode}.pdf`);
      return;
    }

    // Direct jsPDF Fallback
    await generateDirectPdfFallback(attendee);

  } catch (err) {
    console.warn("html2canvas PDF generation failed, using direct jsPDF fallback:", err);
    try {
      await generateDirectPdfFallback(attendee);
    } catch (fallbackErr) {
      console.error("Direct PDF fallback error:", fallbackErr);
      window.print();
    }
  } finally {
    if (offscreenWrapper && offscreenWrapper.parentNode) {
      offscreenWrapper.parentNode.removeChild(offscreenWrapper);
    }
    if (downloadBtn) {
      downloadBtn.disabled = false;
      downloadBtn.innerHTML = originalBtnHtml;
    }
  }
}

// Direct jsPDF Fallback with Solid White Quiet Zone for QR Code
async function generateDirectPdfFallback(attendee) {
  const { jsPDF } = window.jspdf || window;
  if (!jsPDF) throw new Error("jsPDF not available");

  const isSeminar2 = (attendee.seminar === 'seminar2');
  const passTitle = isSeminar2
    ? "Artificial Intelligence in Healthcare: Smart Medicine, Research & Business"
    : "The Silent Pandemic: Antimicrobial Resistance & Global Health";

  const speakerName = isSeminar2 ? "Dr. Shah Faisal" : "Dr. Hamad Ali";
  const dateText = isSeminar2 ? "Thursday, 5th November 2026" : "Wednesday, 4th November 2026";
  const passCode = attendee.id;
  const univId = attendee.universityId || attendee.university_id || 'N/A';

  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: [220, 105]
  });

  // Background matching the on-screen ticket theme
  if (isSeminar2) {
    doc.setFillColor(17, 20, 32);
    doc.rect(0, 0, 220, 105, 'F');
    doc.setDrawColor(249, 115, 22);
  } else {
    doc.setFillColor(9, 19, 34);
    doc.rect(0, 0, 220, 105, 'F');
    doc.setDrawColor(14, 165, 233);
  }

  doc.setLineWidth(1.2);
  doc.roundedRect(6, 6, 208, 93, 3, 3, 'S');

  // Header Strip
  doc.setFillColor(255, 255, 255);
  doc.rect(6, 6, 208, 14, 'F');

  doc.setTextColor(15, 23, 42);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10.5);
  doc.text("PAF-IAST SCIENCE SOCIETY  •  OFFICIAL ENTRY PASS", 12, 16);

  doc.setFontSize(8.5);
  doc.setTextColor(isSeminar2 ? 234 : 2, isSeminar2 ? 88 : 132, isSeminar2 ? 12 : 199);
  doc.text(isSeminar2 ? "DAY 2: AI IN HEALTHCARE" : "DAY 1: ANTIMICROBIAL RESISTANCE", 208, 16, { align: 'right' });

  // Main Left Column: Event details
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  const splitTitle = doc.splitTextToSize(passTitle, 134);
  doc.text(splitTitle, 12, 29);

  doc.setFontSize(9);
  doc.setTextColor(249, 115, 22);
  doc.text(`Speaker: ${speakerName}`, 12, 38);

  // Attendee Info Box
  doc.setFillColor(26, 36, 56);
  doc.setDrawColor(51, 65, 85);
  doc.roundedRect(12, 42, 134, 48, 2, 2, 'FD');

  doc.setFontSize(7);
  doc.setTextColor(148, 163, 184);
  doc.setFont("helvetica", "bold");
  doc.text("ATTENDEE NAME", 16, 49);
  doc.text("UNIVERSITY ID", 78, 49);
  doc.text("DATE & TIMING", 16, 62);
  doc.text("OFFICIAL VENUE", 78, 62);
  doc.text("PHONE NUMBER", 16, 75);
  doc.text("PERSONAL GMAIL", 78, 75);

  doc.setFontSize(8.5);
  doc.setTextColor(255, 255, 255);
  doc.text(attendee.name.substring(0, 30), 16, 55);
  doc.text(univId, 78, 55);
  doc.text(`${dateText.split(' ')[0]} ${dateText.split(' ')[1]} • 2:00-4:00 PM`, 16, 68);
  doc.text("B2 MPH (Multipurpose Hall)", 78, 68);
  doc.text(attendee.phone, 16, 81);
  doc.text(attendee.email.substring(0, 28), 78, 81);

  // Perforation line
  doc.setDrawColor(100, 116, 139);
  doc.setLineDashPattern([2, 2], 0);
  doc.line(154, 24, 154, 95);
  doc.setLineDashPattern([], 0);

  // Right Stub: Pure White Frame for QR Code (CRITICAL for instant scanability)
  const qrCanvas = document.querySelector('#ticket-qr-holder canvas') || document.querySelector('#ticket-qr-holder img');
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(162, 24, 46, 46, 3, 3, 'F');

  if (qrCanvas) {
    let imgData = qrCanvas.toDataURL ? qrCanvas.toDataURL("image/png") : qrCanvas.src;
    doc.addImage(imgData, 'PNG', 165, 27, 40, 40);
  }

  doc.setFont("courier", "bold");
  doc.setFontSize(10);
  doc.setTextColor(255, 255, 255);
  doc.text(passCode, 185, 76, { align: 'center' });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(148, 163, 184);
  doc.text("Scan at B2 MPH Entrance", 185, 82, { align: 'center' });
  doc.text("PAF-IAST Science Society", 185, 88, { align: 'center' });

  doc.save(`PAFSS_Seminar_Ticket_${passCode}.pdf`);
}
