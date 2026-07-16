import { motion } from "framer-motion";

export function AuroraBackground() {
  return (
    <div className="app-shell-bg pointer-events-none fixed inset-0 overflow-hidden">
      <div className="absolute inset-0 bg-[#060b14]" />
      <motion.div
        className="absolute -left-1/4 top-0 h-[70vh] w-[80vw] rounded-full opacity-40"
        style={{ background: "radial-gradient(ellipse, rgba(74,222,128,0.35), transparent 70%)" }}
        animate={{ x: [0, 80, 0], y: [0, 40, 0], scale: [1, 1.1, 1] }}
        transition={{ duration: 14, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="absolute -right-1/4 bottom-0 h-[60vh] w-[70vw] rounded-full opacity-30"
        style={{ background: "radial-gradient(ellipse, rgba(34,197,94,0.25), transparent 70%)" }}
        animate={{ x: [0, -60, 0], y: [0, -30, 0] }}
        transition={{ duration: 18, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="absolute left-1/2 top-1/3 h-px w-full -translate-x-1/2 opacity-20"
        style={{ background: "linear-gradient(90deg, transparent, #4ade80, transparent)" }}
        animate={{ scaleX: [0.5, 1.2, 0.5], opacity: [0.1, 0.35, 0.1] }}
        transition={{ duration: 8, repeat: Infinity }}
      />
      {Array.from({ length: 40 }).map((_, i) => (
        <motion.span
          key={i}
          className="absolute h-1 w-1 rounded-full bg-emerald-400/60"
          style={{ left: `${(i * 17) % 100}%`, top: `${(i * 23) % 100}%` }}
          animate={{ opacity: [0.2, 1, 0.2], scale: [0.5, 1.5, 0.5] }}
          transition={{ duration: 2 + (i % 5), repeat: Infinity, delay: i * 0.1 }}
        />
      ))}
    </div>
  );
}
