import React, { lazy, Suspense, useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation, Outlet } from 'react-router-dom';
import Header from './components/layout/Header';
import Footer from './components/layout/Footer';
import QuoteModal from './components/quote/QuoteModal';

// Auth & Providers
import { AuthProvider } from './context/AuthContext';
import ProtectedRoute from './components/common/ProtectedRoute';
const Login = lazy(() => import('./pages/auth/Login'));
const Home = lazy(() => import('./pages/Home'));
const About = lazy(() => import('./pages/About'));
const Products = lazy(() => import('./pages/Products'));
const ProductDetails = lazy(() => import('./pages/ProductDetails'));
const Services = lazy(() => import('./pages/Services'));
const Quote = lazy(() => import('./pages/Quote'));
const Contact = lazy(() => import('./pages/Contact'));
const Privacy = lazy(() => import('./pages/Privacy'));
const Terms = lazy(() => import('./pages/Terms'));

// Admin Dashboard & Layout
import DashboardLayout from './components/admin/DashboardLayout';
import { LanguageProvider, useLanguage } from './context/LanguageContext';
import LoadingSpinner from './components/admin/LoadingSpinner';

const AdminDashboard = lazy(() => import('./pages/admin/AdminDashboard'));
const InventoryPage = lazy(() => import('./pages/admin/InventoryPage'));
const PurchasesPage = lazy(() => import('./pages/admin/PurchasesPage'));
const CustomersPage = lazy(() => import('./pages/admin/CustomersPage'));
const SuppliersPage = lazy(() => import('./pages/admin/SuppliersPage'));
const CuttingJobsPage = lazy(() => import('./pages/admin/CuttingJobsPage'));
const SalesOrdersPage = lazy(() => import('./pages/admin/SalesOrdersPage'));
const InvoicesPage = lazy(() => import('./pages/admin/InvoicesPage'));
const PaymentsPage = lazy(() => import('./pages/admin/PaymentsPage'));
const ExpensesPage = lazy(() => import('./pages/admin/ExpensesPage'));
const EmployeesPage = lazy(() => import('./pages/admin/EmployeesPage'));
const DeliveriesPage = lazy(() => import('./pages/admin/DeliveriesPage'));
const EnquiriesPage = lazy(() => import('./pages/admin/EnquiriesPage'));
const ReportsPage = lazy(() => import('./pages/admin/ReportsPage'));
const UserManagementPage = lazy(() => import('./pages/admin/UserManagementPage'));
const SettingsPage = lazy(() => import('./pages/admin/SettingsPage'));
const WoodTypesPage = lazy(() => import('./pages/admin/WoodTypesPage'));

// Helper to scroll to top on route change
function ScrollToTop() {
  const { pathname } = useLocation();

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  return null;
}

// Layout wrapper for Public Website pages
function PublicLayout() {
  return (
    <div className="app-shell" style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <Header />
      <main style={{ flex: 1 }}>
        <Outlet />
      </main>
      <Footer />
    </div>
  );
}

function TranslationCoverageNotice() {
  const { isTranslationIncomplete, t } = useLanguage();
  if (!isTranslationIncomplete) return null;
  return <div className="translation-coverage-notice" role="status">{t('coverage.incomplete')}</div>;
}

function App() {
  const [isQuoteModalOpen, setIsQuoteModalOpen] = useState(false);
  const [selectedProductForQuote, setSelectedProductForQuote] = useState('');

  const handleOpenQuote = (product = '') => {
    setSelectedProductForQuote(product);
    setIsQuoteModalOpen(true);
  };

  const handleCloseQuote = () => {
    setIsQuoteModalOpen(false);
    setSelectedProductForQuote('');
  };

  return (
    <LanguageProvider>
    <AuthProvider>
        <Router>
          <ScrollToTop />
          <TranslationCoverageNotice />
          <Suspense fallback={<div className="app-route-loading" role="status"><LoadingSpinner message="Loading page…" /></div>}>
          <Routes>
            {/* 1. STANDALONE LOGIN ROUTE */}
            <Route path="/login" element={<Login />} />

            {/* 2. PROTECTED ADMIN DASHBOARD MODULES */}
            <Route
              path="/admin"
              element={
                <ProtectedRoute>
                  <DashboardLayout />
                </ProtectedRoute>
              }
            >
              <Route index element={<AdminDashboard />} />
              <Route path="inventory" element={<InventoryPage />} />
              <Route path="wood-types" element={<WoodTypesPage />} />
              <Route path="purchases" element={<PurchasesPage />} />
              <Route path="customers" element={<CustomersPage />} />
              <Route path="suppliers" element={<SuppliersPage />} />
              <Route path="cutting-jobs" element={<CuttingJobsPage />} />
              <Route path="sales-orders" element={<SalesOrdersPage />} />
              <Route path="invoices" element={<InvoicesPage />} />
              <Route path="payments" element={<PaymentsPage />} />
              <Route path="expenses" element={<ExpensesPage />} />
              <Route path="employees" element={<EmployeesPage />} />
              <Route path="deliveries" element={<DeliveriesPage />} />
              <Route path="enquiries" element={<EnquiriesPage />} />
              <Route path="reports" element={<ReportsPage />} />
              <Route path="users" element={<UserManagementPage />} />
              <Route path="settings" element={<SettingsPage />} />
            </Route>

            {/* 3. PUBLIC WEBSITE ROUTES */}
            <Route element={<PublicLayout />}>
              <Route path="/" element={<Home />} />
              <Route path="/about" element={<About />} />
              <Route path="/products" element={<Products />} />
              <Route path="/products/:id" element={<ProductDetails onOpenQuote={handleOpenQuote} />} />
              <Route path="/services" element={<Services onOpenQuote={handleOpenQuote} />} />
              <Route path="/quote" element={<Quote />} />
              <Route path="/contact" element={<Contact />} />
              <Route path="/privacy" element={<Privacy />} />
              <Route path="/terms" element={<Terms />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </Routes>
          </Suspense>

          {/* Global Floating/Triggered Quote Modal */}
          <QuoteModal
            key={selectedProductForQuote}
            isOpen={isQuoteModalOpen}
            onClose={handleCloseQuote}
            initialItem={selectedProductForQuote}
          />
        </Router>
    </AuthProvider>
    </LanguageProvider>
  );
}

export default App;
