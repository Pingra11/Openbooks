# OpenBooks — Accounting & User Management System

[![Run on Replit](https://replit.com/badge/github)](https://replit.com/new/github/YOUR_USERNAME/YOUR_REPO_NAME)

> **To use the Open in Replit button:** Replace `YOUR_USERNAME/YOUR_REPO_NAME` in the badge URL above with your actual GitHub username and repository name after pushing this project.

---

## Overview

OpenBooks is a comprehensive web-based accounting and user management platform. It provides secure Firebase authentication, role-based access control, a full Chart of Accounts, journal entry approval workflows, account ledgers, and financial reporting — all served from a single Python Flask server with no build process required.

---

## Features

| Feature | Description |
|---|---|
| **User Management** | Create, edit, suspend users; role-based access (Administrator, Manager, Accountant) |
| **Chart of Accounts** | Full account management with standard numbering (Assets 1000–1999, etc.) |
| **Journal Entries** | Multi-line entries with debit/credit validation, file attachments, and approval workflow |
| **Approval Workflow** | Accountants submit → Managers approve/reject → Post to ledger; email notifications sent |
| **Account Ledgers** | Real-time transaction tracking with running balances; clickable post references |
| **Financial Reports** | Trial Balance, Balance Sheet, Income Statement, Retained Earnings |
| **Export Options** | PDF, CSV, Email (Replit Mail), and Print with custom CSS |
| **Event Logging** | Full audit trail with before/after snapshots for every change |
| **Password Recovery** | Security questions-based account recovery flow |
| **Dashboard** | Financial health ratios, important messages section, role-based navigation |

---

## Tech Stack

| Layer | Technology |
|---|---|
| **Server** | Python 3.9+, Flask |
| **Authentication** | Firebase Authentication |
| **Database** | Cloud Firestore (NoSQL) |
| **Admin SDK** | Firebase Admin SDK (Python) |
| **Frontend** | Vanilla JavaScript (ES6 modules), HTML5, CSS3 |
| **PDF Export** | jsPDF + jsPDF-AutoTable (CDN) |
| **Email** | Replit Mail API |
| **File Storage** | Base64-encoded in Firestore (max 2 MB per file) |

---

## Requirements

- **Python 3.9+** — [Download here](https://python.org)
- A **Firebase project** — [Create one free](https://console.firebase.google.com)
- Internet connection (Firebase requires it)

---

## Quick Start

### 1. Clone the repository

```bash
git clone https://github.com/YOUR_USERNAME/YOUR_REPO_NAME.git
cd YOUR_REPO_NAME
```

### 2. Add your Firebase credentials

Copy your Firebase service account key into the `config/` folder:

```bash
cp /path/to/your/firebase-service-account.json config/firebase-service-account.json
```

> See [Firebase Setup](#firebase-setup) below for how to get this file.

### 3. Start the server

**Windows** — double-click `run_openbooks.py`, or:
```bash
python run_openbooks.py
```

**Mac / Linux:**
```bash
python3 run_openbooks.py
```

The launcher will automatically install dependencies, start the server, and open your browser to `http://localhost:5000`.

### 4. Manual start (if the launcher doesn't work)

```bash
pip install flask firebase-admin
python server.py
```

Then open `http://localhost:5000` in your browser.

---

## Firebase Setup

1. Go to [https://console.firebase.google.com](https://console.firebase.google.com)
2. Create a project (or select an existing one)
3. Enable **Authentication** → Sign-in method → **Email/Password**
4. Enable **Firestore Database** (start in test mode, then apply `web/firestore.rules`)
5. Go to **Project Settings → Service Accounts**
6. Click **Generate new private key** and save as `config/firebase-service-account.json`
7. Copy your Firebase web config into `web/js/firebaseConfig.js`

> ⚠️ **Never commit `config/firebase-service-account.json` to a public repository.** It is listed in `.gitignore` by default.

---

## Folder Structure

```
OpenBooks/
├── server.py                  # Python Flask server + API endpoints
├── run_openbooks.py           # One-click launcher
├── requirements.txt           # Python dependencies
├── README.md                  # This file
├── .gitignore
├── config/
│   ├── firebase-service-account.json        # ← Your credentials (gitignored)
│   └── firebase-service-account.example.json  # Template (safe to commit)
└── web/
    ├── index.html             # Login page
    ├── admin.html             # Administrator dashboard
    ├── manager.html           # Manager dashboard
    ├── app.html               # Accountant dashboard
    ├── chart-of-accounts.html
    ├── journal.html
    ├── account-ledger.html
    ├── reports.html
    ├── event-logs.html
    ├── css/
    │   └── styles.css
    ├── js/
    │   ├── firebaseConfig.js  # ← Add your Firebase web config here
    │   ├── auth.js
    │   ├── admin.js
    │   ├── manager.js
    │   ├── accountant.js
    │   └── ...
    └── assets/
        └── logo.svg
```

---

## User Roles

| Role | Permissions |
|---|---|
| **Administrator** | Full access: user management, account creation/editing, post journal entries directly, view all logs and reports |
| **Manager** | Approve/reject journal entries, post approved entries, view ledgers and reports, view event logs |
| **Accountant** | Create and submit journal entries (for manager approval), view ledgers and reports, attach files to entries |

---

## Stopping the Server

Press `Ctrl+C` in the terminal window running the server.

---

## Troubleshooting

**Server won't start**
- Ensure Python 3.9+ is installed: `python --version`
- Install dependencies manually: `pip install flask firebase-admin`
- Check that port 5000 is not already in use

**Browser shows blank page**
- Wait a few seconds for the server to fully start, then refresh
- Check the terminal for error messages

**Login fails**
- Ensure your Firebase credentials file is in `config/firebase-service-account.json`
- Verify your Firebase project has Email/Password authentication enabled
- Check that your Firestore security rules allow reads/writes

**"No security questions found" on password recovery**
- The user must first log in, go to Settings, and save their 3 security questions before using Forgot Password

---

## License

MIT — see [LICENSE](LICENSE) for details.
