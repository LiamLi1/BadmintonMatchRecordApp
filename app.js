const setupCard = document.getElementById("setupCard");
const scoreCard = document.getElementById("scoreCard");
const setupForm = document.getElementById("setupForm");
const recoverMatchBtn = document.getElementById("recoverMatchBtn");
const recoverMatchHint = document.getElementById("recoverMatchHint");

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
const availableCardsList = document.getElementById("availableCardsList");
const availableCardsEmpty = document.getElementById("availableCardsEmpty");

const undoBtn = document.getElementById("undoBtn");
const addCardBtn = document.getElementById("addCardBtn");
const newRoundBtn = document.getElementById("newRoundBtn");
const resetMatchBtn = document.getElementById("resetMatchBtn");
const swapPromptModal = document.getElementById("swapPromptModal");
const swapPromptContinueBtn = document.getElementById("swapPromptContinueBtn");
const enableComebackDrawRule = document.getElementById("enableComebackDrawRule");
const comebackDrawModal = document.getElementById("comebackDrawModal");
const comebackDrawMsg = document.getElementById("comebackDrawMsg");
const comebackDrawContinueBtn = document.getElementById("comebackDrawContinueBtn");
const drawModal = document.getElementById("drawModal");
const drawDeck = document.getElementById("drawDeck");
const drawResultCard = document.getElementById("drawResultCard");
const drawResultTitle = document.getElementById("drawResultTitle");
const drawResultMeta = document.getElementById("drawResultMeta");
const drawContinueBtn = document.getElementById("drawContinueBtn");

let state = null;
let recoverySnapshot = null;
let pendingDraw = null;
let drawRevealTimer = null;
let pendingComebackDraw = null;
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
    pendingSwapPrompts: source.pendingSwapPrompts ?? 0,
    lastSwapMilestone: {
      A: source.lastSwapMilestone?.A ?? 0,
      B: source.lastSwapMilestone?.B ?? 0
    },
    comebackDrawTriggered: source.comebackDrawTriggered ?? false,
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

function isSwapPromptVisible() {
  return Boolean(swapPromptModal) && !swapPromptModal.classList.contains("hidden");
}

function isDrawModalVisible() {
  return Boolean(drawModal) && !drawModal.classList.contains("hidden");
}

function isComebackDrawVisible() {
  return Boolean(comebackDrawModal) && !comebackDrawModal.classList.contains("hidden");
}

function isBlockingOverlayVisible() {
  return isSwapPromptVisible() || isDrawModalVisible() || isComebackDrawVisible();
}

function showSwapPrompt() {
  if (!swapPromptModal) {
    return;
  }
  swapPromptModal.classList.remove("hidden");
}

function hideSwapPrompt() {
  if (!swapPromptModal) {
    return;
  }
  swapPromptModal.classList.add("hidden");
}

function showComebackDrawModal(team) {
  if (!comebackDrawModal || !comebackDrawMsg || !state) {
    return;
  }

  const teamName = team === "A" ? state.config.teamAName : state.config.teamBName;
  const otherTeam = team === "A" ? "B" : "A";
  comebackDrawMsg.textContent = `关键时刻！${teamName} 获得一次额外抽卡机会！`;
  comebackDrawModal.classList.remove("hidden");
}

function hideComebackDrawModal() {
  if (!comebackDrawModal) {
    return;
  }
  comebackDrawModal.classList.add("hidden");
}

function checkComebackDrawRule() {
  if (!state || state.comebackDrawTriggered || state.gameLocked || state.matchEnded || !state.config.enableComebackDrawRule) {
    return;
  }

  const targetPts = state.config.targetPoints;
  const ptsA = state.points.A;
  const ptsB = state.points.B;
  const diffToWinA = targetPts - ptsA;
  const diffToWinB = targetPts - ptsB;

  let triggerTeam = null;
  // A队接近获胜（差≤11分），B队严重落后（分差≥10分）-> 给B队（落后队）抽卡
  if (diffToWinA <= 11 && diffToWinA > 0 && ptsB < ptsA && (ptsA - ptsB) >= 10) {
    triggerTeam = "B";
  }
  // B队接近获胜（差≤11分），A队严重落后（分差≥10分）-> 给A队（落后队）抽卡
  else if (diffToWinB <= 11 && diffToWinB > 0 && ptsA < ptsB && (ptsB - ptsA) >= 10) {
    triggerTeam = "A";
  }

  if (triggerTeam) {
    state.comebackDrawTriggered = true;
    state.drawsLeft[triggerTeam] += 1;
    pendingComebackDraw = triggerTeam;
    showComebackDrawModal(triggerTeam);
  }
}

function clearDrawRevealTimer() {
  if (drawRevealTimer) {
    clearTimeout(drawRevealTimer);
    drawRevealTimer = null;
  }
}

function hideDrawModal() {
  if (!drawModal) {
    return;
  }

  clearDrawRevealTimer();
  drawModal.classList.add("hidden");

  if (drawDeck) {
    drawDeck.innerHTML = "";
  }

  if (drawResultCard) {
    drawResultCard.classList.add("hidden");
  }

  if (drawContinueBtn) {
    drawContinueBtn.disabled = true;
  }
}

function cardDisplayName(card) {
  const text = String(card?.text || "").trim();
  if (!text) {
    return "神秘卡";
  }

  const title = text.split("：")[0].trim();
  return title || text;
}

function showDrawModal(team, selectedIndex) {
  if (!drawModal || !drawDeck || !drawResultCard || !drawResultTitle || !drawResultMeta || !drawContinueBtn || !state || !pendingDraw) {
    return;
  }

  clearDrawRevealTimer();
  drawDeck.innerHTML = "";
  drawResultCard.classList.add("hidden");
  drawContinueBtn.disabled = true;

  const teamName = team === "A" ? state.config.teamAName : state.config.teamBName;
  const pool = state.config.cards || [];

  pool.forEach((card, idx) => {
    const cardNode = document.createElement("div");
    cardNode.className = "draw-anim-card";
    cardNode.dataset.index = String(idx);
    cardNode.style.setProperty("--dx", `${Math.floor(Math.random() * 40) - 20}px`);
    cardNode.style.setProperty("--dy", `${Math.floor(Math.random() * 24) - 12}px`);
    cardNode.style.setProperty("--rot", `${Math.floor(Math.random() * 26) - 13}deg`);
    cardNode.textContent = `${cardDisplayName(card)}`;
    drawDeck.appendChild(cardNode);
  });

  drawModal.classList.remove("hidden");

  drawRevealTimer = setTimeout(() => {
    const selectedCardNode = drawDeck.querySelector(`.draw-anim-card[data-index="${selectedIndex}"]`);
    if (selectedCardNode) {
      selectedCardNode.classList.add("selected");
    }

    const selectedCard = pendingDraw.card;
    const bonusText = selectedCard.bonusPoints > 0 ? `，自己 +${selectedCard.bonusPoints} 分` : "";
    drawResultTitle.textContent = `「${teamName}」抽到：${cardDisplayName(selectedCard)}`;
    drawResultMeta.textContent = `${selectedCard.text}（持续 ${selectedCard.durationBalls} 球${bonusText}）`;
    drawResultCard.classList.remove("hidden");
    drawContinueBtn.disabled = false;
  }, 700);
}

function commitDrawResult() {
  if (!state || !pendingDraw) {
    hideDrawModal();
    pendingDraw = null;
    return;
  }

  const { team, card } = pendingDraw;
  if (state.matchEnded || state.gameLocked || state.drawsLeft[team] <= 0 || state.activeCard[team]) {
    hideDrawModal();
    pendingDraw = null;
    render();
    return;
  }

  state.activeCard[team] = {
    text: card.text,
    durationBalls: card.durationBalls,
    bonusPoints: card.bonusPoints,
    drawnAtTotal: state.totalPointsScored
  };
  state.drawsLeft[team] -= 1;

  const teamName = team === "A" ? state.config.teamAName : state.config.teamBName;
  showToast(`「${teamName}」抽到条款：${card.text}（持续 ${card.durationBalls} 球，自己 +${card.bonusPoints} 分）`);

  hideDrawModal();
  pendingDraw = null;
  render();
}

function syncSwapPromptVisibility() {
  if (!state || state.pendingSwapPrompts <= 0) {
    hideSwapPrompt();
    return;
  }
  showSwapPrompt();
}

function acknowledgeSwapPrompt() {
  if (!state || state.pendingSwapPrompts <= 0) {
    hideSwapPrompt();
    return;
  }

  state.pendingSwapPrompts = Math.max(0, state.pendingSwapPrompts - 1);
  syncSwapPromptVisibility();
}

function checkSwapPromptTrigger() {
  if (!state) {
    return;
  }

  for (const team of ["A", "B"]) {
    const reachedMilestone = Math.floor(state.points[team] / 10);
    const lastMilestone = state.lastSwapMilestone[team];
    if (reachedMilestone > lastMilestone) {
      state.pendingSwapPrompts += reachedMilestone - lastMilestone;
      state.lastSwapMilestone[team] = reachedMilestone;
    }
  }

  syncSwapPromptVisibility();
}

function refreshRecoveryAvailability() {
  if (!recoverMatchBtn) {
    return;
  }

  const hasRecovery = Boolean(recoverySnapshot);
  const hasOngoingRecovery = hasRecovery && !recoverySnapshot.state.matchEnded;

  if (recoverMatchHint) {
    recoverMatchHint.classList.toggle("hidden", !hasOngoingRecovery);
  }

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
  if (!state || undoHistory.length === 0 || isSwapPromptVisible()) {
    return;
  }

  const previous = undoHistory.pop();
  state = previous;
  pendingDraw = null;
  hideDrawModal();
  hideComebackDrawModal();
  pendingComebackDraw = null;
  syncSwapPromptVisibility();
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
  syncSwapPromptVisibility();
  hideDrawModal();
  pendingDraw = null;

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

const DEFAULT_CARDS = [
  { text: "爆分卡：我方赢一球得两分", durationBalls: 5, bonusPoints: 1 },
  { text: "软绵绵卡：对方不能杀球，软压也不行", durationBalls: 5, bonusPoints: 0 },
  { text: "连续发球卡：无论上一轮哪方得分，我方连续发球", durationBalls: 5, bonusPoints: 0 },
  { text: "加人卡：我方任意选择加1人上场，3打2", durationBalls: 5, bonusPoints: 0 },
  { text: "发后场封印卡：对方发球只能发前场，不能发后场", durationBalls: 5, bonusPoints: 0 },
  { text: "发前场封印卡：对方发球只能发后场，不能发前场", durationBalls: 5, bonusPoints: 0 },
  { text: "明牌卡：对方击球前必须大声说出球路（高远/杀/吊/放/勾/扑/抽/挡），被抽或杀球时除外", durationBalls: 5, bonusPoints: 0 },
  { text: "空门卡：对方打来的球落在我方前场发球线之前，对方不得分", durationBalls: 5, bonusPoints: 0 },
  { text: "空城卡：对方打来的球落在我方双打后场发球线之后，对方不得分", durationBalls: 5, bonusPoints: 0 }
];

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
    const durationBalls = Number.parseInt(entry.querySelector(".card-duration-input").value, 10);
    const bonusPoints = Number.parseInt(entry.querySelector(".card-bonus-input").value, 10);
    if (text && Number.isFinite(durationBalls) && durationBalls > 0 && Number.isFinite(bonusPoints) && bonusPoints >= 0) {
      cards.push({ text, durationBalls, bonusPoints });
    }
  });
  return cards;
}

function addCardEntry(preset = {}) {
  const cardsList = document.getElementById("cardsList");
  const noHint = cardsList.querySelector(".no-cards-hint");
  if (noHint) {
    noHint.remove();
  }

  const textVal = preset.text ?? "";
  const durationVal = preset.durationBalls ?? 5;
  const bonusVal = preset.bonusPoints ?? 0;

  const entry = document.createElement("div");
  entry.className = "card-entry";
  entry.innerHTML = [
    `<input type="text" class="card-text-input" placeholder="条款内容（如：下一球必须用反手）" maxlength="80" value="${textVal.replace(/"/g, '&quot;')}">`,
    '<div class="card-entry-meta">',
    `  <span class="card-duration-wrap">持续 <input type="number" class="card-duration-input" min="1" max="999" value="${durationVal}"> 球</span>`,
    `  <span class="card-bonus-wrap">加 <input type="number" class="card-bonus-input" min="0" max="99" value="${bonusVal}"> 分</span>`,
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
    if (elapsed >= card.durationBalls) {
      state.activeCard[team] = null;
      const teamName = team === "A" ? state.config.teamAName : state.config.teamBName;
      showToast(`「${teamName}」的条款「${card.text}」已失效`);
    }
  }
}

function drawCard(team) {
  if (!state || state.matchEnded || state.gameLocked || isBlockingOverlayVisible()) {
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

  pushUndoSnapshot();

  const selectedIndex = Math.floor(Math.random() * pool.length);
  const card = pool[selectedIndex];
  pendingDraw = {
    team,
    card: { ...card }
  };

  showDrawModal(team, selectedIndex);
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

function renderAvailableCards() {
  if (!state || !availableCardsList || !availableCardsEmpty) {
    return;
  }

  const cards = state.config.cards || [];
  availableCardsList.innerHTML = "";
  availableCardsEmpty.classList.toggle("hidden", cards.length > 0);

  cards.forEach((card, index) => {
    const li = document.createElement("li");
    const bonusText = card.bonusPoints > 0 ? `，自己 +${card.bonusPoints} 分` : "";
    li.textContent = `${index + 1}. ${card.text}（持续 ${card.durationBalls} 球${bonusText}）`;
    availableCardsList.appendChild(li);
  });
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
    pendingSwapPrompts: 0,
    lastSwapMilestone: { A: 0, B: 0 },
    comebackDrawTriggered: false,
    totalPointsScored: 0,
    drawsLeft: { A: config.drawsPerTeam, B: config.drawsPerTeam },
    activeCard: { A: null, B: null }
  };

  teamALabel.textContent = config.teamAName;
  teamBLabel.textContent = config.teamBName;

  setupCard.classList.add("hidden");
  scoreCard.classList.remove("hidden");
  syncSwapPromptVisibility();
  hideDrawModal();
  pendingDraw = null;

  render();
  refreshLandscapeMode();
}

function render() {
  if (!state) {
    return;
  }

  renderAvailableCards();

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
    const scoreBtn = document.querySelector(`.score-btn[data-team="${team}"]`);
    const activeCard = state.activeCard[team];

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

    if (scoreBtn) {
      const bonus = activeCard ? activeCard.bonusPoints : 0;
      const totalPoints = 1 + bonus;
      scoreBtn.textContent = `+${totalPoints} 分`;
    }

    if (cardWrap && cardText && cardTimer) {
      if (activeCard) {
        const elapsed = state.totalPointsScored - activeCard.drawnAtTotal;
        const remaining = Math.max(0, activeCard.durationBalls - elapsed);
        cardText.textContent =
          activeCard.bonusPoints > 0
            ? `${activeCard.text}（自己 +${activeCard.bonusPoints} 分）`
            : activeCard.text;
        cardTimer.textContent = `还剩 ${remaining} 球`;
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
  if (!state || state.gameLocked || state.matchEnded || isBlockingOverlayVisible()) {
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
  checkSwapPromptTrigger();
  checkComebackDrawRule();
  render();
}

function getScoreDelta(team) {
  const activeCard = state?.activeCard?.[team];
  return 1 + (activeCard ? activeCard.bonusPoints : 0);
}

function startNextRound() {
  if (!state || !state.gameLocked || state.matchEnded || isBlockingOverlayVisible()) {
    return;
  }

  pushUndoSnapshot();

  state.currentGame += 1;
  state.points.A = 0;
  state.points.B = 0;
  state.gameLocked = false;
  state.pendingSwapPrompts = 0;
  state.lastSwapMilestone.A = 0;
  state.lastSwapMilestone.B = 0;
  state.comebackDrawTriggered = false;
  state.drawsLeft.A = state.config.drawsPerTeam;
  state.drawsLeft.B = state.config.drawsPerTeam;
  state.activeCard.A = null;
  state.activeCard.B = null;

  syncSwapPromptVisibility();
  hideComebackDrawModal();
  pendingComebackDraw = null;
  render();
}

function resetMatch() {
  if (isBlockingOverlayVisible()) {
    return;
  }

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

  inputTargetPoints.value = "101";
  inputTotalGames.value = "3";
  inputTeamAName.value = "蓝队";
  inputTeamBName.value = "红队";
  document.getElementById("drawsPerTeam").value = "10";

  if (undoMeta) {
    undoMeta.textContent = `回撤步数：0 / ${maxUndoSteps}`;
  }
  undoBtn.disabled = true;

  refreshRecoveryAvailability();
  syncSwapPromptVisibility();
  hideDrawModal();
  hideComebackDrawModal();
  pendingDraw = null;
  pendingComebackDraw = null;

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
  const ruleEnabled = enableComebackDrawRule ? enableComebackDrawRule.checked : false;

  const config = {
    targetPoints,
    totalGames,
    teamAName: sanitizeName(inputTeamAName.value, "蓝队"),
    teamBName: sanitizeName(inputTeamBName.value, "红队"),
    drawsPerTeam,
    enableComebackDrawRule: ruleEnabled,
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

    updatePoints(team, getScoreDelta(team));
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
  addCardBtn.addEventListener("click", () => addCardEntry());
}

DEFAULT_CARDS.forEach((card) => addCardEntry(card));
newRoundBtn.addEventListener("click", startNextRound);
resetMatchBtn.addEventListener("click", resetMatch);

if (swapPromptContinueBtn) {
  swapPromptContinueBtn.addEventListener("click", acknowledgeSwapPrompt);
}

if (comebackDrawContinueBtn) {
  comebackDrawContinueBtn.addEventListener("click", () => {
    hideComebackDrawModal();
    pendingComebackDraw = null;
    render();
  });
}

if (drawContinueBtn) {
  drawContinueBtn.addEventListener("click", commitDrawResult);
}

if (typeof landscapeModeQuery.addEventListener === "function") {
  landscapeModeQuery.addEventListener("change", refreshLandscapeMode);
} else if (typeof landscapeModeQuery.addListener === "function") {
  landscapeModeQuery.addListener(refreshLandscapeMode);
}

// Safety guard: never persist scoring state outside memory.
window.addEventListener("beforeunload", () => {
  state = null;
  recoverySnapshot = null;
  pendingDraw = null;
  pendingComebackDraw = null;
  clearDrawRevealTimer();
});

refreshRecoveryAvailability();
