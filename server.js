const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
// 20MB limit allows high-res phone camera receipts (up to 10MB) to be received seamlessly
app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ limit: '20mb', extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Uploads directory for static receipt files
const UPLOADS_DIR = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// Dedicated Admin Route: /admin serves admin.html directly
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// Dedicated Tickets Route: /tickets serves tickets.html directly
app.get('/tickets', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'tickets.html'));
});

// Neon Cloud PostgreSQL Connection
const NEON_CONNECTION_STRING = process.env.DATABASE_URL || 
  'postgresql://neondb_owner:npg_Nm7ERXpOnG9t@ep-small-recipe-b4becr5v-pooler.c-6.us-east-2.aws.neon.tech/neondb?sslmode=require';

const pool = new Pool({
  connectionString: NEON_CONNECTION_STRING,
  ssl: { rejectUnauthorized: false }
});

// Local file cache paths (for offline resilience and instant validation)
const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'attendees.json');
const SCAN_HISTORY_FILE = path.join(DATA_DIR, 'scan_history.json');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Local cache helper functions
function readLocalAttendees() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const raw = fs.readFileSync(DATA_FILE, 'utf8');
      return JSON.parse(raw);
    }
  } catch (e) {
    console.warn('Could not read local attendees file:', e);
  }
  return [];
}

function writeLocalAttendees(list) {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(list, null, 2));
  } catch (e) {
    console.warn('Could not write local attendees file:', e);
  }
}

function readLocalScanHistory() {
  try {
    if (fs.existsSync(SCAN_HISTORY_FILE)) {
      const raw = fs.readFileSync(SCAN_HISTORY_FILE, 'utf8');
      return JSON.parse(raw);
    }
  } catch (e) {
    console.warn('Could not read local scan history file:', e);
  }
  return [];
}

function writeLocalScanHistory(list) {
  try {
    fs.writeFileSync(SCAN_HISTORY_FILE, JSON.stringify(list, null, 2));
  } catch (e) {
    console.warn('Could not write local scan history file:', e);
  }
}

// Helper: Save Base64 image to server uploads directory
function saveReceiptImage(base64Data, attendeeId) {
  if (!base64Data || typeof base64Data !== 'string') return null;

  try {
    const matches = base64Data.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
    let extension = 'jpg';
    let buffer;

    if (matches && matches.length === 3) {
      const mime = matches[1].toLowerCase();
      if (mime.includes('png')) extension = 'png';
      else if (mime.includes('webp')) extension = 'webp';
      else if (mime.includes('gif')) extension = 'gif';
      buffer = Buffer.from(matches[2], 'base64');
    } else {
      buffer = Buffer.from(base64Data, 'base64');
    }

    const filename = `receipt_${attendeeId}_${Date.now()}.${extension}`;
    const filePath = path.join(UPLOADS_DIR, filename);
    fs.writeFileSync(filePath, buffer);
    return `/uploads/${filename}`;
  } catch (err) {
    console.warn("Could not save receipt image to disk:", err.message);
    return null;
  }
}

// Map PostgreSQL row to client attendee object
function mapAttendee(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    universityId: row.university_id,
    university_id: row.university_id,
    phone: row.phone,
    email: row.email,
    seminar: row.seminar || 'unified26',
    seminarTitle: row.seminar_title,
    seminar_title: row.seminar_title,
    speaker: row.speaker,
    date: row.date,
    time: row.time,
    venue: row.venue,
    seatNumber: row.seat_number,
    seat_number: row.seat_number,
    ticketHash: row.ticket_hash,
    ticket_hash: row.ticket_hash,
    registeredAt: row.registered_at,
    registered_at: row.registered_at,
    checkedIn: Boolean(row.checked_in),
    checked_in: Boolean(row.checked_in),
    checkedInAt: row.checked_in_at,
    checked_in_at: row.checked_in_at,
    scanCount: Number(row.scan_count || 0),
    scan_count: Number(row.scan_count || 0),
    paymentStatus: row.payment_status || 'pending',
    payment_status: row.payment_status || 'pending',
    paymentAmount: row.payment_amount || '300 PKR',
    payment_amount: row.payment_amount || '300 PKR',
    paymentReceipt: row.payment_receipt || null,
    payment_receipt: row.payment_receipt || null,
    paymentVerifiedAt: row.payment_verified_at,
    payment_verified_at: row.payment_verified_at
  };
}

// Map scan history row
function mapScanHistory(row) {
  if (!row) return null;
  return {
    scanId: row.scan_id,
    scan_id: row.scan_id,
    timestamp: row.scanned_at,
    scanned_at: row.scanned_at,
    ticketId: row.ticket_id,
    ticket_id: row.ticket_id,
    attendeeName: row.attendee_name,
    attendee_name: row.attendee_name,
    universityId: row.university_id,
    university_id: row.university_id,
    seminar: row.seminar,
    status: row.status,
    message: row.message
  };
}

// Ensure database tables exist and have all columns on startup
async function initDb() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS attendees (
        id VARCHAR(64) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        university_id VARCHAR(64) NOT NULL,
        phone VARCHAR(64) NOT NULL,
        email VARCHAR(255) NOT NULL,
        seminar VARCHAR(64) NOT NULL,
        seminar_title TEXT NOT NULL,
        speaker VARCHAR(255) NOT NULL,
        date VARCHAR(128) NOT NULL,
        time VARCHAR(64) NOT NULL,
        venue VARCHAR(64) NOT NULL,
        seat_number VARCHAR(64) NOT NULL,
        ticket_hash VARCHAR(128) NOT NULL,
        registered_at TIMESTAMPTZ DEFAULT NOW(),
        checked_in BOOLEAN DEFAULT FALSE,
        checked_in_at TIMESTAMPTZ,
        scan_count INTEGER DEFAULT 0,
        payment_status VARCHAR(64) DEFAULT 'pending',
        payment_amount VARCHAR(64) DEFAULT '300 PKR',
        payment_receipt TEXT,
        payment_verified_at TIMESTAMPTZ
      );

      CREATE TABLE IF NOT EXISTS scan_history (
        scan_id VARCHAR(64) PRIMARY KEY,
        scanned_at TIMESTAMPTZ DEFAULT NOW(),
        ticket_id VARCHAR(64) NOT NULL,
        attendee_name VARCHAR(255),
        university_id VARCHAR(64),
        seminar VARCHAR(255),
        status VARCHAR(64) NOT NULL,
        message TEXT
      );

      ALTER TABLE attendees ADD COLUMN IF NOT EXISTS payment_status VARCHAR(64) DEFAULT 'pending';
      ALTER TABLE attendees ADD COLUMN IF NOT EXISTS payment_amount VARCHAR(64) DEFAULT '300 PKR';
      ALTER TABLE attendees ADD COLUMN IF NOT EXISTS payment_receipt TEXT;
      ALTER TABLE attendees ADD COLUMN IF NOT EXISTS payment_verified_at TIMESTAMPTZ;
    `);
    console.log('✅ Neon Cloud Database connected and tables verified.');
  } catch (err) {
    console.error('⚠️ Neon DB init error:', err.message);
  }
}
initDb();

// ==========================================
// API ROUTES
// ==========================================

// 1. Get Live Statistics (Total, Verified, Pending, Admitted, Revenue)
app.get('/api/stats', async (req, res) => {
  try {
    const totalRes = await pool.query("SELECT COUNT(*) FROM attendees");
    const verifiedRes = await pool.query("SELECT COUNT(*) FROM attendees WHERE payment_status = 'verified'");
    const pendingRes = await pool.query("SELECT COUNT(*) FROM attendees WHERE payment_status != 'verified'");
    const checkedRes = await pool.query("SELECT COUNT(*) FROM attendees WHERE checked_in = true");

    const totalCount = parseInt(totalRes.rows[0].count, 10);
    const verifiedCount = parseInt(verifiedRes.rows[0].count, 10);
    const pendingCount = parseInt(pendingRes.rows[0].count, 10);
    const checkedCount = parseInt(checkedRes.rows[0].count, 10);
    const totalRevenue = verifiedCount * 300;

    return res.json({
      totalAttendees: totalCount,
      verifiedCount,
      pendingCount,
      checkedInCount: checkedCount,
      totalRevenue: `${totalRevenue.toLocaleString()} PKR`
    });
  } catch (e) {
    console.warn("DB stats error, falling back to local cache:", e.message);
    const attendees = readLocalAttendees();
    let verified = 0, pending = 0, checked = 0;
    for (const a of attendees) {
      if (a.paymentStatus === 'verified' || a.payment_status === 'verified') verified++;
      else pending++;
      if (a.checkedIn || a.checked_in) checked++;
    }
    return res.json({
      totalAttendees: attendees.length,
      verifiedCount: verified,
      pendingCount: pending,
      checkedInCount: checked,
      totalRevenue: `${(verified * 300).toLocaleString()} PKR`
    });
  }
});

// 2. Get All Attendees (For Admin Directory)
app.get('/api/attendees', async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM attendees ORDER BY registered_at ASC");
    const list = result.rows.map(mapAttendee);
    writeLocalAttendees(list);
    return res.json(list);
  } catch (e) {
    console.warn("DB attendees query error, falling back to local file:", e.message);
    return res.json(readLocalAttendees());
  }
});

// 2b. Public Ticket Status & Verification Lookup by Registration ID
app.get('/api/tickets/:id', async (req, res) => {
  const { id } = req.params;
  if (!id) {
    return res.status(400).json({ success: false, message: "Registration ID is required." });
  }

  const cleanId = String(id).trim().toUpperCase();

  try {
    const result = await pool.query(
      `SELECT * FROM attendees 
       WHERE UPPER(id) = $1 
          OR UPPER(ticket_hash) = $1 
       LIMIT 1`,
      [cleanId]
    );

    let row = result.rows[0];

    // Fallback to local cache if DB query returns nothing
    if (!row) {
      const localList = readLocalAttendees();
      const localMatch = localList.find(a => 
        (a.id && a.id.toUpperCase() === cleanId) || 
        (a.ticketHash && a.ticketHash.toUpperCase() === cleanId)
      );
      if (localMatch) {
        row = localMatch;
      }
    }

    if (!row) {
      return res.status(404).json({
        success: false,
        message: `No registration found with ID "${cleanId}". Please verify your Registration ID.`
      });
    }

    const attendee = mapAttendee(row);
    const isVerified = (attendee.paymentStatus === 'verified' || attendee.payment_status === 'verified');

    if (!isVerified) {
      // UNDER REVIEW / NOT VERIFIED YET
      return res.json({
        success: true,
        verified: false,
        status: attendee.paymentStatus || 'pending',
        attendee: {
          id: attendee.id,
          name: attendee.name,
          universityId: attendee.universityId || attendee.university_id,
          registeredAt: attendee.registeredAt,
          phone: attendee.phone,
          email: attendee.email
        },
        message: "Your registration request is currently under review by the society administration."
      });
    }

    // VERIFIED & APPROVED -> Full Ticket Pass available for download
    return res.json({
      success: true,
      verified: true,
      status: 'verified',
      attendee: attendee,
      message: "Registration verified and approved! Official ticket pass is ready."
    });

  } catch (err) {
    console.error("Ticket lookup error:", err);
    return res.status(500).json({ success: false, message: "Error looking up registration status." });
  }
});

// 3. Register New Attendee (Unified 2-Day Seminar Pass with 300 PKR Fee & Receipt Upload)
app.post('/api/register', async (req, res) => {
  const { name, universityId, phone, email, paymentReceipt } = req.body;

  if (!name || !universityId || !email) {
    return res.status(400).json({ error: "Name, University ID, and Personal Gmail are required." });
  }

  const cleanName = name.trim();
  const cleanUnivId = universityId.trim().toUpperCase();
  const cleanPhone = phone ? phone.trim() : "N/A";
  const cleanEmail = email.trim().toLowerCase();

  try {
    // Extract highest existing numeric sequence to avoid duplicate key collisions
    let nextSeq = 1;
    const idRes = await pool.query("SELECT id FROM attendees");
    const existingNums = idRes.rows
      .map(r => {
        const m = String(r.id).match(/PAFSS-26-(\d+)/i);
        return m ? parseInt(m[1], 10) : 0;
      })
      .filter(n => !isNaN(n));

    if (existingNums.length > 0) {
      nextSeq = Math.max(...existingNums) + 1;
    }

    const id = `PAFSS-26-${String(nextSeq).padStart(3, '0')}`;
    const seatNumber = `B2-${String(nextSeq).padStart(3, '0')}`;
    const seminar = "unified26";
    const seminarTitle = "The Frontiers of Medicine & Artificial Intelligence: AMR & Smart Healthcare";
    const speaker = "Dr. Hamad Ali (AMR) & Dr. Shah Faisal (AI Health)";
    const date = "Wed 4th & Thu 5th November 2026";
    const time = "2:00 PM – 4:00 PM (Both Days)";
    const venue = "B2 MPH (Multipurpose Hall)";

    // Save image to server uploads directory if base64 data provided
    let staticFileUrl = null;
    if (paymentReceipt && typeof paymentReceipt === 'string' && paymentReceipt.startsWith('data:image')) {
      staticFileUrl = saveReceiptImage(paymentReceipt, id);
    }
    // Store either static URL or data URL in database
    const storedReceipt = staticFileUrl || paymentReceipt || null;

    const insertRes = await pool.query(
      `INSERT INTO attendees (
        id, name, university_id, phone, email, seminar, 
        seminar_title, speaker, date, time, venue, 
        seat_number, ticket_hash, registered_at, checked_in, scan_count,
        payment_status, payment_amount, payment_receipt
      ) VALUES (
        $1, $2, $3, $4, $5, $6,
        $7, $8, $9, $10, $11,
        $12, $13, NOW(), false, 0,
        'pending', '300 PKR', $14
      ) RETURNING *`,
      [
        id, cleanName, cleanUnivId, cleanPhone, cleanEmail, seminar,
        seminarTitle, speaker, date, time, venue,
        seatNumber, id, storedReceipt
      ]
    );

    const attendeeObj = mapAttendee(insertRes.rows[0]);

    // Sync to local cache
    const localList = readLocalAttendees();
    localList.push(attendeeObj);
    writeLocalAttendees(localList);

    return res.status(201).json({
      success: true,
      message: "Registration confirmed successfully! Payment is pending organizer verification.",
      attendee: attendeeObj
    });

  } catch (err) {
    console.error("Database registration error:", err);
    return res.status(500).json({ error: "Database error processing registration. Please try again." });
  }
});

// 4. Admin Verify / Reject Payment (1-Click Action in Admin Portal)
app.post('/api/attendees/:id/verify-payment', async (req, res) => {
  const { id } = req.params;
  const { status } = req.body; // 'verified' | 'rejected' | 'pending'
  const newStatus = (status === 'rejected') ? 'rejected' : (status === 'pending' ? 'pending' : 'verified');

  try {
    const updateRes = await pool.query(
      `UPDATE attendees 
       SET payment_status = $1, payment_verified_at = NOW() 
       WHERE UPPER(id) = UPPER($2) 
       RETURNING *`,
      [newStatus, id]
    );

    if (updateRes.rows.length === 0) {
      return res.status(404).json({ success: false, message: "Attendee not found." });
    }

    const updatedAttendee = mapAttendee(updateRes.rows[0]);

    // Sync local cache
    const localList = readLocalAttendees();
    const idx = localList.findIndex(a => a.id.toUpperCase() === id.toUpperCase());
    if (idx !== -1) {
      localList[idx] = updatedAttendee;
      writeLocalAttendees(localList);
    }

    return res.json({
      success: true,
      message: `Payment status updated to ${newStatus}.`,
      attendee: updatedAttendee
    });
  } catch (err) {
    console.error("Payment verification error:", err);
    return res.status(500).json({ success: false, message: "Error updating payment status." });
  }
});

// 5. Delete Single Candidate (Permanent Neon DB + Cache Sync)
app.delete('/api/attendees/:id', async (req, res) => {
  const { id } = req.params;
  const cleanId = String(id).trim().toUpperCase();

  try {
    await pool.query("DELETE FROM scan_history WHERE UPPER(ticket_id) = $1", [cleanId]);
    await pool.query("DELETE FROM attendees WHERE UPPER(id) = $1", [cleanId]);

    // Update local cache
    let localList = readLocalAttendees();
    localList = localList.filter(a => a.id.toUpperCase() !== cleanId);
    writeLocalAttendees(localList);

    return res.json({
      success: true,
      message: `Candidate ${cleanId} deleted permanently from database.`
    });
  } catch (err) {
    console.error("Delete candidate error:", err);
    return res.status(500).json({ success: false, message: "Error deleting candidate." });
  }
});

// 6. Delete All Candidates (Permanent Neon DB + Cache Sync)
app.delete('/api/attendees', async (req, res) => {
  try {
    await pool.query("DELETE FROM scan_history");
    await pool.query("DELETE FROM attendees");

    writeLocalAttendees([]);
    writeLocalScanHistory([]);

    return res.json({
      success: true,
      message: "All candidates and scan records have been permanently cleared from database."
    });
  } catch (err) {
    console.error("Delete all candidates error:", err);
    return res.status(500).json({ success: false, message: "Error deleting all candidates." });
  }
});

// 7. Admin Login (Credentials: ID: pafss26, Pass: seminar)
app.post('/api/admin/login', (req, res) => {
  const { id, password } = req.body;
  if (!id || !password) {
    return res.status(400).json({ success: false, message: "ID and password are required" });
  }

  const cleanId = String(id).trim().toLowerCase();
  const cleanPass = String(password).trim().toLowerCase();

  if (cleanId === 'pafss26' && cleanPass === 'seminar') {
    return res.json({
      success: true,
      message: "Admin authentication successful",
      user: { id: "pafss26", role: "Organizer / Administrator" }
    });
  }

  return res.status(401).json({
    success: false,
    message: "Invalid credentials. Please verify ID and Password."
  });
});

// 8. QR Gate Scanner & Verification (With Payment Status Gate)
app.post('/api/scan', async (req, res) => {
  const { ticketId } = req.body;
  if (!ticketId) {
    return res.status(400).json({ success: false, status: 'INVALID', message: "Ticket ID is required" });
  }

  // Extract pure ticket ID if URL or string was scanned
  let cleanTicket = String(ticketId).trim();
  const urlMatch = cleanTicket.match(/(PAFSS-26-\d+|AMR-26-\d+|AIH-26-\d+)/i);
  if (urlMatch) {
    cleanTicket = urlMatch[1];
  }
  const cleanTicketUpper = cleanTicket.toUpperCase();

  try {
    // Search attendee in Neon Database ONLY by ticket id or ticket_hash
    const findRes = await pool.query(
      `SELECT * FROM attendees 
       WHERE UPPER(id) = $1 
          OR UPPER(ticket_hash) = $1 
       LIMIT 1`,
      [cleanTicketUpper]
    );

    // If Ticket NOT Found / Wrong Code -> Reject with RED invalid alert
    if (findRes.rows.length === 0) {
      const scanId = `SCAN-${Date.now()}`;
      try {
        await pool.query(
          `INSERT INTO scan_history (scan_id, scanned_at, ticket_id, attendee_name, university_id, seminar, status, message)
           VALUES ($1, NOW(), $2, 'Unknown / Unregistered', 'N/A', 'N/A', 'INVALID', 'Wrong code! Not a registered seminar pass')`,
          [scanId, cleanTicketUpper]
        );
      } catch (e) {
        console.warn("Scan history insert error:", e.message);
      }

      const invalidLog = {
        scanId,
        scanned_at: new Date().toISOString(),
        timestamp: new Date().toISOString(),
        ticketId: cleanTicketUpper,
        attendeeName: "Unknown / Unregistered",
        universityId: "N/A",
        seminar: "N/A",
        status: "INVALID",
        message: `Wrong code! "${cleanTicketUpper}" is not recognized as a registered participant pass.`
      };

      const localLogs = readLocalScanHistory();
      localLogs.unshift(invalidLog);
      writeLocalScanHistory(localLogs.slice(0, 150));

      return res.status(404).json({
        success: false,
        status: "INVALID",
        message: `Wrong code! "${cleanTicketUpper}" is not recognized as a registered seminar participant pass.`,
        scanLog: invalidLog
      });
    }

    const attendeeRow = findRes.rows[0];
    const isAlreadyChecked = Boolean(attendeeRow.checked_in);
    const scanId = `SCAN-${Date.now()}`;

    // STEP A: PAYMENT VERIFICATION CHECK
    const paymentStatus = attendeeRow.payment_status || 'pending';
    if (paymentStatus !== 'verified') {
      const unverifiedMsg = `⚠️ PAYMENT UNVERIFIED! ${attendeeRow.name} has not cleared the 300 PKR registration fee. Please verify payment in the Admin Portal before admission.`;

      try {
        await pool.query(
          `INSERT INTO scan_history (scan_id, scanned_at, ticket_id, attendee_name, university_id, seminar, status, message)
           VALUES ($1, NOW(), $2, $3, $4, $5, 'PAYMENT_PENDING', $6)`,
          [scanId, attendeeRow.id, attendeeRow.name, attendeeRow.university_id, attendeeRow.speaker, unverifiedMsg]
        );
      } catch (e) {
        console.warn("Scan history insert error:", e.message);
      }

      const pendingLog = {
        scanId,
        scanned_at: new Date().toISOString(),
        timestamp: new Date().toISOString(),
        ticketId: attendeeRow.id,
        attendeeName: attendeeRow.name,
        universityId: attendeeRow.university_id,
        seminar: attendeeRow.speaker,
        status: "PAYMENT_PENDING",
        message: unverifiedMsg
      };

      const localLogs = readLocalScanHistory();
      localLogs.unshift(pendingLog);
      writeLocalScanHistory(localLogs.slice(0, 150));

      return res.json({
        success: true,
        status: "PAYMENT_PENDING",
        isPaymentPending: true,
        message: unverifiedMsg,
        attendee: mapAttendee(attendeeRow),
        scanLog: pendingLog
      });
    }

    // STEP B: ALREADY SCANNED ONCE (Duplicate alert with person's name)
    if (isAlreadyChecked) {
      const newScanCount = Number(attendeeRow.scan_count || 1) + 1;
      await pool.query(
        "UPDATE attendees SET scan_count = $1 WHERE id = $2",
        [newScanCount, attendeeRow.id]
      );

      const timeFormatted = attendeeRow.checked_in_at 
        ? new Date(attendeeRow.checked_in_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) 
        : 'Earlier';

      const dupMessage = `Already scanned! ${attendeeRow.name} was already admitted at ${timeFormatted} (Scan #${newScanCount})`;

      try {
        await pool.query(
          `INSERT INTO scan_history (scan_id, scanned_at, ticket_id, attendee_name, university_id, seminar, status, message)
           VALUES ($1, NOW(), $2, $3, $4, $5, 'ALREADY_SCANNED', $6)`,
          [scanId, attendeeRow.id, attendeeRow.name, attendeeRow.university_id, attendeeRow.speaker, dupMessage]
        );
      } catch (e) {
        console.warn("Scan history insert error:", e.message);
      }

      const dupLog = {
        scanId,
        scanned_at: new Date().toISOString(),
        timestamp: new Date().toISOString(),
        ticketId: attendeeRow.id,
        attendeeName: attendeeRow.name,
        universityId: attendeeRow.university_id,
        seminar: attendeeRow.speaker,
        status: "ALREADY_SCANNED",
        message: dupMessage
      };

      const localLogs = readLocalScanHistory();
      localLogs.unshift(dupLog);
      writeLocalScanHistory(localLogs.slice(0, 150));

      const updatedObj = mapAttendee({ ...attendeeRow, scan_count: newScanCount });

      return res.json({
        success: true,
        status: "ALREADY_SCANNED",
        isDuplicate: true,
        message: `⚠️ Already Scanned! ${attendeeRow.name} was already admitted at ${timeFormatted}.`,
        checkedInAt: attendeeRow.checked_in_at,
        scanCount: newScanCount,
        attendee: updatedObj,
        scanLog: dupLog
      });
    }

    // STEP C: FIRST TIME SCAN & PAYMENT VERIFIED -> Verified & Admitted in Green Color
    const updateRes = await pool.query(
      `UPDATE attendees 
       SET checked_in = true, checked_in_at = NOW(), scan_count = 1 
       WHERE id = $1 
       RETURNING *`,
      [attendeeRow.id]
    );

    const verifiedObj = mapAttendee(updateRes.rows[0]);
    const succMessage = `Admitted: ${verifiedObj.name} has been scanned and recorded in the attendance list (300 PKR Verified).`;

    try {
      await pool.query(
        `INSERT INTO scan_history (scan_id, scanned_at, ticket_id, attendee_name, university_id, seminar, status, message)
         VALUES ($1, NOW(), $2, $3, $4, $5, 'FIRST_CHECKIN', $6)`,
        [scanId, verifiedObj.id, verifiedObj.name, verifiedObj.universityId, verifiedObj.speaker, succMessage]
      );
    } catch (e) {
      console.warn("Scan history insert error:", e.message);
    }

    const successLog = {
      scanId,
      scanned_at: verifiedObj.checkedInAt,
      timestamp: verifiedObj.checkedInAt,
      ticketId: verifiedObj.id,
      attendeeName: verifiedObj.name,
      universityId: verifiedObj.universityId,
      seminar: verifiedObj.speaker,
      status: "FIRST_CHECKIN",
      message: succMessage
    };

    const localLogs = readLocalScanHistory();
    localLogs.unshift(successLog);
    writeLocalScanHistory(localLogs.slice(0, 150));

    // Update local attendees cache
    const localAttendees = readLocalAttendees();
    const idx = localAttendees.findIndex(a => a.id === verifiedObj.id);
    if (idx !== -1) {
      localAttendees[idx] = verifiedObj;
      writeLocalAttendees(localAttendees);
    }

    return res.json({
      success: true,
      status: "FIRST_CHECKIN",
      isDuplicate: false,
      message: `✅ Admitted: ${verifiedObj.name} (300 PKR Verified)`,
      attendee: verifiedObj,
      scanLog: successLog
    });

  } catch (err) {
    console.error("Scan processing error:", err);
    return res.status(500).json({ success: false, status: 'ERROR', message: "Internal server error during ticket scan." });
  }
});

// 9. Live Scanned History Log (From Neon DB)
app.get('/api/scan-history', async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT * FROM scan_history ORDER BY scanned_at DESC LIMIT 100"
    );
    const mapped = result.rows.map(mapScanHistory);
    return res.json(mapped);
  } catch (err) {
    console.warn("Scan history DB error, returning local file:", err.message);
    return res.json(readLocalScanHistory());
  }
});

// 10. Delete Single Scan Log Item
app.delete('/api/scan-history/:scanId', async (req, res) => {
  const { scanId } = req.params;
  try {
    await pool.query("DELETE FROM scan_history WHERE scan_id = $1", [scanId]);

    let localLogs = readLocalScanHistory();
    localLogs = localLogs.filter(l => l.scanId !== scanId && l.scan_id !== scanId);
    writeLocalScanHistory(localLogs);

    return res.json({ success: true, message: "Scan entry deleted successfully." });
  } catch (err) {
    console.error("Delete scan log error:", err);
    return res.status(500).json({ success: false, message: "Error deleting scan log." });
  }
});

// 11. Clear All Live Scanned History
app.post('/api/scan-history/clear', async (req, res) => {
  try {
    await pool.query("DELETE FROM scan_history");
    writeLocalScanHistory([]);
    return res.json({ success: true, message: "Scan history cleared." });
  } catch (err) {
    console.error("Clear scan history error:", err);
    writeLocalScanHistory([]);
    return res.json({ success: true, message: "Local scan history cleared." });
  }
});

// Helper for local network IP display
function getLocalIp() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if ('IPv4' === iface.family && !iface.internal) {
        return iface.address;
      }
    }
  }
  return 'localhost';
}

const server = app.listen(PORT, () => {
  const localIp = getLocalIp();
  console.log(`====================================================`);
  console.log(` 🚀 PAF-IAST SCIENCE SOCIETY SEMINAR SYSTEM ONLINE! `);
  console.log(` Date:  4 & 5th November 2026 | Time: 2:00 to 4:00 PM `);
  console.log(` Venue: B2 MPH `);
  console.log(` Local URL:   http://localhost:${PORT}`);
  console.log(` Admin URL:   http://localhost:${PORT}/admin`);
  console.log(` Network URL: http://${localIp}:${PORT}`);
  console.log(` Admin ID:    pafss26  |  Pass: seminar`);
  console.log(` Neon DB:     holy-dream-11654294 (pafss-seminar-portal)`);
  console.log(`====================================================`);
});
