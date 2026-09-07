(() => {
  const $ = (id) => document.getElementById(id);
  const STORAGE_KEY = "salud-deporte:config";

  const configEl = $("config");
  const timerEl = $("timer");
  const doneEl = $("done");

  const workInput = $("work");
  const restInput = $("rest");
  const seriesInput = $("series");
  const soundSelect = $("soundSelect");

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

  // ---------- Sonidos (3 variedades, timbres audibles en ambientes ruidosos) ----------
  const SOUNDS = {
    clasico: {
      label: "Clásico",
      wave: "square",
      beeps: { 3: 880, 2: 988, 1: 1109 },
      end: [1400, 700],
      go: [700, 1400],
      bell: 1300,
      rest: 523,
      vol: 0.5
    },
    agudo: {
      label: "Agudo",
      wave: "square",
      beeps: { 3: 1047, 2: 1175, 1: 1319 },
      end: [1760, 880],
      go: [880, 1760],
      bell: 1600,
      rest: 659,
      vol: 0.5
    },
    grave: {
      label: "Grave",
      wave: "square",
      beeps: { 3: 659, 2: 740, 1: 831 },
      end: [1000, 500],
      go: [500, 1000],
      bell: 1100,
      rest: 440,
      vol: 0.45
    }
  };

  let soundName = "clasico";
  let soundPreset = SOUNDS.clasico;

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

  function tone(freq, durSec, vol, type) {
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

  // Barrido de frecuencia (chirp): sube o baja, corta mejor el ruido ambiente
  function chirp(fromFreq, toFreq, durSec, vol, type) {
    if (muted || !audioCtx) return;
    const t0 = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(fromFreq, t0);
    osc.frequency.exponentialRampToValueAtTime(toFreq, t0 + durSec);
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(vol, t0 + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + durSec);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start(t0);
    osc.stop(t0 + durSec + 0.05);
  }

  // Audios de archivo: campana original y arranque de carrera
  const boxingBellFile = new Audio("audio/campana_boxeo.mp3");
  const raceStartFile = new Audio("audio/inicio_carrera_v2.wav");

  function playFile(audio) {
    if (muted || !audio) return;
    try {
      audio.currentTime = 0;
      const p = audio.play();
      if (p && typeof p.catch === "function") p.catch(() => {});
    } catch (_) {}
  }

  function playCountdownBeep(step) {
    const p = soundPreset;
    tone(p.beeps[step] || p.beeps[1], 0.14, p.vol, p.wave);
  }

  // Campana de boxeo (archivo original): el audio ya trae los 3 toques
  function playBoxingBell() {
    playFile(boxingBellFile);
  }

  // Tono suave al empezar el descanso
  function playRestTone() {
    const p = soundPreset;
    tone(p.rest, 0.22, p.vol * 0.6, "sine");
  }

  // Celebración al completar toda la sesión
  function playDone() {
    const p = soundPreset;
    chirp(p.go[0], p.go[1], 0.2, p.vol, p.wave);
    setTimeout(() => chirp(p.go[0] * 1.5, p.go[1] * 1.5, 0.3, p.vol, p.wave), 200);
  }

  // ---------- Voz (español latino neutro, tono de entrenador) ----------
  let voicesCache = [];

  function refreshVoices() {
    try {
      voicesCache = speechSynthesis.getVoices();
    } catch (_) {}
  }

  if ("speechSynthesis" in window) {
    refreshVoices();
    speechSynthesis.addEventListener("voiceschanged", refreshVoices);
  }

  function pickLatinVoice() {
    let voices = voicesCache;
    if (!voices.length) {
      try { voices = speechSynthesis.getVoices(); } catch (_) { voices = []; }
    }
    const lower = (s) => (s || "").toLowerCase();
    const tags = ["es-419", "es-mx", "es-ar", "es-co", "es-cl", "es-pe", "es-ve", "es-us"];
    for (const tag of tags) {
      const v = voices.find((v) => lower(v.lang) === tag);
      if (v) return v;
    }
    return voices.find(
      (v) => lower(v.lang).startsWith("es") && !lower(v.lang).startsWith("es-es")
    ) || null;
  }

  function say(text) {
    if (muted) return;
    try {
      if (!("speechSynthesis" in window)) return;
      const u = new SpeechSynthesisUtterance(text);
      u.lang = "es-419";
      u.pitch = 1.2;  // entonación enérgica, de entrenador que anima
      u.rate = 1.12;  // ritmo más vivo
      u.volume = 1;
      const voice = pickLatinVoice();
      if (voice) u.voice = voice;
      speechSynthesis.speak(u);
    } catch (_) {}
  }

  function primeSpeech() {
    try {
      if ("speechSynthesis" in window) {
        const u = new SpeechSynthesisUtterance(" ");
        u.volume = 0;
        speechSynthesis.speak(u);
      }
    } catch (_) {}
  }

  const sayAttention = () => say("Atención");
  const sayHalf = () => say("Llevas la mitad");
  const sayTen = () => say("10 segundos");

  // ---------- Persistencia ----------
  function setSound(name) {
    if (!SOUNDS[name]) return;
    soundName = name;
    soundPreset = SOUNDS[name];
    soundSelect.value = name;
  }

  function savePrefs() {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          work: config.work,
          rest: config.rest,
          series: config.series,
          sound: soundName
        })
      );
    } catch (_) {}
  }

  function saveSoundOnly() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const saved = raw ? JSON.parse(raw) : {};
      saved.sound = soundName;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
    } catch (_) {}
  }

  function loadSaved() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw);
      if (Number.isFinite(saved.work) && saved.work >= 1) workInput.value = saved.work;
      if (Number.isFinite(saved.rest) && saved.rest >= 1) restInput.value = saved.rest;
      if (Number.isFinite(saved.series) && saved.series >= 1) seriesInput.value = saved.series;
      if (saved.sound && SOUNDS[saved.sound]) setSound(saved.sound);
    } catch (_) {}
  }

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
    setSound(soundSelect.value);
    savePrefs();
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
    phase.carreraPlayed = false;

    if (phase.type === "ready") {
      phaseLabel.textContent = "Prepárate";
      seriesCounter.textContent = `Serie 1 de ${config.series}`;
      sayAttention();
    } else if (phase.type === "work") {
      phaseLabel.textContent = "Trabajo";
      seriesCounter.textContent = `Serie ${phase.seriesNumber} de ${config.series}`;
      playBoxingBell();
    } else {
      phaseLabel.textContent = "Descanso";
      seriesCounter.textContent = `Descanso ${phase.seriesNumber} de ${config.series - 1}`;
      say("Descanso");
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

    if (phase.type === "rest" && shownSecond !== lastShownSecond) {
      lastShownSecond = shownSecond;
      if (shownSecond >= 1 && shownSecond <= 3) {
        playCountdownBeep(shownSecond);
      }
    }

    // Sonido de carrera en los últimos 3 segundos de la cuenta inicial y de cada ronda de trabajo
    if ((phase.type === "ready" || phase.type === "work") && !phase.carreraPlayed && remainingMs <= 3000) {
      phase.carreraPlayed = true;
      playFile(raceStartFile);
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
    setTimeout(playDone, 1300);
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
  soundSelect.addEventListener("change", () => {
    setSound(soundSelect.value);
    saveSoundOnly();
  });
  startBtn.addEventListener("click", start);
  pauseBtn.addEventListener("click", () => {
    intervalId ? pause() : resume();
  });
  resetBtn.addEventListener("click", reset);
  againBtn.addEventListener("click", reset);
  muteBtn.addEventListener("click", () => setMuted(!muted));

  // ---------- PWA ----------
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./sw.js", { updateViaCache: "none" }).catch(() => {});
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      window.location.reload();
    });
  }

  // ---------- Inicialización ----------
  loadSaved();
})();
