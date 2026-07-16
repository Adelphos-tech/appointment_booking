import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';

import ErrorBoundary from './components/ErrorBoundary';
import Layout from './components/Layout';
import { ToastProvider } from './hooks/useToast';
import Analytics from './pages/Analytics';
import Availability from './pages/Availability';
import CustomerBooking from './pages/CustomerBooking';
import Bookings from './pages/Bookings';
import Centres from './pages/Centres';
import Companies from './pages/Companies';
import Chat from './pages/Chat';
import Dashboard from './pages/Dashboard';
import Login from './pages/Login';
import MyBookings from './pages/MyBookings';
import Register from './pages/Register';
import Services from './pages/Services';
import Staff from './pages/Staff';
import Users from './pages/Users';
import Waitlist from './pages/Waitlist';
import { getUser, logout } from './lib/api';

function RequireAuth({ children }: { children: JSX.Element }) {
  const user = getUser();
  if (!user) return <Navigate to="/login" replace />;
  if (user.status !== 'Approved') {
    logout();
    return <Navigate to="/login" replace />;
  }
  return children;
}

function RequireSuperAdmin({ children }: { children: JSX.Element }) {
  const user = getUser();
  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== 'superadmin') return <Navigate to="/" replace />;
  return children;
}

function RequireCompany({ children }: { children: JSX.Element }) {
  const user = getUser();
  if (!user) return <Navigate to="/login" replace />;
  if (user.status !== 'Approved') {
    logout();
    return <Navigate to="/login" replace />;
  }
  if (user.role !== 'superadmin' && !user.companyId) {
    return <Navigate to="/companies" replace />;
  }
  return children;
}

function App() {
  return (
    <ToastProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/book" element={<CustomerBooking />} />
          <Route path="/book/:companySlug" element={<CustomerBooking />} />
          <Route path="/my-bookings" element={<MyBookings />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route
            path="/"
            element={
              <RequireAuth>
                <Layout />
              </RequireAuth>
            }
          >
            <Route index element={<Dashboard />} />
            <Route path="companies" element={<ErrorBoundary><Companies /></ErrorBoundary>} />
            <Route path="centres" element={<RequireCompany><ErrorBoundary><Centres /></ErrorBoundary></RequireCompany>} />
            <Route path="staff" element={<RequireCompany><ErrorBoundary><Staff /></ErrorBoundary></RequireCompany>} />
            <Route path="services" element={<RequireCompany><ErrorBoundary><Services /></ErrorBoundary></RequireCompany>} />
            <Route path="bookings" element={<RequireCompany><ErrorBoundary><Bookings /></ErrorBoundary></RequireCompany>} />
            <Route path="availability" element={<RequireCompany><ErrorBoundary><Availability /></ErrorBoundary></RequireCompany>} />
            <Route path="analytics" element={<RequireCompany><ErrorBoundary><Analytics /></ErrorBoundary></RequireCompany>} />
            <Route path="waitlist" element={<RequireCompany><ErrorBoundary><Waitlist /></ErrorBoundary></RequireCompany>} />
            <Route path="users" element={<RequireSuperAdmin><ErrorBoundary><Users /></ErrorBoundary></RequireSuperAdmin>} />
            <Route path="chat" element={<RequireCompany><ErrorBoundary><Chat /></ErrorBoundary></RequireCompany>} />
          </Route>
        </Routes>
      </BrowserRouter>
    </ToastProvider>
  );
}

export default App;
