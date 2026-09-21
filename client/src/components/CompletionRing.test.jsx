import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import CompletionRing from "./CompletionRing.jsx";

const offsetOf = (container) => {
  const circles = container.querySelectorAll("circle");
  return { offset: parseFloat(circles[1].getAttribute("stroke-dashoffset")), total: parseFloat(circles[1].getAttribute("stroke-dasharray")) };
};

describe("CompletionRing", () => {
  it("fills proportionally to the value", () => {
    const { container } = render(<CompletionRing value={0.25} />);
    const { offset, total } = offsetOf(container);
    expect(offset / total).toBeCloseTo(0.75, 2);
  });

  it("clamps out-of-range and invalid values", () => {
    expect(offsetOf(render(<CompletionRing value={5} />).container).offset).toBeCloseTo(0);
    const low = offsetOf(render(<CompletionRing value={-3} />).container);
    expect(low.offset).toBeCloseTo(low.total);
    const nan = offsetOf(render(<CompletionRing value={NaN} />).container);
    expect(nan.offset).toBeCloseTo(nan.total);
  });

  it("is accessible: exposes its progress as an image label", () => {
    render(<CompletionRing value={0.5} label="3 of 6 days this week" />);
    expect(screen.getByRole("img", { name: "3 of 6 days this week" })).toBeInTheDocument();
  });

  it("renders children in the centre", () => {
    render(<CompletionRing value={1}><button>tick</button></CompletionRing>);
    expect(screen.getByRole("button", { name: "tick" })).toBeInTheDocument();
  });
});
