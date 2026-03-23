/** KIP · SoundFeedback — retroalimentación sonora */
export const SoundFeedbackComponent = {
  _enabled: true,
  _ctx: null,
  _controller: null,

  init() {
    this._enabled = localStorage.getItem('kip_sound') !== 'off';
    const btn = document.getElementById('btn-sound');
    const on  = document.getElementById('icon-snd-on');
    const off = document.getElementById('icon-snd-off');
    if (btn) {
      this._syncIcon(on, off);
      // [FIX-10] AbortController evita listeners duplicados si init() se llama más de una vez
      this._controller?.abort();
      this._controller = new AbortController();
      btn.addEventListener('click', () => {
        this._enabled = !this._enabled;
        localStorage.setItem('kip_sound', this._enabled ? 'on' : 'off');
        this._syncIcon(on, off);
        // Sincronizar también el toggle de Settings si está visible
        const settingsToggle = document.getElementById('toggle-sonido-pref');
        if (settingsToggle) {
          settingsToggle.classList.toggle('active', this._enabled);
          settingsToggle.setAttribute('aria-checked', String(this._enabled));
        }
      }, { signal: this._controller.signal });
    }
  },

  _syncIcon(on, off) {
    if (on)  on.style.display  = this._enabled ? '' : 'none';
    if (off) off.style.display = this._enabled ? 'none' : '';
  },

  _getCtx() {
    if (!this._ctx) this._ctx = new (window.AudioContext || window.webkitAudioContext)();
    // Chrome suspende el AudioContext hasta el primer gesto del usuario.
    // resume() es no-op si ya está running, y una Promise resuelta en iOS.
    if (this._ctx.state === 'suspended') {
      this._ctx.resume().catch(() => {});
    }
    return this._ctx;
  },

  _beep(freq, dur, vol = 0.15) {
    if (!this._enabled) return;
    try {
      const ctx  = this._getCtx();
      if (ctx.state === 'suspended') return; // aún no hay gesto — silenciar
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.frequency.value = freq;
      osc.type = 'sine';
      gain.gain.setValueAtTime(vol, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
      osc.start(); osc.stop(ctx.currentTime + dur);
    } catch (_) {}
  },

  playCheck()       { this._beep(880, 0.12); },
  playUncheck()     { this._beep(440, 0.10); },
  playCelebration() { [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => this._beep(f, 0.15, 0.12), i * 80)); },
};
