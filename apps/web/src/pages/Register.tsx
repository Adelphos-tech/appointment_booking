import { useState } from 'react';
import { motion } from 'framer-motion';
import { Lock, Loader2, Mail, User, UserPlus } from 'lucide-react';
import { Link } from 'react-router-dom';

import { register } from '../lib/api';

export default function Register() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      await register(email, password, name || undefined);
      setSuccess(true);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden" style={{ background: '#050816' }}>
      <div className="absolute inset-0 overflow-hidden">
        <motion.div animate={{ x: [0, -30, 20, 0], y: [0, 20, -30, 0] }} transition={{ duration: 22, repeat: Infinity, ease: 'linear' }}
          className="absolute top-1/3 right-1/4 w-[500px] h-[500px] rounded-full" style={{ background: 'radial-gradient(circle, rgba(139, 92, 246, 0.12) 0%, transparent 70%)' }} />
        <motion.div animate={{ x: [0, 30, -20, 0], y: [0, -30, 20, 0] }} transition={{ duration: 28, repeat: Infinity, ease: 'linear' }}
          className="absolute bottom-1/4 left-1/4 w-[400px] h-[400px] rounded-full" style={{ background: 'radial-gradient(circle, rgba(59, 130, 246, 0.10) 0%, transparent 70%)' }} />
      </div>

      <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}
        className="relative w-full max-w-md glass-card p-8 sm:p-10">
        <div className="absolute top-0 left-0 right-0 h-1 rounded-t-2xl bg-gradient-to-r from-purple-500 via-blue-500 to-purple-500" />
        <div className="flex flex-col items-center mb-8">
          <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', damping: 15, delay: 0.1 }}
            className="w-16 h-16 rounded-2xl bg-gradient-to-br from-purple-500 to-blue-600 flex items-center justify-center shadow-lg shadow-purple-500/30 mb-5">
            <UserPlus className="text-white" size={28} />
          </motion.div>
          <h1 className="text-2xl font-extrabold text-white">Create account</h1>
          <p className="text-gray-500 mt-1 text-sm">Get started with Slotcare</p>
        </div>

        {error && <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
          className="mb-5 p-3.5 text-sm rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400">{error}</motion.div>}

        {success ? (
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
            className="mb-5 p-4 text-sm rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
            <p className="font-semibold mb-1">Registration submitted</p>
            <p>Your account is pending superadmin approval. You will be able to sign in once approved.</p>
          </motion.div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-semibold text-gray-300 mb-2">Full name</label>
              <div className="relative">
                <User className="absolute left-3.5 top-3.5 text-gray-600" size={18} />
                <input type="text" value={name} onChange={(e) => setName(e.target.value)} className="input-field pl-11" placeholder="Your name" />
              </div>
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-300 mb-2">Email</label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-3.5 text-gray-600" size={18} />
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="input-field pl-11" placeholder="you@example.com" required />
              </div>
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-300 mb-2">Password</label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-3.5 text-gray-600" size={18} />
                <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="input-field pl-11" placeholder="Min 8 chars, uppercase, lowercase, number, symbol" required minLength={8} pattern="^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z\d]).+$" title="Password must be at least 8 characters and include uppercase, lowercase, number, and special character" />
              </div>
            </div>
            <button type="submit" disabled={loading} className="w-full btn-primary py-3.5 text-base flex items-center justify-center gap-2">
              {loading ? <><Loader2 size={18} className="animate-spin" /> Creating account...</> : 'Create account'}
            </button>
          </form>
        )}
        <p className="mt-6 text-sm text-gray-500 text-center">
          Already have an account?{' '}
          <Link to="/login" className="text-blue-400 font-semibold hover:text-blue-300 transition">Sign in</Link>
        </p>
      </motion.div>
    </div>
  );
}
