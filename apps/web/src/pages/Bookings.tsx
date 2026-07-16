import { useEffect, useState } from 'react';
import { format, isSameDay } from 'date-fns';
import { CalendarDays, List, Plus } from 'lucide-react';

import AnimatedPage from '../components/AnimatedPage';
import BookingCalendar from '../components/BookingCalendar';
import Modal from '../components/Modal';
import { SkeletonTable } from '../components/SkeletonLoader';
import { createBooking, getBookings, getCentres, getServices, getStaff, updateBooking } from '../lib/api';
import type { Booking, Centre, Service, Staff } from '../lib/api';
import { useToast } from '../hooks/useToast';

export default function Bookings() {
  const { showToast } = useToast();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [centres, setCentres] = useState<Centre[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'list' | 'calendar'>('calendar');
  const [selectedDate, setSelectedDate] = useState<Date | null>(new Date());
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({
    customerName: '', customerContact: '', customerEmail: '',
    centreId: '', staffId: '', serviceId: '',
    date: '', startTime: '09:00', preferredGender: '',
  });

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const [b, c, s, sv] = await Promise.all([getBookings(), getCentres(), getStaff(), getServices()]);
    setBookings(b); setCentres(c); setStaff(s); setServices(sv);
    setLoading(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      const centre = centres.find((c) => c.id === form.centreId);
      const service = services.find((s) => s.id === form.serviceId);
      const duration = service?.durationOverrideMinutes || centre?.slotDurationMinutes || 30;
      const slotStart = new Date(`${form.date}T${form.startTime}:00`);
      const slotEnd = new Date(slotStart.getTime() + duration * 60000);
      await createBooking({
        customerName: form.customerName, customerContact: form.customerContact,
        customerEmail: form.customerEmail || undefined, centreId: form.centreId,
        staffId: form.staffId, serviceId: form.serviceId,
        slotStart: slotStart.toISOString(), slotEnd: slotEnd.toISOString(),
        preferredGender: form.preferredGender || undefined, status: 'Booked',
      });
      showToast('Booking created successfully', 'success');
      setShowCreate(false);
      setForm({ customerName: '', customerContact: '', customerEmail: '', centreId: '', staffId: '', serviceId: '', date: '', startTime: '09:00', preferredGender: '' });
      await load();
    } catch (err: any) { showToast(err.message || 'Failed to create booking', 'error'); }
  }

  const filteredBookings = selectedDate
    ? bookings.filter((b) => isSameDay(new Date(b.slotStart), selectedDate))
    : bookings;

  const dailyTotal = filteredBookings
    .filter((b) => b.status !== 'Cancelled')
    .reduce((sum, b) => sum + (Number(b.service?.price) || 0), 0);

  async function handleCancel(id: string) {
    if (!confirm('Cancel this booking?')) return;
    try { await updateBooking(id, { status: 'Cancelled' }); showToast('Booking cancelled', 'success'); await load(); }
    catch (err: any) { showToast(err.message, 'error'); }
  }

  function statusPill(status: string) {
    const map: Record<string, string> = {
      Booked: 'pill-success', ManuallyBooked: 'pill-info', Cancelled: 'pill-danger',
      Completed: 'pill-purple', NoShow: 'pill-warning', Blocked: 'pill-neutral',
    };
    return <span className={map[status] || 'pill-neutral'}>{status}</span>;
  }

  if (loading) return <SkeletonTable rows={6} />;

  return (
    <AnimatedPage>
      <div className="flex items-center justify-between mb-6">
        <div className="page-header mb-0">
          <h1 className="page-title">Bookings</h1>
          <p className="page-subtitle">
            {selectedDate ? `Showing ${format(selectedDate, 'MMMM d, yyyy')}` : 'All bookings'}
            {dailyTotal > 0 && <span className="ml-3 text-emerald-400 font-semibold">Total: RM {dailyTotal.toFixed(2)}</span>}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex rounded-xl overflow-hidden border border-white/10">
            <button onClick={() => setView('calendar')} className={`px-3 py-2 text-xs font-semibold transition ${view === 'calendar' ? 'bg-blue-500/20 text-blue-400' : 'text-gray-500 hover:text-gray-300'}`}>
              <CalendarDays size={14} />
            </button>
            <button onClick={() => setView('list')} className={`px-3 py-2 text-xs font-semibold transition ${view === 'list' ? 'bg-blue-500/20 text-blue-400' : 'text-gray-500 hover:text-gray-300'}`}>
              <List size={14} />
            </button>
          </div>
          <button onClick={() => setShowCreate(true)} className="btn-primary flex items-center gap-2">
            <Plus size={16} /> New Booking
          </button>
        </div>
      </div>

      {view === 'calendar' && (
        <div className="mb-6">
          <BookingCalendar bookings={bookings} onSelectDate={(d) => { setSelectedDate(d); setView('list'); }} />
        </div>
      )}

      {/* Bookings list */}
      <div className="glass-card overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-white/[0.06]">
              <th className="px-5 py-3.5 text-xs font-semibold uppercase tracking-wider text-gray-500">Customer</th>
              <th className="px-5 py-3.5 text-xs font-semibold uppercase tracking-wider text-gray-500">Centre</th>
              <th className="px-5 py-3.5 text-xs font-semibold uppercase tracking-wider text-gray-500">Staff</th>
              <th className="px-5 py-3.5 text-xs font-semibold uppercase tracking-wider text-gray-500">Service</th>
              <th className="px-5 py-3.5 text-xs font-semibold uppercase tracking-wider text-gray-500">Slot</th>
              <th className="px-5 py-3.5 text-xs font-semibold uppercase tracking-wider text-gray-500">Status</th>
              <th className="px-5 py-3.5 text-xs font-semibold uppercase tracking-wider text-gray-500 text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {filteredBookings.map((b) => (
              <tr key={b.id} className="border-b border-white/[0.03] hover:bg-white/[0.03] transition">
                <td className="px-5 py-3.5">
                  <div className="font-semibold text-white">{b.customerName}</div>
                  <div className="text-xs text-gray-500">{b.customerContact}</div>
                </td>
                <td className="px-5 py-3.5 text-gray-400">{b.centre?.name}</td>
                <td className="px-5 py-3.5">
                  <div className="flex items-center gap-2">
                    <span className="text-gray-300">{b.staff?.name}</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded ${b.staff?.gender?.toLowerCase() === 'female' ? 'bg-pink-500/10 text-pink-400' : 'bg-blue-500/10 text-blue-400'}`}>
                      {b.staff?.gender}
                    </span>
                  </div>
                </td>
                <td className="px-5 py-3.5 text-gray-400">{b.service?.name}</td>
                <td className="px-5 py-3.5 text-gray-400 text-xs font-mono">
                  {format(new Date(b.slotStart), 'MMM d, h:mm a')}
                </td>
                <td className="px-5 py-3.5">{statusPill(b.status)}</td>
                <td className="px-5 py-3.5 text-right">
                  {b.status !== 'Cancelled' && (
                    <button onClick={() => handleCancel(b.id)}
                      className="px-3 py-1.5 text-xs font-medium text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-lg hover:bg-rose-500/20 transition">
                      Cancel
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {filteredBookings.length === 0 && (
              <tr>
                <td colSpan={7} className="px-5 py-12 text-center text-gray-500">
                  <div className="flex flex-col items-center gap-2">
                    <CalendarDays size={28} className="text-gray-600" />
                    <span className="text-sm">No bookings for this view</span>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Create Booking Modal */}
      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Create Booking" size="lg">
        <form onSubmit={handleSubmit}>
          <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-1">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold text-gray-300 mb-2">Customer Name</label>
                <input value={form.customerName} onChange={(e) => setForm({ ...form, customerName: e.target.value })} className="input-field" required />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-300 mb-2">Contact</label>
                <input value={form.customerContact} onChange={(e) => setForm({ ...form, customerContact: e.target.value })} className="input-field" required />
              </div>
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-300 mb-2">Email (optional)</label>
              <input type="email" value={form.customerEmail} onChange={(e) => setForm({ ...form, customerEmail: e.target.value })} className="input-field" />
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-semibold text-gray-300 mb-2">Centre</label>
                <select value={form.centreId} onChange={(e) => setForm({ ...form, centreId: e.target.value })} className="input-field" required>
                  <option value="">Select</option>
                  {centres.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-300 mb-2">Staff</label>
                <select value={form.staffId} onChange={(e) => setForm({ ...form, staffId: e.target.value })} className="input-field" required>
                  <option value="">Select</option>
                  {staff.filter((s) => s.centreId === form.centreId).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-300 mb-2">Service</label>
                <select value={form.serviceId} onChange={(e) => setForm({ ...form, serviceId: e.target.value })} className="input-field" required>
                  <option value="">Select</option>
                  {services.filter((s) => s.centreId === form.centreId).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-semibold text-gray-300 mb-2">Date</label>
                <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className="input-field" required />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-300 mb-2">Start Time</label>
                <input type="time" value={form.startTime} onChange={(e) => setForm({ ...form, startTime: e.target.value })} className="input-field" required />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-300 mb-2">Gender Pref.</label>
                <select value={form.preferredGender} onChange={(e) => setForm({ ...form, preferredGender: e.target.value })} className="input-field">
                  <option value="">Any</option>
                  <option value="Male">Male</option>
                  <option value="Female">Female</option>
                </select>
              </div>
            </div>
          </div>
          <div className="flex justify-end gap-3 mt-6">
            <button type="button" onClick={() => setShowCreate(false)} className="btn-secondary">Cancel</button>
            <button type="submit" className="btn-primary">Create Booking</button>
          </div>
        </form>
      </Modal>
    </AnimatedPage>
  );
}
