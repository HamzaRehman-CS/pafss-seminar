# PAF-IAST Science Society — Seminars 2026 Portal

Official seminar registration, ticket pass issuance, and gate QR verification system for the PAF-IAST Science Society.

## 📌 Event Details
* **Dates**: 4th & 5th November 2026
* **Timings**: 2:00 PM – 4:00 PM (Both Days)
* **Venue**: B2 MPH (Multipurpose Hall), Pak-Austria Fachhochschule: IAS&T

### Seminars & Speakers
1. **Wednesday, 4th November**:  
   *Title*: *The Silent Pandemic: Antimicrobial Resistance and Its Global Health Implications*  
   *Speaker*: **Dr. Hamad Ali** (Dept. of Pharmaceutical Sciences)

2. **Thursday, 5th November**:  
   *Title*: *Artificial Intelligence in Healthcare: Opportunities, Challenges, and the Future of Smart Medicine in Research, Practice, and Business*  
   *Speaker*: **Dr. Shah Faisal** (Dept. of Pharmaceutical Sciences)

---

## ✨ Features
* **Apple / Samsung Clean Aesthetic**: Blurry ambient background splashes (Royal Blue, Sky Blue, White, Splash Orange), true glassmorphism, floating research emojis (`🧪🧫🧬` & `🤖⚡🩺`).
* **Symmetrical Eye-Level Cards**: Balanced side-by-side seminar layout with matching baseline heights for topic headings, descriptions, specs, and register buttons.
* **Instant Digital Pass & PDF Export**: Attendees receive an official ticket pass with university and society logos, attendee details, a unique sequence ID (`AMR-26-xxx` / `AIH-26-xxx`), and a scannable QR code. Direct download as PDF or instant print.
* **Neon Cloud PostgreSQL Database**: Built-in persistence for all registrations and scans across all devices worldwide.
* **Dedicated Standalone Admin Portal (`/admin`)**:
  * Organizer Gate Control & Live Real-Time Dashboard.
  * Camera QR Scanner & Manual Ticket ID entry.
  * Real-Time Local Cache Validation with offline support.
  * Instant Green Tick (`✅`) verification with attendee name and entry timestamp.
  * Duplicate Scan Warning (`⚠️ ALREADY SCANNED ONCE!`) with original check-in timestamp.
  * Live Scanned History Log and 1-click CSV Directory Export.
  * Zero dummy records on fresh launch.

---

## 🔐 Admin Gate Portal
* **URL**: `http://localhost:3000/admin`
* **Organizer ID**: `pafss26`
* **Password**: `seminar`

---

## 🚀 Getting Started

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Neon Database
Set the `DATABASE_URL` environment variable or use the preconfigured Neon connection string:
```bash
DATABASE_URL=postgresql://neondb_owner:npg_Nm7ERXpOnG9t@ep-small-recipe-b4becr5v-pooler.c-6.us-east-2.aws.neon.tech/neondb?sslmode=require
```

### 3. Start the Server
```bash
npm start
```
* **Public Portal**: `http://localhost:3000`
* **Admin Portal**: `http://localhost:3000/admin`
