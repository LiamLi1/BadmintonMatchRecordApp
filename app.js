const setupCard = document.getElementById("setupCard");
const scoreCard = document.getElementById("scoreCard");
const setupForm = document.getElementById("setupForm");
const recoverMatchBtn = document.getElementById("recoverMatchBtn");

const inputTargetPoints = document.getElementById("targetPoints");
const inputTotalGames = document.getElementById("totalGames");
const inputTeamAName = document.getElementById("teamAName");
const inputTeamBName = document.getElementById("teamBName");

const teamALabel = document.getElementById("teamALabel");
const teamBLabel = document.getElementById("teamBLabel");
const teamAPoints = document.getElementById("teamAPoints");
const teamBPoints = document.getElementById("teamBPoints");
const teamAWins = document.getElementById("teamAWins");
const teamBWins = document.getElementById("teamBWins");
const matchMeta = document.getElementById("matchMeta");
const statusText = document.getElementById("statusText");
const landscapeHint = document.getElementById("landscapeHint");
const undoMeta = document.getElementById("undoMeta");
const toastContainer = document.getElementById("toastContainer");

const undoBtn = document.getElementById("undoBtn");
const addCardBtn = document.getElementById("addCardBtn");
const newRoundBtn = document.getElementById("newRoundBtn");
const resetMatchBtn = document.getElementById("resetMatchBtn");

let state = null;
let recoverySnapshot = null;
const undoHistory = [];
const maxUndoSteps = 5;
const landscapeModeQuery = window.matchMedia("(orientation: landscape) and (max-height: 560px) and (max-width: 980px)");

function cloneState(source) {
  return {
    config: { ...source.config, cards: source.config.cards.map((c) => ({ ...c })) },
    currentGame: source.currentGame,
    points: { ...source.points },
    wins: { ...source.wins },
    gameLocked: source.gameLocked,
    matchEnded: source.matchEnded,
    totalPointsScored: source.totalPointsScored,
    drawsLeft: { ...source.drawsLeft },
    activeCard: {
      A: source.activeCard.A ? { ...source.activeCard.A } : null,
      B: source.activeCard.B ? { ...source.activeCard.B } : null
    }
  };
}

function cloneUndoHistory(source) {
  return source.map((snapshot) => cloneState(snapshot));
}

function refreshRecoveryAvailability() {
  if (!recoverMatchBtn) {
    return;
  }

  const hasRecovery = Boolean(recoverySnapshot);
  recoverMatchBtn.classList.toggle("hidden", !hasRecovery);
  recoverMatchBtn.disabled = !hasRecovery;
}

function pushUndoSnapshot() {
  if (!state) {
    return;
  }

  undoHistory.push(cloneState(state));
  if (undoHistory.length > maxUndoSteps) {
    undoHistory.shift();
  }
}

function undoLastStep() {
  if (!state || undoHistory.length === 0) {
    return;
  }

  const previous = undoHistory.pop();
  state = previous;
  render();
  refreshLandscapeMode();
}

function restoreRecoveredMatch() {
  if (!recoverySnapshot) {
    return;
  }

  state = cloneState(recoverySnapshot.state);
  undoHistory.length = 0;
  cloneUndoHistory(recoverySnapshot.undoHistory)
    .slice(-maxUndoSteps)
    .forEach((snapshot) => undoHistory.push(snapshot));

  recoverySnapshot = null;
  refreshRecoveryAvailability();

  teamALabel.textContent = state.config.teamAName;
  teamBLabel.textContent = state.config.teamBName;

  setupCard.classList.add("hidden");
  scoreCard.classList.remove("hidden");

  render();
  refreshLandscapeMode();
}

function refreshLandscapeMode() {
  const isActiveMatch = Boolean(state);
  const enableLandscapeMode = isActiveMatch && landscapeModeQuery.matches;

  document.body.classList.toggle("landscape-score-mode", enableLandscapeMode);
  document.body.classList.toggle("match-active", isActiveMatch);

  if (landscapeHint) {
    landscapeHint.classList.toggle("hidden", !enableLandscapeMode);
  }
}

function sanitizeName(name, fallback) {
  const trimmed = String(name || "").trim();
  return trimmed || fallback;
}

function gamesToWin(totalGames) {
  return Math.floor(totalGames / 2) + 1;
}

function collectCards() {
  const entries = document.querySelectorAll(".card-entry");
  const cards = [];
  entries.forEach((entry) => {
    const text = entry.querySelector(".card-text-input").value.trim();
    const duration = Number.parseInt(entry.querySelector(".card-duration-input").value, 10);
    if (text && Number.isFinite(duration) && duration > 0) {
      cards.push({ text, duration });
    }
  });
  return cards;
}

function addCardEntry() {
  const cardsList = document.getElementById("cardsList");
  const noHint = cardsList.querySelector(".no-cards-hint");
  if (noHint) {
    noHint.remove();
  }

  const entry = document.createElement("div");
  entry.className = "card-entry";
  entry.innerHTML = [
    '<input type="text" class="card-text-input" placeholder="条款内容（如：下一球必须用反手）" maxlength="80">',
    '<div class="card-entry-meta">',
    '  <span class="card-duration-wrap">持续 <input type="number" class="card-duration-input" min="1" max="999" value="5"> 分</span>',
    '  <button type="button" class="btn tertiary compact card-remove-btn" aria-label="删除">✕</button>',
    '</div>'
  ].join("");

  entry.querySelector(".card-remove-btn").addEventListener("click", () => {
    entry.remove();
    if (cardsList.querySelectorAll(".card-entry").length === 0) {
      const hint = document.createElement("p");
      hint.className = "no-cards-hint";
      hint.textContent = "暂无条款，点击「添加条款」开始设置";
      cardsList.appendChild(hint);
    }
  });

  cardsList.appendChild(entry);
}

function checkCardExpiry() {
  if (!state) {
    return;
  }

  for (const team of ["A", "B"]) {
    const card = state.activeCard[team];
    if (!card) {
      continue;
    }

    const elapsed = state.totalPointsScored - card.drawnAtTotal;
    if (elapsed >= card.duration) {
      state.activeCard[team] = null;
      const teamName = team === "A" ? state.config.teamAName : state.config.teamBName;
      showToast(`「${teamName}」的条款「${card.text}」已失效`);
    }
  }
}

function drawCard(team) {
  if (!state || state.matchEnded || state.gameLocked) {
    return;
  }

  if (state.activeCard[team]) {
    return;
  }

  if (state.drawsLeft[team] <= 0) {
    return;
  }

  const pool = state.config.cards;
  if (!pool || pool.length === 0) {
    return;
  }

  const card = pool[Math.floor(Math.random() * pool.length)];
  state.activeCard[team] = {
    text: card.text,
    duration: card.duration,
    drawnAtTotal: state.totalPointsScored
  };
  state.drawsLeft[team] -= 1;

  const teamName = team === "A" ? state.config.teamAName : state.config.teamBName;
  showToast(`「${teamName}」抽到条款：${card.text}（持续 ${card.duration} 分）`);
  render();
}

function showToast(msg) {
  if (!toastContainer) {
    return;
  }

  const toast = document.createElement("div");
  toast.className = "toast";
  toast.textContent = msg;
  toastContainer.appendChild(toast);

  setTimeout(() => {
    toast.classList.add("toast-hide");
    setTimeout(() => toast.remove(), 400);
  }, 3200);
}

function startMatch(config) {
  recoverySnapshot = null;
  refreshRecoveryAvailability();
  undoHistory.length = 0;
  state = {
    config,
    currentGame: 1,
    points: { A: 0, B: 0 },
    wins: { A: 0, B: 0 },
    gameLocked: false,
    matchEnded: false,
    totalPointsScored: 0,
    drawsLeft: { A: config.drawsPerTeam, B: config.drawsPerTeam },
    activeCard: { A: null, B: null }
  };

  teamALabel.textContent = config.teamAName;
  teamBLabel.textContent = config.teamBName;

  setupCard.classList.add("hidden");
  scoreCard.classList.remove("hidden");

  render();
  refreshLandscapeMode();
}

function render() {
  if (!state) {
    return;
  }

  teamAPoints.textContent = String(state.points.A);
  teamBPoints.textContent = String(state.points.B);
  teamAWins.textContent = String(state.wins.A);
  teamBWins.textContent = String(state.wins.B);

  const needWins = gamesToWin(state.config.totalGames);
  matchMeta.textContent = `第 ${state.currentGame} / ${state.config.totalGames} 局 · 每局 ${state.config.targetPoints} 分 · 先赢 ${needWins} 局获胜`;

  if (state.matchEnded) {
    statusText.classList.add("alert");
    const champ = state.wins.A > state.wins.B ? state.config.teamAName : state.config.teamBName;
    statusText.textContent = `比赛结束：${champ} 获胜`;
  } else if (state.gameLocked) {
    statusText.classList.remove("alert");
    statusText.textContent = "本局已结束，请开始下一局";
  } else if (state.points.A >= state.config.targetPoints && state.points.B >= state.config.targetPoints) {
    statusText.classList.remove("alert");
    statusText.textContent = "加分阶段：需领先 2 分才能赢下本局";
  } else {
    statusText.classList.remove("alert");
    statusText.textContent = "比赛进行中";
  }

  newRoundBtn.disabled = !state.gameLocked || state.matchEnded;
  undoBtn.disabled = undoHistory.length === 0;

  if (undoMeta) {
    undoMeta.textContent = `回撤步数：${undoHistory.length} / ${maxUndoSteps}`;
  }

  document.querySelectorAll(".score-btn").forEach((btn) => {
    btn.disabled = state.gameLocked || state.matchEnded;
  });

  for (const team of ["A", "B"]) {
    const drawBtn = document.getElementById(`drawBtn${team}`);
    const cardWrap = document.getElementById(`team${team}CardWrap`);
    const cardText = document.getElementById(`team${team}CardText`);
    const cardTimer = document.getElementById(`team${team}CardTimer`);

    if (drawBtn) {
      const hasCards = state.config.cards.length > 0;
      const canDraw =
        hasCards &&
        state.drawsLeft[team] > 0 &&
        !state.activeCard[team] &&
        !state.gameLocked &&
        !state.matchEnded;
      drawBtn.disabled = !canDraw;
      drawBtn.textContent =
        state.drawsLeft[team] > 0
          ? `抽卡（剩 ${state.drawsLeft[team]} 次）`
          : "抽卡（已用完）";
      const showDraw = state.config.drawsPerTeam > 0 && hasCards;
      drawBtn.classList.toggle("hidden", !showDraw);
    }

    if (cardWrap && cardText && cardTimer) {
      const card = state.activeCard[team];
      if (card) {
        const elapsed = state.totalPointsScored - card.drawnAtTotal;
        const remaining = Math.max(0, card.duration - elapsed);
        cardText.textContent = card.text;
        cardTimer.textContent = `还剩 ${remaining} 分`;
        cardWrap.classList.remove("hidden");
      } else {
        cardWrap.classList.add("hidden");
      }
    }
  }
}

function checkRoundWinner() {
  if (!state || state.gameLocked || state.matchEnded) {
    return;
  }

  const target = state.config.targetPoints;
  if (state.points.A < target && state.points.B < target) {
    return;
  }

  const diff = Math.abs(state.points.A - state.points.B);
  if (diff < 2) {
    return;
  }

  const winner = state.points.A > state.points.B ? "A" : "B";
  state.wins[winner] += 1;
  state.gameLocked = true;

  const winnerName = winner === "A" ? state.config.teamAName : state.config.teamBName;
  const needWins = gamesToWin(state.config.totalGames);

  if (state.wins[winner] >= needWins || state.currentGame >= state.config.totalGames) {
    state.matchEnded = true;
    statusText.classList.add("alert");
    statusText.textContent = `本局胜者：${winnerName}。比赛结束。`;
  } else {
    statusText.classList.remove("alert");
    statusText.textContent = `本局胜者：${winnerName}`;
  }
}

function updatePoints(team, delta) {
  if (!state || state.gameLocked || state.matchEnded) {
    return;
  }

  pushUndoSnapshot();

  const next = state.points[team] + delta;
  state.points[team] = Math.max(0, next);

  if (delta > 0) {
    state.totalPointsScored += 1;
    checkCardExpiry();
  }

  checkRoundWinner();
  render();
}

function startNextRound() {
  if (!state || !state.gameLocked || state.matchEnded) {
    return;
  }

  pushUndoSnapshot();

  state.currentGame += 1;
  state.points.A = 0;
  state.points.B = 0;
  state.gameLocked = false;
  state.drawsLeft.A = state.config.drawsPerTeam;
  state.drawsLeft.B = state.config.drawsPerTeam;
  state.activeCard.A = null;
  state.activeCard.B = null;

  render();
}

function resetMatch() {
  if (state) {
    recoverySnapshot = {
      state: cloneState(state),
      undoHistory: cloneUndoHistory(undoHistory)
    };
  }

  state = null;
  undoHistory.length = 0;
  setupCard.classList.remove("hidden");
  scoreCard.classList.add("hidden");
  setupForm.reset();

  inputTargetPoints.value = "21";
  inputTotalGames.value = "3";
  inputTeamAName.value = "A队";
  inputTeamBName.value = "B队";

  if (undoMeta) {
    undoMeta.textContent = `回撤步数：0 / ${maxUndoSteps}`;
  }
  undoBtn.disabled = true;

  refreshRecoveryAvailability();

  refreshLandscapeMode();
}

setupForm.addEventListener("submit", (event) => {
  event.preventDefault();

  const targetPoints = Number.parseInt(inputTargetPoints.value, 10);
  const totalGames = Number.parseInt(inputTotalGames.value, 10);

  if (!Number.isFinite(targetPoints) || targetPoints <= 0) {
    inputTargetPoints.focus();
    return;
  }

  if (!Number.isFinite(totalGames) || totalGames <= 0) {
    inputTotalGames.focus();
    return;
  }

  const rawDraws = Number.parseInt(document.getElementById("drawsPerTeam").value, 10);
  const drawsPerTeam = Number.isFinite(rawDraws) && rawDraws >= 0 ? rawDraws : 0;

  const config = {
    targetPoints,
    totalGames,
    teamAName: sanitizeName(inputTeamAName.value, "A队"),
    teamBName: sanitizeName(inputTeamBName.value, "B队"),
    drawsPerTeam,
    cards: collectCards()
  };

  startMatch(config);
});

document.querySelectorAll(".score-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    const team = btn.getAttribute("data-team");

    if (team !== "A" && team !== "B") {
      return;
    }

    updatePoints(team, 1);
  });
});

undoBtn.addEventListener("click", undoLastStep);
recoverMatchBtn.addEventListener("click", restoreRecoveredMatch);

document.querySelectorAll(".draw-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    const team = btn.getAttribute("data-team");
    if (team === "A" || team === "B") {
      drawCard(team);
    }
  });
});

if (addCardBtn) {
  addCardBtn.addEventListener("click", addCardEntry);
}
newRoundBtn.addEventListener("click", startNextRound);
resetMatchBtn.addEventListener("click", resetMatch);

if (typeof landscapeModeQuery.addEventListener === "function") {
  landscapeModeQuery.addEventListener("change", refreshLandscapeMode);
} else if (typeof landscapeModeQuery.addListener === "function") {
  landscapeModeQuery.addListener(refreshLandscapeMode);
}

// Safety guard: never persist scoring state outside memory.
window.addEventListener("beforeunload", () => {
  state = null;
  recoverySnapshot = null;
});

refreshRecoveryAvailability();
