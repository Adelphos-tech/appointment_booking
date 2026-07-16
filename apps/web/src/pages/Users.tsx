import { useEffect, useState } from 'react';
import { Edit2, Plus, Shield, ShieldCheck, Trash2, Mail, User as UserIcon } from 'lucide-react';
import { AnimatePresence } from 'framer-motion';

import AnimatedPage, { StaggerContainer, StaggerItem } from '../components/AnimatedPage';
import Modal from '../components/Modal';
import { SkeletonCard } from '../components/SkeletonLoader';
import { api, getCentres, getUser, getCompanies } from '../lib/api';
import type { Centre, Company } from '../lib/api';
import { useToast } from '../hooks/useToast';

interface AdminUser {
  id: string;
  email: string;
  name?: string;
  role: string;
  centreIds: string[];
  companyId?: string | null;
  createdAt: string;
}

const emptyForm = { email: '', password: '', name: '', role: 'admin', centreIds: [] as string[], companyId: '' };

export default function Users() {
  const me = getUser();
  const { showToast } = useToast();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [centres, setCentres] = useState<Centre[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<AdminUser | null>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [deleteItem, setDeleteItem] = useState<AdminUser | null>(null);

  async function load() {
    setLoading(true);
    try {
      const [u, c, comp] = await Promise.all([
        api.get('/users').then((r) => r.data),
        getCentres(),
        getCompanies(),
      ]);
      setUsers(u);
      setCentres(c);
      setCompanies(comp);
    } catch (err: any) {
      showToast(err.message || 'Failed to load users', 'error');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  function openCreate() {
    setEditing(null);
    setForm({ ...emptyForm });
    setError('');
    setShowForm(true);
  }

  function openEdit(u: AdminUser) {
    setEditing(u);
    setForm({ email: u.email, password: '', name: u.name || '', role: u.role, centreIds: u.centreIds, companyId: u.companyId || '' });
    setError('');
    setShowForm(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const payload: any = { email: form.email, name: form.name, role: form.role, centreIds: form.centreIds, companyId: form.companyId || null };
      if (form.password) payload.password = form.password;
      
      if (editing) {
        await api.put(`/users/${editing.id}`, payload);
        showToast('User updated successfully', 'success');
      } else {
        if (!form.password) {
          setError('Password is required');
          setSaving(false);
          return;
        }
        await api.post('/users', { ...payload, password: form.password });
        showToast('User created successfully', 'success');
      }
      await load();
      setShowForm(false);
    } catch (err: any) {
      setError(err.message || 'Error occurred');
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteConfirm() {
    if (!deleteItem) return;
    try {
      await api.delete(`/users/${deleteItem.id}`);
      setUsers((u) => u.filter((x) => x.id !== deleteItem.id));
      showToast('User deleted successfully', 'success');
      setDeleteItem(null);
    } catch (err: any) {
      showToast(err.message || 'Failed to delete user', 'error');
    }
  }

  function toggleCentre(id: string) {
    setForm((f) => ({
      ...f,
      centreIds: f.centreIds.includes(id) ? f.centreIds.filter((c) => c !== id) : [...f.centreIds, id],
    }));
  }

  return (
    <AnimatedPage className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="page-header mb-0">
          <h1 className="page-title">User Management</h1>
          <p className="page-subtitle">Manage administrative accounts and their respective centre permissions</p>
        </div>
        <button onClick={openCreate} className="btn-primary flex items-center gap-2 self-start sm:self-auto">
          <Plus size={16} /> Add Admin
        </button>
      </div>

      {loading ? (
        <div className="grid gap-4">
          {Array.from({ length: 3 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      ) : (
        <StaggerContainer className="grid gap-4">
          <AnimatePresence>
            {users.map((u) => {
              const assignedCentres = centres.filter((c) => u.centreIds.includes(c.id));
              const isSelf = u.id === me?.id;
              return (
                <StaggerItem key={u.id}>
                  <div className="glass-card p-5 flex items-start gap-4 hover:border-white/10 transition group">
                    <div
                      className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
                        u.role === 'superadmin'
                          ? 'bg-purple-500/10 text-purple-400 border border-purple-500/20'
                          : 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                      }`}
                    >
                      {u.role === 'superadmin' ? <ShieldCheck size={20} /> : <Shield size={20} />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-white">{u.name || u.email}</span>
                        {u.name && <span className="text-xs text-gray-500 font-mono">{u.email}</span>}
                        <span className={`pill ${u.role === 'superadmin' ? 'pill-purple' : 'pill-info'}`}>
                          {u.role === 'superadmin' ? 'Super Admin' : 'Admin'}
                        </span>
                        {u.companyId && (
                          <span className="pill pill-warning bg-amber-500/10 text-amber-400 border border-amber-500/20">
                            {companies.find((c) => c.id === u.companyId)?.name || 'Company Assigned'}
                          </span>
                        )}
                        {isSelf && <span className="pill pill-success">You</span>}
                      </div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {u.role === 'superadmin' ? (
                          <span className="text-xs text-gray-400 italic">Full access to all centres</span>
                        ) : assignedCentres.length === 0 ? (
                          <span className="text-xs text-amber-400">No centres assigned</span>
                        ) : (
                          assignedCentres.map((c) => (
                            <span key={c.id} className="text-xs px-2.5 py-0.5 bg-white/[0.04] text-gray-300 border border-white/[0.06] rounded-full">
                              {c.name}
                            </span>
                          ))
                        )}
                      </div>
                    </div>
                    <div className="flex gap-1 flex-shrink-0 opacity-80 group-hover:opacity-100 transition">
                      <button
                        onClick={() => openEdit(u)}
                        className="p-2 text-gray-400 hover:text-white hover:bg-white/[0.05] rounded-xl transition"
                      >
                        <Edit2 size={15} />
                      </button>
                      {!isSelf && (
                        <button
                          onClick={() => setDeleteItem(u)}
                          className="p-2 text-rose-500/80 hover:text-rose-400 hover:bg-rose-500/10 rounded-xl transition"
                        >
                          <Trash2 size={15} />
                        </button>
                      )}
                    </div>
                  </div>
                </StaggerItem>
              );
            })}
          </AnimatePresence>
        </StaggerContainer>
      )}

      {/* Save Modal */}
      <Modal open={showForm} onClose={() => setShowForm(false)} title={editing ? 'Edit User details' : 'Create Admin user'}>
        <form onSubmit={handleSave} className="space-y-4">
          {error && (
            <div className="p-3 bg-rose-500/10 text-rose-400 text-sm rounded-xl border border-rose-500/20">
              {error}
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Display Name</label>
              <div className="relative">
                <UserIcon className="absolute left-3.5 top-3.5 text-gray-500" size={16} />
                <input
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  className="input-field pl-10"
                  placeholder="Display name"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Role Type</label>
              <select
                value={form.role}
                onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
                className="input-field bg-[#0c101c]"
              >
                <option value="admin" className="bg-[#0c101c]">Admin</option>
                <option value="superadmin" className="bg-[#0c101c]">Super Admin</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Email Address</label>
            <div className="relative">
              <Mail className="absolute left-3.5 top-3.5 text-gray-500" size={16} />
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                className="input-field pl-10"
                placeholder="admin@example.com"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">
              Password {editing && <span className="text-gray-500 font-normal lowercase">(leave empty to keep same)</span>}
            </label>
            <input
              type="password"
              value={form.password}
              onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
              className="input-field"
              placeholder="••••••••"
              required={!editing}
            />
          </div>

          {form.role === 'admin' && (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Company Assignment</label>
                <select
                  value={form.companyId}
                  onChange={(e) => setForm((f) => ({ ...f, companyId: e.target.value }))}
                  className="input-field bg-[#0c101c]"
                >
                  <option value="" className="bg-[#0c101c]">No Company (Global Admin)</option>
                  {companies.map((c) => (
                    <option key={c.id} value={c.id} className="bg-[#0c101c]">
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Assigned Centres</label>
                <div className="grid grid-cols-1 gap-2 max-h-48 overflow-y-auto pr-1">
                  {centres.map((c) => (
                    <label
                      key={c.id}
                      className="flex items-center gap-3 p-3 bg-white/[0.02] border border-white/[0.06] rounded-xl cursor-pointer hover:bg-white/[0.05] transition"
                    >
                      <input
                        type="checkbox"
                        checked={form.centreIds.includes(c.id)}
                        onChange={() => toggleCentre(c.id)}
                        className="rounded bg-black border-white/20 text-blue-500 focus:ring-blue-500"
                      />
                      <div>
                        <div className="text-sm font-semibold text-white">{c.name}</div>
                        <div className="text-xs text-gray-500 font-mono mt-0.5">{c.location}</div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            </div>
          )}

          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="flex-1 btn-secondary"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 btn-primary"
            >
              {saving ? 'Saving...' : editing ? 'Save Changes' : 'Create User'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        open={Boolean(deleteItem)}
        onClose={() => setDeleteItem(null)}
        title="Confirm User Deletion"
        danger
      >
        <div className="space-y-4">
          <p className="text-gray-300 text-sm leading-relaxed">
            Are you sure you want to delete the user{' '}
            <span className="font-semibold text-white">{deleteItem?.name || deleteItem?.email}</span>?
            This action cannot be undone.
          </p>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={() => setDeleteItem(null)} className="flex-1 btn-secondary">
              Cancel
            </button>
            <button onClick={handleDeleteConfirm} className="flex-1 btn-danger">
              Confirm Delete
            </button>
          </div>
        </div>
      </Modal>
    </AnimatedPage>
  );
}
