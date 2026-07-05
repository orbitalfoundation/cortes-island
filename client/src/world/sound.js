// The island soundscape — fully procedural WebAudio (no samples): surf built
// from filtered noise swells, wind that tracks the real weather, sparse gull
// cries by day. Plus CKTZ 89.5, the island's actual community radio stream.
// Audio starts on first user gesture (browser policy); HUD buttons toggle.

export function createSound({ config }) {
  let ctx = null, master = null, started = false, muted = false;
  let surf, wind, gullTimer = 0;
  const radio = config.radioStream ? new Audio() : null;
  if (radio) { radio.preload = 'none'; radio.crossOrigin = 'anonymous'; }
  let radioOn = false;

  function makeNoise(ctxA) {
    const len = ctxA.sampleRate * 4;
    const buf = ctxA.createBuffer(1, len, ctxA.sampleRate);
    const d = buf.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1; // pink-ish
      b0 = 0.997 * b0 + 0.029 * w;
      b1 = 0.985 * b1 + 0.032 * w;
      b2 = 0.95 * b2 + 0.048 * w;
      d[i] = (b0 + b1 + b2 + w * 0.05) * 0.25;
    }
    const src = ctxA.createBufferSource();
    src.buffer = buf; src.loop = true;
    return src;
  }

  function start() {
    if (started) return;
    started = true;
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 1;
    master.connect(ctx.destination);

    // surf: pink noise → gentle lowpass, twin slow LFOs beat against each
    // other so waves arrive irregularly
    const surfSrc = makeNoise(ctx);
    const surfLP = ctx.createBiquadFilter();
    surfLP.type = 'lowpass'; surfLP.frequency.value = 420; surfLP.Q.value = 0.4;
    const surfGain = ctx.createGain(); surfGain.gain.value = 0;
    const lfo1 = ctx.createOscillator(), lfo1g = ctx.createGain();
    const lfo2 = ctx.createOscillator(), lfo2g = ctx.createGain();
    lfo1.frequency.value = 0.09; lfo1g.gain.value = 0.35;
    lfo2.frequency.value = 0.062; lfo2g.gain.value = 0.25;
    lfo1.connect(lfo1g).connect(surfGain.gain);
    lfo2.connect(lfo2g).connect(surfGain.gain);
    surfSrc.connect(surfLP).connect(surfGain).connect(master);
    surfSrc.start(); lfo1.start(); lfo2.start();
    surf = { gain: surfGain, lp: surfLP };

    // wind: noise → sweeping bandpass
    const windSrc = makeNoise(ctx);
    const windBP = ctx.createBiquadFilter();
    windBP.type = 'bandpass'; windBP.frequency.value = 300; windBP.Q.value = 0.7;
    const windGain = ctx.createGain(); windGain.gain.value = 0;
    const windLFO = ctx.createOscillator(), windLFOg = ctx.createGain();
    windLFO.frequency.value = 0.05; windLFOg.gain.value = 160;
    windLFO.connect(windLFOg).connect(windBP.frequency);
    windSrc.connect(windBP).connect(windGain).connect(master);
    windSrc.start(); windLFO.start();
    wind = { gain: windGain };
  }

  function gullCry() {
    if (!ctx || muted) return;
    const t0 = ctx.currentTime;
    const n = 1 + Math.floor(Math.random() * 3);
    for (let i = 0; i < n; i++) {
      const t = t0 + i * (0.35 + Math.random() * 0.2);
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      const g = ctx.createGain();
      const f = ctx.createBiquadFilter();
      f.type = 'bandpass'; f.frequency.value = 2600; f.Q.value = 2.5;
      o.frequency.setValueAtTime(1150 + Math.random() * 250, t);
      o.frequency.exponentialRampToValueAtTime(640, t + 0.28);
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.028, t + 0.05);
      g.gain.exponentialRampToValueAtTime(0.0008, t + 0.34);
      o.connect(f).connect(g).connect(master);
      o.start(t); o.stop(t + 0.4);
    }
  }

  // called every frame with world state
  function update(dt, { camY = 5000, skyState, wx } = {}) {
    if (!started || muted) return;
    const day = skyState?.day ?? 1;
    const storm = wx?.storm ?? 0;
    const windK = wx?.windKmh ?? 8;
    const nearWater = Math.max(0, 1 - camY / 6500);

    const surfTarget = (0.05 + nearWater * 0.22) * (1 + storm * 1.6);
    surf.gain.gain.setTargetAtTime(surfTarget, ctx.currentTime, 1.2);
    surf.lp.frequency.setTargetAtTime(380 + storm * 500, ctx.currentTime, 1.5);

    const windTarget = Math.min(0.16, windK / 260) * (0.4 + storm) + storm * 0.05;
    wind.gain.gain.setTargetAtTime(windTarget, ctx.currentTime, 1.5);

    gullTimer -= dt;
    if (gullTimer <= 0) {
      gullTimer = 7 + Math.random() * 18;
      if (day > 0.35 && camY < 6000 && Math.random() < 0.8) gullCry();
    }
  }

  return {
    start,
    update,
    get started() { return started; },
    get muted() { return muted; },
    setMuted(m) {
      muted = m;
      if (master) master.gain.setTargetAtTime(m ? 0 : 1, ctx.currentTime, 0.3);
    },
    get radioOn() { return radioOn; },
    toggleRadio() {
      if (!radio) return false;
      radioOn = !radioOn;
      if (radioOn) {
        radio.src = config.radioStream;
        radio.volume = 0.8;
        radio.play().catch(() => { radioOn = false; });
      } else {
        radio.pause();
        radio.src = '';
      }
      return radioOn;
    },
  };
}
