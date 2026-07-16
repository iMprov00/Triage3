import { AnimatePresence } from "framer-motion";
import type { ReactNode } from "react";
import { useTheme } from "../hooks/useTheme";
import { AuroraBackground } from "./backgrounds/AuroraBackground";
import { SoftBackground } from "./backgrounds/SoftBackground";
import { ThemeToggle } from "./ThemeToggle";

type Props = {
  children: ReactNode;
};

export function AppShell({ children }: Props) {
  const { isDark } = useTheme();

  return (
    <div className="app-shell">
      <AnimatePresence mode="wait">
        {isDark ? <AuroraBackground key="aurora" /> : <SoftBackground key="soft" />}
      </AnimatePresence>
      <ThemeToggle variant="fab" />
      <div className="app-shell-content">{children}</div>
    </div>
  );
}
