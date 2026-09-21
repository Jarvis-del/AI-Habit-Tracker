import http from "node:http";

/**
 * A tiny fake of the Gemini REST API so tests never touch the network or spend quota.
 * The reply depends on which feature's system prompt it receives; `setMode` simulates failures.
 */
export async function startMockGemini() {
  let mode = "ok";
  const requests = [];
  let failNext = { count: 0, code: 503 }; // the next N requests fail, then it recovers (a transient blip)
  const failModels = new Map(); // model -> HTTP code it always answers with (a saturated model)
  const hangModels = new Set(); // models that accept the request and never answer

  const server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (d) => (body += d));
    req.on("end", () => {
      const model = /models\/([^:]+):/.exec(req.url)?.[1];
      const json = body ? JSON.parse(body) : {};
      const system = json.systemInstruction?.parts?.[0]?.text || "";
      requests.push({ model, apiKey: req.headers["x-goog-api-key"], system, contents: json.contents, config: json.generationConfig });

      const fail = (code, status, message) => {
        res.statusCode = code;
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify({ error: { code, status, message } }));
      };
      if (hangModels.has(model)) return; // never respond: the client must time out by itself
      if (failNext.count > 0) {
        failNext.count--;
        return fail(failNext.code, "UNAVAILABLE", "The model is overloaded. Please try again later.");
      }
      if (failModels.has(model)) return fail(failModels.get(model), "UNAVAILABLE", "The model is overloaded. Please try again later.");
      if (mode === "quota") return fail(429, "RESOURCE_EXHAUSTED", "You exceeded your current quota");
      if (mode === "badkey") return fail(400, "INVALID_ARGUMENT", "API key not valid. Please pass a valid API key.");
      if (mode === "forbidden") return fail(403, "PERMISSION_DENIED", "Requests to this API are blocked");
      if (mode === "server_error") return fail(503, "UNAVAILABLE", "The model is overloaded");
      if (mode === "model_gone" && model === "gemini-2.5-flash") {
        return fail(404, "NOT_FOUND", "This model models/gemini-2.5-flash is no longer available. Please update to a newer model.");
      }

      let text = "Generic mock answer.";
      if (mode === "empty") text = "";
      else if (mode === "bad_json" && system.includes("habit-formation expert")) text = "sorry, I cannot do that";
      else if (system.includes("habit-formation expert")) {
        text =
          "```json\n" +
          JSON.stringify({
            suggestions: [
              { name: "10-minute walk", description: "Walk after lunch", category: "Health", suggestedTime: "1pm", whyItFits: "Fits your energy dip" },
              { name: "Read 5 pages", description: "Before bed", category: "Learning & Growth", suggestedTime: "10pm", whyItFits: "Low effort" },
              { name: "Plan tomorrow", description: "3 bullets", category: "PRODUCTIVITY", suggestedTime: "9pm", whyItFits: "Less morning stress" },
              { name: "Extra 4th one", description: "must be dropped", category: "other" },
            ],
          }) +
          "\n```";
      } else if (system.includes("morning greeting")) text = "Good morning! Your Run streak is going strong.";
      else if (system.includes("recovery coach")) text = "Let's rebuild.\n\n1. **Day 1:** two minutes.\n2. **Day 2:** five minutes.\n3. **Day 3:** normal.";
      else if (system.includes("weekly feedback report")) text = "You completed Run 1 of 7 days. Keep going next week!";
      else if (system.includes("data analyst")) text = "Answer based on data. Q=" + json.contents.at(-1).parts[0].text;

      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ candidates: [{ content: { role: "model", parts: [{ text }] }, finishReason: "STOP" }] }));
    });
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return {
    url: `http://127.0.0.1:${server.address().port}`,
    requests,
    setMode: (m) => (mode = m),
    failNext: (count, code = 503) => (failNext = { count, code }),
    failModel: (model, code = 503) => failModels.set(model, code),
    hangModel: (model) => hangModels.add(model),
    reset: () => {
      requests.length = 0;
      mode = "ok";
      failNext = { count: 0, code: 503 };
      failModels.clear();
      hangModels.clear();
    },
    close: () => new Promise((resolve) => (server.closeAllConnections?.(), server.close(resolve))),
  };
}
