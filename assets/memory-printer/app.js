const defaultQuestions = [
  {
    text: "Think of a memory you wish you had a photograph of. Where were you?",
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

const stepLabel = document.querySelector("#stepLabel");
const modeLabel = document.querySelector("#modeLabel");
const questionText = document.querySelector("#questionText");
const helperText = document.querySelector("#helperText");
const answerForm = document.querySelector("#answerForm");
const answerInput = document.querySelector("#answerInput");
const feelingOptions = document.querySelector("#feelingOptions");
const backButton = document.querySelector("#backButton");
const nextButton = document.querySelector("#nextButton");
const introPanel = document.querySelector("#introPanel");
const startButton = document.querySelector("#startButton");
const resultPanel = document.querySelector("#resultPanel");
const generationState = document.querySelector("#generationState");
const instructionKicker = document.querySelector("#instructionKicker");
const instructionText = document.querySelector("#instructionText");
const instructionHelper = document.querySelector("#instructionHelper");
const einkPreview = document.querySelector("#einkPreview");
const einkImage = document.querySelector("#einkImage");
const saveLink = document.querySelector("#saveLink");

const resetButton = document.querySelector("#resetButton");
const interview = document.querySelector(".interview");
const voiceInput = document.querySelector("#voiceInput");
const micButton = document.querySelector("#micButton");
const micLabel = document.querySelector("#micLabel");
const transcript = document.querySelector("#transcript");
const typeToggle = document.querySelector("#typeToggle");

const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
const recognition = SpeechRecognition ? new SpeechRecognition() : null;
let isTypingMode = false;

if (recognition) {
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.lang = "en-US";

  let isListening = false;
  let isHeld = false;
  let savedTranscript = "";

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
  isTypingMode = true;
}

typeToggle.addEventListener("click", () => {
  isTypingMode = !isTypingMode;
  if (recognition && micButton.classList.contains("listening")) recognition.stop();
  voiceInput.hidden = isTypingMode;
  answerInput.hidden = !isTypingMode;
  typeToggle.textContent = isTypingMode ? "Use voice instead" : "Type instead";
  if (!isTypingMode) answerInput.value = transcript.textContent;
  if (isTypingMode) answerInput.focus();
});

function resetVoiceState() {
  if (recognition && micButton.classList.contains("listening")) recognition.stop();
  transcript.textContent = "";
  if (recognition) savedTranscript = "";
  isTypingMode = false;
  voiceInput.hidden = false;
  typeToggle.hidden = false;
  answerInput.hidden = true;
  typeToggle.textContent = "Type instead";
  micLabel.textContent = "Hold to speak";
  micButton.classList.remove("listening");
}

function renderQuestion() {
  const question = questions[state.step];
  const isMulti = question.type === "multi";
  stepLabel.textContent = `Question ${state.step + 1} of ${questions.length}`;
  modeLabel.textContent = "Interview";
  questionText.textContent = question.text;
  helperText.textContent = question.helper;
  feelingOptions.hidden = !isMulti;
  backButton.disabled = state.step === 0;
  nextButton.textContent = state.step === questions.length - 1 ? "Make the memory" : "Continue";

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

async function generateMemory() {
  interview.hidden = true;
  resultPanel.hidden = false;
  generationState.textContent = "Creating your memory";
  instructionKicker.textContent = "one moment";
  instructionText.innerHTML = "Creating<br>your memory...";
  instructionHelper.textContent = "This takes a little while. Your image is being drawn.";
  saveLink.hidden = true;
  einkPreview.hidden = true;

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

    generationState.textContent = "Ready";
    instructionKicker.textContent = "Your memory is ready";
    instructionText.innerHTML = "Here it is.";
    instructionHelper.textContent = "Hold on to it for a moment.";
    if (result.imageUrl) {
      einkImage.src = result.imageUrl;
      einkPreview.hidden = false;
      saveLink.href = result.imageUrl;
      saveLink.hidden = false;
    }
  } catch (error) {
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
    if (selected.length === 0) {
      helperText.textContent = "Choose one to three feelings before making the memory.";
      return;
    }
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

startButton.addEventListener("click", () => {
  introPanel.hidden = true;
  interview.hidden = false;
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
  introPanel.hidden = false;
});

feelingOptions.addEventListener("change", () => {
  const question = questions[state.step];
  if (question.type !== "multi") return;
  state.answers[state.step] = Array.from(feelingOptions.querySelectorAll("input:checked")).map((input) => input.value);
  renderFeelingOptions(question);
});

