# CashFlow AI 💼📈
> **AI-Powered Cash-Flow Prediction & Early-Warning Intelligence System for Micro, Small, and Medium Enterprises (MSMEs)**

CashFlow AI helps business owners understand current finances, forecast future cash shortages, detect root causes (e.g., debtor delay, clustered vendor maturities), and simulate prescriptive actions to protect working capital without requiring expensive external enterprise tools.

---

## 🏛️ System Architecture

```
CashFlow_AI/
├── backend/
│   ├── routes/                # Modular REST API endpoints
│   │   ├── __init__.py
│   │   ├── health.py          # /api/health endpoint
│   │   ├── dashboard.py       # Aggregated KPIs and health status
│   │   ├── transactions.py    # Cash inflow and outflow ledger
│   │   ├── receivables.py     # Invoices and collections tracking
│   │   ├── payables.py        # Vendor obligations and priority bills
│   │   ├── forecast.py        # 30/60/90-day predictive cash engine
│   │   ├── risks.py           # Early-warning vulnerability monitor
│   │   ├── recommendations.py # AI-recommended prescriptive actions
│   │   ├── simulations.py     # Dynamic What-If policy engine
│   │   ├── imports.py         # Bank statement & CSV ingestion
│   │   └── reports.py         # Financial health audit reports
│   ├── services/              # Financial modeling and analytics
│   │   ├── finance_service.py # Runway, net burn, and metrics calculations
│   │   ├── forecast_service.py# Time-series projection and confidence bands
│   │   └── risk_service.py    # Debtor concentration and aging analysis
│   ├── app.py                 # Flask app factory with CORS & error handlers
│   ├── config.py              # Environment configuration
│   ├── database.py            # SQLite schema setup and MSME demo data seeder
│   ├── wsgi.py                # WSGI entry point
│   ├── requirements.txt       # Python dependencies
│   ├── .env.example           # Backend environment template
│   └── test_api.py            # Automated API integration verification
│
├── frontend/
│   ├── src/
│   │   ├── api/
│   │   │   └── client.js      # Centralized API service connecting to Flask
│   │   ├── components/
│   │   │   ├── layout/        # Sidebar, Navbar, and Layout shell
│   │   │   ├── common/        # MetricCard, Button, Badge, AlertBanner, Modal
│   │   │   └── charts/        # CashFlowTrendChart, SpendingBreakdownChart, Gauge
│   │   ├── pages/             # 10 Core Application Modules
│   │   │   ├── Dashboard.jsx
│   │   │   ├── Transactions.jsx
│   │   │   ├── Receivables.jsx
│   │   │   ├── Payables.jsx
│   │   │   ├── Forecast.jsx
│   │   │   ├── RiskCenter.jsx
│   │   │   ├── Recommendations.jsx
│   │   │   ├── WhatIfSimulator.jsx
│   │   │   ├── DocumentImport.jsx
│   │   │   └── Reports.jsx
│   │   ├── App.jsx            # Router and navigation shell
│   │   ├── main.jsx           # React root
│   │   └── index.css          # Tailwind CSS and fintech design tokens
│   ├── package.json
│   └── vite.config.js         # Vite configuration with API proxy (:5000)
└── README.md
```

---

## ⚡ Quick Start Guide (Windows)

### Prerequisites
- **Node.js**: v18+ (tested on v22.20.0)
- **Python**: 3.10+ (tested on Python 3.13.0)

---

### Step 1: Start the Backend (Flask API)

Open **PowerShell** or **Command Prompt** in the project root:

```powershell
# 1. Navigate to the project root (if not already there)
cd c:\Users\vaibh\OneDrive\Desktop\CashFlow_AI

# 2. Activate the pre-created virtual environment (or create with 'python -m venv backend/venv')
.\backend\venv\Scripts\Activate.ps1

# 3. (Optional) If running for the first time, install requirements:
pip install -r backend\requirements.txt

# 4. Start the Flask server
python -m backend.app
```

The Flask API will start at:
👉 **`http://localhost:5000`**  
- Health endpoint: `http://localhost:5000/api/health`
- Database automatically initializes and seeds `backend/cashflow.db` on first launch.

---

### Step 2: Start the Frontend (React + Vite)

Open a **second PowerShell** window in the project root:

```powershell
# 1. Navigate to frontend directory
cd c:\Users\vaibh\OneDrive\Desktop\CashFlow_AI\frontend

# 2. (Optional) If running for the first time, install dependencies:
npm install

# 3. Start the Vite development server
npm run dev
```

The Vite dev server will launch at:
👉 **`http://localhost:5173`**

---

## 🧪 Testing Backend Endpoints

Run the automated API test suite anytime:

```powershell
.\backend\venv\Scripts\python backend\test_api.py
```

Expected output:
```text
[OK] /api/health passed
[OK] /api/dashboard/summary passed (Cash Balance: $84,250.00)
[OK] /api/forecast passed (30 days timeline generated, trough: $72,353.38)
[OK] /api/receivables passed (6 records, total outstanding: $129,300.00)
[OK] /api/payables passed (6 records, total obligations: $59,700.00)
[OK] /api/risks passed (3 active early-warning alerts)
[OK] /api/simulations/run passed (Liquidity gain: +$9,655.93)
ALL BACKEND API TESTS COMPLETED SUCCESSFULLY!
```

---

## 🎯 Implemented Modules & Capabilities

1. **Financial Command Center (Dashboard)**:
   - Real-time KPIs: Current cash balance, estimated runway (days/months), daily burn rate, overdue receivables, and critical vendor commitments.
   - 30-Day predictive cash flow curve with safe reserve threshold and upper/lower confidence bands.
   - MSME Health Index visual gauge (0–100 score).
   - Recent reconciled transaction ledger.
   - Expense category allocation donut chart.

2. **Transaction Management Hub (`/transactions`)**:
   - **4 Compact Summary Cards**: Total Income, Total Expenses, Net Cash Flow, and Total Transactions calculated dynamically from filtered ledger records.
   - **Full CRUD Support**: Add new transactions or edit existing records via a modal form with field-level validation, MSME categories, and INR formatting.
   - **Safety Controls**: Delete confirmation dialog with explicit notification of cash balance reconciliation.
   - **Search & Multi-Filter**: Real-time search (by title, counterparty, reference number), filtering by transaction type (Income/Expense), category, payment status (Completed, Pending, Overdue), and date range.
   - **Sorting**: Toggle sorting by date or amount in ascending/descending order, plus a convenient "Reset Filters" action.
   - **Backend Persistence**: All transactions persist in SQLite (`transactions` table) with parameterized queries and automated balance reconciliation for completed entries.

3. **Receivables Management Hub (`/receivables`)**:
   - **4 Summary KPI Cards**: Total Outstanding, Overdue Amount, Due in the Next 7 Days, and Amount Received This Month, dynamically calculated from live SQLite database invoices and payment records.
   - **Invoice CRUD**: Prominent **"+ Add Invoice"** button and Edit invoice functionality with validation (unique invoice number, amount > 0, due date >= invoice date, optional initial payment record).
   - **Dynamic Balance & Derived Status**: Calculates `Outstanding Balance = Invoice Amount − Amount Paid` and automatically derives status (`Paid`, `Overdue`, `Due Soon` within 7 days, or `Pending`).
   - **Partial & Full Customer Payments**: **"Record Payment"** modal allowing partial or full payments with payment date, method (UPI, Bank Transfer, Cheque, Cash), reference number, and notes. Ensures payments never exceed invoice balance, creates corresponding cash inflow transactions in the cash ledger, and updates business balance.
   - **Invoice Details & History**: View detailed invoice metadata alongside a complete historical timeline of recorded customer payments.
   - **Safety Controls & Filtering**: Safe deletion protection guarding against accidental deletion of invoices with recorded payments (with confirmation), real-time search, status filter pills, date range filters, and sorting by due date or outstanding balance.

4. **Payables Management Hub (`/payables`)**:
   - **4 Summary KPI Cards**: Total Outstanding, Overdue Amount, Due in the Next 7 Days, and Amount Paid This Month, computed from live supplier bills and disbursement records.
   - **Supplier Bill CRUD**: Prominent **"+ Add Bill"** button and Edit bill functionality with validation, priority classification (Critical, High, Medium, Low), and expense categories.
   - **Dynamic Balance & Derived Status**: Live calculation of outstanding obligations and derived payment status (`Paid`, `Overdue`, `Due Soon`, `Pending`).
   - **Partial & Full Supplier Disbursements**: **"Record Payment"** modal supporting partial tranches or full settlement. Records cash outflow in transaction history and updates cash balance.
   - **Bill Details & Disbursement History**: Full breakdown of bill details and all historical disbursement records.
   - **Safety Controls & Filtering**: Safe deletion checks, search by bill number or supplier name, status filter pills, date range filtering, and sorting by due date or balance.

5. **Cash-Flow Forecasting Engine (`/forecast`)**:
   - **Deterministic Financial Engine**: Computes exact projected closing balances using Python's `Decimal` type:
     `Projected Closing Balance = Previous Closing Balance + Expected Inflows − Expected Outflows`.
   - **Multi-Horizon Support**: Selectable 7-Day, 30-Day, and 60-Day projections that dynamically calculate daily cash movements.
   - **Configurable Opening Balance & Buffer**: Allows business owners to configure their starting cash position and desired minimum cash buffer via a validated form, persisting settings across restarts in SQLite (`forecast_settings`). Opening balance is clearly designated as user-provided.
   - **Accurate Database Movements**:
     - *Receivables*: Includes only open customer invoices, considering only outstanding amounts (`invoice_amount - paid`), due dates, and partial payments. Excludes fully settled invoices.
     - *Payables*: Includes only open supplier obligations, considering only outstanding amounts (`bill_amount - paid`) on due dates. Excludes fully settled bills.
     - *Transactions*: Incorporates future direct business expenses and additional income. Excludes completed historical records (already in opening balance) and deduplicates against invoice/bill payment records.
   - **4 Summary KPI Cards**: Projected Ending Cash, Lowest Projected Balance (with trough date), First Risk Date (or "No risk detected"), and Forecast Net Movement.
   - **Interactive Recharts Visualization**: Displays projected trajectory with minimum buffer reference line, deficit threshold line (if negative), rich tooltips, and highlighting for points below buffer or in deficit.
   - **Daily Cash Forecast Table**: Complete day-by-day ledger with Opening Balance, Expected Inflows, Expected Outflows, Net Movement, Projected Closing Balance, and compact Risk Badges (`Critical`, `High Risk`, `Healthy`). Expandable row details reveal contributing item breakdowns.
   - **View Mode Switcher**: Toggle smoothly between Combined (Chart + Table), Chart Only, and Table Only views.
   - **REST API Endpoints**:
     - `GET /api/forecast?days=7|30|60`
     - `GET /api/forecast/settings`
     - `PUT /api/forecast/settings`

6. **AI Risk Center (`/risks`)**:
   - **Explainable Rule-Based Liquidity Risk Engine**: Uses the deterministic cash-flow forecasting engine as the single source of truth for projected balances across 7, 30, and 60 days.
   - **Risk Classification Rules (Precedence: Critical > High > Moderate > Healthy)**:
     - `Critical`: Projected closing cash balance becomes negative at least once during the selected forecast period.
     - `High`: Projected balance falls below configured minimum cash buffer, but never becomes negative.
     - `Moderate`: Projected balance remains above minimum buffer, but material upcoming obligations, overdue invoices, high customer concentration, or active warnings require attention.
     - `Healthy`: No configured risk condition is triggered.
   - **4 Risk Summary Cards**:
     - *Overall Risk*: Real-time status badge with explainable rule text.
     - *First Risk Date*: Earliest date a buffer condition is breached (or "No risk detected").
     - *Lowest Projected Balance*: Period low with trough date.
     - *Potential Cash Shortfall*: Calculated via $\max(0, \text{Minimum Cash Buffer} - \text{Lowest Projected Balance})$, clearly distinguishing negative cash deficit from buffer deficit.
   - **Risk Timeline**: Recharts projection highlighting buffer breaches and deficit points with rich tooltip showing projected balance, expected inflows/outflows, and risk classification.
   - **"Why Is My Cash at Risk?"**: Identifies real database causes:
     - *Timing Mismatch*: Supplier bills due before expected customer receipts arrive.
     - *Overdue Invoices*: Debtor details, invoice numbers, days overdue, and working capital impact.
     - *Clustered Expenses*: Multiple obligations scheduled on the same date.
     - *Large Single Commitments*: Bills consuming a high percentage of buffer.
   - **Upcoming Risk Events**: Deduplicated risk periods and threats with severity badges, amount at risk, and working **"View Details"** modal and mitigation actions.
   - **Priority Actions**: Rule-based recommendations ranked by urgency and financial impact (accelerating collections, supplier window adjustments, expense staggering) with practical reasons and disclaimer.
   - **REST API Endpoints**:
     - `GET /api/risk-center?days=7|30|60`
     - `GET /api/risks?days=7|30|60`
     - `POST /api/risks/<id>/resolve`

7. **AI Recommendations (`/recommendations`)**:
   - **Deterministic Decision Engine**: Converts cash-flow forecasts, AI Risk Center alerts, receivables, and payables into actionable, explainable steps for MSME owners without fabricating predictions or claiming unverified ML.
   - **Rule-Based Engine Coverage**:
     - *Rule A: Overdue Customer Invoices*: Identifies specific overdue accounts, outstanding amounts, and days overdue with prompt collection suggestions.
     - *Rule B: Supplier Payment Timing Mismatches*: Detects obligations falling due before scheduled customer receipts and proposes grace period or tranche alignments.
     - *Rule C: Upcoming Large Obligations*: Identifies single disbursements consuming a high percentage of buffer and recommends split settlements.
     - *Rule D: Clustered Outflows*: Groups multiple same-day vendor bills and advises disbursement smoothing.
     - *Rule E: Excessive Outstanding Receivables*: Evaluates systemic debtor concentration and flags overdue revenue exposure.
     - *Rule F: Incomplete Financial Baseline*: Flags missing starting bank balances or buffer parameters to maintain data hygiene.
     - *Rule G: Healthy Liquidity Discipline*: Offers constructive buffer management guidance when financial metrics remain safe.
   - **4 Summary KPI Cards**: Critical Actions, High-Priority Actions, Other Suggestions, and Potential Cash-Flow Improvement (only displayed when calculated from defined scenarios; otherwise "Impact not estimated").
   - **Card & Lifecycle Actions**:
     - Prioritized cards with severity badges (`Critical`, `High`, `Medium`, `Low`).
     - **View Details**: Opens comprehensive modal detailing underlying financial records, root cause, and formulas.
     - **Mark as Reviewed**: Updates database status with visual badge confirmation.
     - **Dismiss**: Prompts confirmation modal and moves recommendation to Dismissed state.
     - **Test in Simulator**: Deep links scenario parameters into the What-If Simulator.
     - **Filter Bar**: Dynamic filtering by priority and lifecycle status (`Active`, `New`, `Reviewed`, `Dismissed`, `Resolved`, `All`).
   - **REST API Endpoints**:
     - `GET /api/recommendations?status=&priority=&limit=`
     - `GET /api/recommendations/summary`
     - `GET /api/recommendations/<id>`
     - `POST /api/recommendations/refresh`
     - `PATCH /api/recommendations/<id>/status`
     - `POST /api/recommendations/<id>/apply`

8. **What-If Scenario Simulator (`/simulator`)**:
   - **Hypothetical Financial Decision Modeling**: Answers *"If I change this payment, income, or expense, will my business have enough cash in the coming days?"* by executing identical deterministic forecasting calculations on in-memory copies of financial data.
   - **Scenario Controls (4 Adjustment Types)**:
     - *Customer Payment Changes*: Shift expected collection date earlier/later, adjust expected collection amounts without altering actual invoices, recorded histories, or due dates.
     - *Supplier Payment Changes*: Move vendor bill settlement earlier/later to evaluate working capital impacts without modifying actual bills or assuming supplier consent.
     - *Additional Hypothetical Income*: Model expected contracts, customer advances, or asset sales on specific dates.
     - *Additional Hypothetical Expenses*: Model planned capital equipment purchases, bulk inventory orders, or emergency maintenance costs.
   - **Baseline vs. Scenario Comparison**:
     - Projected ending cash balance with delta
     - Lowest projected balance with delta and trough dates
     - First date balance falls below minimum cash buffer
     - First date projected balance becomes negative (deficit)
     - Potential cash-buffer shortfall with delta
     - Projected total inflows, outflows, and net movement with deltas
     - Overall Risk level (`Critical`, `High`, `Moderate`, `Healthy`) with improvement indicator
   - **Interactive Dual-Series Visualization**: Recharts comparison showing Baseline (dashed) vs. Scenario (solid line), minimum cash buffer reference line, ₹0 deficit line, and interactive tooltips with exact balances. Supports 7, 30, and 60 days horizons.
   - **Database-Backed Scenario Management**:
     - Save named scenarios with custom descriptions and multiple adjustments.
     - Open, edit, and recalculate saved scenarios.
     - Duplicate scenarios with a single click to branch and test alternative decisions.
     - Delete scenarios with confirmation dialog.
   - **Critical Data Integrity Guarantee**:
     - Zero mutation of real transactions, customer invoices, supplier bills, payment history, or opening cash balance settings.
     - All scenario runs apply strictly in memory.
     - Labeled explicitly as *hypothetical projections, not guaranteed outcomes*.
   - **REST API Endpoints**:
     - `GET /api/scenarios` — List saved scenarios
     - `POST /api/scenarios` — Create and persist a scenario with adjustments
     - `GET /api/scenarios/<id>` — Retrieve saved scenario and adjustments
     - `PUT /api/scenarios/<id>` — Update scenario details and adjustments
     - `DELETE /api/scenarios/<id>` — Delete scenario and adjustments
     - `POST /api/scenarios/preview?days=30` — In-memory hypothetical preview without saving
     - `POST /api/scenarios/<id>/duplicate` — Duplicate saved scenario
     - `GET /api/scenarios/<id>/comparison?days=30` — Compare saved scenario against current baseline

9. **Data Import & Payment Reconciliation Center (`/imports`)**:
   - **A. Bank Statement Import (CSV & Excel)**:
     - Supports `.csv`, `.xlsx`, and `.xls` files.
     - Drag-and-drop file upload with size, name, and total row indicators.
     - Intelligent column auto-mapping (Transaction Date, Description, Amount, Debit/Credit, Reference Number, Balance) with custom dropdown override.
     - Flexible amount layout: single Amount column (sign or type-based) OR separate Debit/Credit columns.
     - Flexible date format parsing (auto-detect or explicit `%Y-%m-%d`, `%d/%m/%Y`, `%m/%d/%Y`, `%d-%m-%Y`).
     - Row-level validation: tracks valid rows, malformed rows, and possible duplicate entries before import.
     - Duplicate detection prevents double-insertion of existing statements.
     - Never silently drops invalid rows: provides downloadable CSV report of rejected rows with exact line numbers and reasons.
   - **B. Business Records Import (Invoices & Bills)**:
     - Import Customer Invoices (`receivables`) or Supplier Bills (`payables`) from CSV/Excel.
     - Maps invoice/bill numbers, customer/supplier names, dates, due dates, amounts, and initial payments.
     - Flags duplicates and prevents silent overwrites.
   - **C. Invoice & Bill Document Upload with OCR**:
     - Upload PDF invoices and image receipts (`.pdf`, `.jpg`, `.jpeg`, `.png`, up to 10MB).
     - Text extraction: uses `pypdf` for digital PDFs; integrates with `pytesseract` / Tesseract OCR when available on system path with graceful setup guidance if uninstalled.
     - Intelligent candidate field extraction: Document type, invoice/bill number, counterparty name, document date, due date, total amount, tax amount, outstanding balance.
     - Editable review form allows MSME owners to correct and verify fields before saving.
     - User-controlled target creation: Create Receivable, Create Payable, or keep as Document Record Only.
   - **D. Payment Reconciliation**:
     - Compares bank transactions against open customer invoices and supplier bills.
     - Transparent rule-based match scoring: exact or close amounts, date proximity (±3, ±7 days), invoice/bill reference numbers, and counterparty names with explainable match reasons.
     - Confirmation workflow: 1-click match confirmation, manual candidate selector, and safe undo capability.
     - Prevents duplicate reconciliations and prevents double-counting cash movements.
   - **E. Import History & Audit Ledger**:
     - Full history of import batches (`import_batches`) with record counts, statuses, and one-click download of rejected rows.
   - **REST API Endpoints**:
     - `POST /api/imports/preview` — Upload and preview statement or business records
     - `POST /api/imports/confirm` — Persist validated rows into database
     - `GET /api/imports` — List import batch history
     - `GET /api/imports/<id>` — Batch details and row statistics
     - `GET /api/imports/<id>/errors/download` — Download CSV of rejected rows
     - `POST /api/documents/upload` — Upload invoice/bill document and extract fields
     - `GET /api/documents` — List uploaded documents
     - `GET /api/documents/<id>` — Document metadata and extracted fields
     - `PUT /api/documents/<id>/extracted-data` — Update candidate fields during review
     - `POST /api/documents/<id>/confirm` — Confirm document and create receivable/payable
     - `GET /api/reconciliation` — Reconciliation dashboard with smart suggestions
     - `POST /api/reconciliation/confirm` — Confirm reconciliation match
     - `POST /api/reconciliation/<id>/undo` — Safely undo reconciliation match
10. **Business Insights & Unit Economics (`/insights`)**:
    - Comprehensive operating burn analysis, working capital turnover, and expense concentration.
    - Key metrics: Average Daily Burn rate, Days Sales Outstanding (DSO) benchmark, and Net Monthly Cash Generation.
    - Trailing 30-day expense allocation breakdown by category.

11. **Executive Financial Health Reports (`/reports`)**:
    - Complete executive liquidity scorecard for leadership and lenders.
    - Health score (0–100), health status evaluation, safe reserve target, and runway projection.
    - Executive Advisory summary with prioritized recommendations.
    - Clean printer/PDF export formatting via browser print stylesheet.

12. **Settings & Financial Profile (`/settings`)**:
    - Direct configuration of business profile: Business Name, Industry, Currency (`₹`).
    - Configurable Starting Cash Position and Minimum Cash Buffer with immediate database persistence in SQLite (`forecast_settings`).
    - Modifies baseline for all downstream forecasting, risk, and recommendation models without requiring server restart.

---

## 🧪 Comprehensive Automated Test Suite (44 Tests)

CashFlow AI features a 100% passing automated test suite with 44 unit and deterministic integration tests across all financial workflows:

```powershell
# Run the entire test suite in one command:
.\backend\venv\Scripts\python.exe -m unittest discover -s backend -p "test_*.py"
```

### Test Coverage Highlights:
1. **Deterministic Financial Pipeline (`test_deterministic_pipeline.py`)**:
   - Isolated in-memory database execution to guarantee no mutation of real business records.
   - Exact benchmark verification: Opening balance ₹50,000, Buffer ₹20,000, Day 3 Inflow ₹30,000, Day 5 Outflow ₹40,000 $\rightarrow$ Day 3 ₹80,000, Day 5 ₹40,000, status `Healthy`.
   - High Risk buffer-shortfall calculation without negative balance.
   - Critical Risk negative cash deficit separation from buffer shortfall.
   - Partial payment outstanding balance accounting.
   - What-If Simulator in-memory isolation guarantee.
2. **Forecast Engine (`test_forecast_engine.py`)**: Multi-horizon 7/30/60-day timelines, settings persistence, double-counting prevention.
3. **AI Risk Center (`test_risk_center.py`)**: Risk classification precedence, timing mismatch cause detection, alert resolution.
4. **AI Recommendations (`test_recommendations.py`)**: Rule-based generation, lifecycle status persistence (`REVIEWED`, `DISMISSED`).
5. **What-If Simulator (`test_scenarios.py`)**: Scenario CRUD, preview calculations, branching duplication.
6. **Data Import & Reconciliation (`test_imports_reconciliation.py`)**: CSV/Excel parsing, candidate column mapping, duplicate detection, payment reconciliation matching, and safe undo.
7. **Receivables & Payables (`test_receivables_payables.py`)**: Invoice/bill lifecycle, partial payment tracking, overdue status derivation.
8. **Transactions API (`test_transactions_api.py`)**: Transaction CRUD, search/filter, and balance updates.

---

## 📷 Document OCR Setup & Fallbacks

CashFlow AI supports invoice and receipt document processing out-of-the-box:

1. **Digital PDF Invoices**: Processed automatically using `pypdf` (pre-installed in Python requirements). Extracts raw text, line items, and financial amounts directly without external OCR software.
2. **Scanned Images (`.jpg`, `.png`, `.jpeg`)**:
   - Uses `pytesseract` and Pillow.
   - **Tesseract OCR (Optional)**: If you wish to enable scanned image OCR on Windows:
     1. Download the Windows installer from [UB-Mannheim Tesseract OCR](https://github.com/UB-Mannheim/tesseract/wiki).
     2. Install to default path `C:\Program Files\Tesseract-OCR\tesseract.exe`.
     3. Add `C:\Program Files\Tesseract-OCR` to your Windows system `PATH`.
   - **Graceful Fallback**: If Tesseract is not installed on the host machine, the application does not crash. It displays an informative setup guide with manual editable fields, allowing MSME users to review and confirm the invoice values directly.

---

## 🎬 10-Step Hackathon & Demo Walkthrough

Follow this deterministic script to demonstrate CashFlow AI within 5 minutes without paid APIs or external dependencies:

| Step | Action | Feature Highlighted |
| :--- | :--- | :--- |
| **1** | Open `http://localhost:5173` | **Dashboard**: Review opening balance (₹8,42,500), 30-day runway, and Health Index gauge. |
| **2** | Navigate to **Cash Forecast** (`/forecast`) | **Forecasting Engine**: View the 30-day projected cash balance curve, safe buffer line (₹5,00,000), and day-by-day table. |
| **3** | Notice a dip below buffer | **Early-Warning**: Point out the lowest projected balance and the first risk date highlighted in amber/red. |
| **4** | Click **AI Risk Center** (`/risks`) | **Root Cause Analysis**: Inspect "Why Is My Cash at Risk?" — show the timing mismatch between supplier bills and customer invoices. |
| **5** | Click **AI Recommendations** (`/recommendations`) | **Actionable Intelligence**: Review prioritized action card advising invoice follow-up or payment window adjustments. |
| **6** | Click **"Test in Simulator"** on a card | **Simulator Deep-Link**: Opens the **What-If Simulator** (`/simulator`) with the recommended adjustment pre-configured. |
| **7** | Click **"Run Simulation"** | **Hypothetical Modeling**: Recharts displays Baseline vs. Scenario curves; ending cash increases and risk drops from High to Healthy. |
| **8** | Save the scenario as *"Q4 Liquidity Plan"* | **Scenario Persistence**: Saves to database; demonstrate that real receivables and payables remain 100% untouched. |
| **9** | Go to **Data Import** (`/imports`) $\rightarrow$ Upload `sample_data/demo_bank_statement.csv` | **Import Center**: Show auto-column mapping preview, duplicate detection check, and confirm import into the ledger. |
| **10** | Open **Reconcile Payments** tab | **Smart Reconciliation**: Match a statement transaction against an open invoice, confirm reconciliation, and show updated cash position. |

---

## 🔒 Security & Data Integrity

- **SQL Injection Prevention**: All SQLite queries use parameterized placeholders (`?`).
- **File Upload Security**: Uploaded files use `secure_filename`, restricted allowed extensions (`.csv`, `.xlsx`, `.xls`, `.pdf`, `.png`, `.jpg`, `.jpeg`), and a 10MB size limit. Stored safely in `backend/uploads`.
- **Non-Mutation Guarantees**: What-If scenario simulations run in-memory; actual financial records cannot be corrupted by scenario testing.
- **Double-Counting Protection**: Reconciled transactions and customer/vendor payment tranches are explicitly deduplicated from future forecast projections.
- **Explainable Rule-Based Systems**: No fabricated AI/ML scores; all risk flags and recommendations provide traceable arithmetic justification.

---

## ⚠️ Known Limitations

1. **Single-Tenant MSME Architecture**: Currently configured for a single business profile stored in SQLite. Multi-tenant multi-user authentication can be added via JWT tokens.
2. **Local Image OCR**: Scanned raster image OCR requires the host machine to have Tesseract binary installed; digital PDFs are extracted natively via `pypdf`.
3. **Database Concurrency**: Uses SQLite with WAL mode (`PRAGMA journal_mode=WAL`), optimized for small-to-medium enterprise workloads. For high-concurrency cloud deployments, the SQLAlchemy or PostgreSQL backend driver can be swapped in `backend/config.py`.

