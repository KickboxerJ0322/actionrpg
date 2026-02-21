const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const heartsEl = document.getElementById('hearts');
const scoreEl = document.getElementById('score');
const stickBase = document.getElementById('stickBase');
const stickKnob = document.getElementById('stickKnob');
const gameOverPanel = document.getElementById('gameOverPanel');
const retryBtn = document.getElementById('retryBtn');
const pauseBtn = document.getElementById('pauseBtn');
const attackBtn = document.getElementById('attackBtn');
const magicBtn = document.getElementById('magicBtn');

const ATTACK_DURATION = 0.24;
const player = {
  x: canvas.width / 2,
  y: canvas.height * 0.73,
  r: 18,
  speed: 230,
  hp: 5,
  facingX: 0,
  facingY: -1,
  attackTime: 0,
  attackDirX: 0,
  attackDirY: -1,
  invulnTime: 0,
};
const enemies = [];
const ENEMY_MAX = 6;
let enemyTargetCount = 1;
let enemyGrowthTimer = 0;
const ENEMY_GROWTH_INTERVAL = 22;
const projectiles = [];
const input = { x: 0, y: 0, attack: false, magic: false };
const keys = new Set();
const stick = { active: false, x: 0, y: 0 };
let worldTime = 0;
let score = 0;
let isPaused = false;
let isGameOver = false;

function setPaused(nextPaused) {
  if (isGameOver) return;
  isPaused = nextPaused;
  pauseBtn.textContent = isPaused ? '▶️' : '⏸️';
}

function setGameOver(nextGameOver) {
  isGameOver = nextGameOver;
  gameOverPanel.classList.toggle('hidden', !isGameOver);
}

let audioCtx = null;
let bgmStarted = false;
const bgm = new Audio('./野良猫は宇宙を目指した_2.mp3');
bgm.loop = true;
bgm.volume = 0.5;

function startBgm() {
  if (bgmStarted) return;
  bgmStarted = true;
  bgm.play().catch(() => {
    bgmStarted = false;
  });
}

function ensureAudio() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (audioCtx.state === 'suspended') audioCtx.resume();
  startBgm();
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
  playTone({ freq: 780, duration: 0.05, type: 'square', volume: 0.1 });
  playTone({ freq: 520, duration: 0.07, type: 'triangle', volume: 0.07 });
}
function playPlayerDamagedSfx() {
  ensureAudio();
  playTone({ freq: 180, duration: 0.12, type: 'sawtooth', volume: 0.12 });
}
function playEnemyDefeatedSfx() {
  ensureAudio();
  playTone({ freq: 440, duration: 0.08, type: 'triangle', volume: 0.1 });
  playTone({ freq: 660, duration: 0.1, type: 'square', volume: 0.09 });
  playTone({ freq: 880, duration: 0.14, type: 'triangle', volume: 0.08 });
}


function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
function normalize(x, y) {
  const m = Math.hypot(x, y) || 1;
  return { x: x / m, y: y / m };
}
function updateHearts() { heartsEl.textContent = '❤️'.repeat(Math.max(0, player.hp)); }
function updateScore() { scoreEl.textContent = `Score: ${score}`; }

function knockbackTarget(target, fromX, fromY, distance) {
  const away = normalize(target.x - fromX, target.y - fromY);
  target.x += away.x * distance;
  target.y += away.y * distance;
}

function createEnemy() {
  return {
    x: 120 + Math.random() * (canvas.width - 240),
    y: 120 + Math.random() * Math.max(180, canvas.height * 0.35),
    r: 20,
    hp: 8,
    hitCooldown: 0,
  };
}

function refillEnemies() {
  while (enemies.length < enemyTargetCount) enemies.push(createEnemy());
}

function resetGame() {
  score = 0;
  updateScore();
  player.hp = 5;
  player.x = canvas.width / 2;
  player.y = canvas.height * 0.73;
  player.invulnTime = 0;
  player.attackTime = 0;
  player.facingX = 0;
  player.facingY = -1;
  player.attackDirX = 0;
  player.attackDirY = -1;
  projectiles.length = 0;
  enemies.length = 0;
  enemyTargetCount = 1;
  enemyGrowthTimer = 0;
  refillEnemies();
  updateHearts();
  isPaused = false;
  pauseBtn.textContent = '⏸️';
  setGameOver(false);
}

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
  const dir = getAutoAimDirection();
  projectiles.push({ x: player.x + dir.x * 26, y: player.y + dir.y * 26, vx: dir.x * 420, vy: dir.y * 420, ttl: 0.9, r: 8 });
}

function getAutoAimDirection() {
  if (enemies.length > 0) {
    let nearest = enemies[0];
    let nearestDist = Math.hypot(nearest.x - player.x, nearest.y - player.y);
    for (let i = 1; i < enemies.length; i += 1) {
      const e = enemies[i];
      const d = Math.hypot(e.x - player.x, e.y - player.y);
      if (d < nearestDist) {
        nearest = e;
        nearestDist = d;
      }
    }
    return normalize(nearest.x - player.x, nearest.y - player.y);
  }
  return normalize(player.facingX, player.facingY);
}

window.addEventListener('keydown', (e) => {
  keys.add(e.code);
  if (e.code === 'Space') input.attack = true;
  if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') input.magic = true;
  if (e.code === 'KeyP') setPaused(!isPaused);
});
window.addEventListener('keyup', (e) => keys.delete(e.code));
window.addEventListener('pointerdown', ensureAudio, { passive: true });
window.addEventListener('keydown', ensureAudio);
attackBtn.addEventListener('pointerdown', () => { input.attack = true; });
magicBtn.addEventListener('pointerdown', () => { input.magic = true; });
pauseBtn.addEventListener('pointerdown', () => setPaused(!isPaused));
retryBtn.addEventListener('pointerdown', () => resetGame());

let last = performance.now();
function loop(now) {
  const dt = Math.min(0.033, (now - last) / 1000);
  last = now;

  if (isPaused) {
    render();
    requestAnimationFrame(loop);
    return;
  }
  if (isGameOver) {
    render();
    requestAnimationFrame(loop);
    return;
  }

  worldTime += dt;
  enemyGrowthTimer += dt;
  if (enemyGrowthTimer >= ENEMY_GROWTH_INTERVAL) {
    enemyGrowthTimer = 0;
    enemyTargetCount = Math.min(ENEMY_MAX, enemyTargetCount + 1);
  }
  refillEnemies();

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
    const dir = getAutoAimDirection();
    player.facingX = dir.x;
    player.facingY = dir.y;
    player.attackDirX = dir.x;
    player.attackDirY = dir.y;
    player.attackTime = ATTACK_DURATION;
    const swordX = player.x + dir.x * 46;
    const swordY = player.y + dir.y * 46;
    for (const e of enemies) {
      if (Math.hypot(e.x - swordX, e.y - swordY) < e.r + 20) {
        e.hp -= 2;
        knockbackTarget(e, player.x, player.y, 16);
        playHitEnemySfx();
      }
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

    let hitEnemy = false;
    for (const e of enemies) {
      if (Math.hypot(e.x - p.x, e.y - p.y) < e.r + p.r) {
        e.hp -= 2;
        knockbackTarget(e, p.x, p.y, 24);
        playHitEnemySfx();
        hitEnemy = true;
        break;
      }
    }
    if (hitEnemy) {
      projectiles.splice(i, 1);
      continue;
    }
    if (p.ttl <= 0 || p.x < -20 || p.y < -20 || p.x > canvas.width + 20 || p.y > canvas.height + 20) {
      projectiles.splice(i, 1);
    }
  }

  for (const e of enemies) {
    const toPlayer = normalize(player.x - e.x, player.y - e.y);
    e.x += toPlayer.x * 78 * dt;
    e.y += toPlayer.y * 78 * dt;
    e.x = clamp(e.x, e.r, canvas.width - e.r);
    e.y = clamp(e.y, e.r, canvas.height - e.r);
    if (e.hitCooldown > 0) e.hitCooldown -= dt;
  }

  if (player.invulnTime > 0) player.invulnTime -= dt;
  if (player.invulnTime <= 0) {
    for (const e of enemies) {
      const collide = Math.hypot(e.x - player.x, e.y - player.y) < e.r + player.r;
      if (collide && e.hitCooldown <= 0) {
        player.hp -= 1;
        player.invulnTime = 1.0;
        knockbackTarget(player, e.x, e.y, 28);
        player.x = clamp(player.x, player.r, canvas.width - player.r);
        player.y = clamp(player.y, player.r, canvas.height - player.r);
        playPlayerDamagedSfx();
        e.hitCooldown = 1.0;
        break;
      }
    }
  }

  for (let i = enemies.length - 1; i >= 0; i -= 1) {
    if (enemies[i].hp <= 0) {
      score += 100;
      updateScore();
      playEnemyDefeatedSfx();
      enemies.splice(i, 1);
    }
  }
  refillEnemies();
  if (player.hp <= 0) {
    setGameOver(true);
    setPaused(false);
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
    const progress = 1 - player.attackTime / ATTACK_DURATION;
    const swingAngle = Math.atan2(player.attackDirY, player.attackDirX) + (-0.9 + progress * 1.8);
    const start = swingAngle - 0.24;
    const end = swingAngle + 0.24;
    const slashRadius = 50;
    ctx.strokeStyle = '#fde047cc';
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.arc(player.x, player.y - 2, slashRadius, start, end);
    ctx.stroke();
  }

  ctx.fillStyle = '#a855f7';
  for (const p of projectiles) {
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    ctx.fill();
  }

  for (const e of enemies) {
    drawEnemy(e, worldTime);
    ctx.fillStyle = '#111827';
    ctx.fillRect(e.x - 24, e.y - 34, 48, 6);
    ctx.fillStyle = '#ef4444';
    ctx.fillRect(e.x - 24, e.y - 34, (48 * e.hp) / 8, 6);
  }

  if (isPaused) {
    ctx.fillStyle = '#00000088';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#f8fafc';
    ctx.font = 'bold 52px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('PAUSED', canvas.width / 2, canvas.height / 2);
    ctx.font = '24px sans-serif';
    ctx.fillText('⏸️ でもう一度再開', canvas.width / 2, canvas.height / 2 + 40);
  }
  if (isGameOver) {
    ctx.fillStyle = '#00000099';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#fca5a5';
    ctx.font = 'bold 62px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('GAME OVER', canvas.width / 2, canvas.height / 2 - 10);
  }
}

function drawPlayer(p, time) {
  if (p.invulnTime > 0 && Math.floor(time * 20) % 2 === 0) return;
  const bob = Math.sin(time * 10) * 1.5;

  ctx.fillStyle = '#00000050';
  ctx.beginPath();
  ctx.ellipse(p.x, p.y + 22, 18, 7, 0, 0, Math.PI * 2);
  ctx.fill();

  // cape
  ctx.fillStyle = '#7c2d12';
  ctx.beginPath();
  ctx.moveTo(p.x - 12, p.y - 2 + bob);
  ctx.lineTo(p.x + 12, p.y - 2 + bob);
  ctx.lineTo(p.x + 6, p.y + 20 + bob);
  ctx.lineTo(p.x - 6, p.y + 20 + bob);
  ctx.closePath();
  ctx.fill();

  // torso armor
  ctx.fillStyle = '#475569';
  ctx.fillRect(p.x - 12, p.y - 11 + bob, 24, 23);
  ctx.fillStyle = '#cbd5e1';
  ctx.fillRect(p.x - 3, p.y - 11 + bob, 6, 23);
  ctx.fillStyle = '#9ca3af';
  ctx.fillRect(p.x - 14, p.y - 6 + bob, 3, 12);
  ctx.fillRect(p.x + 11, p.y - 6 + bob, 3, 12);

  // helmet
  ctx.fillStyle = '#e5e7eb';
  ctx.beginPath();
  ctx.arc(p.x, p.y - 15 + bob, 9, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#7f1d1d';
  ctx.fillRect(p.x - 1, p.y - 24 + bob, 2, 8);
  ctx.beginPath();
  ctx.moveTo(p.x, p.y - 24 + bob);
  ctx.lineTo(p.x + 8, p.y - 20 + bob);
  ctx.lineTo(p.x + 2, p.y - 18 + bob);
  ctx.closePath();
  ctx.fill();

  // visor slit
  ctx.fillStyle = '#111827';
  ctx.fillRect(p.x - 4, p.y - 16 + bob, 8, 2);

  // legs
  ctx.fillStyle = '#9ca3af';
  ctx.fillRect(p.x - 8, p.y + 12 + bob, 5, 9);
  ctx.fillRect(p.x + 3, p.y + 12 + bob, 5, 9);

  // sword and swing pose
  const attackProgress = p.attackTime > 0 ? 1 - p.attackTime / ATTACK_DURATION : 0;
  const baseAngle = Math.atan2(p.facingY, p.facingX);
  const attackAngle = Math.atan2(p.attackDirY, p.attackDirX);
  const swordAngle = p.attackTime > 0
    ? attackAngle + (-0.95 + attackProgress * 1.9)
    : baseAngle + 0.12;
  const swordBaseX = p.x + Math.cos(swordAngle) * 9;
  const swordBaseY = p.y - 2 + bob + Math.sin(swordAngle) * 9;
  const swordTipX = swordBaseX + Math.cos(swordAngle) * 26;
  const swordTipY = swordBaseY + Math.sin(swordAngle) * 26;

  ctx.strokeStyle = '#e2e8f0';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(swordBaseX, swordBaseY);
  ctx.lineTo(swordTipX, swordTipY);
  ctx.stroke();

  ctx.strokeStyle = '#94a3b8';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(swordBaseX + Math.cos(swordAngle) * 4, swordBaseY + Math.sin(swordAngle) * 4);
  ctx.lineTo(swordTipX - Math.cos(swordAngle) * 2, swordTipY - Math.sin(swordAngle) * 2);
  ctx.stroke();

  ctx.fillStyle = '#f59e0b';
  ctx.fillRect(swordBaseX - 3, swordBaseY - 3, 6, 6);
}

function drawEnemy(e, time) {
  const pulse = 1 + Math.sin(time * 7) * 0.06;
  const size = 24 * pulse;

  ctx.fillStyle = '#00000040';
  ctx.beginPath();
  ctx.ellipse(e.x, e.y + 23, 18, 6, 0, 0, Math.PI * 2);
  ctx.fill();

  // slime body
  const grad = ctx.createRadialGradient(e.x - 5, e.y - 8, 4, e.x, e.y, size);
  grad.addColorStop(0, '#93c5fd');
  grad.addColorStop(1, '#2563eb');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.moveTo(e.x - size / 2, e.y + 8);
  ctx.quadraticCurveTo(e.x - size / 2, e.y - size / 3, e.x, e.y - size / 2);
  ctx.quadraticCurveTo(e.x + size / 2, e.y - size / 3, e.x + size / 2, e.y + 8);
  ctx.quadraticCurveTo(e.x + size / 4, e.y + size / 2, e.x, e.y + size / 2);
  ctx.quadraticCurveTo(e.x - size / 4, e.y + size / 2, e.x - size / 2, e.y + 8);
  ctx.fill();

  // slime shine
  ctx.fillStyle = '#dbeafe88';
  ctx.beginPath();
  ctx.ellipse(e.x - 6, e.y - 8, 6, 3, -0.4, 0, Math.PI * 2);
  ctx.fill();

  // eyes
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(e.x - 6, e.y - 1, 3, 4);
  ctx.fillRect(e.x + 3, e.y - 1, 3, 4);
}

setupStick();
refillEnemies();
updateHearts();
updateScore();
requestAnimationFrame(loop);
