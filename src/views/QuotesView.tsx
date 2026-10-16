import { useState } from 'react';
import { dailyQuote, QUOTE_LIBRARY, quoteSettings, type QuoteSettings } from '../lib/quotes';
import { generateId, type BoardState } from '../model';
import { relevantTasksForDate } from '../lib/planProjection';

export function QuotesView({ value, today, board, onChange }: { value?: QuoteSettings; today: string; board: BoardState; onChange: (q: QuoteSettings) => void }) {
  const q = quoteSettings(value);
  const [direction, setDirection] = useState(q.direction);
  const [date, setDate] = useState(today);
  const [draft, setDraft] = useState('');
  const [theme, setTheme] = useState('All');
  const [notice, setNotice] = useState('');
  const quote = dailyQuote(q, date, relevantTasksForDate(board,date));
  const quotes = [...q.custom, ...QUOTE_LIBRARY].filter(item => theme === 'All' || item.theme === theme);
  return <>
    <div className="page-title-row"><div><span className="eyebrow">WORDS TO COME BACK TO</span><h1>Your direction & daily quotes</h1><p>A reminder of what matters, alongside a little encouragement for the day.</p></div></div>
    <div className="quote-settings-grid"><section className="panel"><h2>My direction</h2><p>One persistent reminder shown across the app and on every tracker.</p><label>Your direction quote<textarea aria-label="Your direction quote" maxLength={240} rows={3} value={direction} onChange={e => setDirection(e.target.value)}/></label><button className="button button-primary" onClick={() => { onChange({ ...q, direction: direction.trim() }); setNotice('Direction quote saved'); }}>Save direction</button></section><section className="panel"><h2>A quote for the day</h2><label>Quote date<input type="date" aria-label="Quote date" value={date} onChange={e => { if (e.target.value) setDate(e.target.value); }}/></label><blockquote>{quote.text}</blockquote><p>{quote.custom ? 'You chose this quote.' : `Suggested from the ${quote.theme.toLowerCase()} collection, based on your tasks.`}</p>{q.daily[date] && <button className="button button-secondary" onClick={() => { const daily = { ...q.daily }; delete daily[date]; onChange({ ...q, daily }); }}>Use suggested quote</button>}</section></div>
    <section className="panel quote-compose"><h2>Write your own</h2><p>Save up to 100 personal quotes. Choosing a daily quote saves it for the selected date.</p><label>Custom quote<textarea aria-label="Custom quote" value={draft} maxLength={240} rows={2} onChange={e => setDraft(e.target.value)} placeholder="Write a reminder in your own voice…"/></label><button className="button button-primary" disabled={!draft.trim() || q.custom.length >= 100} onClick={() => { onChange({ ...q, custom: [...q.custom, { id: generateId(), text: draft.trim(), theme: 'My quotes' }] }); setDraft(''); setNotice('Custom quote saved to your library'); }}>Save custom quote</button></section>
    <div className="quote-library-heading"><div><h2>Choose a little encouragement</h2><p>36 original reminders written for My Tasker. No attributed quotations.</p></div><label>Quote theme<select aria-label="Quote theme" value={theme} onChange={e => setTheme(e.target.value)}>{['All', 'My quotes', ...new Set(QUOTE_LIBRARY.map(item => item.theme))].map(t => <option key={t}>{t}</option>)}</select></label></div>
    <p role="status">{notice}</p><div className="quote-grid">{quotes.map(item => <article className="quote-card" key={item.id}><span className="eyebrow">{item.theme}</span><blockquote>{item.text}</blockquote><div><button className="button button-secondary" onClick={() => { onChange({ ...q, daily: { ...q.daily, [date]: item.text } }); setNotice(`Quote chosen for ${date}`); }}>Use for {date}</button><button className="text-link" onClick={() => { setDirection(item.text); onChange({ ...q, direction: item.text }); setNotice('Direction quote saved'); }}>Make my direction</button>{item.theme === 'My quotes' && <button className="text-link" aria-label={`Remove custom quote ${item.text}`} onClick={() => { onChange({ ...q, custom: q.custom.filter(c => c.id !== item.id) }); setNotice('Removed from your library; saved daily quotes stay unchanged'); }}>Remove from library</button>}</div></article>)}</div>
  </>;
}
