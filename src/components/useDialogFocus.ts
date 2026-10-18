import { useEffect, useRef, type RefObject } from 'react';

export function useDialogFocus(
  ref: RefObject<HTMLElement | null>,
  onClose: () => void,
  active = true,
) {
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    if (!active) return;
    const previous = document.activeElement as HTMLElement | null;
    const root = ref.current;
    if (!root) return;
    const selector =
      'button:not(:disabled),input:not(:disabled),textarea:not(:disabled),select:not(:disabled),[tabindex="0"]';
    const controls = () =>
      [...root.querySelectorAll<HTMLElement>(selector)].filter(
        (item) => item.getClientRects().length > 0,
      );
    controls()[0]?.focus();
    const handle = (event: KeyboardEvent) => {
      const dialogs = [...document.querySelectorAll('[aria-modal="true"],dialog[open]')];
      if (dialogs[dialogs.length - 1] !== root) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        close.current();
      }
      if (event.key !== 'Tab') return;
      const items = controls();
      const first = items[0],
        last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      }
      if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener('keydown', handle);
    return () => {
      document.removeEventListener('keydown', handle);
      if (previous?.isConnected) previous.focus();
    };
  }, [ref, active]);
}
