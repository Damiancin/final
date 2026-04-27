import { AgendaBlock } from '../types';
import { toDateStr, getWeekDates } from '../utils/date';

export const BLOCK_COLORS: Record<string, string> = {
  Trabajo: 'bg-sky-500/30 border-sky-400',
  Escuela: 'bg-teal-500/30 border-teal-400',
  Comida: 'bg-orange-500/30 border-orange-400',
  Traslado: 'bg-zinc-500/30 border-zinc-400',
  Gym: 'bg-emerald-500/30 border-emerald-400',
  'Tiempo juntos': 'bg-pink-500/30 border-pink-400',
  Evento: 'bg-rose-500/30 border-rose-400',
  Pendiente: 'bg-amber-500/30 border-amber-400',
  Actividad: 'bg-emerald-500/30 border-emerald-400',
  Otro: 'bg-zinc-500/20 border-zinc-500',
};

// Generates the recurring routine blocks for a week (weekStart = Monday)
export function buildRoutineForWeek(weekStart: Date): AgendaBlock[] {
  const dates = getWeekDates(weekStart); // [Mon, Tue, Wed, Thu, Fri, Sat, Sun]
  const blocks: AgendaBlock[] = [];
  let id = 1;
  const mkId = (date: Date) => `rut-${toDateStr(date)}-${id++}`;

  const mk = (
    date: Date,
    person: AgendaBlock['person'],
    label: string,
    type: string,
    start: number,
    end: number
  ): AgendaBlock => ({
    id: mkId(date),
    date: toDateStr(date),
    person,
    label,
    type,
    start,
    end,
    notes: '',
    color: BLOCK_COLORS[type] || BLOCK_COLORS.Otro,
    is_recurring: true,
  });

  // Mon-Fri (indices 0-4)
  for (let i = 0; i <= 4; i++) {
    const d = dates[i];
    // Damián
    blocks.push(mk(d, 'damian', 'Trabajo', 'Trabajo', 8, 18));
    blocks.push(mk(d, 'damian', 'Traslado', 'Traslado', 18, 18.5));
    // Joss
    blocks.push(mk(d, 'joss', 'Trabajo', 'Trabajo', 8, 14.5));
    blocks.push(mk(d, 'joss', 'Comida', 'Comida', 14.5, 15 + 1 / 6));
    blocks.push(mk(d, 'joss', 'Escuela', 'Escuela', 15 + 1 / 6, 20));
    blocks.push(mk(d, 'joss', 'Traslado', 'Traslado', 20, 20 + 2 / 3));
  }

  // Mon, Wed, Fri (0, 2, 4): Gym juntos + después
  for (const i of [0, 2, 4]) {
    const d = dates[i];
    blocks.push(mk(d, 'ambos', 'Gym juntos', 'Gym', 21, 22));
    blocks.push(mk(d, 'ambos', 'Cena / baño', 'Comida', 22, 22.5));
    blocks.push(mk(d, 'ambos', 'Tiempo juntos', 'Tiempo juntos', 22.5, 23));
  }

  // Tue, Thu (1, 3): Gym individual Damián + Joss tareas
  for (const i of [1, 3]) {
    const d = dates[i];
    blocks.push(mk(d, 'damian', 'Gym individual', 'Gym', 18.5, 19.5));
    blocks.push(mk(d, 'joss', 'Tareas / Descanso', 'Otro', 20 + 2 / 3, 22));
  }

  // Sat (5): Gym juntos fuerte
  blocks.push(mk(dates[5], 'ambos', 'Gym juntos fuerte', 'Gym', 11, 12.5));

  // Sun (6): Descanso
  blocks.push(mk(dates[6], 'ambos', 'Descanso / Planeación semanal', 'Otro', 8, 23));

  return blocks;
}
