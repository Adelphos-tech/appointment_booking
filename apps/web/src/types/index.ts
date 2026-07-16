export interface Company {
  id: string;
  name: string;
  slug?: string;
  description?: string;
  logo?: string;
  createdAt: string;
  updatedAt: string;
}

export interface User {
  id: string;
  email: string;
  name?: string;
  role: string;
  status: string;
  centreIds: string[];
  companyId?: string | null;
  createdAt: string;
}

export interface Centre {
  id: string;
  name: string;
  location: string;
  serviceType: string;
  openTime: string;
  closeTime: string;
  slotDurationMinutes: number;
  prepTimeBeforeMinutes: number;
  prepTimeAfterMinutes: number;
  workingDays: string[];
  holidays: string[];
  companyId?: string;
  company?: Company;
}

export interface Staff {
  id: string;
  name: string;
  gender: string;
  role: string;
  centreId: string;
  dutyDate: string;
  dutyStartTime: string;
  dutyEndTime: string;
  servicesAllowed: string[];
}

export interface Service {
  id: string;
  name: string;
  centreId: string;
  durationOverrideMinutes?: number;
  price?: number;
}

export interface Booking {
  id: string;
  bookingRef?: string;
  customerName: string;
  customerContact: string;
  customerEmail?: string;
  centreId: string;
  staffId: string;
  serviceId: string;
  slotStart: string;
  slotEnd: string;
  preferredGender?: string;
  status: string;
  paymentStatus: string;
  centre: Centre;
  staff: Staff;
  service: Service;
}

export interface WaitlistEntry {
  id: string;
  customerName: string;
  customerContact: string;
  centreId: string;
  serviceId: string;
  preferredGender?: string;
  preferredDate: string;
  notes?: string;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface Conversation {
  id: string;
  customerContact: string;
  messages: ChatMessage[];
  updatedAt: string;
}
