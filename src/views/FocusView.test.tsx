import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { FocusView, type FocusViewProps } from './FocusView';

describe('FocusView Component', () => {
  const baseProps: FocusViewProps = {
    title: 'Prepare presentation slides',
    notes: 'Focus on clear charts and key takeaways.',
    checklist: [
      { id: 'step-1', text: 'Outline slides structure', done: true },
      { id: 'step-2', text: 'Add product metrics', done: false },
      { id: 'step-3', text: 'Review speaker notes', done: false },
    ],
    estimateMin: 25,
    onToggleItem: vi.fn(),
    onDone: vi.fn(),
    onExit: vi.fn(),
  };

  it('renders the task title large with tabIndex=-1 for autofocus', () => {
    const html = renderToStaticMarkup(<FocusView {...baseProps} />);
    expect(html).toContain('Prepare presentation slides');
    expect(html).toMatch(/<h1[^>]*tabindex="-1"[^>]*>Prepare presentation slides<\/h1>/i);
  });

  it('renders the gentle encouraging copy', () => {
    const html = renderToStaticMarkup(<FocusView {...baseProps} />);
    expect(html).toContain("One thing at a time. You&#x27;ve got this.");
  });

  it('renders notes when provided in props', () => {
    const html = renderToStaticMarkup(<FocusView {...baseProps} />);
    expect(html).toContain('Focus on clear charts and key takeaways.');
    expect(html).toContain('aria-label="Task notes"');
  });

  it('omits notes section when notes is undefined or omitted', () => {
    const { notes, ...rest } = baseProps;
    const html = renderToStaticMarkup(<FocusView {...rest} />);
    expect(html).not.toContain('aria-label="Task notes"');
    expect(html).not.toContain('focus-notes');
  });

  it('renders checklist items with accessible tick targets (≥44px target class)', () => {
    const html = renderToStaticMarkup(<FocusView {...baseProps} />);
    expect(html).toContain('Outline slides structure');
    expect(html).toContain('Add product metrics');
    expect(html).toContain('Review speaker notes');

    // First item is marked done
    expect(html).toContain('aria-checked="true"');
    // Second & third are not done
    expect(html).toContain('aria-checked="false"');

    // Big tick target class
    expect(html).toContain('focus-check-target');
  });

  it('handles empty checklist without crashing or rendering empty checklist section', () => {
    const html = renderToStaticMarkup(<FocusView {...baseProps} checklist={[]} />);
    expect(html).toContain('Prepare presentation slides');
    expect(html).not.toContain('focus-checklist-section');
  });

  it('renders Done as primary cobalt button and Not now as exit button', () => {
    const html = renderToStaticMarkup(<FocusView {...baseProps} />);
    expect(html).toContain('Done');
    expect(html).toContain('Not now');
    expect(html).toContain('focus-btn-primary');
    expect(html).toContain('focus-btn-exit');
  });

  it('keeps the timer display hidden until Start (optional timer)', () => {
    const html = renderToStaticMarkup(<FocusView {...baseProps} />);
    // Initial unstarted state has prompt and Start button
    expect(html).toContain('Optional timer');
    expect(html).toContain('Start');

    // Active timer controls (+5 min, Pause, progressbar) are hidden until Start
    expect(html).not.toContain('+5 min');
    expect(html).not.toContain('role="progressbar"');
    expect(html).not.toContain('Pause');
  });
});
