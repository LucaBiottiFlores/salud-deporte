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
  let seq = [];
  let idx = 0;
  let remainingMs = 0;
  let endTime = 0;
  let intervalId = null;
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

  const playWork = () => tone(880, 0.18, 0.15);
  const playRest = () => tone(523.25, 0.18, 0.13);
  const playDone = () => {
    tone(659.25, 0.16, 0.15);
    setTimeout(() => tone(880, 0.28, 0.15), 180);
  };

  // ---------- Lógica de intervalos ----------
  function buildSeq(work, rest, series) {
    const s = [];
    for (let i = 0; i < series; i++) {
      s.push({ type: "work", seconds: work });
      if (i < series - 1) s.push({ type: "rest", seconds: rest });
    }
    return s;
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

  function workCountUpTo(i) {
    let c = 0;
    for (let j = 0; j <= i; j++) if (seq[j].type === "work") c++;
    return c;
  }

  function restCountUpTo(i) {
    let c = 0;
    for (let j = 0; j <= i; j++) if (seq[j].type === "rest") c++;
    return c;
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
    seq = buildSeq(cfg.work, cfg.rest, cfg.series);
    idx = 0;
    ensureAudio();
    hide(configEl);
    hide(doneEl);
    show(timerEl);
    beginPhase();
    requestWakeLock();
  }

  function beginPhase() {
    if (idx >= seq.length) {
      finish();
      return;
    }
    const phase = seq[idx];
    phaseLabel.textContent = phase.type === "work" ? "Trabajo" : "Descanso";
    timerEl.dataset.phase = phase.type;
    if (phase.type === "work") {
      seriesCounter.textContent = `Serie ${workCountUpTo(idx)} de ${config.series}`;
      playWork();
    } else {
      seriesCounter.textContent = `Descanso ${restCountUpTo(idx)} de ${config.series - 1}`;
      playRest();
    }
    remainingMs = phase.seconds * 1000;
    endTime = Date.now() + remainingMs;
    updateDisplay();
    clearInterval(intervalId);
    intervalId = setInterval(tick, 100);
  }

  function tick() {
    remainingMs = Math.max(0, endTime - Date.now());
    updateDisplay();
    if (remainingMs <= 0) {
      idx++;
      beginPhase();
    }
  }

  function updateDisplay() {
    const phase = seq[idx];
    timeDisplay.textContent = String(Math.ceil(remainingMs / 1000));
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
    const totalSec = seq.reduce((a, p) => a + p.seconds, 0);
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
