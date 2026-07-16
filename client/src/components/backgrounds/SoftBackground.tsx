import { Cloud, Heart } from "lucide-react";

function Pacifier({ size = 20, className }: { size?: number; className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      width={size}
      height={size}
      className={className}
      fill="currentColor"
      aria-hidden
    >
      <ellipse cx="16" cy="11" rx="9" ry="7" opacity="0.9" />
      <rect x="14.5" y="17" width="3" height="7" rx="1.5" />
      <circle cx="16" cy="26" r="3.5" fill="none" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

const HEARTS = [
  { left: "10%", top: "28%", size: 13, duration: 12 },
  { left: "82%", top: "35%", size: 11, duration: 14 },
  { left: "24%", top: "62%", size: 12, duration: 11 },
  { left: "68%", top: "58%", size: 14, duration: 13 },
  { left: "48%", top: "78%", size: 10, duration: 14 },
];

const PACIFIERS = [
  { left: "6%", top: "45%", size: 22, color: "#f9a8d4", duration: 17 },
  { left: "88%", top: "72%", size: 18, color: "#86efac", duration: 15 },
  { left: "58%", top: "18%", size: 20, color: "#fda4af", duration: 18 },
  { left: "32%", top: "88%", size: 16, color: "#a7f3d0", duration: 16 },
];

const CLOUDS = [
  { left: "6%", top: "10%", size: 52, duration: 20 },
  { left: "70%", top: "8%", size: 44, duration: 21 },
  { left: "40%", top: "5%", size: 38, duration: 22 },
];

export function SoftBackground() {
  return (
    <div className="app-shell-bg pointer-events-none fixed inset-0 overflow-hidden" style={{ contain: "strict" }}>
      <div className="absolute inset-0 bg-[#faf7f2]" />

      <div
        className="absolute -left-20 top-10 h-80 w-80 rounded-full opacity-50 will-change-transform"
        style={{
          background: "radial-gradient(circle, rgba(134,239,172,0.35), transparent 70%)",
          filter: "blur(28px)",
          animation: "soft-drift-a 17s linear infinite",
        }}
      />
      <div
        className="absolute -right-16 bottom-20 h-72 w-72 rounded-full opacity-40 will-change-transform"
        style={{
          background: "radial-gradient(circle, rgba(249,168,212,0.3), transparent 70%)",
          filter: "blur(28px)",
          animation: "soft-drift-b 19s linear infinite",
        }}
      />

      {CLOUDS.map((c, i) => (
        <div
          key={`cloud-${i}`}
          className="absolute will-change-transform"
          style={{
            left: c.left,
            top: c.top,
            color: "#e8d5cf",
            filter: "drop-shadow(0 2px 6px rgba(180, 150, 140, 0.12))",
            animation: `soft-float-${i % 3} ${c.duration}s ease-in-out infinite`,
          }}
        >
          <Cloud size={c.size} strokeWidth={1.4} stroke="#d4b8ae" fill="#fff5f0" fillOpacity={0.95} />
        </div>
      ))}

      {HEARTS.map((h, i) => (
        <div
          key={`heart-${i}`}
          className="absolute text-pink-300/50 will-change-transform"
          style={{
            left: h.left,
            top: h.top,
            animation: `soft-heart-${i % 5} ${h.duration}s ease-in-out infinite`,
          }}
        >
          <Heart size={h.size} fill="currentColor" strokeWidth={0} />
        </div>
      ))}

      {PACIFIERS.map((p, i) => (
        <div
          key={`pacifier-${i}`}
          className="absolute will-change-transform"
          style={{
            left: p.left,
            top: p.top,
            color: p.color,
            opacity: 0.45,
            animation: `soft-pacifier-${i % 4} ${p.duration}s ease-in-out infinite`,
          }}
        >
          <Pacifier size={p.size} />
        </div>
      ))}
    </div>
  );
}
