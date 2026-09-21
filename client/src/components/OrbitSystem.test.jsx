import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import OrbitSystem from "./OrbitSystem.jsx";

const habit = (i, done) => ({ _id: `h${i}`, name: `Habit ${i}`, color: "#7c3aed", streaks: { completedToday: done } });

describe("OrbitSystem", () => {
  it("shows one planet per habit and the overall percentage in the sun", () => {
    render(<OrbitSystem habits={[habit(1, true), habit(2, false), habit(3, false), habit(4, true)]} />);
    expect(screen.getAllByRole("button")).toHaveLength(4);
    expect(screen.getByText("50%")).toBeInTheDocument();
    expect(screen.getByRole("group")).toHaveAccessibleName(/2 of 4 habits done today/);
  });

  it("exposes each planet's state to assistive tech", () => {
    render(<OrbitSystem habits={[habit(1, true), habit(2, false)]} />);
    expect(screen.getByRole("button", { name: /Habit 1: done/ })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: /Habit 2: not done/ })).toHaveAttribute("aria-pressed", "false");
  });

  it("clicking or pressing Enter on a planet toggles that habit", async () => {
    const onToggle = vi.fn();
    render(<OrbitSystem habits={[habit(1, false), habit(2, false)]} onToggle={onToggle} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /Habit 1/ }));
    screen.getByRole("button", { name: /Habit 2/ }).focus();
    await user.keyboard("{Enter}");
    expect(onToggle.mock.calls.map(([h]) => h._id)).toEqual(["h1", "h2"]);
  });

  it("ignores clicks while that habit's request is in flight", async () => {
    const onToggle = vi.fn();
    render(<OrbitSystem habits={[habit(1, false)]} onToggle={onToggle} busyIds={new Set(["h1"])} />);
    await userEvent.setup().click(screen.getByRole("button", { name: /Habit 1/ }));
    expect(onToggle).not.toHaveBeenCalled();
  });

  it("caps the number of planets and says how many are hidden", () => {
    render(<OrbitSystem habits={Array.from({ length: 11 }, (_, i) => habit(i, false))} />);
    expect(screen.getAllByRole("button")).toHaveLength(8);
    expect(screen.getByText(/\+3 more habits/)).toBeInTheDocument();
  });

  it("handles zero habits (0%)", () => {
    render(<OrbitSystem habits={[]} />);
    expect(screen.getByText("0%")).toBeInTheDocument();
  });
});
