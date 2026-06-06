'use strict';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const POLL_INTERVAL = 1000; // ms
const TIMER_CIRCUMFERENCE = 2 * Math.PI * 52; // matches SVG r="52"
const TASK_DURATION = 60;   // seconds

// ---------------------------------------------------------------------------
// DOM refs
// ---------------------------------------------------------------------------
const taskBadge       = document.getElementById('task-badge');
const timerDigits     = document.getElementById('timer-digits');
const timerProg       = document.getElementById('timer-prog');
const taskLabel       = document.getElementById('task-label');
const taskDescription = document.getElementById('task-description');
const taskImage       = document.getElementById('task-image');
const scoreboardRows  = document.getElementById('scoreboard-rows');
const gameoverRows    = document.getElementById('gameover-rows');

const phases = ['lobby', 'task', 'score-entry', 'scoreboard', 'game-over'];

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
let currentPhase = null;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function showPhase(phase) {
  phases.forEach(p => {
    const el = document.getElementById(`phase-${p}`);
    if (el) el.classList.toggle('hidden', p !== phase);
  });
  currentPhase = phase;
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

  // Colour shift: green → yellow → red
  if (fraction > 0.5)      timerProg.style.stroke = 'var(--green)';
  else if (fraction > 0.2) timerProg.style.stroke = 'var(--yellow)';
  else                     timerProg.style.stroke = 'var(--red)';

  const text = formatTime(ms);
  timerDigits.textContent = text;
  timerDigits.classList.toggle('urgent', totalSec <= 10);
}

const TEAM_COLORS = {
  Blue: 'var(--blue)', Red: 'var(--red)',
  Green: 'var(--green)', Yellow: 'var(--yellow)',
};

function buildScoreRows(container, data) {
  const { teams, totalScores, roundScores } = data;

  // Sort by total descending
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

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------
function render(data) {
  const { phase, taskNumber, totalTasks, task, timeRemaining } = data;

  // Badge
  if (phase === 'task' || phase === 'score-entry' || phase === 'scoreboard') {
    taskBadge.textContent = `Task ${taskNumber} of ${totalTasks}`;
  } else {
    taskBadge.textContent = '';
  }

  showPhase(phase);

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

  if (phase === 'scoreboard') {
    buildScoreRows(scoreboardRows, data);
  }

  if (phase === 'game-over') {
    buildScoreRows(gameoverRows, data);
  }
}

// ---------------------------------------------------------------------------
// Poll loop
// ---------------------------------------------------------------------------
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

// Initialise SVG ring
timerProg.style.strokeDasharray  = TIMER_CIRCUMFERENCE;
timerProg.style.strokeDashoffset = 0;

poll();
setInterval(poll, POLL_INTERVAL);
