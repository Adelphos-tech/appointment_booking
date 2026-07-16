import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { Calendar, Phone, Search, User, XCircle, Loader2, MapPin, Clock, Stethoscope, ChevronLeft } from 'lucide-react';
import axios from 'axios';
import { motion, AnimatePresence } from 'framer-motion';

interface Booking {
  id: string;
  customerName: string;
  customerContact: string;
  centre: { name: string; location: string };
  staff: { name: string; gender: string };
  service: { name: string };
  slotStart: string;
  slotEnd: string;
  status: string;
}

export default function MyBookings() {
  const [contact, setContact] = useState('');
  const [searchContact, setSearchContact] = useState('');
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  const publicApi = axios.create({ baseURL: '/public' });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const q = params.get('contact');
    if (q) {
      setContact(q);
      doSearch(q);
    }
  }, []);

  async function doSearch(phone: string) {
    if (!phone.trim()) return;
    setLoading(true);
    setSearched(true);
    try {
      const res = await publicApi.get('/bookings', { params: { customerContact: phone, limit: '50' } });
      setBookings(res.data.bookings || []);
    } catch {
      setBookings([]);
    } finally {
      setLoading(false);
    }
  }

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setSearchContact(contact);
    doSearch(contact);
    window.history.replaceState(null, '', `?contact=${encodeURIComponent(contact)}`);
  }

  const upcoming = bookings.filter((b) => ['Booked', 'ManuallyBooked'].includes(b.status) && new Date(b.slotEnd) > new Date());
  const past = bookings.filter((b) => !upcoming.includes(b as any));

  return (
    <div className="min-h-screen bg-[#050816] text-gray-100 flex flex-col relative overflow-x-hidden">
      {/* Background radial glow */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div
          className="absolute top-0 left-1/4 w-[600px] h-[600px] rounded-full"
          style={{ background: 'radial-gradient(circle, rgba(59, 130, 246, 0.08) 0%, transparent 70%)' }}
        />
        <div
          className="absolute bottom-1/4 right-1/4 w-[500px] h-[500px] rounded-full"
          style={{ background: 'radial-gradient(circle, rgba(139, 92, 246, 0.06) 0%, transparent 70%)' }}
        />
      </div>

      <header className="border-b border-white/[0.06] bg-black/40 backdrop-blur-md sticky top-0 z-40">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <a href="/book" className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-500/20">
              <Calendar className="text-white" size={20} />
            </div>
            <div>
              <h1 className="text-lg font-bold text-white leading-tight">Slotcare</h1>
              <p className="text-[10px] text-gray-400">My Appointments</p>
            </div>
          </a>
          <a href="/book" className="btn-primary py-2 px-4 text-xs flex items-center gap-1">
            <ChevronLeft size={14} /> Back to Booking
          </a>
        </div>
      </header>

      <main className="flex-1 max-w-3xl w-full mx-auto px-4 py-10 z-10 space-y-8">
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-card p-6 sm:p-8 relative overflow-hidden"
        >
          <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-blue-500 to-purple-600 opacity-60" />
          <h2 className="text-xl font-bold text-white mb-1.5">Find Your Bookings</h2>
          <p className="text-sm text-gray-400 mb-6">Enter the contact number used when scheduling your appointment.</p>
          
          <form onSubmit={handleSearch} className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Phone className="absolute left-3.5 top-3.5 text-gray-500" size={18} />
              <input
                value={contact}
                onChange={(e) => setContact(e.target.value)}
                placeholder="e.g. +1234567890"
                className="input-field pl-11 py-3"
                required
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="btn-primary py-3 px-6 flex items-center justify-center gap-2"
            >
              {loading ? <Loader2 className="animate-spin" size={18} /> : <Search size={18} />}
              Search Appointments
            </button>
          </form>
        </motion.div>

        {searched && !loading && bookings.length === 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-center py-12 glass-card border-dashed"
          >
            <Calendar className="w-12 h-12 text-gray-600 mx-auto mb-3" />
            <p className="text-gray-300 font-semibold">No bookings found for {searchContact}.</p>
            <p className="text-xs text-gray-500 mt-1">Make sure you entered the identical contact used during booking.</p>
          </motion.div>
        )}

        <AnimatePresence mode="popLayout">
          {upcoming.length > 0 && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="space-y-4"
            >
              <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-2">
                <Clock size={14} className="text-blue-400" /> Upcoming Appointments
              </h3>
              <div className="space-y-3">
                {upcoming.map((b) => (
                  <div key={b.id} className="glass-card p-5 hover:border-white/10 transition flex flex-col sm:flex-row sm:items-center gap-4">
                    <div className="flex-1 space-y-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <User size={14} className="text-gray-400" />
                        <span className="font-semibold text-white">{b.customerName}</span>
                        <span className="pill pill-success">{b.status}</span>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-gray-400">
                        <span className="flex items-center gap-1.5"><MapPin size={12} className="text-gray-500" /> {b.centre.name}</span>
                        <span className="flex items-center gap-1.5"><Stethoscope size={12} className="text-gray-500" /> {b.service?.name || '-'}</span>
                        <span className="flex items-center gap-1.5"><Clock size={12} className="text-gray-500" /> {format(new Date(b.slotStart), 'PPP p')}</span>
                        <span className="flex items-center gap-1.5"><User size={12} className="text-gray-500" /> Staff: {b.staff.name}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          )}

          {past.length > 0 && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="space-y-4"
            >
              <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-2">
                <XCircle size={14} className="text-gray-500" /> Past Appointments
              </h3>
              <div className="space-y-3">
                {past.map((b) => (
                  <div key={b.id} className="glass-card p-5 opacity-60 flex flex-col sm:flex-row sm:items-center gap-4">
                    <div className="flex-1 space-y-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <User size={14} className="text-gray-500" />
                        <span className="font-semibold text-gray-300">{b.customerName}</span>
                        <span className="pill pill-neutral">{b.status}</span>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-gray-500">
                        <span className="flex items-center gap-1.5"><MapPin size={12} /> {b.centre.name}</span>
                        <span className="flex items-center gap-1.5"><Stethoscope size={12} /> {b.service?.name || '-'}</span>
                        <span className="flex items-center gap-1.5"><Clock size={12} /> {format(new Date(b.slotStart), 'PPP p')}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}
