import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useState } from 'react';
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  format,
  getDay,
  isSameDay,
  isSameMonth,
  isToday,
  startOfMonth,
  subMonths,
} from 'date-fns';

import type { Booking } from '../lib/api';

interface Props {
  bookings: Booking[];
  onSelectDate: (date: Date) => void;
}

export default function BookingCalendar({ bookings, onSelectDate }: Props) {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const start = startOfMonth(currentMonth);
  const end = endOfMonth(currentMonth);
  const days = eachDayOfInterval({ start, end });
  const startDay = getDay(start);
  const weekDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  return (
    <div className="glass-card p-6">
      <div className="flex items-center justify-between mb-5">
        <h3 className="text-lg font-bold text-white">{format(currentMonth, 'MMMM yyyy')}</h3>
        <div className="flex gap-1">
          <button onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
            className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-white/[0.05] transition">
            <ChevronLeft size={18} />
          </button>
          <button onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
            className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-white/[0.05] transition">
            <ChevronRight size={18} />
          </button>
        </div>
      </div>
      <div className="grid grid-cols-7 gap-1 mb-2">
        {weekDays.map((d) => (
          <div key={d} className="text-center text-xs font-semibold text-gray-500 py-2">
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {Array.from({ length: startDay }).map((_, i) => (
          <div key={`empty-${i}`} />
        ))}
        {days.map((day) => {
          const dayBookings = bookings.filter((b) => isSameDay(new Date(b.slotStart), day));
          const today = isToday(day);
          return (
            <button
              key={day.toISOString()}
              onClick={() => onSelectDate(day)}
              className={`min-h-[72px] p-2 rounded-xl text-left transition-all duration-150 border ${
                today
                  ? 'border-blue-500/30 bg-blue-500/10'
                  : isSameMonth(day, currentMonth)
                    ? 'border-white/[0.04] bg-white/[0.02] hover:bg-white/[0.05] hover:border-white/[0.1]'
                    : 'border-transparent opacity-40'
              }`}
            >
              <div className={`text-sm font-medium ${today ? 'text-blue-400' : 'text-gray-300'}`}>
                {format(day, 'd')}
              </div>
              {dayBookings.length > 0 && (
                <div className="mt-1">
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${
                    dayBookings.length > 3
                      ? 'bg-amber-500/15 text-amber-400'
                      : 'bg-blue-500/15 text-blue-400'
                  }`}>
                    {dayBookings.length}
                  </span>
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
