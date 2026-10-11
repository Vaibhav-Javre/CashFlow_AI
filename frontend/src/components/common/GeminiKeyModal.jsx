import React, { useState, useEffect } from 'react';
import { Sparkles, Key, CheckCircle2, AlertCircle, ExternalLink, X, Eye, EyeOff } from 'lucide-react';
import Button from './Button';
import { api } from '../../api/client';

export default function GeminiKeyModal({ isOpen, onClose, onKeySaved }) {
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [isConfigured, setIsConfigured] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);

  useEffect(() => {
    if (isOpen) {
      setError(null);
      setSuccessMsg(null);
      checkStatus();
    }
  }, [isOpen]);

  const checkStatus = async () => {
    try {
      const res = await api.getGeminiStatus();
      setIsConfigured(Boolean(res?.configured));
    } catch {
      setIsConfigured(false);
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!apiKey.trim()) {
      setError('Please paste your Gemini API key');
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const res = await api.saveGeminiKey(apiKey.trim());
      if (res.success) {
        setSuccessMsg('API key saved and activated successfully!');
        setIsConfigured(true);
        setApiKey('');
        if (onKeySaved) onKeySaved();
        setTimeout(() => {
          onClose();
        }, 1200);
      }
    } catch (err) {
      setError(err.message || 'Failed to save API key');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-70 flex items-center justify-center p-4 bg-stone-900/60 backdrop-blur-xs animate-fade-fast">
      <div className="w-full max-w-md bg-white border border-stone-200 rounded-2xl shadow-2xl p-5 animate-pop-fast text-xs">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-stone-100">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-indigo-50 border border-indigo-100 text-indigo-600 flex items-center justify-center">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-stone-900">Google Gemini Vision AI</h3>
              <p className="text-[11px] text-stone-500">Auto-extract bills & invoices with AI</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-stone-400 hover:text-stone-700 hover:bg-stone-100 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Status Badge */}
        <div className="mt-3 p-3 rounded-xl bg-stone-50 border border-stone-200/80 flex items-center justify-between">
          <span className="text-stone-600 font-medium">Gemini Status:</span>
          {isConfigured ? (
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-100 text-emerald-800">
              <CheckCircle2 className="w-3 h-3 text-emerald-600" /> Active & Ready
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-amber-100 text-amber-800">
              <AlertCircle className="w-3 h-3 text-amber-600" /> Not Configured Yet
            </span>
          )}
        </div>

        {/* Success / Error alerts */}
        {successMsg && (
          <div className="mt-3 p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 font-medium flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}
        {error && (
          <div className="mt-3 p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 font-medium flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Input Form */}
        <form onSubmit={handleSave} className="mt-4 space-y-3">
          <div>
            <label className="block text-stone-700 font-semibold mb-1">
              Enter Gemini API Key
            </label>
            <div className="relative">
              <Key className="w-3.5 h-3.5 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type={showKey ? 'text' : 'password'}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="AIzaSy..."
                className="w-full pl-8 pr-10 py-2 bg-stone-50 border border-stone-200 rounded-xl text-stone-900 placeholder-stone-400 focus:outline-none focus:border-indigo-500 focus:bg-white text-xs font-mono"
              />
              <button
                type="button"
                onClick={() => setShowKey(!showKey)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-700 cursor-pointer"
              >
                {showKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>

          <div className="flex gap-2 justify-end pt-1">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 rounded-xl text-stone-600 hover:bg-stone-100 font-medium cursor-pointer"
            >
              Close
            </button>
            <Button
              type="submit"
              variant="primary"
              disabled={loading}
              className="bg-indigo-600 hover:bg-indigo-500 text-white font-semibold"
            >
              {loading ? 'Saving...' : 'Save & Activate Key'}
            </Button>
          </div>
        </form>

        {/* How to get API Key Instructions */}
        <div className="mt-4 pt-3 border-t border-stone-100 bg-[#fbfaf8] -mx-5 -mb-5 p-4 rounded-b-2xl">
          <p className="font-semibold text-stone-800 text-[11px] mb-1.5 flex items-center gap-1.5">
            <span>💡 How to get a free Google Gemini API Key:</span>
          </p>
          <ol className="text-[11px] text-stone-600 space-y-1 list-decimal list-inside leading-relaxed">
            <li>
              Go to{' '}
              <a
                href="https://aistudio.google.com/app/apikey"
                target="_blank"
                rel="noreferrer"
                className="text-indigo-600 hover:text-indigo-800 font-semibold inline-flex items-center gap-0.5 underline"
              >
                Google AI Studio <ExternalLink className="w-2.5 h-2.5" />
              </a>
            </li>
            <li>Sign in with your Google account.</li>
            <li>Click <strong>&quot;Create API Key&quot;</strong> and copy your key.</li>
            <li>Paste it above or add <code>GEMINI_API_KEY=...</code> in <code>backend/.env</code>.</li>
          </ol>
        </div>
      </div>
    </div>
  );
}
