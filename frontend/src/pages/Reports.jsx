import React, { useState, useEffect } from 'react';
import { Printer, FileText } from 'lucide-react';
import Button from '../components/common/Button';
import LoadingSpinner from '../components/common/LoadingSpinner';
import { api } from '../api/client';
import { formatINR } from '../utils/formatters';

export default function Reports() {
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadReport() {
      try {
        setLoading(true);
        const res = await api.getReportSummary();
        setReport(res.report);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    loadReport();
  }, []);

  const handlePrint = () => {
    window.print();
  };

  if (loading || !report) {
    return <LoadingSpinner message="Generating report..." />;
  }

  return (
    <div className="space-y-4 animate-fade-fast">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-stone-900">Financial Health Report</h1>
          <p className="text-xs text-stone-600">Executive liquidity audit for leadership and lenders</p>
        </div>
        <Button variant="secondary" size="sm" icon={Printer} onClick={handlePrint}>
          Print / PDF
        </Button>
      </div>

      {/* Report Card */}
      <div className="p-6 rounded-xl bg-white border border-stone-200 shadow-2xs space-y-5">
        {/* Header Block */}
        <div className="border-b border-stone-100 pb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <span className="text-[10px] uppercase font-bold tracking-widest text-emerald-700 block">
              Audit Summary
            </span>
            <h2 className="text-lg font-bold text-stone-900 mt-0.5">{report.entity}</h2>
            <p className="text-xs text-stone-500">{report.industry}</p>
          </div>

          <div className="text-left sm:text-right">
            <span className="text-[10px] text-stone-400 uppercase font-bold block">Health Score</span>
            <span className="text-2xl font-black text-emerald-700 font-mono">
              {report.health_score} / 100
            </span>
            <span className="text-[11px] text-stone-600 block font-semibold">{report.health_status}</span>
          </div>
        </div>

        {/* Metrics Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="p-3 rounded-lg bg-[#faf8f5] border border-stone-200">
            <span className="text-[10px] text-stone-600 font-bold uppercase block">Cash Balance</span>
            <h4 className="text-base font-bold text-stone-900 mt-0.5 font-mono">
              {formatINR(report.current_balance)}
            </h4>
          </div>

          <div className="p-3 rounded-lg bg-[#faf8f5] border border-stone-200">
            <span className="text-[10px] text-stone-600 font-bold uppercase block">Safe Reserve</span>
            <h4 className="text-base font-bold text-amber-800 mt-0.5 font-mono">
              {formatINR(report.target_reserve)}
            </h4>
          </div>

          <div className="p-3 rounded-lg bg-[#faf8f5] border border-stone-200">
            <span className="text-[10px] text-stone-600 font-bold uppercase block">Runway</span>
            <h4 className="text-base font-bold text-stone-900 mt-0.5 font-mono">
              {report.runway_days} Days
            </h4>
          </div>

          <div className="p-3 rounded-lg bg-[#faf8f5] border border-stone-200">
            <span className="text-[10px] text-stone-600 font-bold uppercase block">Critical Risks</span>
            <h4 className="text-base font-bold text-rose-700 mt-0.5 font-mono">
              {report.critical_risks_count} Detected
            </h4>
          </div>
        </div>

        {/* Advisory */}
        <div className="p-4 rounded-lg bg-emerald-50/70 border border-emerald-200">
          <h3 className="text-[11px] font-bold text-emerald-800 uppercase tracking-wider mb-1">
            Executive Advisory
          </h3>
          <p className="text-xs text-stone-700 leading-relaxed">
            {report.recommendation_summary}
          </p>
        </div>
      </div>
    </div>
  );
}
