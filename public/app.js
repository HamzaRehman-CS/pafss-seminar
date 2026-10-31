/**
 * PAF-IAST SCIENCE FESTA 2026 - OFFICIAL 2-DAY SEMINAR APPLICATION
 * Dates: 4th & 5th November 2026 | 2:00 to 4:00 PM (Both Days)
 * Venue: B2 MPH (Multipurpose Hall)
 * Fee: 300 PKR (Covers Both Keynote Seminars)
 * Keynote Speakers:
 *   - Day 1 (Nov 4): Dr. Hamad Ali (Antimicrobial Resistance)
 *   - Day 2 (Nov 5): Dr. Shah Faisal (AI in Healthcare)
 */

// Application State
let appStats = {
  totalAttendees: 0,
  verifiedCount: 0,
  pendingCount: 0,
  checkedInCount: 0,
  totalRevenue: "0 PKR"
};

let currentAttendee = null;
let currentReceiptData = null;

// ===================================================================
// INITIALIZATION
// ===================================================================
document.addEventListener('DOMContentLoaded', () => {
  fetchStats();
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
function openRegisterModal() {
  const modal = document.getElementById('register-modal');
  if (!modal) return;

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

// Handle Payment Receipt Image Selection & Client-Side Canvas Compression (Up to 10MB)
function handleReceiptFileSelect(e) {
  const file = e.target.files && e.target.files[0];
  if (!file) return;

  // Verify file is an image
  if (!file.type.startsWith('image/')) {
    alert("Please select a valid image file (JPG, PNG, WEBP, or HEIC).");
    e.target.value = '';
    return;
  }

  // 10MB limit check
  const maxBytes = 10 * 1024 * 1024;
  if (file.size > maxBytes) {
    alert("File is larger than 10MB. Please choose a screenshot or photo under 10MB.");
    e.target.value = '';
    return;
  }

  const reader = new FileReader();
  reader.onload = function(evt) {
    const rawData = evt.target.result;
    const img = new Image();
    img.onload = function() {
      // Crisp optimization: scale down only if photo exceeds 1400px
      const canvas = document.createElement('canvas');
      let w = img.width;
      let h = img.height;
      const maxDim = 1400;

      if (w > maxDim || h > maxDim) {
        if (w > h) {
          h = Math.round((h * maxDim) / w);
          w = maxDim;
        } else {
          w = Math.round((w * maxDim) / h);
          h = maxDim;
        }
      }

      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, w, h);

      // Produce crisp, lightweight JPEG (~180KB - 300KB)
      currentReceiptData = canvas.toDataURL('image/jpeg', 0.88);

      // Update UI preview
      const idleState = document.getElementById('upload-idle-state');
      const prev = document.getElementById('upload-preview-state');
      const previewImg = document.getElementById('receipt-preview-img');
      const nameTag = document.getElementById('receipt-file-name');
      const sizeTag = document.getElementById('receipt-file-size');

      if (idleState) idleState.style.display = 'none';
      if (prev) prev.style.display = 'flex';
      if (previewImg) previewImg.src = currentReceiptData;
      if (nameTag) nameTag.innerText = file.name;
      if (sizeTag) sizeTag.innerText = `${(file.size / (1024 * 1024)).toFixed(2)} MB (Ready)`;
    };
    img.src = rawData;
  };
  reader.readAsDataURL(file);
}

// Handle Form Submission
async function handleRegistrationSubmit(e) {
  e.preventDefault();

  const name = document.getElementById('form-name').value.trim();
  const universityId = document.getElementById('form-univ-id').value.trim();
  const phone = document.getElementById('form-phone').value.trim();
  const email = document.getElementById('form-email').value.trim();

  // Enforce payment receipt upload
  if (!currentReceiptData) {
    alert("Please upload a screenshot or photo of your 300 PKR payment verification to complete registration.");
    const dropzone = document.getElementById('payment-dropzone');
    if (dropzone) {
      dropzone.style.borderColor = '#EF4444';
      dropzone.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    return;
  }

  const submitBtn = document.getElementById('btn-submit-reg');
  const submitText = document.getElementById('submit-btn-text');

  if (submitBtn) submitBtn.disabled = true;
  if (submitText) submitText.innerText = "Submitting Registration & Proof...";

  try {
    const res = await fetch('/api/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        name, 
        universityId, 
        phone, 
        email, 
        paymentReceipt: currentReceiptData 
      })
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Registration failed');
    }

    currentAttendee = data.attendee;

    // Reset Form & upload dropzone
    document.getElementById('registration-form').reset();
    currentReceiptData = null;
    const idleState = document.getElementById('upload-idle-state');
    const prev = document.getElementById('upload-preview-state');
    if (idleState) idleState.style.display = 'flex';
    if (prev) prev.style.display = 'none';

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
    if (submitText) submitText.innerText = "Register & Upload Verification (300 PKR)";
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

  // Ticket Card Theme
  const ticketCard = document.getElementById('active-vibrant-ticket');
  const badgePill = document.getElementById('ticket-badge-pill');
  const topicTitle = document.getElementById('t-pass-topic');
  const speakerTag = document.getElementById('t-pass-speaker');
  const dtTag = document.getElementById('t-pass-datetime');

  // Attendee Info
  const nameVal = document.getElementById('t-pass-name');
  const unividVal = document.getElementById('t-pass-univid');
  const paymentVal = document.getElementById('t-pass-payment');
  const contactVal = document.getElementById('t-pass-contact');
  const codeVal = document.getElementById('t-pass-code');

  if (ticketCard) ticketCard.className = 'vibrant-ticket-card ticket-unified-theme';
  if (badgePill) {
    badgePill.className = 't-badge-type badge-unified-pill';
    badgePill.innerText = '2-DAY PASS • 300 PKR';
  }

  if (topicTitle) topicTitle.innerText = '2-Day Scientific & Smart Health AI Seminar Series';
  if (speakerTag) speakerTag.innerText = 'Speakers: Dr. Hamad Ali (Nov 4) & Dr. Shah Faisal (Nov 5)';
  if (dtTag) dtTag.innerText = 'Wed 4th & Thu 5th Nov • 2:00 – 4:00 PM';

  if (nameVal) nameVal.innerText = attendee.name;
  if (unividVal) unividVal.innerText = attendee.universityId || attendee.university_id;
  if (contactVal) contactVal.innerText = `${attendee.phone} • ${attendee.email}`;
  if (codeVal) codeVal.innerText = attendee.id;

  // Payment Status Display
  if (paymentVal) {
    const isVerified = (attendee.paymentStatus === 'verified' || attendee.payment_status === 'verified');
    if (isVerified) {
      paymentVal.innerHTML = `<span style="color: #34D399; font-weight: 800;">300 PKR (Verified ✅)</span>`;
    } else {
      paymentVal.innerHTML = `<span style="color: #F87171; font-weight: 800;">300 PKR (Pending Verification ⚠️)</span>`;
    }
  }

  // Generate sharp QR Code for unique ticket pass
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

      doc.save(`PAFSS_2Day_Seminar_Pass_${passCode}.pdf`);
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

  const passTitle = "2-Day Scientific & Health AI Seminar Series";
  const speakers = "Dr. Hamad Ali (AMR) & Dr. Shah Faisal (AI Health)";
  const dateText = "Wed 4th & Thu 5th November 2026 • 2:00 – 4:00 PM";
  const passCode = attendee.id;
  const univId = attendee.universityId || attendee.university_id || 'N/A';

  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: [220, 110]
  });

  // Dark Royal Blue Ticket Gradient
  doc.setFillColor(11, 20, 36);
  doc.rect(0, 0, 220, 110, 'F');
  doc.setDrawColor(14, 165, 233);
  doc.setLineWidth(1.2);
  doc.roundedRect(6, 6, 208, 98, 3, 3, 'S');

  // Header Strip
  doc.setFillColor(255, 255, 255);
  doc.rect(6, 6, 208, 14, 'F');

  doc.setTextColor(15, 23, 42);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10.5);
  doc.text("PAF-IAST SCIENCE SOCIETY  •  OFFICIAL 2-DAY ENTRY PASS", 12, 16);

  doc.setFontSize(8.5);
  doc.setTextColor(249, 115, 22);
  doc.text("FEE: 300 PKR (BOTH DAYS)", 208, 16, { align: 'right' });

  // Main Left Column: Event details
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  const splitTitle = doc.splitTextToSize(passTitle, 134);
  doc.text(splitTitle, 12, 29);

  doc.setFontSize(8.5);
  doc.setTextColor(249, 115, 22);
  doc.text(speakers, 12, 38);

  // Attendee Info Box
  doc.setFillColor(26, 36, 56);
  doc.setDrawColor(51, 65, 85);
  doc.roundedRect(12, 43, 134, 48, 2, 2, 'FD');

  doc.setFontSize(7);
  doc.setTextColor(148, 163, 184);
  doc.setFont("helvetica", "bold");
  doc.text("ATTENDEE NAME", 16, 50);
  doc.text("UNIVERSITY ID", 78, 50);
  doc.text("DATES & TIMING", 16, 63);
  doc.text("OFFICIAL VENUE", 78, 63);
  doc.text("PAYMENT STATUS", 16, 76);
  doc.text("CONTACT GMAIL", 78, 76);

  doc.setFontSize(8.5);
  doc.setTextColor(255, 255, 255);
  doc.text(attendee.name.substring(0, 30), 16, 56);
  doc.text(univId, 78, 56);
  doc.text("Nov 4 & 5 • 2:00-4:00 PM", 16, 69);
  doc.text("B2 MPH (Multipurpose Hall)", 78, 69);

  const isVerified = (attendee.paymentStatus === 'verified' || attendee.payment_status === 'verified');
  doc.setTextColor(isVerified ? 52 : 248, isVerified ? 211 : 113, isVerified ? 153 : 113);
  doc.text(isVerified ? "300 PKR (Verified)" : "300 PKR (Pending)", 16, 82);

  doc.setTextColor(255, 255, 255);
  doc.text(attendee.email.substring(0, 28), 78, 82);

  // Perforation line
  doc.setDrawColor(100, 116, 139);
  doc.setLineDashPattern([2, 2], 0);
  doc.line(154, 24, 154, 98);
  doc.setLineDashPattern([], 0);

  // Right Stub: QR Code
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
  doc.text(passCode, 185, 78, { align: 'center' });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(148, 163, 184);
  doc.text("Scan at B2 MPH Entrance", 185, 84, { align: 'center' });
  doc.text("PAF-IAST Science Society", 185, 90, { align: 'center' });

  doc.save(`PAFSS_2Day_Seminar_Ticket_${passCode}.pdf`);
}
