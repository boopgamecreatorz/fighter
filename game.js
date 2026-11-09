
const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

const W = canvas.width;
const H = canvas.height;
const FLOOR = 445;
const CEILING = 125;

const keys = {};

let mode = null;
let leftScore = 0;
let rightScore = 0;
let round = 1;

let gameState = "menu";
let stateTimer = 0;
let koOverlayTimer = 0;
let winner = null;

let effects = [];
let floatingTexts = [];
let lastTime = 0;

// TWO GAME MODES
const modes = {
  funny: {
    name: "FUNNY",
    hits: 3,
    verticalMovement: false,
    flyingKO: false,
    words: ["BONK!", "OOF!", "YEET!", "WHAM!"]
  },

  serious: {
    name: "NOT FUNNY",
    hits: 5,
    verticalMovement: true,
    flyingKO: true,
    words: ["POW!", "BAM!", "WHAM!", "KAPOW!"]
  }
};

// FIGHTERS
function createFighter(x, name, color, controls) {
  return {
    x,
    y: FLOOR,
    name,
    color,
    controls,

    facing: name === "RED" ? 1 : -1,

    health: 3,
    headHits: 0,

    ducking: false,
    blocking: false,

    action: "idle",
    actionTimer: 0,
    cooldown: 0,

    attackId: 0,
    lastAttackId: -1,

    jumpHeight: 0,
    jumpVelocity: 0,

    hitFlash: 0,

    knockedOut: false,
    fallAngle: 0,
    knockVelocityX: 0,
    knockVelocityY: 0,
    landed: false,

    victoryJump: 0,
    tears: 0
  };
}

const left = createFighter(260, "RED", "#e34b4b", {
  left: "a",
  right: "d",
  up: "w",
  down: "s",
  punch: "r",
  kick: "q",
  block: "e"
});

const right = createFighter(700, "BLUE", "#438cff", {
  left: "arrowleft",
  right: "arrowright",
  up: "arrowup",
  down: "arrowdown",
  punch: "i",
  kick: "p",
  block: "o"
});

// STARTING AND MENU
function startMode(selectedMode) {
  mode = selectedMode;

  leftScore = 0;
  rightScore = 0;
  round = 1;
  winner = null;

  effects = [];
  floatingTexts = [];

  resetFighter(left, 260);
  resetFighter(right, 700);

  gameState = "playing";
  updateScoreboard();
}

function returnToMenu() {
  gameState = "menu";
  mode = null;

  leftScore = 0;
  rightScore = 0;
  round = 1;
  winner = null;

  effects = [];
  floatingTexts = [];

  resetFighter(left, 260);
  resetFighter(right, 700);

  updateScoreboard();
}

// INPUT
document.addEventListener("keydown", e => {
  const key = e.key.toLowerCase();

  if (key.startsWith("arrow")) {
    e.preventDefault();
  }

  if (gameState === "menu") {
    if (key === "1") startMode("funny");
    if (key === "2") startMode("serious");
    return;
  }

  if (key === "m") {
    returnToMenu();
    return;
  }

  if (!keys[key]) {
    handleAction(left, key);
    handleAction(right, key);
  }

  keys[key] = true;

  if (gameState === "finished" && key === "enter") {
    restartMatch();
  }
});

document.addEventListener("keyup", e => {
  keys[e.key.toLowerCase()] = false;
});

function handleAction(f, key) {
  if (gameState !== "playing" || f.knockedOut) return;

  if (key === f.controls.punch) attack(f, "punch");
  if (key === f.controls.kick) attack(f, "kick");
}

// ATTACKS
function attack(f, type) {
  if (f.cooldown > 0) return;
  if (f.blocking || f.ducking) return;

  f.action = type;
  f.actionTimer = type === "kick" ? 0.65 : 0.3;
  f.cooldown = type === "kick" ? 0.5 : 0.2;

  f.attackId++;
}

function getHead(f) {
  const baseY = mode && modes[mode].verticalMovement
    ? f.y
    : FLOOR - f.jumpHeight;

  return {
    x: f.x,
    y: baseY - (f.ducking ? 65 : 105)
  };
}

function checkAttack(attacker, defender) {
  if (attacker.knockedOut || defender.knockedOut) return;

  if (attacker.action !== "punch" && attacker.action !== "kick") {
    return;
  }

  if (attacker.lastAttackId === attacker.attackId) return;

  const duration = attacker.action === "kick" ? 0.65 : 0.3;
  const progress = 1 - attacker.actionTimer / duration;

  if (progress < 0.25 || progress > 0.75) return;

  const head = getHead(defender);
  const attackerHead = getHead(attacker);

  const horizontalDistance =
    (head.x - attacker.x) * attacker.facing;

  const reach = attacker.action === "kick" ? 145 : 100;

  if (horizontalDistance < 0 || horizontalDistance > reach) return;

  if (Math.abs(head.y - attackerHead.y) > 48) return;

  attacker.lastAttackId = attacker.attackId;

  if (defender.blocking) {
    addText("BLOCK!", defender.x, defender.y - 140, "#fff", 22);

    effects.push({
      type: "block",
      x: defender.x,
      y: head.y,
      life: 0.3,
      maxLife: 0.3
    });

    return;
  }

  defender.headHits++;
  defender.health = Math.max(0, modes[mode].hits - defender.headHits);
  defender.hitFlash = 0.2;

  addImpact(head.x, head.y);

  defender.x += attacker.facing * 12;
  defender.x = Math.max(35, Math.min(W - 35, defender.x));

  if (defender.headHits >= modes[mode].hits) {
    knockOut(defender, attacker);
  }
}

// KNOCKOUTS
function knockOut(f, attacker) {
  if (f.knockedOut) return;

  f.knockedOut = true;
  f.action = "fall";

  f.landed = false;

  if (modes[mode].flyingKO) {
    const direction = attacker.facing;

    f.knockVelocityX = direction * 390;
    f.knockVelocityY = -470;
  } else {
    f.knockVelocityX = 0;
    f.knockVelocityY = 0;
  }

  if (f === left) {
    rightScore++;
  } else {
    leftScore++;
  }

  gameState = "ko";
  stateTimer = 3.2;
  koOverlayTimer = 0.8;

  addText("KNOCKOUT!", W / 2, 145, "#fff", 48);

  updateScoreboard();
}

function updateKnockout(f, dt) {
  if (!f.knockedOut || f.landed) return;

  if (modes[mode].flyingKO) {
    f.x += f.knockVelocityX * dt;
    f.y += f.knockVelocityY * dt;

    f.knockVelocityY += 1050 * dt;
    f.knockVelocityX *= Math.pow(0.985, dt * 60);

    f.x = Math.max(30, Math.min(W - 30, f.x));

    const direction = Math.sign(f.knockVelocityX || 1);
    f.fallAngle += direction * dt * 5;

    if (f.y >= FLOOR) {
      f.y = FLOOR;
      f.knockVelocityY = 0;
      f.knockVelocityX = 0;

      f.fallAngle = Math.sign(f.fallAngle || direction) * Math.PI / 2;
      f.landed = true;

      addText("DOWN!", f.x, f.y - 35, "#fff", 22);
    }
  } else {
    f.fallAngle = Math.min(Math.PI / 2, f.fallAngle + dt * 4);

    if (f.fallAngle >= Math.PI / 2) {
      f.landed = true;
    }
  }
}

// SCOREBOARD
function updateScoreboard() {
  document.getElementById("left-score").textContent = leftScore;
  document.getElementById("right-score").textContent = rightScore;

  document.getElementById("round-status").textContent =
    gameState === "finished" ? "MATCH OVER" : "ROUND " + round;
}

// RESETTING
function resetFighter(f, x) {
  f.x = x;
  f.y = FLOOR;

  f.health = modes[mode]?.hits || 3;
  f.headHits = 0;

  f.ducking = false;
  f.blocking = false;

  f.action = "idle";
  f.actionTimer = 0;
  f.cooldown = 0;

  f.attackId = 0;
  f.lastAttackId = -1;

  f.jumpHeight = 0;
  f.jumpVelocity = 0;

  f.hitFlash = 0;

  f.knockedOut = false;
  f.fallAngle = 0;
  f.knockVelocityX = 0;
  f.knockVelocityY = 0;
  f.landed = false;

  f.victoryJump = 0;
  f.tears = 0;
}

function resetRound() {
  resetFighter(left, 260);
  resetFighter(right, 700);

  round++;

  effects = [];
  floatingTexts = [];

  gameState = "playing";
  updateScoreboard();
}

function finishMatch() {
  gameState = "finished";

  winner = leftScore >= 3 ? left : right;

  winner.action = "victory";

  const loser = winner === left ? right : left;
  loser.action = "sad";

  updateScoreboard();
}

function restartMatch() {
  leftScore = 0;
  rightScore = 0;
  round = 1;

  winner = null;

  effects = [];
  floatingTexts = [];

  resetFighter(left, 260);
  resetFighter(right, 700);

  gameState = "playing";
  updateScoreboard();
}

// MOVEMENT
function updateMovement(f, opponent, dt) {
  if (f.knockedOut) return;

  const c = f.controls;

  f.blocking = !!keys[c.block];
  f.ducking = !!keys[c.down];

  if (f.action === "punch" || f.action === "kick") return;

  let dx = 0;
  let dy = 0;

  if (keys[c.left]) dx--;
  if (keys[c.right]) dx++;

  if (modes[mode].verticalMovement) {
    if (keys[c.up]) dy--;
    if (keys[c.down]) dy++;
  } else {
    if (keys[c.up] && f.jumpHeight === 0 && !f.ducking) {
      f.jumpVelocity = 460;
    }

    if (f.jumpHeight > 0 || f.jumpVelocity > 0) {
      f.jumpHeight += f.jumpVelocity * dt;
      f.jumpVelocity -= 1100 * dt;

      if (f.jumpHeight <= 0) {
        f.jumpHeight = 0;
        f.jumpVelocity = 0;
      }
    }
  }

  if (dx !== 0 || dy !== 0) {
    const length = Math.hypot(dx, dy);
    dx /= length;
    dy /= length;

    f.x += dx * 245 * dt;

    if (modes[mode].verticalMovement) {
      f.y += dy * 245 * dt;
    }
  }

  f.x = Math.max(35, Math.min(W - 35, f.x));

  if (modes[mode].verticalMovement) {
    f.y = Math.max(CEILING, Math.min(FLOOR, f.y));
  }

  f.facing = opponent.x > f.x ? 1 : -1;

  if (f.blocking) {
    f.action = "block";
  } else if (f.ducking) {
    f.action = "duck";
  } else {
    f.action = "idle";
  }
}

// FIGHTER UPDATE
function updateFighter(f, opponent, dt) {
  f.cooldown = Math.max(0, f.cooldown - dt);
  f.actionTimer = Math.max(0, f.actionTimer - dt);
  f.hitFlash = Math.max(0, f.hitFlash - dt);

  if (f.knockedOut) {
    updateKnockout(f, dt);
    return;
  }

  if (
    f.actionTimer <= 0 &&
    (f.action === "punch" || f.action === "kick")
  ) {
    f.action = "idle";
  }

  updateMovement(f, opponent, dt);
  checkAttack(f, opponent);
}

// EFFECTS
function addText(text, x, y, color = "#fff", size = 24) {
  floatingTexts.push({
    text,
    x,
    y,
    color,
    size,
    life: 0.8,
    maxLife: 0.8
  });
}

function addImpact(x, y) {
  effects.push({
    type: "impact",
    x,
    y,
    life: 0.25,
    maxLife: 0.25
  });

  const words = modes[mode].words;

  addText(
    words[Math.floor(Math.random() * words.length)],
    x,
    y - 35,
    "#fff",
    28
  );
}

// ARENA
function drawArena() {
  ctx.fillStyle = "#111";
  ctx.fillRect(0, 0, W, H);

  ctx.strokeStyle = "#242424";
  ctx.lineWidth = 1;

  for (let x = 0; x < W; x += 60) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, FLOOR);
    ctx.stroke();
  }

  ctx.fillStyle = "#222";
  ctx.fillRect(0, FLOOR + 5, W, H - FLOOR);

  ctx.strokeStyle = "#fff";
  ctx.lineWidth = 3;

  ctx.beginPath();
  ctx.moveTo(0, FLOOR + 5);
  ctx.lineTo(W, FLOOR + 5);
  ctx.stroke();

  ctx.strokeStyle = "#444";
  ctx.setLineDash([10, 12]);

  ctx.beginPath();
  ctx.moveTo(W / 2, 0);
  ctx.lineTo(W / 2, FLOOR);
  ctx.stroke();

  ctx.setLineDash([]);
}

// DRAW FIGHTERS
function drawFighter(f) {
  const facing = f.facing;

  const baseY = modes[mode].verticalMovement
    ? f.y
    : FLOOR - f.jumpHeight;

  ctx.save();
  ctx.translate(f.x, baseY);

  if (f.knockedOut) {
    ctx.rotate(f.fallAngle);
  }

  ctx.fillStyle = "#000";
  ctx.globalAlpha = 0.4;

  ctx.beginPath();
  ctx.ellipse(0, 3, 35, 8, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.globalAlpha = 1;

  let lean = 0;

  if (f.action === "kick" && !f.knockedOut) {
    const progress = 1 - f.actionTimer / 0.65;
    lean = Math.sin(progress * Math.PI) * -facing * 0.3;
  }

  ctx.rotate(lean);

  const crouching = f.ducking && !f.knockedOut;
  const headY = crouching ? -65 : -105;
  const bodyTop = crouching ? -62 : -83;
  const bodyBottom = crouching ? -25 : -27;

  // Legs
  ctx.strokeStyle = f.hitFlash > 0 ? "#aaa" : "#fff";
  ctx.lineWidth = 12;
  ctx.lineCap = "square";

  if (f.action === "kick" && !f.knockedOut) {
    const progress = 1 - f.actionTimer / 0.65;
    const extension = Math.sin(progress * Math.PI);

    ctx.beginPath();
    ctx.moveTo(-8, bodyBottom);
    ctx.lineTo(-13, 0);
    ctx.stroke();

    ctx.lineWidth = 11;

    ctx.beginPath();
    ctx.moveTo(8, bodyBottom);
    ctx.lineTo(facing * (22 + extension * 100), -100);
    ctx.stroke();
  } else {
    ctx.beginPath();
    ctx.moveTo(-9, bodyBottom);
    ctx.lineTo(-13, 0);

    ctx.moveTo(9, bodyBottom);
    ctx.lineTo(13, 0);
    ctx.stroke();
  }

  // Body
  ctx.fillStyle = f.hitFlash > 0 ? "#bbb" : "#fff";
  ctx.fillRect(-21, bodyTop, 42, bodyBottom - bodyTop);

  ctx.fillStyle = "#111";
  ctx.fillRect(-22, bodyBottom - 5, 44, 7);

  // Arms
  ctx.strokeStyle = f.hitFlash > 0 ? "#aaa" : "#fff";
  ctx.lineWidth = 11;

  if (f.blocking && !f.knockedOut) {
    ctx.beginPath();
    ctx.moveTo(-16, bodyTop + 13);
    ctx.lineTo(0, headY + 10);
    ctx.lineTo(16, bodyTop + 13);
    ctx.stroke();
  } else if (f.action === "punch" && !f.knockedOut) {
    const progress = 1 - f.actionTimer / 0.3;
    const extension = Math.sin(progress * Math.PI);

    ctx.beginPath();
    ctx.moveTo(-17, bodyTop + 13);
    ctx.lineTo(facing * (20 + extension * 60), bodyTop + 13);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(-17, bodyTop + 25);
    ctx.lineTo(-25, bodyBottom);
    ctx.stroke();
  } else {
    ctx.beginPath();
    ctx.moveTo(-17, bodyTop + 13);
    ctx.lineTo(-28, bodyBottom);

    ctx.moveTo(17, bodyTop + 13);
    ctx.lineTo(28, bodyBottom);
    ctx.stroke();
  }

  // Head
  ctx.fillStyle = f.hitFlash > 0 ? "#ccc" : "#fff";

  ctx.beginPath();
  ctx.arc(0, headY, 23, 0, Math.PI * 2);
  ctx.fill();

  // Eyes
  ctx.fillStyle = "#111";
  ctx.fillRect(facing * 5 - 3, headY - 3, 5, 4);
  ctx.fillRect(facing * 13 - 3, headY - 3, 5, 4);

  // Headband
  ctx.fillStyle = f.color;
  ctx.fillRect(-24, headY - 13, 48, 8);

  ctx.beginPath();
  ctx.moveTo(-18, headY - 9);
  ctx.lineTo(-37, headY - 22);
  ctx.lineTo(-31, headY - 4);
  ctx.fill();

  // Health markers
  for (let i = 0; i < modes[mode].hits; i++) {
    ctx.fillStyle = i < f.health ? f.color : "#444";
    ctx.fillRect(
      -30 + i * (60 / modes[mode].hits),
      headY - 37,
      10,
      5
    );
  }

  if (f.blocking && !f.knockedOut) {
    ctx.fillStyle = "#fff";
    ctx.font = "bold 12px monospace";
    ctx.textAlign = "center";
    ctx.fillText("BLOCK", 0, headY - 30);
  }

  ctx.restore();
}

// IMPACT EFFECTS
function drawEffects() {
  for (const e of effects) {
    const alpha = e.life / e.maxLife;

    ctx.globalAlpha = alpha;
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 4;

    ctx.beginPath();

    if (e.type === "impact") {
      ctx.arc(e.x, e.y, 10 + (1 - alpha) * 35, 0, Math.PI * 2);
    } else {
      ctx.rect(e.x - 18, e.y - 18, 36, 36);
    }

    ctx.stroke();
  }

  ctx.globalAlpha = 1;
}

function drawFloatingTexts() {
  for (const t of floatingTexts) {
    ctx.globalAlpha = Math.max(0, t.life / t.maxLife);
    ctx.fillStyle = t.color;
    ctx.font = `bold ${t.size}px monospace`;
    ctx.textAlign = "center";
    ctx.fillText(t.text, t.x, t.y);
  }

  ctx.globalAlpha = 1;
}

// KO SCREEN
function drawOverlay() {
  if (gameState === "playing") return;

  if (gameState === "ko" && koOverlayTimer > 0) return;

  ctx.fillStyle = "rgba(0,0,0,0.75)";
  ctx.fillRect(0, 0, W, H);

  ctx.textAlign = "center";
  ctx.fillStyle = "#fff";

  if (gameState === "ko") {
    ctx.font = "bold 72px monospace";
    ctx.fillText("K.O.!", W / 2, 210);

    ctx.font = "bold 30px monospace";
    ctx.fillText(leftScore + "  -  " + rightScore, W / 2, 270);

    ctx.font = "18px monospace";
    ctx.fillText("NEXT ROUND...", W / 2, 320);
  }

  if (gameState === "finished") {
    ctx.font = "bold 55px monospace";
    ctx.fillText("CHAMPION!", W / 2, 115);

    ctx.font = "bold 25px monospace";
    ctx.fillText(winner.name + " FIGHTER WINS!", W / 2, 165);

    ctx.font = "18px monospace";
    ctx.fillText("PRESS ENTER TO PLAY AGAIN", W / 2, 500);
    ctx.fillText("PRESS M FOR MENU", W / 2, 525);
  }
}

// VICTORY ANIMATIONS
function drawVictoryFighter(f, jump) {
  ctx.save();
  ctx.translate(f.x, FLOOR - jump);

  ctx.fillStyle = "#fff";
  ctx.fillRect(-21, -85, 42, 55);

  ctx.strokeStyle = "#fff";
  ctx.lineWidth = 12;

  ctx.beginPath();
  ctx.moveTo(-10, -30);
  ctx.lineTo(-20, -5);

  ctx.moveTo(10, -30);
  ctx.lineTo(20, -5);

  ctx.moveTo(-17, -72);
  ctx.lineTo(-38, -112);

  ctx.moveTo(17, -72);
  ctx.lineTo(38, -112);
  ctx.stroke();

  ctx.fillStyle = "#fff";
  ctx.beginPath();
  ctx.arc(0, -108, 23, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = f.color;
  ctx.fillRect(-24, -119, 48, 8);

  ctx.strokeStyle = "#111";
  ctx.lineWidth = 3;

  ctx.beginPath();
  ctx.arc(0, -105, 9, 0.1, Math.PI - 0.1);
  ctx.stroke();

  ctx.restore();
}

function drawSadFighter(f) {
  ctx.save();
  ctx.translate(f.x, FLOOR);

  ctx.fillStyle = "#aaa";
  ctx.fillRect(-21, -75, 42, 55);

  ctx.strokeStyle = "#aaa";
  ctx.lineWidth = 12;

  ctx.beginPath();
  ctx.moveTo(-17, -65);
  ctx.lineTo(-28, -35);

  ctx.moveTo(17, -65);
  ctx.lineTo(28, -35);

  ctx.moveTo(-9, -20);
  ctx.lineTo(-15, 0);

  ctx.moveTo(9, -20);
  ctx.lineTo(15, 0);
  ctx.stroke();

  ctx.fillStyle = "#fff";
  ctx.beginPath();
  ctx.arc(0, -98, 23, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = f.color;
  ctx.fillRect(-24, -109, 48, 8);

  ctx.fillStyle = "#111";
  ctx.beginPath();
  ctx.arc(-8, -98, 3, 0, Math.PI * 2);
  ctx.arc(8, -98, 3, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = "#111";
  ctx.lineWidth = 3;

  ctx.beginPath();
  ctx.arc(0, -82, 8, Math.PI + 0.2, Math.PI * 2 - 0.2);
  ctx.stroke();

  for (let i = 0; i < 2; i++) {
    const tearY = -90 + ((f.tears * 35 + i * 22) % 55);

    ctx.fillStyle = "#8dcaff";
    ctx.beginPath();
    ctx.ellipse(i === 0 ? -9 : 9, tearY, 3, 7, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

function drawVictory() {
  if (gameState !== "finished") return;

  const loser = winner === left ? right : left;

  winner.victoryJump += 0.12;
  loser.tears += 0.12;

  const jumpHeight = Math.abs(Math.sin(winner.victoryJump)) * 55;

  drawVictoryFighter(winner, jumpHeight);
  drawSadFighter(loser);
}

// MENU SCREEN
function drawMenu() {
  drawArena();

  ctx.textAlign = "center";

  ctx.fillStyle = "#fff";
  ctx.font = "bold 55px monospace";
  ctx.fillText("BLACKOUT", W / 2, 115);
  ctx.fillText("FIGHTERS", W / 2, 175);

  ctx.fillStyle = "#999";
  ctx.font = "18px monospace";
  ctx.fillText("CHOOSE YOUR GAME MODE", W / 2, 225);

  // Funny mode
  ctx.strokeStyle = "#e34b4b";
  ctx.lineWidth = 3;
  ctx.strokeRect(100, 270, 330, 145);

  ctx.fillStyle = "#e34b4b";
  ctx.font = "bold 42px monospace";
  ctx.fillText("1", 265, 325);

  ctx.fillStyle = "#fff";
  ctx.font = "bold 25px monospace";
  ctx.fillText("FUNNY", 265, 370);

  ctx.fillStyle = "#999";
  ctx.font = "13px monospace";
  ctx.fillText("SIDE-TO-SIDE + JUMP", 265, 397);

  // Serious mode
  ctx.strokeStyle = "#438cff";
  ctx.strokeRect(530, 270, 330, 145);

  ctx.fillStyle = "#438cff";
  ctx.font = "bold 42px monospace";
  ctx.fillText("2", 695, 325);

  ctx.fillStyle = "#fff";
  ctx.font = "bold 25px monospace";
  ctx.fillText("NOT FUNNY", 695, 370);

  ctx.fillStyle = "#999";
  ctx.font = "13px monospace";
  ctx.fillText("FULL ARENA + FLYING KOs", 695, 397);

  ctx.fillStyle = "#fff";
  ctx.font = "18px monospace";
  ctx.fillText("PRESS 1 OR 2 TO BEGIN", W / 2, 475);
}

// MAIN UPDATE
function update(dt) {
  if (gameState === "menu" || gameState === "finished") return;

  if (gameState === "ko") {
    updateKnockout(left, dt);
    updateKnockout(right, dt);

    for (const t of floatingTexts) {
      t.life -= dt;
      t.y -= 35 * dt;
    }

    floatingTexts = floatingTexts.filter(t => t.life > 0);

    for (const e of effects) {
      e.life -= dt;
    }

    effects = effects.filter(e => e.life > 0);

    koOverlayTimer -= dt;
    stateTimer -= dt;

    if (stateTimer <= 0) {
      if (leftScore >= 3 || rightScore >= 3) {
        finishMatch();
      } else {
        resetRound();
      }
    }

    return;
  }

  updateFighter(left, right, dt);
  updateFighter(right, left, dt);

  for (const e of effects) {
    e.life -= dt;
  }

  effects = effects.filter(e => e.life > 0);

  for (const t of floatingTexts) {
    t.life -= dt;
    t.y -= 35 * dt;
  }

  floatingTexts = floatingTexts.filter(t => t.life > 0);
}

// MAIN DRAW
function draw() {
  if (gameState === "menu") {
    drawMenu();
    return;
  }

  drawArena();

  if (gameState === "finished") {
    drawVictory();
  } else {
    drawFighter(left);
    drawFighter(right);
  }

  drawEffects();
  drawFloatingTexts();
  drawOverlay();
}

// GAME LOOP
function gameLoop(timestamp) {
  const dt = Math.min((timestamp - lastTime) / 1000 || 0, 0.04);

  lastTime = timestamp;

  update(dt);
  draw();

  requestAnimationFrame(gameLoop);
}

updateScoreboard();
requestAnimationFrame(gameLoop);
