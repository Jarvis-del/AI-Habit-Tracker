import { useId } from "react";

const SIZE = 320;
const C = SIZE / 2;
const MAX_PLANETS = 8;

/**
 * "Habit solar system": the sun is today's overall completion (with a progress ring), and every
 * habit is a planet orbiting it. A planet glows in its habit colour once it's done today.
 * Click (or press Enter on) a planet to check that habit off. Motion pauses on hover so the
 * planets are easy to hit, and is disabled for prefers-reduced-motion.
 */
export default function OrbitSystem({ habits, onToggle, busyIds = new Set() }) {
  const gid = useId().replace(/:/g, "");
  const shown = habits.slice(0, MAX_PLANETS);
  const done = habits.filter((h) => h.streaks?.completedToday).length;
  const total = habits.length;
  const pct = total ? done / total : 0;

  const sunR = 32;
  const ringR = 43;
  const ringC = 2 * Math.PI * ringR;

  return (
    <div className="w-full max-w-[290px] shrink-0">
      <svg
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        className="orbit-svg block h-auto w-full overflow-visible"
        role="group"
        aria-label={`Habit solar system: ${done} of ${total} habits done today`}
      >
        <defs>
          <radialGradient id={`sun-${gid}`} cx="50%" cy="45%" r="60%">
            <stop offset="0%" stopColor="#fde68a" />
            <stop offset="55%" stopColor="#fb923c" />
            <stop offset="100%" stopColor="#c026d3" />
          </radialGradient>
          <radialGradient id={`glow-${gid}`}>
            <stop offset="0%" stopColor="#fbbf24" stopOpacity="0.55" />
            <stop offset="100%" stopColor="#fbbf24" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* orbit paths */}
        {shown.map((h, i) => (
          <circle
            key={`path-${h._id}`}
            cx={C}
            cy={C}
            r={66 + i * 11}
            fill="none"
            stroke="var(--track)"
            strokeWidth="1"
            strokeDasharray="2 4"
          />
        ))}

        {/* sun glow + progress ring */}
        <circle cx={C} cy={C} r={62} fill={`url(#glow-${gid})`} opacity={0.4 + pct * 0.6} />
        <circle cx={C} cy={C} r={ringR} fill="none" stroke="var(--track)" strokeWidth="5" />
        <circle
          className="ring-progress"
          cx={C}
          cy={C}
          r={ringR}
          fill="none"
          stroke="#f59e0b"
          strokeWidth="5"
          strokeLinecap="round"
          strokeDasharray={ringC}
          strokeDashoffset={ringC * (1 - pct)}
          transform={`rotate(-90 ${C} ${C})`}
        />
        <circle className="sun-pulse" cx={C} cy={C} r={sunR} fill={`url(#sun-${gid})`} />
        <text x={C} y={C + 3} textAnchor="middle" fontSize="17" fontWeight="700" fill="#fff" style={{ fontFamily: "Outfit, sans-serif" }}>
          {Math.round(pct * 100)}%
        </text>
        <text x={C} y={C + 17} textAnchor="middle" fontSize="8" fontWeight="600" fill="#fff" opacity="0.85">
          TODAY
        </text>

        {/* planets */}
        {shown.map((h, i) => {
          const radius = 66 + i * 11;
          const angle = ((i * 137.5) % 360) * (Math.PI / 180); // golden-angle spread
          const cx = C + radius * Math.cos(angle);
          const cy = C + radius * Math.sin(angle);
          const isDone = !!h.streaks?.completedToday;
          const busy = busyIds.has(h._id);
          return (
            <g key={h._id} className="orbit-spin" style={{ "--orbit-dur": `${18 + i * 7}s`, animationDirection: i % 2 ? "reverse" : "normal" }}>
              <g
                role="button"
                tabIndex={0}
                aria-label={`${h.name}: ${isDone ? "done" : "not done"} today. Activate to toggle.`}
                aria-pressed={isDone}
                onClick={() => !busy && onToggle?.(h)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    if (!busy) onToggle?.(h);
                  }
                }}
                style={{ color: h.color, opacity: busy ? 0.5 : 1 }}
              >
                <title>{`${h.name} — ${isDone ? "done ✓" : "click to complete"}`}</title>
                <circle className="planet" cx={cx} cy={cy} r={isDone ? 8 : 7} fill={isDone ? h.color : "var(--glass-bg)"} stroke={h.color} strokeWidth="2.2" />
                {isDone && <circle cx={cx} cy={cy} r={12} fill="none" stroke={h.color} strokeOpacity="0.35" strokeWidth="1.5" />}
              </g>
            </g>
          );
        })}
      </svg>
      {habits.length > MAX_PLANETS && (
        <p className="mt-1 text-center text-xs opacity-60">+{habits.length - MAX_PLANETS} more habits below</p>
      )}
    </div>
  );
}
