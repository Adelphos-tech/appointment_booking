import { useEffect, useState } from 'react';
import { Building2, Calendar, CalendarDays, ClipboardList, Copy, QrCode, Stethoscope, Users } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { format, isAfter } from 'date-fns';

import AnimatedPage, { StaggerContainer, StaggerItem } from '../components/AnimatedPage';
import StatCard from '../components/StatCard';
import { SkeletonDashboard } from '../components/SkeletonLoader';
import { getDashboardStats } from '../lib/api';
import type { Booking } from '../lib/api';
import { useToast } from '../hooks/useToast';

export default function Dashboard() {
  const { showToast } = useToast();
  const [counts, setCounts] = useState({ companies: 0, centres: 0, staff: 0, services: 0, bookings: 0, waitlist: 0 });
  const [todayBookings, setTodayBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const todayStr = format(new Date(), 'yyyy-MM-dd');
        const data = await getDashboardStats(todayStr);
        setCounts(data.counts);
        setTodayBookings(data.todayBookings);
      } catch (err: any) {
        showToast(err.message || 'Failed to load dashboard data', 'error');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [showToast]);

  const stats = [
    { label: 'Companies', value: counts.companies, icon: Building2, gradient: 'from-blue-500 to-blue-600' },
    { label: 'Centres', value: counts.centres, icon: Building2, gradient: 'from-indigo-500 to-indigo-600' },
    { label: 'Staff', value: counts.staff, icon: Users, gradient: 'from-emerald-500 to-emerald-600' },
    { label: 'Services', value: counts.services, icon: Stethoscope, gradient: 'from-purple-500 to-purple-600' },
    { label: 'Bookings', value: counts.bookings, icon: Calendar, gradient: 'from-amber-500 to-orange-500' },
    { label: 'Waitlist', value: counts.waitlist, icon: ClipboardList, gradient: 'from-rose-500 to-pink-500' },
  ];

  const bookingUrl = `${window.location.origin}/book`;

  function copyUrl() {
    navigator.clipboard.writeText(bookingUrl);
    showToast('Booking link copied to clipboard!', 'success');
  }

  if (loading) {
    return <SkeletonDashboard />;
  }

  return (
    <AnimatedPage className="space-y-8">
      {/* Header */}
      <div className="page-header">
        <h1 className="page-title">Dashboard</h1>
        <p className="page-subtitle">Overview of your Slotcare account</p>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        {stats.map((s, i) => (
          <StatCard
            key={s.label}
            label={s.label}
            value={s.value}
            icon={s.icon}
            gradient={s.gradient}
            delay={i * 0.06}
          />
        ))}
      </div>

      {/* Content grid */}
      <StaggerContainer className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* QR Code section */}
        <StaggerItem>
          <div className="glass-card p-6 sm:p-8">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg">
                <QrCode className="text-white" size={20} />
              </div>
              <h3 className="text-lg font-bold text-white">Customer Booking Link</h3>
            </div>
            <p className="text-sm text-gray-500 mb-6">Share this QR code with customers for self-booking.</p>
            <div className="flex flex-col sm:flex-row items-start gap-6">
              <div className="p-4 bg-white rounded-2xl shadow-lg">
                <QRCodeSVG value={bookingUrl} size={140} />
              </div>
              <div className="flex-1 w-full">
                <div className="p-4 rounded-xl bg-white/[0.03] border border-white/[0.06] text-sm text-gray-400 break-all mb-3 font-mono">
                  {bookingUrl}
                </div>
                <button
                  onClick={copyUrl}
                  className="btn-secondary flex items-center gap-2"
                >
                  <Copy size={16} /> Copy link
                </button>
              </div>
            </div>
          </div>
        </StaggerItem>

        {/* Today's schedule */}
        <StaggerItem>
          <div className="glass-card p-6 sm:p-8">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center shadow-lg">
                <CalendarDays className="text-white" size={20} />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">Today's Schedule</h3>
                <p className="text-xs text-gray-500">{format(new Date(), 'EEEE, MMMM d, yyyy')}</p>
              </div>
            </div>
            {todayBookings.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-gray-500">
                <div className="w-16 h-16 rounded-full bg-white/[0.03] flex items-center justify-center mb-3">
                  <CalendarDays size={28} className="text-gray-600" />
                </div>
                <span className="text-sm">No bookings scheduled for today</span>
              </div>
            ) : (
              <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
                {todayBookings.map((b) => {
                  const upcoming = isAfter(new Date(b.slotStart), new Date());
                  return (
                    <div
                      key={b.id}
                      className="flex items-center gap-3 p-3 rounded-xl bg-white/[0.03] border border-white/[0.05] hover:bg-white/[0.05] transition"
                    >
                      <div className="w-12 h-12 rounded-xl bg-white/[0.05] border border-white/[0.08] flex flex-col items-center justify-center flex-shrink-0">
                        <span className="text-xs font-bold text-white">{format(new Date(b.slotStart), 'h:mm')}</span>
                        <span className="text-[10px] text-gray-500 uppercase">{format(new Date(b.slotStart), 'a')}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold text-white truncate">{b.customerName}</div>
                        <div className="text-xs text-gray-500 truncate">
                          {b.centre?.name} · {b.service?.name} · {b.staff?.name}
                        </div>
                      </div>
                      <span className={upcoming ? 'pill-success' : 'pill-info'}>
                        {upcoming ? 'Upcoming' : 'In Progress'}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </StaggerItem>
      </StaggerContainer>
    </AnimatedPage>
  );
}
