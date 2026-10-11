const BASE_URL = import.meta.env.VITE_API_URL || '/api';

/**
 * Universal API Client with error handling and JSON parsing
 */
async function request(endpoint, options = {}) {
  const url = `${BASE_URL}${endpoint}`;
  const headers = {
    ...(options.headers || {})
  };
  if (!(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }

  // Inject current active business identifier for workspace isolation
  try {
    const userStr = localStorage.getItem('cashflow_user');
    if (userStr) {
      const u = JSON.parse(userStr);
      if (u.email || u.business_name) {
        headers['X-Business-Id'] = u.email || u.business_name;
      }
    }
  } catch (e) {
    // Ignore JSON parse errors in localStorage
  }

  try {
    const res = await fetch(url, { ...options, headers });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error || `HTTP error ${res.status}: ${res.statusText}`);
    }
    return data;
  } catch (err) {
    console.error(`API Error on ${url}:`, err);
    throw err;
  }
}

export const api = {
  // System Health
  getHealth: () => request('/health'),

  // Dashboard Aggregates
  getDashboardSummary: () => request('/dashboard/summary'),

  // Transactions
  getTransactions: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return request(`/transactions${query ? `?${query}` : ''}`);
  },
  getTransaction: (id) => request(`/transactions/${id}`),
  getTransactionSummary: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return request(`/transactions/summary${query ? `?${query}` : ''}`);
  },
  createTransaction: (txData) => request('/transactions', {
    method: 'POST',
    body: JSON.stringify(txData)
  }),
  updateTransaction: (id, txData) => request(`/transactions/${id}`, {
    method: 'PUT',
    body: JSON.stringify(txData)
  }),
  deleteTransaction: (id) => request(`/transactions/${id}`, {
    method: 'DELETE'
  }),

  // Receivables (Invoices)
  getReceivables: (params = {}) => {
    if (typeof params === 'string') {
      return request(`/receivables?status=${params}`);
    }
    const query = new URLSearchParams(params).toString();
    return request(`/receivables${query ? `?${query}` : ''}`);
  },
  getReceivable: (id) => request(`/receivables/${id}`),
  getReceivablesSummary: () => request('/receivables/summary'),
  createReceivable: (data) => request('/receivables', {
    method: 'POST',
    body: JSON.stringify(data)
  }),
  updateReceivable: (id, data) => request(`/receivables/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data)
  }),
  deleteReceivable: (id, force = false) => request(`/receivables/${id}${force ? '?force=true' : ''}`, {
    method: 'DELETE'
  }),
  recordCustomerPayment: (id, paymentData) => request(`/receivables/${id}/payments`, {
    method: 'POST',
    body: JSON.stringify(paymentData)
  }),
  markReceivablePaid: (id) => request(`/receivables/${id}/pay`, { method: 'POST' }),

  // Payables (Supplier Bills)
  getPayables: (params = {}) => {
    if (typeof params === 'string') {
      return request(`/payables?status=${params}`);
    }
    const query = new URLSearchParams(params).toString();
    return request(`/payables${query ? `?${query}` : ''}`);
  },
  getPayable: (id) => request(`/payables/${id}`),
  getPayablesSummary: () => request('/payables/summary'),
  createPayable: (data) => request('/payables', {
    method: 'POST',
    body: JSON.stringify(data)
  }),
  updatePayable: (id, data) => request(`/payables/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data)
  }),
  deletePayable: (id, force = false) => request(`/payables/${id}${force ? '?force=true' : ''}`, {
    method: 'DELETE'
  }),
  recordSupplierPayment: (id, paymentData) => request(`/payables/${id}/payments`, {
    method: 'POST',
    body: JSON.stringify(paymentData)
  }),
  markPayablePaid: (id) => request(`/payables/${id}/pay`, { method: 'POST' }),

  // Forecasting
  getForecast: (days = 30) => request(`/forecast?days=${days}`),
  getForecastSettings: () => request('/forecast/settings'),
  updateForecastSettings: (settings) => request('/forecast/settings', {
    method: 'PUT',
    body: JSON.stringify(settings)
  }),

  // Risk Center
  getRisks: (days = 30) => request(`/risks?days=${days}`),
  getRiskCenter: (days = 30) => request(`/risk-center?days=${days}`),
  resolveRisk: (id) => request(`/risks/${id}/resolve`, { method: 'POST' }),

  // Recommendations
  getRecommendations: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return request(`/recommendations${query ? `?${query}` : ''}`);
  },
  getRecommendation: (id) => request(`/recommendations/${id}`),
  getRecommendationsSummary: () => request('/recommendations/summary'),
  refreshRecommendations: (days = 30) => request(`/recommendations/refresh?days=${days}`, { method: 'POST' }),
  updateRecommendationStatus: (id, status) => request(`/recommendations/${id}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status })
  }),
  applyRecommendation: (id) => request(`/recommendations/${id}/apply`, { method: 'POST' }),

  // What-If Simulator & Scenarios
  runSimulation: (params) => request('/simulations/run', {
    method: 'POST',
    body: JSON.stringify(params)
  }),
  getScenarios: () => request('/scenarios'),
  getScenario: (id) => request(`/scenarios/${id}`),
  createScenario: (data) => request('/scenarios', {
    method: 'POST',
    body: JSON.stringify(data)
  }),
  updateScenario: (id, data) => request(`/scenarios/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data)
  }),
  deleteScenario: (id) => request(`/scenarios/${id}`, {
    method: 'DELETE'
  }),
  duplicateScenario: (id) => request(`/scenarios/${id}/duplicate`, {
    method: 'POST'
  }),
  previewScenario: (adjustments, days = 30) => request(`/scenarios/preview?days=${days}`, {
    method: 'POST',
    body: JSON.stringify({ adjustments })
  }),
  getScenarioComparison: (id, days = 30) => request(`/scenarios/${id}/comparison?days=${days}`),

  // Statement Ingestion & Imports
  importSampleStatement: () => request('/imports/sample', { method: 'POST' }),
  previewImport: (formData) => request('/imports/preview', {
    method: 'POST',
    body: formData
  }),
  confirmImport: (data) => request('/imports/confirm', {
    method: 'POST',
    body: JSON.stringify(data)
  }),
  getImportBatches: () => request('/imports'),
  getImportBatch: (id) => request(`/imports/${id}`),
  getImportBatchErrors: (id) => request(`/imports/${id}/errors`),

  // Document Upload & OCR / AI Scanner
  uploadDocument: (formData) => request('/documents/upload', {
    method: 'POST',
    body: formData
  }),
  scanReceipt: (payload) => {
    if (payload instanceof FormData) {
      return request('/documents/scan-receipt', {
        method: 'POST',
        body: payload
      });
    }
    return request('/documents/scan-receipt', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  },
  getGeminiStatus: () => request('/documents/gemini-status'),
  saveGeminiKey: (apiKey) => request('/documents/save-key', {
    method: 'POST',
    body: JSON.stringify({ api_key: apiKey })
  }),
  getDocuments: () => request('/documents'),
  getDocument: (id) => request(`/documents/${id}`),
  updateDocumentExtractedData: (id, fields) => request(`/documents/${id}/extracted-data`, {
    method: 'PUT',
    body: JSON.stringify({ fields })
  }),
  confirmDocument: (id, data) => request(`/documents/${id}/confirm`, {
    method: 'POST',
    body: JSON.stringify(data)
  }),

  // Payment Reconciliation
  getReconciliation: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return request(`/reconciliation${query ? `?${query}` : ''}`);
  },
  confirmReconciliation: (data) => request('/reconciliation/confirm', {
    method: 'POST',
    body: JSON.stringify(data)
  }),
  undoReconciliation: (transactionId) => request(`/reconciliation/${transactionId}/undo`, {
    method: 'POST'
  }),

  // Reports
  getReportSummary: () => request('/reports/summary'),

  // Authentication & Business Profiles
  login: (data) => request('/auth/login', {
    method: 'POST',
    body: JSON.stringify(data)
  }),
  register: (data) => request('/auth/register', {
    method: 'POST',
    body: JSON.stringify(data)
  }),
  getCurrentBusiness: () => request('/auth/current'),
  updateBusinessProfile: (data) => request('/auth/profile', {
    method: 'PUT',
    body: JSON.stringify(data)
  }),
  switchDemoBusiness: () => request('/auth/switch-demo', {
    method: 'POST'
  }),

  // Confirmed Recurring Fixed Expenses (Salaries, Electricity, Rent, etc.)
  getConfirmedExpenses: () => request('/confirmed-expenses'),
  saveConfirmedExpenses: (expenses) => request('/confirmed-expenses', {
    method: 'POST',
    body: JSON.stringify(Array.isArray(expenses) ? { expenses } : expenses)
  }),
  deleteConfirmedExpense: (id) => request(`/confirmed-expenses/${id}`, {
    method: 'DELETE'
  })
};
