import { useEffect, useState } from 'react';
import { Plus, Pencil, Trash2 } from 'lucide-react';

import AnimatedPage from '../components/AnimatedPage';
import DataTable from '../components/DataTable';
import Modal from '../components/Modal';
import { SkeletonTable } from '../components/SkeletonLoader';
import { getCompanies, createCompany, updateCompany, deleteCompany, getUser, getMe } from '../lib/api';
import type { Company } from '../lib/api';
import { useToast } from '../hooks/useToast';

export default function Companies() {
  const { showToast } = useToast();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [editItem, setEditItem] = useState<Company | null>(null);
  const [deleteItem, setDeleteItem] = useState<Company | null>(null);
  const [form, setForm] = useState({ name: '', description: '' });
  const user = getUser();

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    try { setCompanies(await getCompanies()); } finally { setLoading(false); }
  }

  function openEdit(c: Company) {
    setForm({ name: c.name, description: c.description || '' });
    setEditItem(c);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    try {
      await createCompany(form);
      showToast('Company created successfully', 'success');
      setShowCreate(false);
      setForm({ name: '', description: '' });
      await getMe(); // refresh user so company ownership is reflected
      await load();
    } catch (err: any) { showToast(err.message, 'error'); }
  }

  async function handleUpdate(e: React.FormEvent) {
    e.preventDefault();
    if (!editItem) return;
    try {
      await updateCompany(editItem.id, form);
      showToast('Company updated successfully', 'success');
      setEditItem(null);
      setForm({ name: '', description: '' });
      await load();
    } catch (err: any) { showToast(err.message, 'error'); }
  }

  async function handleDelete() {
    if (!deleteItem) return;
    try {
      await deleteCompany(deleteItem.id);
      showToast('Company and all its centres deleted', 'success');
      setDeleteItem(null);
      await load();
    } catch (err: any) { showToast(err.message, 'error'); }
  }

  const columns = [
    { key: 'name', label: 'Name', sortable: true, render: (row: Company) => (
      <span className="font-semibold text-white">{row.name}</span>
    )},
    { key: 'slug', label: 'Slug', render: (row: Company) => (
      <span className="font-mono text-xs text-gray-500">{row.slug || '—'}</span>
    )},
    { key: 'description', label: 'Description', render: (row: Company) => (
      <span className="text-gray-400 text-sm line-clamp-1">{row.description || '—'}</span>
    )},
    { key: 'createdAt', label: 'Created', render: (row: Company) => (
      <span className="text-gray-500 text-xs">{new Date(row.createdAt).toLocaleDateString()}</span>
    )},
  ];

  const formFields = (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-semibold text-gray-300 mb-2">Company Name</label>
        <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="input-field" placeholder="Enter company name" required />
      </div>
      <div>
        <label className="block text-sm font-semibold text-gray-300 mb-2">Description</label>
        <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="input-field min-h-[80px] resize-none" placeholder="Brief description..." />
      </div>
    </div>
  );

  if (loading) return <SkeletonTable rows={5} />;

  return (
    <AnimatedPage>
      <div className="flex items-center justify-between mb-6">
        <div className="page-header mb-0">
          <h1 className="page-title">{user?.role === 'superadmin' ? 'Companies' : 'My Company'}</h1>
          <p className="page-subtitle">{user?.role === 'superadmin' ? 'Manage organization companies' : 'View and manage your company'}</p>
        </div>
        {(user?.role === 'superadmin' || !companies.length) && (
          <button onClick={() => { setForm({ name: '', description: '' }); setShowCreate(true); }} className="btn-primary flex items-center gap-2">
            <Plus size={16} /> {user?.role === 'superadmin' ? 'Add Company' : 'Create My Company'}
          </button>
        )}
      </div>

      <DataTable
        columns={columns}
        data={companies}
        keyField="id"
        emptyMessage="No companies yet. Create your first one!"
        actions={(row) => (
          <>
            <button onClick={() => openEdit(row)} className="p-2 rounded-lg text-gray-400 hover:text-blue-400 hover:bg-blue-500/10 transition" title="Edit">
              <Pencil size={15} />
            </button>
            {(user?.role === 'superadmin' || row.id === user?.companyId) && (
              <button onClick={() => setDeleteItem(row)} className="p-2 rounded-lg text-gray-400 hover:text-rose-400 hover:bg-rose-500/10 transition" title="Delete">
                <Trash2 size={15} />
              </button>
            )}
          </>
        )}
      />

      {/* Create Modal */}
      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Create Company">
        <form onSubmit={handleCreate}>
          {formFields}
          <div className="flex justify-end gap-3 mt-6">
            <button type="button" onClick={() => setShowCreate(false)} className="btn-secondary">Cancel</button>
            <button type="submit" className="btn-primary">Create Company</button>
          </div>
        </form>
      </Modal>

      {/* Edit Modal */}
      <Modal open={!!editItem} onClose={() => setEditItem(null)} title="Edit Company">
        <form onSubmit={handleUpdate}>
          {formFields}
          <div className="flex justify-end gap-3 mt-6">
            <button type="button" onClick={() => setEditItem(null)} className="btn-secondary">Cancel</button>
            <button type="submit" className="btn-primary">Save Changes</button>
          </div>
        </form>
      </Modal>

      {/* Delete Confirmation */}
      <Modal open={!!deleteItem} onClose={() => setDeleteItem(null)} title="Delete Company" size="sm" danger>
        <p className="text-gray-400 text-sm mb-2">
          Are you sure you want to delete <strong className="text-white">{deleteItem?.name}</strong>?
        </p>
        <p className="text-rose-400/80 text-xs mb-6">
          ⚠️ This will also delete all centres, staff, services, and bookings under this company.
        </p>
        <div className="flex justify-end gap-3">
          <button onClick={() => setDeleteItem(null)} className="btn-secondary">Cancel</button>
          <button onClick={handleDelete} className="btn-danger">Delete Company</button>
        </div>
      </Modal>
    </AnimatedPage>
  );
}
