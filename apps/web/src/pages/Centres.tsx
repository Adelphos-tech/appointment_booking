import { useEffect, useState } from 'react';
import { Plus, Pencil, Trash2 } from 'lucide-react';

import AnimatedPage from '../components/AnimatedPage';
import DataTable from '../components/DataTable';
import Modal from '../components/Modal';
import { SkeletonTable } from '../components/SkeletonLoader';
import { getCentres, getCompanies, createCentre, updateCentre, deleteCentre } from '../lib/api';
import type { Centre, Company } from '../lib/api';
import { useToast } from '../hooks/useToast';

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export default function Centres() {
  const { showToast } = useToast();
  const [centres, setCentres] = useState<Centre[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [editItem, setEditItem] = useState<Centre | null>(null);
  const [deleteItem, setDeleteItem] = useState<Centre | null>(null);
  const [form, setForm] = useState({
    name: '', location: '', serviceType: 'General', openTime: '10:00', closeTime: '18:00',
    slotDurationMinutes: 30, prepTimeBeforeMinutes: 0, prepTimeAfterMinutes: 0,
    workingDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as string[], companyId: '',
  });

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    try {
      const [c, co] = await Promise.all([getCentres(), getCompanies()]);
      setCentres(c); setCompanies(co);
    } finally { setLoading(false); }
  }

  function openEdit(c: Centre) {
    setForm({
      name: c.name, location: c.location, serviceType: c.serviceType,
      openTime: c.openTime, closeTime: c.closeTime,
      slotDurationMinutes: c.slotDurationMinutes,
      prepTimeBeforeMinutes: c.prepTimeBeforeMinutes, prepTimeAfterMinutes: c.prepTimeAfterMinutes,
      workingDays: c.workingDays, companyId: c.companyId || '',
    });
    setEditItem(c);
  }

  function resetForm() {
    setForm({ name: '', location: '', serviceType: 'General', openTime: '10:00', closeTime: '18:00',
      slotDurationMinutes: 30, prepTimeBeforeMinutes: 0, prepTimeAfterMinutes: 0,
      workingDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'], companyId: '' });
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    try { await createCentre(form); showToast('Centre created', 'success'); setShowCreate(false); resetForm(); await load(); }
    catch (err: any) { showToast(err.message, 'error'); }
  }

  async function handleUpdate(e: React.FormEvent) {
    e.preventDefault();
    if (!editItem) return;
    try { await updateCentre(editItem.id, form); showToast('Centre updated', 'success'); setEditItem(null); resetForm(); await load(); }
    catch (err: any) { showToast(err.message, 'error'); }
  }

  async function handleDelete() {
    if (!deleteItem) return;
    try { await deleteCentre(deleteItem.id); showToast('Centre deleted', 'success'); setDeleteItem(null); await load(); }
    catch (err: any) { showToast(err.message, 'error'); }
  }

  function toggleDay(day: string) {
    setForm((f) => ({
      ...f,
      workingDays: f.workingDays.includes(day) ? f.workingDays.filter((d) => d !== day) : [...f.workingDays, day],
    }));
  }

  const columns = [
    { key: 'name', label: 'Name', sortable: true, render: (row: Centre) => (
      <span className="font-semibold text-white">{row.name}</span>
    )},
    { key: 'location', label: 'Location', render: (row: Centre) => (
      <span className="text-gray-400">{row.location}</span>
    )},
    { key: 'hours', label: 'Hours', render: (row: Centre) => (
      <div className="flex items-center gap-1.5">
        <span className="pill-info">{row.openTime}</span>
        <span className="text-gray-600">→</span>
        <span className="pill-info">{row.closeTime}</span>
      </div>
    )},
    { key: 'slot', label: 'Slot', render: (row: Centre) => (
      <span className="pill-neutral">{row.slotDurationMinutes} min</span>
    )},
    { key: 'company', label: 'Company', render: (row: Centre) => (
      <span className="text-gray-500 text-sm">{row.company?.name || companies.find((c) => c.id === row.companyId)?.name || '—'}</span>
    )},
  ];

  const formFields = (
    <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-1">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-semibold text-gray-300 mb-2">Centre Name</label>
          <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="input-field" required />
        </div>
        <div>
          <label className="block text-sm font-semibold text-gray-300 mb-2">Company</label>
          <select value={form.companyId} onChange={(e) => setForm({ ...form, companyId: e.target.value })} className="input-field" required>
            <option value="">Select Company</option>
            {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
      </div>
      <div>
        <label className="block text-sm font-semibold text-gray-300 mb-2">Location</label>
        <input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} className="input-field" required />
      </div>
      <div className="grid grid-cols-3 gap-4">
        <div>
          <label className="block text-sm font-semibold text-gray-300 mb-2">Service Type</label>
          <input value={form.serviceType} onChange={(e) => setForm({ ...form, serviceType: e.target.value })} className="input-field" />
        </div>
        <div>
          <label className="block text-sm font-semibold text-gray-300 mb-2">Open Time</label>
          <input type="time" value={form.openTime} onChange={(e) => setForm({ ...form, openTime: e.target.value })} className="input-field" />
        </div>
        <div>
          <label className="block text-sm font-semibold text-gray-300 mb-2">Close Time</label>
          <input type="time" value={form.closeTime} onChange={(e) => setForm({ ...form, closeTime: e.target.value })} className="input-field" />
        </div>
      </div>
      <div className="grid grid-cols-3 gap-4">
        <div>
          <label className="block text-sm font-semibold text-gray-300 mb-2">Slot Duration (min)</label>
          <input type="number" value={form.slotDurationMinutes} onChange={(e) => setForm({ ...form, slotDurationMinutes: Number(e.target.value) })} className="input-field" />
        </div>
        <div>
          <label className="block text-sm font-semibold text-gray-300 mb-2">Prep Before (min)</label>
          <input type="number" value={form.prepTimeBeforeMinutes} onChange={(e) => setForm({ ...form, prepTimeBeforeMinutes: Number(e.target.value) })} className="input-field" />
        </div>
        <div>
          <label className="block text-sm font-semibold text-gray-300 mb-2">Prep After (min)</label>
          <input type="number" value={form.prepTimeAfterMinutes} onChange={(e) => setForm({ ...form, prepTimeAfterMinutes: Number(e.target.value) })} className="input-field" />
        </div>
      </div>
      <div>
        <label className="block text-sm font-semibold text-gray-300 mb-2">Working Days</label>
        <div className="flex flex-wrap gap-2">
          {DAYS.map((day) => (
            <button key={day} type="button" onClick={() => toggleDay(day)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                form.workingDays.includes(day)
                  ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                  : 'bg-white/[0.03] text-gray-500 border border-white/[0.06] hover:text-gray-300'
              }`}
            >{day}</button>
          ))}
        </div>
      </div>
    </div>
  );

  if (loading) return <SkeletonTable rows={5} />;

  return (
    <AnimatedPage>
      <div className="flex items-center justify-between mb-6">
        <div className="page-header mb-0">
          <h1 className="page-title">Centres</h1>
          <p className="page-subtitle">Manage your service centres and branches</p>
        </div>
        <button onClick={() => { resetForm(); setShowCreate(true); }} className="btn-primary flex items-center gap-2">
          <Plus size={16} /> Add Centre
        </button>
      </div>

      <DataTable columns={columns} data={centres} keyField="id" emptyMessage="No centres yet"
        actions={(row) => (
          <>
            <button onClick={() => openEdit(row)} className="p-2 rounded-lg text-gray-400 hover:text-blue-400 hover:bg-blue-500/10 transition"><Pencil size={15} /></button>
            <button onClick={() => setDeleteItem(row)} className="p-2 rounded-lg text-gray-400 hover:text-rose-400 hover:bg-rose-500/10 transition"><Trash2 size={15} /></button>
          </>
        )}
      />

      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Create Centre" size="lg">
        <form onSubmit={handleCreate}>
          {formFields}
          <div className="flex justify-end gap-3 mt-6">
            <button type="button" onClick={() => setShowCreate(false)} className="btn-secondary">Cancel</button>
            <button type="submit" className="btn-primary">Create Centre</button>
          </div>
        </form>
      </Modal>

      <Modal open={!!editItem} onClose={() => setEditItem(null)} title="Edit Centre" size="lg">
        <form onSubmit={handleUpdate}>
          {formFields}
          <div className="flex justify-end gap-3 mt-6">
            <button type="button" onClick={() => setEditItem(null)} className="btn-secondary">Cancel</button>
            <button type="submit" className="btn-primary">Save Changes</button>
          </div>
        </form>
      </Modal>

      <Modal open={!!deleteItem} onClose={() => setDeleteItem(null)} title="Delete Centre" size="sm" danger>
        <p className="text-gray-400 text-sm mb-2">Delete <strong className="text-white">{deleteItem?.name}</strong>?</p>
        <p className="text-rose-400/80 text-xs mb-6">⚠️ This will also delete all staff, services, and bookings under this centre.</p>
        <div className="flex justify-end gap-3">
          <button onClick={() => setDeleteItem(null)} className="btn-secondary">Cancel</button>
          <button onClick={handleDelete} className="btn-danger">Delete Centre</button>
        </div>
      </Modal>
    </AnimatedPage>
  );
}
