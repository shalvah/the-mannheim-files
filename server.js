'use strict';

const express = require('express');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'mannheim';
const TASK_DURATION_MS = 60 * 1000;

// ---------------------------------------------------------------------------
// Load tasks
// ---------------------------------------------------------------------------
const tasksPath = path.join(__dirname, 'data', 'tasks.json');
const TASKS = JSON.parse(fs.readFileSync(tasksPath, 'utf8'));

// ---------------------------------------------------------------------------
// Game state
// ---------------------------------------------------------------------------
const TEAMS = ['Blue', 'Red', 'Green', 'Yellow'];

function makeScores() {
  return Object.fromEntries(TEAMS.map(t => [t, 0]));
}

let state = {
  // lobby | task | score-entry | scoreboard | game-over
  phase: 'lobby',
  currentTaskIndex: -1,
  taskStartTime: null,      // ms timestamp
  roundScores: null,        // scores awarded this round
  totalScores: makeScores(),
};

// Auto-transition: task → score-entry once the timer expires.
// Checked on every /api/state poll so no setInterval needed.
function maybeExpireTask() {
  if (state.phase === 'task' && state.taskStartTime !== null) {
    const elapsed = Date.now() - state.taskStartTime;
    if (elapsed >= TASK_DURATION_MS) {
      state.phase = 'score-entry';
    }
  }
}

function getPublicState() {
  maybeExpireTask();
  const task = state.currentTaskIndex >= 0 ? TASKS[state.currentTaskIndex] : null;
  const timeRemaining =
    state.phase === 'task' && state.taskStartTime
      ? Math.max(0, TASK_DURATION_MS - (Date.now() - state.taskStartTime))
      : null;

  return {
    phase: state.phase,
    taskIndex: state.currentTaskIndex,
    taskNumber: state.currentTaskIndex + 1,
    totalTasks: TASKS.length,
    task,
    timeRemaining,       // ms
    roundScores: state.roundScores,
    totalScores: state.totalScores,
    teams: TEAMS,
  };
}

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public'), {
  setHeaders(res, filePath) {
    if (filePath.endsWith('.js')) {
      res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
    }
  },
}));

function requireAdmin(req, res, next) {
  const pw = req.headers['x-admin-password'] || req.body?.password;
  if (pw !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------
app.get('/api/state', (req, res) => {
  res.json(getPublicState());
});

// ---------------------------------------------------------------------------
// Admin API
// ---------------------------------------------------------------------------

// Verify password
app.post('/api/admin/auth', requireAdmin, (req, res) => {
  res.json({ ok: true });
});

// Start the game (goes to first task)
app.post('/api/admin/start', requireAdmin, (req, res) => {
  if (state.phase !== 'lobby') {
    return res.status(400).json({ error: 'Game already started' });
  }
  state.phase = 'task';
  state.currentTaskIndex = 0;
  state.taskStartTime = Date.now();
  state.roundScores = null;
  res.json(getPublicState());
});

// End current task early (task → score-entry)
app.post('/api/admin/end-task', requireAdmin, (req, res) => {
  if (state.phase !== 'task') {
    return res.status(400).json({ error: 'Not in task phase' });
  }
  state.phase = 'score-entry';
  res.json(getPublicState());
});

// Submit scores for the current round
app.post('/api/admin/scores', requireAdmin, (req, res) => {
  if (state.phase !== 'score-entry') {
    return res.status(400).json({ error: 'Not in score-entry phase' });
  }
  const { scores } = req.body; // { Blue: 4, Red: 3, Green: 0, Yellow: 1 }
  if (!scores || typeof scores !== 'object') {
    return res.status(400).json({ error: 'Missing scores object' });
  }
  const valid = [0, 1, 2, 3, 4];
  for (const team of TEAMS) {
    const v = Number(scores[team]);
    if (!valid.includes(v)) {
      return res.status(400).json({ error: `Invalid score for ${team}: ${scores[team]}` });
    }
    state.totalScores[team] += v;
  }
  state.roundScores = Object.fromEntries(TEAMS.map(t => [t, Number(scores[t])]));
  state.phase = 'scoreboard';
  res.json(getPublicState());
});

// Advance to next task (or game-over)
app.post('/api/admin/next', requireAdmin, (req, res) => {
  if (state.phase !== 'scoreboard') {
    return res.status(400).json({ error: 'Not in scoreboard phase' });
  }
  const nextIndex = state.currentTaskIndex + 1;
  if (nextIndex >= TASKS.length) {
    state.phase = 'game-over';
  } else {
    state.phase = 'task';
    state.currentTaskIndex = nextIndex;
    state.taskStartTime = Date.now();
    state.roundScores = null;
  }
  res.json(getPublicState());
});

// Reset game back to lobby
app.post('/api/admin/reset', requireAdmin, (req, res) => {
  state = {
    phase: 'lobby',
    currentTaskIndex: -1,
    taskStartTime: null,
    roundScores: null,
    totalScores: makeScores(),
  };
  res.json(getPublicState());
});

// ---------------------------------------------------------------------------
// Serve admin page
// ---------------------------------------------------------------------------
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------
app.listen(PORT, () => {
  console.log(`The Mannheim Files running on http://localhost:${PORT}`);
  console.log(`Admin panel: http://localhost:${PORT}/admin`);
  console.log(`Admin password: ${ADMIN_PASSWORD}`);
});
