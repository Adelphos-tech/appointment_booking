import { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { format } from 'date-fns';
import { useParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Bot,
  Calendar,
  CheckCircle,
  ChevronDown,
  Clock,
  Copy,
  Loader2,
  Mail,
  Phone,
  Send,
  Sparkles,
  User,
  X,
} from 'lucide-react';

import type { Centre, Company, Service } from '../lib/api';
import { getCompanyBySlug } from '../lib/api';
import { useToast } from '../hooks/useToast';

function formatLocalTime(isoString: string) {
  return new Date(isoString).toLocaleTimeString('en-US', {
    timeZone: 'UTC',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  });
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface Slot {
  start: string;
  end: string;
  staffId: string;
  staffName: string;
  staffGender: string;
  status?: 'open' | 'booked';
}

const STORAGE_KEY = 'slotcare_booking_state';
const CHAT_KEY = 'slotcare_chat_messages';

export default function CustomerBooking() {
  const { showToast } = useToast();
  const { companySlug } = useParams<{ companySlug?: string }>();
  const navigate = useNavigate();
  const isBranded = Boolean(companySlug);

  const [companies, setCompanies] = useState<Company[]>([]);
  const [selectedCompany, setSelectedCompany] = useState<Company | null>(null);
  const [centres, setCentres] = useState<Centre[]>([]);
  const [selectedCentre, setSelectedCentre] = useState<Centre | null>(null);
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [serviceId, setServiceId] = useState('');
  const [services, setServices] = useState<Service[]>([]);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [loadingCompany, setLoadingCompany] = useState(false);

  const [customerName, setCustomerName] = useState('');
  const [customerContact, setCustomerContact] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [preferredGender, setPreferredGender] = useState('');
  const [website, setWebsite] = useState('');
  const [bookingDone, setBookingDone] = useState(false);
  const [confirmedRef, setConfirmedRef] = useState('');
  const [bookingLoading, setBookingLoading] = useState(false);

  const [chatOpen, setChatOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    try {
      const saved = sessionStorage.getItem(CHAT_KEY);
      return saved ? JSON.parse(saved) : [
        { role: 'assistant', content: 'Hi there! I\'m Slotcare, your AI booking assistant. I can help you find availability, choose a service, and book your appointment in seconds.' },
      ];
    } catch {
      return [{ role: 'assistant', content: 'Hi there! I\'m Slotcare, your AI booking assistant. I can help you find availability, choose a service, and book your appointment in seconds.' }];
    }
  });
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const publicApi = axios.create({ baseURL: '/public' });

  // Load saved state on mount
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(STORAGE_KEY);
      if (saved) {
        const state = JSON.parse(saved);
        if (state.selectedCompany) setSelectedCompany(state.selectedCompany);
        if (state.selectedCentre) setSelectedCentre(state.selectedCentre);
        if (state.date) setDate(state.date);
        if (state.serviceId) setServiceId(state.serviceId);
        if (state.selectedSlot) setSelectedSlot(state.selectedSlot);
        if (state.customerName) setCustomerName(state.customerName);
        if (state.customerContact) setCustomerContact(state.customerContact);
        if (state.customerEmail) setCustomerEmail(state.customerEmail);
        if (state.preferredGender) setPreferredGender(state.preferredGender);
      }
    } catch {
      // ignore
    }
  }, []);

  // Save state on changes
  useEffect(() => {
    const state = {
      selectedCompany,
      selectedCentre,
      date,
      serviceId,
      selectedSlot,
      customerName,
      customerContact,
      customerEmail,
      preferredGender,
    };
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [selectedCompany, selectedCentre, date, serviceId, selectedSlot, customerName, customerContact, customerEmail, preferredGender]);

  // Save chat messages
  useEffect(() => {
    sessionStorage.setItem(CHAT_KEY, JSON.stringify(messages));
  }, [messages]);

  // If branded URL, load company by slug
  useEffect(() => {
    // Always fetch companies list for the dropdown
    publicApi.get('/companies').then((res) => setCompanies(res.data));

    // Reset branch/centre and slots selection on company slug change
    setSelectedCentre(null);
    setCentres([]);
    setSelectedSlot(null);
    setServices([]);
    setServiceId('');

    if (!companySlug) {
      setSelectedCompany(null);
      return;
    }
    setLoadingCompany(true);
    getCompanyBySlug(companySlug)
      .then((company) => {
        setSelectedCompany(company);
      })
      .catch(() => {
        setSelectedCompany(null);
      })
      .finally(() => setLoadingCompany(false));
  }, [companySlug]);

  useEffect(() => {
    if (isBranded && !selectedCompany) return;
    const params = selectedCompany ? { companyId: selectedCompany.id } : undefined;
    publicApi.get('/centres', { params }).then((res) => {
      setCentres(res.data);
      if (res.data.length === 1) {
        setSelectedCentre(res.data[0]);
      }
    });
  }, [selectedCompany, isBranded]);

  useEffect(() => {
    setSelectedSlot(null);
    setServices([]);
    setServiceId('');
    if (!selectedCentre) return;
    publicApi.get(`/services/${selectedCentre.id}`).then((res) => setServices(res.data));
  }, [selectedCentre]);

  useEffect(() => {
    setSlots([]);
    if (!selectedCentre || !date) return;
    setLoadingSlots(true);
    publicApi
      .get('/availability', { params: { centreId: selectedCentre.id, date, serviceId, preferredGender: preferredGender || undefined } })
      .then((res) => setSlots(res.data.slots))
      .finally(() => setLoadingSlots(false));
  }, [selectedCentre, date, serviceId, preferredGender]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, chatOpen]);


  async function handleBook() {
    if (!selectedSlot || !selectedCentre || !customerName || !customerContact) return;
    setBookingLoading(true);
    try {
      const res = await publicApi.post('/bookings', {
        customerName: customerName.trim(),
        customerContact: customerContact.trim(),
        customerEmail: customerEmail.trim() || undefined,
        centreId: selectedCentre.id,
        staffId: selectedSlot.staffId,
        serviceId: serviceId || undefined,
        slotStart: selectedSlot.start,
        slotEnd: selectedSlot.end,
        preferredGender: preferredGender || undefined,
        website: website || undefined,
      });
      setConfirmedRef(res.data.bookingRef || '');
      setBookingDone(true);
      showToast('Booking successfully scheduled!', 'success');
      sessionStorage.removeItem(STORAGE_KEY);
    } catch (err: any) {
      showToast(err.response?.data?.error || 'Failed to complete booking', 'error');
    } finally {
      setBookingLoading(false);
    }
  }

  async function handleChatSend(e: React.FormEvent) {
    e.preventDefault();
    if (!chatInput.trim() || !customerContact) return;
    const newMessages = [...messages, { role: 'user' as const, content: chatInput }];
    setMessages(newMessages);
    setChatInput('');
    setChatLoading(true);
    try {
      const res = await publicApi.post('/chat', { customerContact, message: chatInput, customerName });
      setMessages([...newMessages, { role: 'assistant', content: res.data.reply }]);
    } catch {
      setMessages([...newMessages, { role: 'assistant', content: 'Sorry, I could not process that. Please try again.' }]);
    } finally {
      setChatLoading(false);
    }
  }

  const bookingUrl = `${window.location.origin}/book${companySlug ? `/${companySlug}` : ''}`;

  function copyBookingUrl() {
    navigator.clipboard.writeText(bookingUrl);
    showToast('Booking URL copied to clipboard!', 'success');
  }

  if (bookingDone) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#050816] bg-mesh p-4 text-gray-100">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="glass-card p-8 sm:p-10 text-center max-w-md border border-white/[0.08]"
        >
          <div className="w-20 h-20 bg-emerald-500/15 border border-emerald-500/20 rounded-full flex items-center justify-center mx-auto mb-6 shadow-glow-blue">
            <CheckCircle className="w-10 h-10 text-emerald-400" />
          </div>
          <h2 className="text-3xl font-extrabold text-white tracking-tight mb-3">Booking Confirmed!</h2>
          {confirmedRef && (
            <div className="mb-4 inline-block bg-white/[0.04] border border-white/[0.08] px-4 py-2 rounded-xl">
              <span className="text-[10px] text-gray-500 block uppercase tracking-wider">Booking Reference</span>
              <span className="font-mono text-lg font-bold text-emerald-400 tracking-widest">{confirmedRef}</span>
            </div>
          )}
          <p className="text-gray-400 mb-2">
            Thank you, <span className="font-semibold text-white">{customerName}</span>.
          </p>
          <p className="text-gray-400 text-sm leading-relaxed mb-6">
            Your appointment at <span className="font-semibold text-white">{selectedCentre?.name}</span> on{' '}
            <span className="font-semibold text-white">{selectedSlot && `${format(new Date(date), 'PPP')} at ${formatLocalTime(selectedSlot.start)}`}</span> has been confirmed. An SMS has been dispatched.
          </p>
          <div className="flex gap-3 justify-center">
            <a
              href={`/my-bookings?contact=${encodeURIComponent(customerContact)}`}
              className="btn-primary py-2.5 px-4 text-xs"
            >
              View My Bookings
            </a>
            <button
              onClick={() => window.location.reload()}
              className="btn-secondary py-2.5 px-4 text-xs"
            >
              Book Another
            </button>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#050816] bg-mesh text-gray-100 flex flex-col relative overflow-x-hidden">
      {/* Header */}
      <header className="bg-black/40 backdrop-blur-md border-b border-white/[0.06] sticky top-0 z-40">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {selectedCompany ? (
              selectedCompany.logo ? (
                <img
                  src={selectedCompany.logo}
                  alt={selectedCompany.name}
                  className="w-10 h-10 object-cover rounded-xl border border-white/[0.08] shadow-lg"
                />
              ) : selectedCompany.slug === 'aurora' ? (
                <div className="w-10 h-10 bg-gradient-to-br from-emerald-400 via-teal-500 to-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-emerald-500/20 border border-emerald-400/20">
                  <Sparkles className="text-white animate-pulse" size={20} />
                </div>
              ) : selectedCompany.slug === 'apex' ? (
                <div className="w-10 h-10 bg-gradient-to-br from-amber-500 via-red-500 to-purple-800 rounded-xl flex items-center justify-center shadow-lg shadow-amber-500/20 border border-amber-400/20">
                  <span className="text-white font-black text-sm tracking-tighter">APX</span>
                </div>
              ) : (
                <div className="w-10 h-10 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-500/20 border border-indigo-400/20">
                  <span className="text-white font-bold text-lg">
                    {selectedCompany.name.charAt(0).toUpperCase()}
                  </span>
                </div>
              )
            ) : (
              <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-500/20">
                <Calendar className="text-white" size={20} />
              </div>
            )}
            <div>
              <h1 className="text-lg font-bold text-white leading-tight">
                {isBranded ? (selectedCompany?.name || 'Slotcare') : 'Slotcare'}
              </h1>
              <p className="text-[10px] text-gray-400">
                {isBranded ? 'Secure booking portal' : 'Smart scheduling'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <a
              href="/my-bookings"
              className="hidden sm:inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-gray-300 hover:text-white transition"
            >
              My Bookings
            </a>
            <button
              onClick={() => setChatOpen(!chatOpen)}
              className="btn-primary py-2 px-4 text-xs flex items-center gap-1.5"
            >
              <Bot size={14} />
              AI Chat
            </button>
          </div>
        </div>
      </header>

      {/* Selector Panels grouped compactly */}
      <main className="max-w-6xl w-full mx-auto px-4 py-4 pb-16 z-10 flex-1">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 space-y-4">
            
            {selectedCompany && selectedCompany.description && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="glass-card p-5 border border-white/[0.08] relative overflow-hidden"
              >
                <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-br from-indigo-500/10 to-purple-500/10 blur-xl rounded-full" />
                <h2 className="text-xl font-bold text-white mb-2">{selectedCompany.name}</h2>
                <p className="text-sm text-gray-400 leading-relaxed">{selectedCompany.description}</p>
              </motion.div>
            )}
            
            {/* Slug loading or invalid notifications */}
            {isBranded && loadingCompany && (
              <div className="glass-card p-6 flex items-center justify-center gap-3">
                <Loader2 className="animate-spin text-blue-500" size={24} />
                <span className="text-gray-400 text-sm">Validating slug...</span>
              </div>
            )}

            {isBranded && !loadingCompany && !selectedCompany && (
              <div className="glass-card p-6 text-center">
                <p className="text-rose-400 font-bold">Provider slug is invalid</p>
                <p className="text-xs text-gray-500 mt-1">Please request an updated scheduling link from your provider.</p>
              </div>
            )}

            {/* Compact Horizontal Selectors Grid */}
            {(!isBranded || selectedCompany) && (
              <section className="glass-card p-3 sm:p-4 space-y-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-6 h-6 rounded bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center shrink-0">
                    <Sparkles className="text-indigo-400" size={13} />
                  </div>
                  <h2 className="text-sm font-bold text-white">Configure Appointment</h2>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                  {/* Company Selection */}
                  <div className="relative">
                    <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Company</label>
                    <select
                      value={selectedCompany?.id || ''}
                      onChange={(e) => {
                        const comp = companies.find((c) => c.id === e.target.value);
                        if (comp && comp.slug) {
                          navigate(`/book/${comp.slug}`);
                        } else {
                          setSelectedCompany(null);
                          setSelectedCentre(null);
                          setSelectedSlot(null);
                          setServiceId('');
                          navigate('/book');
                        }
                      }}
                      className="input-field py-1.5 px-3 pr-8 appearance-none bg-[#0c101c] cursor-pointer text-xs"
                    >
                      <option value="" className="bg-[#0c101c]">Choose a company</option>
                      {companies.map((c) => (
                        <option key={c.id} value={c.id} className="bg-[#0c101c]">
                          {c.name}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-3 top-6 text-gray-500 pointer-events-none" size={14} />
                  </div>

                  {/* Branch Selection (only if multiple centres or not branded) */}
                  {(!isBranded || (selectedCompany && centres.length > 1)) && (
                    <div className="relative col-span-1">
                      <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Branch</label>
                      <select
                        value={selectedCentre?.id || ''}
                        onChange={(e) => {
                          setSelectedCentre(centres.find((c) => c.id === e.target.value) || null);
                          setSelectedSlot(null);
                        }}
                        className="input-field py-1.5 px-3 pr-8 appearance-none bg-[#0c101c] cursor-pointer text-xs"
                      >
                        <option value="" className="bg-[#0c101c]">Choose branch</option>
                        {centres.map((c) => (
                          <option key={c.id} value={c.id} className="bg-[#0c101c]">
                            {c.name}
                          </option>
                        ))}
                      </select>
                      <ChevronDown className="absolute right-3 top-6 text-gray-500 pointer-events-none" size={14} />
                    </div>
                  )}

                  {/* Date Input */}
                  <div className="relative">
                    <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Preferred Date</label>
                    <input
                      type="date"
                      value={date}
                      min={new Date().toISOString().split('T')[0]}
                      onChange={(e) => {
                        setDate(e.target.value);
                        setSelectedSlot(null);
                      }}
                      className="input-field py-1.5 px-3 cursor-pointer text-xs"
                    />
                  </div>

                  {/* Service Input */}
                  <div className="relative col-span-1">
                    <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Service Option</label>
                    <select
                      value={serviceId}
                      onChange={(e) => setServiceId(e.target.value)}
                      className="input-field py-1.5 px-3 pr-8 appearance-none bg-[#0c101c] cursor-pointer text-xs"
                    >
                      <option value="" className="bg-[#0c101c]">Default Service</option>
                      {services.map((s) => (
                        <option key={s.id} value={s.id} className="bg-[#0c101c]">
                          {s.name} {s.price && Number(s.price) > 0 ? `(RM ${Number(s.price).toFixed(2)})` : ''}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-3 top-6 text-gray-500 pointer-events-none" size={14} />
                  </div>

                  {/* Therapist Gender Preference */}
                  <div className="relative">
                    <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Therapist Gender</label>
                    <select
                      value={preferredGender}
                      onChange={(e) => {
                        setPreferredGender(e.target.value);
                        setSelectedSlot(null);
                      }}
                      className="input-field py-1.5 px-3 pr-8 appearance-none bg-[#0c101c] cursor-pointer text-xs"
                    >
                      <option value="" className="bg-[#0c101c]">Any gender</option>
                      <option value="Male" className="bg-[#0c101c]">Male</option>
                      <option value="Female" className="bg-[#0c101c]">Female</option>
                    </select>
                    <ChevronDown className="absolute right-3 top-6 text-gray-500 pointer-events-none" size={14} />
                  </div>
                </div>
              </section>
            )}

            {/* 4. Slot Availability Matrix */}
            {selectedCentre && (
              <section className="glass-card p-3 sm:p-4 space-y-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-6 h-6 rounded bg-purple-500/10 border border-purple-500/20 flex items-center justify-center shrink-0">
                    <Clock className="text-purple-400" size={13} />
                  </div>
                  <h2 className="text-sm font-bold text-white">Live Therapist Schedules</h2>
                </div>
                {loadingSlots ? (
                  <div className="flex flex-col items-center justify-center py-12 gap-3">
                    <Loader2 className="animate-spin text-blue-400" size={24} />
                    <span className="text-xs text-gray-500 font-medium">Fetching real-time slots...</span>
                  </div>
                ) : slots.length === 0 ? (
                  <div className="text-center py-8 bg-white/[0.01] rounded-xl border border-dashed border-white/10">
                    <Clock className="w-8 h-8 text-gray-600 mx-auto mb-2" />
                    <p className="text-gray-350 font-semibold text-xs">No live slots for this date.</p>
                    <p className="text-[10px] text-gray-500 mt-0.5">Please try modifying your date or therapist filter.</p>
                  </div>
                ) : (() => {
                    const isFemale = (g: string) => ['female', 'feemale'].includes(g.toLowerCase());
                    const allStaff = Array.from(
                      new Map(slots.map((s) => [s.staffId, { id: s.staffId, name: s.staffName, gender: s.staffGender }])).values()
                    );
                    const duration = serviceId
                      ? (services.find((s) => s.id === serviceId)?.durationOverrideMinutes || selectedCentre.slotDurationMinutes)
                      : selectedCentre.slotDurationMinutes;

                    const allTimes: string[] = [];
                    if (selectedCentre.openTime && selectedCentre.closeTime) {
                      const [openH, openM] = selectedCentre.openTime.split(':').map(Number);
                      const [closeH, closeM] = selectedCentre.closeTime.split(':').map(Number);
                      
                      const dayStart = new Date(`${date}T${String(openH).padStart(2, '0')}:${String(openM).padStart(2, '0')}:00.000Z`);
                      const dayEnd = new Date(`${date}T${String(closeH).padStart(2, '0')}:${String(closeM).padStart(2, '0')}:00.000Z`);
                      
                      let cursor = new Date(dayStart.getTime());
                      while (cursor.getTime() + duration * 60000 <= dayEnd.getTime()) {
                        allTimes.push(cursor.toISOString());
                        cursor = new Date(cursor.getTime() + selectedCentre.slotDurationMinutes * 60000);
                      }
                    }

                    if (allTimes.length === 0) {
                      allTimes.push(...Array.from(new Set(slots.map((s) => s.start))).sort(
                        (a, b) => new Date(a).getTime() - new Date(b).getTime(),
                      ));
                    }

                    const femaleStaff = allStaff.filter((s) => isFemale(s.gender)).sort((a, b) => a.name.localeCompare(b.name));
                    const maleStaff = allStaff.filter((s) => !isFemale(s.gender)).sort((a, b) => a.name.localeCompare(b.name));

                    const renderGroup = (groupStaff: typeof allStaff, gender: string) => {
                      if (groupStaff.length === 0) return null;
                      const isFem = gender === 'Female';
                      return (
                        <div key={gender} className="mb-4 last:mb-0">
                          <div className={`inline-flex items-center gap-1.5 mb-2.5 px-2 py-0.5 rounded text-[10px] font-bold ${isFem ? 'pill-danger' : 'pill-info'}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${isFem ? 'bg-rose-400' : 'bg-blue-400'}`} />
                            {gender} Therapists
                          </div>
                          
                          <div className="space-y-3">
                            {groupStaff.map((s) => (
                              <div key={s.id} className="bg-white/[0.02] border border-white/[0.04] p-3 rounded-xl">
                                <div className="flex items-center justify-between mb-2 pb-1.5 border-b border-white/[0.04]">
                                  <span className="font-bold text-gray-200 text-xs">{s.name}</span>
                                  <span className="text-[9px] text-gray-500 font-normal">Therapist</span>
                                </div>
                                <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-1.5">
                                  {allTimes.map((time) => {
                                    const slot = slots.find((sl) => sl.start === time && sl.staffId === s.id);
                                    const isBooked = !slot || slot.status === 'booked';
                                    const isSelected = slot && selectedSlot?.start === slot.start && selectedSlot?.staffId === slot.staffId;
                                    const timeLabel = formatLocalTime(time);
                                    return (
                                      <div key={time} className="text-center flex items-center justify-center">
                                        {isBooked ? (
                                          <span className="inline-block w-full py-1 text-[10px] font-medium text-gray-600 line-through opacity-40">
                                            {timeLabel}
                                          </span>
                                        ) : (
                                          <button
                                            type="button"
                                            onClick={() => setSelectedSlot(slot)}
                                            className={`w-full py-1 px-1.5 rounded-md text-[10px] font-bold border transition-all ${
                                              isSelected
                                                ? 'bg-blue-600 text-white border-blue-500 shadow-glow-blue'
                                                : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20 hover:bg-emerald-500/20 hover:border-emerald-500/30'
                                            }`}
                                          >
                                            {timeLabel}
                                          </button>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    };

                    return (
                      <div className="space-y-4">
                        {renderGroup(femaleStaff, 'Female')}
                        {renderGroup(maleStaff, 'Male')}
                      </div>
                    );
                  })()}
              </section>
            )}
          </div>

          {/* Sidebar checkout summary */}
          <div className="space-y-6">
            <div className="sticky top-24 space-y-6">
              {/* Marketing block */}
              <div className="bg-gradient-to-br from-blue-600 to-indigo-800 text-white p-6 rounded-2xl shadow-lg border border-white/10 relative overflow-hidden">
                <div className="absolute inset-0 bg-mesh opacity-20 pointer-events-none" />
                <div className="w-10 h-10 bg-white/10 border border-white/20 rounded-xl flex items-center justify-center mb-4 shrink-0">
                  <Sparkles className="text-white animate-spin-slow" size={20} />
                </div>
                <h3 className="text-lg font-bold mb-1.5">
                  {isBranded ? selectedCompany?.name || 'Instant Booking' : 'AI-Optimized Booking'}
                </h3>
                <p className="text-blue-100 text-xs leading-relaxed">
                  Bookings are instantly synchronized. Our virtual AI assistant can also assist in booking via the chat button below.
                </p>
              </div>

              {/* Checkout Form */}
              {!selectedSlot ? (
                <div className="glass-card p-5 sm:p-6 text-center space-y-3">
                  <div className="w-10 h-10 bg-white/[0.04] border border-white/[0.08] rounded-xl flex items-center justify-center mx-auto text-gray-400">
                    <Clock size={18} />
                  </div>
                  <h3 className="font-bold text-white text-sm">Choose a Slot</h3>
                  <p className="text-gray-400 text-xs leading-relaxed">
                    Please choose an available therapist slot in the schedule grid to fill in your contact information and book your session.
                  </p>
                </div>
              ) : (
                <motion.section
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="glass-card p-5 sm:p-6 space-y-4"
                >
                  <div className="flex items-center gap-2">
                    <User className="text-blue-400" size={16} />
                    <h2 className="text-base font-bold text-white">Enter Contact Info</h2>
                  </div>
                  <div className="space-y-3.5">
                    <div className="relative">
                      <User className="absolute left-3.5 top-3.5 text-gray-500" size={16} />
                      <input
                        placeholder="Full Name"
                        value={customerName}
                        onChange={(e) => setCustomerName(e.target.value)}
                        className="input-field pl-10 py-2.5"
                        required
                      />
                    </div>
                    <div className="relative">
                      <Phone className="absolute left-3.5 top-3.5 text-gray-500" size={16} />
                      <input
                        placeholder="Phone Contact"
                        value={customerContact}
                        onChange={(e) => setCustomerContact(e.target.value)}
                        className="input-field pl-10 py-2.5"
                        required
                      />
                    </div>
                    <div className="relative">
                      <Mail className="absolute left-3.5 top-3.5 text-gray-500" size={16} />
                      <input
                        type="email"
                        placeholder="Email (optional)"
                        value={customerEmail}
                        onChange={(e) => setCustomerEmail(e.target.value)}
                        className="input-field pl-10 py-2.5"
                      />
                    </div>
                    {/* Honeypot field (hidden from users, but bots will fill it) */}
                    <div className="hidden" aria-hidden="true">
                      <input
                        type="text"
                        name="website"
                        value={website}
                        onChange={(e) => setWebsite(e.target.value)}
                        tabIndex={-1}
                        autoComplete="off"
                      />
                    </div>
                  </div>
                  <button
                    onClick={handleBook}
                    disabled={bookingLoading || !customerName.trim() || !customerContact.trim()}
                    className="w-full btn-primary py-3 flex items-center justify-center gap-2 mt-4 text-xs uppercase tracking-wider font-bold"
                  >
                    {bookingLoading ? (
                      <>
                        <Loader2 className="animate-spin" size={16} /> Confirming...
                      </>
                    ) : (
                      'Confirm Appointment'
                    )}
                  </button>
                </motion.section>
              )}

              {/* Summary Card */}
              {selectedSlot && (
                <div className="glass-card p-5 space-y-3.5 text-xs">
                  <h3 className="font-bold text-white text-sm mb-1">Appointment Details</h3>
                  {selectedCompany && (
                    <div className="flex justify-between border-b border-white/[0.04] pb-2">
                      <span className="text-gray-500">Company</span>
                      <span className="font-semibold text-gray-200">{selectedCompany.name}</span>
                    </div>
                  )}
                  <div className="flex justify-between border-b border-white/[0.04] pb-2">
                    <span className="text-gray-500">Location Branch</span>
                    <span className="font-semibold text-gray-200 text-right">{selectedCentre?.name}</span>
                  </div>
                  {serviceId && (
                    <div className="flex justify-between border-b border-white/[0.04] pb-2">
                      <span className="text-gray-500">Selected Service</span>
                      <span className="font-semibold text-gray-200 text-right">
                        {(() => {
                          const s = services.find((srv) => srv.id === serviceId);
                          if (!s) return 'Default Service';
                          const priceStr = s.price && Number(s.price) > 0 ? ` (RM ${Number(s.price).toFixed(2)})` : '';
                          return `${s.name}${priceStr}`;
                        })()}
                      </span>
                    </div>
                  )}
                  <div className="flex justify-between border-b border-white/[0.04] pb-2">
                    <span className="text-gray-500">Appointment Date</span>
                    <span className="font-semibold text-gray-200">{format(new Date(date), 'PPP')}</span>
                  </div>
                  {preferredGender && (
                    <div className="flex justify-between border-b border-white/[0.04] pb-2">
                      <span className="text-gray-500">Therapist Gender</span>
                      <span className="font-semibold text-gray-200">{preferredGender}</span>
                    </div>
                  )}
                  <div className="flex justify-between border-b border-white/[0.04] pb-2">
                    <span className="text-gray-500">Scheduled Time</span>
                    <span className="font-semibold text-gray-200">{formatLocalTime(selectedSlot.start)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Assigned Therapist</span>
                    <span className="font-semibold text-gray-200">{selectedSlot.staffName}</span>
                  </div>
                </div>
              )}

              {isBranded && (
                <div className="glass-card p-5 space-y-2">
                  <h3 className="font-bold text-white text-xs">Share Booking Link</h3>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 p-2 bg-[#0c101c] border border-white/[0.06] rounded-lg text-[10px] text-gray-400 truncate font-mono">
                      {bookingUrl}
                    </div>
                    <button
                      onClick={copyBookingUrl}
                      className="p-2 border border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.06] text-gray-400 hover:text-white rounded-lg transition"
                      title="Copy URL"
                    >
                      <Copy size={13} />
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>

      {/* Floating Chat Widget */}
      <AnimatePresence>
        {chatOpen && (
          <motion.div
            initial={{ opacity: 0, y: 30, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 30, scale: 0.95 }}
            className="fixed bottom-4 right-4 w-[400px] max-w-[calc(100vw-2rem)] glass-card shadow-glass-lg border border-white/[0.08] flex flex-col max-h-[70vh] z-50 overflow-hidden"
          >
            {/* Header bar */}
            <div className="p-4 border-b border-white/[0.06] flex items-center justify-between bg-gradient-to-r from-blue-600 to-indigo-700 text-white relative">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-white/20 rounded-full flex items-center justify-center">
                  <Bot size={18} />
                </div>
                <div>
                  <h3 className="font-bold text-xs">Slotcare AI</h3>
                  <p className="text-[10px] text-blue-100">Booking Concierge</p>
                </div>
              </div>
              <button onClick={() => setChatOpen(false)} className="text-white hover:text-blue-100 transition p-1">
                <X size={18} />
              </button>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3.5 min-h-[280px] bg-black/20">
              {messages.map((m, i) => (
                <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div
                    className={`max-w-[85%] px-3.5 py-2.5 rounded-2xl text-xs leading-relaxed shadow-sm ${
                      m.role === 'user'
                        ? 'bg-blue-600 text-white rounded-br-none'
                        : 'bg-white/[0.05] border border-white/[0.08] text-gray-200 rounded-bl-none'
                    }`}
                  >
                    {m.content}
                  </div>
                </div>
              ))}
              {chatLoading && (
                <div className="flex items-center gap-1.5 text-[10px] text-gray-500 font-semibold">
                  <Loader2 className="animate-spin text-blue-400" size={12} />
                  Assistant is compiling slots...
                </div>
              )}
              <div ref={chatEndRef} />
            </div>

            {/* Input form */}
            <div className="p-4 border-t border-white/[0.06] bg-white/[0.01] space-y-3">
              {(!customerName.trim() || !customerContact.trim()) && (
                <div className="grid grid-cols-2 gap-2">
                  <div className="relative">
                    <User className="absolute left-2.5 top-2.5 text-gray-500" size={12} />
                    <input
                      placeholder="Your name"
                      value={customerName}
                      onChange={(e) => setCustomerName(e.target.value)}
                      className="w-full pl-8 pr-2.5 py-2 border border-white/[0.08] bg-white/[0.02] rounded-lg text-xs focus:ring-1 focus:ring-blue-500 outline-none text-white"
                    />
                  </div>
                  <div className="relative">
                    <Phone className="absolute left-2.5 top-2.5 text-gray-500" size={12} />
                    <input
                      placeholder="Phone no."
                      value={customerContact}
                      onChange={(e) => setCustomerContact(e.target.value)}
                      className="w-full pl-8 pr-2.5 py-2 border border-white/[0.08] bg-white/[0.02] rounded-lg text-xs focus:ring-1 focus:ring-blue-500 outline-none text-white"
                    />
                  </div>
                </div>
              )}
              <form onSubmit={handleChatSend} className="flex gap-2">
                <input
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  placeholder={customerName.trim() && customerContact.trim() ? 'Ask AI about appointment slots...' : 'Provide info above to start chat'}
                  disabled={!customerName.trim() || !customerContact.trim()}
                  className="flex-1 px-3.5 py-2 border border-white/[0.08] bg-white/[0.02] rounded-xl text-xs focus:ring-1 focus:ring-blue-500 outline-none text-white disabled:opacity-50"
                />
                <button
                  type="submit"
                  disabled={chatLoading || !customerName.trim() || !customerContact.trim()}
                  className="p-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl transition disabled:opacity-50 shrink-0"
                >
                  <Send size={15} />
                </button>
              </form>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
