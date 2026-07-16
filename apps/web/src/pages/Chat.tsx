import { Bot, Loader2, Phone, Send, User, Sparkles } from 'lucide-react';
import { useEffect, useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

import AnimatedPage from '../components/AnimatedPage';
import { getConversation, sendChatMessage } from '../lib/api';
import type { ChatMessage } from '../types';

const suggestions = [
  'List all bookings',
  'Show me the waitlist',
  'List all centres',
  'Add a new staff member',
  'Create a new service',
];

export default function Chat() {
  const [contact, setContact] = useState('+1234567890');
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [initLoading, setInitLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadConversation();
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  async function loadConversation() {
    if (!contact.trim()) return;
    setInitLoading(true);
    try {
      const conv = await getConversation(contact);
      if (conv && Array.isArray(conv.messages)) {
        const visible = conv.messages.filter((m: any) => !m.hidden && (m.role === 'user' || m.role === 'assistant'));
        setMessages(visible.map((m: any) => ({ role: m.role, content: m.content })));
      } else {
        setMessages([]);
      }
    } catch {
      setMessages([]);
    } finally {
      setInitLoading(false);
    }
  }

  async function handleSend(e: React.FormEvent, text?: string) {
    e.preventDefault();
    if (loading) return;
    const message = text || input;
    if (!message.trim()) return;
    setLoading(true);
    setInput('');
    const nextMessages = [...messages, { role: 'user' as const, content: message }];
    setMessages(nextMessages);
    try {
      const res = await sendChatMessage(contact, message);
      setMessages([...nextMessages, { role: 'assistant', content: res.reply }]);
    } catch (err: any) {
      setMessages([...nextMessages, { role: 'assistant', content: `Error: ${err.message}` }]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <AnimatedPage className="h-[calc(100vh-8rem)] flex flex-col max-w-5xl space-y-6">
      <div className="page-header">
        <h1 className="page-title flex items-center gap-2">
          <Bot size={24} className="text-blue-400" />
          AI Booking Assistant
        </h1>
        <p className="page-subtitle">Chat as a customer to book, modify, or query appointments using natural language.</p>
      </div>

      <div className="glass-card flex-1 flex flex-col overflow-hidden relative border border-white/[0.08]">
        {/* Top Accent Line */}
        <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-blue-500 via-purple-500 to-emerald-500" />

        {/* Customer Contact Selector */}
        <div className="p-4 border-b border-white/[0.06] bg-white/[0.02] flex flex-col sm:flex-row sm:items-center gap-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-gray-300">
            <User size={16} className="text-blue-400" />
            Customer Contact
          </div>
          <div className="relative flex-1 max-w-md flex gap-2">
            <div className="relative flex-1">
              <Phone className="absolute left-3.5 top-3.5 text-gray-500" size={16} />
              <input
                value={contact}
                onChange={(e) => setContact(e.target.value)}
                onBlur={() => loadConversation()}
                className="input-field pl-10 py-2.5"
                placeholder="+1234567890"
              />
            </div>
            <button
              onClick={() => loadConversation()}
              disabled={initLoading}
              className="btn-secondary py-2.5 px-4 flex items-center gap-2 min-w-[80px] justify-center"
            >
              {initLoading ? <Loader2 className="animate-spin" size={16} /> : 'Load'}
            </button>
          </div>
        </div>

        {/* Chat Thread */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 bg-black/10">
          <AnimatePresence initial={false}>
            {messages.length === 0 && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-center py-12 max-w-md mx-auto space-y-6"
              >
                <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-purple-600 rounded-2xl flex items-center justify-center mx-auto shadow-lg shadow-blue-500/20">
                  <Bot size={28} className="text-white" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white mb-2">Admin AI Assistant</h3>
                  <p className="text-sm text-gray-400">
                    Interact using natural language to check schedules, add customers to waitlists, or schedule services.
                  </p>
                </div>
                <div className="flex flex-wrap justify-center gap-2">
                  {suggestions.map((s, idx) => (
                    <motion.button
                      initial={{ scale: 0.9, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ delay: idx * 0.05 }}
                      key={s}
                      onClick={(e) => handleSend(e as any, s)}
                      disabled={loading}
                      className="px-4 py-2 text-xs bg-white/[0.04] border border-white/[0.08] hover:bg-white/[0.08] hover:border-blue-500/30 text-gray-300 rounded-full transition disabled:opacity-50 flex items-center gap-1.5"
                    >
                      <Sparkles size={10} className="text-blue-400" />
                      {s}
                    </motion.button>
                  ))}
                </div>
              </motion.div>
            )}

            {messages.map((m, i) => (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                key={i}
                className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[80%] px-4 py-3 rounded-2xl text-sm whitespace-pre-wrap shadow-md ${
                    m.role === 'user'
                      ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-br-none'
                      : 'bg-white/[0.05] border border-white/[0.08] text-gray-200 rounded-bl-none'
                  }`}
                >
                  {m.content}
                </div>
              </motion.div>
            ))}

            {loading && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex items-center gap-2 text-xs text-gray-400 font-medium"
              >
                <Loader2 className="animate-spin text-blue-400" size={14} />
                Assistant is formulating a reply...
              </motion.div>
            )}
          </AnimatePresence>
          <div ref={chatEndRef} />
        </div>

        {/* Message Input Bar */}
        <form onSubmit={handleSend} className="p-4 border-t border-white/[0.06] bg-white/[0.01] flex gap-3">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            className="flex-1 input-field py-3"
            placeholder="Type your booking query (e.g. 'book a service for tomorrow at 2pm')..."
            disabled={loading}
          />
          <button
            type="submit"
            disabled={loading}
            className="btn-primary py-3 px-5 flex items-center justify-center"
          >
            <Send size={16} />
          </button>
        </form>
      </div>
    </AnimatedPage>
  );
}
