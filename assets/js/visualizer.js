/* ═══════════════════════════════════════════════════════════════════════════
   SUDOKU VISUALIZER UI CONTROLLER
   Manages multi-size grid rendering, step playback, pencil marks, interactive
   editing, custom size selection, and localStorage puzzle management.
═══════════════════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  const {
    EV,
    createSolver,
    serializeBoard,
    parsePuzzle,
    generatePuzzle
  } = window.SudokuEngine;
  const { SIZE_PRESETS, PUZZLES_BY_SIZE } = window.SudokuPuzzles;

  /* ═══════════════════════════════════════════════════════════════════
     APP STATE (Default: 9x9 -> 3x3 boxes)
  ═══════════════════════════════════════════════════════════════════ */
  let currentBoxRows = 3;
  let currentBoxCols = 3;
  let currentN = 9;
  let Solver = createSolver(currentBoxRows, currentBoxCols);

  let steps = [];
  let currentStep = 0;
  let playTimer = null;
  let isPlaying = false;
  let showPencil = false;
  let editMode = false;
  let editBoard = new Int32Array(currentN * currentN);
  let editTypedFresh = false;
  let loadedStr = '';
  let currentPuzzleMeta = PUZZLES_BY_SIZE['3x3'][0];
  let noticeTimer = null;

  const $ = id => document.getElementById(id);

  function sizeKey(br = currentBoxRows, bc = currentBoxCols) {
    return `${br}x${bc}`;
  }

  /* ═══════════════════════════════════════════════════════════════════
     GRID GEOMETRY & RESPONSIVE SIZING
  ═══════════════════════════════════════════════════════════════════ */
  function getLayoutMetrics(n) {
    if (n <= 4) return { px: '440px', cellFont: '2.2rem', pencilFont: '0.92rem', dense: false, scroll: false };
    if (n <= 6) return { px: '440px', cellFont: '1.78rem', pencilFont: '0.74rem', dense: false, scroll: false };
    if (n <= 9) return { px: '440px', cellFont: '1.5rem', pencilFont: '0.62rem', dense: false, scroll: false };
    if (n <= 12) return { px: '480px', cellFont: '1.12rem', pencilFont: '0.48rem', dense: true, scroll: false };
    if (n <= 16) return { px: '512px', cellFont: '0.9rem', pencilFont: '0.42rem', dense: true, scroll: false };
    const pxNum = Math.max(504, n * 28);
    return { px: `${pxNum}px`, cellFont: '0.72rem', pencilFont: '0.35rem', dense: true, scroll: true };
  }

  function buildGrid() {
    const g = $('sudoku-grid');
    const card = document.querySelector('.board-card');
    const wrap = document.querySelector('.board-grid-wrapper');
    const metrics = getLayoutMetrics(currentN);

    g.style.setProperty('--grid-n', String(currentN));
    g.style.setProperty('--box-rows', String(currentBoxRows));
    g.style.setProperty('--box-cols', String(currentBoxCols));
    g.style.setProperty('--grid-px', metrics.px);
    g.style.setProperty('--cell-font', metrics.cellFont);
    g.style.setProperty('--pencil-font', metrics.pencilFont);

    card?.classList.toggle('board-dense', metrics.dense);
    wrap?.classList.toggle('board-scrollable', metrics.scroll);

    g.innerHTML = '';
    const frag = document.createDocumentFragment();
    for (let r = 0; r < currentN; r++) {
      for (let c = 0; c < currentN; c++) {
        const el = document.createElement('div');
        const classes = ['cell'];
        if (c === currentN - 1) classes.push('last-col');
        else if ((c + 1) % currentBoxCols === 0) classes.push('box-right');
        if (r === currentN - 1) classes.push('last-row');
        else if ((r + 1) % currentBoxRows === 0) classes.push('box-bottom');

        el.className = classes.join(' ');
        el.dataset.baseClass = classes.join(' ');
        el.dataset.row = String(r);
        el.dataset.col = String(c);
        el.addEventListener('click', onCellClick);
        frag.appendChild(el);
      }
    }
    g.appendChild(frag);
    updateSizeLabels();
  }

  function updateSizeLabels() {
    const label = `${currentN}×${currentN}`;
    const boxLabel = `${currentBoxRows}×${currentBoxCols} boxes`;
    if ($('size-trigger-label')) $('size-trigger-label').textContent = `Size: ${label}`;
    if ($('size-trigger-pill')) $('size-trigger-pill').textContent = `${currentBoxRows}×${currentBoxCols}`;
    if ($('board-geometry-pill')) $('board-geometry-pill').textContent = `${label} · ${boxLabel}`;
    if ($('board-puzzle-name') && currentPuzzleMeta) {
      $('board-puzzle-name').textContent = currentPuzzleMeta.name;
    }
  }

  function getCell(r, c) {
    return document.querySelector(`.cell[data-row="${r}"][data-col="${c}"]`);
  }

  /* ═══════════════════════════════════════════════════════════════════
     BOARD SIZE SWITCHING
  ═══════════════════════════════════════════════════════════════════ */
  function setBoardSize(boxRows, boxCols, options = {}) {
    const { autoLoadFirst = true, openEditEmpty = false, generateCustom = false } = options;
    stopPlay();
    if (editMode) toggleEditMode(false, { skipSolve: true });

    currentBoxRows = boxRows;
    currentBoxCols = boxCols;
    currentN = boxRows * boxCols;
    Solver = createSolver(boxRows, boxCols);
    editBoard = new Int32Array(currentN * currentN);
    window._editRC = null;
    editTypedFresh = false;

    buildGrid();
    buildSizeDropdown();

    const key = sizeKey(boxRows, boxCols);
    const list = PUZZLES_BY_SIZE[key];

    if (openEditEmpty) {
      const emptyBoard = new Int32Array(currentN * currentN);
      currentPuzzleMeta = { name: `Custom ${currentN}×${currentN}`, sub: `${boxRows}×${boxCols} sub-grids` };
      loadEmptyForEdit(emptyBoard);
      buildPuzzleDropdown();
      return;
    }

    if (generateCustom || !list || !list.length) {
      const generated = generatePuzzle(boxRows, boxCols);
      const genMeta = {
        name: `Generated ${currentN}×${currentN}`,
        sub: `${boxRows}×${boxCols} sub-grids · Random valid puzzle`
      };
      loadBoardAndSolve(generated, genMeta);
      buildPuzzleDropdown();
      return;
    }

    if (autoLoadFirst) {
      loadAndSolve(list[0].str, list[0]);
    }
    buildPuzzleDropdown();
  }

  function loadEmptyForEdit(emptyBoard) {
    loadedStr = serializeBoard(emptyBoard, currentN);
    editBoard = emptyBoard.slice();
    steps = [{
      type: EV.GIVEN,
      row: null,
      col: null,
      val: 0,
      depth: 0,
      candidates: [],
      unitType: null,
      unitIndex: null,
      stack: [],
      title: 'Empty Grid Ready',
      explainShort: 'Enter clues in the grid',
      explainLong: `Click any cell and enter values 1–${currentN} to build a custom ${currentN}×${currentN} puzzle.`,
      board: emptyBoard.slice()
    }];
    applyStep(0);
    toggleEditMode(true);
  }

  /* ═══════════════════════════════════════════════════════════════════
     STEP RENDERING
  ═══════════════════════════════════════════════════════════════════ */
  function applyStep(idx) {
    if (!steps.length) return;
    if (idx < 0) idx = 0;
    if (idx >= steps.length) idx = steps.length - 1;
    currentStep = idx;

    const step = steps[idx];
    const board = step.board;
    const initialBoard = steps[0].board;
    const candMasks = showPencil ? Solver.computeCands(board) : null;
    const total = currentN * currentN;

    const unitSet = new Set();
    if (step.unitType !== null && step.unitIndex !== null) {
      const cells = Solver.getUnitCells(step.unitType, step.unitIndex);
      for (const [ur, uc] of cells) unitSet.add(ur * currentN + uc);
    } else if ((step.type === EV.NAKED || step.type === EV.GUESS) && step.row !== null && step.col !== null) {
      const sr = Math.floor(step.row / currentBoxRows) * currentBoxRows;
      const sc = Math.floor(step.col / currentBoxCols) * currentBoxCols;
      for (let i = 0; i < currentN; i++) {
        unitSet.add(step.row * currentN + i);
        unitSet.add(i * currentN + step.col);
      }
      for (let rr = sr; rr < sr + currentBoxRows; rr++) {
        for (let cc = sc; cc < sc + currentBoxCols; cc++) {
          unitSet.add(rr * currentN + cc);
        }
      }
    }

    const undoneSet = new Set(step.type === EV.BACKTRACK && Array.isArray(step.undone) ? step.undone : []);

    const cellEv = new Array(total).fill(null);
    for (let i = 0; i <= idx; i++) {
      const s = steps[i];
      if (s.row === null) continue;
      const code = s.row * currentN + s.col;
      if (s.type === EV.CONTRA || s.type === EV.BACKTRACK || s.type === EV.SOLVED) continue;
      if (board[code] !== 0) cellEv[code] = s.type;
    }

    document.querySelectorAll('.cell').forEach(cell => {
      const r = +cell.dataset.row;
      const c = +cell.dataset.col;
      const code = r * currentN + c;
      const val = board[code];
      const isGiven = initialBoard[code] !== 0;

      cell.className = cell.dataset.baseClass || 'cell';
      if (editMode) {
        cell.classList.add('edit-mode');
        cell.textContent = val ? String(val) : '';
        return;
      }

      if (isGiven) cell.classList.add('given');
      if (unitSet.has(code)) cell.classList.add('unit-tint');
      if (cellEv[code]) cell.classList.add('ev-' + cellEv[code]);
      if (step.type === EV.CONTRA) {
        if (step.row === r && step.col === c) cell.classList.add('ev-contra');
        else if (step.row === null && unitSet.has(code)) cell.classList.add('ev-contra-unit');
      } else if (step.type === EV.BACKTRACK) {
        if (step.row === r && step.col === c) cell.classList.add('ev-backtrack-cell');
        else if (undoneSet.has(code)) cell.classList.add('ev-undone-cell');
      }
      if (step.row === r && step.col === c) cell.classList.add('active-cell');
      if (val && !isGiven && cellEv[code]) cell.classList.add('warm-highlight');

      cell.innerHTML = '';
      if (val) {
        cell.textContent = String(val);
      } else if (showPencil && candMasks && candMasks[code]) {
        const mask = candMasks[code];
        const wrap = document.createElement('div');
        wrap.className = 'pencil-wrap';
        for (let v = 1; v <= currentN; v++) {
          const pm = document.createElement('div');
          pm.className = 'pencil-mark';
          if (mask & (1n << BigInt(v - 1))) pm.textContent = String(v);
          wrap.appendChild(pm);
        }
        cell.appendChild(wrap);
      }
    });

    renderCurrentStepCard(step, idx);
    renderStack(step);
    updateStats(idx);
    updateScrubber(idx);
  }

  function renderCurrentStepCard(step, idx) {
    if (editMode) {
      $('explanation-badge').textContent = 'Edit Mode';
      $('step-headline').textContent = `Editing ${currentN}×${currentN} Grid`;
      $('explanation-text').textContent = currentN <= 9
        ? `Click any cell and type 1–${currentN} (0 or Backspace clears). Press Enter or "Done Editing" to solve.`
        : `Click any cell and type 1–${currentN} (two digits supported, 0/Backspace clears). Press Enter or "Done Editing" to solve.`;
      return;
    }

    if (idx === 0 && step.type === EV.GIVEN) {
      $('explanation-badge').textContent = 'Ready';
      $('step-headline').textContent = 'See the logic unfold.';
      $('explanation-text').textContent = `Press Play or use the arrow keys to explore each solver decision on this ${currentN}×${currentN} board (${currentBoxRows}×${currentBoxCols} sub-grids).`;
      return;
    }

    const EV_NAMES = {
      given: 'Given Clue',
      naked: 'Naked Single',
      hidden: 'Hidden Single',
      guess: 'Guess (MRV)',
      contra: 'Contradiction',
      backtrack: 'Backtrack',
      solved: 'Solved',
      unsolvable: 'Unsolvable'
    };

    $('explanation-badge').textContent = EV_NAMES[step.type] || step.type;
    $('step-headline').textContent = step.title || `Step ${idx + 1}`;
    $('explanation-text').innerHTML = step.explainLong || step.explainShort || '';
  }

  function renderStack(step) {
    const container = $('stack-container');
    const scrollArea = $('stack-scroll-area');
    const spLabel = $('stack-sp-label');
    const stack = step.stack || [];

    $('stack-frame-count').textContent = `${stack.length} FRAME${stack.length !== 1 ? 'S' : ''}`;

    if (!stack.length) {
      if (spLabel) spLabel.textContent = 'SP: EMPTY';
      if (step.type === EV.UNSOLVABLE) {
        const isDuplicate = step.explainShort === 'Duplicate clues detected.';
        container.innerHTML = `
          <div class="stack-empty stack-empty-fail">
            <div class="stack-empty-main">${isDuplicate ? 'Solver not started (invalid board)' : 'Call stack unwound (0 frames)'}</div>
            <div class="stack-empty-sub">${isDuplicate ? 'Duplicate clues conflict before calling <code>solveBoard()</code>' : 'All recursive calls returned <code>false</code> — no legal solution exists'}</div>
          </div>`;
      } else {
        container.innerHTML = `
          <div class="stack-empty">
            <div class="stack-empty-main">Stack empty</div>
            <div class="stack-empty-sub">Press Play or Next step to invoke <code>solveBoard()</code></div>
          </div>`;
      }
      if (scrollArea) scrollArea.scrollTop = 0;
      return;
    }

    const topIdx = stack.length - 1;
    const isBacktrackStep = step.type === EV.BACKTRACK;
    const isContraStep = step.type === EV.CONTRA;
    const isSolvedStep = step.type === EV.SOLVED;

    if (spLabel) {
      if (isBacktrackStep) spLabel.textContent = `SP → POP #${topIdx}`;
      else if (isContraStep) spLabel.textContent = `SP → ERR #${topIdx}`;
      else if (isSolvedStep) spLabel.textContent = `SP → OK #${topIdx}`;
      else spLabel.textContent = `SP → #${topIdx}`;
    }

    container.innerHTML = '';
    const frag = document.createDocumentFragment();

    for (let i = topIdx; i >= 0; i--) {
      const frame = stack[i];
      const isTop = i === topIdx;
      const isResumingCaller = isBacktrackStep && i === topIdx - 1;
      const fnLabel = frame.isRoot
        ? 'solveBoard(init)'
        : `solveBoard(R${frame.row + 1}C${frame.col + 1} = ${frame.val})`;

      let ptrText = '│';
      let stateClass = 'mem-frame-waiting';
      let badgeText = `D${frame.depth} · WAITING`;
      let badgeClass = 'frame-badge-parent';
      let detailText = '';

      if (isTop) {
        if (isBacktrackStep) {
          ptrText = 'POP ↶';
          stateClass = 'mem-frame-backtrack active';
          badgeText = `D${frame.depth} · ↶ POP`;
          badgeClass = 'frame-badge-backtrack';
          const remNote = frame.remaining && frame.remaining.length
            ? `next: ${frame.remaining[0]}`
            : 'no options left';
          detailText = `return false · failed ${frame.val} · ${remNote}`;
        } else if (isContraStep) {
          ptrText = 'SP →';
          stateClass = 'mem-frame-contra active';
          badgeText = `D${frame.depth} · ✕ DEAD END`;
          badgeClass = 'frame-badge-contra';
          detailText = frame.isRoot
            ? 'contradiction at root · returning false'
            : `contradiction · failed ${frame.val} of [${frame.candidates.join(', ')}]`;
        } else if (isSolvedStep) {
          ptrText = 'SP →';
          stateClass = 'mem-frame-solved active';
          badgeText = `D${frame.depth} · ✓ SOLVED`;
          badgeClass = 'frame-badge-solved';
          detailText = frame.isRoot
            ? 'all units satisfied · return true'
            : `confirmed ${frame.val} · return true`;
        } else if (step.type === EV.GUESS) {
          ptrText = 'SP →';
          stateClass = 'mem-frame-guess active';
          badgeText = `D${frame.depth} · GUESS`;
          badgeClass = 'frame-badge-guess';
          const remStr = frame.remaining && frame.remaining.length
            ? `rem: ${frame.remaining.join(', ')}`
            : 'rem: none';
          detailText = `trying ${frame.val} of [${frame.candidates.join(', ')}] · ${remStr}`;
        } else {
          ptrText = 'SP →';
          stateClass = 'mem-frame-active active';
          badgeText = `D${frame.depth} · ACTIVE`;
          badgeClass = 'frame-badge-active';
          detailText = frame.isRoot
            ? 'constraint propagation (singles)'
            : `guess ${frame.val} of [${frame.candidates.join(', ')}] · propagating`;
        }
      } else if (isResumingCaller) {
        ptrText = 'RET ↵';
        stateClass = 'mem-frame-resuming';
        badgeText = `D${frame.depth} · RESUMING`;
        badgeClass = 'frame-badge-resume';
        const popped = stack[topIdx];
        const targetCell = `R${popped.row + 1}C${popped.col + 1}`;
        const nextAction = popped.remaining && popped.remaining.length
          ? `trying ${targetCell}=${popped.remaining[0]} next`
          : `${targetCell} exhausted · unwinding`;
        detailText = frame.isRoot
          ? `caller ← false from ${targetCell}=${popped.val} · ${nextAction}`
          : `chose ${frame.val} · caller ← false · ${nextAction}`;
      } else if (isSolvedStep) {
        ptrText = '│';
        stateClass = 'mem-frame-solved-caller';
        badgeText = `D${frame.depth} · ✓ OK`;
        badgeClass = 'frame-badge-solved';
        detailText = frame.isRoot
          ? 'initial call · returning true'
          : `chose ${frame.val} of [${frame.candidates.join(', ')}] · returning true`;
      } else {
        detailText = frame.isRoot
          ? 'initial call · waiting on child frame'
          : `chose ${frame.val} of [${frame.candidates.join(', ')}] · awaiting return`;
      }

      const item = document.createElement('div');
      item.className = `mem-frame ${stateClass}`;
      item.title = frame.isRoot
        ? `Frame #${i} · ${fnLabel} · ${detailText}`
        : `Frame #${i} · ${fnLabel} · ${detailText} (click to highlight cell)`;

      const gutter = document.createElement('div');
      gutter.className = 'mem-frame-gutter';
      gutter.innerHTML = `<span class="mem-ptr">${ptrText}</span><span class="mem-slot">#${i}</span>`;

      const body = document.createElement('div');
      body.className = 'mem-frame-body';

      const topRow = document.createElement('div');
      topRow.className = 'mem-frame-top';

      const sigEl = document.createElement('span');
      sigEl.className = 'mem-fn-sig';
      sigEl.textContent = fnLabel;

      const badgeEl = document.createElement('span');
      badgeEl.className = `frame-badge ${badgeClass}`;
      badgeEl.textContent = badgeText;

      topRow.appendChild(sigEl);
      topRow.appendChild(badgeEl);

      const metaEl = document.createElement('div');
      metaEl.className = 'mem-frame-meta';
      metaEl.textContent = detailText;

      body.appendChild(topRow);
      body.appendChild(metaEl);

      item.appendChild(gutter);
      item.appendChild(body);

      if (!frame.isRoot && frame.row !== null && frame.col !== null) {
        item.addEventListener('click', () => {
          document.querySelectorAll('.cell').forEach(cl => cl.classList.remove('active-cell'));
          getCell(frame.row, frame.col)?.classList.add('active-cell');
        });
      }

      frag.appendChild(item);
    }

    container.appendChild(frag);
    if (scrollArea) scrollArea.scrollTop = 0;
  }

  function updateStats(idx) {
    if (!steps.length) return;
    let place = 0, naked = 0, hidden = 0, guess = 0, back = 0, maxD = 0;
    const end = Math.min(idx + 1, steps.length);

    for (let i = 0; i < end; i++) {
      const s = steps[i];
      if (s.type === EV.NAKED) { place++; naked++; }
      else if (s.type === EV.HIDDEN) { place++; hidden++; }
      else if (s.type === EV.GUESS) guess++;
      else if (s.type === EV.BACKTRACK) back++;
      if (s.depth > maxD) maxD = s.depth;
    }

    $('st-place').textContent = place;
    $('st-naked').textContent = naked;
    $('st-hidden').textContent = hidden;
    $('st-guess').textContent = guess;
    $('st-back').textContent = back;
    $('st-depth').textContent = maxD;
  }

  function updateScrubber(idx) {
    const s = $('scrubber');
    const maxIdx = Math.max(0, steps.length - 1);
    s.max = maxIdx;
    s.value = idx;
    $('step-counter-label').textContent = `Step ${idx} of ${maxIdx}`;
  }

  /* ═══════════════════════════════════════════════════════════════════
     PLAYBACK ENGINE
  ═══════════════════════════════════════════════════════════════════ */
  const SPEED_DELAYS = [1200, 600, 280, 120, 50, 20, 8, 3];
  function getDelay() {
    const v = +$('speed-slider').value;
    return SPEED_DELAYS[Math.max(0, Math.min(7, v - 1))];
  }

  function playTick() {
    if (currentStep >= steps.length - 1) {
      stopPlay();
      return;
    }
    applyStep(currentStep + 1);
    playTimer = setTimeout(playTick, getDelay());
  }

  function startPlay() {
    if (isPlaying || editMode) return;
    if (currentStep >= steps.length - 1) applyStep(0);
    isPlaying = true;
    $('btn-play').textContent = 'Pause';
    playTick();
  }

  function stopPlay() {
    if (!isPlaying) return;
    clearTimeout(playTimer);
    isPlaying = false;
    $('btn-play').textContent = 'Play';
  }

  function togglePlay() {
    isPlaying ? stopPlay() : startPlay();
  }

  /* ═══════════════════════════════════════════════════════════════════
     PUZZLE LOADING & SOLVING
  ═══════════════════════════════════════════════════════════════════ */
  function loadAndSolve(puzzleStr, meta) {
    const board = parsePuzzle(puzzleStr, currentN);
    if (!board) {
      showNotice(`Invalid ${currentN}×${currentN} puzzle — expected ${currentN * currentN} values (0–${currentN} or .).`);
      return;
    }
    loadBoardAndSolve(board, meta);
  }

  function loadBoardAndSolve(board, meta) {
    stopPlay();
    if (editMode) toggleEditMode(false, { skipSolve: true });

    loadedStr = serializeBoard(board, currentN);
    editBoard = board.slice();
    if (meta) currentPuzzleMeta = meta;
    updateSizeLabels();

    const result = Solver.solve(board);
    if (!result.valid) {
      showNotice(`Puzzle has duplicate clues in a row, column, or ${currentBoxRows}×${currentBoxCols} box.`);
      steps = [{
        type: EV.UNSOLVABLE,
        row: null,
        col: null,
        val: 0,
        depth: 0,
        candidates: [],
        unitType: null,
        unitIndex: null,
        stack: [],
        title: '✕ No Legal Solution Exists',
        explainShort: 'Duplicate clues detected.',
        explainLong: `This ${currentN}×${currentN} puzzle contains duplicate values in the same row, column, or ${currentBoxRows}×${currentBoxCols} box. Therefore, there is <strong>no legal solution</strong> for this puzzle.`,
        board: board.slice()
      }];
      applyStep(0);
      renderConflictBoard(board);
      return;
    }

    steps = result.steps;
    if (result.capped) {
      showNotice(`Step trace capped at ${steps.length - 1} steps for visualization speed.`);
    }
    applyStep(0);
  }

  function renderConflictBoard(board) {
    const conf = Solver.findConflicts(board);
    document.querySelectorAll('.cell').forEach(cell => {
      const r = +cell.dataset.row;
      const c = +cell.dataset.col;
      const code = r * currentN + c;
      cell.className = cell.dataset.baseClass || 'cell';
      cell.innerHTML = '';
      if (board[code]) {
        cell.textContent = String(board[code]);
        if (conf.has(code)) cell.classList.add('ev-contra');
      }
    });
  }

  /* ═══════════════════════════════════════════════════════════════════
     DROPDOWNS: SIZE SELECTOR & LOAD PUZZLE
  ═══════════════════════════════════════════════════════════════════ */
  function buildSizeDropdown() {
    const dd = $('size-dropdown');
    if (!dd) return;
    dd.innerHTML = '';

    const heading = document.createElement('div');
    heading.className = 'dropdown-section-label';
    heading.textContent = 'Select Puzzle Size';
    dd.appendChild(heading);

    const activeKey = sizeKey();
    let matchedPreset = false;

    SIZE_PRESETS.forEach(preset => {
      const isActive = preset.key === activeKey;
      if (isActive) matchedPreset = true;
      const btn = document.createElement('button');
      btn.className = 'dropdown-item' + (isActive ? ' active' : '');
      btn.innerHTML = `
        <div class="dropdown-item-title">
          <span>${preset.label}</span>
          <span class="dropdown-badge">${preset.boxLabel}</span>
        </div>
        <span class="dropdown-item-desc">${preset.desc}</span>
      `;
      btn.addEventListener('click', () => {
        dd.classList.remove('open');
        setBoardSize(preset.boxRows, preset.boxCols, { autoLoadFirst: true });
      });
      dd.appendChild(btn);
    });

    if (!matchedPreset) {
      const customActive = document.createElement('div');
      customActive.className = 'dropdown-item active';
      customActive.innerHTML = `
        <div class="dropdown-item-title">
          <span>${currentN}×${currentN} (Active Custom)</span>
          <span class="dropdown-badge">${currentBoxRows}×${currentBoxCols} boxes</span>
        </div>
        <span class="dropdown-item-desc">Custom sub-grid configuration</span>
      `;
      dd.appendChild(customActive);
    }

    const divider = document.createElement('div');
    divider.className = 'dropdown-divider';
    dd.appendChild(divider);

    const customBtn = document.createElement('button');
    customBtn.className = 'dropdown-item';
    customBtn.innerHTML = `
      <div class="dropdown-item-title">
        <span>+ Custom Size (R×C)…</span>
      </div>
      <span class="dropdown-item-desc">Any boxRows × boxCols up to N = 64</span>
    `;
    customBtn.addEventListener('click', () => {
      dd.classList.remove('open');
      $('custom-box-rows').value = String(currentBoxRows);
      $('custom-box-cols').value = String(currentBoxCols);
      updateCustomSizePreview();
      openModal('size-modal');
    });
    dd.appendChild(customBtn);
  }

  function buildPuzzleDropdown() {
    const dd = $('puzzle-dropdown');
    dd.innerHTML = '';

    const heading = document.createElement('div');
    heading.className = 'dropdown-section-label';
    heading.textContent = `${currentN}×${currentN} (${currentBoxRows}×${currentBoxCols}) Puzzles`;
    dd.appendChild(heading);

    const list = PUZZLES_BY_SIZE[sizeKey()] || [];
    list.forEach(p => {
      const btn = document.createElement('button');
      btn.className = 'dropdown-item' + (currentPuzzleMeta && currentPuzzleMeta.name === p.name ? ' active' : '');
      btn.innerHTML = `
        <div class="dropdown-item-title">
          <span>${p.name}</span>
        </div>
        <span class="dropdown-item-desc">${p.sub}</span>
      `;
      btn.addEventListener('click', () => {
        dd.classList.remove('open');
        loadAndSolve(p.str, p);
        buildPuzzleDropdown();
      });
      dd.appendChild(btn);
    });

    if (list.length) {
      const div1 = document.createElement('div');
      div1.className = 'dropdown-divider';
      dd.appendChild(div1);
    }

    const genBtn = document.createElement('button');
    genBtn.className = 'dropdown-item';
    genBtn.innerHTML = `
      <div class="dropdown-item-title">
        <span style="display:inline-flex; align-items:center; gap:0.4rem;">
          <svg class="line-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <rect x="2.2" y="2.2" width="11.6" height="11.6" rx="2.2"/>
            <circle cx="5.5" cy="5.5" r="0.8" fill="currentColor" stroke="none"/>
            <circle cx="10.5" cy="5.5" r="0.8" fill="currentColor" stroke="none"/>
            <circle cx="8" cy="8" r="0.8" fill="currentColor" stroke="none"/>
            <circle cx="5.5" cy="10.5" r="0.8" fill="currentColor" stroke="none"/>
            <circle cx="10.5" cy="10.5" r="0.8" fill="currentColor" stroke="none"/>
          </svg>
          Generate Random ${currentN}×${currentN} Puzzle
        </span>
      </div>
      <span class="dropdown-item-desc">Create &amp; solve a fresh ${currentBoxRows}×${currentBoxCols} board</span>
    `;
    genBtn.addEventListener('click', () => {
      dd.classList.remove('open');
      const generated = generatePuzzle(currentBoxRows, currentBoxCols);
      loadBoardAndSolve(generated, {
        name: `Random ${currentN}×${currentN}`,
        sub: `${currentBoxRows}×${currentBoxCols} sub-grids · Generated`
      });
      buildPuzzleDropdown();
    });
    dd.appendChild(genBtn);

    const pasteBtn = document.createElement('button');
    pasteBtn.className = 'dropdown-item';
    pasteBtn.innerHTML = `
      <div class="dropdown-item-title">
        <span>+ Paste ${currentN}×${currentN} String…</span>
      </div>
      <span class="dropdown-item-desc">Load any custom ${currentN * currentN}-cell puzzle</span>
    `;
    pasteBtn.addEventListener('click', () => {
      dd.classList.remove('open');
      openPasteModal();
    });
    dd.appendChild(pasteBtn);
  }

  function openPasteModal() {
    const total = currentN * currentN;
    $('paste-title').textContent = `Paste ${currentN}×${currentN} Puzzle`;
    $('paste-sub').innerHTML = currentN <= 9
      ? `Enter <b>${total}</b> digits (<code>1–${currentN}</code> for clues, <code>0</code> or <code>.</code> for blanks) or space-separated numbers.`
      : `Enter <b>${total}</b> space/comma-separated values (<code>1–${currentN}</code>, <code>0</code> or <code>.</code> for blanks) or a ${total}-char <code>1–9/A–Z</code> string.`;
    const sampleList = PUZZLES_BY_SIZE[sizeKey()];
    $('paste-input').placeholder = sampleList?.[0]?.str || Array(total).fill(0).join(currentN <= 9 ? '' : ' ');
    $('paste-input').value = '';
    $('paste-error').textContent = '';
    openModal('paste-modal');
  }

  function updateCustomSizePreview() {
    const br = parseInt($('custom-box-rows').value, 10);
    const bc = parseInt($('custom-box-cols').value, 10);
    const errEl = $('size-error');
    const previewEl = $('custom-size-preview');

    if (!Number.isInteger(br) || !Number.isInteger(bc) || br <= 0 || bc <= 0) {
      previewEl.textContent = 'Enter positive integers for box rows and box columns.';
      errEl.textContent = 'Sub-grid dimensions must be at least 1×1.';
      return null;
    }
    const n = br * bc;
    if (n > 64) {
      previewEl.textContent = `Requested grid: ${n}×${n} (${n * n} cells)`;
      errEl.textContent = `Board dimension N = ${br} × ${bc} = ${n} exceeds the 64-bit bitmask limit (max 64).`;
      return null;
    }
    if (n === 1) {
      previewEl.textContent = 'Grid Size: 1 × 1 (1 cell) · Trivial board';
      errEl.textContent = 'Choose dimensions with N ≥ 2 (for example 2×2 for 4×4 or 2×3 for 6×6).';
      return null;
    }
    errEl.textContent = '';
    previewEl.innerHTML = `Grid Size: <strong>${n} × ${n}</strong> (${n * n} cells) · Values <strong>1–${n}</strong> · <strong>${3 * n}</strong> units (${br}×${bc} sub-grids)`;
    return { boxRows: br, boxCols: bc };
  }

  /* ═══════════════════════════════════════════════════════════════════
     LOCAL STORAGE (My Puzzles)
  ═══════════════════════════════════════════════════════════════════ */
  const LS_KEY = 'sudoku-vis-custom';
  function getSavedPuzzles() {
    try { return JSON.parse(localStorage.getItem(LS_KEY) || '[]'); } catch { return []; }
  }
  function setSavedPuzzles(arr) {
    localStorage.setItem(LS_KEY, JSON.stringify(arr));
  }

  function renderSavedList() {
    const list = $('saved-list');
    const saved = getSavedPuzzles();
    list.innerHTML = '';

    if (!saved.length) {
      list.innerHTML = '<p style="font-size:0.8rem; color:var(--text-muted); padding:0.5rem 0;">No custom saved puzzles yet.</p>';
      return;
    }

    saved.forEach((p, i) => {
      const br = p.boxRows || 3;
      const bc = p.boxCols || 3;
      const sn = br * bc;
      const row = document.createElement('div');
      row.className = 'saved-row';
      row.innerHTML = `
        <div>
          <span class="saved-row-name">${p.name}</span>
          <span class="saved-row-size">${sn}×${sn} (${br}×${bc})</span>
        </div>
        <div style="display:flex; gap:0.4rem;">
          <button class="btn-control" style="padding:0.25rem 0.6rem; font-size:0.75rem;" data-act="load">Load</button>
          <button class="btn-control" style="padding:0.25rem 0.6rem; font-size:0.75rem; color:#dc2626;" data-act="del">Delete</button>
        </div>
      `;

      row.querySelector('[data-act="load"]').addEventListener('click', () => {
        closeModal('manage-modal');
        if (br !== currentBoxRows || bc !== currentBoxCols) {
          setBoardSize(br, bc, { autoLoadFirst: false });
        }
        loadAndSolve(p.str, { name: p.name, sub: `Saved ${sn}×${sn} Puzzle` });
      });

      row.querySelector('[data-act="del"]').addEventListener('click', () => {
        const arr = getSavedPuzzles();
        arr.splice(i, 1);
        setSavedPuzzles(arr);
        renderSavedList();
      });

      list.appendChild(row);
    });
  }

  /* ═══════════════════════════════════════════════════════════════════
     INTERACTIVE GRID EDIT MODE
  ═══════════════════════════════════════════════════════════════════ */
  function toggleEditMode(forceState, opts = {}) {
    const { skipSolve = false } = opts;
    const nextState = forceState !== undefined ? forceState : !editMode;
    if (nextState === editMode) return;

    editMode = nextState;
    const toggleBtn = $('btn-toggle-edit-mode');
    const heroEditBtn = $('btn-edit-puzzles');

    if (toggleBtn) {
      toggleBtn.innerHTML = editMode
        ? '✓ Done Editing (Solve Grid)'
        : `<svg class="line-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11.5 2.5a1.4 1.4 0 0 1 2 2L5.5 12.5 2.5 13.5l1-3 8-8Z"/><path d="m10 4 2 2"/></svg> Edit Grid Interactively`;
    }
    if (heroEditBtn) {
      heroEditBtn.textContent = editMode ? '✓ Done Editing (Solve)' : 'Edit My Puzzles';
      heroEditBtn.classList.toggle('editing-active', editMode);
    }

    if (!editMode) {
      window._editRC = null;
      editTypedFresh = false;
      if (!skipSolve) {
        loadBoardAndSolve(editBoard.slice(), {
          name: `Custom ${currentN}×${currentN} Board`,
          sub: `${currentBoxRows}×${currentBoxCols} Interactive User Input`
        });
      }
      return;
    }

    stopPlay();
    if (steps.length && steps[0].board && steps[0].board.length === currentN * currentN) {
      editBoard = steps[0].board.slice();
    } else {
      editBoard = new Int32Array(currentN * currentN);
    }

    document.querySelectorAll('.cell').forEach(cell => {
      const r = +cell.dataset.row;
      const c = +cell.dataset.col;
      const val = editBoard[r * currentN + c];
      cell.textContent = val ? String(val) : '';
      cell.className = (cell.dataset.baseClass || 'cell') + ' edit-mode';
    });
    validateEdit();
    window._editRC = null;
    editTypedFresh = false;
    closeModal('manage-modal');
    renderCurrentStepCard(steps[0] || {}, 0);
    showNotice(currentN <= 9
      ? `Click any cell and type 1–${currentN} or 0/Backspace to edit.`
      : `Click any cell and type 1–${currentN} (multi-digit supported) or 0/Backspace.`);
  }

  function onCellClick() {
    if (!editMode) return;
    const r = +this.dataset.row;
    const c = +this.dataset.col;
    window._editRC = [r, c];
    editTypedFresh = false;
    document.querySelectorAll('.cell').forEach(cl => cl.classList.remove('active-cell'));
    this.classList.add('active-cell');
  }

  function moveEdit(r, c, dr, dc) {
    const nr = Math.max(0, Math.min(currentN - 1, r + dr));
    const nc = Math.max(0, Math.min(currentN - 1, c + dc));
    window._editRC = [nr, nc];
    editTypedFresh = false;
    document.querySelectorAll('.cell').forEach(cl => cl.classList.remove('active-cell'));
    getCell(nr, nc)?.classList.add('active-cell');
  }

  function validateEdit() {
    const conf = Solver.findConflicts(editBoard);
    document.querySelectorAll('.cell').forEach(cell => {
      const r = +cell.dataset.row;
      const c = +cell.dataset.col;
      const code = r * currentN + c;
      cell.classList.remove('edit-conflict');
      if (conf.has(code)) cell.classList.add('edit-conflict');
    });
  }

  document.addEventListener('keydown', e => {
    const anyModalOpen = document.querySelector('.modal-backdrop.open');
    if (e.key === 'Escape' && anyModalOpen) {
      ['how', 'human-brain', 'manage', 'paste', 'save', 'size'].forEach(id => closeModal(`${id}-modal`));
      return;
    }

    // Ignore global shortcuts while typing in a modal input/textarea
    const tag = document.activeElement?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') {
      return;
    }

    if (editMode && window._editRC) {
      const [r, c] = window._editRC;
      const idx = r * currentN + c;

      if (e.key >= '0' && e.key <= '9') {
        const digit = +e.key;
        if (currentN <= 9) {
          if (digit === 0) {
            editBoard[idx] = 0;
            getCell(r, c).textContent = '';
          } else if (digit <= currentN) {
            editBoard[idx] = digit;
            getCell(r, c).textContent = String(digit);
          }
        } else {
          if (editTypedFresh) {
            const combined = editBoard[idx] * 10 + digit;
            if (combined >= 1 && combined <= currentN) {
              editBoard[idx] = combined;
              getCell(r, c).textContent = String(combined);
            } else if (digit === 0) {
              editBoard[idx] = 0;
              getCell(r, c).textContent = '';
              editTypedFresh = false;
            } else {
              editBoard[idx] = digit;
              getCell(r, c).textContent = String(digit);
            }
          } else {
            if (digit === 0) {
              editBoard[idx] = 0;
              getCell(r, c).textContent = '';
            } else {
              editBoard[idx] = digit;
              getCell(r, c).textContent = String(digit);
              editTypedFresh = true;
            }
          }
        }
        validateEdit();
      } else if (['Backspace', 'Delete'].includes(e.key)) {
        editBoard[idx] = 0;
        getCell(r, c).textContent = '';
        editTypedFresh = false;
        validateEdit();
      } else if (e.key === 'ArrowRight') moveEdit(r, c, 0, 1);
      else if (e.key === 'ArrowLeft') moveEdit(r, c, 0, -1);
      else if (e.key === 'ArrowDown') moveEdit(r, c, 1, 0);
      else if (e.key === 'ArrowUp') moveEdit(r, c, -1, 0);
      else if (e.key === 'Enter' || e.key === 'Escape') toggleEditMode(false);
      e.preventDefault();
      return;
    }

    if (!editMode) {
      if (e.key === ' ' || e.code === 'Space') { e.preventDefault(); togglePlay(); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); stopPlay(); applyStep(currentStep + 1); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); stopPlay(); applyStep(currentStep - 1); }
      else if (e.key === 'Home') { e.preventDefault(); stopPlay(); applyStep(0); }
      else if (e.key === 'End') { e.preventDefault(); stopPlay(); applyStep(steps.length - 1); }
    }
  });

  /* ═══════════════════════════════════════════════════════════════════
     NOTICES & MODALS
  ═══════════════════════════════════════════════════════════════════ */
  function showNotice(msg) {
    const bar = $('notice-bar');
    bar.textContent = msg;
    bar.style.display = 'block';
    clearTimeout(noticeTimer);
    noticeTimer = setTimeout(() => { bar.style.display = 'none'; }, 4000);
  }

  function openModal(id) { $(id)?.classList.add('open'); }
  function closeModal(id) { $(id)?.classList.remove('open'); }

  ['how', 'human-brain', 'manage', 'paste', 'save', 'size'].forEach(id => {
    $(`${id}-modal`)?.addEventListener('click', e => {
      if (e.target === $(`${id}-modal`)) closeModal(`${id}-modal`);
    });
  });

  $('btn-how-it-works')?.addEventListener('click', () => openModal('how-modal'));
  $('how-modal-close')?.addEventListener('click', () => closeModal('how-modal'));
  $('how-modal-ok')?.addEventListener('click', () => closeModal('how-modal'));

  $('btn-human-brain')?.addEventListener('click', () => openModal('human-brain-modal'));
  $('human-brain-close')?.addEventListener('click', () => closeModal('human-brain-modal'));
  $('human-brain-ok')?.addEventListener('click', () => closeModal('human-brain-modal'));

  $('btn-edit-puzzles')?.addEventListener('click', () => {
    if (editMode) {
      toggleEditMode(false);
      return;
    }
    renderSavedList();
    openModal('manage-modal');
  });
  $('manage-close')?.addEventListener('click', () => closeModal('manage-modal'));
  $('manage-close-btn')?.addEventListener('click', () => closeModal('manage-modal'));

  $('btn-toggle-edit-mode')?.addEventListener('click', () => toggleEditMode());

  $('btn-clear-grid')?.addEventListener('click', () => {
    closeModal('manage-modal');
    setBoardSize(currentBoxRows, currentBoxCols, { openEditEmpty: true });
  });

  $('btn-save-current')?.addEventListener('click', () => {
    closeModal('manage-modal');
    $('save-name').value = '';
    openModal('save-modal');
  });

  $('save-cancel')?.addEventListener('click', () => closeModal('save-modal'));
  $('save-cancel-x')?.addEventListener('click', () => closeModal('save-modal'));
  $('save-ok')?.addEventListener('click', () => {
    const name = $('save-name').value.trim() || `My ${currentN}×${currentN} Sudoku`;
    if (loadedStr) {
      const arr = getSavedPuzzles();
      arr.push({ name, str: loadedStr, boxRows: currentBoxRows, boxCols: currentBoxCols });
      setSavedPuzzles(arr);
      showNotice(`Saved "${name}" (${currentN}×${currentN}) successfully!`);
    }
    closeModal('save-modal');
  });

  function positionDropdown(dd) {
    if (!dd || !dd.classList.contains('open')) return;
    dd.style.left = '';
    dd.style.right = '';
    const rect = dd.getBoundingClientRect();
    if (rect.left < 8) {
      dd.style.left = '0';
      dd.style.right = 'auto';
    } else if (rect.right > window.innerWidth - 8) {
      dd.style.right = '0';
      dd.style.left = 'auto';
    }
  }

  $('btn-size-trigger')?.addEventListener('click', e => {
    e.stopPropagation();
    $('puzzle-dropdown')?.classList.remove('open');
    const dd = $('size-dropdown');
    dd?.classList.toggle('open');
    positionDropdown(dd);
  });

  $('btn-load-trigger')?.addEventListener('click', e => {
    e.stopPropagation();
    $('size-dropdown')?.classList.remove('open');
    const dd = $('puzzle-dropdown');
    dd?.classList.toggle('open');
    positionDropdown(dd);
  });

  window.addEventListener('resize', () => {
    positionDropdown($('size-dropdown'));
    positionDropdown($('puzzle-dropdown'));
  });

  document.addEventListener('click', e => {
    if (!e.target.closest('#puzzle-dropdown') && !e.target.closest('#btn-load-trigger')) {
      $('puzzle-dropdown')?.classList.remove('open');
    }
    if (!e.target.closest('#size-dropdown') && !e.target.closest('#btn-size-trigger')) {
      $('size-dropdown')?.classList.remove('open');
    }
  });

  $('paste-cancel')?.addEventListener('click', () => closeModal('paste-modal'));
  $('paste-cancel-x')?.addEventListener('click', () => closeModal('paste-modal'));
  $('paste-ok')?.addEventListener('click', () => {
    const str = $('paste-input').value;
    const board = parsePuzzle(str, currentN);
    if (!board) {
      $('paste-error').textContent = `Invalid — need ${currentN * currentN} values (0–${currentN} or . for blanks).`;
      return;
    }
    closeModal('paste-modal');
    loadBoardAndSolve(board, { name: `Pasted ${currentN}×${currentN}`, sub: `${currentBoxRows}×${currentBoxCols} Custom Input` });
  });

  $('size-cancel')?.addEventListener('click', () => closeModal('size-modal'));
  $('size-cancel-x')?.addEventListener('click', () => closeModal('size-modal'));
  $('custom-box-rows')?.addEventListener('input', updateCustomSizePreview);
  $('custom-box-cols')?.addEventListener('input', updateCustomSizePreview);

  $('size-apply-generate')?.addEventListener('click', () => {
    const dims = updateCustomSizePreview();
    if (!dims) return;
    closeModal('size-modal');
    setBoardSize(dims.boxRows, dims.boxCols, { generateCustom: true });
  });

  $('size-apply-empty')?.addEventListener('click', () => {
    const dims = updateCustomSizePreview();
    if (!dims) return;
    closeModal('size-modal');
    setBoardSize(dims.boxRows, dims.boxCols, { openEditEmpty: true });
  });

  /* ═══════════════════════════════════════════════════════════════════
     CONTROLS WIRING
  ═══════════════════════════════════════════════════════════════════ */
  $('btn-reset')?.addEventListener('click', () => { stopPlay(); applyStep(0); });
  $('btn-back')?.addEventListener('click', () => { stopPlay(); applyStep(currentStep - 1); });
  $('btn-fwd')?.addEventListener('click', () => { stopPlay(); applyStep(currentStep + 1); });
  $('btn-play')?.addEventListener('click', togglePlay);

  $('scrubber')?.addEventListener('input', e => {
    stopPlay();
    applyStep(+e.target.value);
  });

  $('pencil-toggle')?.addEventListener('change', e => {
    showPencil = e.target.checked;
    applyStep(currentStep);
  });

  /* ═══════════════════════════════════════════════════════════════════
     INITIAL BOOTSTRAP (Default 9x9 -> Easy Classic)
  ═══════════════════════════════════════════════════════════════════ */
  setBoardSize(3, 3, { autoLoadFirst: true });
})();
