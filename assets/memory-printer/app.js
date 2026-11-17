const defaultQuestions = [
  {
    text: "Describe a fond memory. Where were you? Who were you with?",
    helper: "Name the place in your own way: a room, a street, a season, a kind of light."
  },
  {
    text: "What detail do you remember most clearly?",
    helper: "A sleeve, a cup, wallpaper, weather, a sound, a smell, a gesture."
  },
  {
    text: "If you look around inside the memory, what else is there?",
    helper: "Light, furniture, weather, clothing, shadows, hands, a doorway, a table, a street corner."
  },
];

let questions = defaultQuestions.map(q => ({ ...q }));

const state = {
  step: 0,
  answers: questions.map((question) => question.type === "multi" ? [] : "")
};

const questionText = document.querySelector("#questionText");
const answerForm = document.querySelector("#answerForm");
const answerInput = document.querySelector("#answerInput");
const feelingOptions = document.querySelector("#feelingOptions");
const backButton = document.querySelector("#backButton");
const nextButton = document.querySelector("#nextButton");
const resultPanel = document.querySelector("#resultPanel");
const generationState = document.querySelector("#generationState");
const instructionKicker = document.querySelector("#instructionKicker");
const instructionText = document.querySelector("#instructionText");
const instructionHelper = document.querySelector("#instructionHelper");
const einkPreview = document.querySelector("#einkPreview");
const einkImage = document.querySelector("#einkImage");
const saveLink = document.querySelector("#saveLink");

const memoryProgress = document.querySelector("#memoryProgress");
const progressFill = document.querySelector("#progressFill");
const progressLabel = document.querySelector("#progressLabel");
const resetButton = document.querySelector("#resetButton");
const interview = document.querySelector(".interview");
const voiceInput = document.querySelector("#voiceInput");
const micButton = document.querySelector("#micButton");
const micLabel = document.querySelector("#micLabel");
const transcript = document.querySelector("#transcript");
const typeToggle = document.querySelector("#typeToggle");

const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
const recognition = SpeechRecognition ? new SpeechRecognition() : null;
let isTypingMode = true;
let savedTranscript = "";

if (recognition) {
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.lang = "en-US";

  let isListening = false;
  let isHeld = false;

  const setIdle = () => {
    isListening = false;
    micButton.classList.remove("listening");
    micLabel.textContent = transcript.textContent ? "Hold to add more" : "Hold to speak";
  };

  recognition.onstart = () => {
    isListening = true;
    micButton.classList.add("listening");
    micLabel.textContent = "Release to stop";
  };

  recognition.onresult = (event) => {
    const current = Array.from(event.results).map(r => r[0].transcript).join("");
    const full = savedTranscript ? `${savedTranscript} ${current}` : current;
    transcript.textContent = full;
    answerInput.value = full;
  };

  recognition.onend = () => {
    isListening = false;
    if (isHeld) {
      try { recognition.start(); } catch {}
    } else {
      setIdle();
    }
  };

  recognition.onerror = () => {
    isListening = false;
    if (!isHeld) setIdle();
  };

  const startListening = () => {
    isHeld = true;
    if (isListening) return;
    savedTranscript = transcript.textContent.trim();
    try { recognition.start(); } catch {}
  };

  const stopListening = () => {
    isHeld = false;
    if (!isListening) return;
    recognition.stop();
  };

  micButton.addEventListener("mousedown", startListening);
  micButton.addEventListener("touchstart", (e) => { e.preventDefault(); startListening(); });
  micButton.addEventListener("mouseup", stopListening);
  micButton.addEventListener("mouseleave", stopListening);
  micButton.addEventListener("touchend", stopListening);
} else {
  micButton.hidden = true;
  typeToggle.hidden = true;
}

renderQuestion();

typeToggle.addEventListener("click", () => {
  isTypingMode = !isTypingMode;
  if (recognition && micButton.classList.contains("listening")) recognition.stop();
  voiceInput.hidden = isTypingMode;
  answerInput.hidden = !isTypingMode;
  typeToggle.textContent = isTypingMode ? "speak instead" : "type instead";
  if (!isTypingMode) answerInput.value = transcript.textContent;
  if (isTypingMode) { answerInput.value = transcript.textContent; answerInput.focus(); }
});

function resetVoiceState() {
  if (recognition && micButton.classList.contains("listening")) recognition.stop();
  transcript.textContent = "";
  savedTranscript = "";
  isTypingMode = true;
  voiceInput.hidden = true;
  answerInput.hidden = false;
  typeToggle.hidden = false;
  typeToggle.textContent = "speak instead";
  micLabel.textContent = "hold to speak";
  micButton.classList.remove("listening");
}

function renderQuestion() {
  const question = questions[state.step];
  const isMulti = question.type === "multi";
  questionText.textContent = question.text;
  feelingOptions.hidden = !isMulti;
  backButton.disabled = state.step === 0;
  nextButton.textContent = state.step === questions.length - 1 ? "make it →" : "next →";

  if (isMulti) {
    voiceInput.hidden = true;
    answerInput.hidden = true;
    renderFeelingOptions(question);
  } else {
    resetVoiceState();
    answerInput.value = state.answers[state.step];
    if (state.answers[state.step]) transcript.textContent = state.answers[state.step];
  }
}

function renderFeelingOptions(question) {
  const selected = state.answers[state.step];
  const selectedCount = selected.length;
  feelingOptions.innerHTML = `<legend>Choose up to ${question.maxChoices}</legend>`;

  question.options.forEach((option) => {
    const label = document.createElement("label");
    label.className = "feeling-choice";

    const input = document.createElement("input");
    input.type = "checkbox";
    input.name = "feeling";
    input.value = option;
    input.checked = selected.includes(option);
    input.disabled = !input.checked && selectedCount >= question.maxChoices;

    const span = document.createElement("span");
    span.textContent = option;

    label.append(input, span);
    feelingOptions.append(label);
  });
}

function collectPayload() {
  return {
    answers: questions.map((question, index) => ({
      question: question.text,
      answer: Array.isArray(state.answers[index]) ? state.answers[index].join(", ") : state.answers[index].trim()
    }))
  };
}

const POETIC_LABELS = [
  "gathering light...",
  "finding the edges...",
  "developing...",
  "surfacing...",
  "almost there...",
  "one more moment...",
];

function startProgressBar(durationMs) {
  memoryProgress.hidden = false;
  progressFill.style.width = "0%";
  progressLabel.textContent = POETIC_LABELS[0];

  const start = Date.now();
  const labelInterval = durationMs / POETIC_LABELS.length;
  let labelIndex = 0;
  let raf;

  function tick() {
    const elapsed = Date.now() - start;
    const pct = Math.min(100, (elapsed / durationMs) * 100);
    progressFill.style.width = pct + "%";

    const newIndex = Math.min(POETIC_LABELS.length - 1, Math.floor(elapsed / labelInterval));
    if (newIndex !== labelIndex) {
      labelIndex = newIndex;
      progressLabel.textContent = POETIC_LABELS[labelIndex];
    }

    if (elapsed < durationMs) {
      raf = requestAnimationFrame(tick);
    }
  }
  raf = requestAnimationFrame(tick);
  return () => { cancelAnimationFrame(raf); memoryProgress.hidden = true; };
}

async function generateMemory() {
  interview.hidden = true;
  resultPanel.hidden = false;
  generationState.textContent = "Creating your memory";
  instructionKicker.textContent = "one moment";
  instructionText.innerHTML = "Creating<br>your memory...";
  instructionHelper.textContent = "";
  saveLink.hidden = true;
  einkPreview.hidden = true;

  const stopProgress = startProgressBar(35000);

  try {
    const response = await fetch("/api/memory-printer/memories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(collectPayload())
    });

    const result = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(result?.detail || result?.error || "The memory could not be made yet.");
    }

    stopProgress();

    generationState.textContent = "ready";
    instructionKicker.textContent = "your memory is ready";
    instructionText.innerHTML = "Here it is.";
    instructionHelper.textContent = "";
    if (result.imageUrl) {
      einkImage.src = result.imageUrl;
      einkPreview.hidden = false;
      saveLink.href = result.imageUrl;
      saveLink.hidden = false;
    }
  } catch (error) {
    stopProgress();
    generationState.textContent = "Something went wrong";
    instructionKicker.textContent = "";
    instructionText.innerHTML = "";
    instructionHelper.textContent = error?.message || "We couldn't make your memory this time. You can try again or begin a new one.";
  }
}

answerForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const question = questions[state.step];

  if (question.type === "multi") {
    const selected = Array.from(feelingOptions.querySelectorAll("input:checked")).map((input) => input.value);
    if (selected.length === 0) return;
    state.answers[state.step] = selected;
  } else {
    state.answers[state.step] = answerInput.value.trim();
  }

  if (state.step < questions.length - 1) {
    state.step += 1;
    const next = questions[state.step];

    if (next.type !== "multi") {
      nextButton.disabled = true;
      const answeredSoFar = questions.slice(0, state.step).map((q, i) => ({
        question: q.text,
        answer: Array.isArray(state.answers[i]) ? state.answers[i].join(", ") : state.answers[i]
      }));

      try {
        const res = await fetch("/api/memory-printer/next-question", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ answers: answeredSoFar, nextQuestion: next.text })
        });
        const data = await res.json();
        if (data.question === null) {
          state.step += 1;
        } else if (data.question) {
          questions[state.step] = { ...next, text: data.question };
        }
      } catch {
        // fall through to default question
      } finally {
        nextButton.disabled = false;
      }
    }

    renderQuestion();
    return;
  }

  generateMemory();
});

backButton.addEventListener("click", () => {
  const question = questions[state.step];
  if (question.type === "multi") {
    state.answers[state.step] = Array.from(feelingOptions.querySelectorAll("input:checked")).map((input) => input.value);
  } else {
    state.answers[state.step] = answerInput.value.trim();
  }
  state.step = Math.max(0, state.step - 1);
  renderQuestion();
});

resetButton.addEventListener("click", () => {
  state.step = 0;
  state.answers = questions.map((question) => question.type === "multi" ? [] : "");
  questions = defaultQuestions.map(q => ({ ...q }));
  resultPanel.hidden = true;
  einkPreview.hidden = true;
  einkImage.removeAttribute("src");
  saveLink.hidden = true;
  saveLink.removeAttribute("href");
  interview.hidden = false;
  renderQuestion();
});

feelingOptions.addEventListener("change", () => {
  const question = questions[state.step];
  if (question.type !== "multi") return;
  state.answers[state.step] = Array.from(feelingOptions.querySelectorAll("input:checked")).map((input) => input.value);
  renderFeelingOptions(question);
});


// Animated mesh gradient background
(function () {
  const blobs = [
    { color: '95,100%,74%', ox: 0.40, oy: 0.20, fx: 0.00028, fy: 0.00021, phase: 0.0, amp: 0.38 },
    { color: '120,36%,43%', ox: 0.80, oy: 0.05, fx: 0.00019, fy: 0.00030, phase: 1.3, amp: 0.40 },
    { color: '193,100%,74%',ox: 0.05, oy: 0.50, fx: 0.00035, fy: 0.00017, phase: 2.6, amp: 0.36 },
    { color: '127,64%,71%', ox: 0.75, oy: 0.55, fx: 0.00024, fy: 0.00027, phase: 0.8, amp: 0.38 },
    { color: '130,0%,100%', ox: 0.05, oy: 0.90, fx: 0.00015, fy: 0.00023, phase: 4.1, amp: 0.42 },
    { color: '128,87%,85%', ox: 0.75, oy: 0.90, fx: 0.00029, fy: 0.00020, phase: 3.5, amp: 0.37 },
    { color: '95,59%,83%',  ox: 0.05, oy: 0.05, fx: 0.00022, fy: 0.00028, phase: 5.2, amp: 0.39 },
  ];

  let t = 0;

  function tick() {
    t++;
    const stops = blobs.map(b => {
      const x = ((b.ox + Math.sin(t * b.fx * 60 + b.phase) * b.amp) * 100).toFixed(1);
      const y = ((b.oy + Math.cos(t * b.fy * 47 + b.phase + 1) * b.amp) * 100).toFixed(1);
      return `radial-gradient(at ${x}% ${y}%, hsla(${b.color},1) 0px, transparent 50%)`;
    });
    document.body.style.backgroundImage = stops.join(',');
    requestAnimationFrame(tick);
  }
  tick();
})();

// Cursor sparkle effect
(function () {
  const canvas = document.createElement("canvas");
  canvas.style.cssText = "position:fixed;inset:0;pointer-events:none;z-index:9999;";
  document.body.appendChild(canvas);
  const ctx = canvas.getContext("2d");

  function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }
  resize();
  window.addEventListener("resize", resize);

  // Glow palette: warm cream, sage, pale gold, soft white, light green
  const palette = [
    [240, 235, 200],
    [180, 220, 150],
    [255, 248, 220],
    [200, 230, 175],
    [220, 240, 200],
  ];

  const sparkles = [];
  let prevX = -999, prevY = -999;

  window.addEventListener("mousemove", (e) => {
    const dx = e.clientX - prevX, dy = e.clientY - prevY;
    if (dx * dx + dy * dy < 64) return;
    prevX = e.clientX;
    prevY = e.clientY;

    const n = Math.random() < 0.35 ? 2 : 1;
    for (let i = 0; i < n; i++) {
      const c = palette[Math.floor(Math.random() * palette.length)];
      sparkles.push({
        x: e.clientX + (Math.random() - 0.5) * 28,
        y: e.clientY + (Math.random() - 0.5) * 28,
        r: 7 + Math.random() * 10,
        life: 0.75 + Math.random() * 0.25,
        decay: 0.014 + Math.random() * 0.014,
        vx: (Math.random() - 0.5) * 0.7,
        vy: -0.5 - Math.random() * 0.7,
        color: c,
      });
    }
  });

  function tick() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (let i = sparkles.length - 1; i >= 0; i--) {
      const s = sparkles[i];
      s.life -= s.decay;
      if (s.life <= 0) { sparkles.splice(i, 1); continue; }
      s.x += s.vx;
      s.y += s.vy;
      s.vy += 0.012;

      const [r, g, b] = s.color;
      ctx.save();
      ctx.globalAlpha = s.life * 0.4;
      ctx.shadowBlur = s.r * 14;
      ctx.shadowColor = `rgb(${r},${g},${b})`;
      ctx.fillStyle = `rgb(${r},${g},${b})`;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r * 0.18, 0, Math.PI * 2);
      ctx.fill();
      // second pass for extra spread
      ctx.globalAlpha = s.life * 0.15;
      ctx.shadowBlur = s.r * 28;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r * 0.1, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    requestAnimationFrame(tick);
  }
  tick();
})();
