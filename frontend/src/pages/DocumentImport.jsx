import React, { useState, useEffect } from 'react';
import {
  UploadCloud,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  FileText,
  Sparkles,
  ArrowRight,
  RotateCcw,
  Download,
  Search,
  Filter,
  Eye,
  Check,
  RefreshCw,
  Building2,
  Receipt,
  FileSpreadsheet,
  Layers,
  HelpCircle,
  Link2
} from 'lucide-react';
import Button from '../components/common/Button';
import Badge from '../components/common/Badge';
import { api } from '../api/client';

export default function DocumentImport({ onRefreshApp }) {
  const [activeTab, setActiveTab] = useState('bank'); // 'bank', 'business', 'ocr', 'reconciliation', 'history'

  // Global feedback alerts
  const [successMsg, setSuccessMsg] = useState(null);
  const [errorMsg, setErrorMsg] = useState(null);

  // -------------------------------------------------------------
  // TAB 1: BANK STATEMENT IMPORT STATE
  // -------------------------------------------------------------
  const [bankFile, setBankFile] = useState(null);
  const [bankLoading, setBankLoading] = useState(false);
  const [bankPreview, setBankPreview] = useState(null);
  const [bankMapping, setBankMapping] = useState({});
  const [bankAmountMode, setBankAmountMode] = useState('single'); // 'single' or 'split'
  const [bankDateFormat, setBankDateFormat] = useState('');
  const [bankSkipDuplicates, setBankSkipDuplicates] = useState(true);
  const [bankConfirming, setBankConfirming] = useState(false);

  // -------------------------------------------------------------
  // TAB 2: BUSINESS RECORDS IMPORT STATE
  // -------------------------------------------------------------
  const [bizType, setBizType] = useState('receivable'); // 'receivable' or 'payable'
  const [bizFile, setBizFile] = useState(null);
  const [bizLoading, setBizLoading] = useState(false);
  const [bizPreview, setBizPreview] = useState(null);
  const [bizMapping, setBizMapping] = useState({});
  const [bizDateFormat, setBizDateFormat] = useState('');
  const [bizSkipDuplicates, setBizSkipDuplicates] = useState(true);
  const [bizConfirming, setBizConfirming] = useState(false);

  // -------------------------------------------------------------
  // TAB 3: DOCUMENT UPLOAD & OCR STATE
  // -------------------------------------------------------------
  const [ocrFile, setOcrFile] = useState(null);
  const [ocrDocName, setOcrDocName] = useState('');
  const [ocrLoading, setOcrLoading] = useState(false);
  const [uploadedDocs, setUploadedDocs] = useState([]);
  const [selectedDoc, setSelectedDoc] = useState(null);
  const [editableFields, setEditableFields] = useState({});
  const [actionTarget, setActionTarget] = useState('create_receivable'); // 'create_receivable', 'create_payable', 'document_only'
  const [ocrConfirming, setOcrConfirming] = useState(false);

  // -------------------------------------------------------------
  // TAB 4: PAYMENT RECONCILIATION STATE
  // -------------------------------------------------------------
  const [reconData, setReconData] = useState(null);
  const [reconFilter, setReconFilter] = useState('ALL'); // 'ALL', 'SUGGESTED', 'UNMATCHED', 'MATCHED'
  const [reconSearch, setReconSearch] = useState('');
  const [reconLoading, setReconLoading] = useState(false);
  const [manualMatchModal, setManualMatchModal] = useState(null); // transaction being manually matched
  const [selectedMatchCandidate, setSelectedMatchCandidate] = useState(null);

  // -------------------------------------------------------------
  // TAB 5: IMPORT HISTORY STATE
  // -------------------------------------------------------------
  const [batches, setBatches] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [selectedBatchErrors, setSelectedBatchErrors] = useState(null);

  // Load initial data based on active tab
  useEffect(() => {
    if (activeTab === 'ocr') {
      loadDocuments();
    } else if (activeTab === 'reconciliation') {
      loadReconciliation();
    } else if (activeTab === 'history') {
      loadBatches();
    }
  }, [activeTab]);

  const loadDocuments = async () => {
    try {
      const res = await api.getDocuments();
      setUploadedDocs(res.data || []);
    } catch (err) {
      console.error(err);
    }
  };

  const loadReconciliation = async () => {
    setReconLoading(true);
    try {
      const res = await api.getReconciliation({ status: reconFilter, search: reconSearch });
      setReconData(res.data || null);
    } catch (err) {
      setErrorMsg('Failed to load reconciliation data: ' + err.message);
    } finally {
      setReconLoading(false);
    }
  };

  const loadBatches = async () => {
    setHistoryLoading(true);
    try {
      const res = await api.getImportBatches();
      setBatches(res.data || []);
    } catch (err) {
      setErrorMsg('Failed to load import history: ' + err.message);
    } finally {
      setHistoryLoading(false);
    }
  };

  // Helper format currency
  const formatINR = (val) => {
    const num = Number(val) || 0;
    return '₹' + num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  // -------------------------------------------------------------
  // HANDLERS: TAB 1 (BANK STATEMENT)
  // -------------------------------------------------------------
  const handleBankFileSelect = (e) => {
    const file = e.target.files[0];
    if (file) {
      setBankFile(file);
      setBankPreview(null);
      handleBankPreview(file);
    }
  };

  const handleBankPreview = async (fileToPreview, explicitMapping = null) => {
    const file = fileToPreview || bankFile;
    if (!file) return;
    setBankLoading(true);
    setErrorMsg(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('import_type', 'bank_statement');
      if (explicitMapping) {
        formData.append('column_mapping', JSON.stringify(explicitMapping));
      }
      if (bankDateFormat) {
        formData.append('date_format', bankDateFormat);
      }

      const res = await api.previewImport(formData);
      setBankPreview(res.data);
      const eff = res.data.effective_mapping || {};
      setBankMapping(eff);
      if (eff.debit || eff.credit) {
        setBankAmountMode('split');
      } else {
        setBankAmountMode('single');
      }
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setBankLoading(false);
    }
  };

  const handleBankConfirm = async () => {
    if (!bankPreview) return;
    setBankConfirming(true);
    setErrorMsg(null);
    try {
      const res = await api.confirmImport({
        token: bankPreview.token,
        filename: bankPreview.filename,
        import_type: 'bank_statement',
        column_mapping: bankMapping,
        date_format: bankDateFormat || null,
        skip_duplicates: bankSkipDuplicates
      });
      setSuccessMsg(`Successfully imported ${res.data.imported_rows} bank transactions into the ledger!`);
      setBankFile(null);
      setBankPreview(null);
      if (onRefreshApp) onRefreshApp();
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setBankConfirming(false);
    }
  };

  const handleImportSample = async () => {
    setBankLoading(true);
    setErrorMsg(null);
    try {
      const res = await api.importSampleStatement();
      setSuccessMsg(res.message);
      if (onRefreshApp) onRefreshApp();
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setBankLoading(false);
    }
  };

  // -------------------------------------------------------------
  // HANDLERS: TAB 2 (BUSINESS RECORDS)
  // -------------------------------------------------------------
  const handleBizFileSelect = (e) => {
    const file = e.target.files[0];
    if (file) {
      setBizFile(file);
      setBizPreview(null);
      handleBizPreview(file);
    }
  };

  const handleBizPreview = async (fileToPreview, explicitMapping = null) => {
    const file = fileToPreview || bizFile;
    if (!file) return;
    setBizLoading(true);
    setErrorMsg(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('import_type', bizType);
      if (explicitMapping) {
        formData.append('column_mapping', JSON.stringify(explicitMapping));
      }
      if (bizDateFormat) {
        formData.append('date_format', bizDateFormat);
      }

      const res = await api.previewImport(formData);
      setBizPreview(res.data);
      setBizMapping(res.data.effective_mapping || {});
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setBizLoading(false);
    }
  };

  const handleBizConfirm = async () => {
    if (!bizPreview) return;
    setBizConfirming(true);
    setErrorMsg(null);
    try {
      const res = await api.confirmImport({
        token: bizPreview.token,
        filename: bizPreview.filename,
        import_type: bizType,
        column_mapping: bizMapping,
        date_format: bizDateFormat || null,
        skip_duplicates: bizSkipDuplicates
      });
      setSuccessMsg(`Successfully imported ${res.data.imported_rows} ${bizType}s!`);
      setBizFile(null);
      setBizPreview(null);
      if (onRefreshApp) onRefreshApp();
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setBizConfirming(false);
    }
  };

  // -------------------------------------------------------------
  // HANDLERS: TAB 3 (DOCUMENT OCR)
  // -------------------------------------------------------------
  const handleOcrUpload = async (e) => {
    e.preventDefault();
    if (!ocrFile) return;
    setOcrLoading(true);
    setErrorMsg(null);
    try {
      const formData = new FormData();
      formData.append('file', ocrFile);
      if (ocrDocName) formData.append('document_name', ocrDocName);

      const res = await api.uploadDocument(formData);
      setSuccessMsg("Document uploaded and text extracted. Please review extracted fields below.");
      setOcrFile(null);
      setOcrDocName('');
      loadDocuments();
      setSelectedDoc(res.data);
      const fields = res.data.extracted_data?.fields || {};
      setEditableFields(fields);
      if (fields.document_type === 'bill') {
        setActionTarget('create_payable');
      } else {
        setActionTarget('create_receivable');
      }
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setOcrLoading(false);
    }
  };

  const handleConfirmDocument = async () => {
    if (!selectedDoc) return;
    setOcrConfirming(true);
    setErrorMsg(null);
    try {
      await api.confirmDocument(selectedDoc.id, {
        action_target: actionTarget,
        fields: editableFields
      });
      setSuccessMsg(`Document confirmed and created as ${actionTarget.replace('_', ' ')}!`);
      loadDocuments();
      setSelectedDoc(null);
      if (onRefreshApp) onRefreshApp();
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setOcrConfirming(false);
    }
  };

  // -------------------------------------------------------------
  // HANDLERS: TAB 4 (RECONCILIATION)
  // -------------------------------------------------------------
  const handleConfirmMatch = async (txId, matchedType, matchedRecordId) => {
    try {
      await api.confirmReconciliation({
        transaction_id: txId,
        matched_type: matchedType,
        matched_record_id: matchedRecordId,
        notes: "Matched in Reconciliation Center"
      });
      setSuccessMsg(`Transaction #${txId} reconciled successfully against ${matchedType} #${matchedRecordId}!`);
      loadReconciliation();
      if (onRefreshApp) onRefreshApp();
    } catch (err) {
      setErrorMsg(err.message);
    }
  };

  const handleUndoMatch = async (txId) => {
    if (!window.confirm("Undo reconciliation for this transaction? This will restore the invoice/bill outstanding balance.")) return;
    try {
      await api.undoReconciliation(txId);
      setSuccessMsg(`Reconciliation for transaction #${txId} safely undone.`);
      loadReconciliation();
      if (onRefreshApp) onRefreshApp();
    } catch (err) {
      setErrorMsg(err.message);
    }
  };

  return (
    <div className="space-y-5 animate-fade-fast max-w-7xl mx-auto pb-12">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-stone-200 pb-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-stone-900">Data Import & Reconciliation Center</h1>
          <p className="text-xs text-stone-600 mt-1">
            Ingest bank statements, import invoices and bills from Excel/CSV, extract document text via OCR, and reconcile transactions.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            icon={Sparkles}
            onClick={handleImportSample}
            loading={bankLoading}
          >
            Load Demo Bank Records
          </Button>
        </div>
      </div>

      {/* Alert Banners */}
      {successMsg && (
        <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 flex items-center justify-between animate-fade-fast">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span className="text-xs font-semibold">{successMsg}</span>
          </div>
          <button onClick={() => setSuccessMsg(null)} className="text-emerald-700 hover:text-emerald-900 text-xs">✕</button>
        </div>
      )}

      {errorMsg && (
        <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 flex items-center justify-between animate-fade-fast">
          <div className="flex items-center gap-2">
            <XCircle className="w-4 h-4 text-rose-600 shrink-0" />
            <span className="text-xs font-semibold">{errorMsg}</span>
          </div>
          <button onClick={() => setErrorMsg(null)} className="text-rose-700 hover:text-rose-900 text-xs">✕</button>
        </div>
      )}

      {/* Tab Navigation */}
      <div className="flex border-b border-stone-200 gap-1 overflow-x-auto pb-px">
        {[
          { id: 'bank', label: 'Bank Statement Import', icon: FileSpreadsheet },
          { id: 'business', label: 'Business Records Import', icon: Building2 },
          { id: 'ocr', label: 'Invoice & Bill OCR', icon: Receipt },
          { id: 'reconciliation', label: 'Payment Reconciliation', icon: Link2 },
          { id: 'history', label: 'Import History', icon: Layers }
        ].map(tab => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => { setActiveTab(tab.id); setErrorMsg(null); setSuccessMsg(null); }}
              className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold border-b-2 whitespace-nowrap transition-all duration-150 ${
                isActive
                  ? 'border-blue-600 text-blue-700 bg-blue-50/50'
                  : 'border-transparent text-stone-600 hover:text-stone-900 hover:border-stone-300'
              }`}
            >
              <Icon className={`w-4 h-4 ${isActive ? 'text-blue-600' : 'text-stone-400'}`} />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* ========================================================= */}
      {/* TAB 1: BANK STATEMENT IMPORT */}
      {/* ========================================================= */}
      {activeTab === 'bank' && (
        <div className="space-y-6">
          {!bankPreview ? (
            /* Upload Dropzone */
            <div className="p-10 rounded-2xl bg-white border-2 border-dashed border-stone-300 hover:border-blue-500 transition-all text-center space-y-4 shadow-sm">
              <div className="w-16 h-16 rounded-2xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600 mx-auto">
                <UploadCloud className="w-8 h-8" />
              </div>
              <div className="max-w-md mx-auto">
                <h3 className="text-base font-bold text-stone-900">Upload Bank Statement</h3>
                <p className="text-xs text-stone-500 mt-1">
                  Supports CSV, XLSX, and XLS formats from HDFC, SBI, ICICI, Axis, or international banks.
                </p>
              </div>

              <div className="flex items-center justify-center gap-3">
                <label className="cursor-pointer">
                  <span className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 text-white text-xs font-semibold shadow hover:bg-blue-700 transition">
                    <FileSpreadsheet className="w-4 h-4" /> Browse CSV / Excel File
                  </span>
                  <input
                    type="file"
                    className="hidden"
                    accept=".csv, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel"
                    onChange={handleBankFileSelect}
                  />
                </label>
              </div>

              <div className="pt-4 border-t border-stone-100 flex items-center justify-center gap-6 text-[11px] text-stone-400">
                <span>✓ Automatic column detection</span>
                <span>✓ Duplicate transaction detection</span>
                <span>✓ Safe preview before save</span>
              </div>
            </div>
          ) : (
            /* Preview & Mapping Step */
            <div className="space-y-6 animate-fade-fast">
              {/* File Summary Card */}
              <div className="p-4 rounded-xl bg-white border border-stone-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
                    <FileSpreadsheet className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-stone-900">{bankPreview.filename}</h3>
                    <p className="text-xs text-stone-500">
                      {(bankPreview.file_size / 1024).toFixed(1)} KB • {bankPreview.total_rows} total statement lines
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Button variant="secondary" size="sm" onClick={() => { setBankPreview(null); setBankFile(null); }}>
                    Choose Different File
                  </Button>
                  <Button
                    variant="primary"
                    size="sm"
                    loading={bankConfirming}
                    onClick={handleBankConfirm}
                    disabled={!bankPreview.has_mapping || bankPreview.valid_count === 0}
                  >
                    Confirm & Import {bankPreview.valid_count} Records
                  </Button>
                </div>
              </div>

              {/* Validation Metrics Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3.5 rounded-xl bg-white border border-stone-200 shadow-2xs">
                  <p className="text-[11px] font-semibold text-stone-500 uppercase">Total Rows</p>
                  <p className="text-xl font-bold text-stone-900 mt-1">{bankPreview.total_rows}</p>
                </div>
                <div className="p-3.5 rounded-xl bg-emerald-50/60 border border-emerald-200 shadow-2xs">
                  <p className="text-[11px] font-semibold text-emerald-800 uppercase">Valid Rows</p>
                  <p className="text-xl font-bold text-emerald-700 mt-1">{bankPreview.valid_count}</p>
                </div>
                <div className="p-3.5 rounded-xl bg-amber-50/60 border border-amber-200 shadow-2xs">
                  <p className="text-[11px] font-semibold text-amber-800 uppercase">Possible Duplicates</p>
                  <p className="text-xl font-bold text-amber-700 mt-1">{bankPreview.duplicate_count}</p>
                </div>
                <div className="p-3.5 rounded-xl bg-rose-50/60 border border-rose-200 shadow-2xs">
                  <p className="text-[11px] font-semibold text-rose-800 uppercase">Invalid / Skipped</p>
                  <p className="text-xl font-bold text-rose-700 mt-1">{bankPreview.invalid_count}</p>
                </div>
              </div>

              {/* Column Mapping Section */}
              <div className="p-5 rounded-xl bg-white border border-stone-200 shadow-sm space-y-4">
                <div className="flex items-center justify-between border-b border-stone-100 pb-3">
                  <div>
                    <h3 className="text-sm font-bold text-stone-900">Column Mapping</h3>
                    <p className="text-xs text-stone-500">Match columns from your uploaded file to transaction fields.</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <label className="text-xs font-semibold text-stone-600 flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={bankSkipDuplicates}
                        onChange={e => setBankSkipDuplicates(e.target.checked)}
                        className="rounded text-blue-600"
                      />
                      Skip identified duplicates
                    </label>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {/* Date Column */}
                  <div>
                    <label className="block text-xs font-semibold text-stone-700 mb-1">Transaction Date *</label>
                    <select
                      value={bankMapping.date || ''}
                      onChange={e => {
                        const updated = { ...bankMapping, date: e.target.value };
                        setBankMapping(updated);
                        handleBankPreview(bankFile, updated);
                      }}
                      className="w-full text-xs p-2 rounded-lg border border-stone-300 bg-white"
                    >
                      <option value="">-- Select Column --</option>
                      {bankPreview.columns.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>

                  {/* Description Column */}
                  <div>
                    <label className="block text-xs font-semibold text-stone-700 mb-1">Description / Narration</label>
                    <select
                      value={bankMapping.description || ''}
                      onChange={e => {
                        const updated = { ...bankMapping, description: e.target.value };
                        setBankMapping(updated);
                        handleBankPreview(bankFile, updated);
                      }}
                      className="w-full text-xs p-2 rounded-lg border border-stone-300 bg-white"
                    >
                      <option value="">-- Select Column --</option>
                      {bankPreview.columns.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>

                  {/* Reference Column */}
                  <div>
                    <label className="block text-xs font-semibold text-stone-700 mb-1">Reference Number / UTR</label>
                    <select
                      value={bankMapping.reference || ''}
                      onChange={e => {
                        const updated = { ...bankMapping, reference: e.target.value };
                        setBankMapping(updated);
                        handleBankPreview(bankFile, updated);
                      }}
                      className="w-full text-xs p-2 rounded-lg border border-stone-300 bg-white"
                    >
                      <option value="">-- Select Column --</option>
                      {bankPreview.columns.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                </div>

                {/* Amount Mode Switcher */}
                <div className="pt-2 border-t border-stone-100">
                  <div className="flex items-center gap-4 mb-3">
                    <span className="text-xs font-semibold text-stone-700">Amount Layout:</span>
                    <label className="text-xs text-stone-700 flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="radio"
                        name="amt_mode"
                        value="single"
                        checked={bankAmountMode === 'single'}
                        onChange={() => setBankAmountMode('single')}
                      />
                      Single Amount Column
                    </label>
                    <label className="text-xs text-stone-700 flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="radio"
                        name="amt_mode"
                        value="split"
                        checked={bankAmountMode === 'split'}
                        onChange={() => setBankAmountMode('split')}
                      />
                      Separate Debit & Credit Columns
                    </label>
                  </div>

                  {bankAmountMode === 'single' ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-semibold text-stone-700 mb-1">Amount Column *</label>
                        <select
                          value={bankMapping.amount || ''}
                          onChange={e => {
                            const updated = { ...bankMapping, amount: e.target.value, debit: '', credit: '' };
                            setBankMapping(updated);
                            handleBankPreview(bankFile, updated);
                          }}
                          className="w-full text-xs p-2 rounded-lg border border-stone-300 bg-white"
                        >
                          <option value="">-- Select Column --</option>
                          {bankPreview.columns.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-stone-700 mb-1">Transaction Type Column (Optional)</label>
                        <select
                          value={bankMapping.type || ''}
                          onChange={e => {
                            const updated = { ...bankMapping, type: e.target.value };
                            setBankMapping(updated);
                            handleBankPreview(bankFile, updated);
                          }}
                          className="w-full text-xs p-2 rounded-lg border border-stone-300 bg-white"
                        >
                          <option value="">-- None / Sign based --</option>
                          {bankPreview.columns.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                      </div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-semibold text-stone-700 mb-1">Debit Column (Outflow) *</label>
                        <select
                          value={bankMapping.debit || ''}
                          onChange={e => {
                            const updated = { ...bankMapping, debit: e.target.value, amount: '' };
                            setBankMapping(updated);
                            handleBankPreview(bankFile, updated);
                          }}
                          className="w-full text-xs p-2 rounded-lg border border-stone-300 bg-white"
                        >
                          <option value="">-- Select Column --</option>
                          {bankPreview.columns.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-stone-700 mb-1">Credit Column (Inflow) *</label>
                        <select
                          value={bankMapping.credit || ''}
                          onChange={e => {
                            const updated = { ...bankMapping, credit: e.target.value, amount: '' };
                            setBankMapping(updated);
                            handleBankPreview(bankFile, updated);
                          }}
                          className="w-full text-xs p-2 rounded-lg border border-stone-300 bg-white"
                        >
                          <option value="">-- Select Column --</option>
                          {bankPreview.columns.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Sample Valid Rows Table */}
              <div className="p-5 rounded-xl bg-white border border-stone-200 shadow-sm space-y-3">
                <h3 className="text-sm font-bold text-stone-900">Preview Parsed Transactions (First 5 Rows)</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-stone-200 text-stone-500 font-semibold">
                        <th className="py-2 px-3">Date</th>
                        <th className="py-2 px-3">Description</th>
                        <th className="py-2 px-3">Direction</th>
                        <th className="py-2 px-3 text-right">Amount</th>
                        <th className="py-2 px-3">Reference</th>
                        <th className="py-2 px-3">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-100">
                      {bankPreview.sample_valid_rows && bankPreview.sample_valid_rows.length > 0 ? (
                        bankPreview.sample_valid_rows.map((row, idx) => (
                          <tr key={idx} className="hover:bg-stone-50/50">
                            <td className="py-2 px-3 font-mono">{row.date}</td>
                            <td className="py-2 px-3 text-stone-900 font-medium">{row.description}</td>
                            <td className="py-2 px-3">
                              <Badge variant={row.type === 'INFLOW' ? 'success' : 'danger'}>
                                {row.type}
                              </Badge>
                            </td>
                            <td className={`py-2 px-3 text-right font-mono font-semibold ${row.type === 'INFLOW' ? 'text-emerald-700' : 'text-stone-900'}`}>
                              {formatINR(row.amount)}
                            </td>
                            <td className="py-2 px-3 text-stone-500 font-mono text-[11px]">{row.reference || '-'}</td>
                            <td className="py-2 px-3">
                              {row.is_duplicate ? (
                                <Badge variant="warning">Duplicate</Badge>
                              ) : (
                                <Badge variant="success">Valid</Badge>
                              )}
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan="6" className="py-4 text-center text-stone-400">
                            Configure required column mappings above to preview parsed rows.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Sample Row Errors (If Any) */}
              {bankPreview.sample_errors && bankPreview.sample_errors.length > 0 && (
                <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 space-y-2">
                  <div className="flex items-center gap-2 text-rose-800 font-bold text-xs">
                    <AlertTriangle className="w-4 h-4 text-rose-600" />
                    <span>Row Validation Issues ({bankPreview.invalid_count} rejected rows will not be imported)</span>
                  </div>
                  <ul className="text-xs text-rose-700 space-y-1 pl-6 list-disc">
                    {bankPreview.sample_errors.slice(0, 5).map((err, idx) => (
                      <li key={idx}>Row #{err.row}: {err.error}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ========================================================= */}
      {/* TAB 2: BUSINESS RECORDS IMPORT */}
      {/* ========================================================= */}
      {activeTab === 'business' && (
        <div className="space-y-6">
          {/* Sub Switcher */}
          <div className="flex items-center gap-2 p-1 bg-stone-100 rounded-xl max-w-md">
            <button
              onClick={() => { setBizType('receivable'); setBizPreview(null); setBizFile(null); }}
              className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition ${
                bizType === 'receivable' ? 'bg-white text-stone-900 shadow-2xs' : 'text-stone-600 hover:text-stone-900'
              }`}
            >
              Customer Invoices (Receivables)
            </button>
            <button
              onClick={() => { setBizType('payable'); setBizPreview(null); setBizFile(null); }}
              className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition ${
                bizType === 'payable' ? 'bg-white text-stone-900 shadow-2xs' : 'text-stone-600 hover:text-stone-900'
              }`}
            >
              Supplier Bills (Payables)
            </button>
          </div>

          {!bizPreview ? (
            <div className="p-10 rounded-2xl bg-white border-2 border-dashed border-stone-300 hover:border-blue-500 transition-all text-center space-y-4 shadow-sm">
              <div className="w-16 h-16 rounded-2xl bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600 mx-auto">
                <Building2 className="w-8 h-8" />
              </div>
              <div className="max-w-md mx-auto">
                <h3 className="text-base font-bold text-stone-900">
                  Import {bizType === 'receivable' ? 'Customer Invoices' : 'Supplier Bills'}
                </h3>
                <p className="text-xs text-stone-500 mt-1">
                  Upload existing customer invoices or supplier obligations from your accounting software exports.
                </p>
              </div>

              <div className="flex items-center justify-center gap-3">
                <label className="cursor-pointer">
                  <span className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 text-white text-xs font-semibold shadow hover:bg-emerald-700 transition">
                    <FileSpreadsheet className="w-4 h-4" /> Browse CSV / Excel File
                  </span>
                  <input
                    type="file"
                    className="hidden"
                    accept=".csv, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel"
                    onChange={handleBizFileSelect}
                  />
                </label>
              </div>
            </div>
          ) : (
            <div className="space-y-6 animate-fade-fast">
              <div className="p-4 rounded-xl bg-white border border-stone-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-bold text-stone-900">{bizPreview.filename}</h3>
                  <p className="text-xs text-stone-500">
                    {bizPreview.total_rows} total rows • Importing as {bizType === 'receivable' ? 'Customer Invoices' : 'Supplier Bills'}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="secondary" size="sm" onClick={() => { setBizPreview(null); setBizFile(null); }}>
                    Choose Different File
                  </Button>
                  <Button
                    variant="primary"
                    size="sm"
                    loading={bizConfirming}
                    onClick={handleBizConfirm}
                    disabled={!bizPreview.has_mapping || bizPreview.valid_count === 0}
                  >
                    Confirm & Save {bizPreview.valid_count} Records
                  </Button>
                </div>
              </div>

              {/* Column Mapping Grid */}
              <div className="p-5 rounded-xl bg-white border border-stone-200 shadow-sm space-y-4">
                <div className="flex items-center justify-between border-b border-stone-100 pb-3">
                  <h3 className="text-sm font-bold text-stone-900">Field Mapping</h3>
                  <label className="text-xs font-semibold text-stone-600 flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={bizSkipDuplicates}
                      onChange={e => setBizSkipDuplicates(e.target.checked)}
                      className="rounded text-blue-600"
                    />
                    Skip existing record numbers
                  </label>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-stone-700 mb-1">
                      {bizType === 'receivable' ? 'Invoice Number *' : 'Bill Number *'}
                    </label>
                    <select
                      value={bizMapping[bizType === 'receivable' ? 'invoice_number' : 'bill_number'] || ''}
                      onChange={e => {
                        const k = bizType === 'receivable' ? 'invoice_number' : 'bill_number';
                        const updated = { ...bizMapping, [k]: e.target.value };
                        setBizMapping(updated);
                        handleBizPreview(bizFile, updated);
                      }}
                      className="w-full text-xs p-2 rounded-lg border border-stone-300 bg-white"
                    >
                      <option value="">-- Select Column --</option>
                      {bizPreview.columns.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-stone-700 mb-1">
                      {bizType === 'receivable' ? 'Customer Name *' : 'Supplier Name *'}
                    </label>
                    <select
                      value={bizMapping[bizType === 'receivable' ? 'customer_name' : 'supplier_name'] || ''}
                      onChange={e => {
                        const k = bizType === 'receivable' ? 'customer_name' : 'supplier_name';
                        const updated = { ...bizMapping, [k]: e.target.value };
                        setBizMapping(updated);
                        handleBizPreview(bizFile, updated);
                      }}
                      className="w-full text-xs p-2 rounded-lg border border-stone-300 bg-white"
                    >
                      <option value="">-- Select Column --</option>
                      {bizPreview.columns.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-stone-700 mb-1">Total Amount *</label>
                    <select
                      value={bizMapping.total_amount || ''}
                      onChange={e => {
                        const updated = { ...bizMapping, total_amount: e.target.value };
                        setBizMapping(updated);
                        handleBizPreview(bizFile, updated);
                      }}
                      className="w-full text-xs p-2 rounded-lg border border-stone-300 bg-white"
                    >
                      <option value="">-- Select Column --</option>
                      {bizPreview.columns.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-stone-700 mb-1">Due Date *</label>
                    <select
                      value={bizMapping.due_date || ''}
                      onChange={e => {
                        const updated = { ...bizMapping, due_date: e.target.value };
                        setBizMapping(updated);
                        handleBizPreview(bizFile, updated);
                      }}
                      className="w-full text-xs p-2 rounded-lg border border-stone-300 bg-white"
                    >
                      <option value="">-- Select Column --</option>
                      {bizPreview.columns.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ========================================================= */}
      {/* TAB 3: DOCUMENT UPLOAD & OCR */}
      {/* ========================================================= */}
      {activeTab === 'ocr' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Upload Form */}
            <div className="p-6 rounded-xl bg-white border border-stone-200 shadow-sm space-y-4">
              <h3 className="text-sm font-bold text-stone-900">Upload Invoices, Bills, or Receipts</h3>
              <p className="text-xs text-stone-500">
                Upload scanned or digital documents (PDF, JPG, PNG up to 10MB). Text is extracted and structured into editable candidate fields.
              </p>

              <form onSubmit={handleOcrUpload} className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-stone-700 mb-1">Document Label (Optional)</label>
                  <input
                    type="text"
                    value={ocrDocName}
                    onChange={e => setOcrDocName(e.target.value)}
                    placeholder="e.g. Orbit Aerospace Inv #9921"
                    className="w-full text-xs p-2.5 rounded-lg border border-stone-300"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-stone-700 mb-1">File (PDF, PNG, JPG) *</label>
                  <input
                    type="file"
                    accept=".pdf, image/png, image/jpeg, image/jpg"
                    onChange={e => setOcrFile(e.target.files[0])}
                    className="w-full text-xs p-2 border border-stone-200 rounded-lg bg-stone-50"
                  />
                </div>

                <Button
                  type="submit"
                  variant="primary"
                  size="sm"
                  loading={ocrLoading}
                  disabled={!ocrFile}
                  icon={Sparkles}
                >
                  Upload & Extract Text
                </Button>
              </form>

              <div className="p-3 rounded-lg bg-stone-50 border border-stone-200 text-[11px] text-stone-600 space-y-1">
                <p className="font-semibold text-stone-700">🔒 Data Integrity Rule:</p>
                <p>OCR extraction generates suggestions only. You can edit and review candidate fields before any financial transaction or record is created.</p>
              </div>
            </div>

            {/* Editable Review Form for Selected Document */}
            {selectedDoc ? (
              <div className="p-6 rounded-xl bg-white border border-blue-200 shadow-sm space-y-4 animate-fade-fast">
                <div className="flex items-center justify-between border-b border-stone-100 pb-3">
                  <div>
                    <h3 className="text-sm font-bold text-stone-900">Review Extracted Data</h3>
                    <p className="text-xs text-stone-500">{selectedDoc.original_filename}</p>
                  </div>
                  <Badge variant={selectedDoc.ocr_status === 'PROCESSED' ? 'success' : 'warning'}>
                    {selectedDoc.ocr_status}
                  </Badge>
                </div>

                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <label className="block font-semibold text-stone-700 mb-1">Invoice / Bill #</label>
                    <input
                      type="text"
                      value={editableFields.invoice_number || ''}
                      onChange={e => setEditableFields({ ...editableFields, invoice_number: e.target.value })}
                      className="w-full p-2 border rounded-lg bg-white"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-stone-700 mb-1">Counterparty Name</label>
                    <input
                      type="text"
                      value={editableFields.counterparty_name || ''}
                      onChange={e => setEditableFields({ ...editableFields, counterparty_name: e.target.value })}
                      className="w-full p-2 border rounded-lg bg-white"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-stone-700 mb-1">Document Date</label>
                    <input
                      type="date"
                      value={editableFields.document_date || ''}
                      onChange={e => setEditableFields({ ...editableFields, document_date: e.target.value })}
                      className="w-full p-2 border rounded-lg bg-white"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-stone-700 mb-1">Due Date</label>
                    <input
                      type="date"
                      value={editableFields.due_date || ''}
                      onChange={e => setEditableFields({ ...editableFields, due_date: e.target.value })}
                      className="w-full p-2 border rounded-lg bg-white"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-stone-700 mb-1">Total Amount (₹)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={editableFields.total_amount || ''}
                      onChange={e => setEditableFields({ ...editableFields, total_amount: parseFloat(e.target.value) || 0 })}
                      className="w-full p-2 border rounded-lg bg-white font-mono"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-stone-700 mb-1">Tax Amount (₹)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={editableFields.tax_amount || ''}
                      onChange={e => setEditableFields({ ...editableFields, tax_amount: parseFloat(e.target.value) || 0 })}
                      className="w-full p-2 border rounded-lg bg-white font-mono"
                    />
                  </div>
                </div>

                {/* Target Creation Action */}
                <div className="pt-3 border-t border-stone-100 space-y-2">
                  <label className="block text-xs font-semibold text-stone-800">Action on Confirmation:</label>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { id: 'create_receivable', label: 'Create Receivable' },
                      { id: 'create_payable', label: 'Create Payable' },
                      { id: 'document_only', label: 'Keep as Document' }
                    ].map(opt => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => setActionTarget(opt.id)}
                        className={`py-2 px-2.5 rounded-lg text-xs font-semibold border text-center transition ${
                          actionTarget === opt.id
                            ? 'bg-blue-600 text-white border-blue-600'
                            : 'bg-white text-stone-700 border-stone-200 hover:border-stone-300'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <Button variant="secondary" size="sm" onClick={() => setSelectedDoc(null)}>
                    Cancel
                  </Button>
                  <Button
                    variant="primary"
                    size="sm"
                    loading={ocrConfirming}
                    onClick={handleConfirmDocument}
                  >
                    Confirm & Save
                  </Button>
                </div>
              </div>
            ) : (
              <div className="p-8 rounded-xl bg-stone-50 border border-dashed border-stone-200 flex flex-col items-center justify-center text-center text-stone-400 text-xs">
                <Receipt className="w-8 h-8 mb-2 text-stone-300" />
                Select an uploaded document below or upload a new file to review extracted fields.
              </div>
            )}
          </div>

          {/* Uploaded Documents List */}
          <div className="p-5 rounded-xl bg-white border border-stone-200 shadow-sm space-y-3">
            <h3 className="text-sm font-bold text-stone-900">Uploaded Documents ({uploadedDocs.length})</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-stone-200 text-stone-500 font-semibold">
                    <th className="py-2.5 px-3">Document</th>
                    <th className="py-2.5 px-3">Type</th>
                    <th className="py-2.5 px-3">Date</th>
                    <th className="py-2.5 px-3">OCR Status</th>
                    <th className="py-2.5 px-3">Review Status</th>
                    <th className="py-2.5 px-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {uploadedDocs.map(doc => (
                    <tr key={doc.id} className="hover:bg-stone-50/50">
                      <td className="py-2.5 px-3 font-semibold text-stone-900">
                        {doc.document_name}
                        <span className="block text-[11px] font-normal text-stone-400">{doc.original_filename}</span>
                      </td>
                      <td className="py-2.5 px-3 uppercase text-[11px] font-mono text-stone-600">{doc.file_type}</td>
                      <td className="py-2.5 px-3 text-stone-500">{doc.created_at?.slice(0, 10)}</td>
                      <td className="py-2.5 px-3">
                        <Badge variant={doc.ocr_status === 'PROCESSED' ? 'success' : 'warning'}>
                          {doc.ocr_status}
                        </Badge>
                      </td>
                      <td className="py-2.5 px-3">
                        <Badge variant={doc.review_status === 'CONFIRMED' ? 'success' : 'default'}>
                          {doc.review_status}
                        </Badge>
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        <button
                          onClick={() => {
                            setSelectedDoc(doc);
                            setEditableFields(doc.extracted_data?.fields || {});
                          }}
                          className="text-xs text-blue-600 hover:text-blue-800 font-semibold"
                        >
                          Review & Edit
                        </button>
                      </td>
                    </tr>
                  ))}
                  {uploadedDocs.length === 0 && (
                    <tr>
                      <td colSpan="6" className="py-6 text-center text-stone-400">
                        No documents uploaded yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* TAB 4: PAYMENT RECONCILIATION */}
      {/* ========================================================= */}
      {activeTab === 'reconciliation' && (
        <div className="space-y-6">
          {/* Summary KPIs */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-4 rounded-xl bg-white border border-stone-200 shadow-2xs">
              <p className="text-[11px] font-semibold text-stone-500 uppercase">Unmatched Bank Entries</p>
              <p className="text-xl font-bold text-stone-900 mt-1">
                {reconData?.summary?.unmatched_count || 0}
              </p>
            </div>
            <div className="p-4 rounded-xl bg-blue-50/60 border border-blue-200 shadow-2xs">
              <p className="text-[11px] font-semibold text-blue-800 uppercase">Suggested Smart Matches</p>
              <p className="text-xl font-bold text-blue-700 mt-1">
                {reconData?.summary?.suggested_count || 0}
              </p>
            </div>
            <div className="p-4 rounded-xl bg-emerald-50/60 border border-emerald-200 shadow-2xs">
              <p className="text-[11px] font-semibold text-emerald-800 uppercase">Reconciled & Matched</p>
              <p className="text-xl font-bold text-emerald-700 mt-1">
                {reconData?.summary?.matched_count || 0}
              </p>
            </div>
            <div className="p-4 rounded-xl bg-purple-50/60 border border-purple-200 shadow-2xs">
              <p className="text-[11px] font-semibold text-purple-800 uppercase">Open Invoices & Bills</p>
              <p className="text-xl font-bold text-purple-700 mt-1">
                {(reconData?.summary?.open_receivables_count || 0) + (reconData?.summary?.open_payables_count || 0)}
              </p>
            </div>
          </div>

          {/* Filter Bar */}
          <div className="p-3 rounded-xl bg-white border border-stone-200 shadow-2xs flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="flex items-center gap-1 w-full sm:w-auto overflow-x-auto">
              {['ALL', 'SUGGESTED', 'UNMATCHED', 'MATCHED'].map(f => (
                <button
                  key={f}
                  onClick={() => { setReconFilter(f); }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                    reconFilter === f ? 'bg-stone-900 text-white' : 'text-stone-600 hover:bg-stone-100'
                  }`}
                >
                  {f === 'ALL' ? 'All Transactions' : f.charAt(0) + f.slice(1).toLowerCase()}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2 w-full sm:w-64">
              <div className="relative w-full">
                <Search className="w-3.5 h-3.5 text-stone-400 absolute left-2.5 top-2.5" />
                <input
                  type="text"
                  placeholder="Search narration or ref..."
                  value={reconSearch}
                  onChange={e => setReconSearch(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && loadReconciliation()}
                  className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border border-stone-200"
                />
              </div>
              <Button variant="secondary" size="sm" onClick={loadReconciliation} loading={reconLoading}>
                <RefreshCw className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>

          {/* Transactions Reconciliation Feed */}
          <div className="space-y-3">
            {reconData?.transactions && reconData.transactions.length > 0 ? (
              reconData.transactions.map(tx => {
                const isMatched = tx.reconciliation_status === 'MATCHED';
                const hasSuggestion = !isMatched && tx.suggestion;

                return (
                  <div
                    key={tx.id}
                    className={`p-4 rounded-xl bg-white border transition-all shadow-2xs ${
                      isMatched
                        ? 'border-emerald-200 bg-emerald-50/20'
                        : hasSuggestion
                        ? 'border-blue-200 bg-blue-50/10'
                        : 'border-stone-200'
                    }`}
                  >
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                      {/* Left: Bank Transaction Details */}
                      <div className="space-y-1 md:max-w-md">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-stone-900">{tx.description || tx.title}</span>
                          <Badge variant={tx.type === 'INFLOW' ? 'success' : 'danger'}>
                            {tx.type}
                          </Badge>
                          <Badge variant={isMatched ? 'success' : hasSuggestion ? 'info' : 'default'}>
                            {tx.reconciliation_status}
                          </Badge>
                        </div>
                        <p className="text-[11px] text-stone-500 font-mono">
                          {tx.transaction_date || tx.date} • Ref: {tx.reference_number || 'N/A'} • {tx.counterparty}
                        </p>
                      </div>

                      {/* Middle: Amount */}
                      <div className="text-left md:text-right">
                        <p className={`text-base font-bold font-mono ${tx.type === 'INFLOW' ? 'text-emerald-700' : 'text-stone-900'}`}>
                          {formatINR(tx.amount)}
                        </p>
                      </div>

                      {/* Right: Reconciliation Match Info & Actions */}
                      <div className="flex items-center gap-2 border-t md:border-t-0 pt-2 md:pt-0">
                        {isMatched ? (
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-semibold text-emerald-800 flex items-center gap-1">
                              <CheckCircle2 className="w-4 h-4 text-emerald-600" /> Reconciled
                            </span>
                            <Button
                              variant="secondary"
                              size="sm"
                              icon={RotateCcw}
                              onClick={() => handleUndoMatch(tx.id)}
                            >
                              Undo
                            </Button>
                          </div>
                        ) : hasSuggestion ? (
                          <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                            <div className="text-xs bg-blue-50 border border-blue-200 p-2 rounded-lg max-w-sm">
                              <div className="flex items-center justify-between gap-2">
                                <span className="font-bold text-blue-900">
                                  {tx.suggestion.matched_type === 'receivable' ? 'Invoice' : 'Bill'} #{tx.suggestion.matched_record_number}
                                </span>
                                <span className="text-[10px] bg-blue-200 text-blue-900 px-1.5 py-0.5 rounded font-mono font-bold">
                                  {tx.suggestion.confidence_score}% Match
                                </span>
                              </div>
                              <p className="text-[10px] text-blue-700 mt-0.5 line-clamp-1">{tx.suggestion.match_reason}</p>
                            </div>

                            <Button
                              variant="primary"
                              size="sm"
                              onClick={() => handleConfirmMatch(tx.id, tx.suggestion.matched_type, tx.suggestion.matched_record_id)}
                            >
                              Confirm Match
                            </Button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-stone-400">No match</span>
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => setManualMatchModal(tx)}
                            >
                              Match Manually
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="p-8 rounded-xl bg-white border border-stone-200 text-center text-xs text-stone-400">
                No transactions match the selected filter.
              </div>
            )}
          </div>

          {/* Manual Match Modal */}
          {manualMatchModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/40 backdrop-blur-xs p-4">
              <div className="bg-white rounded-2xl max-w-xl w-full p-6 shadow-xl space-y-4 animate-scale-up">
                <div className="flex items-center justify-between border-b pb-3">
                  <h3 className="text-sm font-bold text-stone-900">
                    Match Transaction #{manualMatchModal.id} ({formatINR(manualMatchModal.amount)})
                  </h3>
                  <button onClick={() => setManualMatchModal(null)} className="text-stone-400 hover:text-stone-700">✕</button>
                </div>

                <p className="text-xs text-stone-600">
                  Select an open {manualMatchModal.type === 'INFLOW' ? 'customer invoice' : 'supplier bill'} to match against this transaction:
                </p>

                <div className="max-h-60 overflow-y-auto space-y-2">
                  {(manualMatchModal.type === 'INFLOW' ? reconData?.open_receivables : reconData?.open_payables)?.map(cand => (
                    <div
                      key={cand.id}
                      onClick={() => setSelectedMatchCandidate(cand)}
                      className={`p-3 rounded-xl border text-xs cursor-pointer flex items-center justify-between transition ${
                        selectedMatchCandidate?.id === cand.id
                          ? 'border-blue-600 bg-blue-50/40'
                          : 'border-stone-200 hover:bg-stone-50'
                      }`}
                    >
                      <div>
                        <p className="font-bold text-stone-900">
                          {cand.invoice_number || cand.bill_number} • {cand.customer_name || cand.vendor_name}
                        </p>
                        <p className="text-[11px] text-stone-500 font-mono">Due: {cand.due_date}</p>
                      </div>
                      <div className="text-right">
                        <p className="font-bold font-mono text-stone-900">{formatINR(cand.outstanding_balance)}</p>
                        <span className="text-[10px] text-stone-400">outstanding</span>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="flex justify-end gap-2 pt-2 border-t">
                  <Button variant="secondary" size="sm" onClick={() => setManualMatchModal(null)}>Cancel</Button>
                  <Button
                    variant="primary"
                    size="sm"
                    disabled={!selectedMatchCandidate}
                    onClick={() => {
                      const type = manualMatchModal.type === 'INFLOW' ? 'receivable' : 'payable';
                      handleConfirmMatch(manualMatchModal.id, type, selectedMatchCandidate.id);
                      setManualMatchModal(null);
                      setSelectedMatchCandidate(null);
                    }}
                  >
                    Confirm Reconciliation
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ========================================================= */}
      {/* TAB 5: IMPORT HISTORY */}
      {/* ========================================================= */}
      {activeTab === 'history' && (
        <div className="space-y-4">
          <div className="p-5 rounded-xl bg-white border border-stone-200 shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-stone-900">Import Batches Audit Ledger</h3>
                <p className="text-xs text-stone-500">History of all imported statement files and business records.</p>
              </div>
              <Button variant="secondary" size="sm" icon={RefreshCw} onClick={loadBatches} loading={historyLoading}>
                Refresh
              </Button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-stone-200 text-stone-500 font-semibold">
                    <th className="py-2.5 px-3">Batch ID</th>
                    <th className="py-2.5 px-3">Type</th>
                    <th className="py-2.5 px-3">Filename</th>
                    <th className="py-2.5 px-3">Import Date</th>
                    <th className="py-2.5 px-3 text-right">Imported</th>
                    <th className="py-2.5 px-3 text-right">Duplicates</th>
                    <th className="py-2.5 px-3 text-right">Rejected</th>
                    <th className="py-2.5 px-3 text-right">Report</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {batches.map(b => (
                    <tr key={b.id} className="hover:bg-stone-50/50">
                      <td className="py-2.5 px-3 font-mono font-semibold text-stone-900">{b.batch_number}</td>
                      <td className="py-2.5 px-3 capitalize font-medium text-stone-700">
                        {b.import_type.replace('_', ' ')}
                      </td>
                      <td className="py-2.5 px-3 text-stone-600 max-w-xs truncate">{b.original_filename}</td>
                      <td className="py-2.5 px-3 text-stone-500 font-mono text-[11px]">{b.created_at?.slice(0, 16)}</td>
                      <td className="py-2.5 px-3 text-right font-mono font-bold text-emerald-700">+{b.imported_rows}</td>
                      <td className="py-2.5 px-3 text-right font-mono text-amber-700">{b.duplicate_rows}</td>
                      <td className="py-2.5 px-3 text-right font-mono text-rose-700">{b.invalid_rows}</td>
                      <td className="py-2.5 px-3 text-right">
                        {b.invalid_rows > 0 ? (
                          <a
                            href={`/api/imports/${b.id}/errors/download`}
                            download
                            className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-600 hover:text-blue-800"
                          >
                            <Download className="w-3 h-3" /> Download Rejected
                          </a>
                        ) : (
                          <span className="text-[11px] text-stone-400">Zero errors</span>
                        )}
                      </td>
                    </tr>
                  ))}
                  {batches.length === 0 && (
                    <tr>
                      <td colSpan="8" className="py-8 text-center text-stone-400">
                        No import batches found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
