const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Dedicated Admin Route: /admin serves admin.html directly
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
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
    seminar: row.seminar,
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
    scan_count: Number(row.scan_count || 0)
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

// Ensure database tables exist on startup
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
        scan_count INTEGER DEFAULT 0
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

// 1. Get Live Statistics
app.get('/api/stats', async (req, res) => {
  try {
    const sem1Res = await pool.query("SELECT COUNT(*) FROM attendees WHERE seminar = 'seminar1'");
    const sem2Res = await pool.query("SELECT COUNT(*) FROM attendees WHERE seminar = 'seminar2'");
    const checkedRes = await pool.query("SELECT COUNT(*) FROM attendees WHERE checked_in = true");
    const totalRes = await pool.query("SELECT COUNT(*) FROM attendees");

    const sem1Count = parseInt(sem1Res.rows[0].count, 10);
    const sem2Count = parseInt(sem2Res.rows[0].count, 10);
    const checkedCount = parseInt(checkedRes.rows[0].count, 10);
    const totalCount = parseInt(totalRes.rows[0].count, 10);

    return res.json({
      seminar1: { registered: sem1Count },
      seminar2: { registered: sem2Count },
      totalAttendees: totalCount,
      checkedInCount: checkedCount
    });
  } catch (e) {
    console.warn("DB stats error, falling back to local cache:", e.message);
    const attendees = readLocalAttendees();
    let sem1 = 0, sem2 = 0, checked = 0;
    for (const a of attendees) {
      if (a.seminar === 'seminar1') sem1++;
      if (a.seminar === 'seminar2') sem2++;
      if (a.checkedIn || a.checked_in) checked++;
    }
    return res.json({
      seminar1: { registered: sem1 },
      seminar2: { registered: sem2 },
      totalAttendees: attendees.length,
      checkedInCount: checked
    });
  }
});

// 2. Get All Attendees (For Admin Directory & Local Offline Cache)
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

// 3. Register New Attendee (Clean input, saved globally to Neon DB)
app.post('/api/register', async (req, res) => {
  const { name, universityId, phone, email, seminar } = req.body;

  if (!name || !universityId || !email || !seminar) {
    return res.status(400).json({ error: "Name, University ID, Personal Gmail, and Seminar are required." });
  }

  const cleanName = name.trim();
  const cleanUnivId = universityId.trim().toUpperCase();
  const cleanPhone = phone ? phone.trim() : "N/A";
  const cleanEmail = email.trim().toLowerCase();
  const targetSeminar = (seminar === 'seminar2') ? 'seminar2' : 'seminar1';

  try {
    // Count existing attendees for the selected seminar to generate sequential ID
    const countRes = await pool.query(
      "SELECT COUNT(*) FROM attendees WHERE seminar = $1",
      [targetSeminar]
    );
    const nextSeq = parseInt(countRes.rows[0].count, 10) + 1;

    let id = "";
    let seatNumber = "";
    let seminarTitle = "";
    let speaker = "";
    let date = "";

    if (targetSeminar === 'seminar1') {
      id = `AMR-26-${String(nextSeq).padStart(3, '0')}`;
      seatNumber = `AMR-${String(nextSeq).padStart(2, '0')}`;
      seminarTitle = "The Silent Pandemic: Antimicrobial Resistance and Its Global Health Implications";
      speaker = "Dr. Hamad Ali";
      date = "Wednesday, 4th November";
    } else {
      id = `AIH-26-${String(nextSeq).padStart(3, '0')}`;
      seatNumber = `AIH-${String(nextSeq).padStart(2, '0')}`;
      seminarTitle = "Artificial Intelligence in Healthcare: Opportunities, Challenges, and the Future of Smart Medicine in Research, Practice, and Business";
      speaker = "Dr. Shah Faisal";
      date = "Thursday, 5th November";
    }

    const insertRes = await pool.query(
      `INSERT INTO attendees (
        id, name, university_id, phone, email, seminar, 
        seminar_title, speaker, date, time, venue, 
        seat_number, ticket_hash, registered_at, checked_in, scan_count
      ) VALUES (
        $1, $2, $3, $4, $5, $6,
        $7, $8, $9, $10, $11,
        $12, $13, NOW(), false, 0
      ) RETURNING *`,
      [
        id, cleanName, cleanUnivId, cleanPhone, cleanEmail, targetSeminar,
        seminarTitle, speaker, date, "2:00 PM – 4:00 PM", "B2 MPH",
        seatNumber, id
      ]
    );

    const attendeeObj = mapAttendee(insertRes.rows[0]);

    // Sync to local cache
    const localList = readLocalAttendees();
    localList.push(attendeeObj);
    writeLocalAttendees(localList);

    return res.status(201).json({
      success: true,
      message: "Registration confirmed successfully!",
      attendee: attendeeObj
    });

  } catch (err) {
    console.error("Database registration error:", err);
    return res.status(500).json({ error: "Database error processing registration. Please try again." });
  }
});

// 4. Admin Login (Credentials: ID: pafss26, Pass: seminar)
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
    message: "Invalid credentials. (ID: pafss26, Pass: seminar)"
  });
});

// 5. QR Gate Scanner & Verification (Neon DB Powered + Strict Participant Verification)
app.post('/api/scan', async (req, res) => {
  const { ticketId } = req.body;
  if (!ticketId) {
    return res.status(400).json({ success: false, status: 'INVALID', message: "Ticket ID is required" });
  }

  // Extract pure ticket ID if URL was scanned
  let cleanTicket = String(ticketId).trim();
  const urlMatch = cleanTicket.match(/(AMR-26-\d+|AIH-26-\d+)/i);
  if (urlMatch) {
    cleanTicket = urlMatch[1];
  }
  const cleanTicketUpper = cleanTicket.toUpperCase();

  try {
    // Search attendee in Neon Database ONLY by ticket id or ticket_hash
    // (Strictly excludes university IDs or arbitrary keywords)
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

    // Case A: ALREADY SCANNED ONCE (Duplicate alert with person's name)
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

    // Case B: FIRST TIME SCAN -> Verified & Admitted in Green Color with Person's Name
    const updateRes = await pool.query(
      `UPDATE attendees 
       SET checked_in = true, checked_in_at = NOW(), scan_count = 1 
       WHERE id = $1 
       RETURNING *`,
      [attendeeRow.id]
    );

    const verifiedObj = mapAttendee(updateRes.rows[0]);
    const succMessage = `Admitted: ${verifiedObj.name} has been scanned and recorded in the attendance list.`;

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
      message: `✅ Admitted: ${verifiedObj.name}`,
      attendee: verifiedObj,
      scanLog: successLog
    });

  } catch (err) {
    console.error("Scan processing error:", err);
    return res.status(500).json({ success: false, status: 'ERROR', message: "Internal server error during ticket scan." });
  }
});

// 6. Live Scanned History Log (From Neon DB)
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

// 7. Clear Live Scanned History Log
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
