/* ═══════════════════════════════════════════════════════════════════════════
   GENERIC SUDOKU SOLVER ENGINE
   Matches SudokuSolverOptimized.java: supports any boxRows x boxCols where
   N = boxRows * boxCols and 1 <= N <= 64 using 64-bit BigInt candidate masks,
   worklist propagation (Naked & Hidden Singles), MRV, and LIFO undo.
═══════════════════════════════════════════════════════════════════════════ */

(function (global) {
  'use strict';

  const UNIT_ROW = 0;
  const UNIT_COL = 1;
  const UNIT_BOX = 2;
  const NONE_CELL = -1;
  const MAX_STEPS = 50_000;

  const EV = Object.freeze({
    GIVEN: 'given',
    NAKED: 'naked',
    HIDDEN: 'hidden',
    GUESS: 'guess',
    CONTRA: 'contra',
    BACKTRACK: 'backtrack',
    SOLVED: 'solved',
    UNSOLVABLE: 'unsolvable'
  });

  function popcount32(x) {
    x = x - ((x >>> 1) & 0x55555555);
    x = (x & 0x33333333) + ((x >>> 2) & 0x33333333);
    return Math.imul((x + (x >>> 4)) & 0x0f0f0f0f, 0x01010101) >>> 24;
  }

  function createSolver(boxRows = 3, boxCols = 3) {
    if (!Number.isInteger(boxRows) || !Number.isInteger(boxCols) || boxRows <= 0 || boxCols <= 0) {
      throw new Error('Sub-grid dimensions must be positive integers.');
    }
    const n = boxRows * boxCols;
    if (n > 64) {
      throw new Error(`Board dimension N = ${boxRows} * ${boxCols} = ${n} exceeds 64-bit mask limit (64).`);
    }

    const totalCells = n * n;
    const boxesAcross = n / boxCols;
    const FULL = (1n << BigInt(n)) - 1n;

    const BITS = new Array(n + 1);
    const BIT_TO_VAL = new Map();
    for (let v = 1; v <= n; v++) {
      const bit = 1n << BigInt(v - 1);
      BITS[v] = bit;
      BIT_TO_VAL.set(bit, v);
    }

    const cellRow = new Int32Array(totalCells);
    const cellCol = new Int32Array(totalCells);
    for (let i = 0; i < totalCells; i++) {
      cellRow[i] = (i / n) | 0;
      cellCol[i] = i % n;
    }

    const rowBand = new Int32Array(n);
    const colBand = new Int32Array(n);
    for (let i = 0; i < n; i++) {
      rowBand[i] = (i / boxRows) | 0;
      colBand[i] = (i / boxCols) | 0;
    }

    function boxIdx(r, c) {
      return rowBand[r] * boxesAcross + colBand[c];
    }

    function isSingle(m) {
      return m !== 0n && (m & (m - 1n)) === 0n;
    }

    function lowVal(m) {
      return BIT_TO_VAL.get(m & -m);
    }

    function popcount(m) {
      if (n <= 32) return popcount32(Number(m));
      return popcount32(Number(m & 0xffffffffn)) + popcount32(Number(m >> 32n));
    }

    function maskVals(m) {
      const out = [];
      for (let v = 1; v <= n; v++) {
        if (m & BITS[v]) out.push(v);
      }
      return out;
    }

    const UC = [new Array(n), new Array(n), new Array(n)];
    for (let i = 0; i < n; i++) {
      UC[UNIT_ROW][i] = Array.from({ length: n }, (_, c) => [i, c]);
      UC[UNIT_COL][i] = Array.from({ length: n }, (_, r) => [r, i]);
      const br = ((i / boxesAcross) | 0) * boxRows;
      const bc = (i % boxesAcross) * boxCols;
      const bx = [];
      for (let r = br; r < br + boxRows; r++) {
        for (let c = bc; c < bc + boxCols; c++) {
          bx.push([r, c]);
        }
      }
      UC[UNIT_BOX][i] = bx;
    }

    function explain(type, r, c, v, opts = {}) {
      const { depth = 0, unitType = null, unitIndex = null, candidates = [] } = opts;
      const valWord = n <= 9 ? 'digits' : 'values';
      const valSing = n <= 9 ? 'digit' : 'value';
      function uName(ut, ui) {
        return ut === UNIT_ROW ? `Row ${ui + 1}` : ut === UNIT_COL ? `Column ${ui + 1}` : `Box ${ui + 1}`;
      }

      switch (type) {
        case EV.GIVEN:
          return {
            title: `Starting Clue: R${r + 1}C${c + 1} = ${v}`,
            short: `Starting clue`,
            long: `This cell is one of the fixed ${valWord} provided in the initial ${n}×${n} puzzle, serving as an immutable anchor.`
          };
        case EV.NAKED:
          return {
            title: `Naked Single: R${r + 1}C${c + 1} = ${v}`,
            short: `R${r + 1}C${c + 1} = ${v} — only candidate remaining`,
            long: `All ${n - 1} other ${valWord} already appear in this cell's row, column, or ${boxRows}×${boxCols} box. Therefore, only <strong>${v}</strong> is legally possible.`
          };
        case EV.HIDDEN: {
          const un = uName(unitType, unitIndex);
          return {
            title: `Hidden Single: R${r + 1}C${c + 1} = ${v}`,
            short: `R${r + 1}C${c + 1} = ${v} — sole cell in ${un} for ${v}`,
            long: `Inside <strong>${un}</strong>, the ${valSing} <strong>${v}</strong> can only fit into cell R${r + 1}C${c + 1}. All peer cells are constrained.`
          };
        }
        case EV.GUESS: {
          const candStr = candidates.join(', ');
          return {
            title: `Guess (MRV): R${r + 1}C${c + 1} = ${v} · Depth ${depth + 1}`,
            short: `Guess R${r + 1}C${c + 1} = ${v} (depth ${depth + 1})`,
            long: `No direct singles remain. Selected cell R${r + 1}C${c + 1} with the Minimum Remaining Values (MRV) heuristic: only <strong>${candidates.length} options</strong> (${candStr}). Trying ${v} first.`
          };
        }
        case EV.CONTRA:
          return {
            title: `Contradiction Encountered`,
            short: `Dead end — 0 candidates remain`,
            long: `An empty cell or unit reached 0 legal placements. This proves an earlier guess in the search branch was invalid; backtracking initiated.`
          };
        case EV.BACKTRACK:
          return {
            title: `Backtrack: Guess ${v} at R${r + 1}C${c + 1} Rolled Back`,
            short: `Backtrack — guess ${v} failed (depth ${depth + 1})`,
            long: `Branch starting with ${v} led to a contradiction. Restored cell states via LIFO undo log and trying next candidate.`
          };
        case EV.SOLVED:
          return {
            title: `🎉 Puzzle Fully Solved!`,
            short: `Puzzle solved! All ${totalCells} cells satisfied`,
            long: `Every cell is filled and all ${3 * n} units (${n} rows, ${n} columns, ${n} boxes of ${boxRows}×${boxCols}) contain ${valWord} 1–${n} without conflicts.`
          };
        case EV.UNSOLVABLE:
          return {
            title: `❌ No Legal Solution Exists`,
            short: `Exhaustive search complete — no legal solution exists`,
            long: `All candidate assignments and constraint propagation branches have been exhaustively evaluated. Every pathway reached a contradiction, proving there is <strong>no legal solution</strong> for this puzzle.`
          };
        default:
          return { title: type, short: type, long: type };
      }
    }

    function isValid(board) {
      if (!board || board.length !== totalCells) return false;
      const rS = new Array(n).fill(0n);
      const cS = new Array(n).fill(0n);
      const bS = new Array(n).fill(0n);
      for (let r = 0; r < n; r++) {
        for (let c = 0; c < n; c++) {
          const v = board[r * n + c];
          if (!Number.isInteger(v) || v < 0 || v > n) return false;
          if (v === 0) continue;
          const bit = BITS[v];
          const bx = boxIdx(r, c);
          if ((rS[r] & bit) || (cS[c] & bit) || (bS[bx] & bit)) return false;
          rS[r] |= bit;
          cS[c] |= bit;
          bS[bx] |= bit;
        }
      }
      return true;
    }

    function findConflicts(board) {
      const conf = new Set();
      if (!board || board.length !== totalCells) return conf;
      const rM = Array.from({ length: n }, () => new Map());
      const cM = Array.from({ length: n }, () => new Map());
      const bM = Array.from({ length: n }, () => new Map());
      for (let r = 0; r < n; r++) {
        for (let c = 0; c < n; c++) {
          const code = r * n + c;
          const v = board[code];
          if (!v) continue;
          const bx = boxIdx(r, c);
          if (rM[r].has(v)) { conf.add(code); conf.add(rM[r].get(v)); } else rM[r].set(v, code);
          if (cM[c].has(v)) { conf.add(code); conf.add(cM[c].get(v)); } else cM[c].set(v, code);
          if (bM[bx].has(v)) { conf.add(code); conf.add(bM[bx].get(v)); } else bM[bx].set(v, code);
        }
      }
      return conf;
    }

    function computeCands(board) {
      const rU = new Array(n).fill(0n);
      const cU = new Array(n).fill(0n);
      const bU = new Array(n).fill(0n);
      for (let r = 0; r < n; r++) {
        for (let c = 0; c < n; c++) {
          const v = board[r * n + c];
          if (v >= 1 && v <= n) {
            const b = BITS[v];
            rU[r] |= b;
            cU[c] |= b;
            bU[boxIdx(r, c)] |= b;
          }
        }
      }
      const out = new Array(totalCells).fill(0n);
      for (let r = 0; r < n; r++) {
        for (let c = 0; c < n; c++) {
          const code = r * n + c;
          if (!board[code]) {
            out[code] = FULL & ~(rU[r] | cU[c] | bU[boxIdx(r, c)]);
          }
        }
      }
      return out;
    }

    function solve(flatBoard, options = {}) {
      const maxSteps = options.maxSteps ?? MAX_STEPS;
      const recordSteps = options.recordSteps !== false;
      const steps = [];
      const board = new Int32Array(flatBoard);
      if (!isValid(board)) return { steps, solved: false, capped: false, valid: false };

      const rowU = new Array(n).fill(0n);
      const colU = new Array(n).fill(0n);
      const boxU = new Array(n).fill(0n);
      const ePrev = new Int32Array(totalCells).fill(-1);
      const eNext = new Int32Array(totalCells).fill(-1);
      let eHead = -1;
      let eTail = -1;
      let stepCount = 0;

      function initEmpty() {
        let last = -1;
        eHead = -1;
        eTail = -1;
        for (let r = 0; r < n; r++) {
          for (let c = 0; c < n; c++) {
            const code = r * n + c;
            if (board[code]) continue;
            ePrev[code] = last;
            eNext[code] = -1;
            if (last === -1) eHead = code;
            else eNext[last] = code;
            last = code;
          }
        }
        eTail = last;
      }

      function rmEmpty(code) {
        const p = ePrev[code];
        const nx = eNext[code];
        if (p !== -1) eNext[p] = nx; else eHead = nx;
        if (nx !== -1) ePrev[nx] = p; else eTail = p;
      }

      function restoreEmpty(code) {
        const p = ePrev[code];
        const nx = eNext[code];
        if (p !== -1) eNext[p] = code; else eHead = code;
        if (nx !== -1) ePrev[nx] = code; else eTail = code;
      }

      function candMask(r, c) {
        return FULL & ~(rowU[r] | colU[c] | boxU[boxIdx(r, c)]);
      }

      function markUsed(r, c, v) {
        const b = BITS[v];
        const bx = boxIdx(r, c);
        rowU[r] |= b;
        colU[c] |= b;
        boxU[bx] |= b;
      }

      function placeCell(r, c, v) {
        markUsed(r, c, v);
        rmEmpty(r * n + c);
      }

      function unplace(r, c, v) {
        const b = BITS[v];
        const bx = boxIdx(r, c);
        rowU[r] &= ~b;
        colU[c] &= ~b;
        boxU[bx] &= ~b;
        restoreEmpty(r * n + c);
      }

      function snap() {
        return board.slice();
      }

      const guessStack = [];
      function stackSnap() {
        return guessStack.map(f => ({ ...f }));
      }

      function pushStep(s) {
        stepCount++;
        if (!recordSteps) return;
        s.stack = stackSnap();
        steps.push(s);
      }

      for (let r = 0; r < n; r++) {
        for (let c = 0; c < n; c++) {
          const v = board[r * n + c];
          if (v) markUsed(r, c, v);
        }
      }
      initEmpty();

      pushStep({
        type: EV.GIVEN,
        row: null,
        col: null,
        val: 0,
        depth: 0,
        candidates: [],
        unitType: null,
        unitIndex: null,
        title: 'Initial Puzzle State',
        explainShort: 'Ready to solve',
        explainLong: `Press Play or use the arrow keys to explore each solver decision on this ${n}×${n} board (${boxRows}×${boxCols} sub-grids).`,
        board: recordSteps ? snap() : null
      });

      let gen = 0;
      const cellGen = new Int32Array(totalCells);
      const unitGen = new Int32Array(3 * n);

      function enqCell(r, c, cellQ) {
        const code = r * n + c;
        if (board[code]) return;
        if (cellGen[code] === gen) return;
        cellGen[code] = gen;
        cellQ.push(code);
      }

      function enqUnit(ut, ui, unitQ) {
        const code = ut * n + ui;
        if (unitGen[code] === gen) return;
        unitGen[code] = gen;
        unitQ.push(code);
      }

      function enqPeers(r, c, cellQ, unitQ) {
        for (let cc = 0; cc < n; cc++) if (cc !== c) enqCell(r, cc, cellQ);
        for (let rr = 0; rr < n; rr++) if (rr !== r) enqCell(rr, c, cellQ);
        const sr = rowBand[r] * boxRows;
        const sc = colBand[c] * boxCols;
        for (let rr = sr; rr < sr + boxRows; rr++) {
          for (let cc = sc; cc < sc + boxCols; cc++) {
            if (rr !== r && cc !== c) enqCell(rr, cc, cellQ);
          }
        }
        enqUnit(UNIT_ROW, r, unitQ);
        enqUnit(UNIT_COL, c, unitQ);
        enqUnit(UNIT_BOX, boxIdx(r, c), unitQ);
      }

      function placeRecord(r, c, v, evType, depth, unitType, unitIndex, extraOpts) {
        board[r * n + c] = v;
        placeCell(r, c, v);
        if (!recordSteps) {
          stepCount++;
          return;
        }
        const ex = explain(evType, r, c, v, { depth, unitType, unitIndex, ...extraOpts });
        pushStep({
          type: evType,
          row: r,
          col: c,
          val: v,
          depth,
          candidates: extraOpts.candidates || [],
          unitType,
          unitIndex,
          title: ex.title,
          explainShort: ex.short,
          explainLong: ex.long,
          board: snap()
        });
      }

      let capped = false;

      function pushSimpleEvent(type, r, c, depth, unitType, unitIndex) {
        if (!recordSteps) {
          stepCount++;
          return;
        }
        const ex = explain(type, r, c, 0, { depth, unitType, unitIndex });
        pushStep({
          type,
          row: r,
          col: c,
          val: 0,
          depth,
          candidates: [],
          unitType,
          unitIndex,
          title: ex.title,
          explainShort: ex.short,
          explainLong: ex.long,
          board: snap()
        });
      }

      function checkHS(ut, ui, cellQ, unitQ, log, depth) {
        const uUsed = ut === UNIT_ROW ? rowU[ui] : ut === UNIT_COL ? colU[ui] : boxU[ui];
        if (uUsed === FULL) return true;
        const cells = UC[ut][ui];
        let seenOnce = 0n;
        let seenTwice = 0n;
        const masks = new Array(n);

        for (let i = 0; i < n; i++) {
          const [r, c] = cells[i];
          if (board[r * n + c]) {
            masks[i] = 0n;
            continue;
          }
          const mask = candMask(r, c);
          if (mask === 0n) {
            pushSimpleEvent(EV.CONTRA, r, c, depth, ut, ui);
            return false;
          }
          masks[i] = mask;
          seenTwice |= (seenOnce & mask);
          seenOnce |= mask;
        }

        if ((FULL & ~seenOnce & ~uUsed) !== 0n) {
          pushSimpleEvent(EV.CONTRA, null, null, depth, ut, ui);
          return false;
        }

        const hs = seenOnce & ~seenTwice;
        if (hs === 0n) return true;

        for (let v = 1; v <= n; v++) {
          if (stepCount >= maxSteps) return 'cap';
          const bit = BITS[v];
          if ((hs & bit) === 0n) continue;
          for (let i = 0; i < n; i++) {
            const [r, c] = cells[i];
            if (board[r * n + c]) continue;
            if ((masks[i] & bit) === 0n) continue;
            placeRecord(r, c, v, EV.HIDDEN, depth, ut, ui, { candidates: [v] });
            log.push(r * n + c);
            enqPeers(r, c, cellQ, unitQ);
            break;
          }
        }
        return true;
      }

      function propagate(justCode, log, depth) {
        gen++;
        const cellQ = [];
        const unitQ = [];
        let cHead = 0;
        let uHead = 0;

        if (justCode === NONE_CELL) {
          for (let r = 0; r < n; r++) {
            for (let c = 0; c < n; c++) enqCell(r, c, cellQ);
          }
          for (let i = 0; i < n; i++) {
            enqUnit(UNIT_ROW, i, unitQ);
            enqUnit(UNIT_COL, i, unitQ);
            enqUnit(UNIT_BOX, i, unitQ);
          }
        } else {
          enqPeers(cellRow[justCode], cellCol[justCode], cellQ, unitQ);
        }

        while (cHead < cellQ.length || uHead < unitQ.length) {
          while (cHead < cellQ.length) {
            if (stepCount >= maxSteps) return 'cap';
            const code = cellQ[cHead++];
            cellGen[code] = 0;
            const r = cellRow[code];
            const c = cellCol[code];
            if (board[code]) continue;
            const mask = candMask(r, c);
            if (mask === 0n) {
              pushSimpleEvent(EV.CONTRA, r, c, depth, null, null);
              return false;
            }
            if (isSingle(mask)) {
              const v = lowVal(mask);
              placeRecord(r, c, v, EV.NAKED, depth, null, null, { candidates: [v] });
              log.push(code);
              enqPeers(r, c, cellQ, unitQ);
            }
          }
          if (uHead < unitQ.length) {
            if (stepCount >= maxSteps) return 'cap';
            const uc = unitQ[uHead++];
            unitGen[uc] = 0;
            const ut = (uc / n) | 0;
            const ui = uc % n;
            const res = checkHS(ut, ui, cellQ, unitQ, log, depth);
            if (res === false) return false;
            if (res === 'cap') return 'cap';
          }
        }
        return true;
      }

      function undoLog(log) {
        for (let i = log.length - 1; i >= 0; i--) {
          const code = log[i];
          const r = cellRow[code];
          const c = cellCol[code];
          const v = board[code];
          board[code] = 0;
          unplace(r, c, v);
        }
      }

      function findBest() {
        let best = -1;
        let minC = n + 1;
        for (let code = eHead; code !== -1; code = eNext[code]) {
          const r = cellRow[code];
          const c = cellCol[code];
          const cnt = popcount(candMask(r, c));
          if (cnt < minC) {
            minC = cnt;
            best = code;
            if (minC === 1) break;
          }
        }
        return best;
      }

      function solveBoard(justCode, depth) {
        const log = [];
        const res = propagate(justCode, log, depth);
        if (res === false) { undoLog(log); return false; }
        if (res === 'cap') { capped = true; undoLog(log); return false; }

        const best = findBest();
        if (best === -1) {
          pushSimpleEvent(EV.SOLVED, null, null, depth, null, null);
          return true;
        }

        const r = cellRow[best];
        const c = cellCol[best];
        const mask = candMask(r, c);
        const cands = maskVals(mask);

        for (let v = 1; v <= n; v++) {
          if (stepCount >= maxSteps) { capped = true; undoLog(log); return false; }
          if ((mask & BITS[v]) === 0n) continue;
          const remaining = cands.filter(x => x > v);

          if (recordSteps) {
            guessStack.push({ depth: depth + 1, row: r, col: c, val: v, candidates: cands.slice(), remaining });
            const exG = explain(EV.GUESS, r, c, v, { depth, candidates: cands, remaining });
            pushStep({
              type: EV.GUESS,
              row: r,
              col: c,
              val: v,
              depth,
              candidates: cands.slice(),
              unitType: null,
              unitIndex: null,
              title: exG.title,
              explainShort: exG.short,
              explainLong: exG.long,
              board: snap()
            });
          } else {
            stepCount++;
          }

          board[best] = v;
          placeCell(r, c, v);
          if (solveBoard(best, depth + 1)) return true;
          board[best] = 0;
          unplace(r, c, v);

          if (recordSteps) {
            guessStack.pop();
            const exB = explain(EV.BACKTRACK, r, c, v, { depth, candidates: cands, remaining });
            pushStep({
              type: EV.BACKTRACK,
              row: r,
              col: c,
              val: v,
              depth,
              candidates: cands.slice(),
              unitType: null,
              unitIndex: null,
              title: exB.title,
              explainShort: exB.short,
              explainLong: exB.long,
              board: snap()
            });
          } else {
            stepCount++;
          }
        }
        undoLog(log);
        return false;
      }

      const solved = solveBoard(NONE_CELL, 0);
      if (!solved && !capped) {
        pushSimpleEvent(EV.UNSOLVABLE, null, null, 0, null, null);
      }
      return { steps, solved, capped, valid: true, finalBoard: board, stepCount };
    }

    function getUnitCells(unitType, unitIndex) {
      return UC[unitType]?.[unitIndex] || [];
    }

    return {
      n,
      boxRows,
      boxCols,
      totalCells,
      boxesAcross,
      solve,
      isValid,
      findConflicts,
      computeCands,
      maskVals,
      getUnitCells
    };
  }

  /* ═══════════════════════════════════════════════════════════════════════
     PUZZLE SERIALIZATION & PARSING (Any N <= 64)
  ═══════════════════════════════════════════════════════════════════════ */
  function serializeBoard(board, n) {
    const arr = Array.from(board);
    if (n <= 9) return arr.join('');
    return arr.join(' ');
  }

  function parsePuzzle(str, n) {
    const total = n * n;
    const trimmed = (str || '').trim();
    if (!trimmed) return null;

    // 1) Whitespace or comma-separated token mode (works for any N, required when tokens > 1 char)
    const tokens = trimmed.split(/[\s,;]+/).filter(Boolean);
    if (tokens.length === total) {
      const out = new Int32Array(total);
      for (let i = 0; i < total; i++) {
        const t = tokens[i];
        if (t === '.' || t === '0') {
          out[i] = 0;
          continue;
        }
        if (/^\d+$/.test(t)) {
          const v = parseInt(t, 10);
          if (v < 0 || v > n) return null;
          out[i] = v;
        } else if (t.length === 1 && /^[a-zA-Z]$/.test(t)) {
          const v = t.toUpperCase().charCodeAt(0) - 55; // A=10 .. Z=35
          if (v > n) return null;
          out[i] = v;
        } else {
          return null;
        }
      }
      return out;
    }

    // 2) Compact single-character-per-cell string (supports N <= 35: 0/. empty, 1-9, A-Z)
    const compact = trimmed.replace(/\s+/g, '').replace(/\./g, '0');
    if (compact.length !== total) return null;
    const out = new Int32Array(total);
    for (let i = 0; i < total; i++) {
      const ch = compact[i];
      let v = -1;
      if (ch >= '0' && ch <= '9') v = ch.charCodeAt(0) - 48;
      else if (ch >= 'a' && ch <= 'z') v = ch.toUpperCase().charCodeAt(0) - 55;
      else if (ch >= 'A' && ch <= 'Z') v = ch.charCodeAt(0) - 55;
      if (v < 0 || v > n) return null;
      out[i] = v;
    }
    return out;
  }

  /* ═══════════════════════════════════════════════════════════════════════
     SHUFFLED PUZZLE GENERATOR FOR CUSTOM (boxRows x boxCols) SIZES
  ═══════════════════════════════════════════════════════════════════════ */
  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = (Math.random() * (i + 1)) | 0;
      const tmp = arr[i];
      arr[i] = arr[j];
      arr[j] = tmp;
    }
    return arr;
  }

  function generateSolvedBoard(boxRows, boxCols) {
    const n = boxRows * boxCols;
    const boxesAcross = n / boxCols; // == boxRows
    const boxesDown = n / boxRows;   // == boxCols

    const digitPerm = shuffle(Array.from({ length: n }, (_, i) => i + 1));

    const bandOrderR = shuffle(Array.from({ length: boxesDown }, (_, i) => i));
    const rowMap = [];
    for (const b of bandOrderR) {
      const inner = shuffle(Array.from({ length: boxRows }, (_, i) => b * boxRows + i));
      rowMap.push(...inner);
    }

    const bandOrderC = shuffle(Array.from({ length: boxesAcross }, (_, i) => i));
    const colMap = [];
    for (const b of bandOrderC) {
      const inner = shuffle(Array.from({ length: boxCols }, (_, i) => b * boxCols + i));
      colMap.push(...inner);
    }

    const board = new Int32Array(n * n);
    for (let r = 0; r < n; r++) {
      const sr = rowMap[r];
      for (let c = 0; c < n; c++) {
        const sc = colMap[c];
        const base = ((sr * boxCols + ((sr / boxRows) | 0) + sc) % n);
        board[r * n + c] = digitPerm[base];
      }
    }
    return board;
  }

  function generatePuzzle(boxRows, boxCols) {
    const solver = createSolver(boxRows, boxCols);
    const n = solver.n;
    const total = solver.totalCells;
    const solved = generateSolvedBoard(boxRows, boxCols);
    const puzzle = solved.slice();
    const indices = shuffle(Array.from({ length: total }, (_, i) => i));

    // Aim for ~45-55% empty cells on small/medium boards, ~40% on huge boards
    const targetEmpty = n <= 9 ? Math.floor(total * 0.56)
      : n <= 16 ? Math.floor(total * 0.48)
      : Math.floor(total * 0.40);

    if (n <= 12) {
      let removed = 0;
      for (const idx of indices) {
        if (removed >= targetEmpty) break;
        const backup = puzzle[idx];
        puzzle[idx] = 0;
        const res = solver.solve(puzzle, { recordSteps: false, maxSteps: 2500 });
        if (res.solved && !res.capped) {
          removed++;
        } else {
          puzzle[idx] = backup;
        }
      }
      return puzzle;
    }

    // Fast generation for large boards (16x16 up to 64x64): remove in batch, restore if capped
    for (let i = 0; i < targetEmpty; i++) {
      puzzle[indices[i]] = 0;
    }
    let removedCursor = targetEmpty - 1;
    for (let attempt = 0; attempt < 16 && removedCursor >= 0; attempt++) {
      const res = solver.solve(puzzle, { recordSteps: false, maxSteps: 4000 });
      if (res.solved && !res.capped) break;
      const restoreBatch = Math.max(1, Math.ceil(total * 0.04));
      for (let k = 0; k < restoreBatch && removedCursor >= 0; k++) {
        const idx = indices[removedCursor--];
        puzzle[idx] = solved[idx];
      }
    }
    return puzzle;
  }

  const api = {
    EV,
    UNIT_ROW,
    UNIT_COL,
    UNIT_BOX,
    MAX_STEPS,
    createSolver,
    serializeBoard,
    parsePuzzle,
    generatePuzzle,
    generateSolvedBoard
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    global.SudokuEngine = api;
  }
})(typeof window !== 'undefined' ? window : globalThis);
