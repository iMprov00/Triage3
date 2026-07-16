import { motion } from "framer-motion";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "../hooks/useTheme";

type Props = {
  variant?: "fixed" | "inline" | "fab";
};

export function ThemeToggle({ variant = "fab" }: Props) {
  const { theme, toggleTheme, isDark } = useTheme();

  if (variant === "fab") {
    return (
      <motion.button
        type="button"
        onClick={toggleTheme}
        aria-label={isDark ? "Светлая тема" : "Тёмная тема"}
        title={isDark ? "Soft D — светлая" : "Aurora — тёмная"}
        initial={{ opacity: 0, scale: 0.85 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.4, duration: 0.35 }}
        whileHover={{ scale: 1.06 }}
        whileTap={{ scale: 0.94 }}
        className="theme-toggle theme-toggle--fab"
      >
        {isDark ? <Sun size={22} strokeWidth={2.2} /> : <Moon size={22} strokeWidth={2.2} />}
      </motion.button>
    );
  }

  const className =
    variant === "fixed"
      ? "theme-toggle theme-toggle--fixed"
      : "theme-toggle theme-toggle--inline";

  return (
    <motion.button
      type="button"
      onClick={toggleTheme}
      aria-label={isDark ? "Светлая тема" : "Тёмная тема"}
      title={isDark ? "Soft D — светлая" : "Aurora — тёмная"}
      initial={variant === "fixed" ? { opacity: 0, y: -16 } : false}
      animate={variant === "fixed" ? { opacity: 1, y: 0 } : undefined}
      transition={variant === "fixed" ? { delay: 0.6, duration: 0.4 } : undefined}
      whileHover={{ scale: 1.04 }}
      whileTap={{ scale: 0.96 }}
      className={className}
      style={{
        borderColor: isDark ? "rgba(74,222,128,0.25)" : "var(--dar-border)",
        background: isDark ? "rgba(15,23,42,0.85)" : "var(--dar-card)",
        boxShadow: isDark ? "0 0 24px rgba(74,222,128,0.12)" : "var(--dar-shadow-md)",
      }}
    >
      <motion.div
        className="theme-toggle-slider"
        layout
        transition={{ type: "spring", stiffness: 400, damping: 30 }}
        style={{
          left: theme === "light" ? 4 : "calc(50% + 0px)",
          background: isDark
            ? "linear-gradient(135deg, #4ade80, #22c55e)"
            : "linear-gradient(135deg, #86efac, #54c654)",
          boxShadow: isDark
            ? "0 0 16px rgba(74,222,128,0.5)"
            : "0 2px 8px rgba(84,198,84,0.35)",
        }}
      />

      <span className="theme-toggle-icon">
        <Sun
          size={17}
          className={theme === "light" ? "text-white" : ""}
          style={theme === "light" ? undefined : { color: isDark ? "#64748b" : "var(--dar-text-muted)" }}
        />
      </span>
      <span className="theme-toggle-icon">
        <Moon
          size={17}
          className={theme === "dark" ? "text-white" : ""}
          style={theme === "dark" ? undefined : { color: "var(--dar-text-muted)" }}
        />
      </span>
    </motion.button>
  );
}
