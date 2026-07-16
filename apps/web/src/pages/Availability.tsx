import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { Clock, Sparkles, User } from 'lucide-react';

import AnimatedPage from '../components/AnimatedPage';
import DataTable from '../components/DataTable';
import { getAvailability, getCentres, getServices } from '../lib/api';
import type { Centre, Service } from '../lib/api';

interface SlotRow {
  id: string;
  staffName: string;
  staffGender: string;
  start: string;
  end: string;
}

export default function Availability() {
  const [centres, setCentres] = useState<Centre[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [centreId, setCentreId] = useState('');
  const [serviceId, setServiceId] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [slots, setSlots] = useState<SlotRow[]>([]);
  const [preferredGender, setPreferredGender] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    async function load() {
      const [c, s] = await Promise.all([getCentres(), getServices()]);
      setCentres(c);
      setServices(s);
      if (c.length > 0) {
        setCentreId(c[0].id);
      }
    }
    load();
  }, []);

  async function handleSearch() {
    if (!centreId || !date) return;
    setLoading(true);
    try {
      const data = await getAvailability({
        centreId,
        date,
        serviceId: serviceId || undefined,
        preferredGender: preferredGender || undefined,
      });
      // Add unique id for key field mapping
      const formatted = (data.slots || []).map((s: any, idx: number) => ({
        id: `${s.staffId}-${s.start}-${idx}`,
        ...s,
      }));
      setSlots(formatted);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  // Trigger search automatically when filters change and centreId/date is present
  useEffect(() => {
    if (centreId && date) {
      handleSearch();
    }
  }, [centreId, date, serviceId, preferredGender]);

  const columns = [
    {
      key: 'staffName',
      label: 'Staff Member',
      sortable: true,
      render: (row: SlotRow) => (
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-white/[0.04] border border-white/[0.08] flex items-center justify-center text-xs font-semibold text-gray-300">
            <User size={14} className="text-gray-400" />
          </div>
          <span className="font-semibold text-white">{row.staffName}</span>
        </div>
      ),
    },
    {
      key: 'staffGender',
      label: 'Gender',
      render: (row: SlotRow) => {
        const isFemale = row.staffGender.toLowerCase().startsWith('fem') || row.staffGender.toLowerCase().startsWith('feem');
        return (
          <span className={isFemale ? 'pill-danger' : 'pill-info'}>
            {row.staffGender}
          </span>
        );
      },
    },
    {
      key: 'start',
      label: 'Start Time',
      render: (row: SlotRow) => (
        <div className="flex items-center gap-1.5 text-gray-300 font-mono">
          <Clock size={13} className="text-blue-400" />
          {format(new Date(row.start), 'h:mm a')}
        </div>
      ),
    },
    {
      key: 'end',
      label: 'End Time',
      render: (row: SlotRow) => (
        <div className="flex items-center gap-1.5 text-gray-300 font-mono">
          <Clock size={13} className="text-purple-400" />
          {format(new Date(row.end), 'h:mm a')}
        </div>
      ),
    },
  ];

  return (
    <AnimatedPage className="space-y-6">
      <div className="page-header">
        <h1 className="page-title">Check Availability</h1>
        <p className="page-subtitle">Search live availability slots across centres and staff</p>
      </div>

      {/* Filters form */}
      <div className="glass-card p-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 items-end relative overflow-hidden">
        <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-blue-500 to-purple-600 opacity-60" />
        
        <div>
          <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Centre</label>
          <select
            value={centreId}
            onChange={(e) => setCentreId(e.target.value)}
            className="input-field py-2.5 bg-[#0b0f19] cursor-pointer"
          >
            <option value="" className="bg-[#0b0f19]">Select Centre</option>
            {centres.map((c) => (
              <option key={c.id} value={c.id} className="bg-[#0b0f19]">
                {c.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Service (optional)</label>
          <select
            value={serviceId}
            onChange={(e) => setServiceId(e.target.value)}
            className="input-field py-2.5 bg-[#0b0f19] cursor-pointer"
            disabled={!centreId}
          >
            <option value="" className="bg-[#0b0f19]">All Services</option>
            {services
              .filter((s) => s.centreId === centreId)
              .map((s) => (
                <option key={s.id} value={s.id} className="bg-[#0b0f19]">
                  {s.name}
                </option>
              ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Date</label>
          <div className="relative">
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="input-field py-2.5 pr-10 cursor-pointer"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Preferred Gender (optional)</label>
          <select
            value={preferredGender}
            onChange={(e) => setPreferredGender(e.target.value)}
            className="input-field py-2.5 bg-[#0b0f19] cursor-pointer"
          >
            <option value="" className="bg-[#0b0f19]">Any gender</option>
            <option value="Male" className="bg-[#0b0f19]">Male</option>
            <option value="Female" className="bg-[#0b0f19]">Female</option>
          </select>
        </div>
      </div>

      {/* Results */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-400 flex items-center gap-2">
            <Sparkles size={14} className="text-yellow-400" />
            {loading ? 'Fetching slots...' : `${slots.length} available slots found`}
          </h3>
          <button
            onClick={handleSearch}
            disabled={loading || !centreId}
            className="btn-primary py-2 px-4 text-xs flex items-center gap-1.5"
          >
            Refresh Slots
          </button>
        </div>

        <DataTable
          columns={columns}
          data={slots}
          keyField="id"
          emptyMessage="No available slots found for the selected filters. Try another date or centre."
        />
      </div>
    </AnimatedPage>
  );
}
