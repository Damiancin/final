import { useState, useEffect, useCallback } from 'react';
import {
  Calendar, Clock, Dumbbell, CheckCircle2, Circle, ChevronLeft, ChevronRight,
  Plus, User, Users, AlertCircle, X, MessageSquare, ListTodo, Activity,
  PartyPopper, Bell, Save, Trash2, Edit3,
} from 'lucide-react';

import { AgendaBlock, QuickEntry, GymDay } from './types';
import { supabase } from './lib/supabase';
import {
  getWeekStart, getWeekDates, toDateStr, fromDateStr,
  formatDayFull, dayIndexOf,
  formatHour, hourToInput, inputToHour, SHORT_DAYS,
} from './utils/date';
import { buildRoutineForWeek } from './data/defaultRoutine';

const HOURS = Array.from({ length: 16 }, (_, i) => i + 8);
const BLOCK_TYPES = ['Trabajo','Escuela','Comida','Traslado','Gym','Tiempo juntos','Evento','Pendiente','Actividad','Otro'] as const;
const ENTRY_TYPES = [
  { value: 'comentario', label: 'Comentario', icon: MessageSquare, color: 'text-sky-400' },
  { value: 'pendiente',  label: 'Pendiente',  icon: ListTodo,      color: 'text-amber-400' },
  { value: 'actividad',  label: 'Actividad',  icon: Activity,      color: 'text-emerald-400' },
  { value: 'evento',     label: 'Evento',     icon: PartyPopper,   color: 'text-rose-400' },
  { value: 'recordatorio', label: 'Recordatorio', icon: Bell,      color: 'text-teal-400' },
] as const;

const INITIAL_GYM: GymDay[] = [
  { day: 'Lun', completed: false, type: 'Push', detail: 'Pecho · Hombro · Tríceps' },
  { day: 'Mar', completed: false, type: 'Pull', detail: 'Espalda · Bíceps · Posterior' },
  { day: 'Mié', completed: false, type: 'Leg', detail: 'Pierna · Glúteo · Core' },
  { day: 'Jue', completed: false, type: 'Push', detail: 'Pecho · Hombro · Tríceps' },
  { day: 'Vie', completed: false, type: 'Pull', detail: 'Espalda · Bíceps · Posterior' },
  { day: 'Sáb', completed: false, type: 'Leg', detail: 'Pierna · Glúteo · Core' },
  { day: 'Dom', completed: false, type: 'Descanso', detail: 'Movilidad · Caminata · Planeación' },
];

const GYM_ORDER = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

type GymWeeklyRow = {
  day: string;
  completed: boolean;
  type: string;
  detail: string;
  sort_order: number;
};

function lsGet<T>(key: string, fallback: T): T {
  try { const r = localStorage.getItem(key); return r ? JSON.parse(r) : fallback; } catch { return fallback; }
}
function lsSet(key: string, v: unknown) { try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* */ } }

function getSavedPersonColor(person: AgendaBlock['person']): string {
  if (person === 'damian') return 'bg-sky-500/30 border-sky-400';
  if (person === 'joss') return 'bg-rose-500/30 border-rose-400';
  return 'bg-violet-500/30 border-violet-400';
}

function getColumnBlockColor(column: 'damian' | 'joss'): string {
  if (column === 'damian') return 'bg-sky-500/30 border-sky-400';
  return 'bg-rose-500/30 border-rose-400';
}

// Supabase CRUD
async function sbLoadBlocks() { if (!supabase) return null; const { data, error } = await supabase.from('agenda_blocks').select('*'); return error ? null : data as AgendaBlock[]; }
async function sbInsertBlock(b: AgendaBlock) { if (!supabase) return; await supabase.from('agenda_blocks').insert([b]); }
async function sbUpdateBlock(b: AgendaBlock) { if (!supabase) return; await supabase.from('agenda_blocks').update(b).eq('id', b.id); }
async function sbDeleteBlock(id: string) { if (!supabase) return; await supabase.from('agenda_blocks').delete().eq('id', id); }
async function sbLoadEntries() { if (!supabase) return null; const { data, error } = await supabase.from('quick_entries').select('*').order('created_at', { ascending: false }); return error ? null : data as QuickEntry[]; }
async function sbInsertEntry(e: QuickEntry) { if (!supabase) return; await supabase.from('quick_entries').insert([e]); }
async function sbUpdateEntry(e: QuickEntry) { if (!supabase) return; await supabase.from('quick_entries').update(e).eq('id', e.id); }
async function sbDeleteEntry(id: string) { if (!supabase) return; await supabase.from('quick_entries').delete().eq('id', id); }

async function sbLoadGymDays(): Promise<GymDay[] | null> {
  if (!supabase) return null;

  const { data, error } = await supabase
    .from('gym_weekly_config')
    .select('*')
    .order('sort_order', { ascending: true });

  if (error) return null;

  if (!data || data.length === 0) {
    const seedRows = INITIAL_GYM.map((g, index) => ({
      day: g.day,
      completed: g.completed,
      type: g.type,
      detail: g.detail,
      sort_order: index,
    }));

    const { error: insertError } = await supabase
      .from('gym_weekly_config')
      .upsert(seedRows, { onConflict: 'day' });

    if (insertError) return null;

    return INITIAL_GYM;
  }

  return (data as GymWeeklyRow[]).map((g) => ({
    day: g.day,
    completed: g.completed,
    type: g.type,
    detail: g.detail,
  }));
}

async function sbUpdateGymDay(g: GymDay) {
  if (!supabase) return;

  await supabase
    .from('gym_weekly_config')
    .upsert(
      {
        day: g.day,
        completed: g.completed,
        type: g.type,
        detail: g.detail,
        sort_order: GYM_ORDER.indexOf(g.day),
      },
      { onConflict: 'day' }
    );
}

function App() {
  const [weekStart, setWeekStart] = useState<Date>(() => getWeekStart(new Date()));
  const [selectedDate, setSelectedDate] = useState<string>(() => toDateStr(new Date()));
  const weekDates = getWeekDates(weekStart);

  const [customBlocks, setCustomBlocks]       = useState<AgendaBlock[]>(() => lsGet('agenda-custom-blocks', []));
  const [deletedRecurring, setDeletedRecurring] = useState<string[]>(() => lsGet('agenda-deleted-recurring', []));
  const [gymDays, setGymDays]                 = useState<GymDay[]>(() => lsGet('agenda-gym-state', INITIAL_GYM));
  const [entries, setEntries]                 = useState<QuickEntry[]>(() => lsGet('agenda-quick-entries', []));

  const [showAddModal, setShowAddModal] = useState(false);
  const [modalTab, setModalTab]         = useState<'block' | 'note'>('note');
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingBlock, setEditingBlock]   = useState<AgendaBlock | null>(null);

  const [newType, setNewType]     = useState<QuickEntry['type']>('pendiente');
  const [newText, setNewText]     = useState('');
  const [newPerson, setNewPerson] = useState<QuickEntry['person']>('ambos');
  const [newDate, setNewDate]     = useState('');
  const [newTime, setNewTime]     = useState('');

  const [addDate, setAddDate]           = useState('');
  const [addLabel, setAddLabel]         = useState('');
  const [addPerson, setAddPerson]       = useState<AgendaBlock['person']>('damian');
  const [addBlockType, setAddBlockType] = useState('Otro');
  const [addStart, setAddStart]         = useState('08:00');
  const [addEnd, setAddEnd]             = useState('09:00');
  const [addNotes, setAddNotes]         = useState('');

  const [editLabel, setEditLabel]         = useState('');
  const [editDate, setEditDate]           = useState('');
  const [editPerson, setEditPerson]       = useState<AgendaBlock['person']>('damian');
  const [editBlockType, setEditBlockType] = useState('Otro');
  const [editStart, setEditStart]         = useState('08:00');
  const [editEnd, setEditEnd]             = useState('09:00');
  const [editNotes, setEditNotes]         = useState('');

  useEffect(() => {
    sbLoadBlocks().then((data) => { if (data) { const c = data.filter((b) => !b.is_recurring); setCustomBlocks(c); lsSet('agenda-custom-blocks', c); } });
    sbLoadEntries().then((data) => { if (data) { setEntries(data); lsSet('agenda-quick-entries', data); } });
    sbLoadGymDays().then((data) => { if (data) { setGymDays(data); lsSet('agenda-gym-state', data); } });
  }, []);

  useEffect(() => { lsSet('agenda-custom-blocks', customBlocks); }, [customBlocks]);
  useEffect(() => { lsSet('agenda-quick-entries', entries); }, [entries]);
  useEffect(() => { lsSet('agenda-gym-state', gymDays); }, [gymDays]);
  useEffect(() => { lsSet('agenda-deleted-recurring', deletedRecurring); }, [deletedRecurring]);

  const routineBlocks = buildRoutineForWeek(weekStart).filter((b) => !deletedRecurring.includes(b.id));
  const allBlocks     = [...routineBlocks, ...customBlocks];
  const dayBlocks     = allBlocks.filter((b) => b.date === selectedDate);
  const damianBlocks  = dayBlocks.filter((b) => b.person === 'damian' || b.person === 'ambos');
  const jossBlocks    = dayBlocks.filter((b) => b.person === 'joss'   || b.person === 'ambos');
  const gymCompleted  = gymDays.filter((g) => g.completed).length;
  const pendingEntries = entries.filter((e) => e.type === 'pendiente' && !e.done);

  const goTodayWeek = () => { const t = new Date(); setWeekStart(getWeekStart(t)); setSelectedDate(toDateStr(t)); };
  const goPrevWeek  = () => { const p = new Date(weekStart); p.setDate(p.getDate() - 7); setWeekStart(p); };
  const goNextWeek  = () => { const n = new Date(weekStart); n.setDate(n.getDate() + 7); setWeekStart(n); };

  const toggleGym = async (day: string) => {
    let changed: GymDay | null = null;

    const updated = gymDays.map((g) => {
      if (g.day === day) {
        changed = { ...g, completed: !g.completed };
        return changed;
      }

      return g;
    });

    setGymDays(updated);
    lsSet('agenda-gym-state', updated);

    if (changed) {
      await sbUpdateGymDay(changed);
    }
  };

  const updateGymDay = async (
    day: string,
    field: 'type' | 'detail',
    value: string
  ) => {
    let changed: GymDay | null = null;

    const updated = gymDays.map((g) => {
      if (g.day === day) {
        changed = { ...g, [field]: value };
        return changed;
      }

      return g;
    });

    setGymDays(updated);
    lsSet('agenda-gym-state', updated);

    if (changed) {
      await sbUpdateGymDay(changed);
    }
  };

  const addQuickEntry = async () => {
    if (!newText.trim()) return;
    const entry: QuickEntry = { id: `qe-${Date.now()}`, type: newType, text: newText.trim(), person: newPerson, date: newDate, time: newTime, done: false, createdAt: new Date().toISOString() };
    setEntries((prev) => [entry, ...prev]);
    await sbInsertEntry(entry);
    setNewText(''); setNewDate(''); setNewTime(''); setShowAddModal(false);
  };

  const toggleEntryDone = async (id: string) => {
    const updated = entries.map((e) => e.id === id ? { ...e, done: !e.done } : e);
    setEntries(updated);
    const e = updated.find((e) => e.id === id); if (e) await sbUpdateEntry(e);
  };

  const deleteEntry = async (id: string) => { setEntries((prev) => prev.filter((e) => e.id !== id)); await sbDeleteEntry(id); };

  const handleAddBlock = async () => {
    if (!addLabel.trim()) return;
    const start = inputToHour(addStart), end = inputToHour(addEnd);
    if (end <= start) return;
    const block: AgendaBlock = { id: `blk-${Date.now()}`, date: addDate || selectedDate, person: addPerson, label: addLabel.trim(), type: addBlockType, start, end, notes: addNotes.trim(), color: getSavedPersonColor(addPerson), is_recurring: false };
    setCustomBlocks((prev) => [...prev, block]);
    await sbInsertBlock(block);
    setAddLabel(''); setAddNotes(''); setShowAddModal(false);
  };

  const openEditModal = (block: AgendaBlock) => {
    setEditingBlock(block); setEditLabel(block.label); setEditDate(block.date); setEditPerson(block.person);
    setEditBlockType(block.type); setEditStart(hourToInput(block.start)); setEditEnd(hourToInput(block.end)); setEditNotes(block.notes);
    setShowEditModal(true);
  };

  const handleSaveEdit = async () => {
    if (!editingBlock || !editLabel.trim()) return;
    const start = inputToHour(editStart), end = inputToHour(editEnd);
    if (end <= start) return;
    const updated: AgendaBlock = { ...editingBlock, label: editLabel.trim(), date: editDate, person: editPerson, type: editBlockType, start, end, notes: editNotes.trim(), color: getSavedPersonColor(editPerson) };
    if (editingBlock.is_recurring) {
      setDeletedRecurring((prev) => [...prev, editingBlock.id]);
      const nb = { ...updated, id: `blk-${Date.now()}`, is_recurring: false };
      setCustomBlocks((prev) => [...prev, nb]); await sbInsertBlock(nb);
    } else {
      setCustomBlocks((prev) => prev.map((b) => b.id === editingBlock.id ? updated : b)); await sbUpdateBlock(updated);
    }
    setShowEditModal(false); setEditingBlock(null);
  };

  const handleDeleteBlock = async () => {
    if (!editingBlock) return;
    if (editingBlock.is_recurring) { setDeletedRecurring((prev) => [...prev, editingBlock.id]); }
    else { setCustomBlocks((prev) => prev.filter((b) => b.id !== editingBlock.id)); await sbDeleteBlock(editingBlock.id); }
    setShowEditModal(false); setEditingBlock(null);
  };

  const openAddBlockModal = () => { setAddDate(selectedDate); setAddLabel(''); setAddPerson('damian'); setAddBlockType('Otro'); setAddStart('08:00'); setAddEnd('09:00'); setAddNotes(''); setShowAddModal(true); setModalTab('block'); };

  const getEntryIcon  = (t: QuickEntry['type']) => ENTRY_TYPES.find((x) => x.value === t)?.icon ?? MessageSquare;
  const getEntryColor = (t: QuickEntry['type']) => ENTRY_TYPES.find((x) => x.value === t)?.color ?? 'text-zinc-400';
  const getPersonLabel = (p: 'tú' | 'joss' | 'ambos') => p === 'tú' ? 'Damián' : p === 'joss' ? 'Joss' : 'Ambos';

  const renderBlock = useCallback((block: AgendaBlock, column: 'damian' | 'joss') => {
    const top = (block.start - 8) * 48;
    const height = (block.end - block.start) * 48;
    const personColor = getColumnBlockColor(column);

    return (
      <div
        key={block.id}
        className={`absolute left-1 right-1 rounded-lg border ${personColor} cursor-pointer transition-all hover:brightness-125 group`}
        style={{ top: `${top + 24}px`, height: `${Math.max(height - 4, 16)}px` }}
        onClick={() => openEditModal(block)}
      >
        <div className="p-1.5 overflow-hidden h-full relative">
          <p className="text-xs font-medium text-zinc-100 truncate">{block.label}</p>
          <p className="text-[10px] text-zinc-300 mt-0.5">{formatHour(block.start)} - {formatHour(block.end)}</p>
          {block.person === 'ambos' && (
            <span className="absolute bottom-1 right-1 text-[8px] text-zinc-300 bg-zinc-950/40 px-1 rounded">
              Ambos
            </span>
          )}
          <Edit3 className="w-3 h-3 text-zinc-400 absolute top-1.5 right-1.5 opacity-0 group-hover:opacity-100 transition-opacity" />
        </div>
      </div>
    );
  }, []);

  const today = toDateStr(new Date());
  const selectedDateObj = fromDateStr(selectedDate);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <header className="border-b border-zinc-800 bg-zinc-950/80 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-emerald-400 to-teal-600 flex items-center justify-center"><Calendar className="w-5 h-5 text-white" /></div>
            <div><h1 className="text-lg font-semibold tracking-tight text-zinc-50">Agenda compartida</h1><p className="text-xs text-zinc-500">Damián & Joss</p></div>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 text-xs text-zinc-400 bg-zinc-900 px-3 py-1.5 rounded-full border border-zinc-800"><Users className="w-3.5 h-3.5" /><span>2 personas</span></div>
            <button onClick={openAddBlockModal} className="w-8 h-8 rounded-lg bg-emerald-600 border border-emerald-500 flex items-center justify-center hover:bg-emerald-500 transition-colors"><Plus className="w-4 h-4 text-white" /></button>
          </div>
        </div>
      </header>

      <section className="max-w-7xl mx-auto px-4 sm:px-6 pt-6">
        <div className="relative overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/50 h-40 sm:h-56">
          <img
            src="/imagen.png"
            alt="Agenda compartida"
            className="w-full h-full object-cover opacity-80"
          />

          <div className="absolute inset-0 bg-gradient-to-r from-zinc-950/90 via-zinc-950/55 to-transparent" />

          <div className="absolute left-5 top-5 max-w-md">
            <p className="text-[10px] uppercase tracking-[0.25em] text-emerald-400 font-semibold">
              Agenda compartida
            </p>

            <h2 className="text-xl sm:text-2xl font-semibold text-zinc-50 mt-2">
              Organización, rutina y tiempo juntos
            </h2>

            <p className="text-xs sm:text-sm text-zinc-400 mt-2">
              Plan semanal, pendientes, gimnasio y actividades en un solo lugar.
            </p>
          </div>
        </div>
      </section>

      {/* Add Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-zinc-900 border border-zinc-700 rounded-2xl w-full max-w-md shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800 sticky top-0 bg-zinc-900 z-10">
              <h3 className="text-sm font-semibold text-zinc-200">Agregar</h3>
              <button onClick={() => setShowAddModal(false)} className="text-zinc-500 hover:text-zinc-300 transition-colors"><X className="w-4 h-4" /></button>
            </div>
            <div className="flex border-b border-zinc-800">
              <button onClick={() => setModalTab('note')} className={`flex-1 py-2.5 text-xs font-medium transition-colors ${modalTab === 'note' ? 'text-emerald-400 border-b-2 border-emerald-400' : 'text-zinc-500 hover:text-zinc-300'}`}>Nota rápida</button>
              <button onClick={() => setModalTab('block')} className={`flex-1 py-2.5 text-xs font-medium transition-colors ${modalTab === 'block' ? 'text-emerald-400 border-b-2 border-emerald-400' : 'text-zinc-500 hover:text-zinc-300'}`}>Bloque de horario</button>
            </div>
            <div className="p-5 space-y-4">
              {modalTab === 'note' ? (
                <>
                  <div><label className="text-[10px] text-zinc-500 uppercase tracking-wider font-medium">Tipo</label>
                    <select value={newType} onChange={(e) => setNewType(e.target.value as QuickEntry['type'])} className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-xs text-zinc-200 outline-none focus:border-emerald-500">{ENTRY_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}</select></div>
                  <div><label className="text-[10px] text-zinc-500 uppercase tracking-wider font-medium">Comentario / título</label>
                    <input value={newText} onChange={(e) => setNewText(e.target.value)} placeholder="Ej: Hoy salí tarde del trabajo" className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-xs text-zinc-200 outline-none focus:border-emerald-500 placeholder:text-zinc-600" /></div>
                  <div><label className="text-[10px] text-zinc-500 uppercase tracking-wider font-medium">Responsable</label>
                    <select value={newPerson} onChange={(e) => setNewPerson(e.target.value as QuickEntry['person'])} className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-xs text-zinc-200 outline-none focus:border-emerald-500"><option value="tú">Damián</option><option value="joss">Joss</option><option value="ambos">Ambos</option></select></div>
                  <div className="grid grid-cols-2 gap-3">
                    <div><label className="text-[10px] text-zinc-500 uppercase tracking-wider font-medium">Fecha (opcional)</label><input type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-xs text-zinc-200 outline-none focus:border-emerald-500" /></div>
                    <div><label className="text-[10px] text-zinc-500 uppercase tracking-wider font-medium">Hora (opcional)</label><input type="time" value={newTime} onChange={(e) => setNewTime(e.target.value)} className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-xs text-zinc-200 outline-none focus:border-emerald-500" /></div>
                  </div>
                  <button onClick={addQuickEntry} disabled={!newText.trim()} className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:bg-zinc-700 disabled:text-zinc-500 text-white text-xs font-medium transition-colors"><Save className="w-3.5 h-3.5" />Guardar</button>
                </>
              ) : (
                <>
                  <div><label className="text-[10px] text-zinc-500 uppercase tracking-wider font-medium">Fecha</label><input type="date" value={addDate} onChange={(e) => setAddDate(e.target.value)} className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-xs text-zinc-200 outline-none focus:border-emerald-500" /></div>
                  <div><label className="text-[10px] text-zinc-500 uppercase tracking-wider font-medium">Título</label><input value={addLabel} onChange={(e) => setAddLabel(e.target.value)} placeholder="Ej: Partido de basket" className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-xs text-zinc-200 outline-none focus:border-emerald-500 placeholder:text-zinc-600" /></div>
                  <div><label className="text-[10px] text-zinc-500 uppercase tracking-wider font-medium">Responsable</label><select value={addPerson} onChange={(e) => setAddPerson(e.target.value as AgendaBlock['person'])} className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-xs text-zinc-200 outline-none focus:border-emerald-500"><option value="damian">Damián</option><option value="joss">Joss</option><option value="ambos">Ambos</option></select></div>
                  <div><label className="text-[10px] text-zinc-500 uppercase tracking-wider font-medium">Tipo</label><select value={addBlockType} onChange={(e) => setAddBlockType(e.target.value)} className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-xs text-zinc-200 outline-none focus:border-emerald-500">{BLOCK_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}</select></div>
                  <div className="grid grid-cols-2 gap-3">
                    <div><label className="text-[10px] text-zinc-500 uppercase tracking-wider font-medium">Inicio</label><input type="time" value={addStart} onChange={(e) => setAddStart(e.target.value)} className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-xs text-zinc-200 outline-none focus:border-emerald-500" /></div>
                    <div><label className="text-[10px] text-zinc-500 uppercase tracking-wider font-medium">Fin</label><input type="time" value={addEnd} onChange={(e) => setAddEnd(e.target.value)} className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-xs text-zinc-200 outline-none focus:border-emerald-500" /></div>
                  </div>
                  <div><label className="text-[10px] text-zinc-500 uppercase tracking-wider font-medium">Notas (opcional)</label><input value={addNotes} onChange={(e) => setAddNotes(e.target.value)} placeholder="Ej: Llevar documentos" className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-xs text-zinc-200 outline-none focus:border-emerald-500 placeholder:text-zinc-600" /></div>
                  <button onClick={handleAddBlock} disabled={!addLabel.trim()} className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:bg-zinc-700 disabled:text-zinc-500 text-white text-xs font-medium transition-colors"><Save className="w-3.5 h-3.5" />Agregar bloque</button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {showEditModal && editingBlock && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-zinc-900 border border-zinc-700 rounded-2xl w-full max-w-md shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800 sticky top-0 bg-zinc-900 z-10">
              <h3 className="text-sm font-semibold text-zinc-200">Editar bloque</h3>
              <button onClick={() => { setShowEditModal(false); setEditingBlock(null); }} className="text-zinc-500 hover:text-zinc-300 transition-colors"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-5 space-y-4">
              <div><label className="text-[10px] text-zinc-500 uppercase tracking-wider font-medium">Título</label><input value={editLabel} onChange={(e) => setEditLabel(e.target.value)} className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-xs text-zinc-200 outline-none focus:border-emerald-500" /></div>
              <div><label className="text-[10px] text-zinc-500 uppercase tracking-wider font-medium">Fecha</label><input type="date" value={editDate} onChange={(e) => setEditDate(e.target.value)} className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-xs text-zinc-200 outline-none focus:border-emerald-500" /></div>
              <div><label className="text-[10px] text-zinc-500 uppercase tracking-wider font-medium">Responsable</label><select value={editPerson} onChange={(e) => setEditPerson(e.target.value as AgendaBlock['person'])} className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-xs text-zinc-200 outline-none focus:border-emerald-500"><option value="damian">Damián</option><option value="joss">Joss</option><option value="ambos">Ambos</option></select></div>
              <div><label className="text-[10px] text-zinc-500 uppercase tracking-wider font-medium">Tipo</label><select value={editBlockType} onChange={(e) => setEditBlockType(e.target.value)} className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-xs text-zinc-200 outline-none focus:border-emerald-500">{BLOCK_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}</select></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-[10px] text-zinc-500 uppercase tracking-wider font-medium">Inicio</label><input type="time" value={editStart} onChange={(e) => setEditStart(e.target.value)} className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-xs text-zinc-200 outline-none focus:border-emerald-500" /></div>
                <div><label className="text-[10px] text-zinc-500 uppercase tracking-wider font-medium">Fin</label><input type="time" value={editEnd} onChange={(e) => setEditEnd(e.target.value)} className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-xs text-zinc-200 outline-none focus:border-emerald-500" /></div>
              </div>
              <div><label className="text-[10px] text-zinc-500 uppercase tracking-wider font-medium">Notas</label><input value={editNotes} onChange={(e) => setEditNotes(e.target.value)} placeholder="Notas opcionales" className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-xs text-zinc-200 outline-none focus:border-emerald-500 placeholder:text-zinc-600" /></div>
              {editingBlock.is_recurring && <p className="text-[10px] text-amber-400/70">Bloque recurrente. Al guardar se creará una copia editable solo para esta fecha.</p>}
              <div className="flex gap-3">
                <button onClick={handleDeleteBlock} className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-rose-600/20 border border-rose-500/30 text-rose-400 hover:bg-rose-600/30 text-xs font-medium transition-colors"><Trash2 className="w-3.5 h-3.5" />Eliminar</button>
                <button onClick={handleSaveEdit} disabled={!editLabel.trim()} className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:bg-zinc-700 disabled:text-zinc-500 text-white text-xs font-medium transition-colors"><Save className="w-3.5 h-3.5" />Guardar</button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        {/* Week nav + Day tabs */}
        <div className="flex items-center gap-2 mb-6 overflow-x-auto pb-2">
          <button onClick={goPrevWeek} className="w-8 h-8 rounded-lg bg-zinc-800 border border-zinc-700 flex items-center justify-center hover:bg-zinc-700 transition-colors shrink-0"><ChevronLeft className="w-4 h-4 text-zinc-400" /></button>
          <button onClick={goTodayWeek} className="px-3 h-8 rounded-lg bg-zinc-800 border border-zinc-700 text-[10px] text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200 transition-colors shrink-0 font-medium">Hoy</button>
          {weekDates.map((date) => {
            const ds = toDateStr(date);
            const isSelected = ds === selectedDate;
            const isToday = ds === today;
            const dow = dayIndexOf(date);
            return (
              <button key={ds} onClick={() => setSelectedDate(ds)} className={`flex flex-col items-center px-4 py-2 rounded-xl border transition-all shrink-0 ${isSelected ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-400' : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:border-zinc-700 hover:text-zinc-300'}`}>
                <span className="text-xs font-medium">{SHORT_DAYS[dow]}</span>
                <span className={`text-sm font-semibold mt-0.5 ${isSelected ? 'text-emerald-400' : isToday ? 'text-sky-400' : 'text-zinc-300'}`}>{date.getDate()}</span>
              </button>
            );
          })}
          <button onClick={goNextWeek} className="w-8 h-8 rounded-lg bg-zinc-800 border border-zinc-700 flex items-center justify-center hover:bg-zinc-700 transition-colors shrink-0"><ChevronRight className="w-4 h-4 text-zinc-400" /></button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl overflow-hidden">
              <div className="px-5 py-4 border-b border-zinc-800 flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-semibold text-zinc-200">{formatDayFull(selectedDateObj)} — {selectedDate}</h2>
                  <p className="text-xs text-zinc-500 mt-0.5">Haz clic en un bloque para editar</p>
                </div>
                <div className="flex items-center gap-4 text-xs">
                  <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-sky-400" />Damián</span>
                  <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-rose-400" />Joss</span>
                </div>
              </div>
              <div className="flex overflow-x-auto">
                <div className="w-14 shrink-0 border-r border-zinc-800">
                  {HOURS.map((hour) => <div key={hour} className="h-12 flex items-start justify-end pr-2 pt-0.5 text-[10px] text-zinc-600">{hour.toString().padStart(2, '0')}:00</div>)}
                </div>
                <div className="flex-1 grid grid-cols-2 min-w-[320px]">
                  <div className="relative border-r border-zinc-800">
                    <div className="absolute top-0 left-0 right-0 text-center py-1.5 text-[10px] font-medium text-sky-400/70 bg-zinc-900/80 border-b border-zinc-800 z-10"><User className="w-3 h-3 inline mr-1" />Damián</div>
                    {HOURS.map((hour) => <div key={hour} className="h-12 border-b border-zinc-800/50" />)}
                    {damianBlocks.map((block) => renderBlock(block, 'damian'))}
                  </div>
                  <div className="relative">
                    <div className="absolute top-0 left-0 right-0 text-center py-1.5 text-[10px] font-medium text-rose-400/70 bg-zinc-900/80 border-b border-zinc-800 z-10"><User className="w-3 h-3 inline mr-1" />Joss</div>
                    {HOURS.map((hour) => <div key={hour} className="h-12 border-b border-zinc-800/50" />)}
                    {jossBlocks.map((block) => renderBlock(block, 'joss'))}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-6">
            {pendingEntries.length > 0 && (
              <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl">
                <div className="px-5 py-4 border-b border-zinc-800 flex items-center justify-between">
                  <div className="flex items-center gap-2"><AlertCircle className="w-4 h-4 text-amber-400" /><h3 className="text-sm font-semibold text-zinc-200">Pendientes</h3></div>
                  <span className="text-[10px] text-zinc-500 bg-zinc-800 px-2 py-0.5 rounded-full">{pendingEntries.length}</span>
                </div>
                <div className="p-4 space-y-2">
                  {pendingEntries.map((entry) => (
                    <button key={entry.id} onClick={() => toggleEntryDone(entry.id)} className="w-full flex items-start gap-2.5 text-left group hover:bg-zinc-800/50 rounded-lg p-1.5 -m-1.5 transition-colors">
                      <Circle className="w-4 h-4 text-zinc-600 shrink-0 mt-0.5 group-hover:text-amber-400 transition-colors" />
                      <div className="flex-1 min-w-0"><p className="text-xs text-zinc-300 truncate">{entry.text}</p><p className="text-[10px] text-zinc-500 mt-0.5">{getPersonLabel(entry.person)}{entry.date ? ` - ${entry.date}` : ''}</p></div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl">
              <div className="px-5 py-4 border-b border-zinc-800 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Dumbbell className="w-4 h-4 text-emerald-400" />
                  <h3 className="text-sm font-semibold text-zinc-200">Gimnasio semanal</h3>
                </div>
                <span className="text-[10px] text-zinc-500 bg-zinc-800 px-2 py-0.5 rounded-full">{gymCompleted}/7</span>
              </div>

              <div className="p-4">
                <div className="grid grid-cols-7 gap-1.5 mb-4">
                  {gymDays.map((g) => (
                    <button
                      key={g.day}
                      onClick={() => toggleGym(g.day)}
                      className={`flex flex-col items-center py-2 rounded-lg border transition-all ${
                        g.completed
                          ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400'
                          : 'bg-zinc-800/50 border-zinc-800 text-zinc-500 hover:border-zinc-700'
                      }`}
                    >
                      <span className="text-[10px] font-medium">{g.day}</span>
                      <span className="text-[8px] mt-0.5 opacity-70">{g.type}</span>
                    </button>
                  ))}
                </div>

                <div className="space-y-2 mb-4">
                  {gymDays.map((g) => (
                    <div key={g.day} className="rounded-lg border border-zinc-800 bg-zinc-950/40 p-2">
                      <div className="flex items-center gap-2 mb-2">
                        <button
                          onClick={() => toggleGym(g.day)}
                          className={`w-2 h-2 rounded-full shrink-0 ${
                            g.completed ? 'bg-emerald-400' : 'bg-zinc-700'
                          }`}
                          title="Marcar como completado"
                        />

                        <span className="text-[10px] text-zinc-500 w-7">{g.day}</span>

                        <input
                          value={g.type}
                          onChange={(e) => updateGymDay(g.day, 'type', e.target.value)}
                          className="flex-1 bg-zinc-900 border border-zinc-800 rounded-md px-2 py-1 text-[10px] text-zinc-200 outline-none focus:border-emerald-500"
                          placeholder="Push / Pull / Leg"
                        />
                      </div>

                      <input
                        value={g.detail}
                        onChange={(e) => updateGymDay(g.day, 'detail', e.target.value)}
                        className="w-full bg-zinc-900 border border-zinc-800 rounded-md px-2 py-1 text-[10px] text-zinc-400 outline-none focus:border-emerald-500"
                        placeholder="Detalle del entrenamiento"
                      />
                    </div>
                  ))}
                </div>

                <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 rounded-full transition-all duration-500"
                    style={{ width: `${(gymCompleted / 7) * 100}%` }}
                  />
                </div>

                <p className="text-[10px] text-zinc-500 mt-2 text-center">
                  {gymCompleted === 7 ? 'Semana completada' : `${7 - gymCompleted} días restantes`}
                </p>
              </div>
            </div>

            <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl">
              <div className="px-5 py-4 border-b border-zinc-800 flex items-center justify-between">
                <div className="flex items-center gap-2"><Clock className="w-4 h-4 text-sky-400" /><h3 className="text-sm font-semibold text-zinc-200">Notas y pendientes</h3></div>
                <button onClick={() => { setShowAddModal(true); setModalTab('note'); }} className="w-6 h-6 rounded-md bg-zinc-800 border border-zinc-700 flex items-center justify-center hover:bg-zinc-700 transition-colors"><Plus className="w-3 h-3 text-zinc-400" /></button>
              </div>
              <div className="p-4 space-y-2 max-h-80 overflow-y-auto">
                {entries.length === 0 && <p className="text-xs text-zinc-600 text-center py-4">Sin entradas. Agrega una nota o pendiente.</p>}
                {entries.map((entry) => {
                  const Icon = getEntryIcon(entry.type);
                  const color = getEntryColor(entry.type);
                  return (
                    <div key={entry.id} className="flex items-start gap-2.5 group hover:bg-zinc-800/50 rounded-lg p-2 -m-1 transition-colors">
                      <button onClick={() => entry.type === 'pendiente' && toggleEntryDone(entry.id)} className="shrink-0 mt-0.5">
                        {entry.type === 'pendiente' ? (entry.done ? <CheckCircle2 className="w-4 h-4 text-emerald-400" /> : <Circle className="w-4 h-4 text-zinc-600 hover:text-amber-400 transition-colors" />) : <Icon className={`w-4 h-4 ${color}`} />}
                      </button>
                      <div className="flex-1 min-w-0">
                        <p className={`text-xs ${entry.type === 'pendiente' && entry.done ? 'text-zinc-600 line-through' : 'text-zinc-300'}`}>{entry.text}</p>
                        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                          <span className="text-[9px] text-zinc-600 bg-zinc-800 px-1.5 py-0.5 rounded">{ENTRY_TYPES.find((t) => t.value === entry.type)?.label}</span>
                          <span className="text-[9px] text-zinc-600">{getPersonLabel(entry.person)}</span>
                          {entry.date && <span className="text-[9px] text-zinc-600">{entry.date}</span>}
                          {entry.time && <span className="text-[9px] text-zinc-600">{entry.time}</span>}
                        </div>
                      </div>
                      <button onClick={() => deleteEntry(entry.id)} className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"><X className="w-3.5 h-3.5 text-zinc-600 hover:text-rose-400" /></button>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
