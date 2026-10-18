// The hero terminal is a tiny interactive shell once the intro transcript has
// finished playing. Click it and type `help`. Commands are deliberately
// playful: nothing here touches the network or evaluates arbitrary code.
(function () {
  "use strict";

  const terminal = document.getElementById("terminal-lines");
  const card = terminal && terminal.closest(".terminal");
  if (!terminal || !card) return;

  const MAX_LINES = 60;
  const MAX_INPUT = 200;
  const MAX_HISTORY = 50;
  const SECTIONS = ["experience", "projects", "courses", "publications", "leadership", "volunteer", "fun", "contact"];
  const INTERESTS = '[ "STEM Learning", "Robotics", "Bioinformatics" ]';
  const SAFE_MATH = /^[\d\s+\-*/%().]+$/;
  const PRINT_CALL = /^print\s*\((.*)\)\s*;?$/s;

  const styled = function (kind, text) { return { text: text, kind: kind }; };
  const err = styled.bind(null, "t-err");
  const dim = styled.bind(null, "t-dim");
  const ok = styled.bind(null, "t-ok");

  const history = [];
  let historyIndex = 0;
  let liveLine = null;
  let typed = null;
  let cursor = null;
  let input = null;

  // ── Output helpers ────────────────────────────────────────────────────────
  function addLine(text, kind) {
    const line = document.createElement("span");
    line.className = "t-line is-shown t-out" + (kind ? " " + kind : "");
    line.textContent = text;
    terminal.insertBefore(line, liveLine);
    terminal.insertBefore(document.createTextNode("\n"), liveLine);
  }

  function echoCommand(text) {
    const line = document.createElement("span");
    line.className = "t-line is-shown";
    line.innerHTML = '<span class="t-prompt">~ $</span> <span class="t-cmd"></span>';
    line.querySelector(".t-cmd").textContent = text;
    terminal.insertBefore(line, liveLine);
    terminal.insertBefore(document.createTextNode("\n"), liveLine);
  }

  function trimScrollback() {
    const lines = terminal.querySelectorAll(".t-line");
    for (let i = 0; i < lines.length - MAX_LINES; i += 1) {
      const next = lines[i].nextSibling;
      if (next && next.nodeType === Node.TEXT_NODE) next.remove();
      lines[i].remove();
    }
  }

  function scrollToBottom() {
    const body = card.querySelector(".terminal__body");
    body.scrollTop = body.scrollHeight;
  }

  // ── Commands ──────────────────────────────────────────────────────────────
  function stripQuotes(value) {
    const v = value.trim();
    const quoted = (v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"));
    return quoted && v.length >= 2 ? v.slice(1, -1) : null;
  }

  function evalMath(expr) {
    if (!SAFE_MATH.test(expr) || !/\d/.test(expr)) return null;
    try {
      // Only digits, whitespace and arithmetic operators survive SAFE_MATH,
      // so this cannot reach any identifier or call.
      const value = Function('"use strict"; return (' + expr + ");")();
      return Number.isFinite(value) ? String(value) : "nan";
    } catch (_) {
      return null;
    }
  }

  function pythonPrint(argText) {
    const args = argText.trim() === "" ? [] : splitArgs(argText);
    const parts = args.map(function (arg) {
      const literal = stripQuotes(arg);
      if (literal !== null) return literal;
      const number = evalMath(arg);
      if (number !== null) return number;
      throw new Error("NameError: name '" + arg.trim() + "' is not defined");
    });
    return parts.join(" ");
  }

  function splitArgs(text) {
    const out = [];
    let depth = 0, quote = null, current = "";
    for (const ch of text) {
      if (quote) { current += ch; if (ch === quote) quote = null; continue; }
      if (ch === '"' || ch === "'") { quote = ch; current += ch; continue; }
      if (ch === "(") depth += 1;
      if (ch === ")") depth -= 1;
      if (ch === "," && depth === 0) { out.push(current); current = ""; continue; }
      current += ch;
    }
    out.push(current);
    return out;
  }

  function goTo(section) {
    const target = document.getElementById(section);
    if (!target) return [err("cd: no such section: " + section + "  (try `ls`)")];
    target.scrollIntoView({ behavior: "smooth", block: "start" });
    return ["→ " + section];
  }

  const COMMANDS = {
    help: function () {
      return [
        "commands:",
        "  help · whoami · ls · cat <file> · ./status · date · clear",
        "  cd <section>   jump to a section (try `cd projects`)",
        "  print(\"hi\")    python-style print; math works too: print(6 * 7)",
        "  echo <text>    say it back",
      ];
    },
    whoami: function () { return ["Ariel · builder · learner"]; },
    ls: function () { return ["interests.txt  status*  " + SECTIONS.join("/  ") + "/"]; },
    cat: function (arg) {
      if (arg === "interests.txt") return [INTERESTS];
      return [err("cat: " + (arg || "") + ": No such file or directory")];
    },
    "./status": function () { return [ok("✓ currently working on lung cancer research")]; },
    status: function () { return COMMANDS["./status"](); },
    date: function () { return [new Date().toString()]; },
    echo: function (arg) { return [arg]; },
    cd: function (arg) { return goTo((arg || "").replace(/\/$/, "")); },
    open: function (arg) { return goTo((arg || "").replace(/\/$/, "")); },
    clear: function () {
      Array.from(terminal.childNodes).forEach(function (n) {
        if (n !== liveLine) n.remove();
      });
      return [];
    },
    pwd: function () { return ["/Users/ariel/portfolio"]; },
    sudo: function () { return [dim("Nice try. This portfolio runs on trust.")]; },
    exit: function () { return [dim("There's no escape. Try scrolling instead.")]; },
    hi: function () { return ["hi! 👋  type `help` to look around"]; },
    hello: function () { return COMMANDS.hi(); },
  };

  function run(raw) {
    const text = raw.trim();
    if (!text) return;
    echoCommand(text);
    const printMatch = text.match(PRINT_CALL);
    try {
      if (printMatch) { addLine(pythonPrint(printMatch[1])); return; }
      const math = evalMath(text);
      if (math !== null) { addLine(math); return; }
      const [name, ...rest] = text.split(/\s+/);
      const handler = COMMANDS[name.toLowerCase()];
      if (!handler) { addLine("zsh: command not found: " + name + "  (try `help`)", "t-err"); return; }
      handler(rest.join(" ")).forEach(function (line) {
        if (typeof line === "string") addLine(line); else addLine(line.text, line.kind);
      });
    } catch (err) {
      addLine(String(err.message || err), "t-err");
    }
  }

  // ── Input wiring ──────────────────────────────────────────────────────────
  function submit() {
    const value = input.value.slice(0, MAX_INPUT);
    input.value = "";
    typed.textContent = "";
    if (value.trim()) {
      history.push(value);
      if (history.length > MAX_HISTORY) history.shift();
    }
    historyIndex = history.length;
    run(value);
    trimScrollback();
    scrollToBottom();
  }

  function recall(step) {
    if (!history.length) return;
    historyIndex = Math.max(0, Math.min(history.length, historyIndex + step));
    input.value = history[historyIndex] || "";
    typed.textContent = input.value;
  }

  function activate() {
    liveLine = terminal.querySelector(".t-line:last-child") || terminal.lastElementChild;
    cursor = liveLine.querySelector(".t-cursor");
    typed = document.createElement("span");
    typed.className = "t-typed";
    liveLine.insertBefore(typed, cursor);

    input = document.createElement("input");
    input.className = "t-input";
    input.setAttribute("aria-label", "Terminal command");
    input.setAttribute("autocomplete", "off");
    input.setAttribute("autocapitalize", "off");
    input.setAttribute("spellcheck", "false");
    input.maxLength = MAX_INPUT;
    card.appendChild(input);
    card.classList.add("is-live");

    input.addEventListener("input", function () { typed.textContent = input.value; });
    input.addEventListener("keydown", function (e) {
      if (e.key === "Enter") { e.preventDefault(); submit(); }
      else if (e.key === "ArrowUp") { e.preventDefault(); recall(-1); }
      else if (e.key === "ArrowDown") { e.preventDefault(); recall(1); }
      else if (e.key === "l" && e.ctrlKey) { e.preventDefault(); input.value = "clear"; submit(); }
    });
    card.addEventListener("click", function (e) {
      if (window.getSelection().toString()) return;   // let people copy text
      if (!e.target.closest("a")) input.focus();
    });
  }

  if (terminal.dataset.ready === "1") activate();
  else document.addEventListener("terminal-ready", activate, { once: true });
})();
