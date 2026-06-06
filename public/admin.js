'use strict';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const POLL_INTERVAL = 1000;
const TIMER_CIRCUMFERENCE = 2 * Math.PI * 52;
const TASK_DURATION = 60;
const TEAMS = ['Blue', 'Red', 'Green', 'Yellow'];
const SCORE_OPTIONS = [4, 3, 2, 1, 0];

// ---------------------------------------------------------------------------
// Auth state
// ---------------------------------------------------------------------------
let password = localStorage.getItem('adminPassword') || '';
let lastPhase = null;

// Selected scores for current round: { Blue: null, Red: null, ... }
let selectedScores = Object.fromEntries(TEAMS.map(t => [t, null]));

// ---------------------------------------------------------------------------
// DOM refs
// ---------------------------------------------------------------------------
const taskBadge        = document.getElementById('task-badge');
const passwordInput    = document.getElementById('password-input');
const authBtn          = document.getElementById('auth-btn');
const authError        = document.getElementById('auth-error');
const taskCountInfo    = document.getElementById('task-count-info');
const startBtn         = document.getElementById('start-btn');
const taskLabel        = document.getElementById('task-label');
const timerDigits      = document.getElementById('timer-digits');
const timerProg        = document.getElementById('timer-prog');
const taskDescription  = document.getElementById('task-description');
const taskImage        = document.getElementById('task-image');
const endTaskBtn       = document.getElementById('end-task-btn');
const scoreEntryGrid   = document.getElementById('score-entry-grid');
const submitScoresBtn  = document.getElementById('submit-scores-btn');
const scoreboardRows   = document.getElementById('scoreboard-rows');
const scoreboardRound  = document.getElementById('scoreboard-round');
const nextBtn          = document.getElementById('next-btn');
const gameoverRows     = document.getElementById('gameover-rows');
const resetBtn         = document.getElementById('reset-btn');

// All phases including auth
const ALL_PHASES = ['auth', 'lobby', 'task', 'score-entry', 'scoreboard', 'game-over'];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function showPhase(phase) {
  ALL_PHASES.forEach(p => {
    const el = document.getElementById(`phase-${p}`);
    if (el) el.classList.toggle('hidden', p !== phase);
  });
  lastPhase = phase;
}

function adminHeaders() {
  return { 'Content-Type': 'application/json', 'X-Admin-Password': password };
}

async function adminPost(endpoint, body = {}) {
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: adminHeaders(),
    body: JSON.stringify(body),
  });
  if (res.status === 401) {
    password = '';
    localStorage.removeItem('adminPassword');
    showPhase('auth');
    return null;
  }
  return res.json();
}

function formatTime(ms) {
  const totalSec = Math.ceil(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function setTimer(ms) {
  const totalSec = Math.max(0, ms / 1000);
  const fraction = totalSec / TASK_DURATION;
  const offset = TIMER_CIRCUMFERENCE * (1 - fraction);

  timerProg.style.strokeDasharray  = TIMER_CIRCUMFERENCE;
  timerProg.style.strokeDashoffset = offset;

  if (fraction > 0.5)      timerProg.style.stroke = 'var(--green)';
  else if (fraction > 0.2) timerProg.style.stroke = 'var(--yellow)';
  else                     timerProg.style.stroke = 'var(--red)';

  timerDigits.textContent = formatTime(ms);
  timerDigits.classList.toggle('urgent', totalSec <= 10);
}

function buildScoreRows(container, data) {
  const { teams, totalScores, roundScores } = data;
  const sorted = [...teams].sort((a, b) => totalScores[b] - totalScores[a]);
  container.innerHTML = '';
  sorted.forEach((team, i) => {
    const row = document.createElement('div');
    row.className = `score-row${i < 3 ? ` rank-${i + 1}` : ''}`;

    const dot = document.createElement('span');
    dot.className = `team-dot team-${team}`;

    const name = document.createElement('span');
    name.className = 'team-name';
    name.textContent = team;

    const round = document.createElement('span');
    round.className = 'round-pts';
    if (roundScores) {
      const pts = roundScores[team];
      round.textContent = pts > 0 ? `+${pts} this round` : 'no points';
    }

    const total = document.createElement('span');
    total.className = 'total-pts';
    total.textContent = totalScores[team];

    row.append(dot, name, round, total);
    container.appendChild(row);
  });
}

function buildScoreEntryGrid() {
  scoreEntryGrid.innerHTML = '';
  selectedScores = Object.fromEntries(TEAMS.map(t => [t, null]));
  updateSubmitBtn();

  TEAMS.forEach(team => {
    const row = document.createElement('div');
    row.className = 'score-entry-row';

    const dot = document.createElement('span');
    dot.className = `team-dot team-${team}`;

    const label = document.createElement('span');
    label.className = 'team-label';
    label.textContent = team;

    const btns = document.createElement('div');
    btns.className = 'pts-buttons';

    SCORE_OPTIONS.forEach(pts => {
      const btn = document.createElement('button');
      btn.className = 'pts-btn';
      btn.textContent = pts;
      btn.dataset.team = team;
      btn.dataset.pts  = pts;
      btn.addEventListener('click', () => {
        // Deselect siblings
        btns.querySelectorAll('.pts-btn').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        selectedScores[team] = pts;
        updateSubmitBtn();
      });
      btns.appendChild(btn);
    });

    row.append(dot, label, btns);
    scoreEntryGrid.appendChild(row);
  });
}

function updateSubmitBtn() {
  const allSelected = TEAMS.every(t => selectedScores[t] !== null);
  submitScoresBtn.disabled = !allSelected;
}

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------
function render(data) {
  const { phase, taskNumber, totalTasks, task, timeRemaining } = data;

  // Capture previous phase before showPhase overwrites it
  const prevPhase = lastPhase;

  // Badge
  if (['task', 'score-entry', 'scoreboard'].includes(phase)) {
    taskBadge.textContent = `Task ${taskNumber} of ${totalTasks}`;
  } else {
    taskBadge.textContent = '';
  }

  showPhase(phase);

  if (phase === 'lobby') {
    taskCountInfo.textContent = `${totalTasks} task${totalTasks !== 1 ? 's' : ''} loaded.`;
  }

  if (phase === 'task') {
    taskLabel.textContent = `Task ${taskNumber}`;
    taskDescription.textContent = task.description;
    if (task.image) {
      taskImage.src = task.image;
      taskImage.classList.remove('hidden');
    } else {
      taskImage.classList.add('hidden');
    }
    setTimer(timeRemaining ?? 0);
  }

  if (phase === 'score-entry') {
    // Only rebuild the grid when we first enter this phase
    if (prevPhase !== 'score-entry') {
      buildScoreEntryGrid();
    }
  }

  if (phase === 'scoreboard') {
    scoreboardRound.textContent = taskNumber;
    buildScoreRows(scoreboardRows, data);
    // Update Next button label if this is the last task
    nextBtn.textContent = taskNumber >= totalTasks ? 'End Game' : 'Next Task';
  }

  if (phase === 'game-over') {
    buildScoreRows(gameoverRows, data);
  }
}

// ---------------------------------------------------------------------------
// Auth flow
// ---------------------------------------------------------------------------
async function tryAuth(pw) {
  const res = await fetch('/api/admin/auth', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Admin-Password': pw },
    body: JSON.stringify({}),
  });
  return res.ok;
}

authBtn.addEventListener('click', async () => {
  const pw = passwordInput.value.trim();
  if (!pw) return;
  authBtn.disabled = true;
  const ok = await tryAuth(pw);
  authBtn.disabled = false;
  if (ok) {
    password = pw;
    localStorage.setItem('adminPassword', pw);
    authError.classList.add('hidden');
    startPolling();
  } else {
    authError.classList.remove('hidden');
    passwordInput.value = '';
  }
});

passwordInput.addEventListener('keydown', e => {
  if (e.key === 'Enter') authBtn.click();
});

// ---------------------------------------------------------------------------
// Button handlers
// ---------------------------------------------------------------------------
startBtn.addEventListener('click', async () => {
  startBtn.disabled = true;
  await adminPost('/api/admin/start');
  startBtn.disabled = false;
});

endTaskBtn.addEventListener('click', async () => {
  if (!confirm('End this round early?')) return;
  endTaskBtn.disabled = true;
  await adminPost('/api/admin/end-task');
  endTaskBtn.disabled = false;
});

submitScoresBtn.addEventListener('click', async () => {
  if (TEAMS.some(t => selectedScores[t] === null)) return;
  submitScoresBtn.disabled = true;
  await adminPost('/api/admin/scores', { scores: selectedScores });
  submitScoresBtn.disabled = false;
});

nextBtn.addEventListener('click', async () => {
  nextBtn.disabled = true;
  await adminPost('/api/admin/next');
  nextBtn.disabled = false;
});

resetBtn.addEventListener('click', async () => {
  if (!confirm('Reset the entire game? This cannot be undone.')) return;
  resetBtn.disabled = true;
  await adminPost('/api/admin/reset');
  resetBtn.disabled = false;
});

// ---------------------------------------------------------------------------
// Poll loop
// ---------------------------------------------------------------------------
let polling = false;

async function poll() {
  try {
    const res = await fetch('/api/state');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    render(data);
  } catch (err) {
    console.error('Poll error:', err);
  }
}

function startPolling() {
  if (polling) return;
  polling = true;
  poll();
  setInterval(poll, POLL_INTERVAL);
}

// ---------------------------------------------------------------------------
// Bootstrap
// ---------------------------------------------------------------------------
timerProg.style.strokeDasharray  = TIMER_CIRCUMFERENCE;
timerProg.style.strokeDashoffset = 0;

if (password) {
  // Verify saved password before starting
  tryAuth(password).then(ok => {
    if (ok) {
      startPolling();
    } else {
      password = '';
      localStorage.removeItem('adminPassword');
      showPhase('auth');
    }
  });
} else {
  showPhase('auth');
}
