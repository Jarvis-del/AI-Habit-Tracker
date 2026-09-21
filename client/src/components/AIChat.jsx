import { useState, useRef, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import { MessageCircle, X, Send } from "lucide-react";
import { aiService } from "../services/aiService.js";
import { getErrorMessage } from "../utils/errors.js";

const GREETING = 'Ask me anything about your habit data — e.g. "Which day am I most consistent?"';
const SUGGESTIONS = ["Which day am I most consistent?", "Which habit needs the most work?", "How did I do this past week?"];

export default function AIChat() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([{ role: "assistant", text: GREETING }]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const endRef = useRef(null);

  useEffect(() => {
    endRef.current?.scrollIntoView?.({ behavior: "smooth" });
  }, [messages, open, loading]);

  const ask = async (raw, { replaceLast = false } = {}) => {
    const question = raw.trim();
    if (!question || loading) return;

    // last few real turns (skip the greeting and error bubbles) so follow-ups work
    const base = replaceLast ? messages.slice(0, -2) : messages; // a retry must not send the failed exchange as history
    const history = base.filter((m, i) => i > 0 && !m.error).map(({ role, text }) => ({ role, text }));

    // on "Try again", replace the failed exchange instead of stacking a duplicate question
    setMessages((m) => [...(replaceLast ? m.slice(0, -2) : m), { role: "user", text: question }]);
    setInput("");
    setLoading(true);
    try {
      const { answer } = await aiService.chat(question, history);
      setMessages((m) => [...m, { role: "assistant", text: answer }]);
    } catch (err) {
      setMessages((m) => [...m, { role: "assistant", error: true, retryText: question, text: getErrorMessage(err, "Sorry, I couldn't process that just now.") }]);
    } finally {
      setLoading(false);
    }
  };

  const send = (e) => {
    e.preventDefault();
    ask(input);
  };

  return (
    <>
      {!open && (
        <button
          onClick={() => setOpen(true)}
          aria-label="Open habit data chat"
          className="fixed bottom-6 right-6 z-40 grid h-14 w-14 place-items-center rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white shadow-lg shadow-violet-500/30 transition hover:scale-105"
        >
          <MessageCircle size={22} />
        </button>
      )}

      {open && (
        <div className="glass fixed bottom-6 right-6 z-40 flex h-[28rem] max-h-[80vh] w-[22rem] max-w-[calc(100vw-2rem)] flex-col rounded-3xl p-4" role="dialog" aria-label="Ask your data">
          <div className="mb-2 flex items-center justify-between">
            <p className="flex items-center gap-2 font-display font-semibold">
              <MessageCircle size={16} className="text-violet-500" /> Ask your data
            </p>
            <button onClick={() => setOpen(false)} aria-label="Close chat" className="opacity-60 hover:opacity-100">
              <X size={18} />
            </button>
          </div>

          <div className="flex-1 space-y-3 overflow-y-auto pr-1 text-sm">
            {messages.map((m, i) => (
              <div
                key={i}
                className={`md-content max-w-[88%] rounded-2xl px-3 py-2 ${
                  m.role === "user" ? "ml-auto bg-violet-500/25" : m.error ? "bg-red-500/15 text-red-500" : "bg-[var(--track)]"
                }`}
              >
                <ReactMarkdown>{m.text}</ReactMarkdown>
                {m.error && m.retryText && i === messages.length - 1 && (
                  <button
                    onClick={() => ask(m.retryText, { replaceLast: true })}
                    disabled={loading}
                    className="mt-2 rounded-lg border border-red-400/50 px-2.5 py-1 text-xs font-medium hover:bg-red-500/10 disabled:opacity-50"
                  >
                    Try again
                  </button>
                )}
              </div>
            ))}
            {messages.length === 1 && (
              <div className="flex flex-wrap gap-2">
                {SUGGESTIONS.map((s) => (
                  <button key={s} onClick={() => ask(s)} className="rounded-full border border-[var(--field-border)] px-3 py-1 text-xs hover:bg-white/20">
                    {s}
                  </button>
                ))}
              </div>
            )}
            {loading && <div className="w-fit rounded-2xl bg-[var(--track)] px-3 py-2 opacity-70">Thinking…</div>}
            <div ref={endRef} />
          </div>

          <form onSubmit={send} className="mt-3 flex items-center gap-2">
            <input value={input} onChange={(e) => setInput(e.target.value)} maxLength={600} placeholder="Type a question…" className="field flex-1 text-sm" />
            <button type="submit" disabled={loading || !input.trim()} aria-label="Send" className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-violet-500 text-white disabled:opacity-50">
              <Send size={14} />
            </button>
          </form>
        </div>
      )}
    </>
  );
}
