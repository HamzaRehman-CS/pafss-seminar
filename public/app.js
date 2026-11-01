/**
 * PAF-IAST SCIENCE SOCIETY - 2-DAY SEMINAR REGISTRATION PORTAL
 * Theme: Pure White & Deep Navy Blue
 * Performance: Lightweight, Instantaneous, Zero-Lag
 */

let currentAttendee = null;
let currentReceiptData = null;

document.addEventListener('DOMContentLoaded', () => {
  // Close modals on Escape key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeRegisterModal();
      closeSuccessModal();
    }
  });

  // Close modal when clicking on backdrop
  const regModal = document.getElementById('register-modal');
  if (regModal) {
    regModal.addEventListener('click', (e) => {
      if (e.target === regModal) closeRegisterModal();
    });
  }

  const successModal = document.getElementById('success-modal');
  if (successModal) {
    successModal.addEventListener('click', (e) => {
      if (e.target === successModal) closeSuccessModal();
    });
  }
});

// Open Registration Modal
function openRegisterModal() {
  const modal = document.getElementById('register-modal');
  if (!modal) return;
  modal.classList.add('open');
  const nameInput = document.getElementById('form-name');
  if (nameInput) setTimeout(() => nameInput.focus(), 100);
}

// Close Registration Modal
function closeRegisterModal() {
  const modal = document.getElementById('register-modal');
  if (modal) modal.classList.remove('open');
}

// Open Success Confirmation Modal
function showRegistrationSuccess(attendee) {
  const modal = document.getElementById('success-modal');
  const refId = document.getElementById('success-ref-id');
  const goTicketsBtn = document.getElementById('success-go-tickets-btn');

  if (refId && attendee) {
    refId.innerText = attendee.id || 'PAFSS-26-XXX';
  }
  if (goTicketsBtn && attendee) {
    goTicketsBtn.href = `tickets.html?id=${encodeURIComponent(attendee.id)}`;
  }
  if (modal) modal.classList.add('open');
}

// Copy Registration ID to Clipboard
function copyRegistrationId() {
  const refId = document.getElementById('success-ref-id');
  if (!refId) return;
  const text = refId.innerText.trim();

  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(() => {
      showCopyFeedback();
    }).catch(() => fallbackCopy(text));
  } else {
    fallbackCopy(text);
  }
}

function showCopyFeedback() {
  const btn = document.getElementById('btn-copy-success-id');
  if (btn) {
    const origHtml = btn.innerHTML;
    btn.innerHTML = "✅ Copied!";
    btn.style.background = "#10B981";
    btn.style.color = "#FFFFFF";
    btn.style.borderColor = "#10B981";
    setTimeout(() => {
      btn.innerHTML = origHtml;
      btn.style.background = "#FFFFFF";
      btn.style.color = "var(--navy-primary)";
      btn.style.borderColor = "var(--border-navy)";
    }, 2000);
  }
}

function fallbackCopy(text) {
  const ta = document.createElement('textarea');
  ta.value = text;
  document.body.appendChild(ta);
  ta.select();
  document.execCommand('copy');
  document.body.removeChild(ta);
  showCopyFeedback();
}

// Copy Easypaisa Payment Number to Clipboard
function copyPaymentNumber() {
  const num = '03400099776';
  const btn = document.getElementById('btn-copy-acc-num');

  const showFeedback = () => {
    if (btn) {
      const origHtml = btn.innerHTML;
      btn.innerHTML = "✅ Copied!";
      btn.style.background = "#059669";
      btn.style.color = "#FFFFFF";
      btn.style.borderColor = "#059669";
      setTimeout(() => {
        btn.innerHTML = origHtml;
        btn.style.background = "#FFFFFF";
        btn.style.color = "#15803D";
        btn.style.borderColor = "#86EFAC";
      }, 2000);
    }
  };

  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(num).then(showFeedback).catch(() => {
      const ta = document.createElement('textarea');
      ta.value = num;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      showFeedback();
    });
  } else {
    const ta = document.createElement('textarea');
    ta.value = num;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    showFeedback();
  }
}

// Close Success Confirmation Modal
function closeSuccessModal() {
  const modal = document.getElementById('success-modal');
  if (modal) modal.classList.remove('open');
}

// Handle Receipt File Selection & Lightweight Canvas Compression (Up to 10MB)
function handleReceiptFileSelect(e) {
  const file = e.target.files && e.target.files[0];
  if (!file) return;

  if (file.size > 10 * 1024 * 1024) {
    alert("File size exceeds 10MB limit. Please upload a smaller screenshot.");
    e.target.value = "";
    return;
  }

  const reader = new FileReader();
  reader.onload = function(evt) {
    const rawData = evt.target.result;
    const img = new Image();
    img.onload = function() {
      // Scale down only if image is excessively large to keep upload instant
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
    alert("Please upload a clear screenshot or photo of your payment verification receipt to complete registration.");
    const dropzone = document.getElementById('payment-dropzone');
    if (dropzone) {
      dropzone.style.borderColor = '#DC2626';
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
        particleCount: 70,
        spread: 60,
        origin: { y: 0.6 }
      });
    }

    // Display Gmail delivery notice modal (No immediate ticket)
    showRegistrationSuccess(currentAttendee);

  } catch (err) {
    alert(err.message || 'Error occurred during registration');
  } finally {
    if (submitBtn) submitBtn.disabled = false;
    if (submitText) submitText.innerText = "Register & Upload Verification";
  }
}
