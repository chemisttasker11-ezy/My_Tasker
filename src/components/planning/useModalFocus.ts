import { useEffect, useRef } from 'react';

/** Modal keyboard lifecycle shared by planning dialogs and sheets. */
export function useModalFocus(onClose: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const node = ref.current;
    if (!node) return;
    const inerted: HTMLElement[] = [];
    let current: HTMLElement = node;
    while (current.parentElement) {
      for (const sibling of current.parentElement.children) {
        if (sibling !== current && sibling instanceof HTMLElement && !sibling.inert) {
          sibling.inert = true;
          inerted.push(sibling);
        }
      }
      current = current.parentElement;
    }
    const controls = () => Array.from(node.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex="0"]')).filter(el => el.getClientRects().length);
    (controls()[0] ?? node).focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); closeRef.current(); }
      if (event.key === 'Tab') {
        const items = controls();
        const next = event.shiftKey ? items[items.length - 1] : items[0];
        if (!node.contains(document.activeElement) || document.activeElement === (event.shiftKey ? items[0] : items[items.length - 1])) {
          event.preventDefault(); next?.focus();
        }
      }
    };
    document.addEventListener('keydown', keydown, true);
    return () => {
      document.removeEventListener('keydown', keydown, true);
      inerted.forEach(el => { el.inert = false; });
      if (opener?.isConnected) opener.focus();
    };
  }, []);
  return ref;
}
