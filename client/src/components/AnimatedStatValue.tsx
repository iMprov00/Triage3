import { useEffect, useRef, useState } from "react";

function easeOutCubic(t: number): number {
  return 1 - (1 - t) ** 3;
}

export function useAnimatedNumber(target: number, duration = 480): number {
  const [display, setDisplay] = useState(target);
  const fromRef = useRef(target);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (target === fromRef.current) return;

    const from = fromRef.current;
    const start = performance.now();

    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / duration);
      setDisplay(Math.round(from + (target - from) * easeOutCubic(progress)));
      if (progress < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        fromRef.current = target;
        rafRef.current = null;
      }
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, [target, duration]);

  return display;
}

type AnimatedStatValueProps = {
  value: number;
  className?: string;
  suffix?: string;
  /** Подсветка при изменении (по умолчанию — да). */
  pulse?: boolean;
};

export default function AnimatedStatValue({ value, className, suffix = "", pulse = true }: AnimatedStatValueProps) {
  const animated = useAnimatedNumber(value);
  const [flashing, setFlashing] = useState(false);
  const prevRef = useRef(value);
  const mountedRef = useRef(false);

  useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true;
      prevRef.current = value;
      return;
    }
    if (!pulse || prevRef.current === value) return;
    prevRef.current = value;
    setFlashing(true);
    const t = window.setTimeout(() => setFlashing(false), 560);
    return () => window.clearTimeout(t);
  }, [value, pulse]);

  return (
    <span className={`triage-anim-stat${flashing ? " triage-anim-stat--pulse" : ""}${className ? ` ${className}` : ""}`}>
      {animated}
      {suffix}
    </span>
  );
}
