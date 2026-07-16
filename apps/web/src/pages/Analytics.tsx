import { useEffect, useState, useMemo } from 'react';
import { BarChart, Calendar, ChevronLeft, ChevronRight, DollarSign, TrendingUp, Users, XCircle } from 'lucide-react';
import { format, getHours, startOfDay, endOfDay, startOfMonth, endOfMonth, startOfYear, endOfYear, addDays, addMonths, addYears, isWithinInterval } from 'date-fns';

import AnimatedPage, { StaggerContainer, StaggerItem } from '../components/AnimatedPage';
import { SkeletonDashboard } from '../components/SkeletonLoader';
import { getBookings, getServices, getStaff } from '../lib/api';
import type { Booking, Service, Staff } from '../lib/api';

type Period = 'day' | 'month' | 'year';

function getPeriodLabel(period: Period, anchor: Date): string {
  if (period === 'day') return format(anchor, 'EEEE, d MMM yyyy');
  if (period === 'month') return format(anchor, 'MMMM yyyy');
  return format(anchor, 'yyyy');
}

function getPeriodRange(period: Period, anchor: Date): { start: Date; end: Date } {
  if (period === 'day') return { start: startOfDay(anchor), end: endOfDay(anchor) };
  if (period === 'month') return { start: startOfMonth(anchor), end: endOfMonth(anchor) };
  return { start: startOfYear(anchor), end: endOfYear(anchor) };
}

function nav(period: Period, anchor: Date, dir: 1 | -1): Date {
  if (period === 'day') return addDays(anchor, dir);
  if (period === 'month') return addMonths(anchor, dir);
  return addYears(anchor, dir);
}

export default function Analytics() {
  const [allBookings, setAllBookings] = useState<Booking[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<Period>('month');
  const [anchor, setAnchor] = useState(new Date());

  useEffect(() => {
    async function load() {
      const [b, s, st] = await Promise.all([getBookings(), getServices(), getStaff()]);
      setAllBookings(b); setServices(s); setStaff(st); setLoading(false);
    }
    load();
  }, []);

  const bookings = useMemo(() => {
    const { start, end } = getPeriodRange(period, anchor);
    return allBookings.filter((b) => isWithinInterval(new Date(b.slotStart), { start, end }));
  }, [allBookings, period, anchor]);

  if (loading) return <SkeletonDashboard />;

  const total = bookings.length;
  const completed = bookings.filter((b) => b.status === 'Completed').length;
  const noShows = bookings.filter((b) => b.status === 'NoShow').length;
  const fulfilledRate = total ? Math.round(((completed + bookings.filter((b) => b.status === 'Booked').length) / total) * 100) : 0;
  const revenue = bookings.reduce((sum, b) => sum + (Number(services.find((s) => s.id === b.serviceId)?.price) || 0), 0);

  const staffUtilization = staff.map((s) => ({
    name: s.name, count: bookings.filter((b) => b.staffId === s.id).length,
  })).sort((a, b) => b.count - a.count);

  const hourly: Record<number, number> = {};
  bookings.forEach((b) => { const h = getHours(new Date(b.slotStart)); hourly[h] = (hourly[h] || 0) + 1; });
  const peakHours = Object.entries(hourly).sort((a, b) => b[1] - a[1]).slice(0, 5);

  const PERIODS: { key: Period; label: string }[] = [
    { key: 'day', label: 'Day' }, { key: 'month', label: 'Month' }, { key: 'year', label: 'Year' },
  ];

  const statCards = [
    { label: 'Total Bookings', value: total, icon: Calendar, gradient: 'from-blue-500 to-indigo-500' },
    { label: 'Revenue', value: `RM ${revenue.toFixed(0)}`, icon: DollarSign, gradient: 'from-emerald-500 to-teal-500' },
    { label: 'No Shows', value: noShows, icon: XCircle, gradient: 'from-rose-500 to-red-500' },
    { label: 'Fulfilled', value: `${fulfilledRate}%`, icon: TrendingUp, gradient: 'from-purple-500 to-violet-500' },
  ];

  return (
    <AnimatedPage>
      <div className="flex flex-wrap items-center justify-between gap-4 mb-8">
        <div className="page-header mb-0">
          <h1 className="page-title">Analytics</h1>
          <p className="page-subtitle">Performance insights for your business</p>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex rounded-xl overflow-hidden border border-white/10">
            {PERIODS.map((p) => (
              <button key={p.key} onClick={() => setPeriod(p.key)}
                className={`px-4 py-2 text-xs font-semibold transition ${period === p.key ? 'bg-blue-500/20 text-blue-400' : 'text-gray-500 hover:text-gray-300'}`}>
                {p.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1 glass-card px-2 py-1">
            <button onClick={() => setAnchor(nav(period, anchor, -1))} className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/[0.05] transition">
              <ChevronLeft size={14} />
            </button>
            <span className="text-xs font-medium text-gray-300 px-2 min-w-[140px] text-center">{getPeriodLabel(period, anchor)}</span>
            <button onClick={() => setAnchor(nav(period, anchor, 1))} className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/[0.05] transition">
              <ChevronRight size={14} />
            </button>
          </div>
          <button onClick={() => setAnchor(new Date())} className="btn-secondary text-xs py-1.5 px-3">Today</button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {statCards.map((c) => (
          <div key={c.label} className="glass-card p-5">
            <div className="flex items-center justify-between mb-3">
              <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${c.gradient} flex items-center justify-center`}>
                <c.icon size={18} className="text-white" />
              </div>
              <div className="text-2xl font-extrabold text-white">{c.value}</div>
            </div>
            <div className="text-sm font-medium text-gray-500">{c.label}</div>
          </div>
        ))}
      </div>

      <StaggerContainer className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <StaggerItem>
          <div className="glass-card p-6">
            <h3 className="text-base font-bold text-white mb-4 flex items-center gap-2"><Users size={16} className="text-blue-400" /> Staff Utilization</h3>
            {staffUtilization.filter((s) => s.count > 0).length === 0 ? (
              <div className="text-gray-500 text-center py-8 text-sm">No bookings in this period</div>
            ) : (
              <div className="space-y-3">
                {staffUtilization.map((s) => (
                  <div key={s.name} className="flex items-center gap-3">
                    <div className="w-28 text-sm text-gray-400 truncate">{s.name}</div>
                    <div className="flex-1 h-2.5 bg-white/[0.04] rounded-full overflow-hidden">
                      <div className="h-full bg-gradient-to-r from-blue-500 to-purple-500 rounded-full transition-all duration-500"
                        style={{ width: `${Math.max(5, (s.count / Math.max(1, ...staffUtilization.map((x) => x.count))) * 100)}%` }} />
                    </div>
                    <div className="text-sm font-semibold text-white w-8 text-right">{s.count}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </StaggerItem>

        <StaggerItem>
          <div className="glass-card p-6">
            <h3 className="text-base font-bold text-white mb-4 flex items-center gap-2"><BarChart size={16} className="text-purple-400" /> Peak Hours</h3>
            {peakHours.length === 0 ? (
              <div className="text-gray-500 text-center py-8 text-sm">No bookings in this period</div>
            ) : (
              <div className="space-y-3">
                {peakHours.map(([hour, count]) => (
                  <div key={hour} className="flex items-center gap-3">
                    <div className="w-28 text-sm text-gray-400">{hour}:00 – {hour}:59</div>
                    <div className="flex-1 h-2.5 bg-white/[0.04] rounded-full overflow-hidden">
                      <div className="h-full bg-gradient-to-r from-amber-500 to-orange-500 rounded-full transition-all duration-500"
                        style={{ width: `${Math.max(5, (count / Number(peakHours[0][1])) * 100)}%` }} />
                    </div>
                    <div className="text-sm font-semibold text-white w-8 text-right">{count}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </StaggerItem>
      </StaggerContainer>

      <div className="mt-6 glass-card p-6">
        <h3 className="text-base font-bold text-white mb-4">Status Breakdown</h3>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {[
            { key: 'Booked', cls: 'text-blue-400 border-blue-500/20' },
            { key: 'Completed', cls: 'text-emerald-400 border-emerald-500/20' },
            { key: 'Cancelled', cls: 'text-rose-400 border-rose-500/20' },
            { key: 'NoShow', cls: 'text-amber-400 border-amber-500/20' },
            { key: 'Blocked', cls: 'text-gray-400 border-white/10' },
          ].map(({ key, cls }) => (
            <div key={key} className={`text-center p-4 rounded-xl border bg-white/[0.02] ${cls}`}>
              <div className="text-2xl font-bold">{bookings.filter((b) => b.status === key).length}</div>
              <div className="text-xs text-gray-500 mt-1">{key}</div>
            </div>
          ))}
        </div>
      </div>
    </AnimatedPage>
  );
}
