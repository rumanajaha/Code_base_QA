import { useEffect } from "react";

export function useFocusTrap(active: boolean, selector = ".modal-backdrop [role=dialog]") {
  useEffect(() => {
    if (!active) return;
    const dialog = document.querySelector<HTMLElement>(selector);
    const previous = document.activeElement as HTMLElement | null;

    const elements = () =>
      Array.from(
        dialog?.querySelectorAll<HTMLElement>(
          'button:not(:disabled),input:not(:disabled),a[href],textarea:not(:disabled),[tabindex="0"]',
        ) || [],
      );

    elements()[0]?.focus();

    const trap = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      const list = elements();
      const first = list[0];
      const last = list[list.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };

    document.addEventListener("keydown", trap);
    return () => {
      document.removeEventListener("keydown", trap);
      previous?.focus();
    };
  }, [active, selector]);
}
