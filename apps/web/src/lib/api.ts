import axios from 'axios';

import type { Booking, Centre, Company, Conversation, Service, Staff, User, WaitlistEntry } from '../types';

export const api = axios.create({
  baseURL: '/api',
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      if (window.location.pathname !== '/login' && window.location.pathname !== '/book') {
        window.location.href = '/login';
      }
    }
    const message = err.response?.data?.error || err.message || 'Something went wrong';
    return Promise.reject(new Error(message));
  },
);

export async function login(email: string, password: string) {
  const res = await api.post('/auth/login', { email, password });
  localStorage.setItem('token', res.data.token);
  localStorage.setItem('user', JSON.stringify(res.data.user));
  return res.data;
}

export async function register(email: string, password: string, name?: string) {
  const res = await api.post('/auth/register', { email, password, name });
  return res.data;
}

export async function getMe() {
  const res = await api.get('/auth/me');
  localStorage.setItem('user', JSON.stringify(res.data));
  return res.data;
}

export function logout() {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
}

export function getUser(): User | null {
  const raw = localStorage.getItem('user');
  return raw ? JSON.parse(raw) : null;
}

export async function getCentres(companyId?: string) {
  const res = await api.get('/centres', { params: companyId ? { companyId } : undefined });
  return res.data as Centre[];
}

export async function createCentre(data: Partial<Centre>) {
  const res = await api.post('/centres', data);
  return res.data as Centre;
}

export async function getCompanies() {
  const res = await api.get('/companies');
  return res.data as Company[];
}

export async function createCompany(data: Partial<Company>) {
  const res = await api.post('/companies', data);
  return res.data as Company;
}

export async function getPublicCompanies() {
  const res = await axios.get('/public/companies');
  return res.data as Company[];
}

export async function getCompanyBySlug(slug: string) {
  const res = await axios.get(`/public/company-by-slug/${slug}`);
  return res.data as Company;
}

export async function getStaff() {
  const res = await api.get('/staff');
  return res.data as Staff[];
}

export async function createStaff(data: Partial<Staff>) {
  const res = await api.post('/staff', data);
  return res.data as Staff;
}

export async function getServices() {
  const res = await api.get('/services');
  return res.data as Service[];
}

export async function createService(data: Partial<Service>) {
  const res = await api.post('/services', data);
  return res.data as Service;
}

export async function updateCompany(id: string, data: Partial<Company>) {
  const res = await api.put(`/companies/${id}`, data);
  return res.data as Company;
}

export async function deleteCompany(id: string) {
  await api.delete(`/companies/${id}`);
}

export async function updateCentre(id: string, data: Partial<Centre>) {
  const res = await api.put(`/centres/${id}`, data);
  return res.data as Centre;
}

export async function deleteCentre(id: string) {
  await api.delete(`/centres/${id}`);
}

export async function updateStaff(id: string, data: Partial<Staff>) {
  const res = await api.put(`/staff/${id}`, data);
  return res.data as Staff;
}

export async function deleteStaff(id: string) {
  await api.delete(`/staff/${id}`);
}

export async function updateService(id: string, data: Partial<Service>) {
  const res = await api.put(`/services/${id}`, data);
  return res.data as Service;
}

export async function deleteService(id: string) {
  await api.delete(`/services/${id}`);
}

export async function getBookings(params?: Record<string, string>) {
  const res = await api.get('/bookings', { params });
  return res.data as Booking[];
}

export async function createBooking(data: Partial<Booking>) {
  const res = await api.post('/bookings', data);
  return res.data as Booking;
}

export async function updateBooking(id: string, data: Partial<Booking>) {
  const res = await api.patch(`/bookings/${id}`, data);
  return res.data as Booking;
}

export async function getAvailability(params: { centreId: string; date: string; staffId?: string; serviceId?: string; preferredGender?: string }) {
  const res = await api.get('/availability', { params });
  return res.data as { date: string; centreId: string; serviceId: string | null; slots: { start: string; end: string; staffId: string; staffName: string; staffGender: string }[] };
}

export async function getWaitlist() {
  const res = await api.get('/waitlist');
  return res.data as WaitlistEntry[];
}

export async function createWaitlistEntry(data: Partial<WaitlistEntry>) {
  const res = await api.post('/waitlist', data);
  return res.data as WaitlistEntry;
}

export async function sendChatMessage(customerContact: string, message: string) {
  const res = await api.post('/conversations/message', { customerContact, message });
  return res.data as { conversation: Conversation; reply: string };
}

export async function getConversation(customerContact: string) {
  const res = await api.get(`/conversations/${customerContact}`);
  return res.data as Conversation;
}

export async function getPublicBookings(customerContact: string) {
  const res = await api.get('/bookings', { params: { customerContact, limit: '50' } });
  return res.data as { bookings: Booking[] };
}

export async function getDashboardStats(date?: string) {
  const res = await api.get('/dashboard/stats', { params: date ? { date } : undefined });
  return res.data as {
    counts: {
      companies: number;
      centres: number;
      staff: number;
      services: number;
      bookings: number;
      waitlist: number;
    };
    todayBookings: Booking[];
  };
}

export type { Booking, Centre, Company, Conversation, Service, Staff, User, WaitlistEntry };

