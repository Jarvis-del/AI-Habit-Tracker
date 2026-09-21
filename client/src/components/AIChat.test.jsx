import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import AIChat from "./AIChat.jsx";

const chat = vi.fn();
vi.mock("../services/aiService.js", () => ({ aiService: { chat: (...a) => chat(...a) } }));

const open = async () => {
  render(<AIChat />);
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: /open habit data chat/i }));
  return user;
};

beforeEach(() => {
  chat.mockClear();
});

describe("AIChat", () => {
  it("opens as a floating dialog with a greeting and suggested questions", async () => {
    await open();
    expect(screen.getByRole("dialog", { name: /ask your data/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Which day am I most consistent?" })).toBeInTheDocument();
  });

  it("sends a typed question and renders the (markdown) answer", async () => {
    chat.mockResolvedValue({ answer: "You are best on **Tuesdays**." });
    const user = await open();
    await user.type(screen.getByPlaceholderText("Type a question…"), "best day?");
    await user.click(screen.getByRole("button", { name: "Send" }));
    expect(chat).toHaveBeenCalledWith("best day?", []);
    expect(await screen.findByText("Tuesdays")).toHaveProperty("tagName", "STRONG");
  });

  it("clicking a suggestion asks it immediately", async () => {
    chat.mockResolvedValue({ answer: "ok" });
    const user = await open();
    await user.click(screen.getByRole("button", { name: "How did I do this past week?" }));
    expect(chat).toHaveBeenCalledWith("How did I do this past week?", []);
  });

  it("sends earlier turns as history for follow-up questions", async () => {
    chat.mockResolvedValue({ answer: "first answer" });
    const user = await open();
    await user.type(screen.getByPlaceholderText("Type a question…"), "one");
    await user.click(screen.getByRole("button", { name: "Send" }));
    await screen.findByText("first answer");
    await user.type(screen.getByPlaceholderText("Type a question…"), "two");
    await user.click(screen.getByRole("button", { name: "Send" }));
    expect(chat).toHaveBeenLastCalledWith("two", [{ role: "user", text: "one" }, { role: "assistant", text: "first answer" }]);
  });

  it("shows the REAL error (regression: it used to say 'Sorry, I couldn't process that' for everything)", async () => {
    chat.mockRejectedValue({ response: { status: 429, data: { message: "Gemini's rate/quota limit was reached" } } });
    const user = await open();
    await user.type(screen.getByPlaceholderText("Type a question…"), "hi");
    await user.click(screen.getByRole("button", { name: "Send" }));
    expect(await screen.findByText(/rate\/quota limit was reached/)).toBeInTheDocument();
  });

  it("does not send empty messages", async () => {
    const user = await open();
    expect(screen.getByRole("button", { name: "Send" })).toBeDisabled();
    await user.type(screen.getByPlaceholderText("Type a question…"), "   ");
    expect(screen.getByRole("button", { name: "Send" })).toBeDisabled();
  });

  it("offers 'Try again' on a failed answer and re-asks the same question without duplicating it", async () => {
    chat.mockRejectedValueOnce({ response: { status: 502, data: { message: "Gemini is temporarily unavailable (HTTP 503: The model is overloaded)" } } });
    chat.mockResolvedValueOnce({ answer: "It worked the second time." });
    const user = await open();
    await user.type(screen.getByPlaceholderText("Type a question…"), "best day?");
    await user.click(screen.getByRole("button", { name: "Send" }));
    expect(await screen.findByText(/model is overloaded/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("It worked the second time.")).toBeInTheDocument();
    expect(chat).toHaveBeenCalledTimes(2);
    expect(chat).toHaveBeenLastCalledWith("best day?", []); // failed exchange is not sent as history
    expect(screen.getAllByText("best day?")).toHaveLength(1); // question shown once
    expect(screen.queryByText(/model is overloaded/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Try again" })).not.toBeInTheDocument();
  });
});
