// Returns Monday of the week containing `date`
export function getWeekStart(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay(); // 0=Sun
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

// Returns YYYY-MM-DD string for a date
export function toDateStr(date: Date): string {
  return date.toISOString().slice(0, 10);
}

// Returns Date from YYYY-MM-DD
export function fromDateStr(str: string): Date {
  const [y, m, d] = str.split('-').map(Number);
  return new Date(y, m - 1, d);
}

// Returns the 7 dates (Mon-Sun) for a week starting at `weekStart`
export function getWeekDates(weekStart: Date): Date[] {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + i);
    return d;
  });
}

// Format e.g. "Lun 27"
const SHORT_DAYS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const FULL_DAYS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

export function formatDayShort(date: Date): string {
  const dow = date.getDay(); // 0=Sun
  const idx = dow === 0 ? 6 : dow - 1;
  return `${SHORT_DAYS[idx]} ${date.getDate()}`;
}

export function formatDayFull(date: Date): string {
  const dow = date.getDay();
  const idx = dow === 0 ? 6 : dow - 1;
  return FULL_DAYS[idx];
}

export function dayIndexOf(date: Date): number {
  const dow = date.getDay();
  return dow === 0 ? 6 : dow - 1; // 0=Mon...6=Sun
}

export function formatHour(h: number): string {
  const hours = Math.floor(h);
  const mins = Math.round((h - hours) * 60);
  return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
}

export function hourToInput(h: number): string {
  return formatHour(h);
}

export function inputToHour(v: string): number {
  const [h, m] = v.split(':').map(Number);
  return h + m / 60;
}

export { SHORT_DAYS, FULL_DAYS };
