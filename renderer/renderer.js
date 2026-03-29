/* ============================================================
   DEAD PIXEL PET — renderer.js
   "Bitsy" — A tiny pixel creature that lives on your desktop
   ============================================================ */

// ─── CONFIGURATION ──────────────────────────────────────────
const SPRITE_SIZE   = 48;         // Display size in CSS pixels
const PIXEL_SCALE   = 3;          // Each "pixel" in the sprite = 3 real px
const GRID          = 16;         // Sprite grid = 16x16 "fat pixels"
const FPS           = 30;
const FRAME_MS      = 1000 / FPS;
const GRAVITY       = 480;        // px/s²
const MAX_FLING     = 900;        // Max fling speed
const GROUND_OFFSET = 2;          // px above screen bottom

// ─── STATE ──────────────────────────────────────────────────
let screenW = window.innerWidth;
let screenH = window.innerHeight;
let groundY = screenH - SPRITE_SIZE - GROUND_OFFSET;

const creature = {
  x: Math.random() * (screenW - SPRITE_SIZE),
  y: groundY,
  vx: 0, vy: 0,
  state: 'idle',          // idle, walk, sleep, drowsy, grabbed, flung, dizzy, scared, happy, peek, curious
  facing: 1,              // 1=right, -1=left
  frame: 0,
  frameTimer: 0,
  stateTimer: 0,
  onGround: true,
  sleepTimer: 0,
  drowsyTimer: 0,
  dizzyTimer: 0,
  blinkTimer: 0,
  isBlinking: false,
  climbWall: null,        // 'left' or 'right'
  climbFrame: 0,          // 0-3 inchworm animation frame
  climbFrameTimer: 0,     // ms since last climb frame
  climbCycles: 0,         // full cycles completed (for easter eggs)
  climbLookDownTimer: 0,  // countdown ms for next scared-look-down
  climbSlipTimer: 0,      // >0 = currently slipping
  tumbleAngle: 0,      // rotation for tumble
  jumpHeight: 0,       // random jump height
  spinAngle: 0,        // continuous rotation for flung/tumble
  spinSpeed: 0,        // radians per second
  _autoWakeTimer: 0,   // for probabilistic auto-wake
  _dreamRollTimer: 20, // seconds until next dream interrupt check
  _nightmareTimer: 0,  // seconds
  _mumbleTimer:    0,  // seconds
  _dreamTwitchTimer: 0,// seconds
};

// Physics config (adjustable via settings)
let settings = {
  volume: 0.5,
  speed: 80,
  bounciness: 0.65,
  startup: false,
  showLabels: true,
};

// Stats
let stats = {
  flings: 0,
  bounces: 0,
  distance: 0,
  grabs: 0,
  longestFling: 0,
  startTime: Date.now(),
};

// Mouse tracking
let mouseX = 0, mouseY = 0;
let isMouseDown = false;
let isDragging = false;
let grabOffsetX = 0, grabOffsetY = 0;
let dragVelX = 0, dragVelY = 0;
let prevDragX = 0, prevDragY = 0;

// Pause / Mute
let isPaused = false;
let isMuted = false;

// ─── IMPACT FREEZE FRAME ────────────────────────────────────
let _freezeFrames = 0;      // physics freeze frames remaining
let _squashTimer  = 0;      // ms — squash on impact
let _squashForce  = 0;      // 0-1 strength

// ─── ACTIVITY LABEL ─────────────────────────────────────────
// Floating pill above Bitsy that tells the user what she's doing
const STATE_LABELS = {
  walk:       { emoji: '🚶', text: 'Just walking around~', color: '#a5d6a7' },
  sprint:     { emoji: '🏃', text: 'Running super fast!!', color: '#80deea' },
  jump:       { emoji: '🦘', text: 'Jumping! Wheee!',    color: '#fff59d' },
  tumble:     { emoji: '🌀', text: 'Rolling on the ground!', color: '#ce93d8' },
  climb:      { emoji: '🧗', text: 'Climbing the wall!', color: '#ffcc80' },
  skateboard: { emoji: '🛹', text: 'Skateboarding!',     color: '#80deea' },
  superhero:  { emoji: '🦸', text: 'Flying like a superhero!', color: '#ef9a9a' },
  disco:      { emoji: '🕺', text: 'Dancing! Disco time!', color: '#f48fb1' },
  sneeze:     { emoji: '🤧', text: 'About to sneeze... ACHOO!!', color: '#b0bec5' },
  music:      { emoji: '🎵', text: 'Singing a song~',   color: '#a5d6a7' },
  rainbow:    { emoji: '🌈', text: 'Leaving a rainbow trail!', color: '#fff59d' },
  eating:     { emoji: '🍕', text: 'Eating! Nom nom nom!', color: '#ffcc80' },
  clone:      { emoji: '👯', text: 'Made a clone of myself!', color: '#ce93d8' },
  trampoline: { emoji: '🦘', text: 'Bouncing on trampoline!', color: '#80cbc4' },
  ninja:      { emoji: '🥷', text: 'Ninja mode! Can\'t see me!', color: '#b0bec5' },
  selfie:     { emoji: '🤳', text: 'Taking a selfie! Cheese!', color: '#f48fb1' },
  bungee:     { emoji: '🪢', text: 'Bungee jumping! YOLO!', color: '#ef9a9a' },
  graffiti:   { emoji: '🎨', text: 'Drawing graffiti on screen!', color: '#ce93d8' },
  jetpack:    { emoji: '🚀', text: 'Jetpack activated! To the moon!', color: '#80deea' },
  balloon:    { emoji: '🎈', text: 'Floating up with a balloon!', color: '#f48fb1' },
  spider:     { emoji: '🕷️', text: 'Hanging from a web like a spider!', color: '#b0bec5' },
  laughing:   { emoji: '😂', text: 'Can\'t stop laughing!! Hahaha!', color: '#fff59d' },
  crying:     { emoji: '😭', text: 'Feeling sad... *sniff*', color: '#90caf9' },
  angry:      { emoji: '😤', text: 'So angry right now! Grrrr!', color: '#ef9a9a' },
  drowsy:     { emoji: '😪', text: 'Getting sleepy... *yawn*', color: '#b0bec5' },
  sleep:      { emoji: '💤', text: 'Fell asleep! Zzz...', color: '#90caf9' },
  happy:      { emoji: '😊', text: 'Feeling happy!',     color: '#fff59d' },
  dizzy:      { emoji: '😵', text: 'So dizzy... everything is spinning!', color: '#ce93d8' },
  scared:     { emoji: '😱', text: 'SCARED!! Running away!', color: '#ef9a9a' },
  grabbed:    { emoji: '✋', text: 'Hey! You grabbed me! Put me down!', color: '#ffcc80' },
  flung:      { emoji: '🌪️', text: 'FLYING THROUGH THE AIR!!!', color: '#80deea' },
  curious:    { emoji: '🤔', text: 'Hmm? What\'s over there?', color: '#fff59d' },
  peek:       { emoji: '👀', text: 'Just peeking...',    color: '#a5d6a7' },
  machinegun: { emoji: '🔫', text: 'Shooting a machine gun! BRRRRRT!', color: '#ef9a9a' },
  bombing:    { emoji: '💣', text: 'Throwing bombs! FIRE IN THE HOLE!', color: '#ef9a9a' },
  darts:      { emoji: '🎯', text: 'Playing darts! Aiming for bullseye!', color: '#fff59d' },
  bedtime:    { emoji: '🛏️', text: 'Going to bed... goodnight!', color: '#90caf9' },
  fishing:    { emoji: '🎣', text: 'Fishing! Waiting for a bite...', color: '#80cbc4' },
  bughunt:    { emoji: '🐛', text: 'Chasing a bug! GET IT!', color: '#a5d6a7' },
  garden:     { emoji: '🌱', text: 'Planting a flower garden!', color: '#a5d6a7' },
  cursorride: { emoji: '🏄', text: 'Surfing on your cursor! Wheee!', color: '#80deea' },
  portal:     { emoji: '🔮', text: 'Opening a portal! Teleporting!', color: '#ce93d8' },
  giftbox:    { emoji: '🎁', text: 'A gift fell from the sky!', color: '#f48fb1' },
  tower:      { emoji: '🏗️', text: 'Building a block tower!', color: '#ffcc80' },
  mirror:     { emoji: '🪞', text: 'Found a mirror! Who\'s that?!', color: '#fff59d' },
  minigame:   { emoji: '🎮', text: 'Playing a video game!', color: '#80deea' },
  campfire:   { emoji: '🏕️', text: 'Roasting marshmallows by the fire!', color: '#ffcc80' },
  loveletter: { emoji: '💌', text: 'A love letter fell from the sky!', color: '#f48fb1' },
  petspet:    { emoji: '🐾', text: 'Found a tiny kitten friend!', color: '#a5d6a7' },
  magicshow:  { emoji: '🎪', text: 'Doing a magic trick! Abracadabra!', color: '#ce93d8' },
  parkour:    { emoji: '🧗', text: 'PARKOUR! Wall-to-wall jumps!', color: '#80deea' },
};
// States that should NOT show a label (too frequent / obvious)
const SILENT_STATES = new Set(['idle', 'walk', 'flung', 'happy', 'dizzy', 'scared', 'drowsy']);

let _actLabel      = null;   // { emoji, text, color } or null
let _actLabelTimer = 0;      // seconds remaining to show label
let _actLabelY     = 0;      // current Y offset (for float-up animation)
let _actLabelAlpha = 0;      // current opacity

// ─── PERSONALITY & LIFE SYSTEM ──────────────────────────────
// Bitsy has moods, reacts to the user, remembers things, and lives through the day

const personality = {
  mood: 'neutral',        // happy / neutral / bored / lonely / hyper / grumpy
  moodTimer: 0,           // seconds in current mood
  energy: 100,            // 0-100, decreases over time, resets on sleep/grab
  loneliness: 0,          // increases when user ignores, decreases on interaction
  lastInteraction: Date.now(), // timestamp of last user interaction (grab/click)
  timesFlungToday: 0,     // resets at midnight
  lastMidnight: 0,        // day tracking
};

// Thought bubbles — random funny/cute thoughts
const THOUGHTS = {
  happy:   ['Life is good! ✨', 'Best day ever!', 'I love this desktop!', 'Wheee~ 🎉', '*happy wiggle*', 'You\'re the best! 💛'],
  neutral: ['Hmm...', 'What to do...', '*stares into void*', 'Nice weather in here', '...pixel thoughts...', 'I wonder what\'s on the other monitor'],
  bored:   ['So bored... 😑', 'Hello? Anyone?', '*yawn*', 'This desktop is empty', 'Play with me!', 'I\'ll just... sit here then'],
  lonely:  ['I miss you... 🥺', 'Come back...', 'It\'s lonely here', 'Are you still there?', '*looks around sadly*', 'Even a click would be nice'],
  hyper:   ['YEEEE!! 🔥', 'CAN\'T STOP!!', 'ENERGY!!!', 'LET\'S GOOO', 'WOOOOO!', 'I AM SPEED!!', 'AAAAAA!'],
  grumpy:  ['Stop throwing me!', 'I\'m NOT a toy! 😤', 'One more fling and I quit', 'My head hurts...', 'Rude.', '...fine.'],
  morning: ['Good morning! ☀️', 'Rise and shine!', '*stretches*', 'New day, new me!', 'Coffee? Oh wait...'],
  night:   ['Getting dark... 🌙', 'Sleepy time soon', '*yawns*', 'One more adventure?', 'The stars are pretty'],
  flung:   ['AAAAAAA!', 'NOT AGAIN!', 'WHY?!', 'I TRUSTED YOU!', 'wheeeee— OW', 'THIS IS fine...'],
  landed:  ['Ow...', 'I\'m okay... 🤕', '*sees stars*', 'That was... fun?', 'Again? NO.', 'My pixels hurt'],
  petted:  ['Aww 🥰', '*purrs*', 'That\'s nice~', 'Hehe stop it~', 'More please!', '*happy blob*'],
};

// Micro-events — rare funny things that happen randomly
const MICRO_EVENTS = [
  { id: 'sneeze_chain', weight: 3, label: '🤧 Sneeze chain!', action: () => { creature._sneezeChain = 3; setState('sneeze'); } },
  { id: 'trip', weight: 4, label: '🤦 Tripped!', action: () => { creature.vx = creature.facing * 60; creature.vy = -80; creature.onGround = false; setState('tumble'); } },
  { id: 'hiccup_scare', weight: 3, label: '😱 Scared itself!', action: () => { setState('scared'); playSound('scared'); } },
  { id: 'random_laugh', weight: 4, label: '😂 Remembered a joke', action: () => { setState('laughing'); } },
  { id: 'zoomies', weight: 3, label: '💨 ZOOMIES!', action: () => { personality.mood = 'hyper'; personality.energy = 100; setState('sprint'); creature.facing = Math.random() < 0.5 ? 1 : -1; } },
  { id: 'existential', weight: 2, label: '🤔 Existential crisis', action: () => { showThought('Am I... just pixels? 🤔'); } },
  { id: 'fourth_wall', weight: 2, label: '👀 4th wall break', action: () => { showThought('I know you\'re watching me 👀'); } },
  { id: 'wave', weight: 3, label: '👋 Waves at you!', action: () => { showThought('Hi! 👋'); setState('happy'); } },
  { id: 'flex', weight: 2, label: '💪 Flexing', action: () => { showThought('Look at these pixels 💪'); setState('happy'); } },
  { id: 'fart', weight: 2, label: '💨 Oops...', action: () => { showThought('...excuse me 😳'); setState('scared'); } },
  { id: 'dance_random', weight: 3, label: '🕺 Random dance!', action: () => { setState('disco'); } },
  { id: 'pretend_dead', weight: 1, label: '💀 Playing dead', action: () => { showThought('*plays dead* 💀'); creature.vx = 0; } },
  { id: 'invasion', weight: 1, label: '👾 INVASION!', action: () => { triggerInvasion(); } },
  { id: 'pomodoro', weight: 1, label: '🍅 Pomodoro!', action: () => { if (!_pomodoroActive) startPomodoro(); } },
];

let _thoughtText = '';
let _thoughtTimer = 0;
let _thoughtAlpha = 0;
let _microEventTimer = 15 + Math.random() * 25; // first event in 15-40s
let _cursorIdleTimer = 0; // how long cursor hasn't moved
let _lastCursorX = 0, _lastCursorY = 0;

function showThought(text) {
  _thoughtText = text;
  _thoughtTimer = 3.5;
  _thoughtAlpha = 0;
}

function drawThoughtBubble(dt) {
  if (_thoughtTimer <= 0) return;
  _thoughtTimer -= dt;

  // Fade in/out
  if (_thoughtAlpha < 1) _thoughtAlpha = Math.min(1, _thoughtAlpha + dt * 4);
  if (_thoughtTimer < 0.5) _thoughtAlpha = Math.max(0, _thoughtTimer / 0.5);
  if (_thoughtAlpha <= 0) return;

  const bx = creature.x + SPRITE_SIZE / 2;
  const by = creature.y - 18;

  ctx.save();
  ctx.globalAlpha = _thoughtAlpha;
  ctx.font = '11px "Segoe UI", sans-serif';
  const tw = ctx.measureText(_thoughtText).width;
  const pw = tw + 18;
  const ph = 20;
  const lx = Math.max(4, Math.min(bx - pw / 2, screenW - pw - 4));
  const ly = Math.max(4, by - ph);

  // Cloud bubble — softer, less intrusive
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.shadowColor = 'rgba(0,0,0,0.15)';
  ctx.shadowBlur = 4;
  ctx.beginPath();
  ctx.roundRect(lx, ly, pw, ph, 8);
  ctx.fill();
  ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0;

  // Tail dots (thought bubble style)
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.beginPath(); ctx.arc(bx - 2, ly + ph + 3, 2.5, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(bx - 5, ly + ph + 7, 1.5, 0, Math.PI * 2); ctx.fill();

  // Text
  ctx.fillStyle = '#333';
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';
  ctx.fillText(_thoughtText, lx + pw / 2, ly + ph / 2);
  ctx.restore();
}

function updatePersonality(dt) {
  personality.moodTimer += dt;

  // Track cursor movement
  const cursorMoved = Math.abs(mouseX - _lastCursorX) > 3 || Math.abs(mouseY - _lastCursorY) > 3;
  if (cursorMoved) {
    _cursorIdleTimer = 0;
    _lastCursorX = mouseX;
    _lastCursorY = mouseY;
  } else {
    _cursorIdleTimer += dt;
  }

  // Energy slowly decreases
  personality.energy = Math.max(0, personality.energy - dt * 0.3);

  // Loneliness increases when user isn't interacting
  const secsSinceInteraction = (Date.now() - personality.lastInteraction) / 1000;
  if (secsSinceInteraction > 60) {
    personality.loneliness = Math.min(100, personality.loneliness + dt * 0.5);
  } else {
    personality.loneliness = Math.max(0, personality.loneliness - dt * 2);
  }

  // ── Mood determination ──
  const hour = new Date().getHours();
  if (personality.timesFlungToday > 8) {
    personality.mood = 'grumpy';
  } else if (personality.energy < 15) {
    personality.mood = 'bored';
  } else if (personality.loneliness > 60) {
    personality.mood = 'lonely';
  } else if (personality.energy > 80 && secsSinceInteraction < 15) {
    personality.mood = 'hyper';
  } else if (secsSinceInteraction < 30) {
    personality.mood = 'happy';
  } else {
    personality.mood = 'neutral';
  }

  // ── Micro events ──
  _microEventTimer -= dt;
  if (_microEventTimer <= 0 && creature.state === 'idle' && creature.onGround) {
    _microEventTimer = 20 + Math.random() * 40; // next in 20-60s

    // Weighted random pick
    const totalW = MICRO_EVENTS.reduce((s, e) => s + e.weight, 0);
    let r = Math.random() * totalW;
    for (const ev of MICRO_EVENTS) {
      r -= ev.weight;
      if (r <= 0) {
        ev.action();
        break;
      }
    }
  }

  // ── Random thoughts based on mood ──
  if (_thoughtTimer <= 0 && creature.state === 'idle' && Math.random() < dt * 0.03) {
    // Pick thought based on mood + time of day
    let pool = THOUGHTS[personality.mood] || THOUGHTS.neutral;
    const hour2 = new Date().getHours();
    if (hour2 >= 6 && hour2 < 10 && Math.random() < 0.3) pool = THOUGHTS.morning;
    if (hour2 >= 22 || hour2 < 5) { if (Math.random() < 0.3) pool = THOUGHTS.night; }
    showThought(pool[Math.floor(Math.random() * pool.length)]);
  }

  // ── Lonely behavior: look toward cursor ──
  if (personality.mood === 'lonely' && creature.state === 'idle' && Math.random() < dt * 0.05) {
    creature.facing = mouseX > creature.x + SPRITE_SIZE / 2 ? 1 : -1;
  }

  // ── Bored behavior: sigh and slow movements ──
  if (personality.mood === 'bored' && creature.state === 'idle' && Math.random() < dt * 0.02) {
    showThought(THOUGHTS.bored[Math.floor(Math.random() * THOUGHTS.bored.length)]);
  }

  // ── Midnight reset ──
  const today = new Date().toDateString();
  if (today !== personality.lastMidnight) {
    personality.lastMidnight = today;
    personality.timesFlungToday = 0;
  }
}

// ── Cursor interaction reactions ──
function onCreatureGrabbed() {
  personality.lastInteraction = Date.now();
  personality.energy = Math.min(100, personality.energy + 20);
  personality.loneliness = Math.max(0, personality.loneliness - 30);

  if (personality.mood === 'lonely') {
    showThought('You came back! 🥺💛');
  } else if (personality.mood === 'grumpy') {
    showThought('Not again... 😤');
  } else if (Math.random() < 0.3) {
    showThought(THOUGHTS.petted[Math.floor(Math.random() * THOUGHTS.petted.length)]);
  }
}

function onCreatureFlung() {
  personality.timesFlungToday++;
  personality.lastInteraction = Date.now();

  if (personality.timesFlungToday > 5) {
    showThought(THOUGHTS.flung[Math.floor(Math.random() * THOUGHTS.flung.length)]);
  }
}

function onCreatureLanded() {
  addFootprint('jump');
  if (personality.timesFlungToday > 3 && Math.random() < 0.4) {
    setTimeout(() => {
      showThought(THOUGHTS.landed[Math.floor(Math.random() * THOUGHTS.landed.length)]);
    }, 500);
  }
}

// ─── FOOTPRINT TRAIL SYSTEM ─────────────────────────────────
let _footprints = []; // { x, y, type, born, color }
const FOOTPRINT_MAX = 30;

function addFootprint(type) {
  if (creature.state === 'grabbed' || creature.state === 'sleep' || creature.state === 'bedtime') return;
  const fx = creature.x + SPRITE_SIZE/2 + (creature.facing * 4);
  const fy = creature.y + SPRITE_SIZE - 2;
  if (!creature.onGround && type === 'walk') return;
  _footprints.push({ x: fx, y: fy, type, born: Date.now(), color: C.bodyDark });
  if (_footprints.length > FOOTPRINT_MAX) _footprints.shift();
}

function drawFootprints() {
  const now = Date.now();
  _footprints = _footprints.filter(f => now - f.born < 4000);
  for (const f of _footprints) {
    const age = (now - f.born) / 4000;
    ctx.globalAlpha = Math.max(0, 0.35 * (1 - age));
    ctx.fillStyle = f.color;
    if (f.type === 'walk') {
      ctx.fillRect(f.x - 2, f.y, 2, 2);
      ctx.fillRect(f.x + 2, f.y, 2, 2);
    } else if (f.type === 'sprint') {
      ctx.fillRect(f.x - 4, f.y, 8, 1);
      ctx.fillRect(f.x - 2, f.y + 1, 4, 1);
    } else if (f.type === 'jump') {
      // Star shape
      ctx.beginPath();
      for (let i = 0; i < 5; i++) {
        const a = (i * Math.PI * 2 / 5) - Math.PI/2;
        const r = i % 2 === 0 ? 3 : 1.5;
        if (i === 0) ctx.moveTo(f.x + Math.cos(a)*r, f.y + Math.sin(a)*r);
        else ctx.lineTo(f.x + Math.cos(a)*r, f.y + Math.sin(a)*r);
      }
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
}

// ─── KEYBOARD REACTION SYSTEM ───────────────────────────────
let _keyPressCount = 0;
let _keyPressTimer = 0;
let _capsLockReacted = false;

document.addEventListener('keydown', (e) => {
  if (custOpen || settingsEl.style.display === 'block' || statsEl.style.display === 'block') return;

  _keyPressCount++;
  _keyPressTimer = 1.5; // reset decay timer

  // Caps Lock → Bitsy yells
  if (e.key === 'CapsLock' && !_capsLockReacted) {
    _capsLockReacted = true;
    showThought('WHY ARE WE YELLING?! 😱');
    setTimeout(() => { _capsLockReacted = false; }, 10000);
  }

  // Enter → surprised
  if (e.key === 'Enter' && creature.state === 'idle' && Math.random() < 0.15) {
    showThought('What did you just send? 👀');
  }

  // Escape → scared
  if (e.key === 'Escape' && creature.state === 'idle' && Math.random() < 0.2) {
    showThought('Escaping?! Take me with you! 😰');
  }
});

function updateKeyboardReactions(dt) {
  if (_keyPressTimer > 0) {
    _keyPressTimer -= dt;
    if (_keyPressTimer <= 0) _keyPressCount = 0;
  }

  // Fast typing → Bitsy bounces excitedly
  if (_keyPressCount > 15 && creature.state === 'idle') {
    showThought('You type SO fast!! ⌨️💨');
    _keyPressCount = 0;
    creature.vy = -60;
    creature.onGround = false;
  }
}

// ─── SCREEN EDGE AWARENESS ─────────────────────────────────
// Bitsy peeks from edges, hangs from top
let _edgePeekState = 'none'; // 'none', 'peekBottom', 'hangTop'
let _edgePeekTimer = 0;

function tryEdgePeek() {
  if (creature.state !== 'idle' || !creature.onGround) return false;
  if (Math.random() > 0.005) return false; // rare

  if (creature.y >= groundY - 5) {
    // Near bottom — peek from below (only eyes visible)
    _edgePeekState = 'peekBottom';
    _edgePeekTimer = 3 + Math.random() * 2;
    creature.y = groundY + SPRITE_SIZE - 10; // mostly hidden
    return true;
  }
  return false;
}

function drawEdgePeek() {
  if (_edgePeekState === 'none') return;

  if (_edgePeekState === 'peekBottom') {
    // Only eyes poking above screen bottom
    const peekY = screenH - 12;
    ctx.fillStyle = C.body;
    ctx.fillRect(creature.x + 8, peekY, 32, 14); // top of head
    // Eyes peeking
    ctx.fillStyle = C.eye;
    ctx.fillRect(creature.x + 14, peekY + 4, 6, 6);
    ctx.fillRect(creature.x + 26, peekY + 4, 6, 6);
    ctx.fillStyle = '#1e1e1e';
    ctx.fillRect(creature.x + 17, peekY + 6, 3, 3);
    ctx.fillRect(creature.x + 29, peekY + 6, 3, 3);
    // Tiny hands gripping edge
    ctx.fillStyle = C.feet;
    ctx.fillRect(creature.x + 10, peekY - 2, 4, 4);
    ctx.fillRect(creature.x + 34, peekY - 2, 4, 4);
  }
}

function updateEdgePeek(dt) {
  if (_edgePeekState === 'none') return;
  _edgePeekTimer -= dt;
  if (_edgePeekTimer <= 0) {
    _edgePeekState = 'none';
    creature.y = groundY;
    creature.onGround = true;
  }
}

// ─── BATTERY AWARENESS ──────────────────────────────────────
let _batteryLevel = 100;
let _batteryCharging = false;
let _batteryCheckTimer = 30; // check every 30s
let _batteryReacted = false;

async function checkBattery() {
  try {
    if (!navigator.getBattery) return;
    const batt = await navigator.getBattery();
    _batteryLevel = Math.round(batt.level * 100);
    _batteryCharging = batt.charging;
  } catch(e) {}
}

function updateBatteryReaction(dt) {
  _batteryCheckTimer -= dt;
  if (_batteryCheckTimer <= 0) {
    _batteryCheckTimer = 60;
    checkBattery();
  }

  if (_batteryReacted) return;

  if (_batteryLevel <= 15 && !_batteryCharging) {
    showThought('Battery low... I\'m getting tired too 🪫😴');
    _batteryReacted = true;
    setTimeout(() => { _batteryReacted = false; }, 300000); // 5min cooldown
  } else if (_batteryCharging && _batteryLevel < 50) {
    showThought('Charging up! I feel the POWER! ⚡');
    _batteryReacted = true;
    setTimeout(() => { _batteryReacted = false; }, 300000);
  }
}

// ─── SPECIAL DAY / HOLIDAY SYSTEM ───────────────────────────
let _holidayChecked = '';

function checkHoliday() {
  const now = new Date();
  const mmdd = `${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
  const today = now.toDateString();
  if (_holidayChecked === today) return;
  _holidayChecked = today;

  const holidays = {
    '01-01': { thought: 'Happy New Year! 🎉🥳', hat: 'party' },
    '02-14': { thought: 'Happy Valentine\'s Day! ❤️💕', hat: 'bow' },
    '10-31': { thought: 'BOO! Happy Halloween! 🎃👻', hat: 'devil' },
    '12-25': { thought: 'Merry Christmas! 🎄🎅', hat: 'santa' },
    '12-31': { thought: 'Last day of the year! Let\'s party! 🥳', hat: 'party' },
  };

  if (holidays[mmdd]) {
    const h = holidays[mmdd];
    setTimeout(() => {
      showThought(h.thought);
      // Temporarily wear holiday hat (doesn't save)
      if (h.hat && customization.hat === 'none') {
        const oldHat = customization.hat;
        customization.hat = h.hat;
        setTimeout(() => { customization.hat = oldHat; }, 60000); // 1 min
      }
    }, 5000); // 5s after app opens
  }
}

// ─── SCREEN INVASION (RARE EVENT) ───────────────────────────
let _invasionActive = false;
let _invasionClones = [];
let _invasionTimer = 0;

function triggerInvasion() {
  if (_invasionActive) return;
  _invasionActive = true;
  _invasionTimer = 6;
  _invasionClones = [];
  showThought('Oops... I pressed the clone button! 😅');

  // Spawn 5-8 clones at random positions
  const count = 5 + Math.floor(Math.random() * 4);
  for (let i = 0; i < count; i++) {
    _invasionClones.push({
      x: Math.random() * (screenW - SPRITE_SIZE),
      y: groundY,
      vx: (Math.random() - 0.5) * 200,
      facing: Math.random() < 0.5 ? 1 : -1,
      frame: Math.floor(Math.random() * 4),
      bouncePhase: Math.random() * Math.PI * 2,
    });
  }
}

function updateInvasion(dt) {
  if (!_invasionActive) return;
  _invasionTimer -= dt;

  for (const cl of _invasionClones) {
    cl.x += cl.vx * dt;
    cl.bouncePhase += dt * 8;
    if (cl.x < 0) { cl.x = 0; cl.vx = Math.abs(cl.vx); cl.facing = 1; }
    if (cl.x > screenW - SPRITE_SIZE) { cl.x = screenW - SPRITE_SIZE; cl.vx = -Math.abs(cl.vx); cl.facing = -1; }
  }

  if (_invasionTimer <= 0) {
    _invasionActive = false;
    _invasionClones = [];
    showThought('Sorry about that! 😅');
  }
}

function drawInvasion() {
  if (!_invasionActive) return;
  const fadeOut = _invasionTimer < 1 ? _invasionTimer : 1;

  for (const cl of _invasionClones) {
    ctx.save();
    ctx.globalAlpha = 0.6 * fadeOut;
    const bobY = Math.sin(cl.bouncePhase) * 3;
    ctx.translate(cl.x, cl.y + bobY);

    // Mini Bitsy body
    ctx.fillStyle = C.body;
    for (let y = 5; y <= 12; y++)
      for (let x = 4; x <= 11; x++)
        ctx.fillRect(x * PIXEL_SCALE, y * PIXEL_SCALE, PIXEL_SCALE, PIXEL_SCALE);
    // Eyes
    ctx.fillStyle = C.eye;
    const ex = cl.facing === -1 ? (GRID-1) : 0;
    ctx.fillRect((5 + (cl.facing===-1?GRID-1-5:0)) * PIXEL_SCALE, 7 * PIXEL_SCALE, PIXEL_SCALE*2, PIXEL_SCALE*2);
    ctx.fillRect((9 + (cl.facing===-1?GRID-1-9-1:0)) * PIXEL_SCALE, 7 * PIXEL_SCALE, PIXEL_SCALE*2, PIXEL_SCALE*2);
    // Mouth
    ctx.fillStyle = C.mouth;
    ctx.fillRect(7 * PIXEL_SCALE, 10 * PIXEL_SCALE, PIXEL_SCALE*2, PIXEL_SCALE);

    ctx.restore();
  }
}

// ─── POMODORO BUDDY ─────────────────────────────────────────
let _pomodoroActive = false;
let _pomodoroWorkTime = 25 * 60; // 25 min in seconds
let _pomodoroBreakTime = 5 * 60; // 5 min in seconds
let _pomodoroTimer = 0;
let _pomodoroPhase = 'idle'; // 'idle', 'work', 'break'

function startPomodoro() {
  _pomodoroActive = true;
  _pomodoroPhase = 'work';
  _pomodoroTimer = _pomodoroWorkTime;
  showThought('Focus time! 25 minutes! 🍅💪');
}

function updatePomodoro(dt) {
  if (!_pomodoroActive) return;
  _pomodoroTimer -= dt;

  if (_pomodoroTimer <= 0) {
    if (_pomodoroPhase === 'work') {
      _pomodoroPhase = 'break';
      _pomodoroTimer = _pomodoroBreakTime;
      showThought('Break time! You earned it! 🍅☕ (5 min)');
      playSound('bounce');
    } else if (_pomodoroPhase === 'break') {
      _pomodoroPhase = 'idle';
      _pomodoroActive = false;
      showThought('Break over! Ready for another round? 🍅');
      playSound('bounce');
    }
  }

  // Show remaining time every 5 minutes during work
  if (_pomodoroPhase === 'work') {
    const minsLeft = Math.ceil(_pomodoroTimer / 60);
    if (_pomodoroTimer % 300 < dt && minsLeft > 0 && minsLeft < 25) {
      showThought(`${minsLeft} minutes left! Keep going! 🍅`);
    }
  }
}

function drawPomodoroIndicator() {
  if (!_pomodoroActive) return;
  // Small tomato icon + timer in corner near creature
  const px = creature.x + SPRITE_SIZE + 4;
  const py = creature.y - 4;
  const minsLeft = Math.ceil(_pomodoroTimer / 60);
  const isBreak = _pomodoroPhase === 'break';

  ctx.save();
  ctx.globalAlpha = 0.75;
  ctx.font = 'bold 9px monospace';
  ctx.fillStyle = isBreak ? '#4caf50' : '#e53935';
  ctx.fillText(`🍅 ${minsLeft}m`, px, py);
  ctx.restore();
}

// Audio context
let audioCtx = null;

// Canvas
const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');
canvas.width = screenW;
canvas.height = screenH;
ctx.imageSmoothingEnabled = false;

// ─── COLOR PALETTE (Bitsy — Sunny Yellow) ───────────────────
const C = {
  body:      '#ffd54f',   // Warm yellow
  bodyDark:  '#f0b723',   // Golden shadow
  bodyLight: '#ffec8b',   // Light yellow highlight
  eye:       '#ffffff',   // White eyes
  pupil:     '#1a1a2e',   // Dark pupils
  cheek:     '#ff8a80',   // Rosy cheeks
  mouth:     '#4a2800',   // Dark brown mouth
  feet:      '#f0b723',   // Darker yellow feet
  outline:   '#5d4037',   // Warm brown outline
  star:      '#ff5252',   // Dizzy stars (red)
  zzz:       '#90caf9',   // Sleep Z's (blue)
  spark:     '#ffe066',   // Happy sparkles
};

// ─── SPRITE DRAWING (Programmatic Pixel Art) ────────────────
// Draw a single fat pixel
function px(ox, oy, color) {
  ctx.fillStyle = color;
  ctx.fillRect(
    (creature.x + ox * PIXEL_SCALE) | 0,
    (creature.y + oy * PIXEL_SCALE) | 0,
    PIXEL_SCALE, PIXEL_SCALE
  );
}

// Mirror-aware px
function mpx(ox, oy, color) {
  if (creature.facing === -1) ox = GRID - 1 - ox;
  px(ox, oy, color);
}

function drawBody() {
  // Main body blob (rows 4-13, cols 3-12)
  for (let y = 5; y <= 12; y++) {
    for (let x = 4; x <= 11; x++) {
      const cx = x - 7.5, cy = y - 8.5;
      const d = Math.sqrt(cx*cx*0.8 + cy*cy);
      if (d < 4.5) {
        // Highlight on top-left, shadow on bottom-right
        if (cy < -1.5 && cx < 0) mpx(x, y, C.bodyLight);
        else if (cy > 1.5 || cx > 2) mpx(x, y, C.bodyDark);
        else mpx(x, y, C.body);
      }
    }
  }

  // Outline (top)
  for (let x = 5; x <= 10; x++) mpx(x, 4, C.outline);
  // Outline (sides)
  for (let y = 5; y <= 12; y++) {
    mpx(3, y, C.outline);
    mpx(12, y, C.outline);
  }
  // Outline (bottom)
  for (let x = 4; x <= 11; x++) mpx(x, 13, C.outline);
  // Round corners
  mpx(4, 4, C.outline); mpx(11, 4, C.outline);
  mpx(3, 5, C.outline); mpx(12, 5, C.outline);
  mpx(3, 12, C.outline); mpx(12, 12, C.outline);
  mpx(4, 13, C.outline); mpx(11, 13, C.outline);
}

// Random eye-look direction (wanders around independently)
let _eyeLookX = 0, _eyeLookY = 0;
let _eyeLookTimer = 0;
let _eyeLookTargetX = 0, _eyeLookTargetY = 0;
// Eased pupil position (150ms lag — eyes follow, don't snap)
let _eyeEasedX = 0, _eyeEasedY = 0;

function updateEyeLook(dt) {
  _eyeLookTimer -= dt;
  if (_eyeLookTimer <= 0) {
    _eyeLookTargetX = Math.round(Math.random() * 2 - 1);
    _eyeLookTargetY = Math.round(Math.random() * 2 - 1);
    _eyeLookTimer = 1 + Math.random() * 3;
  }
  _eyeLookX += (_eyeLookTargetX - _eyeLookX) * 0.1;
  _eyeLookY += (_eyeLookTargetY - _eyeLookY) * 0.1;

  // Easing toward target pupil (150ms lag ≈ factor ~0.15 at 30fps)
  const dx = mouseX - (creature.x + SPRITE_SIZE/2);
  const dy = mouseY - (creature.y + SPRITE_SIZE/2);
  const mouseDist = Math.hypot(dx, dy);
  let targetEX, targetEY;
  if (mouseDist < 250) {
    targetEX = Math.abs(dx) > 30 ? Math.sign(dx) : 0;
    targetEY = Math.abs(dy) > 30 ? Math.sign(dy) : 0;
  } else {
    targetEX = Math.round(_eyeLookX);
    targetEY = Math.round(_eyeLookY);
  }
  // ~150ms easing at 30fps (factor = 1 - e^(-dt/0.15)), capped to prevent dt spike snap
  const ef = Math.min(1, 1 - Math.exp(-dt / 0.15));
  _eyeEasedX += (targetEX - _eyeEasedX) * ef;
  _eyeEasedY += (targetEY - _eyeEasedY) * ef;
}

function drawEyes(squished = false, closed = false) {
  if (closed || creature.isBlinking) {
    // Closed eyes — happy closed (curved)
    mpx(5, 7, C.outline); mpx(6, 7, C.outline);
    mpx(9, 7, C.outline); mpx(10, 7, C.outline);
    return;
  }
  if (squished) {
    // Squished — X eyes
    mpx(5, 7, C.outline); mpx(6, 8, C.outline);
    mpx(6, 7, C.outline); mpx(5, 8, C.outline);
    mpx(9, 7, C.outline); mpx(10, 8, C.outline);
    mpx(10, 7, C.outline); mpx(9, 8, C.outline);
    return;
  }
  // Normal eyes (2x2 white + 1 pupil)
  mpx(5, 7, C.eye); mpx(6, 7, C.eye);
  mpx(5, 8, C.eye); mpx(6, 8, C.eye);
  mpx(9, 7, C.eye); mpx(10, 7, C.eye);
  mpx(9, 8, C.eye); mpx(10, 8, C.eye);

  // Pupils — use eased position (150ms lag, feels alive)
  const px2 = Math.round(_eyeEasedX);
  const py2 = Math.round(_eyeEasedY);
  mpx(6 + px2, 8 + py2, C.pupil);
  mpx(10 + px2, 8 + py2, C.pupil);
}

function drawWideEyes() {
  // Scared / surprised — bigger eyes
  mpx(4, 6, C.eye); mpx(5, 6, C.eye); mpx(6, 6, C.eye);
  mpx(4, 7, C.eye); mpx(5, 7, C.eye); mpx(6, 7, C.eye);
  mpx(4, 8, C.eye); mpx(5, 8, C.eye); mpx(6, 8, C.eye);
  mpx(9, 6, C.eye); mpx(10, 6, C.eye); mpx(11, 6, C.eye);
  mpx(9, 7, C.eye); mpx(10, 7, C.eye); mpx(11, 7, C.eye);
  mpx(9, 8, C.eye); mpx(10, 8, C.eye); mpx(11, 8, C.eye);
  // Tiny pupils
  mpx(5, 7, C.pupil);
  mpx(10, 7, C.pupil);
}

function drawMouth(style = 'happy') {
  switch (style) {
    case 'happy':
      // Cute small smile — simple curved line
      mpx(7, 10, C.mouth); mpx(8, 10, C.mouth);
      mpx(6, 9, C.mouth); mpx(9, 9, C.mouth);
      break;
    case 'bigGrin':
      // Wide happy grin — bigger smile, no teeth
      mpx(5, 9, C.mouth);
      mpx(6, 10, C.mouth); mpx(7, 10, C.mouth); mpx(8, 10, C.mouth); mpx(9, 10, C.mouth);
      mpx(10, 9, C.mouth);
      break;
    case 'open':
      // Shocked O mouth
      mpx(7, 10, C.mouth); mpx(8, 10, C.mouth);
      mpx(6, 11, C.mouth); mpx(9, 11, C.mouth);
      mpx(7, 12, C.mouth); mpx(8, 12, C.mouth);
      break;
    case 'cry':
      // Wavy sad mouth
      mpx(6, 11, C.mouth); mpx(9, 11, C.mouth);
      mpx(7, 12, C.mouth); mpx(8, 12, C.mouth);
      break;
    case 'angry':
      // Gritted teeth / snarl
      mpx(5, 10, C.mouth); mpx(10, 10, C.mouth);
      mpx(6, 11, C.mouth); mpx(7, 11, C.mouth); mpx(8, 11, C.mouth); mpx(9, 11, C.mouth);
      // Gritted teeth
      mpx(6, 10, '#ffffff'); mpx(8, 10, '#ffffff');
      mpx(7, 10, C.mouth); mpx(9, 10, '#ffffff');
      break;
    case 'sad':
      mpx(7, 10, C.mouth); mpx(8, 10, C.mouth);
      mpx(6, 11, C.mouth); mpx(9, 11, C.mouth);
      break;
    case 'laugh':
      // Wide open happy laugh — round open mouth, cute
      mpx(6, 9, C.mouth); mpx(9, 9, C.mouth);
      mpx(6, 10, C.mouth); mpx(9, 10, C.mouth);
      mpx(7, 11, C.mouth); mpx(8, 11, C.mouth);
      // Pink tongue inside
      mpx(7, 10, '#e57373'); mpx(8, 10, '#e57373');
      break;
    default:
      // Default = cute smile
      mpx(7, 10, C.mouth); mpx(8, 10, C.mouth);
      mpx(6, 9, C.mouth); mpx(9, 9, C.mouth);
  }
}

// Angry eyebrows — thick, steep V-shape
function drawAngryBrows() {
  // Left brow — steep angry angle ╲
  mpx(3, 4, C.outline); mpx(4, 4, C.outline);
  mpx(4, 5, C.outline); mpx(5, 5, C.outline); mpx(6, 5, C.outline);
  mpx(5, 6, C.outline); mpx(6, 6, C.outline);
  // Right brow — steep angry angle ╱
  mpx(11, 4, C.outline); mpx(12, 4, C.outline);
  mpx(9, 5, C.outline); mpx(10, 5, C.outline); mpx(11, 5, C.outline);
  mpx(9, 6, C.outline); mpx(10, 6, C.outline);
}

// Sad eyebrows (slanted up in center)
function drawSadBrows() {
  mpx(5, 5, C.outline); mpx(6, 6, C.outline);
  mpx(10, 5, C.outline); mpx(9, 6, C.outline);
}

// Tears
function drawTears() {
  const t = Date.now() / 400;
  // Streaming tear drops from each eye
  ctx.fillStyle = '#42a5f6';
  for (let i = 0; i < 3; i++) {
    const phase = (t + i * 0.7) % 2;
    const alpha = phase < 1.5 ? 1 - phase / 1.5 : 0;
    if (alpha <= 0) continue;
    ctx.globalAlpha = alpha;
    // Left tear
    const ly = creature.y + 28 + phase * 18;
    ctx.fillRect(creature.x + 14, ly, 2, 3);
    // Right tear
    ctx.fillRect(creature.x + 32, ly, 2, 3);
  }
  ctx.globalAlpha = 1;
}

// Anger steam puffs
function drawAngerSteam() {
  const t = Date.now() / 300;
  ctx.fillStyle = '#ff5252';
  // Angry vein marks (X shapes above head)
  const ax = creature.x + SPRITE_SIZE - 6;
  const ay = creature.y - 2;
  ctx.fillRect(ax, ay, 2, 2); ctx.fillRect(ax + 4, ay, 2, 2);
  ctx.fillRect(ax + 2, ay + 2, 2, 2);
  ctx.fillRect(ax, ay + 4, 2, 2); ctx.fillRect(ax + 4, ay + 4, 2, 2);
  // Steam puffs rising
  for (let i = 0; i < 2; i++) {
    const phase = (t + i * 1.2) % 2.5;
    if (phase > 1.8) continue;
    ctx.globalAlpha = 0.5 - phase * 0.25;
    ctx.fillStyle = '#ffffff';
    const sx = creature.x + SPRITE_SIZE / 2 + (i === 0 ? -8 : 8) + Math.sin(t + i) * 3;
    const sy = creature.y - 8 - phase * 16;
    ctx.fillRect(sx, sy, 3, 3);
    ctx.fillRect(sx + 1, sy - 2, 2, 2);
  }
  ctx.globalAlpha = 1;
}

// Laugh tears (happy tears at corners)
function drawLaughTears() {
  const t = Date.now() / 300;
  ctx.fillStyle = '#42a5f6';
  const phase = (t % 1.5);
  if (phase < 1) {
    ctx.globalAlpha = 0.7;
    ctx.fillRect(creature.x + 10, creature.y + 28 + phase * 6, 2, 2);
    ctx.fillRect(creature.x + 36, creature.y + 28 + phase * 6, 2, 2);
  }
  ctx.globalAlpha = 1;
}

function drawCheeks() {
  mpx(4, 9, C.cheek); mpx(11, 9, C.cheek);
}

// 💥 SCREEN CRACK — shows cracks on very hard impacts
let _crackTime = 0;
let _crackPos = { x: 0, y: 0 };
let _crackLines = [];

function triggerScreenCrack(x, y) {
  _crackTime = Date.now();
  _crackPos = { x, y };
  // Generate random crack lines radiating from impact point
  _crackLines = [];
  const numCracks = 5 + Math.floor(Math.random() * 4);
  for (let i = 0; i < numCracks; i++) {
    const angle = (Math.PI * 2 / numCracks) * i + (Math.random() - 0.5) * 0.5;
    const len = 30 + Math.random() * 60;
    const segments = [];
    let cx = x, cy = y;
    const numSegs = 3 + Math.floor(Math.random() * 3);
    for (let s = 0; s < numSegs; s++) {
      const segLen = len / numSegs;
      const jitter = (Math.random() - 0.5) * 0.4;
      cx += Math.cos(angle + jitter) * segLen;
      cy += Math.sin(angle + jitter) * segLen;
      segments.push({ x: cx, y: cy });
      // Branch
      if (Math.random() < 0.4) {
        const bAngle = angle + (Math.random() - 0.5) * 1.2;
        const bLen = segLen * 0.6;
        segments.push({ x: cx + Math.cos(bAngle) * bLen, y: cy + Math.sin(bAngle) * bLen, branch: true });
      }
    }
    _crackLines.push(segments);
  }
}

function drawScreenCrack() {
  if (!_crackTime) return;
  const age = Date.now() - _crackTime;
  if (age > 2000) { _crackTime = 0; return; }
  const alpha = Math.max(0, 1 - age / 2000);
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1.5;
  // Draw crack lines
  for (const crack of _crackLines) {
    ctx.beginPath();
    ctx.moveTo(_crackPos.x, _crackPos.y);
    for (let si = 0; si < crack.length; si++) {
      const seg = crack[si];
      if (seg.branch) {
        // Branch: restart path from previous segment (O(1) with index)
        const prev = si > 0 ? crack[si - 1] : _crackPos;
        ctx.moveTo(prev.x, prev.y);
      }
      ctx.lineTo(seg.x, seg.y);
    }
    ctx.stroke();
  }
  // Impact point glow
  if (age < 300) {
    ctx.fillStyle = `rgba(255,255,255,${0.4 * (1 - age/300)})`;
    ctx.beginPath();
    ctx.arc(_crackPos.x, _crackPos.y, 15 + age * 0.03, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

// 🏷️ ACTIVITY LABEL — floating pill showing what Bitsy is doing
function drawActivityLabel(dt) {
  // Don't show activity label if thought bubble is active (avoid overlap)
  if (_thoughtTimer > 0) { _actLabelTimer = 0; _actLabel = null; return; }
  if (!settings.showLabels || !_actLabel || _actLabelTimer <= 0) {
    _actLabelTimer = 0;
    _actLabel = null;
    return;
  }

  _actLabelTimer -= dt;

  // Float up animation: rises 18px over 0.4s, then holds
  const RISE_DUR = 0.4;
  const TOTAL_DUR_REF = 3.0; // typical show duration
  if (_actLabelY > -18) {
    _actLabelY -= dt * (18 / RISE_DUR);
    if (_actLabelY < -18) _actLabelY = -18;
  }

  // Fade in for first 0.3s, fade out for last 0.5s
  const FADE_IN  = 0.3;
  const FADE_OUT = 0.6;
  // We don't know initial duration, track separately via alpha
  if (_actLabelAlpha < 1) {
    _actLabelAlpha = Math.min(1, _actLabelAlpha + dt / FADE_IN);
  }
  if (_actLabelTimer < FADE_OUT) {
    _actLabelAlpha = Math.min(_actLabelAlpha, _actLabelTimer / FADE_OUT);
  }

  if (_actLabelAlpha <= 0) return;

  const cx = creature.x + SPRITE_SIZE / 2;
  const labelY = creature.y + _actLabelY - 10; // above head

  const txt = _actLabel.emoji + '  ' + _actLabel.text;
  ctx.save();
  ctx.globalAlpha = _actLabelAlpha;
  ctx.font = 'bold 12px "Segoe UI", sans-serif';
  const tw = ctx.measureText(txt).width;
  const pw = tw + 22; // padding
  const ph = 24;
  const lx = Math.max(4, Math.min(cx - pw / 2, screenW - pw - 4));
  const ly = Math.max(4, labelY - ph / 2);

  // Shadow
  ctx.shadowColor = 'rgba(0,0,0,0.5)';
  ctx.shadowBlur = 8;
  ctx.shadowOffsetY = 2;

  // Pill background
  ctx.beginPath();
  ctx.roundRect(lx, ly, pw, ph, ph / 2);
  ctx.fillStyle = _actLabel.color;
  ctx.fill();

  // Dark border for contrast
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;
  ctx.strokeStyle = 'rgba(0,0,0,0.2)';
  ctx.lineWidth = 1;
  ctx.stroke();

  // Text
  ctx.fillStyle = 'rgba(0,0,0,0.8)';
  ctx.textBaseline = 'middle';
  ctx.fillText(txt, lx + 11, ly + ph / 2);

  ctx.restore();
}

// 💭 DREAM BUBBLE — pixel art dreams while sleeping
function drawDreamBubble() {
  const t = Date.now() / 2000;
  const phase = t % 4; // cycle through dreams
  const bx = creature.x + SPRITE_SIZE + 8;
  const by = creature.y - 10;
  // Thought dots
  ctx.fillStyle = 'rgba(255,255,255,0.4)';
  ctx.beginPath(); ctx.arc(creature.x + SPRITE_SIZE + 2, creature.y + 4, 2, 0, Math.PI*2); ctx.fill();
  ctx.beginPath(); ctx.arc(bx - 4, by + 8, 3, 0, Math.PI*2); ctx.fill();
  // Bubble
  ctx.fillStyle = 'rgba(30,30,60,0.85)';
  ctx.strokeStyle = 'rgba(255,255,255,0.3)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.ellipse(bx + 16, by - 4, 20, 14, 0, 0, Math.PI * 2);
  ctx.fill(); ctx.stroke();
  // Dream content (cycling)
  const dreamIdx = Math.floor(phase);
  ctx.font = '12px serif';
  ctx.fillStyle = '#fff';
  const dreams = ['🍕', '⭐', '🌈', '💎'];
  ctx.fillText(dreams[dreamIdx % dreams.length], bx + 10, by);
}

function drawFeet(offset = 0) {
  const footY = 13;
  // Left foot
  mpx(5 + offset, footY, C.feet);
  mpx(6 + offset, footY, C.feet);
  mpx(5 + offset, footY + 1, C.outline);
  mpx(6 + offset, footY + 1, C.outline);
  // Right foot
  mpx(9 - offset, footY, C.feet);
  mpx(10 - offset, footY, C.feet);
  mpx(9 - offset, footY + 1, C.outline);
  mpx(10 - offset, footY + 1, C.outline);
}

function drawDizzyStars() {
  const t = Date.now() / 300;
  for (let i = 0; i < 3; i++) {
    const a = t + i * 2.094;
    const sx = Math.round(creature.x + SPRITE_SIZE/2 + Math.cos(a) * 22);
    const sy = Math.round(creature.y - 4 + Math.sin(a) * 8);
    ctx.fillStyle = C.star;
    ctx.fillRect(sx-1, sy-1, 3, 3);
    ctx.fillRect(sx, sy-2, 1, 1);
    ctx.fillRect(sx, sy+2, 1, 1);
    ctx.fillRect(sx-2, sy, 1, 1);
    ctx.fillRect(sx+2, sy, 1, 1);
  }
}

function drawSleepZ() {
  const t = Date.now() / 1000;
  ctx.font = '10px monospace';
  ctx.fillStyle = C.zzz;
  for (let i = 0; i < 3; i++) {
    const phase = (t * 0.7 + i * 0.4) % 2;
    const alpha = phase < 1.5 ? 1 - phase/1.5 : 0;
    if (alpha <= 0) continue;
    ctx.globalAlpha = alpha;
    const zx = creature.x + SPRITE_SIZE + 2 + i * 6 + phase * 4;
    const zy = creature.y - 2 - phase * 14 - i * 3;
    ctx.fillText('z', zx, zy);
  }
  ctx.globalAlpha = 1;
}

function drawHappySparkles() {
  const t = Date.now() / 200;
  ctx.fillStyle = C.spark;
  for (let i = 0; i < 4; i++) {
    const a = t + i * 1.57;
    const d = 18 + Math.sin(a * 1.5) * 5;
    const sx = Math.round(creature.x + SPRITE_SIZE/2 + Math.cos(a) * d);
    const sy = Math.round(creature.y + SPRITE_SIZE/2 + Math.sin(a) * d);
    const s = Math.sin(t + i) > 0 ? 2 : 1;
    ctx.fillRect(sx, sy, s, s);
  }
}

// ─── DRAW CREATURE BY STATE ─────────────────────────────────
function drawCreature() {
  const s = creature.state;
  const f = creature.frame;
  const breathe = Math.sin(Date.now() / 500) * 0.5; // gentle squish

  ctx.save();

  // ── Impact squash deformation (volume-conserving) ──
  if (_squashTimer > 0) {
    _squashTimer -= FRAME_MS;
    const t = Math.max(0, _squashTimer / 200); // 0→1 fading
    const sq = _squashForce * t;
    const scX = 1 + sq * 0.35;   // widen
    const scY = 1 - sq * 0.35;   // flatten
    const bcx = creature.x + SPRITE_SIZE / 2;
    const bcy = creature.y + SPRITE_SIZE / 2;
    ctx.translate(bcx, bcy);
    ctx.scale(scX, scY);
    ctx.translate(-bcx, -bcy);
  }

  switch (s) {
    case 'idle': {
      const squishY = Math.round(breathe);
      ctx.translate(0, -squishY);
      drawBody();
      drawEyes();
      drawMouth('happy');
      drawCheeks();
      drawFeet(0);
      ctx.translate(0, squishY);
      break;
    }
    case 'walk': {
      const step = f % 2 === 0 ? 1 : -1;
      const bob = Math.abs(step) * -1;
      ctx.translate(0, bob);
      drawBody();
      drawEyes();
      drawMouth('happy');
      drawCheeks();
      drawFeet(step);
      ctx.translate(0, -bob);
      break;
    }
    case 'drowsy': {
      // Half-closed eyes, slow head nod, occasional yawn
      const nodAmt = Math.sin(creature.drowsyTimer * 1.5) * 3; // head nodding
      ctx.translate(0, nodAmt);
      drawBody();
      // Half-closed eyes: draw bottom half of eye closed
      mpx(5, 7, C.eye); mpx(6, 7, C.eye);
      mpx(9, 7, C.eye); mpx(10, 7, C.eye);
      // Half-lid (dark lower half)
      mpx(5, 8, C.outline); mpx(6, 8, C.outline);
      mpx(9, 8, C.outline); mpx(10, 8, C.outline);
      // Pupils still visible but droopy
      mpx(5, 7, C.pupil); mpx(9, 7, C.pupil);
      // Droopy eyelids
      mpx(5, 6, C.bodyDark); mpx(6, 6, C.bodyDark);
      mpx(9, 6, C.bodyDark); mpx(10, 6, C.bodyDark);
      // Yawning mouth occasionally
      const yawnPhase = (creature.drowsyTimer * 0.4) % 4;
      if (yawnPhase > 3) {
        drawMouth('open'); // yawn!
      } else {
        drawMouth('happy');
      }
      drawCheeks();
      drawFeet(0);
      ctx.translate(0, -nodAmt);
      // Sleepy ZZZ starting
      const t_drow = Date.now() / 1000;
      ctx.globalAlpha = 0.5;
      ctx.font = '8px monospace';
      ctx.fillStyle = C.zzz;
      const zPhase = (t_drow * 0.5) % 2;
      if (zPhase < 1.5) {
        ctx.globalAlpha = (1 - zPhase / 1.5) * 0.5;
        ctx.fillText('z', creature.x + SPRITE_SIZE + 2, creature.y - 2 - zPhase * 8);
      }
      ctx.globalAlpha = 1;
      break;
    }
    case 'sleep': {
      // Squished body (curled up, slow breathe)
      const sq = Math.sin(Date.now() / 900) * 0.5;
      ctx.translate(0, 2 + sq);
      drawBody();
      // Nightmare: eyes snap open for 0.4s
      if (creature._nightmareTimer > 0) {
        drawWideEyes();
        drawMouth('open');
      } else {
        drawEyes(false, true); // closed eyes
        drawMouth('happy');
      }
      drawFeet(0);
      ctx.translate(0, -(2 + sq));
      drawSleepZ();
      // Mumble "..." speech bubble
      if (creature._mumbleTimer > 0) {
        const alpha = Math.min(1, creature._mumbleTimer / 0.3);
        ctx.globalAlpha = alpha;
        ctx.fillStyle = 'rgba(30,30,60,0.85)';
        ctx.strokeStyle = 'rgba(255,255,255,0.4)';
        ctx.lineWidth = 1;
        const mx = creature.x + SPRITE_SIZE + 4;
        const my = creature.y + 6;
        ctx.beginPath();
        ctx.roundRect ? ctx.roundRect(mx, my, 20, 12, 3) : ctx.rect(mx, my, 20, 12);
        ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#aaa';
        ctx.font = '8px monospace';
        ctx.fillText('...', mx + 4, my + 9);
        ctx.globalAlpha = 1;
      }
      break;
    }
    case 'grabbed': {
      // Surprised + wiggle
      const wiggle = Math.sin(Date.now() / 50) * 2;
      ctx.translate(wiggle, 0);
      drawBody();
      drawWideEyes();
      drawMouth('open');
      // Feet dangle
      mpx(5, 14, C.feet); mpx(6, 14, C.feet);
      mpx(10, 14, C.feet); mpx(11, 14, C.feet);
      ctx.translate(-wiggle, 0);
      break;
    }
    case 'flung': {
      // FULL SPIN! Creature tumbles through the air
      const flingSpeed = Math.hypot(creature.vx, creature.vy);
      // Spin speed proportional to fling velocity
      creature.spinAngle += creature.spinSpeed * (FRAME_MS / 1000);
      // Slow down spin gradually as speed decreases
      creature.spinSpeed *= 0.995;

      const fcx = creature.x + SPRITE_SIZE / 2;
      const fcy = creature.y + SPRITE_SIZE / 2;

      // Apply rotation
      ctx.translate(fcx, fcy);
      ctx.rotate(creature.spinAngle);
      ctx.translate(-fcx, -fcy);

      drawBody();
      // Face changes with speed
      if (flingSpeed > 300) {
        drawWideEyes();      // fast = shocked
        drawMouth('open');
      } else if (flingSpeed > 100) {
        drawEyes();
        drawMouth('bigGrin'); // medium = enjoying it
      } else {
        drawEyes(true);       // slow = dizzy X eyes
        drawMouth('sad');
      }
      drawCheeks();
      drawFeet(0);

      ctx.setTransform(1, 0, 0, 1, 0, 0);

      // Motion trail (afterimages)
      if (flingSpeed > 150) {
        ctx.globalAlpha = 0.12;
        const trail1x = creature.x - creature.vx * 0.03;
        const trail1y = creature.y - creature.vy * 0.03;
        ctx.fillStyle = C.body;
        ctx.beginPath();
        ctx.arc(trail1x + SPRITE_SIZE/2, trail1y + SPRITE_SIZE/2, SPRITE_SIZE/2.5, 0, Math.PI*2);
        ctx.fill();
        if (flingSpeed > 300) {
          const trail2x = creature.x - creature.vx * 0.06;
          const trail2y = creature.y - creature.vy * 0.06;
          ctx.globalAlpha = 0.06;
          ctx.beginPath();
          ctx.arc(trail2x + SPRITE_SIZE/2, trail2y + SPRITE_SIZE/2, SPRITE_SIZE/2.5, 0, Math.PI*2);
          ctx.fill();
        }
        ctx.globalAlpha = 1;
      }

      // Speed lines
      if (flingSpeed > 100) {
        ctx.strokeStyle = 'rgba(255,255,255,0.25)';
        ctx.lineWidth = 1;
        for (let i = 0; i < 4; i++) {
          const a = Math.atan2(-creature.vy, -creature.vx) + (i-1.5)*0.25;
          const startD = SPRITE_SIZE * 0.5;
          const endD = startD + flingSpeed / 30;
          ctx.beginPath();
          ctx.moveTo(fcx + Math.cos(a)*startD, fcy + Math.sin(a)*startD);
          ctx.lineTo(fcx + Math.cos(a)*endD, fcy + Math.sin(a)*endD);
          ctx.stroke();
        }
      }

      // Impact star burst on bounce (drawn for 200ms after bounce)
      if (creature._lastBounceTime && Date.now() - creature._lastBounceTime < 200) {
        const bx = creature._lastBounceX || fcx;
        const by = creature._lastBounceY || fcy;
        ctx.fillStyle = '#fff';
        for (let s = 0; s < 6; s++) {
          const sa = (Date.now() / 50) + s * 1.047;
          const sd = 8 + (Date.now() - creature._lastBounceTime) * 0.06;
          ctx.fillRect(bx + Math.cos(sa)*sd, by + Math.sin(sa)*sd, 2, 2);
        }
      }
      break;
    }
    case 'dizzy': {
      const dizzyAge = creature.dizzyTimer;
      const wobble = Math.sin(Date.now() / 200) * 2;
      ctx.translate(wobble, 0);
      drawBody();
      if (dizzyAge < 2) {
        drawEyes(true);   // X eyes — knocked out
        drawMouth('sad');
      } else {
        drawEyes();        // recovering
        drawMouth('happy');
      }
      drawFeet(0);
      ctx.translate(-wobble, 0);
      if (dizzyAge < 2.5) drawDizzyStars();
      break;
    }
    case 'scared': {
      // Shaking
      const shake = Math.sin(Date.now() / 30) * 1.5;
      ctx.translate(shake, 0);
      drawBody();
      drawWideEyes();
      drawMouth('open');
      drawFeet(0);
      ctx.translate(-shake, 0);
      break;
    }
    case 'happy': {
      const bounce = Math.abs(Math.sin(Date.now() / 150)) * 3;
      ctx.translate(0, -bounce);
      drawBody();
      drawEyes();
      drawMouth('happy');
      drawCheeks();
      drawFeet(f % 2);
      ctx.translate(0, bounce);
      drawHappySparkles();
      break;
    }
    case 'curious': {
      // Head-tilt and ? bubble — obviously looking at cursor
      const tiltDir = Math.sign(mouseX - creature.x - SPRITE_SIZE/2);
      const tiltT = creature.stateTimer;
      // Phase 1 (0-0.6s): freeze + tilt head
      // Phase 2 (0.6s+): slowly approach
      const phase1 = tiltT < 600;
      const headTilt = phase1
        ? tiltDir * Math.min(tiltT / 300, 1) * 5   // lean 5px while tilting (0-600ms)
        : tiltDir * 3 + Math.sin(tiltT / 250) * 1.5;  // subtle sway while walking

      ctx.translate(headTilt, -2);
      drawBody();
      // Wide curious eyes (raised brows effect via pixel above eye)
      mpx(5, 5, C.outline); mpx(6, 5, C.outline); // left raised brow
      mpx(9, 5, C.outline); mpx(10, 5, C.outline); // right raised brow
      drawEyes();
      drawMouth('happy');
      drawCheeks();
      drawFeet(phase1 ? 0 : f % 2);
      ctx.translate(-headTilt, 2);

      // "?" thought bubble — floats above head, pulses
      const qScale = 0.85 + Math.sin(tiltT * 3) * 0.15;
      const bx = creature.x + SPRITE_SIZE / 2 + tiltDir * 4;
      const by = creature.y - 8 - Math.abs(Math.sin(tiltT * 2)) * 3;
      ctx.save();
      ctx.translate(bx, by);
      ctx.scale(qScale, qScale);
      // Bubble
      ctx.beginPath(); ctx.arc(0, 0, 9, 0, Math.PI*2);
      ctx.fillStyle = 'rgba(255,255,255,0.92)';
      ctx.fill();
      ctx.strokeStyle = '#ccc'; ctx.lineWidth = 1.2; ctx.stroke();
      // Small tail dots
      ctx.fillStyle = 'rgba(255,255,255,0.92)';
      ctx.beginPath(); ctx.arc(tiltDir * -3, 8, 2.5, 0, Math.PI*2); ctx.fill();
      ctx.beginPath(); ctx.arc(tiltDir * -6, 13, 1.5, 0, Math.PI*2); ctx.fill();
      // "?" text
      ctx.fillStyle = '#555';
      ctx.font = 'bold 11px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('?', 0, 0.5);
      ctx.restore();
      break;
    }
    case 'peek': {
      // Only top half visible (peeking over edge)
      drawBody();
      drawEyes();
      drawMouth('happy');
      break;
    }
    case 'jump': {
      // In-air — happy face, limbs spread
      const airStretch = creature.vy < 0 ? -1 : 1; // going up = stretch, down = scrunch
      ctx.translate(0, airStretch);
      drawBody();
      drawEyes();
      drawMouth(creature.vy < 0 ? 'happy' : 'open');
      drawCheeks();
      // Spread feet
      mpx(4, 13, C.feet); mpx(5, 13, C.feet);
      mpx(11, 13, C.feet); mpx(12, 13, C.feet);
      ctx.translate(0, -airStretch);
      break;
    }
    case 'climb': {
      // ═══ INCHWORM WALL CLIMBING ═══
      // 4-frame cycle: GRIP(125ms) → STRETCH(100ms) → PULL(100ms) → RE-GRIP(150ms)
      const CLIMB_FRAME_MS = [125, 100, 100, 150];
      const isLeft = creature.climbWall === 'left';
      creature.facing = isLeft ? 1 : -1;
      const cf = creature.climbFrame; // 0-3

      // Squash/stretch scaleY per frame: grip=1.0, stretch=1.25, pull=0.85, regrip=1.0
      const scaleYArr = [1.0, 1.22, 0.82, 1.0];
      // Wall-squish scaleX per frame: grip=0.95, stretch=0.85, pull=0.98, regrip=0.95
      const scaleXArr = [0.95, 0.82, 1.0, 0.95];
      const scaleY = scaleYArr[cf];
      const scaleX = scaleXArr[cf];

      // Draw body squashed/stretched around center
      const bcx = creature.x + SPRITE_SIZE / 2;
      const bcy = creature.y + SPRITE_SIZE / 2;
      ctx.save();
      ctx.translate(bcx, bcy);
      ctx.scale(scaleX, scaleY);
      ctx.translate(-bcx, -bcy);
      drawBody();
      // Eyes look UPWARD while climbing
      // Draw custom upward-looking eyes instead of standard drawEyes()
      {
        const ex = creature.facing === 1;
        // Left eye
        const le1x = ex ? creature.x + 5*3 : creature.x + (GRID-1-10)*3;
        const le2x = ex ? creature.x + 6*3 : creature.x + (GRID-1-9)*3;
        const re1x = ex ? creature.x + 9*3 : creature.x + (GRID-1-6)*3;
        const re2x = ex ? creature.x + 10*3 : creature.x + (GRID-1-5)*3;
        const eyeBaseY = creature.y + 7*3;
        // White
        ctx.fillStyle = C.eye;
        ctx.fillRect(le1x, eyeBaseY,     3, 3); ctx.fillRect(le2x, eyeBaseY,     3, 3);
        ctx.fillRect(le1x, eyeBaseY+3,   3, 3); ctx.fillRect(le2x, eyeBaseY+3,   3, 3);
        ctx.fillRect(re1x, eyeBaseY,     3, 3); ctx.fillRect(re2x, eyeBaseY,     3, 3);
        ctx.fillRect(re1x, eyeBaseY+3,   3, 3); ctx.fillRect(re2x, eyeBaseY+3,   3, 3);
        // Pupils shifted UP (looking up the wall)
        ctx.fillStyle = C.pupil;
        ctx.fillRect(le2x, eyeBaseY,   3, 3);
        ctx.fillRect(re2x, eyeBaseY,   3, 3);
      }
      drawMouth(cf === 1 ? 'open' : 'happy'); // open mouth on stretch (effort)
      drawCheeks();
      ctx.restore();

      // Suction-cup hands and feet pressed onto wall
      // Frame-based positions: GRIP=both close, STRETCH=hands reach up, PULL=body follows, RE-GRIP=feet move up
      const wallX = isLeft ? 0 : screenW - 7;
      const wallDir = isLeft ? 1 : -1;
      // Hand Y: top grip (hands reach higher during stretch)
      const handRaiseArr = [0, -10, -10, -5];
      const handYBase = creature.y + 10 + handRaiseArr[cf];
      // Foot Y: bottom (feet raise during re-grip)
      const footRaiseArr = [0, 0, -4, -10];
      const footYBase = creature.y + 34 + footRaiseArr[cf];

      // === HANDS (top grippers) ===
      ctx.fillStyle = C.body;
      ctx.fillRect(wallX, handYBase,     7, 5);
      ctx.fillRect(wallX, handYBase + 10, 7, 5);
      // Grip detail (finger lines toward wall)
      ctx.fillStyle = C.bodyDark;
      ctx.fillRect(wallX + (isLeft ? 0 : 4), handYBase + 1,     3, 1);
      ctx.fillRect(wallX + (isLeft ? 0 : 4), handYBase + 2,     3, 1);
      ctx.fillRect(wallX + (isLeft ? 0 : 4), handYBase + 11,    3, 1);
      ctx.fillRect(wallX + (isLeft ? 0 : 4), handYBase + 12,    3, 1);
      // Hand outline
      ctx.fillStyle = C.outline;
      ctx.fillRect(wallX, handYBase + 4,    7, 1);
      ctx.fillRect(wallX, handYBase + 14,   7, 1);

      // === FEET (bottom grippers) ===
      ctx.fillStyle = C.feet;
      ctx.fillRect(wallX, footYBase,     7, 5);
      ctx.fillRect(wallX, footYBase + 8, 7, 5);
      // Foot outline
      ctx.fillStyle = C.outline;
      ctx.fillRect(wallX, footYBase + 4,    7, 1);
      ctx.fillRect(wallX, footYBase + 12,   7, 1);
      // Toe lines
      ctx.fillStyle = C.bodyDark;
      ctx.fillRect(wallX + (isLeft ? 0 : 4), footYBase + 1, 3, 1);
      ctx.fillRect(wallX + (isLeft ? 0 : 4), footYBase + 9, 3, 1);

      // Slime/grip trail dots on wall
      if (cf === 2 || cf === 3) {
        ctx.fillStyle = 'rgba(180, 255, 200, 0.35)';
        ctx.beginPath();
        ctx.arc(wallX + 3, creature.y + SPRITE_SIZE + 2, 3, 0, Math.PI*2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(wallX + 3, creature.y + SPRITE_SIZE + 10, 2, 0, Math.PI*2);
        ctx.fill();
      }

      // Effort sweat drop during stretch
      if (cf === 1) {
        ctx.fillStyle = '#90caf9';
        const sweatX = isLeft ? creature.x + SPRITE_SIZE - 2 : creature.x + 2;
        ctx.fillRect(sweatX, creature.y + 10, 2, 3);
      }

      // ── Scared look DOWN easter egg ──
      // Override: body trembles, eyes look DOWN at the ground
      if (creature._climbLookingDown) {
        const trembleX = Math.sin(Date.now() / 40) * 2;
        ctx.save();
        ctx.translate(trembleX, 0);
        drawBody();
        // Wide scared eyes looking DOWN
        drawWideEyes();
        drawMouth('open');
        ctx.restore();
        // Sweat drops flying outward
        ctx.fillStyle = '#90caf9';
        ctx.globalAlpha = 0.8;
        ctx.fillRect(isLeft ? creature.x + SPRITE_SIZE - 4 : creature.x + 2, creature.y + 16, 2, 4);
        ctx.fillRect(isLeft ? creature.x + SPRITE_SIZE - 4 : creature.x + 2, creature.y + 24, 2, 3);
        ctx.globalAlpha = 1;
      }

      // ── Slip panic ── body flashes red briefly
      if (creature.climbSlipTimer > 0) {
        ctx.save();
        ctx.globalAlpha = 0.5;
        ctx.fillStyle = '#ff5252';
        ctx.beginPath();
        ctx.ellipse(creature.x + SPRITE_SIZE/2, creature.y + SPRITE_SIZE/2, 14, 14, 0, 0, Math.PI*2);
        ctx.fill();
        ctx.restore();
      }
      break;
    }
    case 'hang': {
      // Hanging upside-down from top of screen
      const cx3 = creature.x + SPRITE_SIZE / 2;
      const cy3 = creature.y + SPRITE_SIZE / 2;
      ctx.translate(cx3, cy3);
      ctx.rotate(Math.PI); // flip 180°
      ctx.translate(-cx3, -cy3);
      const hangSway = Math.sin(Date.now() / 600) * 1.5;
      ctx.translate(hangSway, 0);
      drawBody();
      drawEyes();
      drawMouth('bigGrin');
      drawCheeks();
      drawFeet(0);
      ctx.translate(-hangSway, 0);
      // Restore transform for grip
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      // Grip hands on top edge
      ctx.fillStyle = C.feet;
      ctx.fillRect(creature.x + 12, 0, 4, 4);
      ctx.fillRect(creature.x + SPRITE_SIZE - 16, 0, 4, 4);
      break;
    }
    case 'crying': {
      // Sad — body shakes gently, tears stream
      const sob = Math.sin(Date.now() / 150) * 1;
      ctx.translate(0, sob);
      drawBody();
      drawEyes();  // normal eyes but with sad brows
      drawSadBrows();
      drawMouth('cry');
      drawFeet(0);
      ctx.translate(0, -sob);
      drawTears();
      break;
    }
    case 'angry': {
      // Fuming — body turns RED, intense shaking, steam
      const angryShake = Math.sin(Date.now() / 40) * 3;
      // Temporarily swap colors to red
      const savedBody = C.body, savedDark = C.bodyDark, savedLight = C.bodyLight, savedFeet = C.feet;
      // Pulsing red intensity
      const redPulse = 0.6 + Math.sin(Date.now() / 200) * 0.15;
      C.body = `rgb(${Math.round(230 * redPulse)}, ${Math.round(60 * redPulse)}, ${Math.round(50 * redPulse)})`;
      C.bodyDark = '#8b1a1a';
      C.bodyLight = '#ff6b6b';
      C.feet = '#8b1a1a';
      ctx.translate(angryShake, 0);
      drawBody();
      drawEyes();
      drawAngryBrows();
      drawMouth('angry');
      drawFeet(0);
      ctx.translate(-angryShake, 0);
      // Restore colors
      C.body = savedBody; C.bodyDark = savedDark; C.bodyLight = savedLight; C.feet = savedFeet;
      drawAngerSteam();
      break;
    }
    case 'laughing': {
      // Laughing so hard — bouncing, tears of joy
      const laughBounce = Math.abs(Math.sin(Date.now() / 100)) * 4;
      const laughTilt = Math.sin(Date.now() / 200) * 0.08;
      const lcx = creature.x + SPRITE_SIZE / 2;
      const lcy = creature.y + SPRITE_SIZE / 2;
      ctx.translate(lcx, lcy);
      ctx.rotate(laughTilt);
      ctx.translate(-lcx, -lcy);
      ctx.translate(0, -laughBounce);
      drawBody();
      drawEyes(false, true); // squinting from laughing
      drawMouth('laugh');
      drawCheeks();
      drawFeet(f % 2);
      ctx.translate(0, laughBounce);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      drawLaughTears();
      drawHappySparkles();
      break;
    }
    case 'spider': {
      // Hanging from spider web string from ceiling!
      const spiderSwing = Math.sin(Date.now() / 700) * 15;
      const ropeLen = creature._ropeLen || 80;
      const anchorX = creature._anchorX || (creature.x + SPRITE_SIZE / 2);
      // Rope angle from swing
      const ropeAngle = Math.sin(Date.now() / 700) * 0.2;
      // Creature position = anchor + rope
      const bx = anchorX + Math.sin(ropeAngle) * ropeLen - SPRITE_SIZE / 2;
      const by = Math.cos(ropeAngle) * ropeLen;
      creature.x = bx;
      creature.y = by;
      // Draw the web string
      ctx.strokeStyle = 'rgba(220,220,220,0.7)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(anchorX, 0);
      ctx.lineTo(creature.x + SPRITE_SIZE / 2, creature.y + 4);
      ctx.stroke();
      // Small web at anchor point
      ctx.strokeStyle = 'rgba(220,220,220,0.3)';
      ctx.beginPath();
      ctx.arc(anchorX, 0, 6, 0.3, Math.PI - 0.3);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(anchorX, 0, 3, 0.5, Math.PI - 0.5);
      ctx.stroke();
      // Draw creature swinging
      const swTilt = ropeAngle * 0.5;
      const scx = creature.x + SPRITE_SIZE / 2;
      const scy = creature.y + SPRITE_SIZE / 2;
      ctx.translate(scx, scy);
      ctx.rotate(swTilt);
      ctx.translate(-scx, -scy);
      drawBody();
      drawEyes();
      drawMouth('bigGrin');
      drawCheeks();
      drawFeet(0);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      break;
    }
    case 'jetpack': {
      // JETPACK! Flying around with flames 🚀
      drawBody();
      drawEyes();
      drawMouth('bigGrin');
      drawCheeks();
      drawFeet(0);
      // Jetpack on back
      const jpSide = creature.facing === 1 ? -1 : 1;
      const jpX = creature.x + (creature.facing === 1 ? 2 : SPRITE_SIZE - 8);
      const jpY = creature.y + 14;
      // Jetpack body (dark metal box)
      ctx.fillStyle = '#546e7a';
      ctx.fillRect(jpX, jpY, 6, 16);
      ctx.fillStyle = '#37474f';
      ctx.fillRect(jpX + 1, jpY + 1, 4, 14);
      // Nozzles
      ctx.fillStyle = '#263238';
      ctx.fillRect(jpX, jpY + 16, 2, 3);
      ctx.fillRect(jpX + 4, jpY + 16, 2, 3);
      // 🔥 FLAMES! Animated flickering
      const ft2 = Date.now();
      for (let n = 0; n < 2; n++) {
        const nx = jpX + (n === 0 ? 0 : 4);
        const flameH = 8 + Math.sin(ft2 / 50 + n) * 4 + Math.random() * 3;
        const flameW = 3 + Math.sin(ft2 / 80 + n * 2) * 1;
        // Outer flame (orange)
        ctx.fillStyle = '#ff6d00';
        ctx.beginPath();
        ctx.moveTo(nx, jpY + 19);
        ctx.lineTo(nx + flameW, jpY + 19);
        ctx.lineTo(nx + flameW / 2, jpY + 19 + flameH);
        ctx.fill();
        // Inner flame (yellow)
        ctx.fillStyle = '#ffab00';
        ctx.beginPath();
        ctx.moveTo(nx + 0.5, jpY + 19);
        ctx.lineTo(nx + flameW - 0.5, jpY + 19);
        ctx.lineTo(nx + flameW / 2, jpY + 19 + flameH * 0.6);
        ctx.fill();
        // Core (white-hot)
        ctx.fillStyle = '#fff9c4';
        ctx.fillRect(nx + 1, jpY + 19, 1, flameH * 0.3);
      }
      // Smoke particles trailing behind
      ctx.fillStyle = 'rgba(150,150,150,0.2)';
      for (let p = 0; p < 4; p++) {
        const pAge = (ft2 / 100 + p * 3) % 8;
        const px3 = jpX + 3 + Math.sin(ft2 / 200 + p) * 4;
        const py3 = jpY + 22 + pAge * 6;
        const pSize = 2 + pAge * 0.5;
        ctx.globalAlpha = Math.max(0, 0.25 - pAge * 0.03);
        ctx.fillRect(px3, py3, pSize, pSize);
      }
      ctx.globalAlpha = 1;
      // Speed lines if moving fast
      const jpSpeed = Math.hypot(creature.vx, creature.vy);
      if (jpSpeed > 50) {
        ctx.strokeStyle = 'rgba(255,255,255,0.15)';
        ctx.lineWidth = 1;
        for (let sl = 0; sl < 3; sl++) {
          const slx = creature.x + Math.random() * SPRITE_SIZE;
          const sly = creature.y + Math.random() * SPRITE_SIZE;
          ctx.beginPath();
          ctx.moveTo(slx, sly);
          ctx.lineTo(slx - creature.vx * 0.04, sly - creature.vy * 0.04);
          ctx.stroke();
        }
      }
      break;
    }
    case 'tumble': {
      // Rolling ball — rotate the entire draw
      const cx = creature.x + SPRITE_SIZE / 2;
      const cy = creature.y + SPRITE_SIZE / 2;
      ctx.translate(cx, cy);
      ctx.rotate(creature.tumbleAngle);
      ctx.translate(-cx, -cy);
      drawBody();
      drawEyes(true); // X eyes while rolling
      drawMouth('open');
      drawFeet(0);
      // Motion dust
      const dustDir = -Math.sign(creature.vx);
      for (let i = 0; i < 3; i++) {
        const dx2 = dustDir * (10 + i * 8 + Math.random() * 5);
        const dy2 = 3 + Math.random() * 6;
        ctx.fillStyle = `rgba(180,180,180,${0.3 - i * 0.08})`;
        ctx.fillRect(cx + dx2, creature.y + SPRITE_SIZE - dy2, 2, 2);
      }
      break;
    }
    case 'balloon': {
      // 🎈 Floating up with a bubble gum balloon!
      const balloonSway = Math.sin(Date.now() / 500) * 6;
      const bcx = creature.x + SPRITE_SIZE / 2;
      ctx.translate(balloonSway * 0.3, 0);
      drawBody();
      drawEyes();
      drawMouth('happy');
      drawCheeks();
      drawFeet(0);
      ctx.translate(-balloonSway * 0.3, 0);
      // Balloon string
      ctx.strokeStyle = '#e0e0e0';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(bcx, creature.y + 6);
      ctx.quadraticCurveTo(bcx + balloonSway * 0.5, creature.y - 20, bcx + balloonSway, creature.y - 40);
      ctx.stroke();
      // Balloon (big circle)
      const balloonPhase = (creature.stateTimer / 3000); // 0→1 inflate
      const bRad = Math.min(balloonPhase * 16, 14) + Math.sin(Date.now() / 300) * 1;
      ctx.fillStyle = '#ff5252';
      ctx.beginPath();
      ctx.ellipse(bcx + balloonSway, creature.y - 40 - bRad * 0.3, bRad, bRad * 1.2, 0, 0, Math.PI * 2);
      ctx.fill();
      // Balloon shine
      ctx.fillStyle = 'rgba(255,255,255,0.3)';
      ctx.beginPath();
      ctx.arc(bcx + balloonSway - 3, creature.y - 44 - bRad * 0.3, 3, 0, Math.PI * 2);
      ctx.fill();
      // Balloon knot
      ctx.fillStyle = '#c62828';
      ctx.fillRect(bcx + balloonSway - 1, creature.y - 40 + bRad * 0.9, 3, 3);
      break;
    }
    case 'parachute': {
      // 🪂 Floating down with a parachute
      const pSway = Math.sin(Date.now() / 600) * 8;
      const pcx = creature.x + SPRITE_SIZE / 2;
      ctx.translate(pSway * 0.2, 0);
      drawBody();
      drawEyes();
      drawMouth('bigGrin');
      drawCheeks();
      drawFeet(0);
      ctx.translate(-pSway * 0.2, 0);
      // Parachute strings
      ctx.strokeStyle = '#bbb';
      ctx.lineWidth = 1;
      for (let ps = -1; ps <= 1; ps += 2) {
        ctx.beginPath();
        ctx.moveTo(creature.x + (ps === -1 ? 8 : SPRITE_SIZE - 8), creature.y + 4);
        ctx.lineTo(pcx + ps * 22 + pSway, creature.y - 30);
        ctx.stroke();
      }
      // Parachute canopy
      ctx.fillStyle = '#ff9800';
      ctx.beginPath();
      ctx.ellipse(pcx + pSway, creature.y - 34, 26, 14, 0, Math.PI, Math.PI * 2);
      ctx.fill();
      // Stripes on canopy
      ctx.fillStyle = '#fff3e0';
      ctx.beginPath();
      ctx.ellipse(pcx + pSway - 8, creature.y - 35, 6, 12, -0.1, Math.PI, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(pcx + pSway + 8, creature.y - 35, 6, 12, 0.1, Math.PI, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'screenWipe': {
      // 🧹 Wiping the screen with a cloth!
      const wipeStep = f % 2;
      drawBody();
      drawEyes(false, true); // focused closed eyes
      drawMouth('happy');
      drawFeet(wipeStep);
      // Arm holding cloth
      const clothX = creature.x + (creature.facing === 1 ? SPRITE_SIZE + 2 : -14);
      const clothY = creature.y + 16 + Math.sin(Date.now() / 100) * 3;
      // Arm
      ctx.strokeStyle = C.body;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(creature.x + (creature.facing === 1 ? SPRITE_SIZE - 6 : 6), creature.y + 20);
      ctx.lineTo(clothX + 6, clothY + 4);
      ctx.stroke();
      // Cloth
      ctx.fillStyle = '#42a5f5';
      ctx.fillRect(clothX, clothY, 12, 8);
      ctx.fillStyle = '#90caf9';
      ctx.fillRect(clothX + 2, clothY + 2, 4, 4);
      // Sparkle trail from wiping
      const wipeT = Date.now() / 150;
      for (let sp = 0; sp < 3; sp++) {
        const sparkA = (wipeT + sp * 1.5) % 3;
        if (sparkA > 2) continue;
        ctx.fillStyle = `rgba(255,255,255,${0.6 - sparkA * 0.3})`;
        const spx = clothX + 6 + sparkA * creature.facing * 8;
        const spy = clothY + 4 + Math.sin(sparkA * 3) * 4;
        ctx.fillRect(spx, spy, 2, 2);
        ctx.fillRect(spx + 1, spy - 1, 1, 1);
        ctx.fillRect(spx + 1, spy + 2, 1, 1);
      }
      break;
    }
    case 'sneeze': {
      // 🤧 Building up to a big sneeze!
      const sneezePhase = creature.stateTimer;
      if (sneezePhase < 800) {
        // Building up — scrunching face
        const scrunch = Math.sin(sneezePhase / 80) * 1;
        ctx.translate(0, scrunch);
        drawBody();
        drawEyes();
        drawMouth('sad');
        drawFeet(0);
        ctx.translate(0, -scrunch);
      } else if (sneezePhase < 1000) {
        // ACHOO! Recoil backward
        const recoil = (sneezePhase - 800) / 200;
        ctx.translate(-creature.facing * recoil * 6, -recoil * 3);
        drawBody();
        drawWideEyes();
        drawMouth('open');
        drawFeet(0);
        ctx.translate(creature.facing * recoil * 6, recoil * 3);
        // Sneeze particles!
        ctx.fillStyle = 'rgba(200,230,255,0.6)';
        for (let sn = 0; sn < 8; sn++) {
          const snAge = recoil * (1 + sn * 0.3);
          const snx = creature.x + (creature.facing === 1 ? SPRITE_SIZE : 0) + creature.facing * snAge * 30 + (Math.random() - 0.5) * 10;
          const sny = creature.y + 22 + (Math.random() - 0.5) * 12;
          ctx.fillRect(snx, sny, 2 + Math.random() * 2, 2);
        }
      } else {
        drawBody();
        drawEyes();
        drawMouth('happy');
        drawFeet(0);
      }
      break;
    }
    case 'skateboard': {
      // 🛹 Cruising on a skateboard!
      const skBob = Math.sin(Date.now() / 200) * 1;
      ctx.translate(0, -4 + skBob); // lifted above board
      drawBody();
      drawEyes();
      drawMouth('bigGrin');
      drawCheeks();
      // Bent knees — feet closer together
      mpx(6, 14, C.feet); mpx(7, 14, C.feet);
      mpx(9, 14, C.feet); mpx(10, 14, C.feet);
      ctx.translate(0, 4 - skBob);
      // Skateboard
      const skY = creature.y + SPRITE_SIZE - 2;
      ctx.fillStyle = '#795548';
      ctx.fillRect(creature.x - 4, skY, SPRITE_SIZE + 8, 4);
      // Board curve at edges
      ctx.fillRect(creature.x - 6, skY - 1, 4, 3);
      ctx.fillRect(creature.x + SPRITE_SIZE + 2, skY - 1, 4, 3);
      // Wheels
      ctx.fillStyle = '#333';
      ctx.fillRect(creature.x, skY + 4, 5, 3);
      ctx.fillRect(creature.x + SPRITE_SIZE - 5, skY + 4, 5, 3);
      // Wheel spin sparkle
      ctx.fillStyle = 'rgba(255,255,255,0.3)';
      ctx.fillRect(creature.x + 2, skY + 5, 1, 1);
      ctx.fillRect(creature.x + SPRITE_SIZE - 3, skY + 5, 1, 1);
      break;
    }
    case 'music': {
      // 🎸 Playing a tiny guitar!
      const musicBob = Math.sin(Date.now() / 250) * 1.5;
      ctx.translate(0, musicBob);
      drawBody();
      drawEyes(false, true); // feeling the music
      drawMouth('happy');
      drawCheeks();
      drawFeet(f % 2);
      ctx.translate(0, -musicBob);
      // Guitar
      const gx = creature.x + (creature.facing === 1 ? SPRITE_SIZE - 10 : -8);
      const gy = creature.y + 22;
      ctx.fillStyle = '#d84315';
      ctx.fillRect(gx, gy, 8, 10);       // body
      ctx.fillRect(gx + 2, gy - 8, 3, 10); // neck
      ctx.fillStyle = '#5d4037';
      ctx.fillRect(gx + 1, gy + 4, 6, 1); // sound hole
      ctx.fillStyle = '#ffd54f';
      ctx.fillRect(gx + 3, gy - 8, 1, 8); // strings
      // Flying music notes
      const noteT = Date.now() / 400;
      const noteSymbols = ['♪', '♫', '♪'];
      ctx.font = '10px serif';
      for (let ni = 0; ni < 3; ni++) {
        const nPhase = (noteT + ni * 1.3) % 3;
        if (nPhase > 2.5) continue;
        ctx.globalAlpha = Math.max(0, 1 - nPhase / 2.5);
        const noteColors = ['#ff5252', '#ffd54f', '#69f0ae'];
        ctx.fillStyle = noteColors[ni];
        const nx = creature.x + SPRITE_SIZE / 2 + Math.sin(nPhase * 2 + ni) * 15 + creature.facing * nPhase * 8;
        const ny = creature.y - nPhase * 18 + 10;
        ctx.fillText(noteSymbols[ni], nx, ny);
      }
      ctx.globalAlpha = 1;
      break;
    }
    case 'disco': {
      // 🪩 DISCO MODE! Color cycling + dance moves
      const discoBeat = Math.floor(Date.now() / 250) % 4;
      const discoColors = ['#ff1744', '#ffd54f', '#00e676', '#2979ff', '#e040fb'];
      const cIdx = Math.floor(Date.now() / 150) % discoColors.length;
      // Rainbow body
      const savedBC = C.body; const savedBD = C.bodyDark; const savedBL = C.bodyLight;
      C.body = discoColors[cIdx];
      C.bodyDark = discoColors[(cIdx + 1) % discoColors.length];
      C.bodyLight = discoColors[(cIdx + 2) % discoColors.length];
      // Dance pose based on beat
      const danceY = discoBeat < 2 ? -3 : 0;
      const danceTilt = (discoBeat % 2 === 0 ? 0.08 : -0.08);
      const dcx = creature.x + SPRITE_SIZE / 2;
      const dcy = creature.y + SPRITE_SIZE / 2;
      ctx.translate(dcx, dcy);
      ctx.rotate(danceTilt);
      ctx.translate(-dcx, -dcy);
      ctx.translate(0, danceY);
      drawBody();
      drawEyes(false, true); // vibing
      drawMouth('bigGrin');
      drawFeet(discoBeat % 2);
      ctx.translate(0, -danceY);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      C.body = savedBC; C.bodyDark = savedBD; C.bodyLight = savedBL;
      // Disco particles
      for (let dp = 0; dp < 6; dp++) {
        const da = Date.now() / 200 + dp * 1.047;
        const dd = 20 + Math.sin(da * 0.7) * 8;
        ctx.fillStyle = discoColors[dp % discoColors.length];
        ctx.globalAlpha = 0.6;
        ctx.fillRect(dcx + Math.cos(da) * dd, dcy + Math.sin(da) * dd, 3, 3);
      }
      ctx.globalAlpha = 1;
      // Floor light beam
      ctx.fillStyle = `rgba(${cIdx * 50}, ${255 - cIdx * 30}, ${cIdx * 40}, 0.04)`;
      ctx.beginPath();
      ctx.moveTo(dcx - 30, groundY + SPRITE_SIZE);
      ctx.lineTo(dcx - 5, creature.y + SPRITE_SIZE);
      ctx.lineTo(dcx + 5, creature.y + SPRITE_SIZE);
      ctx.lineTo(dcx + 30, groundY + SPRITE_SIZE);
      ctx.fill();
      break;
    }
    case 'superhero': {
      // 🦸 SUPERHERO! Cape + fist forward + flying
      const shTilt = Math.sin(Date.now() / 400) * 0.1;
      const shcx = creature.x + SPRITE_SIZE / 2;
      const shcy = creature.y + SPRITE_SIZE / 2;
      ctx.translate(shcx, shcy);
      ctx.rotate(creature.facing * -0.3 + shTilt); // leaning forward
      ctx.translate(-shcx, -shcy);
      drawBody();
      drawEyes();
      drawMouth('bigGrin');
      drawFeet(0);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      // Cape (flows behind)
      const capeFlutter = Math.sin(Date.now() / 150) * 3;
      ctx.fillStyle = '#d32f2f';
      const capeBack = creature.facing === 1 ? creature.x - 2 : creature.x + SPRITE_SIZE + 2;
      const capeDir2 = creature.facing === 1 ? -1 : 1;
      ctx.beginPath();
      ctx.moveTo(capeBack, creature.y + 12);
      ctx.quadraticCurveTo(
        capeBack + capeDir2 * 18, creature.y + 30 + capeFlutter,
        capeBack + capeDir2 * 22, creature.y + SPRITE_SIZE + 8 + capeFlutter
      );
      ctx.lineTo(capeBack + capeDir2 * 8, creature.y + SPRITE_SIZE + 4 + capeFlutter);
      ctx.lineTo(capeBack, creature.y + 24);
      ctx.fill();
      // Fist forward
      ctx.fillStyle = C.body;
      const fistX = creature.x + (creature.facing === 1 ? SPRITE_SIZE + 4 : -8);
      ctx.fillRect(fistX, creature.y + 16, 6, 5);
      ctx.fillStyle = C.bodyDark;
      ctx.fillRect(fistX + 1, creature.y + 17, 4, 1);
      // Speed whoosh
      ctx.strokeStyle = 'rgba(255,255,255,0.2)';
      ctx.lineWidth = 1;
      for (let wl = 0; wl < 4; wl++) {
        const wy = creature.y + 10 + wl * 8;
        const wx = creature.x + (creature.facing === 1 ? -5 : SPRITE_SIZE + 5);
        ctx.beginPath();
        ctx.moveTo(wx, wy);
        ctx.lineTo(wx - creature.facing * (12 + wl * 3), wy);
        ctx.stroke();
      }
      break;
    }
    case 'rainbow': {
      // 🌈 Rainbow run — color cycling body + rainbow trail
      const rbColors = ['#ff1744','#ff9100','#ffd54f','#00e676','#2979ff','#e040fb'];
      const rbIdx = Math.floor(Date.now() / 100) % rbColors.length;
      const svB = C.body, svD = C.bodyDark, svL = C.bodyLight;
      C.body = rbColors[rbIdx]; C.bodyDark = rbColors[(rbIdx+1)%6]; C.bodyLight = rbColors[(rbIdx+2)%6];
      const rbBob = Math.abs(Math.sin(Date.now() / 120)) * 3;
      ctx.translate(0, -rbBob);
      drawBody(); drawEyes(); drawMouth('bigGrin'); drawCheeks(); drawFeet(f%2);
      ctx.translate(0, rbBob);
      C.body = svB; C.bodyDark = svD; C.bodyLight = svL;
      // Rainbow trail behind
      if (creature._trail) {
        for (let ti = 0; ti < creature._trail.length; ti++) {
          const tp = creature._trail[ti];
          ctx.globalAlpha = (ti / creature._trail.length) * 0.4;
          ctx.fillStyle = rbColors[ti % 6];
          ctx.fillRect(tp.x + SPRITE_SIZE/2 - 2, tp.y + SPRITE_SIZE/2 + (ti % 3) * 3 - 3, 4, 3);
        }
        ctx.globalAlpha = 1;
      }
      break;
    }
    case 'dreamBubble': {
      // Handled by sleep state — this is a sub-effect, not standalone
      drawBody(); drawEyes(false,true); drawMouth('happy'); drawFeet(0);
      break;
    }
    case 'eating': {
      // 🍕 Found food! Nom nom nom
      const eatPhase = creature.stateTimer / 1000;
      const chew = Math.sin(Date.now() / 120) * 1;
      ctx.translate(0, chew);
      drawBody(); drawEyes(false, eatPhase > 1); // close eyes while savoring
      drawMouth(eatPhase < 1.5 ? 'open' : 'happy');
      drawCheeks(); drawFeet(0);
      ctx.translate(0, -chew);
      // Food item in front
      const foodX = creature.x + (creature.facing === 1 ? SPRITE_SIZE - 2 : -12);
      const foodY = creature.y + 24;
      if (eatPhase < 2.5) {
        // Pizza slice
        ctx.fillStyle = '#ffd54f';
        ctx.beginPath();
        ctx.moveTo(foodX, foodY); ctx.lineTo(foodX + 10, foodY + 4); ctx.lineTo(foodX + 10, foodY - 4);
        ctx.fill();
        ctx.fillStyle = '#ff5722'; // pepperoni
        ctx.fillRect(foodX + 4, foodY - 1, 2, 2);
        ctx.fillRect(foodX + 6, foodY + 1, 2, 2);
        // Bite marks as eating progresses
        if (eatPhase > 0.8) { ctx.fillStyle = '#1a1a2e'; ctx.fillRect(foodX + 8, foodY - 2, 3, 6); }
        if (eatPhase > 1.6) { ctx.fillStyle = '#1a1a2e'; ctx.fillRect(foodX + 5, foodY - 2, 6, 6); }
      }
      // Happy crumbs
      if (eatPhase > 0.5 && eatPhase < 3) {
        ctx.fillStyle = '#ffd54f';
        for (let cr = 0; cr < 3; cr++) {
          const crAge = (Date.now()/200 + cr*2) % 2;
          ctx.globalAlpha = Math.max(0, 0.5 - crAge*0.25);
          ctx.fillRect(foodX + cr*4 + crAge*3, foodY + 6 + crAge*8, 2, 2);
        }
        ctx.globalAlpha = 1;
      }
      break;
    }
    case 'clone': {
      // 🧬 A wild clone appears!
      drawBody(); drawEyes(); drawMouth('happy'); drawCheeks(); drawFeet(f%2);
      // Draw the clone slightly behind/offset
      if (creature._cloneOffset) {
        const co = creature._cloneOffset;
        const oldX = creature.x, oldY = creature.y;
        creature.x += co.dx; creature.y += co.dy;
        ctx.globalAlpha = 0.7;
        drawBody(); drawEyes(); drawMouth('happy'); drawCheeks(); drawFeet((f+1)%2);
        ctx.globalAlpha = 1;
        creature.x = oldX; creature.y = oldY;
        // "?" over clone's head
        ctx.font = '10px monospace'; ctx.fillStyle = '#ffd54f';
        ctx.fillText('?', oldX + co.dx + SPRITE_SIZE/2 - 3, oldY + co.dy - 4);
      }
      break;
    }
    case 'trampoline': {
      // 🤸 Bouncing higher and higher!
      const trampStretch = creature.vy < 0 ? -2 : 2;
      ctx.translate(0, trampStretch);
      drawBody(); drawEyes(); drawMouth(creature.vy < -200 ? 'laugh' : 'bigGrin');
      drawCheeks(); drawFeet(0);
      ctx.translate(0, -trampStretch);
      // Trampoline platform on ground
      ctx.fillStyle = '#546e7a';
      ctx.fillRect(creature._trampX || creature.x - 10, groundY + SPRITE_SIZE - 2, SPRITE_SIZE + 20, 4);
      ctx.fillStyle = '#42a5f5';
      const trampFlex = creature.onGround ? 3 : 0;
      ctx.fillRect((creature._trampX || creature.x - 10) + 4, groundY + SPRITE_SIZE - 3 - trampFlex, SPRITE_SIZE + 12, 2);
      // Spring coils
      ctx.strokeStyle = '#90a4ae'; ctx.lineWidth = 1;
      for (let tc = 0; tc < 3; tc++) {
        const tcx = (creature._trampX || creature.x - 10) + 8 + tc * 14;
        ctx.beginPath(); ctx.moveTo(tcx, groundY + SPRITE_SIZE + 2); ctx.lineTo(tcx, groundY + SPRITE_SIZE + 6); ctx.stroke();
      }
      break;
    }
    case 'ninja': {
      // 🥷 Ninja wall-jump — zigzag between walls!
      const ninjaStep = f % 2;
      drawBody(); drawEyes(); drawMouth('happy');
      drawFeet(ninjaStep);
      // Ninja headband
      ctx.fillStyle = '#ff1744';
      ctx.fillRect(creature.x + 9, creature.y + 11, SPRITE_SIZE - 18, 3);
      // Trailing headband tails
      const tailWave = Math.sin(Date.now() / 100) * 3;
      const hbDir = creature.facing === 1 ? -1 : 1;
      ctx.fillRect(creature.x + (creature.facing===1 ? 8 : SPRITE_SIZE-12), creature.y + 12, 2, 6 + tailWave);
      // Motion blur lines
      ctx.strokeStyle = 'rgba(255,255,255,0.2)'; ctx.lineWidth = 1;
      for (let ml = 0; ml < 3; ml++) {
        ctx.beginPath();
        ctx.moveTo(creature.x + SPRITE_SIZE/2, creature.y + 10 + ml*10);
        ctx.lineTo(creature.x + SPRITE_SIZE/2 - creature.vx*0.03, creature.y + 10 + ml*10 - creature.vy*0.03);
        ctx.stroke();
      }
      break;
    }
    case 'selfie': {
      // 📱 Taking a selfie!
      const selfiePhase = creature.stateTimer / 1000;
      drawBody(); drawEyes();
      drawMouth(selfiePhase > 1 && selfiePhase < 2 ? 'bigGrin' : 'happy');
      drawCheeks(); drawFeet(0);
      // Phone held out
      const phX = creature.x + (creature.facing === 1 ? SPRITE_SIZE + 2 : -14);
      const phY = creature.y + 10;
      ctx.fillStyle = '#212121';
      ctx.fillRect(phX, phY, 10, 16);
      ctx.fillStyle = '#42a5f5';
      ctx.fillRect(phX + 1, phY + 2, 8, 10);
      // Camera dot
      ctx.fillStyle = '#333'; ctx.fillRect(phX + 4, phY + 1, 2, 1);
      // Flash!
      if (selfiePhase > 1.2 && selfiePhase < 1.5) {
        ctx.fillStyle = `rgba(255,255,255,${0.6 - (selfiePhase - 1.2) * 2})`;
        ctx.beginPath();
        ctx.arc(creature.x + SPRITE_SIZE/2, creature.y + SPRITE_SIZE/2, 40, 0, Math.PI*2);
        ctx.fill();
      }
      // Arm
      ctx.strokeStyle = C.body; ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(creature.x + (creature.facing===1 ? SPRITE_SIZE-6 : 6), creature.y + 18);
      ctx.lineTo(phX + 5, phY + 8);
      ctx.stroke();
      break;
    }
    case 'bungee': {
      // 🪀 Bungee jumping — yo-yo from top!
      const bAnchor = creature._bungeeAnchorX || (creature.x + SPRITE_SIZE/2);
      const bSway = Math.sin(Date.now() / 400) * 10;
      drawBody(); drawEyes();
      drawMouth(creature.vy > 100 ? 'open' : 'bigGrin');
      drawCheeks(); drawFeet(0);
      // Elastic cord from top
      ctx.strokeStyle = '#69f0ae'; ctx.lineWidth = 2;
      ctx.setLineDash([4,3]);
      ctx.beginPath();
      ctx.moveTo(bAnchor, 0);
      ctx.quadraticCurveTo(bAnchor + bSway, creature.y / 2, creature.x + SPRITE_SIZE/2, creature.y + 4);
      ctx.stroke();
      ctx.setLineDash([]);
      break;
    }
    case 'hiccup': {
      // 🫨 Hiccup! Random jumps
      const hicBob = creature._hicJump ? -creature._hicJump : 0;
      ctx.translate(0, hicBob);
      drawBody();
      // Wide eyes only DURING the hiccup jump, normal eyes between
      if (creature._hicJump > 1) {
        drawWideEyes(); // surprised mid-hiccup
        drawMouth('open');
      } else {
        drawEyes();
        drawMouth('happy'); // normal between hiccups
        drawCheeks();
      }
      drawFeet(0);
      ctx.translate(0, -hicBob);
      // "hic!" text
      if (creature._hicJump > 2) {
        ctx.font = '9px monospace'; ctx.fillStyle = '#aaa';
        ctx.fillText('hic!', creature.x + SPRITE_SIZE + 2, creature.y + 10);
      }
      break;
    }
    case 'graffiti': {
      // 🎨 Drawing pixel art while walking!
      const grStep = f % 2;
      drawBody(); drawEyes(false, true); // focused
      drawMouth('happy'); drawCheeks(); drawFeet(grStep);
      // Tiny pencil/brush in hand
      const penX = creature.x + (creature.facing === 1 ? SPRITE_SIZE - 4 : -4);
      ctx.fillStyle = '#ffd54f'; ctx.fillRect(penX, creature.y + 34, 2, 8);
      ctx.fillStyle = '#e91e63'; ctx.fillRect(penX, creature.y + 42, 2, 2);
      break;
    }
    case 'sprint': {
      // 🏃 Running fast! Leaning forward, dust clouds behind
      const sprintLean = creature.facing * 0.15;
      const sprintBob = Math.abs(Math.sin(Date.now() / 60)) * 3;
      const scx2 = creature.x + SPRITE_SIZE / 2;
      const scy2 = creature.y + SPRITE_SIZE / 2;
      ctx.translate(scx2, scy2);
      ctx.rotate(sprintLean);
      ctx.translate(-scx2, -scy2);
      ctx.translate(0, -sprintBob);
      drawBody();
      drawEyes();
      drawMouth('bigGrin');
      drawFeet(f % 2);
      ctx.translate(0, sprintBob);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      // Dust clouds behind
      const dustT = Date.now();
      for (let d = 0; d < 4; d++) {
        const dAge = (dustT / 80 + d * 5) % 12;
        ctx.globalAlpha = Math.max(0, 0.3 - dAge * 0.025);
        ctx.fillStyle = '#aaa';
        const ddx = creature.x + SPRITE_SIZE / 2 - creature.facing * (8 + dAge * 3);
        const ddy = creature.y + SPRITE_SIZE - 4 + Math.sin(dAge) * 3;
        ctx.beginPath(); ctx.arc(ddx, ddy, 2 + dAge * 0.3, 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalAlpha = 1;
      // Speed lines behind
      ctx.strokeStyle = 'rgba(255,255,255,0.15)';
      ctx.lineWidth = 1;
      for (let sl = 0; sl < 3; sl++) {
        const sly = creature.y + 12 + sl * 12;
        ctx.beginPath();
        ctx.moveTo(creature.x + SPRITE_SIZE/2 - creature.facing * 20, sly);
        ctx.lineTo(creature.x + SPRITE_SIZE/2 - creature.facing * 50, sly);
        ctx.stroke();
      }
      break;
    }
    case 'machinegun': {
      // 🔫 Machine gun — recoil + muzzle flash + shell casings
      const mgRecoil = Math.sin(creature.stateTimer * 25) * 2;
      ctx.translate(-creature.facing * mgRecoil, mgRecoil * 0.3);
      drawBody();
      drawEyes(); // wide-eyed shooter face
      drawMouth('bigGrin');
      drawFeet(Math.floor(creature.stateTimer * 10) % 2);
      ctx.translate(creature.facing * mgRecoil, -mgRecoil * 0.3);
      // Gun
      const gunX = creature.facing === 1 ? creature.x + SPRITE_SIZE : creature.x - 18;
      const gunY = creature.y + 22;
      const gd = creature.facing;
      ctx.fillStyle = '#424242';
      ctx.fillRect(gunX, gunY, 16 * gd, 4); // barrel
      ctx.fillRect(gunX - 2 * gd, gunY + 2, 6 * gd, 8); // body
      ctx.fillStyle = '#616161';
      ctx.fillRect(gunX, gunY + 1, 14 * gd, 2); // barrel highlight
      // Muzzle flash
      if (creature._mgFlash > 0) {
        ctx.fillStyle = '#ffeb3b';
        ctx.globalAlpha = creature._mgFlash;
        const fX = gunX + 16 * gd;
        ctx.beginPath(); ctx.arc(fX, gunY + 2, 5 + Math.random() * 3, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.arc(fX, gunY + 2, 2, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 1;
      }
      // Flying bullets
      if (creature._mgBullets) {
        ctx.fillStyle = '#ffd54f';
        for (const b of creature._mgBullets) {
          ctx.fillRect(b.x, b.y, 4 * gd, 2);
        }
        // Shell casings
        ctx.fillStyle = '#ff8f00';
        for (const b of creature._mgBullets) {
          if (b.shell) {
            ctx.fillRect(b.sx, b.sy, 2, 3);
          }
        }
      }
      break;
    }
    case 'bombing': {
      // 💣 Throwing bombs
      drawBody();
      const throwPhase = creature.stateTimer % 2000;
      if (throwPhase < 400) {
        // Wind up — arm raised
        drawWideEyes();
        drawMouth('open');
        ctx.fillStyle = C.feet;
        ctx.fillRect(creature.x + (creature.facing === 1 ? 36 : 6), creature.y + 14, 4, 4);
      } else {
        drawEyes();
        drawMouth('bigGrin');
      }
      drawFeet(0);
      // Draw active bombs
      if (creature._bombs) {
        for (const bomb of creature._bombs) {
          if (bomb.exploded) {
            // Explosion circle
            const ea = Math.min(1, (Date.now() - bomb.explodeTime) / 400);
            ctx.globalAlpha = 1 - ea;
            const eR = 8 + ea * 25;
            // Orange outer
            ctx.fillStyle = '#ff6d00';
            ctx.beginPath(); ctx.arc(bomb.x, bomb.y, eR, 0, Math.PI * 2); ctx.fill();
            // Yellow inner
            ctx.fillStyle = '#ffeb3b';
            ctx.beginPath(); ctx.arc(bomb.x, bomb.y, eR * 0.5, 0, Math.PI * 2); ctx.fill();
            // White core
            ctx.fillStyle = '#fff';
            ctx.beginPath(); ctx.arc(bomb.x, bomb.y, eR * 0.2, 0, Math.PI * 2); ctx.fill();
            ctx.globalAlpha = 1;
          } else {
            // Bomb body
            ctx.fillStyle = '#333';
            ctx.beginPath(); ctx.arc(bomb.x, bomb.y, 5, 0, Math.PI * 2); ctx.fill();
            // Fuse
            ctx.strokeStyle = '#ff6d00';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(bomb.x + 3, bomb.y - 4);
            ctx.quadraticCurveTo(bomb.x + 6, bomb.y - 8, bomb.x + 4, bomb.y - 10);
            ctx.stroke();
            // Fuse spark
            ctx.fillStyle = '#ffeb3b';
            ctx.beginPath(); ctx.arc(bomb.x + 4, bomb.y - 10, 2 + Math.random(), 0, Math.PI * 2); ctx.fill();
          }
        }
      }
      break;
    }
    case 'darts': {
      // 🎯 Playing darts — dartboard + throwing
      const dartPhase = creature.stateTimer % 2500;
      if (dartPhase < 600) {
        // Aiming — squinting
        ctx.translate(0, -1);
        drawBody();
        // One eye closed (aiming)
        mpx(5, 7, C.eye); mpx(6, 7, C.eye); mpx(5, 8, C.eye); mpx(6, 8, C.eye);
        mpx(9, 7, C.outline); mpx(10, 7, C.outline); // closed eye
        drawMouth('happy');
      } else {
        drawBody();
        drawEyes();
        drawMouth(dartPhase < 900 ? 'open' : 'happy');
      }
      drawFeet(0);
      // Dartboard on the wall (right side)
      const dbX = creature.facing === 1 ? creature.x + 60 : creature.x - 30;
      const dbY = creature.y - 5;
      ctx.fillStyle = '#212121';
      ctx.beginPath(); ctx.arc(dbX, dbY, 14, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#f44336';
      ctx.beginPath(); ctx.arc(dbX, dbY, 11, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(dbX, dbY, 7, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#f44336';
      ctx.beginPath(); ctx.arc(dbX, dbY, 4, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ffeb3b';
      ctx.beginPath(); ctx.arc(dbX, dbY, 1.5, 0, Math.PI * 2); ctx.fill();
      // Stuck darts
      if (creature._darts) {
        for (const d of creature._darts) {
          ctx.fillStyle = '#2196f3';
          ctx.fillRect(d.x - 1, d.y - 1, 3, 3);
          ctx.fillStyle = '#bbb';
          const dx2 = d.x - dbX, dy2 = d.y - dbY;
          const dist2 = Math.sqrt(dx2*dx2 + dy2*dy2);
          const nx = dist2 > 0 ? dx2/dist2 : 0, ny = dist2 > 0 ? dy2/dist2 : 0;
          ctx.fillRect(d.x + nx*3, d.y + ny*3, 2, 2);
        }
      }
      // Score display
      if (creature._dartScore > 0) {
        ctx.fillStyle = '#ffd54f';
        ctx.font = 'bold 9px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(creature._dartScore + ' pts', dbX, dbY + 22);
      }
      break;
    }
    case 'bedtime': {
      // 🛏️ In bed with blanket + floating Zzz
      const bedL = creature.x - 6;
      const bedW = SPRITE_SIZE + 12;
      const bedY = creature.y + 8;
      // Bed frame
      ctx.fillStyle = '#5d4037';
      ctx.fillRect(bedL, bedY + 20, bedW, 6); // base
      ctx.fillRect(bedL, bedY + 4, 4, 22);    // headboard left
      ctx.fillRect(bedL + bedW - 4, bedY + 14, 4, 12); // footboard
      // Headboard
      ctx.fillStyle = '#795548';
      ctx.fillRect(bedL - 2, bedY - 2, 8, 24);
      // Mattress
      ctx.fillStyle = '#e8e0d8';
      ctx.fillRect(bedL + 4, bedY + 10, bedW - 8, 12);
      // Blanket
      ctx.fillStyle = '#7986cb';
      ctx.fillRect(bedL + 8, bedY + 8, bedW - 16, 14);
      ctx.fillStyle = '#5c6bc0';
      ctx.fillRect(bedL + 8, bedY + 8, bedW - 16, 3); // fold
      // Pillow
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.roundRect ? ctx.roundRect(bedL + 5, bedY + 6, 14, 8, 3) : ctx.fillRect(bedL + 5, bedY + 6, 14, 8);
      ctx.fill();
      // Bitsy head poking out
      ctx.fillStyle = C.body;
      ctx.beginPath(); ctx.arc(bedL + 14, bedY + 6, 7, Math.PI, 0); ctx.fill();
      // Closed eyes
      ctx.fillStyle = C.outline;
      ctx.fillRect(bedL + 10, bedY + 4, 2, 1);
      ctx.fillRect(bedL + 15, bedY + 4, 2, 1);
      // Cheeks
      ctx.fillStyle = C.cheek;
      ctx.fillRect(bedL + 8, bedY + 6, 2, 1);
      ctx.fillRect(bedL + 18, bedY + 6, 2, 1);
      // Floating ZZZ
      if (creature._zzz) {
        const now = Date.now();
        ctx.font = 'bold 11px monospace';
        for (const z of creature._zzz) {
          const age = (now - z.born) / 1000;
          const alpha = Math.max(0, 1 - age / 2.5);
          ctx.globalAlpha = alpha;
          ctx.fillStyle = '#90caf9';
          const zy = z.startY - age * 20; // float up
          const zx = z.startX + Math.sin(age * 2) * 8; // sway
          const scale = 0.6 + age * 0.3;
          ctx.font = `bold ${Math.round(10 * scale)}px monospace`;
          ctx.fillText('Z', zx, zy);
        }
        ctx.globalAlpha = 1;
      }
      break;
    }
    case 'fishing': {
      // 🎣 Sitting and fishing
      const fishX = creature.x;
      const fishY = creature.y;
      // Bitsy sitting
      drawBody();
      drawEyes();
      drawMouth(creature._fishCaught ? 'bigGrin' : 'happy');
      drawCheeks();
      // Legs dangling
      mpx(5, 13, C.feet); mpx(6, 14, C.feet);
      mpx(10, 13, C.feet); mpx(11, 14, C.feet);
      // Fishing rod
      const rodDir = creature.facing;
      const rodEndX = fishX + SPRITE_SIZE/2 + rodDir * 35;
      const rodEndY = fishY - 15;
      ctx.strokeStyle = '#8d6e63';
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(fishX + SPRITE_SIZE/2 + rodDir * 8, fishY + 18);
      ctx.quadraticCurveTo(rodEndX - rodDir * 5, fishY - 5, rodEndX, rodEndY);
      ctx.stroke();
      // Fishing line
      ctx.strokeStyle = '#bbb';
      ctx.lineWidth = 0.8;
      const bobY = fishY + 20 + creature._fishBob;
      ctx.beginPath();
      ctx.moveTo(rodEndX, rodEndY);
      ctx.lineTo(rodEndX, bobY);
      ctx.stroke();
      // Bobber
      ctx.fillStyle = '#e53935';
      ctx.beginPath(); ctx.arc(rodEndX, bobY, 3, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(rodEndX, bobY, 3, Math.PI, 0); ctx.fill();
      // Caught fish!
      if (creature._fishCaught) {
        ctx.fillStyle = '#42a5f5';
        const fflip = Math.sin(Date.now() / 100) * 3;
        ctx.beginPath();
        ctx.ellipse(rodEndX, bobY - 8 + fflip, 6, 3, 0.2, 0, Math.PI * 2);
        ctx.fill();
        // Tail
        ctx.beginPath();
        ctx.moveTo(rodEndX + 5, bobY - 8 + fflip);
        ctx.lineTo(rodEndX + 10, bobY - 12 + fflip);
        ctx.lineTo(rodEndX + 10, bobY - 4 + fflip);
        ctx.closePath(); ctx.fill();
        // Eye
        ctx.fillStyle = '#fff';
        ctx.fillRect(rodEndX - 3, bobY - 9 + fflip, 2, 2);
      }
      break;
    }
    case 'bughunt': {
      // 🐛 Chasing bugs — focused predator mode
      const hunting = !!creature._bugTarget;
      drawBody();
      if (hunting) { drawWideEyes(); drawMouth('open'); } // focused
      else { drawEyes(); drawMouth('happy'); }
      drawFeet(f % 2);
      // Draw bugs
      if (creature._bugs) {
        for (const bug of creature._bugs) {
          if (bug.eaten) continue;
          ctx.fillStyle = bug.color;
          ctx.beginPath(); ctx.ellipse(bug.x, bug.y, 4, 2.5, bug.angle, 0, Math.PI*2); ctx.fill();
          // Legs
          ctx.strokeStyle = bug.color; ctx.lineWidth = 0.8;
          for (let l = -1; l <= 1; l++) {
            const la = bug.angle + l * 0.5;
            ctx.beginPath();
            ctx.moveTo(bug.x + Math.cos(la)*3, bug.y + Math.sin(la)*3);
            ctx.lineTo(bug.x + Math.cos(la)*6, bug.y + Math.sin(la)*6 + 2);
            ctx.stroke();
          }
          // Antennae
          ctx.beginPath();
          ctx.moveTo(bug.x + Math.cos(bug.angle)*4, bug.y + Math.sin(bug.angle)*2);
          ctx.lineTo(bug.x + Math.cos(bug.angle)*7, bug.y + Math.sin(bug.angle)*2 - 3);
          ctx.stroke();
        }
      }
      break;
    }
    case 'garden': {
      // 🌱 Planting and growing
      drawBody(); drawEyes(); drawMouth('happy'); drawCheeks(); drawFeet(0);
      const gx = creature._gardenX || creature.x;
      const gy = groundY + SPRITE_SIZE - 4;
      const stage = creature._gardenStage || 0;
      if (stage >= 1) {
        // Soil mound
        ctx.fillStyle = '#5d4037';
        ctx.fillRect(gx + 18, gy, 12, 4);
      }
      if (stage >= 2) {
        // Sprout
        ctx.fillStyle = '#4caf50';
        ctx.fillRect(gx + 23, gy - 8, 2, 8);
        ctx.fillRect(gx + 20, gy - 6, 3, 2);
        ctx.fillRect(gx + 25, gy - 4, 3, 2);
      }
      if (stage >= 3) {
        // Flower!
        ctx.fillStyle = '#e91e63';
        const petalA = [[0,-4],[4,0],[0,4],[-4,0]];
        for (const [px4,py4] of petalA) {
          ctx.beginPath(); ctx.arc(gx+24+px4, gy-14+py4, 3, 0, Math.PI*2); ctx.fill();
        }
        ctx.fillStyle = '#ffeb3b';
        ctx.beginPath(); ctx.arc(gx+24, gy-14, 2, 0, Math.PI*2); ctx.fill();
        ctx.fillStyle = '#4caf50';
        ctx.fillRect(gx+23, gy-12, 2, 12);
        // Leaves
        ctx.fillStyle = '#66bb6a';
        ctx.beginPath(); ctx.ellipse(gx+20, gy-6, 4, 2, -0.5, 0, Math.PI*2); ctx.fill();
        ctx.beginPath(); ctx.ellipse(gx+28, gy-8, 4, 2, 0.5, 0, Math.PI*2); ctx.fill();
      }
      // Watering can (while watering)
      if (stage === 1 || stage === 2) {
        const wt = Date.now() / 200;
        ctx.fillStyle = '#42a5f5';
        for (let d = 0; d < 3; d++) {
          const dy2 = ((wt + d * 3) % 8);
          ctx.globalAlpha = 1 - dy2/8;
          ctx.fillRect(gx + 22 + d*2, gy - 12 + dy2, 1, 2);
        }
        ctx.globalAlpha = 1;
      }
      break;
    }
    case 'cursorride': {
      // 🏄 Riding on cursor
      const rx = mouseX - SPRITE_SIZE/2;
      const ry = mouseY - SPRITE_SIZE - 5;
      creature.x = rx; creature.y = ry;
      const lean = Math.sin(Date.now()/200) * 0.1;
      const ccx = rx + SPRITE_SIZE/2, ccy = ry + SPRITE_SIZE/2;
      ctx.translate(ccx, ccy); ctx.rotate(lean); ctx.translate(-ccx, -ccy);
      drawBody(); drawEyes(); drawMouth('bigGrin'); drawCheeks(); drawFeet(0);
      // Sparkle trail
      ctx.fillStyle = '#ffd54f';
      for (let s = 0; s < 5; s++) {
        const sa2 = Date.now()/100 + s*1.2;
        ctx.globalAlpha = 0.6 - s*0.1;
        ctx.fillRect(rx + SPRITE_SIZE/2 + Math.cos(sa2)*10, ry + SPRITE_SIZE + Math.sin(sa2)*4, 2, 2);
      }
      ctx.globalAlpha = 1;
      break;
    }
    case 'portal': {
      // 🔮 Portal teleportation
      const pp = creature._portalPhase || 0;
      // Draw portals
      const drawPortal = (px5, py5, alpha) => {
        ctx.globalAlpha = alpha;
        ctx.strokeStyle = '#ce93d8'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(px5, py5, 16 + Math.sin(Date.now()/200)*3, 0, Math.PI*2); ctx.stroke();
        ctx.strokeStyle = '#ab47bc'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(px5, py5, 10 + Math.sin(Date.now()/150)*2, 0, Math.PI*2); ctx.stroke();
        ctx.fillStyle = 'rgba(156,39,176,0.3)';
        ctx.beginPath(); ctx.arc(px5, py5, 12, 0, Math.PI*2); ctx.fill();
        // Inner swirl
        ctx.strokeStyle = '#e1bee7'; ctx.lineWidth = 1;
        const t2 = Date.now()/300;
        ctx.beginPath(); ctx.arc(px5, py5, 6, t2, t2+Math.PI); ctx.stroke();
        ctx.globalAlpha = 1;
      };
      if (pp < 1.5) { // entering portal
        drawPortal(creature._portalX + SPRITE_SIZE/2, groundY + SPRITE_SIZE/2, Math.min(1, pp));
        if (pp > 0.5) { const shrink = Math.max(0.1, 1-(pp-0.5)); ctx.globalAlpha = shrink; }
        drawBody(); drawEyes(); drawMouth('open'); drawFeet(0);
        ctx.globalAlpha = 1;
      } else if (pp < 2.5) { // traveling (invisible)
        drawPortal(creature._portalX + SPRITE_SIZE/2, groundY + SPRITE_SIZE/2, Math.max(0, 2-pp));
        drawPortal(creature._portalDestX + SPRITE_SIZE/2, groundY + SPRITE_SIZE/2, Math.min(1, pp-1.5));
      } else { // exiting portal
        drawPortal(creature._portalDestX + SPRITE_SIZE/2, groundY + SPRITE_SIZE/2, Math.max(0, 3.5-pp));
        const grow = Math.min(1, (pp-2.5));
        ctx.globalAlpha = grow;
        drawBody(); drawEyes(); drawMouth('bigGrin'); drawCheeks(); drawFeet(0);
        ctx.globalAlpha = 1;
      }
      break;
    }
    case 'giftbox': {
      // 🎁 Gift falls from sky
      drawBody(); drawEyes(); drawMouth(creature._giftOpened ? 'bigGrin' : 'open');
      drawCheeks(); drawFeet(0);
      const gfx = creature._giftX || creature.x;
      const gfy = creature._giftY || 0;
      if (!creature._giftOpened) {
        // Falling box
        ctx.fillStyle = '#e53935';
        ctx.fillRect(gfx, gfy, 16, 14);
        ctx.fillStyle = '#ffd54f';
        ctx.fillRect(gfx + 6, gfy, 4, 14); // ribbon V
        ctx.fillRect(gfx, gfy + 5, 16, 4);  // ribbon H
        // Bow
        ctx.fillStyle = '#ffeb3b';
        ctx.fillRect(gfx + 4, gfy - 3, 3, 4);
        ctx.fillRect(gfx + 9, gfy - 3, 3, 4);
      } else {
        // Opened — confetti!
        ctx.fillStyle = '#e53935'; ctx.fillRect(gfx, gfy + 6, 16, 8); // open box base
        const ct = Date.now();
        const confColors = ['#e53935','#ffd54f','#4caf50','#42a5f5','#e040fb'];
        for (let c = 0; c < 12; c++) {
          const ca = (ct/100 + c*0.8);
          const cr2 = 6 + ((ct - (creature._giftOpenTime||ct))/50 + c*2) % 30;
          ctx.fillStyle = confColors[c % confColors.length];
          ctx.globalAlpha = Math.max(0, 1 - cr2/35);
          ctx.fillRect(gfx+8 + Math.cos(ca)*cr2, gfy+4 + Math.sin(ca)*cr2 - cr2*0.5, 3, 3);
        }
        ctx.globalAlpha = 1;
      }
      break;
    }
    case 'tower': {
      // 🏗️ Building a block tower
      drawBody(); drawEyes(); drawMouth('happy'); drawFeet(0);
      const tb = creature._towerBlocks || [];
      const tBaseX = creature.x + (creature.facing === 1 ? SPRITE_SIZE + 4 : -20);
      const tColors = ['#e53935','#42a5f5','#4caf50','#ffd54f','#e040fb','#ff9800'];
      for (let i = 0; i < tb.length; i++) {
        const bk = tb[i];
        ctx.fillStyle = tColors[i % tColors.length];
        ctx.fillRect(tBaseX + (bk.wobble||0), groundY + SPRITE_SIZE - 2 - i*10, 16, 10);
        ctx.fillStyle = 'rgba(0,0,0,0.15)';
        ctx.fillRect(tBaseX + (bk.wobble||0), groundY + SPRITE_SIZE - 2 - i*10, 16, 2);
      }
      // Currently placing block
      if (creature._towerPhase === 1) {
        ctx.fillStyle = tColors[tb.length % tColors.length];
        ctx.globalAlpha = 0.5 + Math.sin(Date.now()/150)*0.3;
        ctx.fillRect(creature.x + SPRITE_SIZE/2 - 8, creature.y - 4, 16, 10);
        ctx.globalAlpha = 1;
      }
      break;
    }
    case 'mirror': {
      // 🪞 Found a mirror!
      drawBody();
      const mp = creature._mirrorPhase || 0;
      if (mp < 2) { drawEyes(); drawMouth('happy'); }
      else if (mp < 3.5) { drawWideEyes(); drawMouth('open'); } // shocked
      else { drawEyes(); drawMouth('bigGrin'); drawCheeks(); } // posing
      drawFeet(0);
      // Mirror
      const mirX = creature.x + (creature.facing === 1 ? SPRITE_SIZE + 10 : -26);
      ctx.fillStyle = '#b0bec5';
      ctx.fillRect(mirX, creature.y - 2, 3, SPRITE_SIZE + 4); // frame
      ctx.fillRect(mirX - 1, creature.y + SPRITE_SIZE, 5, 4); // stand
      ctx.fillStyle = 'rgba(200,220,240,0.3)';
      ctx.fillRect(mirX + 3, creature.y, 14, SPRITE_SIZE); // glass
      // Reflection (mirrored Bitsy)
      ctx.globalAlpha = 0.4;
      ctx.save();
      ctx.translate(mirX + 10, creature.y);
      ctx.scale(-0.5 * creature.facing, 0.5);
      ctx.translate(-creature.x, -creature.y);
      drawBody();
      ctx.restore();
      ctx.globalAlpha = 1;
      break;
    }
    case 'minigame': {
      // 🎮 Playing a tiny game
      drawBody(); drawEyes(false, false); drawMouth('happy'); drawFeet(0);
      // Tiny gameboy
      const gbx = creature.x + SPRITE_SIZE/2 - 7;
      const gby = creature.y + 28;
      ctx.fillStyle = '#455a64';
      ctx.fillRect(gbx, gby, 14, 18);
      ctx.fillStyle = '#7cb342';
      ctx.fillRect(gbx + 2, gby + 2, 10, 8); // screen
      // Tiny game on screen (bouncing dot)
      const gdot = Math.sin(Date.now()/200) * 3;
      ctx.fillStyle = '#1b5e20';
      ctx.fillRect(gbx + 6, gby + 5 + gdot, 2, 2);
      // Buttons
      ctx.fillStyle = '#e53935';
      ctx.fillRect(gbx + 3, gby + 13, 2, 2);
      ctx.fillStyle = '#1565c0';
      ctx.fillRect(gbx + 9, gby + 13, 2, 2);
      // Score
      if (creature._mgScore > 0) {
        ctx.fillStyle = '#ffd54f'; ctx.font = '7px monospace';
        ctx.fillText(creature._mgScore + '', gbx + 4, gby - 2);
      }
      break;
    }
    case 'campfire': {
      // 🏕️ Cozy campfire
      drawBody(); drawEyes(); drawMouth('happy'); drawCheeks(); drawFeet(0);
      const cfx = creature.x + (creature.facing === 1 ? SPRITE_SIZE + 6 : -24);
      const cfy = groundY + SPRITE_SIZE - 2;
      // Logs
      ctx.fillStyle = '#5d4037';
      ctx.fillRect(cfx - 2, cfy - 4, 18, 5);
      ctx.fillRect(cfx + 2, cfy - 8, 12, 5);
      // Fire
      const ft = Date.now();
      for (let fp = 0; fp < 8; fp++) {
        const fAge = ((ft/60 + fp*4) % 20);
        const fAlpha = Math.max(0, 1 - fAge/20);
        ctx.fillStyle = fAge < 8 ? '#ffeb3b' : fAge < 14 ? '#ff9800' : '#e53935';
        ctx.globalAlpha = fAlpha * 0.8;
        ctx.beginPath();
        ctx.arc(cfx + 7 + Math.sin(ft/200+fp)*3, cfy - 8 - fAge*1.2, 3 - fAge*0.1, 0, Math.PI*2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      // Marshmallow on stick
      if (creature._marshmallow > 0) {
        ctx.fillStyle = '#8d6e63';
        ctx.fillRect(creature.x + (creature.facing===1 ? SPRITE_SIZE-2 : 0), creature.y + 26, creature.facing*14, 2);
        const mColor = creature._marshmallow > 3 ? '#d7ccc8' : creature._marshmallow > 6 ? '#a1887f' : '#fff';
        ctx.fillStyle = mColor;
        ctx.fillRect(cfx + (creature.facing===1 ? -2 : 12), cfy - 14, 5, 5);
      }
      break;
    }
    case 'loveletter': {
      // 💌 Envelope drops from sky
      drawBody();
      if (creature._letterOpened) { drawEyes(); drawMouth('bigGrin'); drawCheeks(); }
      else { drawEyes(); drawMouth('open'); }
      drawFeet(0);
      const lx2 = creature.x + SPRITE_SIZE/2 - 8;
      const ly2 = creature._letterY || 0;
      if (!creature._letterOpened) {
        // Envelope
        ctx.fillStyle = '#fff8e1';
        ctx.fillRect(lx2, ly2, 16, 11);
        ctx.fillStyle = '#ffe082';
        ctx.beginPath();
        ctx.moveTo(lx2, ly2); ctx.lineTo(lx2+8, ly2+6); ctx.lineTo(lx2+16, ly2); ctx.fill();
        // Heart seal
        ctx.fillStyle = '#e91e63';
        ctx.beginPath(); ctx.arc(lx2+7, ly2+5, 2, 0, Math.PI*2); ctx.fill();
        ctx.beginPath(); ctx.arc(lx2+9, ly2+5, 2, 0, Math.PI*2); ctx.fill();
      } else {
        // Opened letter with message
        ctx.fillStyle = '#fff8e1';
        ctx.fillRect(lx2 - 4, ly2, 24, 18);
        ctx.fillStyle = '#5d4037'; ctx.font = '7px monospace'; ctx.textAlign = 'center';
        ctx.fillText('You are', lx2 + 8, ly2 + 7);
        ctx.fillText('awesome!💛', lx2 + 8, ly2 + 14);
        ctx.textAlign = 'left';
      }
      break;
    }
    case 'petspet': {
      // 🐾 Bitsy with a tiny pet
      drawBody(); drawEyes(); drawMouth('happy'); drawCheeks(); drawFeet(f%2);
      // Tiny pixel cat companion
      const ppx2 = creature._petX || creature.x + 30;
      const ppy = groundY + SPRITE_SIZE - 2;
      const ptail = Math.sin(Date.now()/300) * 4;
      // Body
      ctx.fillStyle = '#ff8a65';
      ctx.fillRect(ppx2, ppy - 8, 8, 6);
      // Head
      ctx.fillRect(ppx2 + (creature.facing===1?6:-2), ppy - 12, 6, 6);
      // Ears
      ctx.fillRect(ppx2 + (creature.facing===1?6:-2), ppy - 14, 2, 3);
      ctx.fillRect(ppx2 + (creature.facing===1?10:2), ppy - 14, 2, 3);
      // Eyes
      ctx.fillStyle = '#333';
      ctx.fillRect(ppx2 + (creature.facing===1?7:0), ppy - 11, 1, 1);
      ctx.fillRect(ppx2 + (creature.facing===1?10:3), ppy - 11, 1, 1);
      // Tail
      ctx.strokeStyle = '#ff8a65'; ctx.lineWidth = 1.5; ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(ppx2 + (creature.facing===1?0:8), ppy - 6);
      ctx.quadraticCurveTo(ppx2 + (creature.facing===1?-6:14), ppy - 10 + ptail, ppx2 + (creature.facing===1?-8:16), ppy - 14 + ptail);
      ctx.stroke();
      // Legs
      ctx.fillStyle = '#ff8a65';
      ctx.fillRect(ppx2 + 1, ppy - 2, 2, 2);
      ctx.fillRect(ppx2 + 5, ppy - 2, 2, 2);
      break;
    }
    case 'magicshow': {
      // 🎪 Magic trick!
      drawBody(); drawFeet(0);
      const mp2 = creature._magicPhase || 0;
      if (mp2 < 2) { drawEyes(); drawMouth('happy'); }
      else if (mp2 < 4) { drawWideEyes(); drawMouth('bigGrin'); }
      else { drawEyes(); drawMouth('happy'); drawCheeks(); }
      // Magic hat on ground
      const mhx = creature.x + (creature.facing===1 ? SPRITE_SIZE+6 : -22);
      ctx.fillStyle = '#1a1a2e';
      ctx.fillRect(mhx, groundY + SPRITE_SIZE - 14, 16, 14);
      ctx.fillRect(mhx - 3, groundY + SPRITE_SIZE - 2, 22, 3);
      ctx.fillStyle = '#7c4dff';
      ctx.fillRect(mhx, groundY + SPRITE_SIZE - 4, 16, 2);
      // Rabbit emerging (phase 2-4)
      if (mp2 >= 2) {
        const rabbitUp = Math.min(1, (mp2-2)/1.5) * 16;
        ctx.fillStyle = '#fff';
        ctx.fillRect(mhx + 4, groundY + SPRITE_SIZE - 14 - rabbitUp, 8, rabbitUp);
        // Ears
        if (rabbitUp > 8) {
          ctx.fillRect(mhx + 4, groundY + SPRITE_SIZE - 14 - rabbitUp - 6, 3, 7);
          ctx.fillRect(mhx + 9, groundY + SPRITE_SIZE - 14 - rabbitUp - 6, 3, 7);
          ctx.fillStyle = '#f8bbd0';
          ctx.fillRect(mhx + 5, groundY + SPRITE_SIZE - 14 - rabbitUp - 4, 1, 4);
          ctx.fillRect(mhx + 10, groundY + SPRITE_SIZE - 14 - rabbitUp - 4, 1, 4);
          // Eyes
          ctx.fillStyle = '#e91e63';
          ctx.fillRect(mhx + 5, groundY + SPRITE_SIZE - 14 - rabbitUp + 2, 2, 2);
          ctx.fillRect(mhx + 9, groundY + SPRITE_SIZE - 14 - rabbitUp + 2, 2, 2);
        }
      }
      // Sparkles
      if (mp2 >= 1.5) {
        ctx.fillStyle = '#ffd54f';
        for (let ms = 0; ms < 6; ms++) {
          const msa = Date.now()/200 + ms*1.05;
          const msr = 8 + Math.sin(msa)*4;
          ctx.globalAlpha = 0.4 + Math.sin(msa*2)*0.3;
          ctx.fillRect(mhx+8 + Math.cos(msa)*msr, groundY+SPRITE_SIZE-18 + Math.sin(msa)*msr, 2, 2);
        }
        ctx.globalAlpha = 1;
      }
      break;
    }
    case 'parkour': {
      // 🧗 Wall-to-wall parkour
      const pkp = creature._pkPhase || 0;
      const pkRot = Math.sin(pkp * 3) * 0.4;
      const pcx = creature.x + SPRITE_SIZE/2, pcy = creature.y + SPRITE_SIZE/2;
      ctx.translate(pcx, pcy); ctx.rotate(pkRot); ctx.translate(-pcx, -pcy);
      drawBody(); drawEyes(); drawMouth('bigGrin'); drawFeet(f%2);
      ctx.setTransform(1,0,0,1,0,0);
      // Motion lines
      ctx.strokeStyle = 'rgba(255,255,255,0.2)'; ctx.lineWidth = 1;
      for (let ml = 0; ml < 3; ml++) {
        const mly = creature.y + 10 + ml*12;
        ctx.beginPath();
        ctx.moveTo(creature.x + SPRITE_SIZE/2, mly);
        ctx.lineTo(creature.x + SPRITE_SIZE/2 - creature.facing*30, mly);
        ctx.stroke();
      }
      break;
    }
    default:
      drawBody();
      drawEyes();
      drawMouth('happy');
      drawFeet(0);
  }

  // Draw accessories INSIDE the transform (so they rotate/scale with creature)
  if (customization.hat !== 'none') drawHat();
  if (customization.accessory !== 'none') drawAccessory();
  if (customization.face !== 'default') drawFaceStyle();

  ctx.restore();

  // Blink timer
  creature.blinkTimer -= FRAME_MS;
  if (creature.blinkTimer <= 0) {
    if (creature.isBlinking) {
      creature.isBlinking = false;
      creature.blinkTimer = 2000 + Math.random() * 4000;
    } else {
      creature.isBlinking = true;
      creature.blinkTimer = 100 + Math.random() * 80;
    }
  }
}

// ─── PHYSICS ────────────────────────────────────────────────
function updatePhysics(dt) {
  if (creature.state === 'grabbed' || creature.state === 'sleep' || creature.state === 'drowsy' || creature.state === 'hang' || creature.state === 'spider' || creature.state === 'bungee') return;

  // Wall climbing — no gravity, move vertically
  if (creature.state === 'climb') {
    creature.x += creature.vx * dt;
    creature.y += creature.vy * dt;
    stats.distance += Math.abs(creature.vy * dt);
    // Clamp to wall
    if (creature.climbWall === 'left') creature.x = 0;
    else creature.x = screenW - SPRITE_SIZE;
    // Reached top or bottom? Stop climbing
    if (creature.y <= 10) { creature.y = 10; setState('jump'); creature.vy = 0; creature.vx = creature.climbWall === 'left' ? 120 : -120; creature.vy = -250; creature.onGround = false; }
    if (creature.y >= groundY) { creature.y = groundY; creature.onGround = true; setState('idle'); }
    return;
  }

  // Tumble — rolling on ground
  if (creature.state === 'tumble') {
    creature.x += creature.vx * dt;
    creature.vx *= 0.97;
    stats.distance += Math.abs(creature.vx * dt);
    // Stop when slow
    if (Math.abs(creature.vx) < 20) { setState('dizzy'); }
    // Bounce off walls
    if (creature.x <= 0) { creature.x = 0; creature.vx = Math.abs(creature.vx) * 0.6; }
    if (creature.x >= screenW - SPRITE_SIZE) { creature.x = screenW - SPRITE_SIZE; creature.vx = -Math.abs(creature.vx) * 0.6; }
    return;
  }

  // Apply gravity
  if (!creature.onGround) {
    creature.vy += GRAVITY * dt;
  }

  // Apply velocity
  creature.x += creature.vx * dt;
  creature.y += creature.vy * dt;

  // Track distance
  stats.distance += Math.abs(creature.vx * dt) + Math.abs(creature.vy * dt);

  // Air friction
  if (!creature.onGround) {
    creature.vx *= 0.998;
  }

  // 💨 Cursor wind — fast mouse movement pushes creature
  if (creature.state === 'idle' || creature.state === 'walk') {
    const cursorDx = mouseX - (creature._prevMouseX || mouseX);
    const cursorDy = mouseY - (creature._prevMouseY || mouseY);
    const cursorSpeed = Math.hypot(cursorDx, cursorDy);
    const dist2 = Math.hypot(mouseX - creature.x - SPRITE_SIZE/2, mouseY - creature.y - SPRITE_SIZE/2);
    if (cursorSpeed > 30 && dist2 < 100) {
      creature.vx += cursorDx * 0.3;
      if (creature.onGround && cursorSpeed > 50) {
        creature.vy = -cursorSpeed * 0.5;
        creature.onGround = false;
      }
    }
  }
  creature._prevMouseX = mouseX;
  creature._prevMouseY = mouseY;

  // Ground collision
  if (creature.y >= groundY) {
    creature.y = groundY;
    creature.onGround = true;

    if (Math.abs(creature.vy) > 25) {
      // Bounce! Keep more horizontal speed
      const impactVy = Math.abs(creature.vy);
      creature.vy = -creature.vy * Math.max(settings.bounciness, 0.7);
      creature.vx *= 0.93;
      stats.bounces++;
      playSound('bounce');
      creature._lastBounceTime = Date.now();
      creature._lastBounceX = creature.x + SPRITE_SIZE / 2;
      creature._lastBounceY = creature.y + SPRITE_SIZE;
      creature.spinSpeed *= -0.8;
      onCreatureLanded();
      // ── Impact squash + freeze frame ──
      const impactForce = Math.min(impactVy / 500, 1);
      if (impactForce > 0.15) {
        _squashForce = impactForce;
        _squashTimer = 80 + impactForce * 120; // 80-200ms
        _freezeFrames = Math.round(2 + impactForce * 2); // 2-4 frozen frames
      }
      // 💥 Screen crack on very hard impact!
      if (impactVy > 350) {
        triggerScreenCrack(creature.x + SPRITE_SIZE / 2, creature.y + SPRITE_SIZE);
      }
      if (Math.abs(creature.vy) < 25) {
        creature.vy = 0;
      }
    } else {
      creature.vy = 0;
    }
  } else {
    creature.onGround = false;
  }

  // Wall collisions (left/right) — bouncy! Keep most energy
  const wallBounce = Math.max(settings.bounciness, 0.75); // minimum 75% wall bounce
  if (creature.x <= 0) {
    creature.x = 0;
    creature.vx = Math.abs(creature.vx) * wallBounce; // ensure positive (bounce right)
    // Also bounce some vy into random direction for fun
    creature.vy *= 0.9;
    if (Math.abs(creature.vx) > 15) {
      stats.bounces++;
      playSound('bounce');
      creature._lastBounceTime = Date.now();
      creature._lastBounceX = 0;
      creature._lastBounceY = creature.y + SPRITE_SIZE / 2;
      creature.spinSpeed *= -0.8;
      if (Math.abs(creature.vx) > 400) triggerScreenCrack(0, creature.y + SPRITE_SIZE / 2);
    }
  }
  if (creature.x >= screenW - SPRITE_SIZE) {
    creature.x = screenW - SPRITE_SIZE;
    creature.vx = -Math.abs(creature.vx) * wallBounce;
    creature.vy *= 0.9;
    if (Math.abs(creature.vx) > 15) {
      stats.bounces++;
      playSound('bounce');
      creature._lastBounceTime = Date.now();
      creature._lastBounceX = screenW;
      creature._lastBounceY = creature.y + SPRITE_SIZE / 2;
      creature.spinSpeed *= -0.8;
      if (Math.abs(creature.vx) > 400) triggerScreenCrack(screenW, creature.y + SPRITE_SIZE / 2);
    }
  }

  // Ceiling collision
  if (creature.y <= 0) {
    creature.y = 0;
    creature.vy = Math.abs(creature.vy) * wallBounce;
    creature.vx *= 0.9;
    if (Math.abs(creature.vy) > 15) {
      stats.bounces++;
      creature._lastBounceTime = Date.now();
      creature._lastBounceX = creature.x + SPRITE_SIZE / 2;
      creature._lastBounceY = 0;
      creature.spinSpeed *= -0.8;
      playSound('bounce');
      if (Math.abs(creature.vy) > 400) triggerScreenCrack(creature.x + SPRITE_SIZE / 2, 0);
    }
  }

  // Stop tiny velocities
  if (creature.onGround && Math.abs(creature.vx) < 5) creature.vx = 0;
}

// ─── STATE MACHINE ──────────────────────────────────────────
const IMMORTAL_STATES = new Set(['sleep', 'grabbed', 'drowsy']); // allowed to run indefinitely
function updateState(dt) {
  creature.stateTimer += dt * 1000;
  creature.frameTimer += dt * 1000;

  // ⏱ Global safety timeout — no state stuck for >12s
  if (!IMMORTAL_STATES.has(creature.state) && creature.stateTimer > 12000) {
    console.warn('[DeadPixelPet] Safety timeout: forcing idle from', creature.state);
    creature.x = Math.max(0, Math.min(creature.x, screenW - SPRITE_SIZE));
    creature.y = groundY;
    creature.vx = 0; creature.vy = 0;
    creature.onGround = true;
    setState('idle');
    return;
  }

  // Frame animation (generic)
  if (creature.frameTimer > 200) {
    creature.frame = (creature.frame + 1) % 8;
    creature.frameTimer = 0;
  }

  switch (creature.state) {
    case 'idle':
      creature.vx *= 0.9; // slow down
      creature.sleepTimer += dt;

      // Occasionally look at cursor (curious)
      const dist = Math.hypot(mouseX - creature.x - SPRITE_SIZE/2, mouseY - creature.y - SPRITE_SIZE/2);
      if (dist < 120 && dist > 30 && Math.random() < 0.005) {
        setState('curious');
        break;
      }

      // Scared if cursor moves fast near creature
      if (dist < 80 && Math.random() < 0.002) {
        setState('scared');
        break;
      }

      // Random actions — hyper mood = faster actions!
      const idleWait = personality.mood === 'hyper' ? 200 + Math.random() * 500 : 500 + Math.random() * 1000;
      if (creature.stateTimer > idleWait) {
        const roll = Math.random();
        if (creature.onGround) {
          // ── WEIGHTED RANDOM ACTION PICKER ──────────────────────
          // Array-based: easy to add/remove, auto-normalized weights
          const actions = [
            { w: personality.mood === 'hyper' ? 2 : personality.mood === 'bored' ? 8 : 5, fn: () => setState('walk') },
            { w: 4, fn: () => { setState('jump'); creature.vy = -(150 + Math.random()*350); creature.vx = (Math.random()-0.5)*200; creature.onGround = false; }},
            { w: 3, fn: () => { const nl = creature.x < screenW/2; creature.climbWall = nl?'left':'right'; creature.facing = nl?-1:1; setState('climb'); creature.vy = -(60+Math.random()*100); creature.vx = 0; }},
            { w: 2, fn: () => { setState('tumble'); creature.facing = Math.random()<0.5?1:-1; creature.vx = creature.facing*(200+Math.random()*300); creature.tumbleAngle = 0; }},
            { w: 2, fn: () => { setState('sprint'); creature.facing = Math.random()<0.5?1:-1; }},
            { w: 2, fn: () => setState('laughing') },
            { w: 1, fn: () => setState('crying') },
            { w: 1, fn: () => setState('angry') },
            { w: 2, fn: () => { creature._anchorX = creature.x+SPRITE_SIZE/2; creature._ropeLen = 60+Math.random()*120; setState('spider'); }},
            { w: 2, fn: () => { setState('jetpack'); creature.vy = -200; creature.onGround = false; }},
            { w: 2, fn: () => { setState('balloon'); creature._balloonPop = false; }},
            { w: 2, fn: () => { setState('skateboard'); creature.facing = Math.random()<0.5?1:-1; }},
            { w: 2, fn: () => { setState('superhero'); creature.vy = -180; creature.onGround = false; }},
            { w: 2, fn: () => setState('disco') },
            { w: 1, fn: () => setState('sneeze') },
            { w: 2, fn: () => setState('music') },
            { w: 1, fn: () => { setState('rainbow'); creature._trail = []; }},
            { w: 1, fn: () => setState('eating') },
            { w: 2, fn: () => { setState('machinegun'); creature.facing = Math.random()<0.5?1:-1; creature._mgBullets = []; creature._mgFlash = 0; }},
            { w: 2, fn: () => { setState('bombing'); creature._bombs = []; }},
            { w: 2, fn: () => { setState('darts'); creature.facing = Math.random()<0.5?1:-1; creature._darts = []; creature._dartScore = 0; }},
            { w: 2, fn: () => { setState('bedtime'); creature._zzz = []; }},
            { w: 2, fn: () => { setState('fishing'); creature._fishBob = 0; creature._fishCaught = false; }},
            { w: 2, fn: () => { setState('bughunt'); creature._bugs = []; creature._bugTarget = null; }},
            { w: 2, fn: () => { setState('garden'); creature._gardenX = creature.x; creature._gardenStage = 0; creature._gardenTimer = 0; }},
            { w: 1, fn: () => { setState('cursorride'); creature._ridingCursor = true; }},
            { w: 2, fn: () => { setState('portal'); creature._portalPhase = 0; creature._portalX = creature.x; creature._portalY = creature.y; creature._portalDestX = Math.random()*(screenW-SPRITE_SIZE); }},
            { w: 2, fn: () => { setState('giftbox'); creature._giftX = creature.x + (Math.random()-0.5)*100; creature._giftY = -20; creature._giftOpened = false; }},
            { w: 2, fn: () => { setState('tower'); creature._towerBlocks = []; creature._towerPhase = 0; }},
            { w: 2, fn: () => { setState('mirror'); creature._mirrorPhase = 0; }},
            { w: 2, fn: () => { setState('minigame'); creature._mgPhase = 0; creature._mgScore = 0; }},
            { w: 2, fn: () => { setState('campfire'); creature._fireParticles = []; creature._marshmallow = 0; }},
            { w: 2, fn: () => { setState('loveletter'); creature._letterY = -20; creature._letterOpened = false; }},
            { w: 2, fn: () => { setState('petspet'); creature._petX = creature.x + 30; creature._petY = groundY; creature._petState = 'follow'; }},
            { w: 2, fn: () => { setState('magicshow'); creature._magicPhase = 0; }},
            { w: 2, fn: () => { setState('parkour'); creature._pkPhase = 0; creature._pkSide = 'left'; creature.x = 0; creature.vy = -350; creature.onGround = false; }},
            { w: 1, fn: () => { setState('clone'); creature._cloneOffset = {dx:20+Math.random()*20,dy:0}; }},
            { w: 1, fn: () => { setState('trampoline'); creature._trampX = creature.x-10; creature._trampBounce = 0; }},
            { w: 1, fn: () => { setState('ninja'); creature._ninjaWall = creature.x<screenW/2?'left':'right'; }},
            { w: 1, fn: () => setState('selfie') },
            { w: 1, fn: () => { setState('bungee'); creature._bungeeAnchorX = creature.x+SPRITE_SIZE/2; creature._bungeePhase = 0; creature.onGround = false; creature.vy = 300; }},
            { w: 1, fn: () => { setState('graffiti'); creature._graffitiMarks = []; }},
          ];
          const totalW = actions.reduce((s, a) => s + a.w, 0);
          let pick = Math.random() * totalW;
          for (const a of actions) { pick -= a.w; if (pick <= 0) { a.fn(); break; } }
        } else {
          creature.stateTimer = 0;
        }
      }

      // Drowsy after 30-50s idle, then sleep
      if (creature.sleepTimer > 30 + Math.random() * 20) {
        creature.drowsyTimer = 0;
        setState('drowsy');
      }
      break;

    case 'walk': {
      const spd = settings.speed;
      creature.vx = creature.facing * spd;

      // Turn at edges
      if (creature.x <= 5) { creature.facing = 1; }
      if (creature.x >= screenW - SPRITE_SIZE - 5) { creature.facing = -1; }

      // Random direction change
      if (Math.random() < 0.005) creature.facing *= -1;

      // Stop after a while — shorter walks, more variety
      if (creature.stateTimer > 800 + Math.random() * 2000) {
        setState('idle');
      }
      break;
    }
    case 'drowsy':
      creature.vx *= 0.85;
      creature.sleepTimer += dt;
      creature.drowsyTimer += dt;
      // Wake up if cursor very close or grabbed
      if (Math.hypot(mouseX - creature.x - SPRITE_SIZE/2, mouseY - creature.y - SPRITE_SIZE/2) < 60) {
        creature.drowsyTimer = 0;
        setState('idle');
        break;
      }
      // Fall asleep after 10-15s drowsy
      if (creature.drowsyTimer > 10 + Math.random() * 5) {
        creature.drowsyTimer = 0;
        setState('sleep');
        playSound('yawn');
      }
      break;

    case 'sleep':
      creature.vx = 0;
      creature.sleepTimer += dt;
      creature._autoWakeTimer += dt;

      // Cursor proximity wake: 50px = immediate, 100px = drowsy, 200px = twitch
      const sleepDist = Math.hypot(mouseX - creature.x - SPRITE_SIZE/2, mouseY - creature.y - SPRITE_SIZE/2);
      if (sleepDist < 50) {
        // Cursor very close — instant wake
        setState('idle');
        playSound('yawn');
        personality.energy = Math.min(100, personality.energy + 50);
        break;
      } else if (sleepDist < 120) {
        // Cursor nearby — drift to drowsy
        setState('drowsy');
        creature.drowsyTimer = 8; // already partially woken
        break;
      }

      // ── Dream interrupts (roll every 15-30s) ──
      creature._dreamRollTimer -= dt;
      if (creature._dreamRollTimer <= 0) {
        creature._dreamRollTimer = 15 + Math.random() * 15;
        const roll = Math.random();
        if (roll < 0.08) {
          // Dream twitch — shift 1-2px for a moment
          creature.x += (Math.random() - 0.5) * 3;
          creature._dreamTwitchTimer = 0.2;
        } else if (roll < 0.13) {
          // Nightmare — eyes snap open briefly (flag for draw code)
          creature._nightmareTimer = 0.4;
        } else if (roll < 0.17) {
          // Sleep mumble — "..." speech bubble
          creature._mumbleTimer = 1.5;
        } else if (roll < 0.20) {
          // Spontaneous wake
          setState('idle');
          playSound('yawn');
          break;
        }
        // 80%: continue sleeping, no change
      }
      // Tick dream timers
      if (creature._dreamTwitchTimer > 0) creature._dreamTwitchTimer -= dt;
      if (creature._nightmareTimer  > 0) creature._nightmareTimer  -= dt;
      if (creature._mumbleTimer     > 0) creature._mumbleTimer     -= dt;

      // Probabilistic auto-wake every 30s check
      if (creature._autoWakeTimer > 30) {
        creature._autoWakeTimer = 0;
        const sleepMins = creature.sleepTimer / 60;
        const wakeChance = 0.10 + Math.min(sleepMins / 20, 0.15);
        if (Math.random() < wakeChance) {
          setState('idle');
          playSound('yawn');
          break;
        }
      }
      break;

    case 'grabbed':
      // Dragged by mouse — position set in mouse handler
      break;

    case 'flung':
      // 🪂 Random chance to deploy parachute when falling from high
      if (creature.vy > 200 && creature.y < groundY * 0.4 && Math.random() < 0.003) {
        setState('parachute');
        break;
      }
      // Managed by physics; transition when stopped
      if (creature.onGround && Math.abs(creature.vx) < 15 && Math.abs(creature.vy) < 15) {
        // If still spinning, do a ground tumble first
        if (Math.abs(creature.spinSpeed) > 1) {
          setState('tumble');
          creature.tumbleAngle = creature.spinAngle;
          creature.vx = creature.spinSpeed * 15; // convert spin to ground roll
        } else {
          creature.spinAngle = 0;
          creature.spinSpeed = 0;
          setState('dizzy');
        }
      }
      break;

    case 'dizzy':
      creature.dizzyTimer += dt;
      creature.vx *= 0.92;
      // Stay dizzy for 3-5 seconds, then recover on own
      if (creature.dizzyTimer > 3 + Math.random() * 2) {
        creature.dizzyTimer = 0;
        setState('happy');
      }
      break;

    case 'scared':
      // Run away from cursor
      const awayDir = Math.sign(creature.x + SPRITE_SIZE/2 - mouseX) || 1;
      creature.facing = awayDir;
      creature.vx = awayDir * settings.speed * 1.8;
      if (creature.stateTimer > 800 + Math.random() * 600) {
        setState('idle');
      }
      break;

    case 'happy':
      if (creature.stateTimer > 1500) {
        setState('idle');
      }
      break;

    case 'curious':
      creature.facing = mouseX > creature.x + SPRITE_SIZE/2 ? 1 : -1;
      if (creature.stateTimer < 600) {
        // Phase 1 (0-600ms): freeze and tilt — don't move
        creature.vx *= 0.85;
      } else {
        // Phase 2 (600ms+): slowly creep toward cursor
        creature.vx *= 0.92;
        if (Math.random() < 0.04) {
          creature.vx = creature.facing * settings.speed * 0.35;
        }
      }
      if (creature.stateTimer > 2500 + Math.random() * 1500) {
        setState('idle');
      }
      // Get scared if cursor gets very close
      if (Math.hypot(mouseX - creature.x - SPRITE_SIZE/2, mouseY - creature.y - SPRITE_SIZE/2) < 40) {
        setState('scared');
        playSound('scared');
      }
      break;

    case 'peek':
      if (creature.stateTimer > 2000) setState('idle');
      break;

    case 'jump':
      // In-air — physics handles gravity + landing
      // Transition back to idle when landed
      if (creature.onGround && creature.stateTimer > 300) {
        // Random chance to tumble on landing
        if (Math.abs(creature.vx) > 80 && Math.random() < 0.4) {
          setState('tumble');
          creature.tumbleAngle = 0;
        } else {
          setState('happy');
        }
      }
      break;

    case 'climb': {
      // ── Slip recovery: freeze movement, drop 2-3px, panic re-grab ──
      if (creature.climbSlipTimer > 0) {
        creature.climbSlipTimer -= dt * 1000;    // climbSlipTimer is in ms
        creature.y += 150 * dt;                  // 150 px/s slip fall (was 2.5 * 60 — same value, clearer intent)
        break; // skip normal frame advance while slipping
      }

      // ── Inchworm frame advance — variable timing per frame ──
      const CLIMB_FRAME_DUR = [125, 100, 100, 150];
      creature.climbFrameTimer += dt * 1000;
      if (creature.climbFrameTimer >= CLIMB_FRAME_DUR[creature.climbFrame]) {
        creature.climbFrameTimer = 0;
        const prevFrame = creature.climbFrame;
        creature.climbFrame = (creature.climbFrame + 1) % 4;
        // Count full cycle completions
        if (prevFrame === 3) {
          creature.climbCycles++;

          // 5% slip chance per cycle
          if (Math.random() < 0.05) {
            creature.climbSlipTimer = 200; // 200ms panic
            playSound('scared');
          }

          // Scared look-down: every 3-5 cycles, check timer
          if (creature.climbLookDownTimer <= 0 && creature.climbCycles >= 3) {
            if (Math.random() < 0.4) {
              creature.climbLookDownTimer = 500; // 0.5s scared look
              creature._climbLookingDown = true;
            }
            creature.climbCycles = 0; // reset
            creature.climbLookDownTimer = (3 + Math.random() * 2) * 600; // ~2-3s until next check
          }
        }
      }

      // Tick the look-down timer
      if (creature.climbLookDownTimer > 0) {
        creature.climbLookDownTimer -= dt * 1000;
        if (creature.climbLookDownTimer <= 0) creature._climbLookingDown = false;
      }

      // Climbing handled in physics; stateTimer controls max climb duration
      if (creature.y <= 10) {
        creature.y = 0; creature.vy = 0; creature.vx = 0;
        creature.climbWall = null; creature.climbFrame = 0; creature.climbCycles = 0;
        setState('hang');
      } else if (creature.stateTimer > 3000 + Math.random() * 2000) {
        creature.vx = creature.climbWall === 'left' ? 200 : -200;
        creature.vy = -200 - Math.random() * 150;
        creature.onGround = false;
        creature.climbWall = null; creature.climbFrame = 0; creature.climbCycles = 0;
        setState('jump');
      }
      break;
    }

    case 'hang':
      // Hanging upside-down from top — stay for a bit, then drop
      creature.y = 0;
      creature.vx = 0; creature.vy = 0;
      if (creature.stateTimer > 2500 + Math.random() * 3000) {
        // Let go and fall!
        creature.onGround = false;
        creature.vy = 50;
        setState('flung');
      }
      break;

    case 'tumble':
      // Rolling on ground — handled by physics
      creature.tumbleAngle += creature.vx * dt * 0.02;
      // Exit when nearly stopped
      if (creature.onGround && Math.abs(creature.vx) < 20) {
        setState('dizzy');
      }
      break;

    case 'crying':
      creature.vx *= 0.95;
      if (creature.stateTimer > 3000 + Math.random() * 2000) {
        setState('idle');
      }
      break;

    case 'angry':
      // Stomp around angrily
      creature.vx = creature.facing * settings.speed * 0.6 * Math.sign(Math.sin(Date.now() / 200));
      if (creature.stateTimer > 2500 + Math.random() * 1500) {
        setState('idle');
      }
      break;

    case 'laughing':
      creature.vx *= 0.9;
      if (creature.stateTimer > 3000 + Math.random() * 2000) {
        setState('happy');
      }
      break;

    case 'spider':
      // Swinging on web — no physics, position managed by draw code
      if (creature.stateTimer > 4000 + Math.random() * 3000) {
        // Cut the web! Fall down
        creature.onGround = false;
        creature.vy = 50;
        creature._ropeLen = null;
        creature._anchorX = null;
        setState('flung');
      }
      break;

    case 'jetpack':
      // Flying around with jetpack!
      creature.onGround = false;
      // Smooth random flying — sinusoidal path
      const jpTime = creature.stateTimer / 1000;
      creature.vx = Math.sin(jpTime * 1.2) * 150 + Math.cos(jpTime * 0.7) * 80;
      creature.vy = Math.cos(jpTime * 0.9) * 120 - 60; // slight upward bias
      // Keep in bounds
      if (creature.y < 30) creature.vy = Math.abs(creature.vy);
      if (creature.y > groundY - 50) creature.vy = -Math.abs(creature.vy);
      if (creature.x < 30) creature.vx = Math.abs(creature.vx);
      if (creature.x > screenW - SPRITE_SIZE - 30) creature.vx = -Math.abs(creature.vx);
      // Face direction of travel
      if (creature.vx > 20) creature.facing = 1;
      else if (creature.vx < -20) creature.facing = -1;
      // Land after a while
      if (creature.stateTimer > 5000 + Math.random() * 4000) {
        creature.vy = 100;
        creature.vx *= 0.3;
        setState('flung');
      }
      break;

    case 'parachute':
      creature.vy = 80 + Math.sin(creature.stateTimer / 500) * 15; // descent (faster — was 35, too slow)
      creature.vx = Math.sin(creature.stateTimer / 700) * 30; // sway
      creature.onGround = false;
      creature.spinAngle = 0; creature.spinSpeed = 0;
      if (creature.y >= groundY - 5) { creature.y = groundY; creature.onGround = true; setState('happy'); }
      // Safety: max 8s in parachute (avoids very-high-altitude very-slow descents)
      if (creature.stateTimer > 8000) { creature.y = groundY; creature.onGround = true; setState('happy'); }
      break;

    case 'balloon':
      creature.vy = -30 - Math.sin(creature.stateTimer/500) * 15; // float up
      creature.vx = Math.sin(creature.stateTimer/700) * 20; // sway
      creature.onGround = false;
      if (creature.y < 20) creature.vy = Math.abs(creature.vy) * 0.3;
      if (creature.stateTimer > 4000 + Math.random()*2000) {
        // POP! Fall down
        playSound('bounce');
        creature.vy = 50;
        setState('flung');
        creature.spinAngle = 0; creature.spinSpeed = 5;
      }
      break;

    case 'skateboard':
      creature.vx = creature.facing * (settings.speed * 1.8);
      creature.y = groundY; creature.onGround = true;
      if (creature.x <= 5 || creature.x >= screenW - SPRITE_SIZE - 5) {
        // Hit edge — kickflip!
        creature.facing *= -1;
        creature.vy = -180; creature.onGround = false;
        creature.spinAngle = 0; creature.spinSpeed = 8 * creature.facing;
      }
      if (creature.stateTimer > 3000 + Math.random()*2000) setState('happy');
      break;

    case 'superhero':
      creature.onGround = false;
      creature.vx = creature.facing * 200;
      creature.vy = -80 + Math.sin(creature.stateTimer/300) * 40;
      if (creature.y < 20) creature.vy = 30;
      if (creature.y > groundY - 30) creature.vy = -60;
      if (creature.x <= 5) { creature.facing = 1; }
      if (creature.x >= screenW - SPRITE_SIZE - 5) { creature.facing = -1; }
      if (creature.stateTimer > 4000 + Math.random()*3000) {
        creature.vy = 80; setState('flung'); creature.spinSpeed = 0;
      }
      break;

    case 'disco':
      creature.vx *= 0.9;
      if (creature.stateTimer > 4000 + Math.random()*2000) setState('happy');
      break;

    case 'sneeze':
      if (creature.stateTimer > 800 && creature.stateTimer < 850) {
        // ACHOO! Blast backward
        creature.vx = -creature.facing * 300;
        creature.vy = -100;
        creature.onGround = false;
        playSound('fling');
      }
      creature.vx *= 0.97;
      if (creature.stateTimer > 1800) setState('dizzy');
      break;

    case 'music':
      creature.vx *= 0.95;
      // Play random notes
      if (Math.random() < 0.02) playSound('idle');
      if (creature.stateTimer > 4000 + Math.random()*2000) setState('happy');
      break;

    case 'rainbow':
      creature.vx = creature.facing * settings.speed * 2;
      if (creature.x <= 5) creature.facing = 1;
      if (creature.x >= screenW - SPRITE_SIZE - 5) creature.facing = -1;
      // Record trail positions
      if (!creature._trail) creature._trail = [];
      creature._trail.push({x: creature.x, y: creature.y});
      if (creature._trail.length > 20) creature._trail.shift();
      if (creature.stateTimer > 3000 + Math.random()*2000) { creature._trail = null; setState('happy'); }
      break;

    case 'eating':
      creature.vx *= 0.9;
      if (creature.stateTimer > 3000) setState('happy'); // satisfied!
      break;

    case 'clone':
      creature.vx = creature.facing * settings.speed * 0.5;
      if (creature.x <= 5) creature.facing = 1;
      if (creature.x >= screenW - SPRITE_SIZE - 5) creature.facing = -1;
      if (creature.stateTimer > 3000) { creature._cloneOffset = null; setState('idle'); }
      break;

    case 'trampoline':
      // Stay above trampoline, bounce higher each time
      if (!creature._trampBounce) creature._trampBounce = 0;
      if (creature.onGround) {
        creature._trampBounce++;
        creature.vy = -(120 + creature._trampBounce * 50);
        creature.onGround = false;
        playSound('bounce');
        if (creature._trampBounce >= 4) {
          // Final mega bounce + flip!
          creature.spinAngle = 0; creature.spinSpeed = 12;
          setState('flung');
        }
      }
      // Keep near trampoline x
      creature.vx *= 0.9;
      break;

    case 'ninja':
      creature.onGround = false;
      if (!creature._ninjaPhase) creature._ninjaPhase = 0;
      creature._ninjaPhase += dt;
      // Zigzag between walls
      const nTarget = creature._ninjaWall === 'left' ? 10 : screenW - SPRITE_SIZE - 10;
      creature.vx = (nTarget - creature.x) * 3;
      creature.vy = -120;
      creature.facing = creature._ninjaWall === 'left' ? -1 : 1;
      // Switch wall when reached
      if ((creature._ninjaWall === 'left' && creature.x < 20) ||
          (creature._ninjaWall === 'right' && creature.x > screenW - SPRITE_SIZE - 20)) {
        creature._ninjaWall = creature._ninjaWall === 'left' ? 'right' : 'left';
        creature._ninjaPhase = 0;
        playSound('bounce');
      }
      if (creature.y < 20) { setState('flung'); creature.spinSpeed = 6; creature.vy = 50; }
      if (creature.stateTimer > 3000) { setState('flung'); creature.spinSpeed = 4; creature.vy = 30; }
      break;

    case 'selfie':
      creature.vx *= 0.9;
      if (creature.stateTimer > 3000) setState('happy');
      break;

    case 'bungee':
      creature.onGround = false;
      // Damped spring physics from anchor
      const bAnchorY = 0;
      const bRestLen = 100;
      const bCurrLen = creature.y;
      const bSpring = (bCurrLen - bRestLen) * -1.5; // spring force
      const bDamp = creature.vy * -0.03;
      creature.vy += (bSpring + bDamp + GRAVITY * 0.3) * dt;
      creature.vx = Math.sin(creature.stateTimer / 500) * 30;
      if (creature.y < 10) { creature.y = 10; creature.vy = Math.abs(creature.vy); }
      if (creature.y > groundY) { creature.y = groundY; creature.vy = -Math.abs(creature.vy) * 0.5; }
      if (creature.stateTimer > 5000 + Math.random()*2000) {
        creature.vy = 0; setState('idle'); creature.onGround = true; creature.y = groundY;
      }
      break;

    case 'hiccup':
      creature.vx *= 0.95;
      if (!creature._hicTimer) creature._hicTimer = 0;
      creature._hicTimer += dt;
      creature._hicJump = Math.max(0, (creature._hicJump || 0) - dt * 30);
      if (creature._hicTimer > 0.6 + Math.random() * 0.4) {
        creature._hicTimer = 0;
        creature._hicJump = 5 + Math.random() * 8;
        playSound('grab'); // tiny sound
      }
      if (creature.stateTimer > 4000 + Math.random()*2000) { creature._hicJump = 0; setState('idle'); }
      break;

    case 'graffiti':
      creature.vx = creature.facing * settings.speed * 0.6;
      if (creature.x <= 5) creature.facing = 1;
      if (creature.x >= screenW - SPRITE_SIZE - 5) creature.facing = -1;
      // Leave marks
      if (!creature._graffitiMarks) creature._graffitiMarks = [];
      if (Math.random() < 0.05) {
        const shapes = ['♥', '★', '✿', '♦', '●'];
        creature._graffitiMarks.push({
          x: creature.x + SPRITE_SIZE/2, y: groundY + SPRITE_SIZE - 2,
          shape: shapes[Math.floor(Math.random()*shapes.length)],
          color: ['#ff5252','#ffd54f','#69f0ae','#42a5f5','#e040fb'][Math.floor(Math.random()*5)],
          born: Date.now()
        });
      }
      if (creature.stateTimer > 4000 + Math.random()*2000) { setState('happy'); }
      break;

    case 'sprint':
      // Running FAST in one direction — will crash into wall
      creature.vx = creature.facing * settings.speed * 3.5;
      // Hit wall? CRASH! → dizzy
      if (creature.x <= 2 && creature.facing === -1) {
        creature.x = 2;
        creature.vx = 30; // slight bounce back
        playSound('bounce');
        triggerScreenCrack(0, creature.y + SPRITE_SIZE / 2);
        setState('dizzy');
      }
      if (creature.x >= screenW - SPRITE_SIZE - 2 && creature.facing === 1) {
        creature.x = screenW - SPRITE_SIZE - 2;
        creature.vx = -30;
        playSound('bounce');
        triggerScreenCrack(screenW, creature.y + SPRITE_SIZE / 2);
        setState('dizzy');
      }
      // Safety: timeout if somehow doesn't hit wall
      if (creature.stateTimer > 3000) setState('idle');
      break;

    case 'machinegun': {
      creature.vx *= 0.95;
      if (!creature._mgBullets) creature._mgBullets = [];
      // Fire bullets every 80ms
      const mgInterval = Math.floor(creature.stateTimer / 80);
      const lastInterval = Math.floor((creature.stateTimer - FRAME_MS) / 80);
      if (mgInterval > lastInterval) {
        creature._mgFlash = 1;
        const bx = creature.facing === 1 ? creature.x + SPRITE_SIZE + 16 : creature.x - 18;
        creature._mgBullets.push({
          x: bx, y: creature.y + 22 + (Math.random() - 0.5) * 4,
          vx: creature.facing * (600 + Math.random() * 200),
          shell: true, sx: creature.x + SPRITE_SIZE/2, sy: creature.y + 26,
          svx: -creature.facing * (30 + Math.random() * 40), svy: -(60 + Math.random() * 40)
        });
        playSound('grab'); // tiny click
      }
      // Update bullets
      creature._mgFlash = Math.max(0, (creature._mgFlash || 0) - dt * 8);
      for (const b of creature._mgBullets) {
        b.x += b.vx * dt;
        if (b.shell) { b.sx += b.svx * dt; b.sy += b.svy * dt; b.svy += 200 * dt; }
      }
      creature._mgBullets = creature._mgBullets.filter(b => b.x > -20 && b.x < screenW + 20);
      // Recoil push
      creature.vx -= creature.facing * 3;
      if (creature.stateTimer > 3000 + Math.random() * 1500) setState('happy');
      break;
    }

    case 'bombing': {
      creature.vx *= 0.9;
      if (!creature._bombs) creature._bombs = [];
      // Throw a bomb every 2s
      const bombInt = Math.floor(creature.stateTimer / 2000);
      const bombLast = Math.floor((creature.stateTimer - FRAME_MS) / 2000);
      if (bombInt > bombLast && bombInt <= 3) {
        creature._bombs.push({
          x: creature.x + SPRITE_SIZE / 2,
          y: creature.y + 10,
          vx: creature.facing * (80 + Math.random() * 120),
          vy: -(150 + Math.random() * 100),
          exploded: false, explodeTime: 0
        });
      }
      // Update bombs
      for (const b of creature._bombs) {
        if (!b.exploded) {
          b.x += b.vx * dt;
          b.y += b.vy * dt;
          b.vy += 300 * dt; // gravity
          if (b.y >= groundY + 10) {
            b.exploded = true; b.explodeTime = Date.now();
            b.y = groundY + 10;
            playSound('bounce');
          }
        }
      }
      const nowBomb = Date.now();
      creature._bombs = creature._bombs.filter(b => !b.exploded || nowBomb - b.explodeTime < 500);
      if (creature.stateTimer > 7000) setState('happy');
      break;
    }

    case 'darts': {
      creature.vx *= 0.9;
      if (!creature._darts) creature._darts = [];
      // Throw dart every 2.5s
      const dartBoard = creature.facing === 1 ? creature.x + 60 : creature.x - 30;
      const dartBoardY = creature.y - 5;
      const dartInt = Math.floor(creature.stateTimer / 2500);
      const dartLast = Math.floor((creature.stateTimer - FRAME_MS) / 2500);
      if (dartInt > dartLast && dartInt <= 3) {
        // Random position on/near dartboard
        const angle = Math.random() * Math.PI * 2;
        const dist2 = Math.random() * 12;
        creature._darts.push({
          x: dartBoard + Math.cos(angle) * dist2,
          y: dartBoardY + Math.sin(angle) * dist2
        });
        // Score based on distance from center
        if (dist2 < 2) creature._dartScore += 50;
        else if (dist2 < 5) creature._dartScore += 25;
        else if (dist2 < 9) creature._dartScore += 10;
        else creature._dartScore += 5;
        playSound('bounce');
      }
      if (creature.stateTimer > 8000) setState('happy');
      break;
    }

    case 'bedtime': {
      creature.vx = 0; creature.vy = 0;
      creature.y = groundY;
      if (!creature._zzz) creature._zzz = [];
      // Spawn new Z every 0.8s
      const zInt = Math.floor(creature.stateTimer / 800);
      const zLast = Math.floor((creature.stateTimer - FRAME_MS) / 800);
      if (zInt > zLast) {
        creature._zzz.push({
          startX: creature.x + 10 + Math.random() * 15,
          startY: creature.y - 2,
          born: Date.now()
        });
      }
      // Remove old Zzz
      const nowZzz = Date.now();
      creature._zzz = creature._zzz.filter(z => nowZzz - z.born < 2500);
      // Wake up after 5-8s
      if (creature.stateTimer > 5000 + Math.random() * 3000) {
        creature._zzz = [];
        setState('happy');
        playSound('yawn');
      }
      break;
    }

    case 'fishing': {
      creature.vx *= 0.9;
      creature.y = groundY;
      // Bobber animation
      creature._fishBob = Math.sin(creature.stateTimer * 2) * 3;
      // Random catch after 3-6s
      if (!creature._fishCaught && creature.stateTimer > 3000 + Math.random() * 3000) {
        creature._fishCaught = true;
        creature._fishBob = -8; // yank up
        playSound('grab');
      }
      // End after catch celebration
      if (creature._fishCaught && creature.stateTimer > 7000) {
        creature._fishCaught = false;
        setState('happy');
      }
      // Safety timeout
      if (creature.stateTimer > 9000) setState('idle');
      break;
    }

    case 'bughunt': {
      if (!creature._bugs) creature._bugs = [];
      // Spawn bugs at start
      if (creature._bugs.length === 0 && creature.stateTimer < 200) {
        const bugColors = ['#4caf50','#f44336','#ff9800','#2196f3','#9c27b0'];
        for (let i = 0; i < 3; i++) {
          creature._bugs.push({
            x: creature.x + (Math.random()-0.5)*200,
            y: groundY + SPRITE_SIZE - 4,
            vx: (Math.random()-0.5)*60,
            angle: Math.random()*Math.PI*2,
            color: bugColors[Math.floor(Math.random()*bugColors.length)],
            eaten: false
          });
        }
      }
      // Bug movement
      for (const bug of creature._bugs) {
        if (bug.eaten) continue;
        bug.x += bug.vx * dt;
        bug.angle += (Math.random()-0.5)*2*dt;
        bug.vx += (Math.random()-0.5)*100*dt;
        bug.vx = Math.max(-40, Math.min(40, bug.vx));
        if (bug.x < 10) { bug.x = 10; bug.vx = Math.abs(bug.vx); }
        if (bug.x > screenW-10) { bug.x = screenW-10; bug.vx = -Math.abs(bug.vx); }
      }
      // Chase nearest alive bug
      const aliveBugs = creature._bugs.filter(b => !b.eaten);
      if (aliveBugs.length > 0) {
        let nearest = aliveBugs[0];
        for (const b of aliveBugs) {
          if (Math.abs(b.x - creature.x) < Math.abs(nearest.x - creature.x)) nearest = b;
        }
        creature._bugTarget = nearest;
        creature.facing = nearest.x > creature.x + SPRITE_SIZE/2 ? 1 : -1;
        creature.vx += creature.facing * 300 * dt;
        creature.vx *= 0.92;
        // Catch!
        if (Math.abs(nearest.x - creature.x - SPRITE_SIZE/2) < 15) {
          nearest.eaten = true;
          showThought('Yummy! 🐛');
          playSound('grab');
        }
      } else {
        creature._bugTarget = null;
        if (creature.stateTimer > 2000) setState('happy');
      }
      if (creature.stateTimer > 10000) setState('idle');
      break;
    }

    case 'garden': {
      creature.vx *= 0.9;
      creature._gardenTimer = (creature._gardenTimer || 0) + dt * 1000;
      if (creature._gardenStage === 0 && creature._gardenTimer > 1500) {
        creature._gardenStage = 1; creature._gardenTimer = 0; // soil
      } else if (creature._gardenStage === 1 && creature._gardenTimer > 2500) {
        creature._gardenStage = 2; creature._gardenTimer = 0; // sprout
        showThought('It\'s growing! 🌱');
      } else if (creature._gardenStage === 2 && creature._gardenTimer > 3000) {
        creature._gardenStage = 3; creature._gardenTimer = 0; // flower!
        showThought('Beautiful! 🌸');
      } else if (creature._gardenStage === 3 && creature._gardenTimer > 3000) {
        setState('happy');
      }
      if (creature.stateTimer > 12000) setState('idle');
      break;
    }

    case 'cursorride': {
      creature.x = mouseX - SPRITE_SIZE/2;
      creature.y = mouseY - SPRITE_SIZE - 5;
      creature.onGround = false;
      personality.lastInteraction = Date.now();
      if (creature.stateTimer > 4000 + Math.random()*3000) {
        creature.onGround = false;
        creature.vy = -100;
        creature.vx = creature.facing * 50;
        showThought('That was fun! 🏄');
        setState('jump');
      }
      break;
    }

    case 'portal': {
      creature._portalPhase = (creature._portalPhase || 0) + dt;
      const pp2 = creature._portalPhase;
      creature.vx = 0;
      if (pp2 >= 1.5 && pp2 < 2.5) {
        // Invisible — teleporting
        creature.x = -100; creature.y = -100; // hide offscreen
      } else if (pp2 >= 2.5) {
        creature.x = creature._portalDestX;
        creature.y = groundY;
      }
      if (pp2 > 4) { setState('happy'); }
      break;
    }

    case 'giftbox': {
      creature.vx *= 0.9;
      if (!creature._giftOpened) {
        creature._giftY = (creature._giftY || -20) + 80 * dt;
        if (creature._giftY >= groundY + SPRITE_SIZE - 16) {
          creature._giftY = groundY + SPRITE_SIZE - 16;
          // Walk to gift
          const giftDist = creature._giftX - creature.x;
          if (Math.abs(giftDist) > 20) {
            creature.facing = giftDist > 0 ? 1 : -1;
            creature.vx = creature.facing * 60;
          } else {
            creature._giftOpened = true;
            creature._giftOpenTime = Date.now();
            showThought(['Wow! 🎉','For me?! 💛','Best day ever!','Ooh shiny!'][Math.floor(Math.random()*4)]);
            playSound('bounce');
          }
        }
      }
      if (creature._giftOpened && creature.stateTimer > 5000) setState('happy');
      if (creature.stateTimer > 10000) setState('idle');
      break;
    }

    case 'tower': {
      creature.vx *= 0.9;
      if (!creature._towerBlocks) creature._towerBlocks = [];
      const maxBlocks = 4 + Math.floor(Math.random()*3);
      // Place block every 1.5s
      const tInt = Math.floor(creature.stateTimer / 1500);
      const tLast = Math.floor((creature.stateTimer - FRAME_MS) / 1500);
      if (tInt > tLast && creature._towerBlocks.length < maxBlocks) {
        creature._towerBlocks.push({ wobble: 0 });
        creature._towerPhase = 1; // placing
        setTimeout(() => { creature._towerPhase = 0; }, 400);
        playSound('bounce');
      }
      // Wobble increases with height
      for (let i = 0; i < creature._towerBlocks.length; i++) {
        creature._towerBlocks[i].wobble = Math.sin(Date.now()/300 + i*0.8) * (i * 0.8);
      }
      // Tower falls if too tall
      if (creature._towerBlocks.length >= maxBlocks && creature.stateTimer > maxBlocks * 1500 + 2000) {
        showThought(Math.random()<0.5 ? 'Timber! 😱' : 'Oops! 🏗️');
        creature._towerBlocks = [];
        setState('dizzy');
      }
      if (creature.stateTimer > 15000) setState('idle');
      break;
    }

    case 'mirror': {
      creature.vx *= 0.95;
      creature._mirrorPhase = (creature._mirrorPhase || 0) + dt;
      if (creature._mirrorPhase > 1.5 && creature._mirrorPhase < 1.6) {
        showThought('Wait... is that ME?! 😱');
      }
      if (creature._mirrorPhase > 3.5 && creature._mirrorPhase < 3.6) {
        showThought('Looking good! 😎');
      }
      if (creature._mirrorPhase > 5.5) setState('happy');
      break;
    }

    case 'minigame': {
      creature.vx *= 0.9;
      creature._mgPhase = (creature._mgPhase || 0) + dt;
      // Score increases randomly
      if (Math.random() < dt * 2) {
        creature._mgScore = (creature._mgScore || 0) + Math.floor(Math.random() * 50 + 10);
      }
      // Reactions
      if (creature._mgPhase > 3 && creature._mgPhase < 3.1) showThought('YES! High score! 🎮');
      if (creature._mgPhase > 5 && creature._mgPhase < 5.1) showThought('One more round...');
      if (creature._mgPhase > 7) setState('happy');
      break;
    }

    case 'campfire': {
      creature.vx *= 0.9;
      if (!creature._fireParticles) creature._fireParticles = [];
      creature._marshmallow = (creature._marshmallow || 0) + dt;
      if (creature._marshmallow > 2 && creature._marshmallow < 2.1) showThought('Almost done... 🏕️');
      if (creature._marshmallow > 4 && creature._marshmallow < 4.1) showThought('Perfect! S\'mores! 😋');
      if (creature._marshmallow > 6) setState('happy');
      break;
    }

    case 'loveletter': {
      creature.vx *= 0.9;
      if (!creature._letterOpened) {
        creature._letterY = (creature._letterY || -20) + 50 * dt;
        // Land near creature
        if (creature._letterY >= creature.y + 10) {
          creature._letterY = creature.y + 10;
          if (creature.stateTimer > 3000) {
            creature._letterOpened = true;
            showThought('Aww! You\'re awesome! 💛');
            playSound('grab');
          }
        }
      }
      if (creature._letterOpened && creature.stateTimer > 6000) setState('happy');
      if (creature.stateTimer > 9000) setState('idle');
      break;
    }

    case 'petspet': {
      // Tiny pet follows Bitsy
      const petTarget = creature.x + creature.facing * 25;
      creature._petX = (creature._petX || petTarget) + (petTarget - (creature._petX || petTarget)) * dt * 3;
      creature._petY = groundY;
      creature.vx *= 0.95;
      // Randomly walk
      if (Math.random() < dt * 0.5) {
        creature.vx = creature.facing * settings.speed * 0.3;
      }
      if (creature.stateTimer > 8000) { showThought('Bye little friend! 🐾'); setState('happy'); }
      break;
    }

    case 'magicshow': {
      creature.vx *= 0.9;
      creature._magicPhase = (creature._magicPhase || 0) + dt;
      if (creature._magicPhase > 1.5 && creature._magicPhase < 1.6) showThought('Abracadabra! 🎩✨');
      if (creature._magicPhase > 3.5 && creature._magicPhase < 3.6) { showThought('TA-DAAA! 🐇'); playSound('bounce'); }
      if (creature._magicPhase > 6) setState('happy');
      break;
    }

    case 'parkour': {
      creature._pkPhase = (creature._pkPhase || 0) + dt;
      creature.onGround = false;
      // Bounce between walls
      const pkSpeed = 350;
      if (creature._pkSide === 'left') {
        creature.vx = pkSpeed;
        creature.vy = -200 + Math.sin(creature._pkPhase * 4) * 100;
        if (creature.x >= screenW - SPRITE_SIZE - 5) {
          creature._pkSide = 'right';
          creature.vy = -250;
          playSound('bounce');
        }
      } else {
        creature.vx = -pkSpeed;
        creature.vy = -200 + Math.sin(creature._pkPhase * 4) * 100;
        if (creature.x <= 5) {
          creature._pkSide = 'left';
          creature.vy = -250;
          playSound('bounce');
        }
      }
      creature.facing = creature.vx > 0 ? 1 : -1;
      // End after 3 bounces or timeout
      if (creature._pkPhase > 4) {
        creature.onGround = false;
        creature.vy = -100;
        showThought('PARKOUR! 🧗');
        setState('flung');
        creature.spinSpeed = 3;
      }
      break;
    }
  }
}

function setState(newState) {
  // Trigger activity label for interesting states (skip if thought bubble active)
  if (!SILENT_STATES.has(newState) && STATE_LABELS[newState] && _thoughtTimer <= 0) {
    _actLabel      = STATE_LABELS[newState];
    _actLabelTimer = 3.5;
    _actLabelY     = 0;
    _actLabelAlpha = 0;
  }

  creature.state = newState;
  creature.stateTimer = 0;
  creature.frameTimer = 0;
  creature.frame = 0;
  // Reset sleep timer when not in any sleep-related state
  if (newState !== 'sleep' && newState !== 'drowsy') {
    creature.sleepTimer = 0;
    creature._autoWakeTimer = 0;
  }
  // Reset drowsy timer when not drowsy
  if (newState !== 'drowsy') creature.drowsyTimer = 0;
  // Reset climb frame when leaving climb
  if (newState !== 'climb') {
    creature.climbFrame = 0;
    creature.climbFrameTimer = 0;
  }
  // Reset rotation for all non-spinning states
  if (newState !== 'flung' && newState !== 'tumble') {
    creature.spinAngle = 0;
    creature.spinSpeed = 0;
    creature.tumbleAngle = 0;
  }
}

// ─── MOUSE / DRAG / FLING ──────────────────────────────────
function isOverCreature(mx, my) {
  return mx >= creature.x && mx <= creature.x + SPRITE_SIZE &&
         my >= creature.y && my <= creature.y + SPRITE_SIZE + 6;
}

let _lastIgnoreState = null; // track to avoid spamming IPC

document.addEventListener('mousemove', (e) => {
  mouseX = e.clientX;
  mouseY = e.clientY;

  const over = isOverCreature(mouseX, mouseY);

  const anyOverlayOpen = custOpen ||
    settingsEl.style.display === 'block' ||
    statsEl.style.display === 'block';

  if (window.petAPI && !anyOverlayOpen) {
    const shouldIgnore = !over && !isDragging;
    if (shouldIgnore !== _lastIgnoreState) {
      _lastIgnoreState = shouldIgnore;
      window.petAPI.setIgnoreMouse(shouldIgnore);
    }
  }

  if (isDragging) {
    const newX = mouseX - grabOffsetX;
    const newY = mouseY - grabOffsetY;
    // Track velocity for fling
    dragVelX = (newX - creature.x) / (FRAME_MS / 1000);
    dragVelY = (newY - creature.y) / (FRAME_MS / 1000);
    creature.x = newX;
    creature.y = newY;
  }
});

let _skipNextDrag = false;

document.addEventListener('mousedown', (e) => {
  if (e.button !== 0) return;
  isMouseDown = true;

  // Skip drag if customize menu just opened via double-click
  if (_skipNextDrag) { _skipNextDrag = false; return; }
  if (custOpen) return;

  if (isOverCreature(e.clientX, e.clientY) && creature.state !== 'grabbed') {
    isDragging = true;
    grabOffsetX = e.clientX - creature.x;
    grabOffsetY = e.clientY - creature.y;
    dragVelX = 0;
    dragVelY = 0;
    setState('grabbed');
    stats.grabs++;
    creature.sleepTimer = 0;
    playSound('grab');
    onCreatureGrabbed();

    if (window.petAPI) window.petAPI.setIgnoreMouse(false);
  }
});

document.addEventListener('mouseup', (e) => {
  if (e.button !== 0) return;
  isMouseDown = false;

  if (isDragging) {
    isDragging = false;
    // FLING!
    creature.vx = clamp(dragVelX * 0.5, -MAX_FLING, MAX_FLING);
    creature.vy = clamp(dragVelY * 0.5, -MAX_FLING, MAX_FLING);
    creature.onGround = false;

    const flingPower = Math.hypot(creature.vx, creature.vy);
    if (flingPower > 50) {
      setState('flung');
      // Spin speed based on fling power — faster fling = faster spin
      creature.spinAngle = 0;
      creature.spinSpeed = (flingPower / 80) * (Math.random() > 0.5 ? 1 : -1); // random direction
      stats.flings++;
      if (flingPower > stats.longestFling) stats.longestFling = Math.round(flingPower);
      playSound('fling');
      onCreatureFlung();
    } else {
      setState('idle');
    }

    if (window.petAPI) window.petAPI.setIgnoreMouse(true);
  }
});

function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

// ─── SOUND EFFECTS (Web Audio API) ─────────────────────────
function initAudio() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
}

function playSound(type) {
  if (isMuted) return;
  initAudio();
  const now = audioCtx.currentTime;
  const vol = settings.volume;

  // Random pitch variation ±10%
  const pitchVar = 0.9 + Math.random() * 0.2;

  switch (type) {
    case 'grab': {
      // Small "eep!" — quick sine sweep up
      const o = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(600 * pitchVar, now);
      o.frequency.linearRampToValueAtTime(900 * pitchVar, now + 0.08);
      g.gain.setValueAtTime(vol * 0.15, now);
      g.gain.linearRampToValueAtTime(0, now + 0.12);
      o.connect(g).connect(audioCtx.destination);
      o.start(now); o.stop(now + 0.12);
      break;
    }
    case 'fling': {
      // Whoosh — noise burst + falling tone
      const o = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(800 * pitchVar, now);
      o.frequency.exponentialRampToValueAtTime(200 * pitchVar, now + 0.25);
      g.gain.setValueAtTime(vol * 0.12, now);
      g.gain.linearRampToValueAtTime(0, now + 0.25);
      o.connect(g).connect(audioCtx.destination);
      o.start(now); o.stop(now + 0.25);
      break;
    }
    case 'bounce': {
      // Soft thud — low sine pop
      const o = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(150 * pitchVar, now);
      o.frequency.exponentialRampToValueAtTime(60 * pitchVar, now + 0.1);
      g.gain.setValueAtTime(vol * 0.2, now);
      g.gain.linearRampToValueAtTime(0, now + 0.1);
      o.connect(g).connect(audioCtx.destination);
      o.start(now); o.stop(now + 0.12);
      break;
    }
    case 'scared': {
      // Quick gasp — rising tone
      const o = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(400 * pitchVar, now);
      o.frequency.linearRampToValueAtTime(1000 * pitchVar, now + 0.1);
      g.gain.setValueAtTime(vol * 0.1, now);
      g.gain.linearRampToValueAtTime(0, now + 0.15);
      o.connect(g).connect(audioCtx.destination);
      o.start(now); o.stop(now + 0.15);
      break;
    }
    case 'yawn': {
      // Gentle descending tone
      const o = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(500 * pitchVar, now);
      o.frequency.linearRampToValueAtTime(250 * pitchVar, now + 0.4);
      g.gain.setValueAtTime(vol * 0.08, now);
      g.gain.linearRampToValueAtTime(0, now + 0.5);
      o.connect(g).connect(audioCtx.destination);
      o.start(now); o.stop(now + 0.5);
      break;
    }
    case 'idle': {
      // Tiny hum
      const o = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(330 * pitchVar, now);
      g.gain.setValueAtTime(vol * 0.04, now);
      g.gain.linearRampToValueAtTime(0, now + 0.3);
      o.connect(g).connect(audioCtx.destination);
      o.start(now); o.stop(now + 0.3);
      break;
    }
  }
}

// Random idle sounds
let _idleSoundTimer = 0;
function tickIdleSounds(dt) {
  _idleSoundTimer += dt;
  if (_idleSoundTimer > 15 + Math.random() * 30) {
    _idleSoundTimer = 0;
    if (creature.state === 'idle' || creature.state === 'walk') {
      // Small chance of hiccup interruption
      if (Math.random() < 0.08) {
        setState('hiccup');
      } else {
        playSound('idle');
      }
    }
  }
}

// ─── SETTINGS UI ────────────────────────────────────────────
const settingsEl = document.getElementById('settings-overlay');
const statsEl = document.getElementById('stats-overlay');

// Load settings from localStorage
function loadSettings() {
  try {
    const s = localStorage.getItem('dpp-settings');
    if (s) Object.assign(settings, JSON.parse(s));
  } catch(e) {}
  document.getElementById('set-volume').value = settings.volume * 100;
  document.getElementById('set-speed').value = settings.speed;
  document.getElementById('set-bounce').value = settings.bounciness * 100;
  document.getElementById('set-startup').checked = settings.startup;
  document.getElementById('set-labels').checked = settings.showLabels !== false;
}

function saveSettings() {
  localStorage.setItem('dpp-settings', JSON.stringify(settings));
}

function loadStats() {
  try {
    const s = localStorage.getItem('dpp-stats');
    if (s) Object.assign(stats, JSON.parse(s));
    stats.startTime = stats.startTime || Date.now();
  } catch(e) {}
}

function saveStats() {
  localStorage.setItem('dpp-stats', JSON.stringify(stats));
}

// Load creature position
function loadPosition() {
  try {
    const p = localStorage.getItem('dpp-position');
    if (p) {
      const pos = JSON.parse(p);
      creature.x = clamp(pos.x, 0, screenW - SPRITE_SIZE);
      creature.y = clamp(pos.y, 0, groundY);
    }
  } catch(e) {}
}

function savePosition() {
  localStorage.setItem('dpp-position', JSON.stringify({ x: creature.x, y: creature.y }));
}

// Settings UI events
document.getElementById('set-volume').addEventListener('input', (e) => {
  settings.volume = e.target.value / 100;
  saveSettings();
});
document.getElementById('set-speed').addEventListener('input', (e) => {
  settings.speed = parseInt(e.target.value);
  saveSettings();
});
document.getElementById('set-bounce').addEventListener('input', (e) => {
  settings.bounciness = e.target.value / 100;
  saveSettings();
});
document.getElementById('set-startup').addEventListener('change', (e) => {
  settings.startup = e.target.checked;
  saveSettings();
});
document.getElementById('set-labels').addEventListener('change', (e) => {
  settings.showLabels = e.target.checked;
  saveSettings();
});

document.getElementById('settings-close').addEventListener('click', () => {
  settingsEl.style.display = 'none';
  if (window.petAPI) window.petAPI.setInteractive(false);
});

document.getElementById('stats-close').addEventListener('click', () => {
  statsEl.style.display = 'none';
  if (window.petAPI) window.petAPI.setInteractive(false);
});

function showSettings() {
  settingsEl.style.display = 'block';
  if (window.petAPI) window.petAPI.setInteractive(true);
}

function showStats() {
  const alive = Date.now() - stats.startTime;
  const mins = Math.floor(alive / 60000);
  const hrs = Math.floor(mins / 60);
  document.getElementById('stat-flings').textContent = stats.flings;
  document.getElementById('stat-bounces').textContent = stats.bounces;
  document.getElementById('stat-distance').textContent = Math.round(stats.distance).toLocaleString() + ' px';
  document.getElementById('stat-alive').textContent = hrs > 0 ? `${hrs}h ${mins%60}m` : `${mins}m`;
  document.getElementById('stat-grabs').textContent = stats.grabs;
  document.getElementById('stat-longest').textContent = stats.longestFling + ' px/s';
  statsEl.style.display = 'block';
  if (window.petAPI) window.petAPI.setInteractive(true);
}

// ─── IPC FROM MAIN ──────────────────────────────────────────
if (window.petAPI) {
  window.petAPI.onSetPaused((v) => { isPaused = v; });
  window.petAPI.onSetMuted((v) => { isMuted = v; });
  window.petAPI.onOpenSettings(() => showSettings());
  window.petAPI.onOpenStats(() => showStats());
  window.petAPI.onOpenCustomize(() => openCustomize());
}

// ─── MAIN GAME LOOP ────────────────────────────────────────
let lastTime = performance.now();
let saveTimer = 0;

function gameLoop(now) {
  requestAnimationFrame(gameLoop);

  const dt = Math.min((now - lastTime) / 1000, 0.1); // cap at 100ms
  lastTime = now;

  if (isPaused) return;

  // Clear
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Update — Bitsy keeps playing even while customize is open
  updateEyeLook(dt);
  if (_freezeFrames > 0) {
    _freezeFrames--;
  } else {
    updatePhysics(dt);
    updateState(dt);
  }
  tickIdleSounds(dt);

  // Draw graffiti marks (behind creature)
  if (creature._graffitiMarks && creature._graffitiMarks.length > 0) {
    const nowMs = Date.now();
    ctx.save();
    ctx.font = '10px serif';
    // Sweep: remove expired, draw live — single pass, no new array allocation
    let alive = [];
    for (const m of creature._graffitiMarks) {
      const age = nowMs - m.born;
      if (age >= 3000) continue;
      alive.push(m);
      ctx.globalAlpha = Math.max(0, 1 - age / 3000);
      ctx.fillStyle = m.color;
      ctx.fillText(m.shape, m.x, m.y);
    }
    creature._graffitiMarks = alive;
    ctx.restore();
  }

  // Footprints (drawn behind creature)
  drawFootprints();
  // Footprint spawning
  if ((creature.state === 'walk' || creature.state === 'sprint') && creature.onGround) {
    if (creature.frameTimer % 200 < FRAME_MS * 1.1) addFootprint(creature.state === 'sprint' ? 'sprint' : 'walk');
  }

  // Clone invasion (drawn behind creature)
  drawInvasion();

  // Draw (accessories are drawn inside drawCreature, within the same transform)
  drawCreature();

  // Screen edge peek (drawn on top)
  drawEdgePeek();

  // Screen crack effect (drawn on top of everything)
  drawScreenCrack();

  // Dream bubble during sleep
  if (creature.state === 'sleep') drawDreamBubble();

  // Personality system — moods, thoughts, micro-events
  updatePersonality(dt);

  // Keyboard reactions
  updateKeyboardReactions(dt);

  // Screen edge peek update
  updateEdgePeek(dt);
  if (creature.state === 'idle' && creature.onGround) tryEdgePeek();

  // Battery awareness
  updateBatteryReaction(dt);

  // Holiday check (once per day)
  checkHoliday();

  // Clone invasion update
  updateInvasion(dt);

  // Pomodoro timer
  updatePomodoro(dt);
  drawPomodoroIndicator();

  // Activity label — tells user what Bitsy is doing
  drawActivityLabel(dt);

  // Thought bubble — random musings
  drawThoughtBubble(dt);

  // Animate customize preview while panel is open
  if (custOpen) {
    // Update blink timer
    _prevBlinkTimer -= dt * 1000;
    if (_prevBlink && _prevBlinkTimer <= 0) {
      _prevBlink = false;
      _prevBlinkTimer = 2000 + Math.random() * 3000; // 2-5s until next blink
    } else if (!_prevBlink && _prevBlinkTimer <= 0) {
      _prevBlink = true;
      _prevBlinkTimer = 100 + Math.random() * 80; // blink lasts 100-180ms
    }
    // Update look timer
    _prevLookTimer -= dt * 1000;
    if (_prevLookTimer <= 0) {
      const r = Math.random();
      _prevLookX = r < 0.3 ? -1 : r < 0.6 ? 1 : 0; // left / right / center
      _prevLookTimer = 1500 + Math.random() * 2500; // change every 1.5-4s
    }
    updateCustPreview();
  }

  // Save position/stats periodically
  saveTimer += dt;
  if (saveTimer > 5) {
    saveTimer = 0;
    savePosition();
    saveStats();
  }
}

// ─── RESIZE HANDLER ─────────────────────────────────────────
window.addEventListener('resize', () => {
  screenW = window.innerWidth;
  screenH = window.innerHeight;
  canvas.width = screenW;
  canvas.height = screenH;
  ctx.imageSmoothingEnabled = false;
  groundY = screenH - SPRITE_SIZE - GROUND_OFFSET;
  creature.y = Math.min(creature.y, groundY);
});

// ─── CUSTOMIZATION SYSTEM ───────────────────────────────────
const BODY_COLORS = [
  { id: 'yellow',  label: 'Sunny',    body: '#ffd54f', dark: '#f0b723', light: '#ffec8b', outline: '#5d4037', feet: '#f0b723', cheek: '#ff8a80', mouth: '#4a2800' },
  { id: 'teal',    label: 'Ocean',    body: '#5ec4aa', dark: '#3a9a82', light: '#8eded0', outline: '#1a3a32', feet: '#3a9a82', cheek: '#f5a0b8', mouth: '#1a3a32' },
  { id: 'pink',    label: 'Bubblegum',body: '#f48fb1', dark: '#e06090', light: '#ffc1d6', outline: '#5c1a30', feet: '#e06090', cheek: '#ff5252', mouth: '#5c1a30' },
  { id: 'blue',    label: 'Sky',      body: '#64b5f6', dark: '#3d8bd4', light: '#a0d4ff', outline: '#1a3050', feet: '#3d8bd4', cheek: '#f5a0b8', mouth: '#1a3050' },
  { id: 'green',   label: 'Lime',     body: '#81c784', dark: '#4caf50', light: '#b8e6b0', outline: '#1b3a1d', feet: '#4caf50', cheek: '#ffab91', mouth: '#1b3a1d' },
  { id: 'purple',  label: 'Grape',    body: '#b39ddb', dark: '#8e6abf', light: '#d4c4f0', outline: '#2a1a40', feet: '#8e6abf', cheek: '#f48fb1', mouth: '#2a1a40' },
  { id: 'orange',  label: 'Sunset',   body: '#ffb74d', dark: '#f09030', light: '#ffd699', outline: '#5a3010', feet: '#f09030', cheek: '#ff7043', mouth: '#5a3010' },
  { id: 'red',     label: 'Cherry',   body: '#ef5350', dark: '#c62828', light: '#ff8a80', outline: '#3a0a0a', feet: '#c62828', cheek: '#ffab91', mouth: '#3a0a0a' },
  { id: 'white',   label: 'Ghost',    body: '#e8e8e8', dark: '#bdbdbd', light: '#ffffff', outline: '#424242', feet: '#bdbdbd', cheek: '#f48fb1', mouth: '#424242' },
  { id: 'black',   label: 'Shadow',   body: '#484848', dark: '#2a2a2a', light: '#6a6a6a', outline: '#111111', feet: '#2a2a2a', cheek: '#ef5350', mouth: '#eeeeee' },
];

const HATS = [
  { id: 'none',      label: 'None',      icon: '🚫' },
  { id: 'tophat',    label: 'Top Hat',   icon: '🎩' },
  { id: 'crown',     label: 'Crown',     icon: '👑' },
  { id: 'beanie',    label: 'Beanie',    icon: '🧢' },
  { id: 'flower',    label: 'Flower',    icon: '🌸' },
  { id: 'halo',      label: 'Halo',      icon: '😇' },
  { id: 'devil',     label: 'Horns',     icon: '😈' },
  { id: 'bow',       label: 'Bow',       icon: '🎀' },
  { id: 'party',     label: 'Party',     icon: '🎉' },
  { id: 'santa',     label: 'Santa',     icon: '🎅' },
  { id: 'pirate',    label: 'Pirate',    icon: '🏴‍☠️' },
  { id: 'wizard',    label: 'Wizard',    icon: '🧙' },
  { id: 'chef',      label: 'Chef',      icon: '👨‍🍳' },
  { id: 'helmet',    label: 'Helmet',    icon: '⛑️' },
  { id: 'cowboy',    label: 'Cowboy',    icon: '🤠' },
  { id: 'antenna',   label: 'Antenna',   icon: '📡' },
  { id: 'headband',  label: 'Headband',  icon: '💪' },
  { id: 'mushroom',  label: 'Mushroom',  icon: '🍄' },
  { id: 'astronaut', label: 'Astronaut', icon: '👨‍🚀' },
  { id: 'frog',      label: 'Frog Hat',  icon: '🐸' },
];

const ACCESSORIES = [
  { id: 'none',       label: 'None',       icon: '🚫' },
  { id: 'glasses',    label: 'Glasses',    icon: '👓' },
  { id: 'sunglasses', label: 'Shades',     icon: '🕶️' },
  { id: 'scarf',      label: 'Scarf',      icon: '🧣' },
  { id: 'bowtie',     label: 'Bow Tie',    icon: '🎀' },
  { id: 'cape',       label: 'Cape',       icon: '🦸' },
  { id: 'necklace',   label: 'Necklace',   icon: '📿' },
  { id: 'bandana',    label: 'Bandana',    icon: '🏴' },
  { id: 'wings',      label: 'Wings',      icon: '🪽' },
  { id: 'tail',       label: 'Tail',       icon: '🐾' },
  { id: 'shield',     label: 'Shield',     icon: '🛡️' },
  { id: 'sword',      label: 'Sword',      icon: '⚔️' },
  { id: 'backpack',   label: 'Backpack',   icon: '🎒' },
  { id: 'balloon',    label: 'Balloon',    icon: '🎈' },
  { id: 'headphones', label: 'Phones',     icon: '🎧' },
  { id: 'lollipop',   label: 'Lollipop',   icon: '🍭' },
  { id: 'skateboard', label: 'Board',      icon: '🛹' },
  { id: 'camera',     label: 'Camera',     icon: '📸' },
  { id: 'magic',      label: 'Wand',       icon: '🪄' },
  { id: 'mustache',   label: 'Stache',     icon: '🥸' },
];

// Customization state
let customization = {
  color: 'yellow',
  hat: 'none',
  accessory: 'none',
  face: 'default',  // kept internally for backward compat, always 'default'
};

function loadCustomization() {
  try {
    const s = localStorage.getItem('dpp-custom');
    if (s) Object.assign(customization, JSON.parse(s));
  } catch(e) {}
  applyColor(customization.color);
}

function saveCustomization() {
  localStorage.setItem('dpp-custom', JSON.stringify(customization));
}

function applyColor(colorId) {
  const c = BODY_COLORS.find(x => x.id === colorId);
  if (!c) return;
  C.body = c.body;
  C.bodyDark = c.dark;
  C.bodyLight = c.light;
  C.outline = c.outline;
  C.feet = c.feet;
  C.cheek = c.cheek;
  C.mouth = c.mouth;
}

// ─── DRAW ACCESSORIES (called after drawCreature) ───────────
function drawHat() {
  ctx.save(); // isolate ctx state
  // Body blob center-x; head top at grid row 4 (y+12), body spans cols 3-12 (x+9 to x+36)
  const cx = creature.x + SPRITE_SIZE / 2;     // 24px from left
  const headTop = creature.y + 12;             // actual pixel-top of head
  const headL = creature.x + 9;               // left edge of body
  const headR = creature.x + 36;              // right edge of body
  const headW = headR - headL;                // 27px

  switch (customization.hat) {
    case 'tophat':
      ctx.fillStyle = '#1a1a2e';
      ctx.fillRect(cx - 9, headTop - 12, 18, 13);     // tall cylinder
      ctx.fillRect(cx - 12, headTop, 24, 3);            // brim
      ctx.fillStyle = '#ffd54f';
      ctx.fillRect(cx - 9, headTop - 2, 18, 2);        // gold band
      break;
    case 'crown':
      ctx.fillStyle = '#ffd700';
      ctx.fillRect(cx - 9, headTop - 4, 18, 5);         // base band
      // 3 pointy spikes
      ctx.fillRect(cx - 8, headTop - 8, 3, 5);
      ctx.fillRect(cx - 1, headTop - 10, 3, 7);
      ctx.fillRect(cx + 6, headTop - 8, 3, 5);
      // Gems
      ctx.fillStyle = '#ff1744';
      ctx.fillRect(cx - 7, headTop - 6, 2, 2);
      ctx.fillStyle = '#42a5f5';
      ctx.fillRect(cx, headTop - 8, 2, 2);
      ctx.fillStyle = '#ff1744';
      ctx.fillRect(cx + 7, headTop - 6, 2, 2);
      break;
    case 'beanie':
      // Rounded dome that hugs the head
      ctx.fillStyle = '#42a5f5';
      for (let bx = -11; bx <= 11; bx++) {
        const h = Math.sqrt(Math.max(0, 121 - bx * bx)) * 0.6;
        ctx.fillRect(cx + bx, headTop - h, 1, h + 1);
      }
      ctx.fillStyle = '#1565c0';
      ctx.fillRect(cx - 11, headTop - 1, 22, 3);       // thick rim
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.arc(cx, headTop - 8, 3, 0, Math.PI * 2); ctx.fill(); // pom-pom
      break;
    case 'flower':
      // Sits on right side of head
      const fx = cx + 8;
      const fy = headTop - 2;
      ctx.fillStyle = '#e91e63';
      const petal = [[0,-4],[4,0],[0,4],[-4,0]];
      for (const [px3,py3] of petal) { ctx.fillRect(fx+px3-1, fy+py3-1, 3, 3); }
      ctx.fillStyle = '#ffeb3b';
      ctx.fillRect(fx - 1, fy - 1, 3, 3);              // center
      // Stem
      ctx.fillStyle = '#4caf50';
      ctx.fillRect(fx, fy + 2, 1, 4);
      break;
    case 'halo':
      ctx.strokeStyle = '#fff59d';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(cx, headTop - 5, 14, 4, 0, 0, Math.PI * 2);
      ctx.stroke();
      // Glow
      ctx.strokeStyle = 'rgba(255,245,157,0.2)';
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.ellipse(cx, headTop - 5, 14, 4, 0, 0, Math.PI * 2);
      ctx.stroke();
      break;
    case 'devil':
      ctx.fillStyle = '#ff1744';
      // Left horn — tapers up
      ctx.fillRect(headL - 2, headTop, 4, 3);
      ctx.fillRect(headL - 3, headTop - 3, 3, 4);
      ctx.fillRect(headL - 3, headTop - 6, 2, 4);
      // Right horn
      ctx.fillRect(headR - 2, headTop, 4, 3);
      ctx.fillRect(headR, headTop - 3, 3, 4);
      ctx.fillRect(headR + 1, headTop - 6, 2, 4);
      break;
    case 'bow':
      ctx.fillStyle = '#e91e63';
      ctx.fillRect(cx - 8, headTop - 2, 6, 5);         // left wing
      ctx.fillRect(cx + 2, headTop - 2, 6, 5);          // right wing
      ctx.fillStyle = '#c2185b';
      ctx.fillRect(cx - 1, headTop - 1, 3, 3);          // knot center
      break;
    case 'party':
      // Cone hat on side
      ctx.fillStyle = '#7c4dff';
      ctx.beginPath();
      ctx.moveTo(cx - 6, headTop + 2);
      ctx.lineTo(cx + 2, headTop - 14);
      ctx.lineTo(cx + 8, headTop + 2);
      ctx.fill();
      // Stripes
      ctx.fillStyle = '#b388ff';
      ctx.fillRect(cx - 2, headTop - 4, 6, 2);
      ctx.fillRect(cx, headTop - 9, 4, 2);
      // Pom on top
      ctx.fillStyle = '#ffeb3b';
      ctx.beginPath(); ctx.arc(cx + 2, headTop - 14, 2.5, 0, Math.PI * 2); ctx.fill();
      break;
    case 'santa':
      // Dome that drapes right
      ctx.fillStyle = '#d32f2f';
      for (let bx = -10; bx <= 10; bx++) {
        const h = Math.sqrt(Math.max(0, 100 - bx * bx)) * 0.55;
        ctx.fillRect(cx + bx, headTop - h, 1, h + 1);
      }
      // Draping end
      ctx.fillRect(cx + 8, headTop - 5, 4, 5);
      ctx.fillRect(cx + 10, headTop - 2, 4, 5);
      // White fur trim
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(cx - 11, headTop, 22, 3);
      // Pom-pom at end
      ctx.beginPath(); ctx.arc(cx + 13, headTop + 1, 3, 0, Math.PI * 2); ctx.fill();
      break;
    case 'pirate':
      // Black bandana + skull
      ctx.fillStyle = '#222';
      ctx.fillRect(cx - 11, headTop, 22, 5);
      ctx.fillRect(cx - 9, headTop - 2, 18, 3);
      // Knot tail
      ctx.fillRect(cx + 11, headTop + 1, 5, 3);
      ctx.fillRect(cx + 14, headTop + 3, 3, 3);
      // Skull
      ctx.fillStyle = '#ddd';
      ctx.fillRect(cx - 3, headTop + 1, 6, 3);
      ctx.fillStyle = '#e53935';
      ctx.fillRect(cx - 1, headTop + 1, 1, 1);
      ctx.fillRect(cx + 2, headTop + 1, 1, 1);
      break;
    case 'wizard':
      // Tall pointy hat with stars
      ctx.fillStyle = '#311b92';
      ctx.beginPath();
      ctx.moveTo(cx - 10, headTop + 2);
      ctx.lineTo(cx, headTop - 20);
      ctx.lineTo(cx + 10, headTop + 2);
      ctx.fill();
      // Brim
      ctx.fillStyle = '#4527a0';
      ctx.fillRect(cx - 13, headTop + 1, 26, 3);
      // Stars
      ctx.fillStyle = '#ffd54f';
      ctx.fillRect(cx - 4, headTop - 8, 2, 2);
      ctx.fillRect(cx + 3, headTop - 14, 2, 2);
      ctx.fillRect(cx - 1, headTop - 4, 1, 1);
      break;
    case 'chef':
      // White puffy chef hat
      ctx.fillStyle = '#f5f5f5';
      ctx.beginPath(); ctx.arc(cx, headTop - 4, 12, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(cx - 6, headTop - 2, 8, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(cx + 6, headTop - 2, 8, 0, Math.PI * 2); ctx.fill();
      // Band
      ctx.fillStyle = '#eee';
      ctx.fillRect(cx - 11, headTop + 1, 22, 3);
      break;
    case 'helmet':
      // Red safety helmet
      ctx.fillStyle = '#e53935';
      for (let bx = -11; bx <= 11; bx++) {
        const h = Math.sqrt(Math.max(0, 121 - bx * bx)) * 0.5;
        ctx.fillRect(cx + bx, headTop - h, 1, h + 2);
      }
      // Visor
      ctx.fillStyle = '#ffee58';
      ctx.fillRect(cx - 8, headTop + 1, 16, 2);
      // White cross
      ctx.fillStyle = '#fff';
      ctx.fillRect(cx - 1, headTop - 5, 2, 5);
      ctx.fillRect(cx - 3, headTop - 3, 6, 1);
      break;
    case 'cowboy':
      // Brown cowboy hat with curved brim
      ctx.fillStyle = '#795548';
      ctx.fillRect(cx - 15, headTop + 1, 30, 3); // wide brim
      ctx.fillRect(cx - 8, headTop - 6, 16, 8);  // crown
      ctx.fillStyle = '#5d4037';
      ctx.fillRect(cx - 4, headTop - 7, 8, 2);   // indent
      // Brim curve
      ctx.fillStyle = '#6d4c41';
      ctx.fillRect(cx - 14, headTop + 1, 2, 2);
      ctx.fillRect(cx + 12, headTop + 1, 2, 2);
      // Band
      ctx.fillStyle = '#ffd54f';
      ctx.fillRect(cx - 8, headTop, 16, 2);
      // Band buckle
      ctx.fillStyle = '#fff';
      ctx.fillRect(cx - 1, headTop - 1, 2, 3);
      break;
    case 'antenna':
      // Alien antenna — two bobbing stalks
      const ab1 = Math.sin(Date.now() / 300) * 3;
      const ab2 = Math.sin(Date.now() / 300 + 1.5) * 3;
      ctx.strokeStyle = '#666';
      ctx.lineWidth = 1.5;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(cx - 5, headTop); ctx.quadraticCurveTo(cx - 7, headTop - 12 + ab1, cx - 4, headTop - 18 + ab1);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx + 5, headTop); ctx.quadraticCurveTo(cx + 7, headTop - 12 + ab2, cx + 4, headTop - 18 + ab2);
      ctx.stroke();
      // Glowing orbs
      ctx.fillStyle = '#76ff03';
      ctx.shadowColor = '#76ff03'; ctx.shadowBlur = 6;
      ctx.beginPath(); ctx.arc(cx - 4, headTop - 18 + ab1, 3, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(cx + 4, headTop - 18 + ab2, 3, 0, Math.PI * 2); ctx.fill();
      ctx.shadowBlur = 0;
      break;
    case 'headband':
      // Sporty headband with sweatband
      ctx.fillStyle = '#e53935';
      ctx.fillRect(cx - 12, headTop + 1, 24, 4);
      // Nike-style swoosh
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(cx - 4, headTop + 4);
      ctx.quadraticCurveTo(cx, headTop + 1, cx + 5, headTop + 2);
      ctx.stroke();
      // Sweat drops
      if (Math.sin(Date.now() / 500) > 0.5) {
        ctx.fillStyle = '#64b5f6';
        ctx.fillRect(cx + 13, headTop + 4, 2, 3);
      }
      break;
    case 'mushroom':
      // Mario-style mushroom cap
      ctx.fillStyle = '#e53935';
      for (let bx = -12; bx <= 12; bx++) {
        const mh = Math.sqrt(Math.max(0, 144 - bx * bx)) * 0.55;
        ctx.fillRect(cx + bx, headTop - mh, 1, mh + 1);
      }
      // White spots
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(cx - 6, headTop - 5, 3, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(cx + 5, headTop - 7, 2.5, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(cx + 1, headTop - 4, 2, 0, Math.PI * 2); ctx.fill();
      break;
    case 'astronaut':
      // Glass dome helmet
      ctx.strokeStyle = 'rgba(180,220,255,0.7)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(cx, headTop + 8, 16, Math.PI, 0);
      ctx.stroke();
      // Dome fill
      ctx.fillStyle = 'rgba(100,160,220,0.12)';
      ctx.beginPath();
      ctx.arc(cx, headTop + 8, 15, Math.PI, 0);
      ctx.fill();
      // Reflection
      ctx.fillStyle = 'rgba(255,255,255,0.2)';
      ctx.beginPath();
      ctx.ellipse(cx - 5, headTop, 4, 8, -0.3, 0, Math.PI * 2);
      ctx.fill();
      // Rim
      ctx.fillStyle = '#ccc';
      ctx.fillRect(cx - 16, headTop + 7, 32, 2);
      break;
    case 'frog':
      // Cute frog beanie with eyes
      ctx.fillStyle = '#4caf50';
      for (let bx = -11; bx <= 11; bx++) {
        const fh = Math.sqrt(Math.max(0, 121 - bx * bx)) * 0.55;
        ctx.fillRect(cx + bx, headTop - fh, 1, fh + 1);
      }
      // Frog eyes
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(cx - 7, headTop - 6, 4.5, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(cx + 7, headTop - 6, 4.5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#1b5e20';
      ctx.beginPath(); ctx.arc(cx - 7, headTop - 6, 2, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(cx + 7, headTop - 6, 2, 0, Math.PI * 2); ctx.fill();
      // Mouth line
      ctx.strokeStyle = '#2e7d32';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(cx - 6, headTop + 1);
      ctx.quadraticCurveTo(cx, headTop + 3, cx + 6, headTop + 1);
      ctx.stroke();
      break;
  }
  ctx.restore(); // restore ctx state
}

function drawAccessory() {
  ctx.save(); // isolate all ctx state changes (lineWidth, lineCap, strokeStyle, etc.)
  // Reference points matching the pixel grid exactly
  const cx = creature.x + SPRITE_SIZE / 2;           // center x = 24
  const cy = creature.y + SPRITE_SIZE / 2;           // center y = 24
  const bodyL = creature.x + 9;                      // body left (col 3)
  const bodyR = creature.x + 36;                     // body right (col 12)
  const eyeY = creature.y + 21;                      // eye row top (row 7)
  const mouthY = creature.y + 28;                    // mouth area (row 9-10)
  const neckY = creature.y + 35;                     // neck/bottom body (row 12)
  const bottomY = creature.y + 39;                   // body bottom (row 13)

  switch (customization.accessory) {
    case 'glasses':
      // Round wire-frame glasses
      ctx.strokeStyle = '#b0bec5';
      ctx.lineWidth = 1.5;
      ctx.lineCap = 'round';
      // Round lenses
      ctx.beginPath(); ctx.arc(creature.x + 18, eyeY + 3, 5, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.arc(creature.x + 30, eyeY + 3, 5, 0, Math.PI * 2); ctx.stroke();
      // Bridge
      ctx.beginPath();
      ctx.moveTo(creature.x + 23, eyeY + 2);
      ctx.quadraticCurveTo(creature.x + 24, eyeY, creature.x + 25, eyeY + 2);
      ctx.stroke();
      // Temples
      ctx.beginPath();
      ctx.moveTo(creature.x + 13, eyeY + 3); ctx.lineTo(bodyL - 2, eyeY + 3);
      ctx.moveTo(creature.x + 35, eyeY + 3); ctx.lineTo(bodyR + 2, eyeY + 3);
      ctx.stroke();
      // Lens shine
      ctx.fillStyle = 'rgba(255,255,255,0.15)';
      ctx.beginPath(); ctx.arc(creature.x + 16, eyeY + 1, 2, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(creature.x + 28, eyeY + 1, 2, 0, Math.PI * 2); ctx.fill();
      break;
    case 'sunglasses':
      // Lenses cover eyes completely
      ctx.fillStyle = '#212121';
      ctx.fillRect(creature.x + 13, eyeY - 2, 9, 8);
      ctx.fillRect(creature.x + 25, eyeY - 2, 9, 8);
      // Bridge
      ctx.fillStyle = '#424242';
      ctx.fillRect(creature.x + 22, eyeY + 1, 3, 3);
      // Lens shine
      ctx.fillStyle = 'rgba(100,180,255,0.3)';
      ctx.fillRect(creature.x + 14, eyeY - 1, 3, 3);
      ctx.fillRect(creature.x + 26, eyeY - 1, 3, 3);
      break;
    case 'scarf':
      // Wraps around neck area
      ctx.fillStyle = '#e53935';
      ctx.fillRect(bodyL - 1, neckY - 2, bodyR - bodyL + 2, 5);
      // Hanging end
      ctx.fillRect(bodyR - 4, neckY + 2, 5, 12);
      ctx.fillRect(bodyR - 3, neckY + 12, 3, 3);
      // Stripes
      ctx.fillStyle = '#ffeb3b';
      ctx.fillRect(bodyL + 2, neckY - 1, 2, 3);
      ctx.fillRect(bodyL + 10, neckY - 1, 2, 3);
      ctx.fillRect(bodyL + 18, neckY - 1, 2, 3);
      ctx.fillRect(bodyR - 3, neckY + 6, 3, 2);
      break;
    case 'bowtie':
      // Centered at neck
      ctx.fillStyle = '#e91e63';
      ctx.fillRect(cx - 7, neckY - 2, 6, 5);           // left bow
      ctx.fillRect(cx + 1, neckY - 2, 6, 5);            // right bow
      ctx.fillStyle = '#c2185b';
      ctx.fillRect(cx - 1, neckY - 1, 3, 3);            // center knot
      break;
    case 'cape':
      // Flows from shoulders behind creature
      const waveT = Math.sin(Date.now() / 300) * 3;
      const capeBack = creature.facing === 1 ? bodyL : bodyR;
      const cd = creature.facing === 1 ? -1 : 1;
      ctx.fillStyle = '#7c4dff';
      ctx.beginPath();
      ctx.moveTo(capeBack, creature.y + 16);
      ctx.lineTo(capeBack, creature.y + 22);
      ctx.quadraticCurveTo(
        capeBack + cd * 10, bottomY + 6 + waveT,
        capeBack + cd * 16, bottomY + 12 + waveT
      );
      ctx.lineTo(capeBack + cd * 6, bottomY + 8 + waveT);
      ctx.closePath();
      ctx.fill();
      // Cape inner color
      ctx.fillStyle = '#9c27b0';
      ctx.beginPath();
      ctx.moveTo(capeBack, creature.y + 20);
      ctx.quadraticCurveTo(
        capeBack + cd * 6, bottomY + waveT,
        capeBack + cd * 10, bottomY + 6 + waveT
      );
      ctx.lineTo(capeBack + cd * 4, bottomY + 3 + waveT);
      ctx.closePath();
      ctx.fill();
      break;
    case 'necklace':
      // Curved chain around neck with pendant
      ctx.strokeStyle = '#ffd700';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(cx, neckY, 9, 0.15, Math.PI - 0.15);
      ctx.stroke();
      // Heart pendant
      ctx.fillStyle = '#ff1744';
      ctx.beginPath();
      ctx.arc(cx - 2, neckY + 8, 2.5, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath();
      ctx.arc(cx + 2, neckY + 8, 2.5, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath();
      ctx.moveTo(cx - 4, neckY + 9); ctx.lineTo(cx, neckY + 14); ctx.lineTo(cx + 4, neckY + 9);
      ctx.fill();
      break;
    case 'bandana':
      // Tied around forehead
      const headTop = creature.y + 12;
      ctx.fillStyle = '#ff6f00';
      ctx.fillRect(bodyL, headTop + 2, bodyR - bodyL, 4);
      // Knot tails on the side
      const knotSide = creature.facing === 1 ? bodyR : bodyL - 8;
      ctx.fillRect(knotSide, headTop + 3, 6, 3);
      ctx.fillRect(knotSide + 2, headTop + 6, 4, 4);
      // Pattern dots
      ctx.fillStyle = '#fff3e0';
      ctx.fillRect(bodyL + 4, headTop + 3, 2, 2);
      ctx.fillRect(bodyL + 12, headTop + 3, 2, 2);
      ctx.fillRect(bodyL + 20, headTop + 3, 2, 2);
      break;
    case 'wings':
      // Fairy/angel wings from mid-back
      const wf = Math.sin(Date.now() / 150) * 4;
      const midY = creature.y + 20;
      ctx.fillStyle = 'rgba(180,210,255,0.5)';
      // Left wing (3 ovals)
      ctx.beginPath();
      ctx.ellipse(bodyL - 8, midY - 4 + wf, 10, 6, -0.3, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath();
      ctx.ellipse(bodyL - 5, midY + 4 + wf * 0.5, 8, 4, -0.1, 0, Math.PI * 2); ctx.fill();
      // Right wing
      ctx.beginPath();
      ctx.ellipse(bodyR + 8, midY - 4 + wf, 10, 6, 0.3, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath();
      ctx.ellipse(bodyR + 5, midY + 4 + wf * 0.5, 8, 4, 0.1, 0, Math.PI * 2); ctx.fill();
      // Wing sparkle
      ctx.fillStyle = 'rgba(255,255,255,0.6)';
      ctx.fillRect(bodyL - 10, midY - 3 + wf, 2, 2);
      ctx.fillRect(bodyR + 10, midY - 3 + wf, 2, 2);
      break;
    case 'tail':
      // Curvy tail from behind
      const tw = Math.sin(Date.now() / 200) * 5;
      const tailX = creature.facing === 1 ? bodyL : bodyR;
      const td = creature.facing === 1 ? -1 : 1;
      ctx.strokeStyle = C.bodyDark;
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(tailX, neckY);
      ctx.quadraticCurveTo(
        tailX + td * 14 + tw, neckY - 8,
        tailX + td * 18 + tw, neckY - 18
      );
      ctx.stroke();
      // Round tip
      ctx.fillStyle = C.body;
      ctx.beginPath();
      ctx.arc(tailX + td * 18 + tw, neckY - 19, 3.5, 0, Math.PI * 2);
      ctx.fill();
      break;
    case 'shield':
      // Detailed kite shield
      const shDir = creature.facing === 1 ? bodyR + 1 : bodyL - 15;
      // Outer shape
      ctx.fillStyle = '#455a64';
      ctx.beginPath();
      ctx.moveTo(shDir + 7, neckY - 6);
      ctx.lineTo(shDir + 13, neckY);
      ctx.lineTo(shDir + 13, neckY + 6);
      ctx.lineTo(shDir + 7, neckY + 14);
      ctx.lineTo(shDir + 1, neckY + 6);
      ctx.lineTo(shDir + 1, neckY);
      ctx.closePath(); ctx.fill();
      // Inner face
      ctx.fillStyle = '#607d8b';
      ctx.beginPath();
      ctx.moveTo(shDir + 7, neckY - 4);
      ctx.lineTo(shDir + 11, neckY);
      ctx.lineTo(shDir + 11, neckY + 5);
      ctx.lineTo(shDir + 7, neckY + 11);
      ctx.lineTo(shDir + 3, neckY + 5);
      ctx.lineTo(shDir + 3, neckY);
      ctx.closePath(); ctx.fill();
      // Cross emblem
      ctx.fillStyle = '#ffd54f';
      ctx.fillRect(shDir + 6, neckY - 1, 2, 10);
      ctx.fillRect(shDir + 4, neckY + 2, 6, 2);
      // Rim highlight
      ctx.fillStyle = 'rgba(255,255,255,0.15)';
      ctx.fillRect(shDir + 2, neckY - 2, 4, 2);
      break;
    case 'sword':
      // Detailed pixel sword
      const swDir = creature.facing;
      const swX = swDir === 1 ? bodyR + 3 : bodyL - 9;
      // Blade
      ctx.fillStyle = '#cfd8dc';
      ctx.fillRect(swX + 2, neckY - 18, 3, 20);
      // Blade edge highlight
      ctx.fillStyle = '#eceff1';
      ctx.fillRect(swX + 2, neckY - 18, 1, 20);
      // Blade tip
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.moveTo(swX + 2, neckY - 18);
      ctx.lineTo(swX + 3.5, neckY - 22);
      ctx.lineTo(swX + 5, neckY - 18);
      ctx.fill();
      // Guard (cross)
      ctx.fillStyle = '#ffd54f';
      ctx.fillRect(swX - 1, neckY + 2, 9, 3);
      ctx.fillStyle = '#f0b723';
      ctx.fillRect(swX, neckY + 3, 7, 1);
      // Grip (wrapped leather)
      ctx.fillStyle = '#5d4037';
      ctx.fillRect(swX + 2, neckY + 5, 3, 8);
      ctx.fillStyle = '#4e342e';
      ctx.fillRect(swX + 2, neckY + 6, 3, 1);
      ctx.fillRect(swX + 2, neckY + 9, 3, 1);
      ctx.fillRect(swX + 2, neckY + 12, 3, 1);
      // Pommel
      ctx.fillStyle = '#ffd54f';
      ctx.beginPath(); ctx.arc(swX + 3.5, neckY + 14, 2, 0, Math.PI * 2); ctx.fill();
      break;
    case 'backpack':
      // Blocky backpack on back
      const bpX = creature.facing === 1 ? bodyL - 10 : bodyR + 2;
      ctx.fillStyle = '#e65100';
      ctx.fillRect(bpX, neckY - 2, 9, 14);
      ctx.fillStyle = '#ff8f00';
      ctx.fillRect(bpX + 1, neckY, 7, 10);
      // Flap
      ctx.fillStyle = '#bf360c';
      ctx.fillRect(bpX + 1, neckY, 7, 3);
      // Buckle
      ctx.fillStyle = '#ffd54f';
      ctx.fillRect(bpX + 3, neckY + 2, 3, 2);
      break;
    case 'balloon':
      // Floating balloon on a string
      const blSway = Math.sin(Date.now() / 400) * 4;
      const blX = cx + blSway;
      const blY = creature.y - 22;
      // String
      ctx.strokeStyle = '#999';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(cx, creature.y + 8);
      ctx.quadraticCurveTo(blX, blY + 14, blX, blY);
      ctx.stroke();
      // Balloon
      ctx.fillStyle = '#e53935';
      ctx.beginPath(); ctx.ellipse(blX, blY, 7, 9, 0, 0, Math.PI * 2); ctx.fill();
      // Shine
      ctx.fillStyle = 'rgba(255,255,255,0.4)';
      ctx.fillRect(blX - 3, blY - 5, 2, 3);
      break;
    case 'headphones':
      // Over-ear headphones with detail
      ctx.strokeStyle = '#2a2a2a';
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.arc(cx, creature.y + 10, 15, Math.PI + 0.25, -0.25);
      ctx.stroke();
      // Headband highlight
      ctx.strokeStyle = '#555';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(cx, creature.y + 10, 14, Math.PI + 0.3, -0.3);
      ctx.stroke();
      // Ear cups
      ctx.fillStyle = '#333';
      ctx.beginPath(); ctx.roundRect(bodyL - 4, creature.y + 17, 7, 10, 2); ctx.fill();
      ctx.beginPath(); ctx.roundRect(bodyR - 3, creature.y + 17, 7, 10, 2); ctx.fill();
      // Cushion (inner color)
      ctx.fillStyle = '#555';
      ctx.fillRect(bodyL - 2, creature.y + 19, 4, 6);
      ctx.fillRect(bodyR - 1, creature.y + 19, 4, 6);
      // LED dot
      ctx.fillStyle = '#4caf50';
      ctx.fillRect(bodyL - 3, creature.y + 25, 2, 2);
      break;
    case 'lollipop':
      // Held lollipop with swirl
      const lpDir = creature.facing;
      const lpX = lpDir === 1 ? bodyR + 4 : bodyL - 12;
      // Stick
      ctx.fillStyle = '#fff';
      ctx.fillRect(lpX + 3, creature.y + 20, 2, 16);
      // Candy circle
      const lpT = Date.now() / 800;
      ctx.fillStyle = '#e91e63';
      ctx.beginPath(); ctx.arc(lpX + 4, creature.y + 16, 6, 0, Math.PI * 2); ctx.fill();
      // Spiral
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(lpX + 4, creature.y + 16, 3, lpT, lpT + Math.PI * 1.5);
      ctx.stroke();
      ctx.strokeStyle = '#ffeb3b';
      ctx.beginPath();
      ctx.arc(lpX + 4, creature.y + 16, 1.5, lpT + 1, lpT + Math.PI + 1);
      ctx.stroke();
      break;
    case 'skateboard':
      // Skateboard carried under arm
      const sbDir2 = creature.facing;
      const sbX = sbDir2 === 1 ? bodyR - 2 : bodyL - 16;
      // Board
      ctx.fillStyle = '#795548';
      ctx.beginPath();
      ctx.roundRect(sbX, neckY + 2, 20, 4, 2);
      ctx.fill();
      // Grip tape
      ctx.fillStyle = '#333';
      ctx.fillRect(sbX + 3, neckY + 2, 14, 2);
      // Trucks
      ctx.fillStyle = '#bdbdbd';
      ctx.fillRect(sbX + 3, neckY + 6, 3, 2);
      ctx.fillRect(sbX + 14, neckY + 6, 3, 2);
      // Wheels
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(sbX + 4, neckY + 9, 2, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(sbX + 16, neckY + 9, 2, 0, Math.PI * 2); ctx.fill();
      break;
    case 'camera':
      // Hanging camera around neck
      ctx.strokeStyle = '#795548';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(cx, neckY - 6, 10, 0.3, Math.PI - 0.3);
      ctx.stroke();
      // Camera body
      ctx.fillStyle = '#37474f';
      ctx.beginPath(); ctx.roundRect(cx - 8, neckY + 2, 16, 10, 2); ctx.fill();
      // Lens
      ctx.fillStyle = '#263238';
      ctx.beginPath(); ctx.arc(cx, neckY + 7, 4, 0, Math.PI * 2); ctx.fill();
      // Lens glass
      ctx.fillStyle = '#42a5f5';
      ctx.beginPath(); ctx.arc(cx, neckY + 7, 2.5, 0, Math.PI * 2); ctx.fill();
      // Flash
      ctx.fillStyle = '#bdbdbd';
      ctx.fillRect(cx + 4, neckY + 2, 3, 3);
      // Lens shine
      ctx.fillStyle = 'rgba(255,255,255,0.4)';
      ctx.fillRect(cx - 1, neckY + 5, 1, 1);
      break;
    case 'magic':
      // Magic wand with sparkle trail
      const mDir = creature.facing;
      const mX = mDir === 1 ? bodyR + 2 : bodyL - 14;
      const mAngle = Math.sin(Date.now() / 400) * 0.15;
      ctx.save();
      ctx.translate(mX + 6, neckY + 4);
      ctx.rotate(mAngle - 0.3);
      // Wand body
      ctx.fillStyle = '#1a1a2e';
      ctx.fillRect(-1, -20, 3, 22);
      // White tip
      ctx.fillStyle = '#fff';
      ctx.fillRect(-1, -22, 3, 4);
      // Gold band
      ctx.fillStyle = '#ffd54f';
      ctx.fillRect(-2, -4, 5, 3);
      ctx.restore();
      // Sparkles around tip
      const sparkT = Date.now() / 150;
      ctx.fillStyle = '#ffd54f';
      for (let sp = 0; sp < 4; sp++) {
        const sa = sparkT + sp * 1.57;
        const sr = 4 + Math.sin(sparkT * 0.5 + sp) * 2;
        const sx = mX + 5 + Math.cos(sa) * sr;
        const sy = neckY - 18 + Math.sin(sa) * sr;
        ctx.globalAlpha = 0.5 + Math.sin(sparkT + sp) * 0.4;
        ctx.fillRect(sx, sy, 2, 2);
      }
      ctx.globalAlpha = 1;
      break;
    case 'mustache':
      // Handlebar mustache below mouth
      ctx.fillStyle = '#4e342e';
      // Center thick part
      ctx.fillRect(cx - 5, mouthY + 3, 10, 3);
      // Left curl
      ctx.fillRect(cx - 8, mouthY + 2, 4, 3);
      ctx.fillRect(cx - 10, mouthY + 1, 3, 3);
      ctx.fillRect(cx - 11, mouthY, 2, 2);
      // Right curl
      ctx.fillRect(cx + 4, mouthY + 2, 4, 3);
      ctx.fillRect(cx + 7, mouthY + 1, 3, 3);
      ctx.fillRect(cx + 9, mouthY, 2, 2);
      // Highlight
      ctx.fillStyle = '#6d4c41';
      ctx.fillRect(cx - 3, mouthY + 3, 6, 1);
      break;
  }
  ctx.restore(); // restore all ctx state (lineCap, lineWidth, strokeStyle, etc.)
}

function drawFaceStyle() {
  ctx.save(); // isolate ctx state
  const cx = creature.x + SPRITE_SIZE / 2;
  const bodyL = creature.x + 9;
  const bodyR = creature.x + 36;
  const headTop = creature.y + 12;
  const eyeY = creature.y + 21;
  const mouthY = creature.y + 28;

  switch (customization.face) {
    case 'cat':
      // Pointy ears on top of head
      ctx.fillStyle = C.body;
      // Left ear
      ctx.beginPath();
      ctx.moveTo(bodyL + 2, headTop + 2);
      ctx.lineTo(bodyL - 2, headTop - 8);
      ctx.lineTo(bodyL + 8, headTop);
      ctx.fill();
      // Right ear
      ctx.beginPath();
      ctx.moveTo(bodyR - 2, headTop + 2);
      ctx.lineTo(bodyR + 2, headTop - 8);
      ctx.lineTo(bodyR - 8, headTop);
      ctx.fill();
      // Inner ears (pink)
      ctx.fillStyle = C.cheek;
      ctx.beginPath();
      ctx.moveTo(bodyL + 3, headTop + 1);
      ctx.lineTo(bodyL, headTop - 5);
      ctx.lineTo(bodyL + 6, headTop);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(bodyR - 3, headTop + 1);
      ctx.lineTo(bodyR, headTop - 5);
      ctx.lineTo(bodyR - 6, headTop);
      ctx.fill();
      // Whiskers (3 per side)
      ctx.strokeStyle = C.outline;
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(bodyL + 2, mouthY); ctx.lineTo(bodyL - 10, mouthY - 3);
      ctx.moveTo(bodyL + 2, mouthY + 2); ctx.lineTo(bodyL - 10, mouthY + 2);
      ctx.moveTo(bodyL + 2, mouthY + 4); ctx.lineTo(bodyL - 10, mouthY + 7);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(bodyR - 2, mouthY); ctx.lineTo(bodyR + 10, mouthY - 3);
      ctx.moveTo(bodyR - 2, mouthY + 2); ctx.lineTo(bodyR + 10, mouthY + 2);
      ctx.moveTo(bodyR - 2, mouthY + 4); ctx.lineTo(bodyR + 10, mouthY + 7);
      ctx.stroke();
      break;
    case 'anime':
      // Sparkly anime eyes (drawn as extra shine dots over normal eyes)
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(creature.x + 16, eyeY + 1, 2, 2);   // left eye shine
      ctx.fillRect(creature.x + 29, eyeY + 1, 2, 2);   // right eye shine
      ctx.fillRect(creature.x + 18, eyeY + 4, 1, 1);   // left small shine
      ctx.fillRect(creature.x + 31, eyeY + 4, 1, 1);   // right small shine
      break;
    case 'sleepy':
      // Half-closed eyelids over eyes
      ctx.fillStyle = C.body;
      ctx.fillRect(creature.x + 14, eyeY - 1, 9, 4);   // left eyelid
      ctx.fillRect(creature.x + 26, eyeY - 1, 9, 4);   // right eyelid
      break;
    case 'wink':
      // Close right eye (draw body-color over it)
      ctx.fillStyle = C.body;
      ctx.fillRect(creature.x + 26, eyeY, 9, 6);
      // Wink line
      ctx.strokeStyle = C.outline;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(creature.x + 27, eyeY + 4);
      ctx.quadraticCurveTo(creature.x + 30, eyeY + 2, creature.x + 33, eyeY + 4);
      ctx.stroke();
      break;
  }
  ctx.restore(); // restore ctx state
}

// ─── CUSTOMIZE UI ───────────────────────────────────────────
const custEl = document.getElementById('customize-overlay');
let custOpen = false;

function openCustomize() {
  custOpen = true;
  // Reset to centered position
  custEl.style.left = '50%';
  custEl.style.top = '50%';
  custEl.style.transform = 'translate(-50%, -50%)';
  custEl.style.display = 'block';
  if (window.petAPI) window.petAPI.setInteractive(true);
  buildCustGrids();
  updateCustPreview();
}

function closeCustomize() {
  custOpen = false;
  custEl.style.display = 'none';
  saveCustomization();
  if (window.petAPI) window.petAPI.setInteractive(false);
}

document.getElementById('customize-close').addEventListener('click', closeCustomize);

// ─── DRAGGABLE CUSTOMIZE PANEL ──────────────────────────────
(function initCustDrag() {
  const handle = document.getElementById('cust-drag-handle');
  const panel = custEl;
  let dragging = false, offX = 0, offY = 0;

  handle.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    dragging = true;
    const rect = panel.getBoundingClientRect();
    offX = e.clientX - rect.left;
    offY = e.clientY - rect.top;
    // Switch from centered to absolute positioning on first drag
    panel.style.position = 'fixed';
    panel.style.left = rect.left + 'px';
    panel.style.top = rect.top + 'px';
    panel.style.transform = 'none';
    e.preventDefault();
    e.stopPropagation();
  });

  document.addEventListener('mousemove', (e) => {
    if (!dragging) return;
    panel.style.left = (e.clientX - offX) + 'px';
    panel.style.top = (e.clientY - offY) + 'px';
    e.preventDefault();
    e.stopPropagation();
  }, true);

  document.addEventListener('mouseup', (e) => {
    if (dragging) {
      dragging = false;
      e.stopPropagation(); // Don't trigger fling
    }
  }, true);
})();

// Tabs
document.querySelector('.cust-tabs').addEventListener('click', (e) => {
  const tab = e.target.closest('.cust-tab');
  if (!tab) return;
  document.querySelectorAll('.cust-tab').forEach(t => t.classList.remove('active'));
  tab.classList.add('active');
  document.querySelectorAll('.cust-panel').forEach(p => p.style.display = 'none');
  document.getElementById('cpanel-' + tab.dataset.tab).style.display = '';
});

function buildCustGrids() {
  // Colors
  const cg = document.getElementById('color-grid');
  cg.innerHTML = '';
  BODY_COLORS.forEach(c => {
    const el = document.createElement('div');
    el.className = 'cust-item' + (customization.color === c.id ? ' selected' : '');
    el.innerHTML = `<div class="cust-color-dot${customization.color === c.id ? ' selected' : ''}" style="background:linear-gradient(135deg, ${c.body}, ${c.dark}, ${c.body}, ${c.light}); background-size:300% 300%;"></div><span class="cust-label">${c.label}</span>`;
    el.addEventListener('click', () => {
      customization.color = c.id;
      applyColor(c.id);
      saveCustomization();
      buildCustGrids();
      updateCustPreview();
    });
    cg.appendChild(el);
  });

  // Hats
  const hg = document.getElementById('hat-grid');
  hg.innerHTML = '';
  HATS.forEach(h => {
    const el = document.createElement('div');
    el.className = 'cust-item' + (customization.hat === h.id ? ' selected' : '');
    el.innerHTML = `<span class="cust-icon">${h.icon}</span><span class="cust-label">${h.label}</span>`;
    el.addEventListener('click', () => {
      customization.hat = h.id;
      saveCustomization();
      buildCustGrids();
      updateCustPreview();
    });
    hg.appendChild(el);
  });

  // Accessories
  const ag = document.getElementById('acc-grid');
  ag.innerHTML = '';
  ACCESSORIES.forEach(a => {
    const el = document.createElement('div');
    el.className = 'cust-item' + (customization.accessory === a.id ? ' selected' : '');
    el.innerHTML = `<span class="cust-icon">${a.icon}</span><span class="cust-label">${a.label}</span>`;
    el.addEventListener('click', () => {
      customization.accessory = a.id;
      saveCustomization();
      buildCustGrids();
      updateCustPreview();
    });
    ag.appendChild(el);
  });

}

// Preview animation state (separate from creature — never touches creature object)
let _prevBlink = false;
let _prevBlinkTimer = 2000;
let _prevLookX = 0;         // -1, 0, +1 pupil offset
let _prevLookTimer = 3000;
let _prevBreathe = 0;

function updateCustPreview() {
  const pCanvas = document.getElementById('cust-preview-canvas');
  const pCtx = pCanvas.getContext('2d');
  pCtx.clearRect(0, 0, 96, 96);
  pCtx.imageSmoothingEnabled = false;

  const now = Date.now();
  const S = 4;
  const ox = 20, oy = 8;

  // Breathing bob
  _prevBreathe = Math.sin(now / 600) * 1.5;
  const bobY = Math.round(_prevBreathe);

  function ppx(gx, gy, color) {
    pCtx.fillStyle = color;
    pCtx.fillRect(ox + gx * S, oy + gy * S + bobY, S, S);
  }

  // Body blob
  for (let y = 5; y <= 12; y++)
    for (let x = 4; x <= 11; x++) ppx(x, y, C.body);
  for (let x = 3; x <= 12; x++) { ppx(x, 6, C.body); ppx(x, 11, C.body); }
  for (let x = 5; x <= 10; x++) { ppx(x, 4, C.body); ppx(x, 13, C.body); }
  for (let x = 6; x <= 9; x++) ppx(x, 3, C.body);

  // Highlight
  ppx(5, 4, C.bodyLight); ppx(6, 4, C.bodyLight); ppx(7, 3, C.bodyLight);

  // Eyes — blink + look around
  if (_prevBlink) {
    // Closed eyes (curved line)
    ppx(5, 7, C.outline); ppx(6, 7, C.outline);
    ppx(9, 7, C.outline); ppx(10, 7, C.outline);
  } else {
    // Open eyes with pupil offset
    const lx = Math.round(_prevLookX);
    ppx(5, 7, C.eye); ppx(6, 7, C.eye); ppx(5, 8, C.eye); ppx(6, 8, C.eye);
    ppx(9, 7, C.eye); ppx(10, 7, C.eye); ppx(9, 8, C.eye); ppx(10, 8, C.eye);
    // Pupils shifted by look direction
    ppx(6 + lx, 8, '#1e1e1e'); ppx(10 + lx, 8, '#1e1e1e');
  }

  // Cheeks
  ppx(4, 9, C.cheek); ppx(11, 9, C.cheek);

  // Mouth — small smile, occasionally open (yawn-like)
  const mouthOpen = Math.sin(now / 4000) > 0.92;
  if (mouthOpen) {
    ppx(7, 10, C.mouth); ppx(8, 10, C.mouth);
    ppx(7, 11, C.mouth); ppx(8, 11, C.mouth);
  } else {
    ppx(7, 10, C.mouth); ppx(8, 10, C.mouth);
    ppx(6, 9, C.mouth); ppx(9, 9, C.mouth);
  }

  // Feet (slight step animation)
  const step = Math.sin(now / 500) > 0.3 ? 0 : 1;
  ppx(5, 14 - step, C.feet); ppx(6, 14 - step, C.feet);
  ppx(10, 14 + step, C.feet); ppx(11, 14 + step, C.feet);

  // Hat preview
  if (customization.hat !== 'none') {
    const hat = HATS.find(h => h.id === customization.hat);
    if (hat) {
      pCtx.font = '18px serif';
      pCtx.textAlign = 'center';
      pCtx.fillText(hat.icon, 48, 14 + bobY);
    }
  }

  // Accessory preview
  if (customization.accessory !== 'none') {
    const acc = ACCESSORIES.find(a => a.id === customization.accessory);
    if (acc) {
      pCtx.font = '14px serif';
      pCtx.textAlign = 'left';
      pCtx.fillText(acc.icon, 72, 58 + bobY);
    }
  }
}

// Double-click on creature opens customize menu
let _lastClickTime = 0;
document.addEventListener('mousedown', (e) => {
  if (e.button !== 0) return;
  const now = Date.now();
  if (now - _lastClickTime < 350 && isOverCreature(e.clientX, e.clientY)) {
    // Double click on creature!
    _skipNextDrag = true;
    if (isDragging) { isDragging = false; setState('idle'); }
    if (!custOpen) openCustomize();
    else closeCustomize();
    e.preventDefault();
    e.stopPropagation();
  }
  _lastClickTime = now;
}, true); // capture phase to beat the drag handler

// ─── INIT ───────────────────────────────────────────────────
loadSettings();
loadStats();
loadPosition();
loadCustomization();
checkBattery();
checkHoliday();
requestAnimationFrame(gameLoop);

// Save on exit
window.addEventListener('beforeunload', () => {
  savePosition();
  saveStats();
  saveCustomization();
});
