import { useEffect, useState } from 'react';
import { Plus, Pencil, Trash2, User } from 'lucide-react';

import AnimatedPage from '../components/AnimatedPage';
import DataTable from '../components/DataTable';
import Modal from '../components/Modal';
import { SkeletonTable } from '../components/SkeletonLoader';
import { getStaff, getCentres, createStaff, updateStaff, deleteStaff } from '../lib/api';
import type { Staff, Centre } from '../lib/api';
import { useToast } from '../hooks/useToast';

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export default function StaffPage() {
  const { showToast } = useToast();
  const [staff, setStaff] = useState<Staff[]>([]);
  const [centres, setCentres] = useState<Centre[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [editItem, setEditItem] = useState<Staff | null>(null);
  const [deleteItem, setDeleteItem] = useState<Staff | null>(null);
  const [sortKey, setSortKey] = useState('name');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [form, setForm] = useState({
    name: '', gender: 'Male', role: 'Therapist', centreId: '',
    employmentType: 'Permanent', dutyStartDate: '', dutyEndDate: '',
    dutyStartTime: '10:00', dutyEndTime: '18:00',
    workingDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as string[],
  });

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    try {
      const [s, c] = await Promise.all([getStaff(), getCentres()]);
      setStaff(s); setCentres(c);
    } finally { setLoading(false); }
  }

  function openEdit(s: Staff) {
    setForm({
      name: s.name, gender: s.gender, role: s.role, centreId: s.centreId,
      employmentType: (s as any).employmentType || 'Permanent',
      dutyStartDate: (s as any).dutyStartDate || '',
      dutyEndDate: (s as any).dutyEndDate || '',
      dutyStartTime: (s as any).dutyStartTime || '10:00',
      dutyEndTime: (s as any).dutyEndTime || '18:00',
      workingDays: (s as any).workingDays || ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
    });
    setEditItem(s);
  }

  function resetForm() {
    setForm({ name: '', gender: 'Male', role: 'Therapist', centreId: '',
      employmentType: 'Permanent', dutyStartDate: '', dutyEndDate: '',
      dutyStartTime: '10:00', dutyEndTime: '18:00',
      workingDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] });
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    try { await createStaff(form as any); showToast('Staff created', 'success'); setShowCreate(false); resetForm(); await load(); }
    catch (err: any) { showToast(err.message, 'error'); }
  }

  async function handleUpdate(e: React.FormEvent) {
    e.preventDefault();
    if (!editItem) return;
    try { await updateStaff(editItem.id, form as any); showToast('Staff updated', 'success'); setEditItem(null); resetForm(); await load(); }
    catch (err: any) { showToast(err.message, 'error'); }
  }

  async function handleDelete() {
    if (!deleteItem) return;
    try { await deleteStaff(deleteItem.id); showToast('Staff deleted', 'success'); setDeleteItem(null); await load(); }
    catch (err: any) { showToast(err.message, 'error'); }
  }

  function toggleDay(day: string) {
    setForm((f) => ({
      ...f,
      workingDays: f.workingDays.includes(day) ? f.workingDays.filter((d) => d !== day) : [...f.workingDays, day],
    }));
  }

  function handleSort(key: string) {
    if (sortKey === key) setSortDir((d) => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('asc'); }
  }

  const sorted = [...staff].sort((a, b) => {
    const valA = (a as any)[sortKey] || '';
    const valB = (b as any)[sortKey] || '';
    const cmp = String(valA).localeCompare(String(valB));
    return sortDir === 'asc' ? cmp : -cmp;
  });

  const columns = [
    { key: 'name', label: 'Name', sortable: true, render: (row: Staff) => (
      <div className="flex items-center gap-3">
        <div className={`w-9 h-9 rounded-lg flex items-center justify-center text-xs font-bold text-white flex-shrink-0 ${
          row.gender?.toLowerCase() === 'female' ? 'bg-gradient-to-br from-pink-500 to-rose-500' : 'bg-gradient-to-br from-blue-500 to-indigo-500'
        }`}>
          {row.name?.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2) || <User size={14} />}
        </div>
        <div>
          <div className="font-semibold text-white">{row.name}</div>
          <div className="text-xs text-gray-500">{row.role}</div>
        </div>
      </div>
    )},
    { key: 'gender', label: 'Gender', sortable: true, render: (row: Staff) => (
      <span className={row.gender?.toLowerCase() === 'female' ? 'pill-purple' : 'pill-info'}>
        {row.gender}
      </span>
    )},
    { key: 'centreId', label: 'Centre', render: (row: Staff) => (
      <span className="text-gray-400 text-sm">{centres.find((c) => c.id === row.centreId)?.name || '—'}</span>
    )},
    { key: 'dutyStartTime', label: 'Duty Hours', render: (row: Staff) => (
      <div className="flex items-center gap-1.5">
        <span className="pill-neutral text-xs">{(row as any).dutyStartTime || '—'} → {(row as any).dutyEndTime || '—'}</span>
      </div>
    )},
  ];

  const formFields = (
    <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-1">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-semibold text-gray-300 mb-2">Staff Name</label>
          <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="input-field" required />
        </div>
        <div>
          <label className="block text-sm font-semibold text-gray-300 mb-2">Centre</label>
          <select value={form.centreId} onChange={(e) => setForm({ ...form, centreId: e.target.value })} className="input-field" required>
            <option value="">Select Centre</option>
            {centres.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-4">
        <div>
          <label className="block text-sm font-semibold text-gray-300 mb-2">Gender</label>
          <select value={form.gender} onChange={(e) => setForm({ ...form, gender: e.target.value })} className="input-field">
            <option value="Male">Male</option>
            <option value="Female">Female</option>
            <option value="Any">Any</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-semibold text-gray-300 mb-2">Role</label>
          <input value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} className="input-field" />
        </div>
        <div>
          <label className="block text-sm font-semibold text-gray-300 mb-2">Employment</label>
          <select value={form.employmentType} onChange={(e) => setForm({ ...form, employmentType: e.target.value })} className="input-field">
            <option value="Permanent">Permanent</option>
            <option value="Temporary">Temporary</option>
          </select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-semibold text-gray-300 mb-2">Duty Start Date</label>
          <input type="date" value={form.dutyStartDate} onChange={(e) => setForm({ ...form, dutyStartDate: e.target.value })} className="input-field" required />
        </div>
        <div>
          <label className="block text-sm font-semibold text-gray-300 mb-2">Duty End Date</label>
          <input type="date" value={form.dutyEndDate} onChange={(e) => setForm({ ...form, dutyEndDate: e.target.value })} className="input-field" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-semibold text-gray-300 mb-2">Start Time</label>
          <input type="time" value={form.dutyStartTime} onChange={(e) => setForm({ ...form, dutyStartTime: e.target.value })} className="input-field" />
        </div>
        <div>
          <label className="block text-sm font-semibold text-gray-300 mb-2">End Time</label>
          <input type="time" value={form.dutyEndTime} onChange={(e) => setForm({ ...form, dutyEndTime: e.target.value })} className="input-field" />
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

  if (loading) return <SkeletonTable rows={6} />;

  return (
    <AnimatedPage>
      <div className="flex items-center justify-between mb-6">
        <div className="page-header mb-0">
          <h1 className="page-title">Staff</h1>
          <p className="page-subtitle">Manage therapists and staff members</p>
        </div>
        <button onClick={() => { resetForm(); setShowCreate(true); }} className="btn-primary flex items-center gap-2">
          <Plus size={16} /> Add Staff
        </button>
      </div>

      <DataTable columns={columns} data={sorted} keyField="id" sortKey={sortKey} sortDir={sortDir} onSort={handleSort}
        emptyMessage="No staff members yet"
        actions={(row) => (
          <>
            <button onClick={() => openEdit(row)} className="p-2 rounded-lg text-gray-400 hover:text-blue-400 hover:bg-blue-500/10 transition"><Pencil size={15} /></button>
            <button onClick={() => setDeleteItem(row)} className="p-2 rounded-lg text-gray-400 hover:text-rose-400 hover:bg-rose-500/10 transition"><Trash2 size={15} /></button>
          </>
        )}
      />

      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Add Staff Member" size="lg">
        <form onSubmit={handleCreate}>
          {formFields}
          <div className="flex justify-end gap-3 mt-6">
            <button type="button" onClick={() => setShowCreate(false)} className="btn-secondary">Cancel</button>
            <button type="submit" className="btn-primary">Add Staff</button>
          </div>
        </form>
      </Modal>

      <Modal open={!!editItem} onClose={() => setEditItem(null)} title="Edit Staff Member" size="lg">
        <form onSubmit={handleUpdate}>
          {formFields}
          <div className="flex justify-end gap-3 mt-6">
            <button type="button" onClick={() => setEditItem(null)} className="btn-secondary">Cancel</button>
            <button type="submit" className="btn-primary">Save Changes</button>
          </div>
        </form>
      </Modal>

      <Modal open={!!deleteItem} onClose={() => setDeleteItem(null)} title="Delete Staff" size="sm" danger>
        <p className="text-gray-400 text-sm mb-2">Delete <strong className="text-white">{deleteItem?.name}</strong>?</p>
        <p className="text-rose-400/80 text-xs mb-6">⚠️ This will also delete all bookings for this staff member.</p>
        <div className="flex justify-end gap-3">
          <button onClick={() => setDeleteItem(null)} className="btn-secondary">Cancel</button>
          <button onClick={handleDelete} className="btn-danger">Delete Staff</button>
        </div>
      </Modal>
    </AnimatedPage>
  );
}
