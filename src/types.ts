export interface AgendaBlock {
  id: string;
  date: string; // YYYY-MM-DD
  person: 'damian' | 'joss' | 'ambos';
  label: string;
  type: string;
  start: number; // decimal hours e.g. 8.5 = 08:30
  end: number;
  notes: string;
  color: string;
  is_recurring?: boolean;
}

export interface QuickEntry {
  id: string;
  type: 'comentario' | 'pendiente' | 'actividad' | 'evento' | 'recordatorio';
  text: string;
  person: 'tú' | 'joss' | 'ambos';
  date: string;
  time: string;
  done: boolean;
  createdAt: string;
}

export interface GymDay {
  day: string;
  completed: boolean;
  type: string;
  detail: string;
}
