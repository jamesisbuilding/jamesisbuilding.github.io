// Lampwise landing: the shader room, the sticky phone story, scroll-linked reveals and lazy video.
// Vanilla, no dependencies, no network requests beyond this site's own files.
(() => {
  'use strict';
  const doc = document.documentElement;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  const darkMq = matchMedia('(prefers-color-scheme: dark)');
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

  /* ---------- The room: one fragment shader, ported from lampwise_ui/shaders/ambient.frag ---------- */
  const FRAG = `precision mediump float;
uniform vec2 uSize; uniform float uTime;
uniform vec3 uPaper, uO1, uO2, uO3, uGrain, uLampC, uLamp;
uniform float uMix, uGrainA;
float drift(float period){ float x = mod(uTime, 2.0*period)/period; x = x <= 1.0 ? x : 2.0 - x; return x*x*(3.0-2.0*x); }
// Soft orb: full colour at the centre, fading to 1.7 r (the app uses 1.5; James likes them softer on the web).
float orb(vec2 p, vec2 c, float r){ float d = clamp(distance(p, c)/(r*1.7), 0.0, 1.0); return 1.0 - smoothstep(0.0, 1.0, d); }
float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
void main(){
  vec2 frag = vec2(gl_FragCoord.x, uSize.y - gl_FragCoord.y);
  vec2 p = frag / uSize.x; float h = uSize.y / uSize.x;
  float t1 = drift(22.0), t2 = drift(27.0), t3 = drift(31.0);
  vec2 c1 = vec2(0.18, 0.40 - 0.12*h) + vec2(0.32, 0.22)*0.80*t1;
  vec2 c2 = vec2(0.89, 0.28*h + 0.45) + vec2(-0.26, -0.18)*0.90*t2;
  vec2 c3 = vec2(0.235, 1.22*h - 0.375) + vec2(0.22, -0.26)*0.75*t3;
  // The app tunes the orbs for a phone (height about 2.17 widths); on a wider screen they shrink
  // with the aspect, or three orbs would cover the whole room.
  float s = clamp(h / 2.17, 0.42, 1.0);
  vec3 col = uPaper;
  col = mix(col, uO1, uMix*orb(p, c1, s*0.62*(1.0+0.15*t1)));
  col = mix(col, uO2, uMix*orb(p, c2, s*0.70*(1.0-0.10*t2)));
  col = mix(col, uO3, uMix*orb(p, c3, s*0.58*(1.0+0.10*t3)));
  // The lamp: a gilt glow that follows the lit line in the languages section.
  col = mix(col, uLampC, uLamp.z*orb(p, uLamp.xy, 0.30));
  // Still grain, like paper: a fixed speck pattern that never moves.
  float n = hash(floor(frag));
  col = mix(col, uGrain, n*n*uGrainA);
  gl_FragColor = vec4(col, 1.0);
}`;
  const VERT = 'attribute vec2 a; void main(){ gl_Position = vec4(a, 0.0, 1.0); }';
  // The palette lives in landing.css (--room-*, light in :root, dark in the media query), so
  // contrast.py and the CSS room read the same values. 6-digit hex.
  const css = (n) => getComputedStyle(doc).getPropertyValue(n).trim();
  const hex = (n) => { const s = css(n); return [1, 3, 5].map((i) => parseInt(s.slice(i, i + 2), 16) / 255); };
  const lamp = { x: 0.3, y: 0.5, z: 0, tz: 0 };
  let drawRoom = null;

  function startRoom() {
    const canvas = document.getElementById('room');
    if (!canvas) return;
    let gl;
    try { gl = canvas.getContext('webgl', { antialias: false, alpha: false, depth: false, powerPreference: 'low-power' }); } catch (e) { gl = null; }
    if (!gl) return; // The CSS room in landing.css stays.
    const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); return gl.getShaderParameter(s, gl.COMPILE_STATUS) ? s : null; };
    const vs = sh(gl.VERTEX_SHADER, VERT), fs = sh(gl.FRAGMENT_SHADER, FRAG);
    if (!vs || !fs) return;
    const prog = gl.createProgram();
    gl.attachShader(prog, vs); gl.attachShader(prog, fs); gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return;
    gl.useProgram(prog);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, 'a');
    gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    const U = {};
    ['uSize', 'uTime', 'uPaper', 'uO1', 'uO2', 'uO3', 'uGrain', 'uLampC', 'uLamp', 'uMix', 'uGrainA'].forEach((n) => { U[n] = gl.getUniformLocation(prog, n); });

    let lampA = 0;
    const setRoom = () => {
      gl.uniform3fv(U.uPaper, hex('--room-paper'));
      gl.uniform3fv(U.uO1, hex('--room-orb1')); gl.uniform3fv(U.uO2, hex('--room-orb2')); gl.uniform3fv(U.uO3, hex('--room-orb3'));
      gl.uniform1f(U.uMix, parseFloat(css('--room-mix')));
      gl.uniform3fv(U.uGrain, hex('--room-grain')); gl.uniform1f(U.uGrainA, parseFloat(css('--room-grain-a')));
      gl.uniform3fv(U.uLampC, hex('--room-glow'));
      lampA = parseFloat(css('--room-glow-a'));
    };
    const size = () => {
      // DPR capped at 1.5: the orbs are soft, and the grain stays fine enough.
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      const w = Math.round(canvas.clientWidth * dpr), h = Math.round(canvas.clientHeight * dpr);
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; gl.viewport(0, 0, w, h); }
      gl.uniform2f(U.uSize, w, h);
    };
    setRoom(); size();

    let t = 0;
    drawRoom = () => {
      lamp.z += (lamp.tz - lamp.z) * 0.18;
      gl.uniform1f(U.uTime, t);
      gl.uniform3f(U.uLamp, lamp.x, lamp.y, lamp.z * lampA);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };

    // 24 fps: the drift is slow, so more frames would only cost battery.
    let raf = 0, last = 0;
    const loop = (now) => {
      raf = requestAnimationFrame(loop);
      if (now - last < 41) return;
      const dt = last ? Math.min(now - last, 100) : 0;
      last = now; t += dt / 1000;
      drawRoom();
    };
    const run = () => {
      cancelAnimationFrame(raf); raf = 0; last = 0;
      if (reduce.matches) { requestAnimationFrame(drawRoom); return; } // Still room: one frame.
      if (!document.hidden) raf = requestAnimationFrame(loop);
    };
    document.addEventListener('visibilitychange', run);
    reduce.addEventListener('change', run);
    darkMq.addEventListener('change', () => { setRoom(); requestAnimationFrame(drawRoom); });
    let rz = 0;
    addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(() => { size(); requestAnimationFrame(drawRoom); }, 150); });
    canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); cancelAnimationFrame(raf); doc.classList.remove('gl'); });

    drawRoom();
    doc.classList.add('gl');
    run();

    // Frame cost probe for verification: draw time in ms, forced to finish by a 1 px read-back.
    window.__roomBench = (n = 60) => { const px = new Uint8Array(4); const s = performance.now(); for (let i = 0; i < n; i++) { drawRoom(); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); } return { ms: (performance.now() - s) / n, w: canvas.width, h: canvas.height }; };
  }

  // Start the shader after first paint, so it never competes with LCP.
  const later = window.requestIdleCallback || ((f) => setTimeout(f, 200));
  addEventListener('load', () => later(startRoom, { timeout: 1200 }));

  /* ---------- Video: lazy load, play only in view, pause control ---------- */
  const loadVideo = (v) => {
    if (v.dataset.loaded) return;
    v.querySelectorAll('source[data-src]').forEach((s) => { s.src = s.dataset.src; });
    v.dataset.loaded = '1';
    v.load();
  };
  const userPaused = new WeakSet();
  const play = (v) => { if (reduce.matches || userPaused.has(v)) return; loadVideo(v); const p = v.play(); if (p) p.catch(() => {}); };

  const vidIO = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      const v = e.target;
      if (e.isIntersecting) play(v); else v.pause();
    });
  }, { rootMargin: '200px 0px' });
  document.querySelectorAll('video[data-autoplay]').forEach((v) => vidIO.observe(v));

  const syncToggle = (btn, v) => {
    const paused = v.paused;
    btn.setAttribute('aria-pressed', String(paused));
    btn.setAttribute('aria-label', paused ? 'Play video' : 'Pause video');
  };
  document.querySelectorAll('[data-player]').forEach((box) => {
    const btn = box.querySelector('.vid-toggle');
    const v = box.querySelector('video');
    if (!btn || !v) return;
    ['play', 'pause'].forEach((ev) => v.addEventListener(ev, () => syncToggle(btn, v)));
    syncToggle(btn, v);
    btn.addEventListener('click', () => {
      if (v.paused) { userPaused.delete(v); loadVideo(v); v.play().catch(() => {}); }
      else { userPaused.add(v); v.pause(); }
    });
  });

  /* ---------- Story: the sticky phone changes screen with the step in view ---------- */
  const steps = [...document.querySelectorAll('.step')];
  const layers = [...document.querySelectorAll('.story-phone .layer')];
  const setStep = (i) => {
    steps.forEach((s, j) => s.classList.toggle('is-active', j === i));
    layers.forEach((l) => {
      const on = Number(l.dataset.layer) === i;
      l.classList.toggle('is-on', on);
      if (l.tagName === 'VIDEO') { if (on) { loadVideo(l); if (!reduce.matches) l.play().catch(() => {}); } else l.pause(); }
    });
  };
  if (steps.length) {
    setStep(0);
    const stepIO = new IntersectionObserver((entries) => {
      entries.forEach((e) => { if (e.isIntersecting) setStep(Number(e.target.dataset.step)); });
    }, { rootMargin: '-45% 0px -45% 0px' });
    steps.forEach((s) => stepIO.observe(s));
  }

  /* ---------- Reveals ---------- */
  const reveals = document.querySelectorAll('.honest-item, .tier, .reading-head, .streak-copy, .privacy-card, .faq-list, .close-card, .morning-turn, .story-title');
  reveals.forEach((el) => el.classList.add('reveal'));
  const revIO = new IntersectionObserver((entries) => {
    entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('in'); revIO.unobserve(e.target); } });
  }, { rootMargin: '0px 0px -10% 0px' });
  reveals.forEach((el) => revIO.observe(el));

  /* ---------- Scroll-linked pieces, one rAF per scroll ---------- */
  const morningLines = [...document.querySelectorAll('.morning-lines li')];
  const timerFill = document.querySelector('.timer-fill');
  const timerStep = document.querySelector('.step[data-step="1"]');
  const reading = document.querySelector('.reading');
  const reel = document.querySelector('.reading-track');
  const tongues = document.querySelector('.tongues');
  const tongueLines = [...document.querySelectorAll('.tongues-list li')];
  const panMq = matchMedia('(min-width: 900px) and (prefers-reduced-motion: no-preference)');

  let ticking = false;
  const update = () => {
    ticking = false;
    const vh = innerHeight;

    // The morning: each line brightens as it reaches the middle of the screen.
    morningLines.forEach((li) => {
      const r = li.getBoundingClientRect();
      const d = Math.abs(r.top + r.height / 2 - vh * 0.5) / (vh * 0.5);
      li.style.setProperty('--o', reduce.matches ? 1 : (0.22 + 0.78 * clamp(1 - d, 0, 1)).toFixed(3));
    });

    // The honest timer: the bar fills as step 2 crosses the screen.
    if (timerFill && timerStep) {
      const r = timerStep.getBoundingClientRect();
      const p = reduce.matches ? 1 : clamp((vh * 0.85 - r.top) / (r.height * 0.8), 0, 1);
      timerFill.style.setProperty('--t', p.toFixed(3));
    }

    // The reading reel pans sideways while its section is pinned.
    if (reading && reel) {
      if (panMq.matches) {
        const r = reading.getBoundingClientRect();
        const p = clamp(-r.top / (r.height - vh), 0, 1);
        const span = Math.max(0, reel.scrollWidth - document.documentElement.clientWidth);
        reel.style.setProperty('--pan', (-span * p).toFixed(1) + 'px');
      } else reel.style.removeProperty('--pan');
    }

    // Eight languages: the lit line follows progress, and the room's lamp moves to it.
    if (tongues && tongueLines.length) {
      const r = tongues.getBoundingClientRect();
      const inView = r.top < vh && r.bottom > 0;
      let idx = -1;
      if (inView) {
        if (reduce.matches) idx = -1;
        else {
          const p = clamp((-r.top + vh * 0.15) / Math.max(1, r.height - vh), 0, 0.999);
          idx = Math.floor(p * tongueLines.length);
          // Not pinned (phone): light the line nearest the middle of the screen.
          if (getComputedStyle(tongues.firstElementChild).position !== 'sticky') {
            let best = Infinity;
            tongueLines.forEach((li, i) => { const lr = li.getBoundingClientRect(); const d = Math.abs(lr.top + lr.height / 2 - vh * 0.5); if (d < best) { best = d; idx = i; } });
          }
        }
      }
      tongueLines.forEach((li, i) => li.classList.toggle('is-lit', i === idx));
      if (idx >= 0) {
        const lr = tongueLines[idx].getBoundingClientRect();
        lamp.x = (lr.left + Math.min(lr.width, 520) * 0.5) / innerWidth;
        lamp.y = (lr.top + lr.height / 2) / innerWidth; // Width units, like the shader.
        lamp.tz = 1;
      } else lamp.tz = 0;
    }
  };
  const onScroll = () => { if (!ticking) { ticking = true; requestAnimationFrame(update); } };
  addEventListener('scroll', onScroll, { passive: true });
  addEventListener('resize', onScroll);
  reduce.addEventListener('change', onScroll);
  update();
})();
