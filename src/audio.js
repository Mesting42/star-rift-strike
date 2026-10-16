// Synthesized original soundtrack and sound effects. No external media required.
export class AudioSystem {
  constructor() {
    this.ctx = null;
    this.musicVolume = .30;
    this.sfxVolume = .62;
    this.voices = new Set();
    this.theme = 1;
    this.boss = false;
    this.step = 0;
    this.nextBeat = 0;
    this.suspended = false;
    this.lastEffect = new Map();
  }

  async unlock() {
    if (!this.ctx) {
      const Context = window.AudioContext || window.webkitAudioContext;
      if (!Context) return;
      this.ctx = new Context();
      this.music = this.ctx.createGain(); this.music.gain.value = this.musicVolume;
      this.sfx = this.ctx.createGain(); this.sfx.gain.value = this.sfxVolume;
      const master = this.ctx.createGain(); master.gain.value = .7;
      const compressor = this.ctx.createDynamicsCompressor();
      compressor.threshold.value = -18; compressor.knee.value = 18; compressor.ratio.value = 5;
      this.music.connect(compressor); this.sfx.connect(compressor);
      compressor.connect(master); master.connect(this.ctx.destination);
      this.noise = this.ctx.createBuffer(1, this.ctx.sampleRate, this.ctx.sampleRate);
      const data = this.noise.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      this.nextBeat = this.ctx.currentTime + .08;
    }
    if (this.ctx.state !== 'running') await this.ctx.resume();
    this.suspended = false;
    if (this.nextBeat < this.ctx.currentTime) this.nextBeat = this.ctx.currentTime + .04;
  }

  setVolume(music, sfx) {
    this.musicVolume = Math.max(0, Math.min(1, music));
    this.sfxVolume = Math.max(0, Math.min(1, sfx));
    if (!this.ctx) return;
    this.music.gain.setTargetAtTime(this.musicVolume, this.ctx.currentTime, .025);
    this.sfx.gain.setTargetAtTime(this.sfxVolume, this.ctx.currentTime, .025);
  }

  setTheme(sector, boss = false) {
    if (this.theme === sector && this.boss === boss) return;
    this.theme = sector; this.boss = boss; this.step = 0;
    if (this.ctx) this.nextBeat = this.ctx.currentTime + .06;
  }

  tone(freq, duration, volume, type = 'sine', destination = this.sfx, time = this.ctx?.currentTime || 0, sweep = null, lowpass = 5000) {
    if (!this.ctx || this.voices.size >= 64 || volume <= 0) return;
    const osc = this.ctx.createOscillator(), gain = this.ctx.createGain(), filter = this.ctx.createBiquadFilter();
    osc.type = type; osc.frequency.setValueAtTime(Math.max(20, freq), time);
    if (sweep) osc.frequency.exponentialRampToValueAtTime(Math.max(20, sweep), time + duration);
    filter.type = 'lowpass'; filter.frequency.value = lowpass; filter.Q.value = .65;
    gain.gain.setValueAtTime(.0001, time);
    gain.gain.exponentialRampToValueAtTime(volume, time + Math.min(.014, duration / 4));
    gain.gain.exponentialRampToValueAtTime(.0001, time + duration);
    osc.connect(filter); filter.connect(gain); gain.connect(destination);
    this.voices.add(osc);
    osc.onended = () => { this.voices.delete(osc); osc.disconnect(); filter.disconnect(); gain.disconnect(); };
    osc.start(time); osc.stop(time + duration + .02);
  }

  hiss(duration, volume, freq = 2500, destination = this.sfx, time = this.ctx?.currentTime || 0) {
    if (!this.ctx || this.voices.size >= 64) return;
    const source = this.ctx.createBufferSource(), filter = this.ctx.createBiquadFilter(), gain = this.ctx.createGain();
    source.buffer = this.noise; filter.type = 'bandpass'; filter.frequency.value = freq; filter.Q.value = .6;
    gain.gain.setValueAtTime(volume, time); gain.gain.exponentialRampToValueAtTime(.0001, time + duration);
    source.connect(filter); filter.connect(gain); gain.connect(destination); this.voices.add(source);
    source.onended = () => { this.voices.delete(source); source.disconnect(); filter.disconnect(); gain.disconnect(); };
    source.start(time, Math.random() * .25); source.stop(time + duration + .01);
  }

  update() {
    if (!this.ctx || this.ctx.state !== 'running' || this.suspended || this.musicVolume === 0) return;
    const now = this.ctx.currentTime;
    if (this.nextBeat < now - .2) this.nextBeat = now + .03;
    const bpm = this.boss ? 150 : this.theme === 2 ? 126 : 108;
    const eighth = 60 / bpm / 2;
    while (this.nextBeat < now + .11) {
      const step = this.step++, t = this.nextBeat;
      this.nextBeat += eighth;
      const bar = Math.floor(step / 16) % 4, pulse = step % 16;
      const roots = this.boss ? [38, 38, 41, 37] : this.theme === 2 ? [43, 39, 46, 41] : [45, 48, 43, 41];
      const root = roots[bar], midi = n => 440 * 2 ** ((n - 69) / 12);
      if (pulse % 4 === 0) {
        this.tone(116, .18, this.boss ? .25 : .16, 'sine', this.music, t, 37, 400);
        this.tone(midi(root - 12), eighth * 2.5, .15, 'triangle', this.music, t, null, 680);
      }
      if (pulse % 4 === 2) this.hiss(.095, this.boss ? .16 : .08, 1450, this.music, t);
      if (pulse % 2 === 0 || this.boss) this.hiss(.038, .025, 7200, this.music, t);
      const arpeggio = this.boss ? [0, 7, 12, 3, 7, 15, 12, 7] : this.theme === 2 ? [0, 7, 10, 3, 12, 7, 10, 3] : [0, 7, 12, 3, 7, 10, 12, 7];
      this.tone(midi(root + 12 + arpeggio[pulse % 8]), eighth * .8, this.boss ? .065 : .043, 'triangle', this.music, t, null, this.boss ? 4100 : 2300);
      if (pulse === 0) {
        for (const n of [0, 3, 7]) this.tone(midi(root + 12 + n), eighth * 11, .025, 'sine', this.music, t, null, 1300);
      }
      if (pulse % 4 === 1) {
        const melody = this.boss ? [19, 15, 12, 10] : this.theme === 2 ? [12, 10, 7, 15] : [19, 15, 14, 12];
        this.tone(midi(root + melody[Math.floor(pulse / 4)]), eighth * 2.6, .055, 'sine', this.music, t, null, 3400);
      }
    }
  }

  play(name) {
    if (!this.ctx || this.ctx.state !== 'running' || this.suspended || this.sfxVolume === 0) return;
    const now = this.ctx.currentTime;
    const limit = name === 'fire' ? .07 : name === 'hit' ? .055 : name === 'explosion' ? .075 : .015;
    if (now - (this.lastEffect.get(name) ?? -10) < limit) return;
    this.lastEffect.set(name, now);
    switch (name) {
      case 'fire': this.tone(390, .065, .13, 'sawtooth', this.sfx, now, 100, 2100); this.hiss(.025, .08, 4300); break;
      case 'hit': this.tone(180, .08, .13, 'triangle', this.sfx, now, 65); this.hiss(.035, .12, 3200); break;
      case 'explosion': this.hiss(.55, .45, 320); this.tone(76, .45, .34, 'sine', this.sfx, now, 24); break;
      case 'hurt': this.tone(135, .32, .28, 'sawtooth', this.sfx, now, 44, 850); this.hiss(.18, .25, 1400); break;
      case 'pickup': [659, 880, 1175].forEach((n, i) => this.tone(n, .17, .1, 'sine', this.sfx, now + i * .055)); break;
      case 'buy': [440, 554, 659, 880].forEach((n, i) => this.tone(n, .22, .12, 'triangle', this.sfx, now + i * .07)); break;
      case 'skill': this.tone(150, .5, .22, 'triangle', this.sfx, now, 1450); this.hiss(.4, .17, 2900); break;
      case 'transition': this.tone(90, .85, .22, 'sawtooth', this.sfx, now, 750, 1500); this.hiss(.8, .16, 2100); break;
      case 'bossWarning': this.tone(680, .14, .18, 'square', this.sfx, now, 850, 1700); this.tone(460, .12, .13, 'triangle', this.sfx, now + .16, 360, 1200); break;
      case 'win': [523, 659, 784, 1047, 1319].forEach((n, i) => this.tone(n, .6, .15, 'triangle', this.sfx, now + i * .15)); break;
      case 'lose': [330, 294, 247, 165].forEach((n, i) => this.tone(n, .7, .12, 'triangle', this.sfx, now + i * .2)); break;
      case 'ui': this.tone(760, .07, .1, 'sine', this.sfx, now, 550); break;
      default: this.tone(520, .08, .08, 'sine');
    }
  }

  suspend() {
    this.suspended = true;
    if (this.ctx?.state === 'running') this.ctx.suspend().catch(() => {});
  }

  resume() {
    this.suspended = false;
    if (this.ctx) {
      this.nextBeat = this.ctx.currentTime + .06;
      if (this.ctx.state !== 'running') this.ctx.resume().catch(() => {});
    }
  }
}
