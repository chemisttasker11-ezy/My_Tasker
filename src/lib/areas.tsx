import { createContext, useContext } from 'react';
import { CATEGORIES, type Area, type BoardState } from '../model';

export const AreasContext = createContext<Area[]>(CATEGORIES);
export const useAreas = () => useContext(AreasContext);
export function changeArea(state: BoardState, previous: string | null, name: string): BoardState {
  const next = name.trim();
  if (!next || next.length > 40 || next.toLowerCase() === 'all') throw new Error('Use an area name of 1–40 characters, other than “All”.');
  if (state.areas.some(a => a.id !== previous && a.id.toLowerCase() === next.toLowerCase())) throw new Error('An area with that name already exists.');
  if (previous && !state.areas.some(a => a.id === previous)) throw new Error('That area no longer exists.');
  if (!previous && state.areas.length >= 40) throw new Error('You can have up to 40 areas.');
  const tones = ['teal', 'orange', 'pink', 'indigo', 'violet'];
  return { ...state,
    areas: previous ? state.areas.map(a => a.id === previous ? { ...a, id: next } : a) : [...state.areas, { id: next, emoji: '●', tone: tones[state.areas.length % tones.length] }],
    tasks: previous ? state.tasks.map(t => t.category === previous ? { ...t, category: next } : t) : state.tasks,
    completions: previous ? state.completions.map(c => c.category === previous ? { ...c, category: next } : c) : state.completions,
    plannedEntries: previous ? state.plannedEntries.map(e => e.category === previous ? { ...e, category: next } : e) : state.plannedEntries };
}
export function removeArea(state: BoardState, name: string, destination: string): BoardState {
  if (name === destination || !state.areas.some(a => a.id === name) || !state.areas.some(a => a.id === destination)) throw new Error('Choose a different existing area for these tasks.');
  return { ...state, areas: state.areas.filter(a => a.id !== name),
    tasks: state.tasks.map(t => t.category === name ? { ...t, category: destination } : t),
    completions: state.completions.map(c => c.category === name ? { ...c, category: destination } : c),
    plannedEntries: state.plannedEntries.map(e => e.category === name ? { ...e, category: destination } : e) };
}
