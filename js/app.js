(() => {
  const $ = (id) => document.getElementById(id);

  const configEl = $("config");
  const timerEl = $("timer");
  const doneEl = $("done");

  const workInput = $("work");
  const restInput = $("rest");
  const seriesInput = $("series");

  const startBtn = $("startBtn");
  const pauseBtn = $("pauseBtn");
  const resetBtn = $("resetBtn");
  const muteBtn = $("muteBtn");
  const againBtn = $("againBtn");

  const phaseLabel = $("phaseLabel");
  const timeDisplay = $("timeDisplay");
  const seriesCounter = $("seriesCounter");
  const progressFill = $("progressFill");

  const configError = $("configError");
  const doneSummary = $("doneSummary");

  let config = { work: 30, rest: 15, series: 5 };
  let phases = [];
  let idx = 0;
  let remainingMs = 0;
  let endTime = 0;
  let intervalId = null;
  let lastShownSecond = null;
  let muted = false;
  let wakeLock = null;

  // ---------- Sonido (Web Audio, tonos suaves) ----------
  let audioCtx = null;

  function ensureAudio() {
    if (!audioCtx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) audioCtx = new AC();
    }
    if (audioCtx && audioCtx.state === "suspended") {
      audioCtx.resume();
    }
  }

  function tone(freq, durSec, vol = 0.16, type = "sine") {
    if (muted || !audioCtx) return;
    const t0 = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(vol, t0 + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + durSec);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start(t0);
    osc.stop(t0 + durSec + 0.05);
  }

  // Señal "3, 2, 1" (últimos 3 segundos de cada intervalo)
  function playCountdownBeep(step) {
    const freqs = { 3: 392, 2: 440, 1: 523 };
    tone(freqs[step] || 440, 0.12, 0.16, "triangle");
  }

  // Sonido de "ya" al empezar el trabajo
  function playGo() {
    tone(660, 0.22, 0.2, "triangle");
  }

  // Tono suave al empezar el descanso
  function playRestTone() {
    tone(392, 0.2, 0.13, "sine");
  }

  const playDone = () => {
    tone(659.25, 0.16, 0.15);
    setTimeout(() => tone(880, 0.28, 0.15), 180);
  };

  // ---------- Voz (avisos hablados) ----------
  function say(text) {
    if (muted) return;
    try {
      if (!("speechSynthesis" in window)) return;
      const u = new SpeechSynthesisUtterance(text);
      u.lang = "es-CL";
      u.rate = 1;
      u.volume = 0.9;
      const voices = speechSynthesis.getVoices();
      const es = voices.find((v) => v.lang && v.lang.toLowerCase().startsWith("es"));
      if (es) u.voice = es;
      speechSynthesis.speak(u);
    } catch (_) {}
  }

  // Desbloquea speechSynthesis en iOS/Safari (requiere un gesto del usuario)
  function primeSpeech() {
    try {
      if ("speechSynthesis" in window) {
        const u = new SpeechSynthesisUtterance(" ");
        u.volume = 0;
        speechSynthesis.speak(u);
      }
    } catch (_) {}
  }

  const sayHalf = () => say("Llevas la mitad");
  const sayTen = () => say("10 segundos");

  // ---------- Lógica de intervalos ----------
  function buildPhases(work, rest, series) {
    const p = [];
    p.push({ type: "ready", seconds: 10 });
    for (let i = 0; i < series; i++) {
      p.push({ type: "work", seconds: work, seriesNumber: i + 1 });
      if (i < series - 1) {
        p.push({ type: "rest", seconds: rest, seriesNumber: i + 1 });
      }
    }
    return p;
  }

  function readConfig() {
    const work = Math.floor(Number(workInput.value));
    const rest = Math.floor(Number(restInput.value));
    const series = Math.floor(Number(seriesInput.value));
    if (
      !Number.isFinite(work) || work < 1 ||
      !Number.isFinite(rest) || rest < 1 ||
      !Number.isFinite(series) || series < 1
    ) {
      throw new Error("Ingresa números enteros positivos (mínimo 1). Sin límite máximo.");
    }
    return { work, rest, series };
  }

  // ---------- Control de sesión ----------
  function show(el) { el.hidden = false; }
  function hide(el) { el.hidden = true; }

  function start() {
    let cfg;
    try {
      cfg = readConfig();
    } catch (err) {
      configError.textContent = err.message;
      configError.hidden = false;
      return;
    }
    configError.hidden = true;
    config = cfg;
    phases = buildPhases(cfg.work, cfg.rest, cfg.series);
    idx = 0;
    ensureAudio();
    primeSpeech();
    hide(configEl);
    hide(doneEl);
    show(timerEl);
    beginPhase();
    requestWakeLock();
  }

  function beginPhase() {
    if (idx >= phases.length) {
      finish();
      return;
    }
    const phase = phases[idx];
    lastShownSecond = null;
    phase.halfSaid = false;
    phase.tenSaid = false;

    if (phase.type === "ready") {
      phaseLabel.textContent = "Prepárate";
      seriesCounter.textContent = `Serie 1 de ${config.series}`;
    } else if (phase.type === "work") {
      phaseLabel.textContent = "Trabajo";
      seriesCounter.textContent = `Serie ${phase.seriesNumber} de ${config.series}`;
      playGo();
    } else {
      phaseLabel.textContent = "Descanso";
      seriesCounter.textContent = `Descanso ${phase.seriesNumber} de ${config.series - 1}`;
      playRestTone();
    }
    timerEl.dataset.phase = phase.type;

    remainingMs = phase.seconds * 1000;
    endTime = Date.now() + remainingMs;
    updateDisplay(Math.ceil(remainingMs / 1000));
    clearInterval(intervalId);
    intervalId = setInterval(tick, 100);
  }

  function tick() {
    remainingMs = Math.max(0, endTime - Date.now());
    const phase = phases[idx];
    const shownSecond = Math.ceil(remainingMs / 1000);
    updateDisplay(shownSecond);

    if (shownSecond !== lastShownSecond) {
      lastShownSecond = shownSecond;
      if (shownSecond >= 1 && shownSecond <= 3) {
        playCountdownBeep(shownSecond);
      }
    }

    if (phase.type === "work") {
      const totalMs = phase.seconds * 1000;
      if (!phase.halfSaid && remainingMs <= totalMs / 2) {
        phase.halfSaid = true;
        sayHalf();
      }
      if (!phase.tenSaid && remainingMs <= 10000 && totalMs > 10000) {
        phase.tenSaid = true;
        sayTen();
      }
    }

    if (remainingMs <= 0) {
      idx++;
      beginPhase();
    }
  }

  function updateDisplay(shownSecond) {
    const phase = phases[idx];
    timeDisplay.textContent = String(shownSecond);
    const total = phase.seconds * 1000;
    progressFill.style.width = `${Math.min(100, ((total - remainingMs) / total) * 100)}%`;
  }

  function pause() {
    if (!intervalId) return;
    clearInterval(intervalId);
    intervalId = null;
    remainingMs = Math.max(0, endTime - Date.now());
    pauseBtn.textContent = "Reanudar";
    releaseWakeLock();
  }

  function resume() {
    if (intervalId) return;
    endTime = Date.now() + remainingMs;
    intervalId = setInterval(tick, 100);
    pauseBtn.textContent = "Pausar";
    requestWakeLock();
  }

  function reset() {
    clearInterval(intervalId);
    intervalId = null;
    releaseWakeLock();
    pauseBtn.textContent = "Pausar";
    hide(timerEl);
    hide(doneEl);
    show(configEl);
  }

  function finish() {
    clearInterval(intervalId);
    intervalId = null;
    releaseWakeLock();
    playDone();
    hide(timerEl);
    show(doneEl);
    const totalSec = phases.reduce(
      (a, p) => a + (p.type === "ready" ? 0 : p.seconds),
      0
    );
    const mm = Math.floor(totalSec / 60);
    const ss = totalSec % 60;
    doneSummary.textContent =
      `${config.series} series · ${config.work}s trabajo / ${config.rest}s descanso · total ${mm}m ${ss}s`;
  }

  // ---------- Wake Lock (pantalla encendida) ----------
  async function requestWakeLock() {
    try {
      if ("wakeLock" in navigator) {
        wakeLock = await navigator.wakeLock.request("screen");
      }
    } catch (_) {}
  }

  async function releaseWakeLock() {
    try {
      if (wakeLock) {
        await wakeLock.release();
        wakeLock = null;
      }
    } catch (_) {}
  }

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && intervalId) requestWakeLock();
  });

  // ---------- Silenciar ----------
  function setMuted(m) {
    muted = m;
    muteBtn.textContent = m ? "🔇" : "🔊";
    muteBtn.setAttribute("aria-pressed", String(m));
  }

  // ---------- Eventos ----------
  startBtn.addEventListener("click", start);
  pauseBtn.addEventListener("click", () => {
    intervalId ? pause() : resume();
  });
  resetBtn.addEventListener("click", reset);
  againBtn.addEventListener("click", reset);
  muteBtn.addEventListener("click", () => setMuted(!muted));

  // ---------- PWA ----------
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  }
})();
