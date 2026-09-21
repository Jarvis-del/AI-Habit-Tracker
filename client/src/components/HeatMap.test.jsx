import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import HeatMap from "./HeatMap.jsx";

// 90 days ending Sunday 2026-09-20  ->  starts Tuesday 2026-06-23
const data = Array.from({ length: 90 }, (_, i) => {
  const d = new Date(Date.UTC(2026, 5, 23 + i));
  return { date: d.toISOString().slice(0, 10), count: i % 10 === 0 ? 1 : 0 };
});

describe("HeatMap", () => {
  it("renders one titled cell per day", () => {
    const { container } = render(<HeatMap data={data} />);
    expect(container.querySelectorAll("[title*='completion']")).toHaveLength(90);
  });

  it("aligns rows to real weekdays (column 1 is padded up to Tuesday)", () => {
    const { container } = render(<HeatMap data={data} />);
    const firstColumn = container.querySelectorAll(".flex.flex-col.gap-1")[1]; // [0] is the row-label column
    const cells = [...firstColumn.children].slice(1); // drop the month label
    expect(cells).toHaveLength(7);
    expect(cells.slice(0, 2).every((c) => !c.hasAttribute("title"))).toBe(true); // Sun, Mon = padding
    expect(cells[2].getAttribute("title")).toMatch(/Jun 23/); // Tue = first real day
  });

  it("uses the habit colour for completed days and a neutral track for missed ones", () => {
    const { container } = render(<HeatMap data={data} color="#ff0000" />);
    const done = container.querySelector("[title$='1 completion']");
    const missed = container.querySelector("[title$='0 completions']");
    expect(done.style.background).toMatch(/rgb\(255, 0, 0\)|#ff0000/i);
    expect(missed.style.background).toMatch(/var\(--track\)/);
  });

  it("renders nothing harmful for empty data", () => {
    const { container } = render(<HeatMap data={[]} />);
    expect(container.querySelectorAll("[title*='completion']")).toHaveLength(0);
  });
});
