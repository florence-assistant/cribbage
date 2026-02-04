// ═══════════════════════════════════════════════════════════
//  CRIBBAGE — game.js
//  Complete 2-player cribbage: human vs AI
// ═══════════════════════════════════════════════════════════

'use strict';

// ── Constants ────────────────────────────────────────────
const SUITS = ['♠','♥','♦','♣'];
const RANKS = ['A','2','3','4','5','6','7','8','9','10','J','Q','K'];
const RANK_VALUES = { A:1,2:2,3:3,4:4,5:5,6:6,7:7,8:8,9:9,10:10,J:10,Q:10,K:10 };
const RANK_ORDER  = { A:1,2:2,3:3,4:4,5:5,6:6,7:7,8:8,9:9,10:10,J:11,Q:12,K:13 };
const WIN_SCORE = 121;

// ── Card helpers ─────────────────────────────────────────
function makeCard(rank, suit) {
  return { rank, suit, value: RANK_VALUES[rank], order: RANK_ORDER[rank] };
}

function cardId(c) { return c.rank + c.suit; }
function cardName(c) { return c.rank + c.suit; }
function isRed(c) { return c.suit === '♥' || c.suit === '♦'; }

function makeDeck() {
  const d = [];
  for (const s of SUITS) for (const r of RANKS) d.push(makeCard(r, s));
  return d;
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function sortHand(hand) {
  return [...hand].sort((a, b) => a.order - b.order || SUITS.indexOf(a.suit) - SUITS.indexOf(b.suit));
}

// ── Scoring Engine ───────────────────────────────────────

function combinations(arr, k) {
  if (k === 0) return [[]];
  if (arr.length < k) return [];
  const [first, ...rest] = arr;
  const withFirst = combinations(rest, k - 1).map(c => [first, ...c]);
  const without   = combinations(rest, k);
  return [...withFirst, ...without];
}

/**
 * Score a hand (4 cards) + starter. isCrib = true for crib scoring.
 * Returns { total, details: [{desc, points}] }
 */
function scoreHand(hand, starter, isCrib = false) {
  const all = [...hand, starter];
  const details = [];
  let total = 0;

  // --- Fifteens ---
  for (let size = 2; size <= 5; size++) {
    for (const combo of combinations(all, size)) {
      if (combo.reduce((s, c) => s + c.value, 0) === 15) {
        details.push({ desc: `15: ${combo.map(cardName).join(' + ')}`, points: 2 });
        total += 2;
      }
    }
  }

  // --- Pairs ---
  for (const [a, b] of combinations(all, 2)) {
    if (a.rank === b.rank) {
      details.push({ desc: `Pair: ${cardName(a)}, ${cardName(b)}`, points: 2 });
      total += 2;
    }
  }

  // --- Runs (find longest runs, then all combos of that length) ---
  let bestRunLen = 0;
  let runCombos = [];
  for (let len = 5; len >= 3; len--) {
    for (const combo of combinations(all, len)) {
      const sorted = combo.map(c => c.order).sort((a, b) => a - b);
      let isRun = true;
      for (let i = 1; i < sorted.length; i++) {
        if (sorted[i] !== sorted[i - 1] + 1) { isRun = false; break; }
      }
      if (isRun) {
        if (len > bestRunLen) { bestRunLen = len; runCombos = []; }
        if (len === bestRunLen) runCombos.push(combo);
      }
    }
  }
  for (const combo of runCombos) {
    const sorted = sortHand(combo);
    details.push({ desc: `Run of ${combo.length}: ${sorted.map(cardName).join(' ')}`, points: combo.length });
    total += combo.length;
  }

  // --- Flush ---
  const handSuits = hand.map(c => c.suit);
  if (handSuits.every(s => s === handSuits[0])) {
    if (starter.suit === handSuits[0]) {
      details.push({ desc: `Flush: 5 cards (${handSuits[0]})`, points: 5 });
      total += 5;
    } else if (!isCrib) {
      details.push({ desc: `Flush: 4 cards (${handSuits[0]})`, points: 4 });
      total += 4;
    }
  }

  // --- Nobs (jack in hand matching starter suit) ---
  for (const c of hand) {
    if (c.rank === 'J' && c.suit === starter.suit) {
      details.push({ desc: `Nobs: ${cardName(c)}`, points: 1 });
      total += 1;
    }
  }

  return { total, details };
}

// ── Pegging Scoring ──────────────────────────────────────

/**
 * Score the pegging play stack after a card is played.
 * Does NOT score 31 or go — those are handled by game flow.
 * Returns { points, details[] }
 */
function scorePeg(stack, count) {
  const details = [];
  let points = 0;
  if (stack.length === 0) return { points: 0, details: [] };

  // 15
  if (count === 15) { points += 2; details.push({ desc: 'Fifteen', points: 2 }); }
  // 31
  if (count === 31) { points += 2; details.push({ desc: 'Thirty-one', points: 2 }); }

  // Pairs from the end
  const lastRank = stack[stack.length - 1].rank;
  let pairCount = 0;
  for (let i = stack.length - 1; i >= 0; i--) {
    if (stack[i].rank === lastRank) pairCount++;
    else break;
  }
  if (pairCount === 2) { points += 2; details.push({ desc: 'Pair', points: 2 }); }
  if (pairCount === 3) { points += 6; details.push({ desc: 'Three of a kind', points: 6 }); }
  if (pairCount === 4) { points += 12; details.push({ desc: 'Four of a kind', points: 12 }); }

  // Runs — check last N cards
  if (stack.length >= 3 && pairCount < 2) {
    // Only check runs if last cards aren't a pair (pairs break runs in pegging)
    for (let len = stack.length; len >= 3; len--) {
      const tail = stack.slice(stack.length - len);
      const sorted = tail.map(c => c.order).sort((a, b) => a - b);
      let isRun = true;
      for (let i = 1; i < sorted.length; i++) {
        if (sorted[i] !== sorted[i - 1] + 1) { isRun = false; break; }
      }
      if (isRun) {
        points += len;
        details.push({ desc: `Run of ${len}`, points: len });
        break;
      }
    }
  }

  return { points, details };
}

// ── AI Logic ─────────────────────────────────────────────

/** AI picks 2 cards to discard to crib. isAiCrib = true if AI owns the crib. */
function aiDiscard(hand, isAiCrib) {
  let bestScore = -Infinity;
  let bestDiscard = [0, 1];

  const testStarters = [
    makeCard('A','♠'), makeCard('2','♥'), makeCard('4','♦'),
    makeCard('5','♣'), makeCard('7','♠'), makeCard('9','♥'),
    makeCard('10','♦'), makeCard('J','♣'), makeCard('K','♠')
  ];

  for (const [i, j] of combinations([0,1,2,3,4,5], 2)) {
    const kept = hand.filter((_, idx) => idx !== i && idx !== j);
    let score = 0;

    // Evaluate kept hand against sample starters
    for (const ts of testStarters) {
      if (hand.some(c => c.rank === ts.rank && c.suit === ts.suit)) continue;
      score += scoreHand(kept, ts).total;
    }

    // Crib value adjustment
    const discarded = [hand[i], hand[j]];
    if (isAiCrib) {
      if (discarded[0].rank === discarded[1].rank) score += 4;
      if (discarded[0].value + discarded[1].value === 15) score += 4;
      if (discarded.some(c => c.rank === '5')) score += 2;
    } else {
      if (discarded[0].rank === discarded[1].rank) score -= 4;
      if (discarded[0].value + discarded[1].value === 15) score -= 4;
      if (discarded.some(c => c.rank === '5')) score -= 3;
    }

    if (score > bestScore) {
      bestScore = score;
      bestDiscard = [i, j];
    }
  }

  return bestDiscard;
}

/** AI picks a card to play during pegging. */
function aiPegPlay(hand, stack, count) {
  const playable = hand.filter(c => count + c.value <= 31);
  if (playable.length === 0) return null;

  let bestCard = playable[0];
  let bestScore = -1;

  for (const card of playable) {
    const newCount = count + card.value;
    const newStack = [...stack, card];
    const { points } = scorePeg(newStack, newCount);
    let score = points * 10;

    if (newCount === 15) score += 5;
    if (newCount === 31) score += 5;
    if (newCount < 5) score += 1;
    // Avoid leaving opponent easy 15 or 31
    const remain = 31 - newCount;
    if (remain === 5 || remain === 10 || remain === 15) score -= 2;

    score += Math.random() * 0.5;

    if (score > bestScore) {
      bestScore = score;
      bestCard = card;
    }
  }

  return bestCard;
}

// ═══════════════════════════════════════════════════════════
//  GAME STATE & UI
// ═══════════════════════════════════════════════════════════

const Game = {
  playerScore: 0,
  aiScore: 0,
  dealer: 'ai',
  phase: 'idle',   // idle | discard | cut | pegging | scoring | gameover
  deck: [],
  playerHand: [],
  aiHand: [],
  crib: [],
  starter: null,
  // Saved 4-card hands for scoring
  savedPlayerHand: [],
  savedAiHand: [],
  // Pegging
  pegStack: [],
  pegCount: 0,
  playerPegHand: [],
  aiPegHand: [],
  lastPegPlayer: null,  // 'player' | 'ai' — who played the last card in the stack
  playerSaidGo: false,
  aiSaidGo: false,
  // Scoring queue
  scoringQueue: [],
  selectedCards: new Set(),
  gameOver: false,
};

// ── DOM refs ─────────────────────────────────────────────
const $ = id => document.getElementById(id);
const dom = {
  playerHand: $('player-hand'),
  aiHand: $('ai-hand'),
  starterCard: $('starter-card'),
  playedCards: $('played-cards'),
  pegCountVal: $('peg-count-value'),
  cribCards: $('crib-cards'),
  cribOwner: $('crib-owner'),
  btnAction: $('btn-action'),
  message: $('game-message'),
  scoreYou: $('score-you'),
  scoreAi: $('score-ai'),
  scoringOverlay: $('scoring-overlay'),
  scoringTitle: $('scoring-title'),
  scoringHand: $('scoring-hand'),
  scoringStarter: $('scoring-starter'),
  scoringBreakdown: $('scoring-breakdown'),
  btnScoringOk: $('btn-scoring-ok'),
  gameoverOverlay: $('gameover-overlay'),
  gameoverTitle: $('gameover-title'),
  gameoverMessage: $('gameover-message'),
  btnNewGame: $('btn-new-game'),
  trackYou: document.querySelector('#track-you .track-holes'),
  trackAi: document.querySelector('#track-ai .track-holes'),
};

// ── Board ────────────────────────────────────────────────
function initBoard() {
  for (const track of [dom.trackYou, dom.trackAi]) {
    track.innerHTML = '';
    for (let i = 1; i <= 121; i++) {
      const hole = document.createElement('div');
      hole.className = 'track-hole';
      if (i % 5 === 0 && i < 121) hole.classList.add('group-end');
      hole.dataset.pos = i;
      track.appendChild(hole);
    }
  }
}

function updateBoard() {
  dom.trackYou.querySelectorAll('.track-hole').forEach(h => {
    const pos = +h.dataset.pos;
    h.classList.toggle('filled', pos <= Game.playerScore);
    h.classList.toggle('peg', pos === Game.playerScore && pos > 0);
  });
  dom.trackAi.querySelectorAll('.track-hole').forEach(h => {
    const pos = +h.dataset.pos;
    h.classList.toggle('filled', pos <= Game.aiScore);
    h.classList.toggle('peg', pos === Game.aiScore && pos > 0);
  });
  dom.scoreYou.innerHTML = `You: <strong>${Game.playerScore}</strong>`;
  dom.scoreAi.innerHTML = `AI: <strong>${Game.aiScore}</strong>`;
}

// ── Card rendering ───────────────────────────────────────
function renderCard(card, extraClasses = '') {
  const el = document.createElement('div');
  const color = isRed(card) ? 'red' : 'black';
  el.className = `card card-face ${color} ${extraClasses}`.trim();
  el.innerHTML = `<span class="card-rank">${card.rank}</span><span class="card-suit">${card.suit}</span>`;
  el.dataset.cardId = cardId(card);
  return el;
}

function renderCardBack(extraClasses = '') {
  const el = document.createElement('div');
  el.className = `card card-back ${extraClasses}`.trim();
  el.textContent = '🂠';
  return el;
}

// ── Render functions ─────────────────────────────────────
function renderPlayerHand() {
  dom.playerHand.innerHTML = '';
  const hand = Game.phase === 'pegging' ? Game.playerPegHand : Game.playerHand;
  const sorted = sortHand(hand);

  sorted.forEach((card, vi) => {
    const el = renderCard(card, 'deal-anim');
    el.style.animationDelay = `${vi * 0.08}s`;

    if (Game.phase === 'discard') {
      const origIdx = Game.playerHand.indexOf(card);
      el.classList.add('selectable');
      if (Game.selectedCards.has(origIdx)) el.classList.add('selected');
      el.addEventListener('click', () => toggleSelectCard(origIdx));
    } else if (Game.phase === 'pegging' && Game.pegTurn === 'player') {
      const canPlay = Game.pegCount + card.value <= 31;
      if (canPlay) {
        el.classList.add('playable');
        el.addEventListener('click', () => playerPegPlay(card));
      } else {
        el.classList.add('dimmed');
      }
    }

    dom.playerHand.appendChild(el);
  });
}

function renderAiHand() {
  dom.aiHand.innerHTML = '';
  const count = Game.phase === 'pegging' ? Game.aiPegHand.length : Game.aiHand.length;
  for (let i = 0; i < count; i++) {
    dom.aiHand.appendChild(renderCardBack('deal-anim'));
  }
}

function renderStarter() {
  const old = $('starter-card');
  if (Game.starter) {
    const el = renderCard(Game.starter, 'deal-anim');
    el.id = 'starter-card';
    old.replaceWith(el);
  } else if (!old.classList.contains('card-placeholder')) {
    const placeholder = document.createElement('div');
    placeholder.id = 'starter-card';
    placeholder.className = 'card card-placeholder';
    placeholder.innerHTML = '<span class="placeholder-text">Starter</span>';
    old.replaceWith(placeholder);
  }
}

function renderPlayedCards() {
  dom.playedCards.innerHTML = '';
  for (const card of Game.pegStack) {
    dom.playedCards.appendChild(renderCard(card));
  }
}

function renderCrib() {
  dom.cribCards.innerHTML = '';
  dom.cribOwner.textContent = Game.dealer === 'player' ? 'Yours' : "AI's";
  for (let i = 0; i < Game.crib.length; i++) {
    dom.cribCards.appendChild(renderCardBack());
  }
}

function renderAll() {
  renderPlayerHand();
  renderAiHand();
  renderStarter();
  renderPlayedCards();
  renderCrib();
  updateBoard();
}

// ── Messaging ────────────────────────────────────────────
function setMessage(msg) { dom.message.textContent = msg; }
function setButton(text, enabled = true) {
  dom.btnAction.textContent = text;
  dom.btnAction.disabled = !enabled;
}

// ── Toast ────────────────────────────────────────────────
function showToast(text) {
  const el = document.createElement('div');
  el.className = 'peg-toast';
  el.textContent = text;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 1600);
}

// ── Score + win check ────────────────────────────────────
function addScore(who, points) {
  if (points <= 0 || Game.gameOver) return false;
  if (who === 'player') {
    Game.playerScore = Math.min(Game.playerScore + points, WIN_SCORE);
  } else {
    Game.aiScore = Math.min(Game.aiScore + points, WIN_SCORE);
  }
  updateBoard();
  if (Game.playerScore >= WIN_SCORE || Game.aiScore >= WIN_SCORE) {
    endGame();
    return true;
  }
  return false;
}

function endGame() {
  Game.gameOver = true;
  Game.phase = 'gameover';
  const winner = Game.playerScore >= WIN_SCORE ? 'player' : 'ai';
  const loserScore = winner === 'player' ? Game.aiScore : Game.playerScore;
  let msg = winner === 'player' ? 'You win! 🎉' : 'AI wins!';
  if (loserScore < 91) msg += ' SKUNK! 🦨';
  dom.gameoverTitle.textContent = winner === 'player' ? '🏆 Victory!' : '😔 Defeat';
  dom.gameoverMessage.textContent = `${msg}\nFinal: You ${Game.playerScore} – AI ${Game.aiScore}`;
  dom.gameoverOverlay.classList.remove('hidden');
}

// ═══════════════════════════════════════════════════════════
//  GAME FLOW
// ═══════════════════════════════════════════════════════════

function newGame() {
  Game.playerScore = 0;
  Game.aiScore = 0;
  Game.gameOver = false;
  Game.dealer = Math.random() < 0.5 ? 'player' : 'ai';
  dom.gameoverOverlay.classList.add('hidden');
  dom.scoringOverlay.classList.add('hidden');
  updateBoard();
  startNewRound();
}

function startNewRound() {
  if (Game.gameOver) return;

  Game.selectedCards.clear();
  Game.crib = [];
  Game.starter = null;
  Game.pegStack = [];
  Game.pegCount = 0;
  Game.lastPegPlayer = null;
  Game.playerSaidGo = false;
  Game.aiSaidGo = false;
  Game.scoringQueue = [];
  Game.pegTurn = null;

  // Reset starter placeholder
  const old = $('starter-card');
  const placeholder = document.createElement('div');
  placeholder.id = 'starter-card';
  placeholder.className = 'card card-placeholder';
  placeholder.innerHTML = '<span class="placeholder-text">Starter</span>';
  old.replaceWith(placeholder);

  // Deal 6 each
  Game.deck = shuffle(makeDeck());
  Game.playerHand = Game.deck.splice(0, 6);
  Game.aiHand = Game.deck.splice(0, 6);

  Game.phase = 'discard';
  renderAll();
  dom.pegCountVal.textContent = '0';

  const dealerLabel = Game.dealer === 'player' ? 'You deal' : 'AI deals';
  setMessage(`${dealerLabel}. Select 2 cards to discard to the crib.`);
  setButton('Confirm Discard', false);
}

// ── Discard phase ────────────────────────────────────────
function toggleSelectCard(idx) {
  if (Game.phase !== 'discard') return;
  if (Game.selectedCards.has(idx)) {
    Game.selectedCards.delete(idx);
  } else {
    if (Game.selectedCards.size >= 2) return;
    Game.selectedCards.add(idx);
  }
  renderPlayerHand();
  setButton('Confirm Discard', Game.selectedCards.size === 2);
}

function confirmDiscard() {
  if (Game.selectedCards.size !== 2) return;

  // Player discards
  const indices = [...Game.selectedCards].sort((a, b) => b - a);
  for (const idx of indices) {
    Game.crib.push(Game.playerHand.splice(idx, 1)[0]);
  }
  Game.selectedCards.clear();

  // AI discards
  const aiDiscardIdx = aiDiscard(Game.aiHand, Game.dealer === 'ai');
  const sorted = [...aiDiscardIdx].sort((a, b) => b - a);
  for (const idx of sorted) {
    Game.crib.push(Game.aiHand.splice(idx, 1)[0]);
  }

  // Save 4-card hands for scoring later
  Game.savedPlayerHand = [...Game.playerHand];
  Game.savedAiHand = [...Game.aiHand];

  renderAll();
  setMessage('Cut the starter card.');
  setButton('Cut Card', true);
  Game.phase = 'cut';
}

// ── Cut starter ──────────────────────────────────────────
function cutStarter() {
  Game.starter = Game.deck.splice(Math.floor(Math.random() * Game.deck.length), 1)[0];
  renderStarter();

  // His Heels — jack = 2 pts for dealer
  if (Game.starter.rank === 'J') {
    const who = Game.dealer;
    showToast(`${who === 'player' ? 'You' : 'AI'} score 2 for His Heels!`);
    if (addScore(who, 2)) return;
  }

  startPegging();
}

// ═══════════════════════════════════════════════════════════
//  PEGGING
// ═══════════════════════════════════════════════════════════

function startPegging() {
  Game.phase = 'pegging';
  Game.playerPegHand = [...Game.playerHand];
  Game.aiPegHand = [...Game.aiHand];
  Game.pegStack = [];
  Game.pegCount = 0;
  Game.lastPegPlayer = null;
  Game.playerSaidGo = false;
  Game.aiSaidGo = false;

  renderPlayedCards();
  dom.pegCountVal.textContent = '0';

  // Non-dealer plays first
  const firstPlayer = Game.dealer === 'player' ? 'ai' : 'player';
  startPegTurn(firstPlayer);
}

function startPegTurn(who) {
  if (Game.gameOver) return;
  Game.pegTurn = who;

  if (who === 'ai') {
    setMessage('AI is thinking…');
    setButton('—', false);
    renderPlayerHand(); // dim player cards
    setTimeout(doAiPegTurn, 700);
  } else {
    doPlayerPegTurn();
  }
}

function doPlayerPegTurn() {
  const playable = Game.playerPegHand.filter(c => Game.pegCount + c.value <= 31);

  if (playable.length === 0) {
    // Player must say go
    Game.playerSaidGo = true;
    setMessage('No playable card — Go!');

    // Does AI also have no playable cards?
    const aiCanPlay = Game.aiPegHand.some(c => Game.pegCount + c.value <= 31);
    if (Game.aiSaidGo || !aiCanPlay) {
      // Both stuck: end sub-round
      endSubRound();
    } else {
      setTimeout(() => startPegTurn('ai'), 600);
    }
    return;
  }

  // Player has playable cards — render and wait for click
  setMessage('Your turn — play a card.');
  setButton('—', false);
  renderPlayerHand();
  renderAiHand();
}

function playerPegPlay(card) {
  if (Game.phase !== 'pegging' || Game.pegTurn !== 'player') return;
  if (Game.pegCount + card.value > 31) return;

  // Remove from peg hand
  const idx = Game.playerPegHand.findIndex(c => c.rank === card.rank && c.suit === card.suit);
  if (idx === -1) return;
  Game.playerPegHand.splice(idx, 1);

  Game.pegStack.push(card);
  Game.pegCount += card.value;
  Game.lastPegPlayer = 'player';
  Game.playerSaidGo = false;

  dom.pegCountVal.textContent = Game.pegCount;
  renderPlayedCards();
  renderPlayerHand();
  renderAiHand();

  // Score
  const { points, details } = scorePeg(Game.pegStack, Game.pegCount);
  if (points > 0) {
    showToast(`You: +${points} (${details.map(d => d.desc).join(', ')})`);
    if (addScore('player', points)) return;
  }

  // Continue
  afterCardPlayed();
}

function doAiPegTurn() {
  if (Game.phase !== 'pegging' || Game.gameOver) return;

  const playable = Game.aiPegHand.filter(c => Game.pegCount + c.value <= 31);

  if (playable.length === 0) {
    Game.aiSaidGo = true;
    showToast('AI says "Go"');

    const playerCanPlay = Game.playerPegHand.some(c => Game.pegCount + c.value <= 31);
    if (Game.playerSaidGo || !playerCanPlay) {
      endSubRound();
    } else {
      setTimeout(() => startPegTurn('player'), 600);
    }
    return;
  }

  const card = aiPegPlay(Game.aiPegHand, Game.pegStack, Game.pegCount);
  const idx = Game.aiPegHand.findIndex(c => c.rank === card.rank && c.suit === card.suit);
  Game.aiPegHand.splice(idx, 1);

  Game.pegStack.push(card);
  Game.pegCount += card.value;
  Game.lastPegPlayer = 'ai';
  Game.aiSaidGo = false;

  dom.pegCountVal.textContent = Game.pegCount;
  renderPlayedCards();
  renderAiHand();

  const { points, details } = scorePeg(Game.pegStack, Game.pegCount);
  if (points > 0) {
    showToast(`AI: +${points} (${details.map(d => d.desc).join(', ')})`);
    if (addScore('ai', points)) return;
  }

  afterCardPlayed();
}

/** After a card is played, decide what happens next. */
function afterCardPlayed() {
  if (Game.gameOver) return;

  const bothEmpty = Game.playerPegHand.length === 0 && Game.aiPegHand.length === 0;

  if (Game.pegCount === 31) {
    // 31 reached — points already scored. Reset sub-round.
    // No extra go point for 31.
    resetSubRound();

    if (bothEmpty) {
      setTimeout(startScoring, 500);
    } else {
      // Opponent of last player leads
      const nextLead = Game.lastPegPlayer === 'player' ? 'ai' : 'player';
      setTimeout(() => startPegTurn(nextLead), 500);
    }
    return;
  }

  if (bothEmpty) {
    // Last card point (count < 31)
    if (Game.lastPegPlayer) {
      showToast(`${Game.lastPegPlayer === 'player' ? 'You' : 'AI'}: +1 (Last card)`);
      if (addScore(Game.lastPegPlayer, 1)) return;
    }
    resetSubRound();
    setTimeout(startScoring, 500);
    return;
  }

  // Check if neither player can play
  const playerCanPlay = Game.playerPegHand.some(c => Game.pegCount + c.value <= 31);
  const aiCanPlay = Game.aiPegHand.some(c => Game.pegCount + c.value <= 31);

  if (!playerCanPlay && !aiCanPlay) {
    endSubRound();
    return;
  }

  // Next player's turn — alternate, but skip if they said go
  const next = Game.lastPegPlayer === 'player' ? 'ai' : 'player';
  if (next === 'player' && !playerCanPlay) {
    Game.playerSaidGo = true;
    setMessage('No playable card — Go!');
    setTimeout(() => startPegTurn('ai'), 600);
  } else if (next === 'ai' && !aiCanPlay) {
    Game.aiSaidGo = true;
    showToast('AI says "Go"');
    setTimeout(() => startPegTurn('player'), 600);
  } else {
    setTimeout(() => startPegTurn(next), 300);
  }
}

/** End a sub-round: award go point, reset count. */
function endSubRound() {
  if (Game.gameOver) return;

  // Award 1 point for go (last card played gets it)
  if (Game.lastPegPlayer && Game.pegCount < 31) {
    showToast(`${Game.lastPegPlayer === 'player' ? 'You' : 'AI'}: +1 (Go)`);
    if (addScore(Game.lastPegPlayer, 1)) return;
  }

  resetSubRound();

  const bothEmpty = Game.playerPegHand.length === 0 && Game.aiPegHand.length === 0;
  if (bothEmpty) {
    setTimeout(startScoring, 500);
  } else {
    // The player who said go (couldn't play) leads the new sub-round
    // Standard rule: the player who did NOT play the last card leads
    const nextLead = Game.lastPegPlayer === 'player' ? 'ai' : 'player';
    // But if that player has no cards, the other leads
    if (nextLead === 'player' && Game.playerPegHand.length === 0) {
      setTimeout(() => startPegTurn('ai'), 500);
    } else if (nextLead === 'ai' && Game.aiPegHand.length === 0) {
      setTimeout(() => startPegTurn('player'), 500);
    } else {
      setTimeout(() => startPegTurn(nextLead), 500);
    }
  }
}

function resetSubRound() {
  Game.pegStack = [];
  Game.pegCount = 0;
  Game.playerSaidGo = false;
  Game.aiSaidGo = false;
  Game.lastPegPlayer = null;
  dom.pegCountVal.textContent = '0';
  renderPlayedCards();
}

// ═══════════════════════════════════════════════════════════
//  HAND SCORING PHASE
// ═══════════════════════════════════════════════════════════

function startScoring() {
  if (Game.gameOver) return;
  Game.phase = 'scoring';

  // Order: non-dealer hand, dealer hand, crib
  const nonDealer = Game.dealer === 'player' ? 'ai' : 'player';
  const dealerWho = Game.dealer;

  Game.scoringQueue = [
    { who: nonDealer, hand: nonDealer === 'player' ? Game.savedPlayerHand : Game.savedAiHand, isCrib: false },
    { who: dealerWho, hand: dealerWho === 'player' ? Game.savedPlayerHand : Game.savedAiHand, isCrib: false },
    { who: dealerWho, hand: Game.crib, isCrib: true },
  ];

  showNextScoring();
}

function showNextScoring() {
  if (Game.gameOver) return;
  if (Game.scoringQueue.length === 0) {
    Game.dealer = Game.dealer === 'player' ? 'ai' : 'player';
    startNewRound();
    return;
  }

  const item = Game.scoringQueue.shift();
  const result = scoreHand(item.hand, Game.starter, item.isCrib);

  const label = item.who === 'player' ? 'Your' : "AI's";
  const type = item.isCrib ? 'Crib' : 'Hand';
  dom.scoringTitle.textContent = `${label} ${type}`;

  // Show cards
  dom.scoringHand.innerHTML = '';
  for (const card of sortHand(item.hand)) {
    dom.scoringHand.appendChild(renderCard(card));
  }
  dom.scoringStarter.textContent = `Starter: ${cardName(Game.starter)}`;

  // Show breakdown
  dom.scoringBreakdown.innerHTML = '';
  if (result.details.length === 0) {
    const line = document.createElement('div');
    line.className = 'score-line';
    line.innerHTML = '<span>No points (nineteen hand!)</span><span class="pts">0</span>';
    dom.scoringBreakdown.appendChild(line);
  } else {
    for (const d of result.details) {
      const line = document.createElement('div');
      line.className = 'score-line';
      line.innerHTML = `<span>${d.desc}</span><span class="pts">${d.points}</span>`;
      dom.scoringBreakdown.appendChild(line);
    }
  }

  const totalLine = document.createElement('div');
  totalLine.className = 'score-total';
  totalLine.innerHTML = `<span>Total</span><span class="pts">${result.total}</span>`;
  dom.scoringBreakdown.appendChild(totalLine);

  dom.scoringOverlay.classList.remove('hidden');

  dom.btnScoringOk.onclick = () => {
    dom.scoringOverlay.classList.add('hidden');
    if (result.total > 0) {
      if (addScore(item.who, result.total)) return;
    }
    setTimeout(showNextScoring, 300);
  };
}

// ── Main button handler ──────────────────────────────────
dom.btnAction.addEventListener('click', () => {
  switch (Game.phase) {
    case 'idle':    newGame(); break;
    case 'discard': confirmDiscard(); break;
    case 'cut':     cutStarter(); break;
  }
});

dom.btnNewGame.addEventListener('click', () => newGame());

// ── Init ─────────────────────────────────────────────────
initBoard();
setMessage('Press Start Game to begin!');
setButton('Start Game', true);
Game.phase = 'idle';
