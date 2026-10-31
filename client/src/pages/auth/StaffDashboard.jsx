import React from 'react';
import { Link, Navigate, Outlet, useNavigate } from 'react-router-dom';
import { Boxes, ClipboardList, Scissors, Truck, Users, CreditCard, LogOut } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import './StaffDashboard.css';

const workAreas = [
  { path: 'inventory', permission: 'view_inventory', title: 'Inventory', detail: 'View current timber stock and batches.', Icon: Boxes },
  { path: 'purchases', permission: 'view_purchases', title: 'Purchases', detail: 'Review purchase records and receipts.', Icon: ClipboardList },
  { path: 'cutting-jobs', permission: 'view_cutting_jobs', title: 'Cutting operations', detail: 'View cutting work and processing jobs.', Icon: Scissors },
  { path: 'sales-orders', permission: 'view_sales_orders', title: 'Assigned orders', detail: 'Review customer orders for your work.', Icon: ClipboardList },
  { path: 'deliveries', permission: 'view_deliveries', title: 'Deliveries', detail: 'Review and update delivery work.', Icon: Truck },
  { path: 'customers', permission: 'view_customers', title: 'Customer details', detail: 'View customer information.', Icon: Users },
  { path: 'payments', permission: 'view_payments', title: 'Payments', detail: 'Access payment records.', Icon: CreditCard },
];

export function StaffLayout() {
  const { currentUser, logout } = useAuth();
  const navigate = useNavigate();
  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };
  return (
    <div className="staff-shell">
      <header className="staff-header">
        <Link to="/staff/dashboard" className="staff-brand">TimberCraft <span>Staff workspace</span></Link>
        <div className="staff-user"><span>{currentUser?.name || currentUser?.username}</span><button type="button" onClick={handleLogout}><LogOut size={16} /> Log out</button></div>
      </header>
      <main className="staff-content"><Outlet /></main>
    </div>
  );
}

export default function StaffDashboard() {
  const { currentUser } = useAuth();
  const grants = new Set(currentUser?.permissions || []);
  const available = workAreas.filter((area) => grants.has(area.permission) || grants.has(area.permission.replace(/^view_/, 'manage_')));
  return (
    <section className="staff-dashboard">
      <p className="staff-eyebrow">DAILY OPERATIONS</p>
      <h1>Hello, {currentUser?.name || currentUser?.username}</h1>
      <p className="staff-intro">Your workspace includes only the areas assigned to your account.</p>
      {available.length ? <div className="staff-work-grid">{available.map(({ path, title, detail, Icon }) => (
        <Link className="staff-work-card" to={`/staff/${path}`} key={path}>
          <span className="staff-work-icon"><Icon size={22} /></span><span><strong>{title}</strong><small>{detail}</small></span>
        </Link>
      ))}</div> : <div className="staff-empty">No work areas are assigned yet. Please contact your administrator.</div>}
    </section>
  );
}

export function StaffPermissionDenied() { return <Navigate to="/staff/dashboard" replace />; }
