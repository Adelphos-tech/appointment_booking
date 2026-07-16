import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  BarChart3, CalendarDays, Building2, Briefcase, Calendar as CalendarIcon,
  ChevronDown, ChevronLeft, ClipboardList, Clock, ExternalLink, Home, LogOut,
  Menu, MessageSquare, Shield, ShieldCheck, Stethoscope, UserCog, Users,
} from 'lucide-react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';

import { getUser, logout } from '../lib/api';

export default function Layout() {
  const user = getUser();
  const isSuperAdmin = user?.role === 'superadmin';
  const navigate = useNavigate();
  const location = useLocation();
  const [companiesOpen, setCompaniesOpen] = useState(true);
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const initials = user?.name
    ? user.name.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2)
    : user?.email?.slice(0, 2).toUpperCase() || 'AD';

  const companiesChildren = [
    { to: '/companies', icon: Briefcase, label: 'Companies' },
    { to: '/centres', icon: Building2, label: 'Centres' },
  ];

  const isCompaniesActive = companiesChildren.some((c) => c.to === location.pathname);

  const navItems = [
    { to: '/', icon: Home, label: 'Dashboard', end: true },
    ...(isSuperAdmin ? [{ to: '/users', icon: UserCog, label: 'Users' }] : []),
  ];

  const mainNav = [
    { to: '/staff', icon: Users, label: 'Staff' },
    { to: '/services', icon: Stethoscope, label: 'Services' },
    { to: '/bookings', icon: CalendarDays, label: 'Bookings' },
    { to: '/availability', icon: Clock, label: 'Availability' },
    { to: '/analytics', icon: BarChart3, label: 'Analytics' },
    { to: '/waitlist', icon: ClipboardList, label: 'Waitlist' },
    { to: '/chat', icon: MessageSquare, label: 'AI Chat' },
  ];

  const navLinkClass = ({ isActive }: { isActive: boolean }) =>
    `group flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 ${
      isActive
        ? 'bg-gradient-to-r from-blue-600/20 to-purple-600/20 text-white border border-blue-500/20 shadow-glow-sm'
        : 'text-gray-400 hover:text-white hover:bg-white/[0.05]'
    }`;

  const sidebarContent = (
    <>
      {/* Logo */}
      <div className={`px-5 py-6 border-b border-white/[0.06] ${collapsed ? 'px-3' : ''}`}>
        <Link to="/" className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center shadow-lg shadow-blue-500/20 flex-shrink-0">
            <CalendarIcon size={20} className="text-white" />
          </div>
          {!collapsed && (
            <motion.span
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-xl font-extrabold tracking-tight gradient-text"
            >
              Slotcare
            </motion.span>
          )}
        </Link>
      </div>

      {/* Navigation */}
      <nav className={`flex-1 p-3 space-y-1 overflow-y-auto ${collapsed ? 'px-2' : ''}`}>
        {/* Top nav items (Dashboard, Users) */}
        {navItems.map((item) => (
          <NavLink key={item.to} to={item.to} end={item.end || false} className={navLinkClass}>
            <item.icon size={18} className="flex-shrink-0" />
            {!collapsed && <span>{item.label}</span>}
          </NavLink>
        ))}

        {/* Companies & Centres */}
        <div className="pt-1">
          <button
            onClick={() => setCompaniesOpen(!companiesOpen)}
            className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 ${
              isCompaniesActive
                ? 'bg-gradient-to-r from-blue-600/20 to-purple-600/20 text-white border border-blue-500/20 shadow-glow-sm'
                : 'text-gray-400 hover:text-white hover:bg-white/[0.05]'
            }`}
          >
            <div className="flex items-center gap-3">
              <Building2 size={18} className="flex-shrink-0" />
              {!collapsed && <span>Companies & Centres</span>}
            </div>
            {!collapsed && (
              <ChevronDown
                size={14}
                className={`transition-transform duration-200 ${companiesOpen ? 'rotate-180' : ''}`}
              />
            )}
          </button>
          <AnimatePresence initial={false}>
            {companiesOpen && !collapsed && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2, ease: 'easeInOut' }}
                className="overflow-hidden"
              >
                <div className="mt-1 ml-4 pl-3 border-l border-white/[0.06] space-y-1">
                  {companiesChildren.map((item) => (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      className={({ isActive }) =>
                        `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                          isActive
                            ? 'text-blue-400 bg-blue-500/10'
                            : 'text-gray-500 hover:text-gray-300 hover:bg-white/[0.03]'
                        }`
                      }
                    >
                      <item.icon size={16} />
                      <span>{item.label}</span>
                    </NavLink>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Divider */}
        <div className="my-2 border-t border-white/[0.04]" />

        {/* Main nav items */}
        {mainNav.map((item) => (
          <NavLink key={item.to} to={item.to} className={navLinkClass}>
            <item.icon size={18} className="flex-shrink-0" />
            {!collapsed && <span>{item.label}</span>}
          </NavLink>
        ))}
      </nav>

      {/* Footer */}
      <div className={`p-3 border-t border-white/[0.06] space-y-2 ${collapsed ? 'px-2' : ''}`}>
        <a
          href="/book"
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-gray-400 hover:text-white hover:bg-white/[0.05] transition"
        >
          <ExternalLink size={18} className="flex-shrink-0" />
          {!collapsed && <span>Public Booking</span>}
        </a>

        {/* User profile */}
        <div className={`px-3 py-3 rounded-xl bg-white/[0.03] border border-white/[0.06] ${collapsed ? 'px-2' : ''}`}>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-xs font-bold text-white flex-shrink-0">
              {initials}
            </div>
            {!collapsed && (
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  {isSuperAdmin
                    ? <ShieldCheck size={12} className="text-purple-400" />
                    : <Shield size={12} className="text-blue-400" />}
                  <span className={`text-xs font-semibold ${isSuperAdmin ? 'text-purple-400' : 'text-blue-400'}`}>
                    {isSuperAdmin ? 'Super Admin' : 'Admin'}
                  </span>
                </div>
                <div className="text-xs text-gray-500 truncate mt-0.5">{user?.email}</div>
              </div>
            )}
          </div>
        </div>

        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-rose-400/80 hover:text-rose-300 hover:bg-rose-500/10 transition"
        >
          <LogOut size={18} className="flex-shrink-0" />
          {!collapsed && <span>Logout</span>}
        </button>
      </div>
    </>
  );

  return (
    <div className="flex h-screen bg-[#050816] bg-mesh">
      {/* Desktop sidebar */}
      <aside
        className={`hidden lg:flex flex-col glass-sidebar transition-all duration-300 ${
          collapsed ? 'w-[72px]' : 'w-64'
        }`}
      >
        {sidebarContent}
        {/* Collapse toggle */}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="absolute top-20 -right-3 w-6 h-6 rounded-full bg-gray-800 border border-white/10 flex items-center justify-center text-gray-400 hover:text-white hover:bg-gray-700 transition z-10"
          style={{ left: collapsed ? '60px' : '248px' }}
        >
          <ChevronLeft size={12} className={`transition-transform ${collapsed ? 'rotate-180' : ''}`} />
        </button>
      </aside>

      {/* Mobile hamburger */}
      <button
        onClick={() => setMobileOpen(true)}
        className="lg:hidden fixed top-4 left-4 z-40 w-10 h-10 rounded-xl glass-card flex items-center justify-center text-gray-300 hover:text-white"
      >
        <Menu size={20} />
      </button>

      {/* Mobile sidebar overlay */}
      <AnimatePresence>
        {mobileOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="lg:hidden fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
              onClick={() => setMobileOpen(false)}
            />
            <motion.aside
              initial={{ x: -280 }}
              animate={{ x: 0 }}
              exit={{ x: -280 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="lg:hidden fixed left-0 top-0 bottom-0 w-64 glass-sidebar z-50 flex flex-col"
            >
              {sidebarContent}
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* Main content */}
      <main className="flex-1 overflow-auto">
        <div className="p-6 sm:p-8 lg:p-10 max-w-[1400px] mx-auto">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
