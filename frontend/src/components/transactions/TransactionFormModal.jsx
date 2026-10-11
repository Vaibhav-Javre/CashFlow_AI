import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  ArrowDownLeft,
  ArrowUpRight,
  CheckCircle2,
  AlertCircle,
  Camera,
  UploadCloud,
  Sparkles,
  Key,
  RefreshCw,
  Eye,
  Check,
  FileText
} from 'lucide-react';
import Button from '../common/Button';
import CameraModal from '../common/CameraModal';
import GeminiKeyModal from '../common/GeminiKeyModal';
import { api } from '../../api/client';

const INCOME_CATEGORIES = [
  'Sales Revenue',
  'Customer Payment',
  'Service Income',
  'Other Income'
];

const EXPENSE_CATEGORIES = [
  'Inventory Purchase',
  'Supplier Payment',
  'Salary',
  'Rent',
  'Utilities',
  'Transportation',
  'Marketing',
  'Equipment',
  'Tax',
  'Other Expense'
];

const PAYMENT_METHODS = [
  'Bank Transfer',
  'UPI',
  'Cash',
  'Card',
  'Cheque',
  'Other'
];

const PAYMENT_STATUSES = [
  { value: 'Completed', label: 'Completed (Settled)' },
  { value: 'Pending', label: 'Pending (Expected)' },
  { value: 'Overdue', label: 'Overdue (Delayed)' }
];

export default function TransactionFormModal({
  isOpen,
  onClose,
  onSuccess,
  transactionToEdit = null,
  defaultType = 'Income'
}) {
  const isEditing = Boolean(transactionToEdit);

  const initialForm = {
    title: '',
    type: defaultType || 'Income',
    amount: '',
    transaction_date: new Date().toISOString().split('T')[0],
    category: (defaultType === 'Expense') ? 'Equipment' : 'Sales Revenue',
    payment_method: 'Bank Transfer',
    counterparty: '',
    description: '',
    payment_status: 'Completed',
    due_date: '',
    reference_number: ''
  };

  const [formData, setFormData] = useState(initialForm);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);
  const [validationErrors, setValidationErrors] = useState({});

  // AI Scanner state
  const [isCameraModalOpen, setIsCameraModalOpen] = useState(false);
  const [isKeyModalOpen, setIsKeyModalOpen] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [scanPreview, setScanPreview] = useState(null);
  const [scanMetadata, setScanMetadata] = useState(null);
  const [isGeminiActive, setIsGeminiActive] = useState(false);
  const [reviewRequired, setReviewRequired] = useState(false);

  const fileInputRef = useRef(null);

  // Check Gemini configuration status when modal opens
  const fetchGeminiStatus = async () => {
    try {
      const res = await api.getGeminiStatus();
      setIsGeminiActive(Boolean(res?.configured));
    } catch {
      setIsGeminiActive(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      setError(null);
      setSuccessMsg(null);
      setValidationErrors({});
      setScanPreview(null);
      setScanMetadata(null);
      setReviewRequired(false);
      fetchGeminiStatus();

      if (transactionToEdit) {
        const tType = (transactionToEdit.type === 'INFLOW' || transactionToEdit.type === 'Income') ? 'Income' : 'Expense';
        const defaultCat = tType === 'Income' ? 'Sales Revenue' : 'Inventory Purchase';

        setFormData({
          title: transactionToEdit.title || transactionToEdit.description || '',
          type: tType,
          amount: transactionToEdit.amount ? String(transactionToEdit.amount) : '',
          transaction_date: (transactionToEdit.transaction_date || transactionToEdit.date || '').slice(0, 10) || new Date().toISOString().split('T')[0],
          category: transactionToEdit.category || defaultCat,
          payment_method: transactionToEdit.payment_method || 'Bank Transfer',
          counterparty: transactionToEdit.counterparty || '',
          description: transactionToEdit.description || '',
          payment_status: transactionToEdit.payment_status || transactionToEdit.status || 'Completed',
          due_date: transactionToEdit.due_date ? String(transactionToEdit.due_date).slice(0, 10) : '',
          reference_number: transactionToEdit.reference_number || transactionToEdit.reference || ''
        });
      } else {
        const initType = defaultType || 'Income';
        setFormData({
          ...initialForm,
          type: initType,
          category: initType === 'Expense' ? 'Equipment' : 'Sales Revenue'
        });
      }
    }
  }, [isOpen, transactionToEdit, defaultType]);

  if (!isOpen) return null;

  const handleTypeChange = (newType) => {
    const currentCats = newType === 'Income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
    setFormData(prev => ({
      ...prev,
      type: newType,
      category: currentCats.includes(prev.category) ? prev.category : currentCats[0]
    }));
  };

  // Process image extraction from camera or file
  const processImageScan = async (payload, previewUrl, fileName = 'Document') => {
    try {
      setIsScanning(true);
      setError(null);
      setScanPreview(previewUrl);

      const res = await api.scanReceipt(payload);

      if (res && res.data) {
        const d = res.data;
        const currentCats = d.type === 'Income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
        const matchedCategory = currentCats.includes(d.category) ? d.category : currentCats[0];

        // Automatically fill form fields
        setFormData({
          title: d.title || (d.type === 'Income' ? 'Customer Invoice' : 'Supplier Bill'),
          type: d.type || 'Expense',
          amount: d.amount ? String(d.amount) : '',
          transaction_date: d.transaction_date || new Date().toISOString().split('T')[0],
          category: matchedCategory,
          payment_method: d.payment_method || 'Bank Transfer',
          counterparty: d.counterparty || '',
          description: d.description || `Scanned from ${fileName}`,
          payment_status: d.payment_status || 'Completed',
          due_date: d.due_date || '',
          reference_number: d.reference_number || ''
        });

        setScanMetadata({
          source: res.source,
          confidence: d.confidence || 0.9,
          geminiConfigured: res.gemini_configured,
          fileName,
          message: res.message
        });

        // Trigger the review step so user can check and modify
        setReviewRequired(true);
      } else {
        throw new Error(res.error || 'Failed to extract data from document.');
      }
    } catch (err) {
      console.error('Scan error:', err);
      setError(err.message || 'Error scanning photo. Please enter transaction details manually.');
    } finally {
      setIsScanning(false);
    }
  };

  // Handle live Camera capture
  const handleCameraCapture = (dataUrl) => {
    processImageScan({ image_data: dataUrl, filename: 'camera_capture.jpg' }, dataUrl, 'Camera Photo');
  };

  // Handle photo file upload
  const handleFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target.result;
      const formDataUpload = new FormData();
      formDataUpload.append('file', file);
      processImageScan(formDataUpload, dataUrl, file.name);
    };
    reader.readAsDataURL(file);

    // Reset file input so same file can be re-selected if needed
    e.target.value = '';
  };

  const handleClearScan = () => {
    setScanPreview(null);
    setScanMetadata(null);
    setReviewRequired(false);
  };

  const validate = () => {
    const errs = {};

    if (!formData.title || !formData.title.trim()) {
      errs.title = 'Transaction title is required';
    }

    if (!formData.amount || isNaN(formData.amount) || Number(formData.amount) <= 0) {
      errs.amount = 'Amount must be a positive number greater than ₹0';
    }

    if (!formData.transaction_date) {
      errs.transaction_date = 'Transaction date is required';
    } else {
      const d = new Date(formData.transaction_date);
      if (isNaN(d.getTime())) {
        errs.transaction_date = 'Invalid date format';
      }
    }

    if (formData.due_date) {
      const d = new Date(formData.due_date);
      if (isNaN(d.getTime())) {
        errs.due_date = 'Invalid due date format';
      }
    }

    if (!formData.category || !formData.category.trim()) {
      errs.category = 'Category is required';
    }

    setValidationErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (loading) return;

    if (!validate()) {
      setError('Please resolve the errors highlighted below.');
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const payload = {
        title: formData.title.trim(),
        type: formData.type,
        amount: parseFloat(formData.amount),
        transaction_date: formData.transaction_date,
        category: formData.category,
        payment_method: formData.payment_method,
        counterparty: formData.counterparty.trim(),
        description: formData.description.trim() || formData.title.trim(),
        payment_status: formData.payment_status,
        due_date: formData.due_date ? formData.due_date : null,
        reference_number: formData.reference_number.trim()
      };

      if (isEditing) {
        await api.updateTransaction(transactionToEdit.id, payload);
        setSuccessMsg('Transaction updated successfully!');
      } else {
        await api.createTransaction(payload);
        setSuccessMsg('Transaction recorded successfully!');
      }

      setTimeout(() => {
        if (onSuccess) onSuccess();
        onClose();
      }, 700);
    } catch (err) {
      setError(err.message || 'Failed to save transaction');
    } finally {
      setLoading(false);
    }
  };

  const categories = formData.type === 'Income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/40 backdrop-blur-xs overflow-y-auto animate-fade-fast">
        <div className="w-full max-w-xl bg-white border border-stone-200 rounded-2xl shadow-xl p-5 my-8 max-h-[92vh] overflow-y-auto animate-pop-fast">
          {/* Modal Header */}
          <div className="flex items-center justify-between pb-3 border-b border-stone-100">
            <div>
              <h3 className="text-base font-bold text-stone-900 flex items-center gap-2">
                {isEditing ? 'Edit Transaction' : 'Record Transaction Entry'}
              </h3>
              <p className="text-xs text-stone-500">
                {isEditing
                  ? 'Modify ledger transaction record'
                  : 'Capture bill/invoice with camera, upload a photo, or fill manually'}
              </p>
            </div>
            <button
              onClick={onClose}
              disabled={loading}
              className="p-1.5 rounded-lg text-stone-400 hover:text-stone-700 hover:bg-stone-100 transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* AI Scanner / Camera Action Bar (Only on New Transactions) */}
          {!isEditing && (
            <div className="mt-3.5 p-3.5 rounded-2xl bg-gradient-to-r from-stone-900 via-stone-850 to-stone-900 text-white shadow-sm border border-stone-800">
              <div className="flex items-center justify-between gap-2 mb-2.5">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
                    <Sparkles className="w-3.5 h-3.5" />
                  </div>
                  <div>
                    <span className="text-xs font-bold tracking-tight text-white flex items-center gap-1.5">
                      Smart AI Auto-Fill
                      <span className="text-[10px] font-normal px-1.5 py-0.2 bg-emerald-500/20 text-emerald-300 rounded border border-emerald-500/30">
                        {isGeminiActive ? 'Gemini Vision AI' : 'Standard OCR'}
                      </span>
                    </span>
                  </div>
                </div>

                {/* Configure Gemini API Key link */}
                <button
                  type="button"
                  onClick={() => setIsKeyModalOpen(true)}
                  className="text-[11px] text-stone-300 hover:text-white flex items-center gap-1 hover:underline cursor-pointer"
                  title="Configure Google Gemini API Key"
                >
                  <Key className="w-3 h-3 text-amber-400" />
                  <span>{isGeminiActive ? 'AI Key Active' : 'Setup Gemini API'}</span>
                </button>
              </div>

              {/* Action Buttons: Camera & Upload Photo */}
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setIsCameraModalOpen(true)}
                  disabled={isScanning}
                  className="py-2.5 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 active:scale-98 text-white font-semibold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer shadow-xs disabled:opacity-50"
                >
                  <Camera className="w-4 h-4" />
                  <span>Click with Camera</span>
                </button>

                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isScanning}
                  className="py-2.5 px-3 rounded-xl bg-stone-800 hover:bg-stone-700 active:scale-98 text-stone-100 font-semibold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer border border-stone-700 disabled:opacity-50"
                >
                  <UploadCloud className="w-4 h-4 text-stone-300" />
                  <span>Upload Photo / Bill</span>
                </button>
              </div>

              {/* Hidden file input for Photo Upload */}
              <input
                type="file"
                ref={fileInputRef}
                accept="image/*,application/pdf"
                className="hidden"
                onChange={handleFileUpload}
              />
            </div>
          )}

          {/* Scanning In-Progress Banner */}
          {isScanning && (
            <div className="mt-3 p-3.5 rounded-xl bg-indigo-50 border border-indigo-200 text-xs text-indigo-900 flex items-center gap-3 animate-pulse">
              <RefreshCw className="w-4 h-4 text-indigo-600 animate-spin shrink-0" />
              <div>
                <p className="font-bold text-indigo-950">AI is scanning your document...</p>
                <p className="text-[11px] text-indigo-700">Extracting vendor, amount, dates, invoice number, and category.</p>
              </div>
            </div>
          )}

          {/* Review & Confirm Extracted Document Banner */}
          {reviewRequired && !isScanning && (
            <div className="mt-3 p-3 rounded-xl bg-emerald-50/90 border border-emerald-200 text-xs text-emerald-950">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  <div>
                    <div className="font-bold text-emerald-900 flex items-center gap-2">
                      <span>Fields Automatically Filled from Photo!</span>
                      {scanMetadata?.confidence && (
                        <span className="text-[10px] font-semibold bg-emerald-200/80 text-emerald-800 px-1.5 py-0.2 rounded-full">
                          {Math.round(scanMetadata.confidence * 100)}% Match
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-emerald-800 mt-0.5">
                      Please review the extracted values below. You can make any changes or corrections before confirming.
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleClearScan}
                  className="text-[11px] text-stone-500 hover:text-stone-800 underline shrink-0 cursor-pointer"
                >
                  Clear scan
                </button>
              </div>

              {/* Thumbnail preview badge */}
              {scanPreview && (
                <div className="mt-2 pt-2 border-t border-emerald-200/60 flex items-center gap-2">
                  <img
                    src={scanPreview}
                    alt="Scanned thumbnail"
                    className="w-8 h-8 rounded object-cover border border-emerald-300"
                  />
                  <span className="text-[11px] text-stone-600 truncate max-w-xs font-mono">
                    {scanMetadata?.fileName || 'Scanned Document'}
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Success Alert */}
          {successMsg && (
            <div className="mt-3 p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 font-semibold flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{successMsg}</span>
            </div>
          )}

          {/* Error Alert */}
          {error && (
            <div className="mt-3 p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800 font-medium flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="mt-4 space-y-3.5 text-xs">
            {/* 1. Transaction Type Toggle */}
            <div>
              <label className="block text-stone-700 font-semibold mb-1.5">
                Transaction Type <span className="text-rose-500">*</span>
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => handleTypeChange('Income')}
                  className={`py-2 rounded-xl font-bold flex items-center justify-center gap-2 cursor-pointer transition-all ${
                    formData.type === 'Income'
                      ? 'bg-emerald-700 text-white shadow-xs'
                      : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
                  }`}
                >
                  <ArrowDownLeft className="w-4 h-4" /> Income (Money In / Invoice)
                </button>
                <button
                  type="button"
                  onClick={() => handleTypeChange('Expense')}
                  className={`py-2 rounded-xl font-bold flex items-center justify-center gap-2 cursor-pointer transition-all ${
                    formData.type === 'Expense'
                      ? 'bg-rose-700 text-white shadow-xs'
                      : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
                  }`}
                >
                  <ArrowUpRight className="w-4 h-4" /> Expense (Money Out / Bill)
                </button>
              </div>
            </div>

            {/* Quick One-Click Expense Presets for MSME */}
            {formData.type === 'Expense' && (
              <div className="p-2.5 rounded-xl bg-stone-50 border border-stone-200">
                <span className="text-[10px] font-bold text-stone-500 uppercase tracking-wider block mb-1.5">
                  Quick One-Click Expense Presets:
                </span>
                <div className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      setFormData({
                        ...formData,
                        title: 'Purchase of New Tools & Equipment',
                        amount: '100000',
                        category: 'Equipment',
                        payment_status: 'Completed',
                        transaction_date: new Date().toISOString().split('T')[0],
                        counterparty: 'Equipment & Hardware Vendor',
                        description: 'Purchased new items / machinery for business'
                      });
                    }}
                    className="px-2.5 py-1 text-[11px] font-medium bg-white hover:bg-rose-50 hover:text-rose-700 text-stone-700 rounded-lg border border-stone-200 transition-colors cursor-pointer"
                  >
                    🛒 Spent Today (e.g. ₹1,00,000 for New Things)
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setFormData({
                        ...formData,
                        title: 'Staff Salaries & Employee Payroll',
                        amount: '150000',
                        category: 'Salary',
                        payment_status: 'Pending',
                        transaction_date: '2026-11-01',
                        due_date: '2026-11-01',
                        counterparty: 'Core Staff & Employees',
                        description: 'Monthly payroll scheduled for 1 Nov'
                      });
                    }}
                    className="px-2.5 py-1 text-[11px] font-medium bg-white hover:bg-emerald-50 hover:text-emerald-700 text-stone-700 rounded-lg border border-stone-200 transition-colors cursor-pointer"
                  >
                    💼 Employee Salaries (Due 1 Nov)
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setFormData({
                        ...formData,
                        title: 'State Electricity & Power Bill',
                        amount: '25000',
                        category: 'Utilities',
                        payment_status: 'Pending',
                        transaction_date: '2026-10-28',
                        due_date: '2026-10-28',
                        counterparty: 'State Electricity Board',
                        description: 'Commercial power utility consumption'
                      });
                    }}
                    className="px-2.5 py-1 text-[11px] font-medium bg-white hover:bg-amber-50 hover:text-amber-700 text-stone-700 rounded-lg border border-stone-200 transition-colors cursor-pointer"
                  >
                    ⚡ Electricity Bill
                  </button>
                </div>
              </div>
            )}

            {/* 2. Title */}
            <div>
              <label className="block text-stone-700 font-semibold mb-1">
                Transaction Title <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                placeholder="e.g., Client Retainer Invoice #402, Office Supplies"
                value={formData.title}
                onChange={(e) => {
                  setFormData({ ...formData, title: e.target.value });
                  if (validationErrors.title) setValidationErrors({ ...validationErrors, title: null });
                }}
                className={`w-full px-3 py-2 bg-[#fdfcfb] border rounded-xl text-stone-900 focus:outline-none focus:bg-white transition-all ${
                  validationErrors.title ? 'border-rose-400 focus:border-rose-500' : 'border-stone-200 focus:border-emerald-600'
                }`}
              />
              {validationErrors.title && (
                <p className="text-[11px] text-rose-600 mt-1">{validationErrors.title}</p>
              )}
            </div>

            {/* 3. Amount & Date */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-stone-700 font-semibold mb-1">
                  Amount in INR (₹) <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-500 font-mono font-bold">₹</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    placeholder="25,000.00"
                    value={formData.amount}
                    onChange={(e) => {
                      setFormData({ ...formData, amount: e.target.value });
                      if (validationErrors.amount) setValidationErrors({ ...validationErrors, amount: null });
                    }}
                    className={`w-full pl-7 pr-3 py-2 bg-[#fdfcfb] border rounded-xl text-stone-900 font-mono font-semibold focus:outline-none focus:bg-white transition-all ${
                      validationErrors.amount ? 'border-rose-400 focus:border-rose-500' : 'border-stone-200 focus:border-emerald-600'
                    }`}
                  />
                </div>
                {validationErrors.amount && (
                  <p className="text-[11px] text-rose-600 mt-1">{validationErrors.amount}</p>
                )}
              </div>

              <div>
                <label className="block text-stone-700 font-semibold mb-1">
                  Transaction Date <span className="text-rose-500">*</span>
                </label>
                <input
                  type="date"
                  value={formData.transaction_date}
                  onChange={(e) => {
                    setFormData({ ...formData, transaction_date: e.target.value });
                    if (validationErrors.transaction_date) setValidationErrors({ ...validationErrors, transaction_date: null });
                  }}
                  className={`w-full px-3 py-2 bg-[#fdfcfb] border rounded-xl text-stone-900 font-mono focus:outline-none focus:bg-white transition-all ${
                    validationErrors.transaction_date ? 'border-rose-400 focus:border-rose-500' : 'border-stone-200 focus:border-emerald-600'
                  }`}
                />
                {validationErrors.transaction_date && (
                  <p className="text-[11px] text-rose-600 mt-1">{validationErrors.transaction_date}</p>
                )}
              </div>
            </div>

            {/* 4. Category & Payment Method */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-stone-700 font-semibold mb-1">
                  Category <span className="text-rose-500">*</span>
                </label>
                <select
                  value={formData.category}
                  onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                  className="w-full px-3 py-2 bg-[#fdfcfb] border border-stone-200 rounded-xl text-stone-900 focus:outline-none focus:border-emerald-600 focus:bg-white"
                >
                  {categories.map((cat) => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-stone-700 font-semibold mb-1">
                  Payment Method
                </label>
                <select
                  value={formData.payment_method}
                  onChange={(e) => setFormData({ ...formData, payment_method: e.target.value })}
                  className="w-full px-3 py-2 bg-[#fdfcfb] border border-stone-200 rounded-xl text-stone-900 focus:outline-none focus:border-emerald-600 focus:bg-white"
                >
                  {PAYMENT_METHODS.map((pm) => (
                    <option key={pm} value={pm}>{pm}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* 5. Counterparty & Payment Status */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-stone-700 font-semibold mb-1">
                  Counterparty / Vendor Name
                </label>
                <input
                  type="text"
                  placeholder="e.g. Apex Suppliers, TechCorp"
                  value={formData.counterparty}
                  onChange={(e) => setFormData({ ...formData, counterparty: e.target.value })}
                  className="w-full px-3 py-2 bg-[#fdfcfb] border border-stone-200 rounded-xl text-stone-900 focus:outline-none focus:border-emerald-600 focus:bg-white"
                />
              </div>

              <div>
                <label className="block text-stone-700 font-semibold mb-1">
                  Payment Status <span className="text-rose-500">*</span>
                </label>
                <select
                  value={formData.payment_status}
                  onChange={(e) => setFormData({ ...formData, payment_status: e.target.value })}
                  className="w-full px-3 py-2 bg-[#fdfcfb] border border-stone-200 rounded-xl text-stone-900 focus:outline-none focus:border-emerald-600 focus:bg-white"
                >
                  {PAYMENT_STATUSES.map((st) => (
                    <option key={st.value} value={st.value}>{st.label}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* 6. Due Date & Reference Number (Optional) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-stone-700 font-semibold mb-1">
                  Due Date <span className="text-stone-400 font-normal">(Optional)</span>
                </label>
                <input
                  type="date"
                  value={formData.due_date}
                  onChange={(e) => setFormData({ ...formData, due_date: e.target.value })}
                  className="w-full px-3 py-2 bg-[#fdfcfb] border border-stone-200 rounded-xl text-stone-900 font-mono focus:outline-none focus:border-emerald-600 focus:bg-white"
                />
              </div>

              <div>
                <label className="block text-stone-700 font-semibold mb-1">
                  Reference / Invoice # <span className="text-stone-400 font-normal">(Optional)</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. INV-2024-001, UPI/3910"
                  value={formData.reference_number}
                  onChange={(e) => setFormData({ ...formData, reference_number: e.target.value })}
                  className="w-full px-3 py-2 bg-[#fdfcfb] border border-stone-200 rounded-xl text-stone-900 font-mono focus:outline-none focus:border-emerald-600 focus:bg-white"
                />
              </div>
            </div>

            {/* 7. Description (Optional) */}
            <div>
              <label className="block text-stone-700 font-semibold mb-1">
                Description / Line Items <span className="text-stone-400 font-normal">(Optional)</span>
              </label>
              <textarea
                rows={2}
                placeholder="Additional transaction context or invoice remarks..."
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                className="w-full px-3 py-2 bg-[#fdfcfb] border border-stone-200 rounded-xl text-stone-900 focus:outline-none focus:border-emerald-600 focus:bg-white resize-none"
              />
            </div>

            {/* Form Actions */}
            <div className="pt-3 border-t border-stone-100 flex items-center justify-between">
              <div>
                {reviewRequired && (
                  <span className="text-[11px] text-emerald-700 font-semibold flex items-center gap-1">
                    <Check className="w-3.5 h-3.5" /> Ready to Confirm
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2.5">
                <Button
                  variant="secondary"
                  size="sm"
                  type="button"
                  onClick={onClose}
                  disabled={loading}
                >
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  type="submit"
                  loading={loading}
                  className="bg-emerald-700 hover:bg-emerald-800 text-white min-w-[130px] font-bold"
                >
                  {isEditing
                    ? 'Save Changes'
                    : reviewRequired
                    ? 'Confirm & Save'
                    : 'Record Entry'}
                </Button>
              </div>
            </div>
          </form>
        </div>
      </div>

      {/* Live Camera Viewfinder Modal */}
      <CameraModal
        isOpen={isCameraModalOpen}
        onClose={() => setIsCameraModalOpen(false)}
        onCapture={handleCameraCapture}
      />

      {/* Gemini API Key Configuration Modal */}
      <GeminiKeyModal
        isOpen={isKeyModalOpen}
        onClose={() => setIsKeyModalOpen(false)}
        onKeySaved={() => {
          setIsGeminiActive(true);
        }}
      />
    </>
  );
}
