const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const heartsEl = document.getElementById('hearts');
const stickBase = document.getElementById('stickBase');
const stickKnob = document.getElementById('stickKnob');
const attackBtn = document.getElementById('attackBtn');
const magicBtn = document.getElementById('magicBtn');

const player = { x: 270, y: 700, r: 18, speed: 230, hp: 5, facingX: 0, facingY: -1, attackTime: 0 };
const enemy = { x: 270, y: 220, r: 20, hp: 8, hitCooldown: 0 };
const projectiles = [];
const input = { x: 0, y: 0, attack: false, magic: false };
const keys = new Set();
const stick = { active: false, x: 0, y: 0 };
let worldTime = 0;

let audioCtx = null;
function ensureAudio() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (audioCtx.state === 'suspended') audioCtx.resume();
}
function playTone({ freq = 440, duration = 0.08, type = 'sine', volume = 0.04 }) {
  if (!audioCtx) return;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(volume, audioCtx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + duration);
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  osc.start();
  osc.stop(audioCtx.currentTime + duration);
}
function playHitEnemySfx() {
  ensureAudio();
  playTone({ freq: 780, duration: 0.05, type: 'square', volume: 0.03 });
  playTone({ freq: 520, duration: 0.07, type: 'triangle', volume: 0.02 });
}
function playPlayerDamagedSfx() {
  ensureAudio();
  playTone({ freq: 180, duration: 0.12, type: 'sawtooth', volume: 0.045 });
}


function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
function normalize(x, y) {
  const m = Math.hypot(x, y) || 1;
  return { x: x / m, y: y / m };
}
function updateHearts() { heartsEl.textContent = '❤️'.repeat(Math.max(0, player.hp)); }

function setupStick() {
  const center = () => {
    const rect = stickBase.getBoundingClientRect();
    return { cx: rect.left + rect.width / 2, cy: rect.top + rect.height / 2 };
  };
  const apply = (px, py) => {
    const { cx, cy } = center();
    let dx = px - cx;
    let dy = py - cy;
    const len = Math.hypot(dx, dy);
    const maxLen = 36;
    if (len > maxLen) {
      dx = (dx / len) * maxLen;
      dy = (dy / len) * maxLen;
    }
    stickKnob.style.transform = `translate(${dx}px, ${dy}px)`;
    stick.x = dx / maxLen;
    stick.y = dy / maxLen;
  };

  stickBase.addEventListener('pointerdown', (e) => { stick.active = true; apply(e.clientX, e.clientY); });
  window.addEventListener('pointermove', (e) => { if (stick.active) apply(e.clientX, e.clientY); });
  window.addEventListener('pointerup', () => {
    stick.active = false;
    stick.x = 0;
    stick.y = 0;
    stickKnob.style.transform = 'translate(0px, 0px)';
  });
}

function spawnMagic() {
  const dir = normalize(player.facingX, player.facingY);
  projectiles.push({ x: player.x + dir.x * 26, y: player.y + dir.y * 26, vx: dir.x * 420, vy: dir.y * 420, ttl: 0.9, r: 8 });
}

window.addEventListener('keydown', (e) => {
  keys.add(e.code);
  if (e.code === 'Space') input.attack = true;
  if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') input.magic = true;
});
window.addEventListener('keyup', (e) => keys.delete(e.code));
window.addEventListener('pointerdown', ensureAudio, { passive: true });
window.addEventListener('keydown', ensureAudio);
attackBtn.addEventListener('pointerdown', () => { input.attack = true; });
magicBtn.addEventListener('pointerdown', () => { input.magic = true; });

let last = performance.now();
function loop(now) {
  const dt = Math.min(0.033, (now - last) / 1000);
  last = now;
  worldTime += dt;

  if (keys.has('KeyW')) input.y = -1;
  else if (keys.has('KeyS')) input.y = 1;
  else input.y = stick.y;

  if (keys.has('KeyA')) input.x = -1;
  else if (keys.has('KeyD')) input.x = 1;
  else input.x = stick.x;

  const n = normalize(input.x, input.y);
  if (Math.hypot(input.x, input.y) > 0.1) {
    player.x += n.x * player.speed * dt;
    player.y += n.y * player.speed * dt;
    player.facingX = n.x;
    player.facingY = n.y;
  }

  player.x = clamp(player.x, player.r, canvas.width - player.r);
  player.y = clamp(player.y, player.r, canvas.height - player.r);

  if (input.attack && player.attackTime <= 0) {
    player.attackTime = 0.16;
    const swordX = player.x + player.facingX * 38;
    const swordY = player.y + player.facingY * 38;
    if (Math.hypot(enemy.x - swordX, enemy.y - swordY) < enemy.r + 20) {
      enemy.hp -= 1;
      playHitEnemySfx();
    }
  }
  if (input.magic) spawnMagic();
  input.attack = false;
  input.magic = false;

  for (let i = projectiles.length - 1; i >= 0; i -= 1) {
    const p = projectiles[i];
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.ttl -= dt;

    if (Math.hypot(enemy.x - p.x, enemy.y - p.y) < enemy.r + p.r) {
      enemy.hp -= 2;
      playHitEnemySfx();
      projectiles.splice(i, 1);
      continue;
    }
    if (p.ttl <= 0 || p.x < -20 || p.y < -20 || p.x > canvas.width + 20 || p.y > canvas.height + 20) {
      projectiles.splice(i, 1);
    }
  }

  const toPlayer = normalize(player.x - enemy.x, player.y - enemy.y);
  enemy.x += toPlayer.x * 78 * dt;
  enemy.y += toPlayer.y * 78 * dt;

  if (enemy.hitCooldown > 0) enemy.hitCooldown -= dt;
  const collide = Math.hypot(enemy.x - player.x, enemy.y - player.y) < enemy.r + player.r;
  if (collide && enemy.hitCooldown <= 0) {
    player.hp -= 1;
    playPlayerDamagedSfx();
    enemy.hitCooldown = 1.0;
  }

  if (enemy.hp <= 0) {
    enemy.hp = 8;
    enemy.x = 120 + Math.random() * 300;
    enemy.y = 120 + Math.random() * 260;
  }
  if (player.hp <= 0) {
    player.hp = 5;
    player.x = 270;
    player.y = 700;
  }

  player.attackTime = Math.max(0, player.attackTime - dt);
  updateHearts();
  render();
  requestAnimationFrame(loop);
}

function render() {
  ctx.fillStyle = '#14532d';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = '#84cc16';
  for (let i = 0; i < 45; i++) ctx.fillRect((i * 67) % canvas.width, (i * 59) % canvas.height, 4, 4);

  drawPlayer(player, worldTime);

  if (player.attackTime > 0) {
    ctx.fillStyle = '#fde047';
    ctx.beginPath();
    ctx.arc(player.x + player.facingX * 38, player.y + player.facingY * 38, 12, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.fillStyle = '#a855f7';
  for (const p of projectiles) {
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    ctx.fill();
  }

  drawEnemy(enemy, worldTime);

  ctx.fillStyle = '#111827';
  ctx.fillRect(enemy.x - 24, enemy.y - 34, 48, 6);
  ctx.fillStyle = '#ef4444';
  ctx.fillRect(enemy.x - 24, enemy.y - 34, (48 * enemy.hp) / 8, 6);
}

function drawPlayer(p, time) {
  const bob = Math.sin(time * 10) * 1.5;

  ctx.fillStyle = '#00000055';
  ctx.beginPath();
  ctx.ellipse(p.x, p.y + 20, 16, 7, 0, 0, Math.PI * 2);
  ctx.fill();

  // body
  ctx.fillStyle = '#1d4ed8';
  ctx.fillRect(p.x - 12, p.y - 12 + bob, 24, 24);

  // hood/highlight
  ctx.fillStyle = '#60a5fa';
  ctx.fillRect(p.x - 10, p.y - 10 + bob, 20, 8);

  // face
  ctx.fillStyle = '#fde68a';
  ctx.fillRect(p.x - 7, p.y - 2 + bob, 14, 8);

  // eyes
  ctx.fillStyle = '#111827';
  ctx.fillRect(p.x - 4, p.y + 1 + bob, 2, 2);
  ctx.fillRect(p.x + 2, p.y + 1 + bob, 2, 2);

  // direction marker (shield/hand)
  ctx.fillStyle = '#93c5fd';
  ctx.fillRect(p.x + p.facingX * 10 - 3, p.y + p.facingY * 10 - 3 + bob, 6, 6);
}

function drawEnemy(e, time) {
  const pulse = 1 + Math.sin(time * 7) * 0.04;
  const size = 22 * pulse;

  ctx.fillStyle = '#00000055';
  ctx.beginPath();
  ctx.ellipse(e.x, e.y + 22, 18, 7, 0, 0, Math.PI * 2);
  ctx.fill();

  // body
  ctx.fillStyle = '#b91c1c';
  ctx.beginPath();
  ctx.roundRect(e.x - size / 2, e.y - size / 2, size, size, 6);
  ctx.fill();

  // horn/highlight
  ctx.fillStyle = '#f87171';
  ctx.fillRect(e.x - 8, e.y - 13, 16, 5);

  // eyes
  ctx.fillStyle = '#fee2e2';
  ctx.fillRect(e.x - 6, e.y - 2, 3, 3);
  ctx.fillRect(e.x + 3, e.y - 2, 3, 3);
}

setupStick();
updateHearts();
requestAnimationFrame(loop);
