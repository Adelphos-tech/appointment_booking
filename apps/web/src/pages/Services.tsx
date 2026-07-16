import { useEffect, useState } from 'react';
import { Plus, Pencil, Trash2 } from 'lucide-react';

import AnimatedPage from '../components/AnimatedPage';
import DataTable from '../components/DataTable';
import Modal from '../components/Modal';
import { SkeletonTable } from '../components/SkeletonLoader';
import { getServices, getCentres, createService, updateService, deleteService } from '../lib/api';
import type { Service, Centre } from '../lib/api';
import { useToast } from '../hooks/useToast';

export default function Services() {
  const { showToast } = useToast();
  const [services, setServices] = useState<Service[]>([]);
  const [centres, setCentres] = useState<Centre[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [editItem, setEditItem] = useState<Service | null>(null);
  const [deleteItem, setDeleteItem] = useState<Service | null>(null);
  const [form, setForm] = useState({ name: '', centreId: '', durationOverrideMinutes: '', price: '' });

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    try {
      const [s, c] = await Promise.all([getServices(), getCentres()]);
      setServices(s); setCentres(c);
    } finally { setLoading(false); }
  }

  function openEdit(s: Service) {
    setForm({
      name: s.name, centreId: s.centreId,
      durationOverrideMinutes: s.durationOverrideMinutes?.toString() || '',
      price: s.price?.toString() || '',
    });
    setEditItem(s);
  }

  function resetForm() { setForm({ name: '', centreId: '', durationOverrideMinutes: '', price: '' }); }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    try {
      await createService({
        name: form.name, centreId: form.centreId,
        durationOverrideMinutes: form.durationOverrideMinutes ? Number(form.durationOverrideMinutes) : undefined,
        price: form.price ? Number(form.price) : undefined,
      } as any);
      showToast('Service created', 'success'); setShowCreate(false); resetForm(); await load();
    } catch (err: any) { showToast(err.message, 'error'); }
  }

  async function handleUpdate(e: React.FormEvent) {
    e.preventDefault();
    if (!editItem) return;
    try {
      await updateService(editItem.id, {
        name: form.name, centreId: form.centreId,
        durationOverrideMinutes: form.durationOverrideMinutes ? Number(form.durationOverrideMinutes) : undefined,
        price: form.price ? Number(form.price) : undefined,
      } as any);
      showToast('Service updated', 'success'); setEditItem(null); resetForm(); await load();
    } catch (err: any) { showToast(err.message, 'error'); }
  }

  async function handleDelete() {
    if (!deleteItem) return;
    try { await deleteService(deleteItem.id); showToast('Service deleted', 'success'); setDeleteItem(null); await load(); }
    catch (err: any) { showToast(err.message, 'error'); }
  }

  const columns = [
    { key: 'name', label: 'Service Name', sortable: true, render: (row: Service) => (
      <span className="font-semibold text-white">{row.name}</span>
    )},
    { key: 'centreId', label: 'Centre', render: (row: Service) => (
      <span className="text-gray-400 text-sm">{centres.find((c) => c.id === row.centreId)?.name || '—'}</span>
    )},
    { key: 'durationOverrideMinutes', label: 'Duration', render: (row: Service) => (
      row.durationOverrideMinutes
        ? <span className="pill-info">{row.durationOverrideMinutes} min</span>
        : <span className="pill-neutral">Default</span>
    )},
    { key: 'price', label: 'Price', render: (row: Service) => (
      row.price && Number(row.price) > 0
        ? <span className="font-semibold text-emerald-400">RM {Number(row.price).toFixed(2)}</span>
        : <span className="text-gray-600">—</span>
    )},
  ];

  const formFields = (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-semibold text-gray-300 mb-2">Service Name</label>
        <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="input-field" required />
      </div>
      <div>
        <label className="block text-sm font-semibold text-gray-300 mb-2">Centre</label>
        <select value={form.centreId} onChange={(e) => setForm({ ...form, centreId: e.target.value })} className="input-field" required>
          <option value="">Select Centre</option>
          {centres.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-semibold text-gray-300 mb-2">Duration Override (min)</label>
          <input type="number" value={form.durationOverrideMinutes} onChange={(e) => setForm({ ...form, durationOverrideMinutes: e.target.value })} className="input-field" placeholder="Leave empty for default" />
        </div>
        <div>
          <label className="block text-sm font-semibold text-gray-300 mb-2">Price (RM)</label>
          <input type="number" step="0.01" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} className="input-field" placeholder="0.00" />
        </div>
      </div>
    </div>
  );

  if (loading) return <SkeletonTable rows={5} />;

  return (
    <AnimatedPage>
      <div className="flex items-center justify-between mb-6">
        <div className="page-header mb-0">
          <h1 className="page-title">Services</h1>
          <p className="page-subtitle">Manage service offerings across centres</p>
        </div>
        <button onClick={() => { resetForm(); setShowCreate(true); }} className="btn-primary flex items-center gap-2">
          <Plus size={16} /> Add Service
        </button>
      </div>

      <DataTable columns={columns} data={services} keyField="id" emptyMessage="No services yet"
        actions={(row) => (
          <>
            <button onClick={() => openEdit(row)} className="p-2 rounded-lg text-gray-400 hover:text-blue-400 hover:bg-blue-500/10 transition"><Pencil size={15} /></button>
            <button onClick={() => setDeleteItem(row)} className="p-2 rounded-lg text-gray-400 hover:text-rose-400 hover:bg-rose-500/10 transition"><Trash2 size={15} /></button>
          </>
        )}
      />

      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Create Service">
        <form onSubmit={handleCreate}>{formFields}
          <div className="flex justify-end gap-3 mt-6">
            <button type="button" onClick={() => setShowCreate(false)} className="btn-secondary">Cancel</button>
            <button type="submit" className="btn-primary">Create Service</button>
          </div>
        </form>
      </Modal>

      <Modal open={!!editItem} onClose={() => setEditItem(null)} title="Edit Service">
        <form onSubmit={handleUpdate}>{formFields}
          <div className="flex justify-end gap-3 mt-6">
            <button type="button" onClick={() => setEditItem(null)} className="btn-secondary">Cancel</button>
            <button type="submit" className="btn-primary">Save Changes</button>
          </div>
        </form>
      </Modal>

      <Modal open={!!deleteItem} onClose={() => setDeleteItem(null)} title="Delete Service" size="sm" danger>
        <p className="text-gray-400 text-sm mb-2">Delete <strong className="text-white">{deleteItem?.name}</strong>?</p>
        <p className="text-rose-400/80 text-xs mb-6">⚠️ This will also delete all bookings for this service.</p>
        <div className="flex justify-end gap-3">
          <button onClick={() => setDeleteItem(null)} className="btn-secondary">Cancel</button>
          <button onClick={handleDelete} className="btn-danger">Delete Service</button>
        </div>
      </Modal>
    </AnimatedPage>
  );
}
