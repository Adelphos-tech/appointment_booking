import { useEffect, useState } from 'react';
import { Calendar, ClipboardList, Plus, Sparkles, User, UserCheck } from 'lucide-react';

import AnimatedPage from '../components/AnimatedPage';
import DataTable from '../components/DataTable';
import { createWaitlistEntry, getCentres, getServices, getWaitlist } from '../lib/api';
import type { Centre, Service, WaitlistEntry } from '../lib/api';
import { useToast } from '../hooks/useToast';

export default function Waitlist() {
  const { showToast } = useToast();
  const [entries, setEntries] = useState<WaitlistEntry[]>([]);
  const [centres, setCentres] = useState<Centre[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({
    customerName: '',
    customerContact: '',
    centreId: '',
    serviceId: '',
    preferredDate: '',
    preferredGender: '',
    notes: '',
  });

  useEffect(() => {
    load();
  }, []);

  async function load() {
    try {
      const [e, c, s] = await Promise.all([getWaitlist(), getCentres(), getServices()]);
      setEntries(e);
      setCentres(c);
      setServices(s);
    } catch (err: any) {
      showToast(err.message || 'Failed to load waitlist data', 'error');
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setAdding(true);
    try {
      const data: any = { ...form };
      if (!data.preferredGender) delete data.preferredGender;
      if (!data.notes) delete data.notes;
      await createWaitlistEntry(data);
      showToast('Successfully added customer to the waitlist!', 'success');
      setForm({
        customerName: '',
        customerContact: '',
        centreId: '',
        serviceId: '',
        preferredDate: '',
        preferredGender: '',
        notes: '',
      });
      await load();
    } catch (err: any) {
      showToast(err.message || 'Failed to add waitlist entry', 'error');
    } finally {
      setAdding(false);
    }
  }

  const columns = [
    {
      key: 'customerName',
      label: 'Customer',
      sortable: true,
      render: (row: WaitlistEntry) => (
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-white/[0.04] border border-white/[0.08] flex items-center justify-center font-semibold text-gray-300">
            <User size={14} className="text-gray-400" />
          </div>
          <span className="font-semibold text-white">{row.customerName}</span>
        </div>
      ),
    },
    {
      key: 'customerContact',
      label: 'Contact No.',
      render: (row: WaitlistEntry) => (
        <span className="font-mono text-sm text-gray-400">{row.customerContact}</span>
      ),
    },
    {
      key: 'preferredDate',
      label: 'Preferred Date',
      sortable: true,
      render: (row: WaitlistEntry) => (
        <div className="flex items-center gap-1.5 text-gray-300 font-mono">
          <Calendar size={13} className="text-blue-400" />
          {new Date(row.preferredDate).toLocaleDateString(undefined, { dateStyle: 'medium' })}
        </div>
      ),
    },
    {
      key: 'preferredGender',
      label: 'Preferred Gender',
      render: (row: WaitlistEntry) => {
        if (!row.preferredGender) return <span className="text-gray-500">—</span>;
        const isFemale = row.preferredGender.toLowerCase().startsWith('fem') || row.preferredGender.toLowerCase().startsWith('feem');
        return (
          <span className={isFemale ? 'pill-danger' : 'pill-info'}>
            {row.preferredGender}
          </span>
        );
      },
    },
    {
      key: 'notes',
      label: 'Customer Notes',
      render: (row: WaitlistEntry) => (
        <span className="text-gray-400 text-xs italic max-w-xs block truncate" title={row.notes || ''}>
          {row.notes || 'No notes'}
        </span>
      ),
    },
  ];

  return (
    <AnimatedPage className="space-y-6">
      <div className="page-header">
        <h1 className="page-title flex items-center gap-2">
          <ClipboardList className="text-purple-400" size={24} />
          Waitlist Management
        </h1>
        <p className="page-subtitle">Manage customer waitlist queries and queue positions when slots are full</p>
      </div>

      {/* Add entry form */}
      <div className="glass-card p-6 relative overflow-hidden">
        <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-purple-500 to-indigo-500 opacity-60" />
        <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
          <UserCheck size={16} className="text-purple-400" />
          Add Customer to Waitlist
        </h3>
        
        <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
          <div>
            <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Customer Name</label>
            <input
              placeholder="e.g. John Doe"
              value={form.customerName}
              onChange={(e) => setForm({ ...form, customerName: e.target.value })}
              className="input-field py-2.5"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Contact Number</label>
            <input
              placeholder="+1234567890"
              value={form.customerContact}
              onChange={(e) => setForm({ ...form, customerContact: e.target.value })}
              className="input-field py-2.5"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Centre</label>
            <select
              value={form.centreId}
              onChange={(e) => setForm({ ...form, centreId: e.target.value, serviceId: '' })}
              className="input-field py-2.5 bg-[#0b0f19] cursor-pointer"
              required
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
            <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Service</label>
            <select
              value={form.serviceId}
              onChange={(e) => setForm({ ...form, serviceId: e.target.value })}
              className="input-field py-2.5 bg-[#0b0f19] cursor-pointer"
              required
              disabled={!form.centreId}
            >
              <option value="" className="bg-[#0b0f19]">Select Service</option>
              {services
                .filter((s) => s.centreId === form.centreId)
                .map((s) => (
                  <option key={s.id} value={s.id} className="bg-[#0b0f19]">
                    {s.name}
                  </option>
                ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Preferred Date</label>
            <input
              type="date"
              value={form.preferredDate}
              onChange={(e) => setForm({ ...form, preferredDate: e.target.value })}
              className="input-field py-2.5 cursor-pointer"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Gender Preference</label>
            <select
              value={form.preferredGender}
              onChange={(e) => setForm({ ...form, preferredGender: e.target.value })}
              className="input-field py-2.5 bg-[#0b0f19] cursor-pointer"
            >
              <option value="" className="bg-[#0b0f19]">Any gender</option>
              <option value="Male" className="bg-[#0b0f19]">Male</option>
              <option value="Female" className="bg-[#0b0f19]">Female</option>
            </select>
          </div>

          <div className="md:col-span-2">
            <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Notes</label>
            <input
              placeholder="e.g. Needs slot after 5pm"
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              className="input-field py-2.5"
            />
          </div>

          <div className="md:col-span-4 flex justify-end">
            <button
              type="submit"
              disabled={adding}
              className="btn-primary py-2.5 px-6 text-xs flex items-center gap-1.5"
            >
              <Plus size={14} />
              {adding ? 'Adding...' : 'Add to Waitlist'}
            </button>
          </div>
        </form>
      </div>

      {/* List */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-gray-400 flex items-center gap-2">
          <Sparkles size={14} className="text-purple-400" />
          Waitlist Queue ({entries.length} requests)
        </h3>

        <DataTable
          columns={columns}
          data={entries}
          keyField="id"
          emptyMessage="No customer currently waitlisted."
        />
      </div>
    </AnimatedPage>
  );
}
