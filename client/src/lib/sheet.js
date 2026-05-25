export const ROWS = 36;
export const COLS = 12;

export const columnName = (index) => String.fromCharCode(65 + index);
export const cellId = (row, col) => `${columnName(col)}${row + 1}`;

function parseNumberLiteral(input) {
  const source = String(input ?? '').trim();
  if (!source) return NaN;

  const cleaned = source.replace(/[$,\s]/g, '');
  const percent = cleaned.endsWith('%');
  const number = Number(percent ? cleaned.slice(0, -1) : cleaned);
  if (!Number.isFinite(number)) return NaN;
  return percent ? number / 100 : number;
}

export function emptyGrid(rows = ROWS, cols = COLS) {
  return Array.from({ length: rows }, () => Array(cols).fill(''));
}

export function normalizeGrid(input, rows = ROWS, cols = COLS) {
  const grid = emptyGrid(rows, cols);
  if (!Array.isArray(input)) return grid;

  input.slice(0, rows).forEach((row, r) => {
    if (!Array.isArray(row)) return;
    row.slice(0, cols).forEach((cell, c) => {
      grid[r][c] = cell == null ? '' : String(cell);
    });
  });

  return grid;
}

export function parseRef(ref) {
  const match = /^([A-L])(\d+)$/i.exec(String(ref).trim());
  if (!match) return null;
  const row = Number(match[2]) - 1;
  const col = match[1].toUpperCase().charCodeAt(0) - 65;
  if (row < 0 || row >= ROWS || col < 0 || col >= COLS) return null;
  return { row, col };
}

function parseRefToken(token) {
  const match = /^\$?([A-L])\$?(\d+)$/i.exec(String(token).trim());
  return match ? parseRef(`${match[1]}${match[2]}`) : null;
}

function parseRangeToken(token) {
  const match = /^\$?([A-L])\$?(\d+):\$?([A-L])\$?(\d+)$/i.exec(String(token).trim());
  if (!match) return null;

  const start = parseRef(`${match[1]}${match[2]}`);
  const end = parseRef(`${match[3]}${match[4]}`);
  if (!start || !end) return null;

  return {
    start: { row: Math.min(start.row, end.row), col: Math.min(start.col, end.col) },
    end: { row: Math.max(start.row, end.row), col: Math.max(start.col, end.col) }
  };
}

function tokenContainsCell(token, row, col) {
  const range = parseRangeToken(token);
  if (range) {
    return row >= range.start.row && row <= range.end.row && col >= range.start.col && col <= range.end.col;
  }

  const ref = parseRefToken(token);
  return Boolean(ref && ref.row === row && ref.col === col);
}

function errorValue(value) {
  return typeof value === 'string' && value.startsWith('#');
}

function rangeValues(grid, input, visiting, evaluateCell) {
  const values = [];
  const parts = String(input || '').split(',');

  parts.forEach((part) => {
    const rangeMatch = /^\$?([A-L])\$?(\d+):\$?([A-L])\$?(\d+)$/i.exec(part.trim());
    if (rangeMatch) {
      const c1 = rangeMatch[1].toUpperCase().charCodeAt(0) - 65;
      const r1 = Number(rangeMatch[2]) - 1;
      const c2 = rangeMatch[3].toUpperCase().charCodeAt(0) - 65;
      const r2 = Number(rangeMatch[4]) - 1;
      for (let r = Math.min(r1, r2); r <= Math.max(r1, r2); r += 1) {
        for (let c = Math.min(c1, c2); c <= Math.max(c1, c2); c += 1) {
          if (r >= 0 && r < ROWS && c >= 0 && c < COLS) {
            const value = evaluateCell(grid, r, c, visiting);
            if (errorValue(value)) throw new Error(value);
            if (typeof value === 'number' && Number.isFinite(value)) values.push(value);
          }
        }
      }
      return;
    }

    const ref = parseRef(part);
    if (ref) {
      const value = evaluateCell(grid, ref.row, ref.col, visiting);
      if (errorValue(value)) throw new Error(value);
      if (typeof value === 'number' && Number.isFinite(value)) values.push(value);
      return;
    }

    const literal = parseNumberLiteral(part);
    if (Number.isFinite(literal)) values.push(literal);
  });

  return values;
}

function rangeCells(grid, input, visiting, evaluateCell) {
  const cells = [];
  const range = parseRangeToken(String(input || '').trim());

  if (range) {
    for (let r = range.start.row; r <= range.end.row; r += 1) {
      for (let c = range.start.col; c <= range.end.col; c += 1) {
        const value = evaluateCell(grid, r, c, visiting);
        if (errorValue(value)) throw new Error(value);
        cells.push({ row: r, col: c, raw: String(grid[r]?.[c] || '').trim(), value });
      }
    }
    return cells;
  }

  const ref = parseRefToken(input);
  if (ref) {
    const value = evaluateCell(grid, ref.row, ref.col, visiting);
    if (errorValue(value)) throw new Error(value);
    cells.push({ row: ref.row, col: ref.col, raw: String(grid[ref.row]?.[ref.col] || '').trim(), value });
  }

  return cells;
}

function splitFormulaArgs(input) {
  const args = [];
  let depth = 0;
  let current = '';

  for (const char of String(input || '')) {
    if (char === '(') depth += 1;
    if (char === ')') depth -= 1;

    if (char === ',' && depth === 0) {
      args.push(current);
      current = '';
      continue;
    }

    current += char;
  }

  args.push(current);
  return args.map((arg) => arg.trim());
}

function replaceReferences(grid, expression, visiting, evaluateCell) {
  return expression.replace(/\$?([A-L])\$?(\d+)/gi, (_full, letter, number) => {
    const ref = parseRef(`${letter}${number}`);
    if (!ref) return '0';
    const value = evaluateCell(grid, ref.row, ref.col, visiting);
    if (errorValue(value)) throw new Error(value);
    if (typeof value === 'boolean') return value ? '1' : '0';
    return typeof value === 'number' && Number.isFinite(value) ? String(value) : '0';
  });
}

function evaluateExpression(grid, input, visiting, evaluateCell) {
  let expression = String(input || '0').replace(/\s+/g, '');
  expression = expandFunctions(grid, expression, visiting, evaluateCell);
  expression = replaceReferences(grid, expression, visiting, evaluateCell);
  if (!/^[-+/*().,0-9eE%<>=! ]*$/.test(expression)) throw new Error('Unsafe formula');
  return Function(`"use strict"; return (${expression})`)();
}

function numericExpression(grid, input, visiting, evaluateCell) {
  const value = evaluateExpression(grid, input, visiting, evaluateCell);
  if (typeof value === 'boolean') return value ? 1 : 0;
  return Number.isFinite(value) ? value : 0;
}

function median(values) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const midpoint = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[midpoint] : (sorted[midpoint - 1] + sorted[midpoint]) / 2;
}

function variance(values, sample = true) {
  if (!values.length || (sample && values.length < 2)) return 0;
  const average = values.reduce((sum, value) => sum + value, 0) / values.length;
  const divisor = sample ? values.length - 1 : values.length;
  return values.reduce((sum, value) => sum + (value - average) ** 2, 0) / divisor;
}

function stripCriterion(input) {
  return String(input || '').trim().replace(/^["']|["']$/g, '');
}

function compareCriterion(value, raw, criterion) {
  const source = stripCriterion(criterion);
  const match = /^(>=|<=|<>|>|<|=)?(.*)$/.exec(source);
  const operator = match?.[1] || '=';
  const targetRaw = (match?.[2] || '').trim();
  const valueNumber = typeof value === 'number' ? value : parseNumberLiteral(raw);
  const targetNumber = parseNumberLiteral(targetRaw);

  if (Number.isFinite(valueNumber) && Number.isFinite(targetNumber)) {
    if (operator === '>') return valueNumber > targetNumber;
    if (operator === '>=') return valueNumber >= targetNumber;
    if (operator === '<') return valueNumber < targetNumber;
    if (operator === '<=') return valueNumber <= targetNumber;
    if (operator === '<>') return valueNumber !== targetNumber;
    return valueNumber === targetNumber;
  }

  const valueText = String(value ?? raw ?? '').toLowerCase();
  const targetText = targetRaw.toLowerCase();

  if (targetText.includes('*')) {
    const pattern = new RegExp(`^${targetText.split('*').map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*')}$`, 'i');
    return operator === '<>' ? !pattern.test(valueText) : pattern.test(valueText);
  }

  if (operator === '<>') return valueText !== targetText;
  return valueText === targetText;
}

function conditionalAggregate(grid, args, visiting, evaluateCell, mode) {
  const criteriaCells = rangeCells(grid, args[0], visiting, evaluateCell);
  const sumCells = mode === 'COUNTIF' ? criteriaCells : rangeCells(grid, args[2] || args[0], visiting, evaluateCell);
  const matched = [];

  criteriaCells.forEach((cell, index) => {
    if (!compareCriterion(cell.value, cell.raw, args[1])) return;
    const target = sumCells[index] || cell;
    if (mode === 'COUNTIF') {
      matched.push(1);
      return;
    }
    if (typeof target.value === 'number' && Number.isFinite(target.value)) matched.push(target.value);
  });

  if (mode === 'COUNTIF') return matched.length;
  if (mode === 'AVERAGEIF') return matched.length ? matched.reduce((sum, value) => sum + value, 0) / matched.length : 0;
  return matched.reduce((sum, value) => sum + value, 0);
}

function scalarValue(grid, input, visiting, evaluateCell) {
  const source = String(input || '').trim();
  const quoted = /^["'].*["']$/.test(source);
  if (quoted) return stripCriterion(source);

  const ref = parseRefToken(source);
  if (ref) return evaluateCell(grid, ref.row, ref.col, visiting);

  const numeric = parseNumberLiteral(source);
  if (Number.isFinite(numeric)) return numeric;

  try {
    return evaluateExpression(grid, source, visiting, evaluateCell);
  } catch {
    return stripCriterion(source);
  }
}

function comparableValue(value, raw = '') {
  if (typeof value === 'number' && Number.isFinite(value)) return { kind: 'number', value };
  const numeric = parseNumberLiteral(raw);
  if (Number.isFinite(numeric)) return { kind: 'number', value: numeric };
  return { kind: 'text', value: String(value ?? raw ?? '').trim().toLowerCase() };
}

function sameComparable(a, b) {
  if (a.kind === 'number' && b.kind === 'number') return a.value === b.value;
  return String(a.value).toLowerCase() === String(b.value).toLowerCase();
}

function uniqueCount(grid, input, visiting, evaluateCell) {
  const cells = rangeCells(grid, input, visiting, evaluateCell);
  const values = new Set();

  cells.forEach((cell) => {
    const raw = String(cell.raw || '').trim();
    const rendered = String(cell.value ?? '').trim();
    if (!raw && !rendered) return;
    values.add(`${typeof cell.value}:${rendered.toLowerCase()}`);
  });

  return values.size;
}

function rankValue(grid, args, visiting, evaluateCell) {
  const target = numericExpression(grid, args[0], visiting, evaluateCell);
  const values = rangeValues(grid, args[1], visiting, evaluateCell);
  const ascending = numericExpression(grid, args[2] || '0', visiting, evaluateCell) > 0;
  const sorted = [...values].sort((a, b) => (ascending ? a - b : b - a));
  const index = sorted.findIndex((value) => value === target);
  return index < 0 ? 0 : index + 1;
}

function percentileValue(grid, args, visiting, evaluateCell) {
  const values = rangeValues(grid, args[0], visiting, evaluateCell).sort((a, b) => a - b);
  if (!values.length) return 0;

  const percentile = Math.max(0, Math.min(1, numericExpression(grid, args[1] || '0', visiting, evaluateCell)));
  const position = (values.length - 1) * percentile;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return values[lower];
  return values[lower] + (values[upper] - values[lower]) * (position - lower);
}

function vlookupValue(grid, args, visiting, evaluateCell) {
  const table = parseRangeToken(args[1]);
  if (!table) return 0;

  const lookup = comparableValue(scalarValue(grid, args[0], visiting, evaluateCell), args[0]);
  const columnOffset = Math.max(1, Math.round(numericExpression(grid, args[2] || '1', visiting, evaluateCell))) - 1;
  const targetCol = table.start.col + columnOffset;
  if (targetCol > table.end.col) return 0;

  for (let row = table.start.row; row <= table.end.row; row += 1) {
    const raw = String(grid[row]?.[table.start.col] || '').trim();
    const value = evaluateCell(grid, row, table.start.col, visiting);
    if (!sameComparable(comparableValue(value, raw), lookup)) continue;

    const result = evaluateCell(grid, row, targetCol, visiting);
    if (typeof result === 'number' && Number.isFinite(result)) return result;
    return parseNumberLiteral(grid[row]?.[targetCol]);
  }

  return 0;
}

function expandFunctions(grid, expression, visiting, evaluateCell) {
  const functions = [
    'AVERAGEIF',
    'UNIQUECOUNT',
    'PERCENTILE',
    'VLOOKUP',
    'COUNTIF',
    'PRODUCT',
    'MEDIAN',
    'STDEV',
    'SUMIF',
    'AVERAGE',
    'COUNT',
    'ROUND',
    'RANK',
    'SUM',
    'AVG',
    'MIN',
    'MAX',
    'VAR',
    'ABS',
    'AND',
    'OR',
    'IF'
  ];
  let next = expression;
  let changed = true;

  while (changed) {
    changed = false;
    for (const fn of functions) {
      const match = new RegExp(`${fn}\\(([^()]*)\\)`, 'i').exec(next);
      if (!match) continue;

      const upper = fn.toUpperCase();
      const args = splitFormulaArgs(match[1]);
      let result = 0;

      if (['SUM', 'AVERAGE', 'AVG', 'MIN', 'MAX', 'COUNT', 'MEDIAN', 'PRODUCT', 'STDEV', 'VAR'].includes(upper)) {
        const values = rangeValues(grid, match[1], visiting, evaluateCell);
        if (upper === 'SUM') result = values.reduce((sum, value) => sum + value, 0);
        if (upper === 'AVERAGE' || upper === 'AVG') {
          result = values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
        }
        if (upper === 'MIN') result = values.length ? Math.min(...values) : 0;
        if (upper === 'MAX') result = values.length ? Math.max(...values) : 0;
        if (upper === 'COUNT') result = values.length;
        if (upper === 'MEDIAN') result = median(values);
        if (upper === 'PRODUCT') result = values.length ? values.reduce((product, value) => product * value, 1) : 0;
        if (upper === 'STDEV') result = Math.sqrt(variance(values));
        if (upper === 'VAR') result = variance(values);
      }

      if (['SUMIF', 'COUNTIF', 'AVERAGEIF'].includes(upper)) {
        result = conditionalAggregate(grid, args, visiting, evaluateCell, upper);
      }

      if (upper === 'UNIQUECOUNT') result = uniqueCount(grid, match[1], visiting, evaluateCell);
      if (upper === 'RANK') result = rankValue(grid, args, visiting, evaluateCell);
      if (upper === 'PERCENTILE') result = percentileValue(grid, args, visiting, evaluateCell);
      if (upper === 'VLOOKUP') result = vlookupValue(grid, args, visiting, evaluateCell);
      if (upper === 'ABS') result = Math.abs(numericExpression(grid, args[0], visiting, evaluateCell));
      if (upper === 'AND') result = args.every((arg) => numericExpression(grid, arg, visiting, evaluateCell)) ? 1 : 0;
      if (upper === 'OR') result = args.some((arg) => numericExpression(grid, arg, visiting, evaluateCell)) ? 1 : 0;

      if (upper === 'ROUND') {
        const precision = Math.max(0, Math.min(6, Math.round(numericExpression(grid, args[1] || '0', visiting, evaluateCell))));
        const factor = 10 ** precision;
        result = Math.round(numericExpression(grid, args[0], visiting, evaluateCell) * factor) / factor;
      }

      if (upper === 'IF') {
        result = evaluateExpression(grid, args[0], visiting, evaluateCell)
          ? numericExpression(grid, args[1] || '0', visiting, evaluateCell)
          : numericExpression(grid, args[2] || '0', visiting, evaluateCell);
      }

      next = next.slice(0, match.index) + String(result) + next.slice(match.index + match[0].length);
      changed = true;
    }
  }

  return next;
}

export function evaluateCell(grid, row, col, visiting = new Set()) {
  const raw = grid?.[row]?.[col];
  if (raw === '' || raw == null) return '';

  const source = String(raw).trim();
  if (!source.startsWith('=')) {
    const numeric = parseNumberLiteral(source);
    return Number.isFinite(numeric) && source !== '' ? numeric : source;
  }

  const key = `${row}:${col}`;
  if (visiting.has(key)) return '#CIRC';
  visiting.add(key);

  try {
    let expression = source.slice(1).replace(/\s+/g, '');
    expression = expandFunctions(grid, expression, visiting, evaluateCell);
    expression = replaceReferences(grid, expression, visiting, evaluateCell);
    if (!/^[-+/*().,0-9eE%<>=! ]*$/.test(expression)) throw new Error('Unsafe formula');
    const result = Function(`"use strict"; return (${expression})`)();
    visiting.delete(key);
    if (typeof result === 'boolean') return result;
    return Number.isFinite(result) ? result : '#ERR';
  } catch {
    visiting.delete(key);
    return '#ERR';
  }
}

export function displayValue(grid, row, col) {
  const value = evaluateCell(grid, row, col, new Set());
  return formatValue(value);
}

export function formatValue(value) {
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
  if (typeof value !== 'number') return value == null ? '' : String(value);
  if (Math.abs(value) > 999 || Number.isInteger(value)) return Math.round(value).toLocaleString();
  return Number(value.toFixed(2)).toLocaleString();
}

export function isNumericCell(grid, row, col) {
  return typeof evaluateCell(grid, row, col, new Set()) === 'number';
}

export function isHeaderCell(grid, row, col) {
  const raw = grid?.[row]?.[col];
  return row === 0 && raw && !String(raw).startsWith('=') && !Number.isFinite(Number(raw));
}

export function gridStats(grid) {
  let filled = 0;
  let formulas = 0;
  let numeric = 0;

  grid.forEach((row, r) => {
    row.forEach((cell, c) => {
      if (cell !== '') filled += 1;
      if (String(cell || '').startsWith('=')) formulas += 1;
      if (typeof evaluateCell(grid, r, c, new Set()) === 'number') numeric += 1;
    });
  });

  return { filled, formulas, numeric };
}

export function formulaReferences(raw) {
  if (!String(raw || '').trim().startsWith('=')) return [];
  const refs = new Set();
  const matches = String(raw).match(/\$?[A-L]\$?\d+(?::\$?[A-L]\$?\d+)?/gi) || [];
  matches.forEach((match) => refs.add(match.replace(/\$/g, '').toUpperCase()));
  return [...refs];
}

export function dependentsForCell(grid, row, col) {
  const dependents = [];

  grid.forEach((items, r) => {
    items.forEach((cell, c) => {
      if (r === row && c === col) return;
      const refs = formulaReferences(cell);
      if (refs.some((ref) => tokenContainsCell(ref, row, col))) {
        dependents.push({ ref: cellId(r, c), raw: String(cell), value: formatValue(evaluateCell(grid, r, c, new Set())) });
      }
    });
  });

  return dependents;
}

export function selectedCellProfile(grid, row, col) {
  const raw = grid?.[row]?.[col] || '';
  const value = evaluateCell(grid, row, col, new Set());
  const references = formulaReferences(raw);
  const dependents = dependentsForCell(grid, row, col);
  const header = row === 0 ? 'Header row' : grid?.[0]?.[col] || columnName(col);

  let type = 'Blank';
  if (String(raw).trim().startsWith('=')) type = errorValue(value) ? 'Formula error' : 'Formula';
  else if (typeof value === 'number') type = 'Number';
  else if (String(raw).trim()) type = 'Text';

  return {
    ref: cellId(row, col),
    raw: String(raw),
    value: formatValue(value),
    type,
    header,
    references,
    dependents: dependents.slice(0, 8)
  };
}

export function columnProfile(grid, col) {
  const header = grid?.[0]?.[col] || columnName(col);
  const values = [];
  let filled = 0;
  let blanks = 0;

  for (let row = 1; row < grid.length; row += 1) {
    const raw = String(grid[row]?.[col] || '').trim();
    if (raw) filled += 1;
    else blanks += 1;

    const value = evaluateCell(grid, row, col, new Set());
    if (typeof value === 'number' && Number.isFinite(value)) values.push(value);
  }

  const sum = values.reduce((total, value) => total + value, 0);
  const avg = values.length ? sum / values.length : 0;

  return {
    header,
    filled,
    blanks,
    numeric: values.length,
    sum,
    avg,
    min: values.length ? Math.min(...values) : 0,
    max: values.length ? Math.max(...values) : 0
  };
}

export function forecastSeries(points, periods = 4) {
  const numeric = points.filter((point) => Number.isFinite(point.value));
  if (numeric.length < 2) return [];

  const first = numeric[0].value;
  const last = numeric[numeric.length - 1].value;
  const slope = (last - first) / Math.max(1, numeric.length - 1);

  return Array.from({ length: periods }, (_, index) => {
    const value = Math.max(0, last + slope * (index + 1));
    return {
      label: `Forecast ${index + 1}`,
      value
    };
  });
}

export function shiftFormulaRows(formula, delta) {
  if (!String(formula || '').startsWith('=')) return formula;
  return String(formula).replace(/(\$?)([A-L])(\$?)(\d+)/gi, (match, colLock, letter, rowLock, rowNumber) => {
    if (rowLock === '$') return match;
    const nextRow = Math.min(ROWS, Math.max(1, Number(rowNumber) + delta));
    return `${colLock}${letter.toUpperCase()}${rowLock}${nextRow}`;
  });
}

export function modelAudit(grid) {
  const formulas = [];
  const errors = [];
  const assumptions = [];

  grid.forEach((row, r) => {
    row.forEach((cell, c) => {
      const raw = String(cell || '');
      if (!raw) return;

      const ref = cellId(r, c);
      const value = evaluateCell(grid, r, c, new Set());

      if (raw.startsWith('=')) {
        formulas.push({ ref, raw, value: formatValue(value) });
      }

      if (String(value).startsWith('#')) {
        errors.push({ ref, raw, value });
      }

      if (!raw.startsWith('=') && typeof value === 'number' && r > 0) {
        const header = grid[0]?.[c] || columnName(c);
        assumptions.push({ ref, header, value: formatValue(value) });
      }
    });
  });

  return {
    formulas,
    errors,
    assumptions: assumptions.slice(0, 8),
    health: errors.length ? 'Needs review' : formulas.length ? 'Formula clean' : 'Manual sheet'
  };
}

export function chartSeries(grid, chart) {
  if (!chart || chart.type === 'none') return [];
  const labelColumn = Number(chart.labelColumn || 0);
  const valueColumn = Number(chart.valueColumn || 1);
  const out = [];

  for (let row = 1; row < grid.length; row += 1) {
    const label = evaluateCell(grid, row, labelColumn, new Set());
    const value = evaluateCell(grid, row, valueColumn, new Set());
    if (label === '' && value === '') continue;
    if (typeof value === 'number' && !String(label).toLowerCase().includes('total')) {
      out.push({ label: String(label), value });
    }
  }

  return out.slice(0, 16);
}

export function exportCsv(grid) {
  return grid
    .filter((row, index) => index < 6 || row.some((cell) => String(cell || '').trim()))
    .map((row, r) =>
      row
        .map((_cell, c) => {
          const value = String(evaluateCell(grid, r, c, new Set()) ?? '');
          return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
        })
        .join(',')
    )
    .join('\n');
}
