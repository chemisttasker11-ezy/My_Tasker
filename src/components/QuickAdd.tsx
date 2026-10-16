import { useState, useRef, useEffect, useId, type FormEvent } from 'react';
import { Plus } from 'lucide-react';
import { parseQuickAdd, MAX_TITLE_LENGTH, type ParsedQuickAdd } from '../lib/quickAdd';
import '../styles/quick-add.css';

export interface QuickAddProps {
  onAdd?(title: string): void;
  onAddParsed?(parsed: ParsedQuickAdd): void;
  placeholder?: string;
  label?: string;
  todayISO?: string;
}

export function QuickAdd({
  onAdd,
  onAddParsed,
  placeholder = 'Add a task... (e.g. Call dentist tomorrow!)',
  label = 'Quick add task',
  todayISO,
}: QuickAddProps) {
  const [value, setValue] = useState('');
  const [announcement, setAnnouncement] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputId = useId();

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, []);

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const parsed = parseQuickAdd(value, todayISO);

    // Empty or whitespace only does nothing
    if (!parsed.title) {
      return;
    }

    if (onAddParsed) {
      onAddParsed(parsed);
    } else if (onAdd) {
      onAdd(parsed.title);
    }

    setValue('');
    inputRef.current?.focus();

    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }
    setAnnouncement(`Added: ${parsed.title}`);
    timerRef.current = setTimeout(() => {
      setAnnouncement('');
      timerRef.current = null;
    }, 3000);
  }

  return (
    <form className="quick-add-form" onSubmit={handleSubmit} aria-label={label}>
      <label htmlFor={inputId} className="quick-add-label">
        {label}
      </label>
      <div className="quick-add-row">
        <div className="quick-add-input-wrapper">
          <input
            ref={inputRef}
            id={inputId}
            type="text"
            className="quick-add-input"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={placeholder}
            aria-label={label}
            autoComplete="off"
            maxLength={MAX_TITLE_LENGTH + 30} // Allows space for smart tags (e.g. " tomorrow!") before parsing/cutting
          />
        </div>
        <button
          type="submit"
          className="button button-primary quick-add-button"
          aria-label="Add task"
        >
          <Plus size={18} aria-hidden="true" />
          <span>Add</span>
        </button>
      </div>
      <div
        className="quick-add-status"
        aria-live="polite"
        aria-atomic="true"
        role="status"
      >
        {announcement}
      </div>
    </form>
  );
}

export default QuickAdd;
export type { ParsedQuickAdd };
