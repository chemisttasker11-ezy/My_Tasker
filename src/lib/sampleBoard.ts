import { createTask, initialState, type BoardState } from '../model';

/** No founder-specific tasks or clinical information are seeded for new user accounts. */
export function sampleBoard(): BoardState {
  const state = initialState();
  state.areas = [
    {id:'Work',tone:'indigo',emoji:'◈'},
    {id:'Life',tone:'orange',emoji:'✦'},
    {id:'Wellbeing',tone:'mint',emoji:'◉'},
    {id:'Family',tone:'pink',emoji:'♥'}
  ];
  state.tasks = [
    createTask({title:'Choose my top three priorities',lane:'daily',category:'Work',priority:'high',
      description:'Open the day planner and focus on three meaningful wins.',estimateMinutes:15}),
    createTask({title:'Make time for a personal goal',lane:'weekly',category:'Life',priority:'medium',
      description:'Move a copy from the board into any day this week.',estimateMinutes:45}),
    createTask({title:'Recharge and move',lane:'daily',category:'Wellbeing',priority:'medium',
      description:'Plan a short break or movement session.',estimateMinutes:20}),
    createTask({title:'Plan time for someone important',lane:'weekly',category:'Family',priority:'medium',
      description:'You can copy your plan to multiple days.',estimateMinutes:30})
  ];
  return state;
}
