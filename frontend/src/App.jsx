import React, { useState, useEffect, useCallback } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/layout/Layout';
import HomePage from './pages/HomePage';
import Dashboard from './pages/Dashboard';
import Transactions from './pages/Transactions';
import Receivables from './pages/Receivables';
import Payables from './pages/Payables';
import Forecast from './pages/Forecast';
import RiskCenter from './pages/RiskCenter';
import Recommendations from './pages/Recommendations';
import WhatIfSimulator from './pages/WhatIfSimulator';
import BusinessInsights from './pages/BusinessInsights';
import DocumentImport from './pages/DocumentImport';
import Reports from './pages/Reports';
import Settings from './pages/Settings';
import TransactionModal from './components/common/TransactionModal';
import ErrorBoundary from './components/common/ErrorBoundary';
import { api } from './api/client';

export default function App() {
  const [isApiHealthy, setIsApiHealthy] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [businessName, setBusinessName] = useState(() => {
    try {
      const stored = localStorage.getItem('cashflow_user');
      if (stored) {
        const u = JSON.parse(stored);
        if (u.business_name) return u.business_name;
      }
    } catch (e) {
      // Ignore
    }
    return 'Apex Precision Dynamics';
  });
  const [isTxModalOpen, setIsTxModalOpen] = useState(false);
  const [txModalType, setTxModalType] = useState('Income');
  const [refreshKey, setRefreshKey] = useState(0);

  const handleOpenTransaction = (type = 'Income') => {
    setTxModalType(type);
    setIsTxModalOpen(true);
  };

  // Restore or sync stored business session if changed
  useEffect(() => {
    try {
      const stored = localStorage.getItem('cashflow_user');
      if (stored) {
        const u = JSON.parse(stored);
        if (u.business_name && u.business_name !== businessName) {
          setBusinessName(u.business_name);
        }
      }
    } catch (e) {
      console.warn('Failed to restore user session:', e);
    }
  }, [businessName, refreshKey]);

  const checkHealth = useCallback(async () => {
    try {
      const res = await api.getHealth();
      if (res.status === 'healthy') {
        setIsApiHealthy(true);
      }
    } catch (err) {
      setIsApiHealthy(false);
    }
  }, []);

  useEffect(() => {
    checkHealth();
    const interval = setInterval(checkHealth, 30000);
    return () => clearInterval(interval);
  }, [checkHealth]);

  const handleGlobalRefresh = () => {
    setIsRefreshing(true);
    checkHealth();
    setRefreshKey((k) => k + 1);
    setTimeout(() => {
      setIsRefreshing(false);
    }, 600);
  };

  return (
    <BrowserRouter>
      <Routes>
        {/* 1. Public Interactive Home / Landing Page */}
        <Route
          path="/"
          element={
            <HomePage
              onSelectBusiness={(name) => setBusinessName(name)}
              activeBusinessName={businessName}
            />
          }
        />
        <Route
          path="/home"
          element={
            <HomePage
              onSelectBusiness={(name) => setBusinessName(name)}
              activeBusinessName={businessName}
            />
          }
        />

        {/* 2. Business Management Workspace Routes inside Application Layout */}
        <Route
          path="/*"
          element={
            <Layout
              businessName={businessName}
              isApiHealthy={isApiHealthy}
              onRefresh={handleGlobalRefresh}
              isRefreshing={isRefreshing}
              onQuickAction={(type) => handleOpenTransaction(type || 'Expense')}
            >
              <ErrorBoundary>
                <Routes>
                  <Route
                    path="/dashboard"
                    element={
                      <Dashboard
                        key={refreshKey}
                        onOpenNewTransaction={(type) => handleOpenTransaction(type || 'Expense')}
                      />
                    }
                  />
                  <Route
                    path="/app"
                    element={
                      <Dashboard
                        key={refreshKey}
                        onOpenNewTransaction={(type) => handleOpenTransaction(type || 'Expense')}
                      />
                    }
                  />
                  <Route
                    path="/forecast"
                    element={<Forecast key={refreshKey} />}
                  />
                  <Route
                    path="/transactions"
                    element={
                      <Transactions
                        key={refreshKey}
                        onOpenNewTransaction={(type) => handleOpenTransaction(type || 'Expense')}
                        onRefreshApp={handleGlobalRefresh}
                      />
                    }
                  />
                  <Route
                    path="/receivables"
                    element={<Receivables key={refreshKey} onRefreshApp={handleGlobalRefresh} />}
                  />
                  <Route
                    path="/payables"
                    element={<Payables key={refreshKey} onRefreshApp={handleGlobalRefresh} />}
                  />
                  <Route path="/risks" element={<RiskCenter key={refreshKey} />} />
                  <Route path="/recommendations" element={<Recommendations key={refreshKey} />} />
                  <Route path="/simulator" element={<WhatIfSimulator key={refreshKey} />} />
                  <Route path="/insights" element={<BusinessInsights key={refreshKey} />} />
                  <Route
                    path="/imports"
                    element={<DocumentImport key={refreshKey} onRefreshApp={handleGlobalRefresh} />}
                  />
                  <Route path="/reports" element={<Reports key={refreshKey} />} />
                  <Route path="/settings" element={<Settings key={refreshKey} onRefreshApp={handleGlobalRefresh} />} />
                  {/* Default fallback route to Dashboard */}
                  <Route
                    path="*"
                    element={
                      <Dashboard
                        key={refreshKey}
                        onOpenNewTransaction={(type) => handleOpenTransaction(type || 'Expense')}
                      />
                    }
                  />
                </Routes>
              </ErrorBoundary>
            </Layout>
          }
        />
      </Routes>

      {/* Global Transaction Creation Modal */}
      <TransactionModal
        isOpen={isTxModalOpen}
        defaultType={txModalType}
        onClose={() => setIsTxModalOpen(false)}
        onSuccess={handleGlobalRefresh}
      />
    </BrowserRouter>
  );
}
