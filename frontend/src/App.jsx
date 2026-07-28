import { useState, useRef } from "react";

const API_BASE = "";

const MODES = [
  { value: "summary", label: "Summary", desc: "Main ideas in a few paragraphs" },
  { value: "key_points", label: "Key Points", desc: "Bulleted list of the essentials" },
  { value: "rewrite", label: "Rewrite", desc: "Clearer, simpler version" },
];

export default function App() {
  const [inputMode, setInputMode] = useState("paste"); // "paste" | "pdf"
  const [text, setText] = useState("");
  const [fileName, setFileName] = useState("");
  const [mode, setMode] = useState("summary");

  const [stage, setStage] = useState("idle"); // idle | extracting | streaming | done | error
  const [streamedText, setStreamedText] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [charCount, setCharCount] = useState(null);

  const fileInputRef = useRef(null);

  const resetAll = () => {
    setStage("idle");
    setStreamedText("");
    setErrorMsg("");
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    setStage("extracting");
    setErrorMsg("");

    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch(`${API_BASE}/api/upload`, {
        method: "POST",
        body: formData,
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.detail || "Could not read this PDF.");
      }

      setText(data.text);
      setCharCount(data.char_count);
      setStage("idle");
    } catch (err) {
      setErrorMsg(err.message);
      setStage("error");
    }
  };

  const runAnalysis = async () => {
    if (!text.trim() || text.trim().length < 10) return;

    setStage("streaming");
    setStreamedText("");
    setErrorMsg("");

    try {
      const res = await fetch(`${API_BASE}/api/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: text.trim(), mode }),
      });

      if (!res.ok || !res.body) {
        throw new Error(`Server responded with ${res.status}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split("\n\n");
        buffer = events.pop();

        for (const evt of events) {
          const line = evt.trim();
          if (!line.startsWith("data:")) continue;
          const jsonStr = line.slice(5).trim();
          if (!jsonStr) continue;

          let parsed;
          try {
            parsed = JSON.parse(jsonStr);
          } catch {
            continue;
          }

          if (parsed.error) throw new Error(parsed.error);
          if (parsed.token) {
            setStreamedText((prev) => prev + parsed.token);
          }
          if (parsed.done) {
            setStage("done");
          }
        }
      }
    } catch (err) {
      setErrorMsg(err.message || "Something went wrong during analysis.");
      setStage("error");
    }
  };

  const isStreaming = stage === "streaming";
  const resultLines = streamedText.split("\n").filter((l) => l.trim().length > 0);

  return (
    <div className="min-h-screen bg-paper text-ink font-body">
      {/* Masthead */}
      <header className="border-b border-pencil px-6 py-5 sm:px-10">
        <div className="max-w-5xl mx-auto flex items-baseline justify-between">
          <h1 className="font-display text-2xl sm:text-3xl italic">
            The Document Analyzer
          </h1>
          <span className="font-mono text-[11px] tracking-wide text-ink/50 uppercase hidden sm:inline">
            Vibe Coding Project
          </span>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 sm:px-10 py-10 grid md:grid-cols-2 gap-8">
        {/* LEFT: the manuscript page (input) */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-display text-lg italic text-ink/80">Manuscript</h2>
            <div className="flex text-sm font-mono">
              <button
                onClick={() => setInputMode("paste")}
                className={`px-2.5 py-1 border-y border-l rounded-l-sm ${
                  inputMode === "paste"
                    ? "bg-ink text-paper border-ink"
                    : "border-pencil text-ink/60 hover:text-ink"
                }`}
              >
                paste
              </button>
              <button
                onClick={() => setInputMode("pdf")}
                className={`px-2.5 py-1 border-y border-r rounded-r-sm ${
                  inputMode === "pdf"
                    ? "bg-ink text-paper border-ink"
                    : "border-pencil text-ink/60 hover:text-ink"
                }`}
              >
                pdf
              </button>
            </div>
          </div>

          {inputMode === "pdf" && (
            <div className="mb-3">
              <button
                onClick={() => fileInputRef.current?.click()}
                className="w-full border border-dashed border-pencil rounded-sm py-4 text-sm text-ink/60 hover:border-editorred hover:text-editorred transition-colors font-mono"
              >
                {fileName ? `✓ ${fileName}` : "choose a PDF file"}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="application/pdf"
                onChange={handleFileUpload}
                className="hidden"
              />
              {stage === "extracting" && (
                <p className="text-xs font-mono text-ink/50 mt-2">extracting text…</p>
              )}
            </div>
          )}

          <div className="relative border border-pencil bg-white/40 rounded-sm">
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Paste an article, report, or notes here…"
              rows={16}
              className="w-full bg-transparent px-4 py-4 text-[15px] leading-relaxed resize-none focus:outline-none placeholder-ink/30"
            />
          </div>
          <div className="flex justify-between mt-1.5 font-mono text-[11px] text-ink/40">
            <span>{text.length} characters</span>
            {charCount !== null && <span>extracted: {charCount}</span>}
          </div>

          {/* Mode selector */}
          <div className="mt-6">
            <h3 className="font-mono text-[11px] uppercase tracking-wide text-ink/50 mb-2">
              Markup style
            </h3>
            <div className="grid grid-cols-3 gap-2">
              {MODES.map((m) => (
                <button
                  key={m.value}
                  onClick={() => setMode(m.value)}
                  className={`text-left px-3 py-2.5 rounded-sm border transition-colors ${
                    mode === m.value
                      ? "border-editorred bg-editorred/5"
                      : "border-pencil hover:border-ink/40"
                  }`}
                >
                  <div
                    className={`text-sm font-medium ${
                      mode === m.value ? "text-editorred" : "text-ink"
                    }`}
                  >
                    {m.label}
                  </div>
                  <div className="text-[11px] text-ink/50 mt-0.5 leading-snug hidden sm:block">
                    {m.desc}
                  </div>
                </button>
              ))}
            </div>
          </div>

          <button
            onClick={runAnalysis}
            disabled={!text.trim() || text.trim().length < 10 || isStreaming}
            className="mt-5 w-full py-3 rounded-sm bg-ink text-paper font-medium hover:bg-editorred disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            {isStreaming ? "Marking up…" : "Analyze"}
          </button>
        </section>

        {/* RIGHT: the red-pen markup (result) */}
        <section>
          <h2 className="font-display text-lg italic text-ink/80 mb-3">Editor's Markup</h2>

          <div className="border border-pencil rounded-sm min-h-[420px] bg-white/60 px-5 py-5">
            {stage === "idle" && !streamedText && (
              <p className="text-sm text-ink/35 italic font-display">
                Your analysis will appear here, marked up line by line.
              </p>
            )}

            {stage === "error" && (
              <div>
                <p className="text-editorred font-medium text-sm mb-1">Couldn't complete this</p>
                <p className="text-sm text-ink/60">{errorMsg}</p>
                <button
                  onClick={resetAll}
                  className="mt-4 text-xs font-mono underline text-ink/50 hover:text-ink"
                >
                  try again
                </button>
              </div>
            )}

            {(stage === "streaming" || stage === "done") && (
              <div className="result-scroll max-h-[520px] overflow-y-auto space-y-3">
                {resultLines.map((line, i) => (
                  <p key={i} className="mark-line text-[15px] leading-relaxed">
                    {line}
                  </p>
                ))}
                {isStreaming && (
                  <span className="blink-cursor text-editorred"></span>
                )}
              </div>
            )}

            {stage === "done" && (
              <button
                onClick={resetAll}
                className="mt-5 text-xs font-mono text-ink/50 hover:text-editorred underline"
              >
                clear and start a new analysis
              </button>
            )}
          </div>
        </section>
      </main>

      <footer className="text-center text-[11px] font-mono text-ink/35 py-8">
        FastAPI · Groq · React — built for the Vibe Coding Masterclass
      </footer>
    </div>
  );
}
