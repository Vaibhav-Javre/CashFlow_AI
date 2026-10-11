/**
 * Demonstration Dataset for CashFlow AI
 * Clearly identified fallback & mock data for MSME demonstration
 * Decoupled from production financial calculations
 */

export const DEMO_UPCOMING_TRANSACTIONS = [
  {
    id: 'up-1',
    description: 'HyperScale Robotics Part Delivery Receipt',
    dueDate: new Date(Date.now() + 3 * 86400000).toISOString().split('T')[0],
    type: 'INFLOW',
    amount: 345000,
    status: 'Scheduled',
    category: 'Customer Receipt'
  },
  {
    id: 'up-2',
    description: 'Precision Machinists Staff Bi-weekly Payroll',
    dueDate: new Date(Date.now() + 5 * 86400000).toISOString().split('T')[0],
    type: 'OUTFLOW',
    amount: 192000,
    status: 'Pending',
    category: 'Payroll'
  },
  {
    id: 'up-3',
    description: 'Vulcan Alloy Heavy Titanium Stock Delivery',
    dueDate: new Date(Date.now() + 8 * 86400000).toISOString().split('T')[0],
    type: 'OUTFLOW',
    amount: 248000,
    status: 'Critical',
    category: 'Raw Materials'
  },
  {
    id: 'up-4',
    description: 'AeroMech Industries Subcontract Milestone #2',
    dueDate: new Date(Date.now() + 10 * 86400000).toISOString().split('T')[0],
    type: 'INFLOW',
    amount: 182000,
    status: 'Confirmed',
    category: 'Customer Receipt'
  },
  {
    id: 'up-5',
    description: 'Industrial Workshop Facility Rent & Lease',
    dueDate: new Date(Date.now() + 14 * 86400000).toISOString().split('T')[0],
    type: 'OUTFLOW',
    amount: 58000,
    status: 'Scheduled',
    category: 'Facility Rent'
  },
  {
    id: 'up-6',
    description: 'State Grid High-Tension Industrial Power Bill',
    dueDate: new Date(Date.now() + 18 * 86400000).toISOString().split('T')[0],
    type: 'OUTFLOW',
    amount: 42500,
    status: 'Scheduled',
    category: 'Utilities'
  }
];

export const DEMO_FALLBACK_METRICS = {
  availableCash: 842500,
  targetReserve: 500000,
  expectedReceivables: 1293000,
  pendingInvoicesCount: 6,
  overdueInvoicesCount: 2,
  upcomingPayables: 597000,
  upcomingBillsCount: 6,
  criticalPayables: 440000,
  riskStatus: 'Moderate',
  riskExplanation: 'Cash trough projected in Week 2 during payroll'
};
