import {
  Activity,
  BarChart3,
  Check,
  ChevronRight,
  ClipboardList,
  Copy,
  Download,
  FileSpreadsheet,
  FolderOpen,
  Gauge,
  Grid3X3,
  Layers3,
  ListFilter,
  Plus,
  ShieldCheck,
  RefreshCw,
  Redo2,
  Save,
  Search,
  Sparkles,
  Trash2,
  Undo2,
  Upload,
  Wand2,
  Zap
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from './lib/api';
import {
  COLS,
  ROWS,
  cellId,
  chartSeries,
  columnProfile,
  columnName,
  displayValue,
  emptyGrid,
  evaluateCell,
  exportCsv,
  forecastSeries,
  formatValue,
  gridStats,
  isHeaderCell,
  isNumericCell,
  modelAudit,
  normalizeGrid,
  selectedCellProfile,
  shiftFormulaRows
} from './lib/sheet';

const suggestions = [
  'Build a 12-month SaaS revenue forecast: 100 starting customers, $50 per seat, 8% monthly growth, 3% churn',
  'Create a hiring plan for a 15-person engineering team across 4 quarters with salary bands',
  'Q3 sales analysis: 8 products across 4 regions, segment revenue and identify top performers',
  'Build a personal monthly budget for a household of 4 with categories and totals'
];

const missions = [
  ['Generate', 'Turn plain language into a structured workbook with formulas.'],
  ['Audit', 'Expose assumptions, references, totals, and broken formulas.'],
  ['Operate', 'Save, compare, export, and reuse business models.']
];

const PIVOT_START_COL = Math.max(0, COLS - 4);

const blankWorkbook = () => ({
  id: null,
  name: 'Untitled vectorsheet',
  owner: 'SuperOrbit Studio',
  status: 'Draft model',
  prompt: '',
  grid: emptyGrid(),
  summary: 'Start with a prompt or type directly into the grid. Vectorsheets keeps formulas and model logic visible.',
  chart: { type: 'none', labelColumn: 0, valueColumn: 1, title: '' },
  tags: ['draft'],
  activity: { aiRuns: 0, formulaCells: 0, lastAction: 'Created locally' },
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString()
});

function cx(...values) {
  return values.filter(Boolean).join(' ');
}

function metricLabel(value) {
  if (!Number.isFinite(value)) return '0';
  if (Math.abs(value) >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
  if (Math.abs(value) >= 1000) return `${Math.round(value / 1000)}K`;
  return formatValue(value);
}

function cloneGrid(grid) {
  return normalizeGrid(grid).map((row) => [...row]);
}

function snapshotWorkbook(workbook) {
  return {
    name: workbook.name,
    prompt: workbook.prompt,
    grid: cloneGrid(workbook.grid),
    summary: workbook.summary,
    chart: { ...(workbook.chart || { type: 'none', labelColumn: 0, valueColumn: 1, title: '' }) },
    tags: [...(workbook.tags || [])],
    status: workbook.status
  };
}

function parseDelimitedRows(text, delimiter) {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (char === '"' && quoted && next === '"') {
      cell += '"';
      index += 1;
      continue;
    }

    if (char === '"') {
      quoted = !quoted;
      continue;
    }

    if (char === delimiter && !quoted) {
      row.push(cell);
      cell = '';
      continue;
    }

    if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && next === '\n') index += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
      continue;
    }

    cell += char;
  }

  row.push(cell);
  rows.push(row);
  return rows.filter((items) => items.some((item) => String(item || '').trim()));
}

function parseSheetText(text) {
  const firstLine = String(text || '').split(/\r?\n/)[0] || '';
  const delimiter = (firstLine.match(/\t/g) || []).length > (firstLine.match(/,/g) || []).length ? '\t' : ',';
  return parseDelimitedRows(String(text || ''), delimiter);
}

function gridFromRows(rows, start = { row: 0, col: 0 }, baseGrid = emptyGrid()) {
  const nextGrid = cloneGrid(baseGrid);

  rows.slice(0, ROWS - start.row).forEach((row, rowIndex) => {
    row.slice(0, COLS - start.col).forEach((cell, colIndex) => {
      nextGrid[start.row + rowIndex][start.col + colIndex] = String(cell ?? '').trim();
    });
  });

  return nextGrid;
}

function columnOptions() {
  return Array.from({ length: COLS }, (_, col) => (
    <option key={col} value={col}>
      {columnName(col)}
    </option>
  ));
}

function rowHasData(row) {
  return row.some((cell) => String(cell || '').trim());
}

function sortValue(grid, row, col) {
  const value = evaluateCell(grid, row, col, new Set());
  if (typeof value === 'number') return { kind: 'number', value };
  return { kind: 'text', value: String(value || '').toLowerCase() };
}

function compareSortValues(a, b) {
  if (a.kind === 'number' && b.kind === 'number') return a.value - b.value;
  if (a.kind === 'number') return -1;
  if (b.kind === 'number') return 1;
  return a.value.localeCompare(b.value);
}

function formatNumericValue(value, mode) {
  if (!Number.isFinite(value)) return '';
  if (mode === 'currency') return `$${Math.round(value).toLocaleString('en-US')}`;
  if (mode === 'percent') return `${Number((value * 100).toFixed(2)).toLocaleString('en-US')}%`;
  return Number(value.toFixed(2)).toLocaleString('en-US');
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function versionKey(workbook) {
  return `vectorsheets:versions:${workbook.id || 'local-draft'}`;
}

function readVersions(workbook) {
  try {
    const parsed = JSON.parse(localStorage.getItem(versionKey(workbook)) || '[]');
    return Array.isArray(parsed) ? parsed.slice(0, 8) : [];
  } catch {
    return [];
  }
}

function writeVersions(workbook, versions) {
  localStorage.setItem(versionKey(workbook), JSON.stringify(versions.slice(0, 8)));
}

function notesKey(workbook) {
  return `vectorsheets:notes:${workbook.id || 'local-draft'}`;
}

function readNotes(workbook) {
  try {
    const parsed = JSON.parse(localStorage.getItem(notesKey(workbook)) || '{}');
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function writeNotes(workbook, notes) {
  localStorage.setItem(notesKey(workbook), JSON.stringify(notes));
}

function scenariosKey(workbook) {
  return `vectorsheets:scenarios:${workbook.id || 'local-draft'}`;
}

function readScenarios(workbook) {
  try {
    const parsed = JSON.parse(localStorage.getItem(scenariosKey(workbook)) || '[]');
    return Array.isArray(parsed) ? parsed.slice(0, 8) : [];
  } catch {
    return [];
  }
}

function writeScenarios(workbook, scenarios) {
  localStorage.setItem(scenariosKey(workbook), JSON.stringify(scenarios.slice(0, 8)));
}

function namedRangesKey(workbook) {
  return `vectorsheets:named-ranges:${workbook.id || 'local-draft'}`;
}

function readNamedRanges(workbook) {
  try {
    const parsed = JSON.parse(localStorage.getItem(namedRangesKey(workbook)) || '[]');
    return Array.isArray(parsed) ? parsed.slice(0, 12) : [];
  } catch {
    return [];
  }
}

function writeNamedRanges(workbook, ranges) {
  localStorage.setItem(namedRangesKey(workbook), JSON.stringify(ranges.slice(0, 12)));
}

function columnQuality(grid, col) {
  const counts = new Map();
  const numeric = [];
  let blanks = 0;
  let trimmedIssues = 0;

  for (let row = 1; row < ROWS; row += 1) {
    const raw = String(grid[row]?.[col] || '');
    const trimmed = raw.trim();
    if (!trimmed) {
      blanks += 1;
      continue;
    }

    if (raw !== trimmed) trimmedIssues += 1;
    counts.set(trimmed.toLowerCase(), (counts.get(trimmed.toLowerCase()) || 0) + 1);

    const value = evaluateCell(grid, row, col, new Set());
    if (typeof value === 'number' && Number.isFinite(value)) numeric.push(value);
  }

  const duplicates = [...counts.values()].filter((count) => count > 1).reduce((sum, count) => sum + count - 1, 0);
  const avg = numeric.length ? numeric.reduce((sum, value) => sum + value, 0) / numeric.length : 0;
  const variance = numeric.length ? numeric.reduce((sum, value) => sum + (value - avg) ** 2, 0) / numeric.length : 0;
  const deviation = Math.sqrt(variance);
  const outliers = deviation
    ? numeric.filter((value) => Math.abs(value - avg) > deviation * 2).length
    : 0;

  return {
    blanks,
    duplicates,
    outliers,
    trimmedIssues,
    numeric: numeric.length,
    score: Math.max(0, 100 - blanks * 2 - duplicates * 8 - outliers * 10 - trimmedIssues * 5)
  };
}

function filteredRowsForColumn(grid, col, filterText) {
  const needle = filterText.trim().toLowerCase();
  if (!needle) return Array.from({ length: ROWS }, (_, row) => row);

  const rows = [0];
  for (let row = 1; row < ROWS; row += 1) {
    const raw = String(grid[row]?.[col] || '');
    const rendered = displayValue(grid, row, col);
    if (`${raw} ${rendered}`.toLowerCase().includes(needle)) rows.push(row);
  }

  return rows;
}

function conditionalCellsForRule(grid, col, rule) {
  const cells = new Set();
  if (rule === 'none') return cells;

  const numeric = [];
  const counts = new Map();

  for (let row = 1; row < ROWS; row += 1) {
    const raw = String(grid[row]?.[col] || '').trim();
    const value = evaluateCell(grid, row, col, new Set());
    if (typeof value === 'number' && Number.isFinite(value)) numeric.push({ row, value });
    if (raw) counts.set(raw.toLowerCase(), (counts.get(raw.toLowerCase()) || 0) + 1);
  }

  const average = numeric.length ? numeric.reduce((sum, item) => sum + item.value, 0) / numeric.length : 0;
  const max = numeric.length ? Math.max(...numeric.map((item) => item.value)) : null;

  for (let row = 1; row < ROWS; row += 1) {
    const raw = String(grid[row]?.[col] || '').trim();
    const value = evaluateCell(grid, row, col, new Set());
    const ref = cellId(row, col);

    if (rule === 'above-average' && typeof value === 'number' && value > average) cells.add(ref);
    if (rule === 'top-value' && typeof value === 'number' && value === max) cells.add(ref);
    if (rule === 'negative' && typeof value === 'number' && value < 0) cells.add(ref);
    if (rule === 'duplicates' && raw && counts.get(raw.toLowerCase()) > 1) cells.add(ref);
    if (rule === 'blanks' && !raw && rowHasData(grid[row])) cells.add(ref);
  }

  return cells;
}

function validationForRule(grid, col, rule) {
  const cells = new Set();
  if (rule === 'none') return { cells, label: 'No validation rule' };

  const counts = new Map();
  if (rule === 'unique') {
    for (let row = 1; row < ROWS; row += 1) {
      const raw = String(grid[row]?.[col] || '').trim().toLowerCase();
      if (raw) counts.set(raw, (counts.get(raw) || 0) + 1);
    }
  }

  for (let row = 1; row < ROWS; row += 1) {
    const raw = String(grid[row]?.[col] || '').trim();
    const value = evaluateCell(grid, row, col, new Set());
    const hasContext = rowHasData(grid[row]);
    const ref = cellId(row, col);

    if (rule === 'required' && hasContext && !raw) cells.add(ref);
    if (rule === 'number' && raw && typeof value !== 'number') cells.add(ref);
    if (rule === 'unique' && raw && counts.get(raw.toLowerCase()) > 1) cells.add(ref);
    if (rule === 'formula-clean' && raw.startsWith('=') && String(value).startsWith('#')) cells.add(ref);
  }

  const labels = {
    required: 'Required cells',
    number: 'Numbers only',
    unique: 'Unique values',
    'formula-clean': 'Formula clean'
  };

  return { cells, label: labels[rule] || 'Validation rule' };
}

function buildPivotSummary(grid, labelCol, valueCol) {
  const labelHeader = grid[0]?.[labelCol] || columnName(labelCol);
  const valueHeader = grid[0]?.[valueCol] || columnName(valueCol);
  const groups = new Map();

  for (let row = 1; row < ROWS; row += 1) {
    const label = String(displayValue(grid, row, labelCol) || '').trim();
    const value = evaluateCell(grid, row, valueCol, new Set());
    if (!label || label.toLowerCase().includes('total') || typeof value !== 'number' || !Number.isFinite(value)) continue;

    const current = groups.get(label) || {
      label,
      count: 0,
      sum: 0,
      min: value,
      max: value
    };
    current.count += 1;
    current.sum += value;
    current.min = Math.min(current.min, value);
    current.max = Math.max(current.max, value);
    groups.set(label, current);
  }

  const rows = [...groups.values()]
    .map((item) => ({ ...item, avg: item.count ? item.sum / item.count : 0 }))
    .sort((a, b) => b.sum - a.sum)
    .slice(0, 12);
  const total = rows.reduce((sum, item) => sum + item.sum, 0);

  return { labelHeader, valueHeader, rows, total };
}

function bestSummaryConfig(grid) {
  const profiles = Array.from({ length: COLS }, (_, col) => {
    let numeric = 0;
    let text = 0;

    for (let row = 1; row < ROWS; row += 1) {
      const raw = String(grid[row]?.[col] || '').trim();
      if (!raw) continue;
      const value = evaluateCell(grid, row, col, new Set());
      if (typeof value === 'number' && Number.isFinite(value)) numeric += 1;
      else text += 1;
    }

    return { col, numeric, text };
  });

  const valueCol = [...profiles].sort((a, b) => b.numeric - a.numeric || a.col - b.col)[0]?.col ?? 1;
  const labelCol =
    [...profiles]
      .filter((profile) => profile.col !== valueCol)
      .sort((a, b) => b.text - a.text || a.col - b.col)[0]?.col ?? 0;

  return { labelCol, valueCol };
}

function findBlankBlock(grid, neededRows, startCol = 0, width = COLS) {
  for (let row = 0; row <= ROWS - neededRows; row += 1) {
    let empty = true;
    for (let r = row; r < row + neededRows; r += 1) {
      for (let c = startCol; c < Math.min(COLS, startCol + width); c += 1) {
        if (String(grid[r]?.[c] || '').trim()) empty = false;
      }
    }
    if (empty) return row;
  }
  return -1;
}

function csvEscape(value) {
  const text = String(value ?? '');
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function dataRangeForColumn(grid, col) {
  const rows = [];
  for (let row = 1; row < ROWS; row += 1) {
    if (rowHasData(grid[row])) rows.push(row);
  }

  if (!rows.length) return null;
  return {
    startRow: Math.min(...rows),
    endRow: Math.max(...rows),
    ref: `${cellId(Math.min(...rows), col)}:${cellId(Math.max(...rows), col)}`
  };
}

function cleanFormulaCriterion(value) {
  return String(value || '')
    .replace(/"/g, '""')
    .trim();
}

function WorkbookChart({ workbook, grid }) {
  const points = chartSeries(grid, workbook.chart);
  const max = Math.max(...points.map((point) => point.value), 1);
  const width = 560;
  const height = 230;
  const padding = 28;
  const innerWidth = width - padding * 2;
  const innerHeight = height - padding * 2;

  if (!points.length) {
    return (
      <div className="empty-chart">
        <BarChart3 size={22} />
        <span>No chart yet</span>
      </div>
    );
  }

  if (workbook.chart?.type === 'line') {
    const path = points
      .map((point, index) => {
        const x = padding + (points.length === 1 ? innerWidth / 2 : (index / (points.length - 1)) * innerWidth);
        const y = padding + innerHeight - (point.value / max) * innerHeight;
        return `${index === 0 ? 'M' : 'L'} ${x} ${y}`;
      })
      .join(' ');

    return (
      <svg className="chart-svg" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={workbook.chart.title}>
        <path className="chart-grid-line" d={`M ${padding} ${height - padding} L ${width - padding} ${height - padding}`} />
        <path className="chart-area" d={`${path} L ${width - padding} ${height - padding} L ${padding} ${height - padding} Z`} />
        <path className="chart-line" d={path} />
        {points.map((point, index) => {
          const x = padding + (points.length === 1 ? innerWidth / 2 : (index / (points.length - 1)) * innerWidth);
          const y = padding + innerHeight - (point.value / max) * innerHeight;
          return <circle className="chart-dot" cx={x} cy={y} r="4" key={`${point.label}-${index}`} />;
        })}
      </svg>
    );
  }

  const gap = 8;
  const barWidth = Math.max(12, (innerWidth - gap * (points.length - 1)) / points.length);

  return (
    <svg className="chart-svg" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={workbook.chart.title}>
      <path className="chart-grid-line" d={`M ${padding} ${height - padding} L ${width - padding} ${height - padding}`} />
      {points.map((point, index) => {
        const barHeight = (point.value / max) * innerHeight;
        const x = padding + index * (barWidth + gap);
        const y = height - padding - barHeight;
        return (
          <g key={`${point.label}-${index}`}>
            <rect className="chart-bar" x={x} y={y} width={barWidth} height={barHeight} rx="3" />
          </g>
        );
      })}
    </svg>
  );
}

function SpreadsheetGrid({
  grid,
  selected,
  editing,
  onSelect,
  onEdit,
  onCommit,
  onCancel,
  onPaste,
  matchSet,
  activeMatch,
  noteSet,
  conditionalSet,
  validationSet,
  visibleRows = Array.from({ length: ROWS }, (_, row) => row)
}) {
  const editRef = useRef(null);

  useEffect(() => {
    if (editing && editRef.current) {
      editRef.current.focus();
      editRef.current.select();
    }
  }, [editing]);

  return (
    <div className="grid-wrap" onPaste={onPaste}>
      <table className="sheet-grid">
        <thead>
          <tr>
            <th className="corner" />
            {Array.from({ length: COLS }, (_, col) => (
              <th key={col}>{columnName(col)}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {visibleRows.map((row) => (
            <tr key={row}>
              <th className="row-head">{row + 1}</th>
              {Array.from({ length: COLS }, (_, col) => {
                const selectedCell = selected.row === row && selected.col === col;
                const editingCell = editing?.row === row && editing?.col === col;
                const raw = grid[row]?.[col] || '';
                const cellKey = `${row}:${col}`;
                return (
                  <td
                    key={`${row}-${col}`}
                    className={cx(
                      'sheet-cell',
                      selectedCell && 'selected',
                      matchSet?.has(cellKey) && 'search-match',
                      activeMatch?.row === row && activeMatch?.col === col && 'active-match',
                      noteSet?.has(cellId(row, col)) && 'has-note',
                      conditionalSet?.has(cellId(row, col)) && 'conditional-hit',
                      validationSet?.has(cellId(row, col)) && 'validation-issue',
                      isNumericCell(grid, row, col) && 'numeric',
                      isHeaderCell(grid, row, col) && 'header-cell',
                      String(raw).startsWith('=') && 'formula-cell'
                    )}
                    onClick={() => onSelect(row, col)}
                    onDoubleClick={() => onEdit(row, col)}
                  >
                    {editingCell ? (
                      <input
                        ref={editRef}
                        className="cell-editor"
                        defaultValue={raw}
                        onBlur={(event) => onCommit(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') onCommit(event.currentTarget.value, 'down');
                          if (event.key === 'Tab') {
                            event.preventDefault();
                            onCommit(event.currentTarget.value, 'right');
                          }
                          if (event.key === 'Escape') onCancel();
                        }}
                      />
                    ) : (
                      displayValue(grid, row, col)
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function App() {
  const [health, setHealth] = useState(null);
  const [workbooks, setWorkbooks] = useState([]);
  const [active, setActive] = useState(blankWorkbook());
  const activeRef = useRef(active);
  const fileInputRef = useRef(null);
  const [selected, setSelected] = useState({ row: 0, col: 0 });
  const [editing, setEditing] = useState(null);
  const [formulaDraft, setFormulaDraft] = useState('');
  const [chartTitleDraft, setChartTitleDraft] = useState('');
  const [prompt, setPrompt] = useState('');
  const [query, setQuery] = useState('');
  const [sheetQuery, setSheetQuery] = useState('');
  const [activeMatchIndex, setActiveMatchIndex] = useState(0);
  const [loading, setLoading] = useState('Booting Vectorsheets');
  const [notice, setNotice] = useState('');
  const [dirty, setDirty] = useState(false);
  const [scenario, setScenario] = useState({ growth: 8, margin: 82, confidence: 74 });
  const [scenarioName, setScenarioName] = useState('');
  const [savedScenarios, setSavedScenarios] = useState([]);
  const [history, setHistory] = useState({ undo: [], redo: [] });
  const [versions, setVersions] = useState([]);
  const [notes, setNotes] = useState({});
  const [noteDraft, setNoteDraft] = useState('');
  const [namedRanges, setNamedRanges] = useState([]);
  const [namedRangeName, setNamedRangeName] = useState('');
  const [filterText, setFilterText] = useState('');
  const [conditionalRule, setConditionalRule] = useState('none');
  const [validationRule, setValidationRule] = useState('none');
  const [summaryConfig, setSummaryConfig] = useState({ labelCol: 0, valueCol: 1 });

  const grid = useMemo(() => normalizeGrid(active.grid), [active.grid]);
  const stats = useMemo(() => gridStats(grid), [grid]);
  const audit = useMemo(() => modelAudit(grid), [grid]);
  const series = useMemo(() => chartSeries(grid, active.chart), [grid, active.chart]);
  const forecast = useMemo(() => forecastSeries(series, 4), [series]);
  const cellProfile = useMemo(() => selectedCellProfile(grid, selected.row, selected.col), [grid, selected]);
  const selectedColumn = useMemo(() => columnProfile(grid, selected.col), [grid, selected.col]);
  const selectedQuality = useMemo(() => columnQuality(grid, selected.col), [grid, selected.col]);
  const visibleRows = useMemo(() => filteredRowsForColumn(grid, selected.col, filterText), [grid, selected.col, filterText]);
  const dataRowCount = useMemo(() => grid.slice(1).filter(rowHasData).length, [grid]);
  const conditionalSet = useMemo(
    () => conditionalCellsForRule(grid, selected.col, conditionalRule),
    [grid, selected.col, conditionalRule]
  );
  const validationResult = useMemo(
    () => validationForRule(grid, selected.col, validationRule),
    [grid, selected.col, validationRule]
  );
  const validationSet = validationResult.cells;
  const pivotSummary = useMemo(
    () => buildPivotSummary(grid, summaryConfig.labelCol, summaryConfig.valueCol),
    [grid, summaryConfig.labelCol, summaryConfig.valueCol]
  );
  const selectedColumnRange = useMemo(() => dataRangeForColumn(grid, selected.col), [grid, selected.col]);
  const workbookHealth = useMemo(
    () => [
      {
        label: 'Formula errors',
        value: audit.errors.length,
        status: audit.errors.length ? 'issue' : 'ok'
      },
      {
        label: 'Validation issues',
        value: validationSet.size,
        status: validationSet.size ? 'issue' : 'ok'
      },
      {
        label: 'Named ranges',
        value: namedRanges.length,
        status: namedRanges.length ? 'ok' : 'watch'
      },
      {
        label: 'Summary rows',
        value: pivotSummary.rows.length,
        status: pivotSummary.rows.length ? 'ok' : 'watch'
      }
    ],
    [audit.errors.length, namedRanges.length, pivotSummary.rows.length, validationSet.size]
  );
  const assistantNotes = useMemo(() => {
    const notes = [];
    if (audit.errors.length) notes.push(`${audit.errors.length} formula error${audit.errors.length === 1 ? '' : 's'} need review.`);
    if (validationSet.size) notes.push(`${validationSet.size} validation issue${validationSet.size === 1 ? '' : 's'} found in column ${columnName(selected.col)}.`);
    if (pivotSummary.rows.length > 2) notes.push(`Summary builder can group ${pivotSummary.rows.length} ${pivotSummary.labelHeader} segment${pivotSummary.rows.length === 1 ? '' : 's'}.`);
    if (selectedQuality.blanks > 8) notes.push(`Column ${columnName(selected.col)} has many blanks. Move blank rows down or clear unused rows.`);
    if (selectedQuality.duplicates) notes.push(`Column ${columnName(selected.col)} has ${selectedQuality.duplicates} duplicate value${selectedQuality.duplicates === 1 ? '' : 's'}.`);
    if (selectedQuality.outliers) notes.push(`${selectedQuality.outliers} numeric outlier${selectedQuality.outliers === 1 ? '' : 's'} found in the selected column.`);
    if (!stats.formulas) notes.push('Add formulas so the model is auditable instead of static.');
    if (!notes.length) notes.push('This sheet is structured cleanly. Save a version before larger edits.');
    return notes.slice(0, 3);
  }, [audit.errors.length, pivotSummary, selected.col, selectedQuality, stats.formulas, validationSet.size]);
  const selectedRaw = grid[selected.row]?.[selected.col] || '';
  const selectedValue = evaluateCell(grid, selected.row, selected.col, new Set());
  const totalValue = series.reduce((sum, point) => sum + point.value, 0);
  const peak = series.reduce((best, point) => (point.value > best.value ? point : best), { label: 'None', value: 0 });
  const weightedOutcome =
    totalValue * (1 + scenario.growth / 100) * (scenario.margin / 100) * (scenario.confidence / 100);
  const sheetMatches = useMemo(() => {
    const needle = sheetQuery.trim().toLowerCase();
    if (!needle) return [];
    const matches = [];

    grid.forEach((row, r) => {
      row.forEach((cell, c) => {
        const raw = String(cell || '');
        const rendered = displayValue(grid, r, c);
        if (`${raw} ${rendered}`.toLowerCase().includes(needle)) {
          matches.push({ row: r, col: c });
        }
      });
    });

    return matches;
  }, [grid, sheetQuery]);
  const matchSet = useMemo(() => new Set(sheetMatches.map((match) => `${match.row}:${match.col}`)), [sheetMatches]);
  const activeMatch = sheetMatches.length ? sheetMatches[Math.min(activeMatchIndex, sheetMatches.length - 1)] : null;
  const selectedRef = cellId(selected.row, selected.col);
  const noteSet = useMemo(() => new Set(Object.keys(notes).filter((key) => String(notes[key] || '').trim())), [notes]);
  const aiStatus = useMemo(() => {
    if (!health?.ai) return 'AI checking';
    if (health.ai.runtime === 'fallback-engine') return 'Local AI fallback';
    if (health.ai.runtime === 'local-engine') return 'Local AI engine';
    if (health.ai.runtime === 'ai-engine') return 'Cloud AI live';
    if (health.ai.provider === 'azure-openai') return `Azure AI ${health.ai.auth === 'api-key' ? 'key' : health.ai.auth}`;
    if (health.ai.provider === 'openai') return 'OpenAI live';
    return 'Local AI engine';
  }, [health?.ai]);
  const aiRuntimeDetails = useMemo(() => {
    const ai = health?.ai || {};
    return {
      provider: ai.provider || 'deterministic',
      model: ai.model || 'local',
      auth: ai.auth || 'none',
      runtime: ai.runtime || 'not-tested',
      lastError: ai.lastError || ''
    };
  }, [health?.ai]);

  const filteredWorkbooks = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return workbooks;
    return workbooks.filter((workbook) =>
      [workbook.name, workbook.summary, ...(workbook.tags || [])].join(' ').toLowerCase().includes(needle)
    );
  }, [query, workbooks]);

  useEffect(() => {
    activeRef.current = active;
  }, [active]);

  useEffect(() => {
    setVersions(readVersions(active));
    setNotes(readNotes(active));
    setSavedScenarios(readScenarios(active));
    setNamedRanges(readNamedRanges(active));
  }, [active.id]);

  useEffect(() => {
    setFilterText('');
    setConditionalRule('none');
    setValidationRule('none');
    setSummaryConfig(bestSummaryConfig(grid));
  }, [active.id]);

  useEffect(() => {
    setNoteDraft(notes[selectedRef] || '');
  }, [notes, selectedRef]);

  const commitWorkbookChange = useCallback((updater, lastAction, noticeText) => {
    const current = activeRef.current;
    const draft = {
      ...current,
      grid: cloneGrid(current.grid),
      chart: { ...(current.chart || { type: 'none', labelColumn: 0, valueColumn: 1, title: '' }) },
      tags: [...(current.tags || [])]
    };
    const next = updater(draft);

    setHistory((currentHistory) => ({
      undo: [snapshotWorkbook(current), ...currentHistory.undo].slice(0, 40),
      redo: []
    }));
    setActive({
      ...current,
      ...next,
      grid: cloneGrid(next.grid || current.grid),
      chart: { ...(next.chart || current.chart) },
      tags: [...(next.tags || current.tags || [])],
      activity: { ...current.activity, lastAction },
      updatedAt: new Date().toISOString()
    });
    setDirty(true);
    if (noticeText) setNotice(noticeText);
  }, []);

  const setCellValue = useCallback(
    (row, col, value, action = `Edited ${cellId(row, col)}`) => {
      const current = activeRef.current;
      const currentValue = String(normalizeGrid(current.grid)[row]?.[col] || '');
      const nextValue = String(value ?? '');
      if (currentValue === nextValue) return;

      commitWorkbookChange((draft) => {
        draft.grid[row][col] = nextValue;
        return draft;
      }, action);
    },
    [commitWorkbookChange]
  );

  function restoreSnapshot(snapshot, action) {
    setActive((current) => ({
      ...current,
      ...snapshot,
      grid: cloneGrid(snapshot.grid),
      chart: { ...(snapshot.chart || { type: 'none', labelColumn: 0, valueColumn: 1, title: '' }) },
      tags: [...(snapshot.tags || [])],
      activity: { ...current.activity, lastAction: action },
      updatedAt: new Date().toISOString()
    }));
    setDirty(true);
    setNotice(action);
  }

  function undoChange() {
    if (!history.undo.length) return;
    const [nextSnapshot, ...remainingUndo] = history.undo;
    const currentSnapshot = snapshotWorkbook(activeRef.current);
    setHistory({
      undo: remainingUndo,
      redo: [currentSnapshot, ...history.redo].slice(0, 40)
    });
    restoreSnapshot(nextSnapshot, 'Undo applied.');
  }

  function redoChange() {
    if (!history.redo.length) return;
    const [nextSnapshot, ...remainingRedo] = history.redo;
    const currentSnapshot = snapshotWorkbook(activeRef.current);
    setHistory({
      undo: [currentSnapshot, ...history.undo].slice(0, 40),
      redo: remainingRedo
    });
    restoreSnapshot(nextSnapshot, 'Redo applied.');
  }

  const loadApp = useCallback(async () => {
    setLoading('Loading workspace');
    try {
      const [healthResult, workbookResult] = await Promise.all([api.health(), api.listWorkbooks()]);
      setHealth(healthResult);
      setWorkbooks(workbookResult.workbooks || []);
      const first = workbookResult.workbooks?.[0] || blankWorkbook();
      setActive(first);
      setSummaryConfig(bestSummaryConfig(normalizeGrid(first.grid)));
      setPrompt(first.prompt || '');
      setDirty(false);
      setHistory({ undo: [], redo: [] });
      setNotice(healthResult.database === 'mongo' ? 'Connected to MongoDB' : 'Demo persistence is active');
    } catch (error) {
      const local = blankWorkbook();
      setHealth({ database: 'offline', message: error.message });
      setWorkbooks([local]);
      setActive(local);
      setSummaryConfig(bestSummaryConfig(local.grid));
      setHistory({ undo: [], redo: [] });
      setNotice('API offline. Editing locally until the server is available.');
    } finally {
      setLoading('');
    }
  }, []);

  useEffect(() => {
    loadApp();
  }, [loadApp]);

  useEffect(() => {
    setFormulaDraft(selectedRaw);
  }, [selectedRaw, selected.row, selected.col]);

  useEffect(() => {
    setChartTitleDraft(active.chart?.title || '');
  }, [active.id, active.chart?.title]);

  useEffect(() => {
    setActiveMatchIndex(0);
  }, [sheetQuery, active.id]);

  useEffect(() => {
    if (activeMatch) setSelected(activeMatch);
  }, [activeMatch?.row, activeMatch?.col]);

  useEffect(() => {
    const handler = (event) => {
      const target = event.target;
      const isInput = ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
      if (isInput || editing) return;

      const { row, col } = selected;
      let next = { row, col };

      if (event.key === 'ArrowUp') next = { row: Math.max(0, row - 1), col };
      else if (event.key === 'ArrowDown') next = { row: Math.min(ROWS - 1, row + 1), col };
      else if (event.key === 'ArrowLeft') next = { row, col: Math.max(0, col - 1) };
      else if (event.key === 'ArrowRight') next = { row, col: Math.min(COLS - 1, col + 1) };
      else if (event.key === 'Enter' || event.key === 'F2') setEditing({ row, col });
      else if (event.key === 'Backspace' || event.key === 'Delete') setCellValue(row, col, '');
      else return;

      setSelected(next);
      event.preventDefault();
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [editing, selected, setCellValue]);

  async function runPrompt(customPrompt) {
    const nextPrompt = (customPrompt || prompt).trim();
    if (!nextPrompt) return;
    setPrompt(nextPrompt);
    setLoading('Vector AI is building the model');
    setNotice('');

    try {
      const result = await api.generate({ prompt: nextPrompt, workbookId: active.id || undefined });
      setActive(result.workbook);
      if (result.ai) setHealth((current) => ({ ...(current || {}), ai: result.ai }));
      setSummaryConfig(bestSummaryConfig(normalizeGrid(result.workbook.grid)));
      setPrompt(result.workbook.prompt || nextPrompt);
      setSelected({ row: 0, col: 0 });
      setDirty(false);
      setHistory({ undo: [], redo: [] });
      setNotice(
        result.source === 'ai-engine'
          ? 'Cloud AI generated workbook logic, formulas, insight, and chart.'
          : result.fallbackReason
            ? 'Cloud AI key or endpoint was rejected. Local AI generated the workbook instead.'
            : 'Local AI generated workbook logic, formulas, insight, and chart.'
      );
      const list = await api.listWorkbooks();
      setWorkbooks(list.workbooks || []);
    } catch (error) {
      setNotice(error.message);
    } finally {
      setLoading('');
    }
  }

  async function saveWorkbook() {
    setLoading('Saving workbook');
    try {
      const payload = {
        name: active.name,
        prompt: active.prompt || prompt,
        grid,
        summary: active.summary,
        chart: active.chart,
        tags: active.tags,
        activity: { ...active.activity, lastAction: 'Saved workbook' }
      };
      const result = active.id ? await api.updateWorkbook(active.id, payload) : await api.createWorkbook(payload);
      setActive(result.workbook);
      setDirty(false);
      setNotice('Workbook saved.');
      const list = await api.listWorkbooks();
      setWorkbooks(list.workbooks || []);
    } catch (error) {
      setNotice(error.message);
    } finally {
      setLoading('');
    }
  }

  async function createNewWorkbook() {
    setLoading('Creating workbook');
    try {
      const result = await api.createWorkbook({
        name: 'Untitled vectorsheet',
        grid: emptyGrid(),
        summary: 'A blank operating model ready for data, formulas, and prompt generation.',
        chart: { type: 'none', labelColumn: 0, valueColumn: 1, title: '' },
        tags: ['draft'],
        activity: { aiRuns: 0, lastAction: 'Created blank workbook' }
      });
      setActive(result.workbook);
      setSummaryConfig(bestSummaryConfig(normalizeGrid(result.workbook.grid)));
      setPrompt('');
      setSelected({ row: 0, col: 0 });
      setDirty(false);
      setHistory({ undo: [], redo: [] });
      const list = await api.listWorkbooks();
      setWorkbooks(list.workbooks || []);
    } catch {
      setActive(blankWorkbook());
      setSummaryConfig(bestSummaryConfig(emptyGrid()));
      setPrompt('');
      setDirty(true);
      setHistory({ undo: [], redo: [] });
    } finally {
      setLoading('');
    }
  }

  function selectWorkbook(workbook) {
    setActive(workbook);
    setSummaryConfig(bestSummaryConfig(normalizeGrid(workbook.grid)));
    setPrompt(workbook.prompt || '');
    setSelected({ row: 0, col: 0 });
    setDirty(false);
    setHistory({ undo: [], redo: [] });
  }

  function commitEdit(value, move) {
    const { row, col } = editing || selected;
    setCellValue(row, col, value);
    setEditing(null);
    if (move === 'down') setSelected({ row: Math.min(ROWS - 1, row + 1), col });
    if (move === 'right') setSelected({ row, col: Math.min(COLS - 1, col + 1) });
  }

  function commitFormula() {
    setCellValue(selected.row, selected.col, formulaDraft);
  }

  async function handleCsvImport(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    try {
      const text = await file.text();
      const rows = parseSheetText(text);
      if (!rows.length) {
        setNotice('Import failed. The file did not contain any spreadsheet rows.');
        return;
      }

      const importedGrid = gridFromRows(rows, { row: 0, col: 0 }, emptyGrid());
      commitWorkbookChange(
        (draft) => ({
          ...draft,
          grid: importedGrid,
          summary: `Imported ${rows.length} row${rows.length === 1 ? '' : 's'} from ${file.name}.`,
          tags: [...new Set([...(draft.tags || []), 'imported'])].slice(0, 8)
        }),
        `Imported ${file.name}`,
        `Imported ${Math.min(rows.length, ROWS)} rows from ${file.name}.`
      );
      setSummaryConfig(bestSummaryConfig(importedGrid));
      setSelected({ row: 0, col: 0 });
    } catch (error) {
      setNotice(`Import failed. ${error.message}`);
    }
  }

  function handleGridPaste(event) {
    const text = event.clipboardData?.getData('text/plain') || '';
    if (!text.includes('\t') && !text.includes('\n') && !text.includes(',')) return;

    const rows = parseSheetText(text);
    if (!rows.length) return;
    event.preventDefault();

    commitWorkbookChange(
      (draft) => ({
        ...draft,
        grid: gridFromRows(rows, selected, draft.grid)
      }),
      `Pasted ${rows.length} rows at ${cellId(selected.row, selected.col)}`,
      `Pasted ${rows.length} row${rows.length === 1 ? '' : 's'} at ${cellId(selected.row, selected.col)}.`
    );
  }

  async function duplicateWorkbook() {
    setLoading('Duplicating workbook');
    try {
      const result = await api.createWorkbook({
        name: `Copy of ${active.name || 'Untitled vectorsheet'}`,
        prompt: active.prompt || prompt,
        grid,
        summary: active.summary,
        chart: active.chart,
        tags: [...new Set([...(active.tags || []), 'copy'])].slice(0, 8),
        activity: { aiRuns: active.activity?.aiRuns || 0, lastAction: 'Duplicated workbook' }
      });
      setActive(result.workbook);
      setSummaryConfig(bestSummaryConfig(normalizeGrid(result.workbook.grid)));
      setPrompt(result.workbook.prompt || '');
      setSelected({ row: 0, col: 0 });
      setDirty(false);
      setHistory({ undo: [], redo: [] });
      const list = await api.listWorkbooks();
      setWorkbooks(list.workbooks || []);
      setNotice('Workbook duplicated.');
    } catch (error) {
      setNotice(error.message);
    } finally {
      setLoading('');
    }
  }

  async function deleteActiveWorkbook() {
    if (!active.id) {
      const local = blankWorkbook();
      setActive(local);
      setSummaryConfig(bestSummaryConfig(local.grid));
      setPrompt('');
      setDirty(false);
      setHistory({ undo: [], redo: [] });
      setNotice('Local draft cleared.');
      return;
    }

    const confirmed = window.confirm(`Delete "${active.name}"? This cannot be undone.`);
    if (!confirmed) return;

    setLoading('Deleting workbook');
    try {
      await api.deleteWorkbook(active.id);
      const list = await api.listWorkbooks();
      const nextWorkbooks = list.workbooks || [];
      const nextActive = nextWorkbooks[0] || blankWorkbook();
      setWorkbooks(nextWorkbooks);
      setActive(nextActive);
      setSummaryConfig(bestSummaryConfig(normalizeGrid(nextActive.grid)));
      setPrompt(nextActive.prompt || '');
      setSelected({ row: 0, col: 0 });
      setDirty(false);
      setHistory({ undo: [], redo: [] });
      setNotice('Workbook deleted.');
    } catch (error) {
      setNotice(error.message);
    } finally {
      setLoading('');
    }
  }

  function downloadCsv() {
    const blob = new Blob([exportCsv(grid)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${active.name || 'vectorsheet'}.csv`.replace(/[^\w.-]+/g, '-').toLowerCase();
    link.click();
    URL.revokeObjectURL(url);
    setNotice('CSV exported.');
  }

  function updateChartSetting(nextChart, action = 'Updated chart settings') {
    commitWorkbookChange(
      (draft) => ({
        ...draft,
        chart: {
          type: 'none',
          labelColumn: 0,
          valueColumn: 1,
          title: '',
          ...(draft.chart || {}),
          ...nextChart
        }
      }),
      action,
      action
    );
  }

  function fillFormulaDown() {
    const raw = String(grid[selected.row]?.[selected.col] || '');
    if (!raw.startsWith('=')) {
      setNotice('Select a formula cell first, then fill it down.');
      return;
    }

    const nextGrid = grid.map((row) => [...row]);
    let filled = 0;

    for (let row = selected.row + 1; row < ROWS; row += 1) {
      const occupied = String(nextGrid[row][selected.col] || '').trim();
      const rowHasContext = nextGrid[row].some((cell, col) => col !== selected.col && String(cell || '').trim());
      if (occupied || !rowHasContext) break;
      nextGrid[row][selected.col] = shiftFormulaRows(raw, row - selected.row);
      filled += 1;
    }

    if (!filled) {
      setNotice('No blank data rows below the selected formula.');
      return;
    }

    commitWorkbookChange(
      (draft) => ({ ...draft, grid: nextGrid }),
      `Filled ${filled} formulas from ${cellId(selected.row, selected.col)}`,
      `Filled ${filled} formula${filled === 1 ? '' : 's'} down.`
    );
  }

  function writeForecast() {
    const chart = active.chart || {};
    const labelColumn = Number(chart.labelColumn || 0);
    const valueColumn = Number(chart.valueColumn || 1);

    if (!forecast.length || chart.type === 'none') {
      setNotice('Generate a charted model first, then write a forecast.');
      return;
    }

    if (labelColumn === valueColumn) {
      setNotice('Choose different label and value columns before writing a forecast.');
      return;
    }

    const nextGrid = grid.map((row) => [...row]);
    const startRow = nextGrid.findIndex((row, index) => index > 0 && row.every((cell) => !String(cell || '').trim()));

    if (startRow < 1 || startRow >= ROWS) {
      setNotice('No empty rows are available for the forecast.');
      return;
    }

    const writable = forecast.slice(0, ROWS - startRow);
    writable.forEach((point, index) => {
      const row = startRow + index;
      nextGrid[row][labelColumn] = point.label;
      nextGrid[row][valueColumn] = String(Math.round(point.value));
    });

    commitWorkbookChange(
      (draft) => ({ ...draft, grid: nextGrid }),
      `Wrote ${writable.length} forecast rows from chart trend`,
      `Forecast written to rows ${startRow + 1}-${startRow + writable.length}.`
    );
  }

  function writeScenarioToCell() {
    if (!Number.isFinite(weightedOutcome)) {
      setNotice('Generate a charted model first, then write a scenario output.');
      return;
    }

    setCellValue(
      selected.row,
      selected.col,
      String(Math.round(weightedOutcome)),
      `Wrote scenario output to ${cellId(selected.row, selected.col)}`
    );
    setNotice(`Scenario output written to ${cellId(selected.row, selected.col)}.`);
  }

  function moveMatch(direction) {
    if (!sheetMatches.length) {
      setNotice(sheetQuery.trim() ? 'No matching cells found.' : 'Type a value in Find first.');
      return;
    }

    const nextIndex = (activeMatchIndex + direction + sheetMatches.length) % sheetMatches.length;
    setActiveMatchIndex(nextIndex);
    setSelected(sheetMatches[nextIndex]);
  }

  function sortBySelectedColumn(direction) {
    const filledRows = grid
      .slice(1)
      .map((row, index) => ({ row, originalRow: index + 1 }))
      .filter((item) => rowHasData(item.row));
    const blankRows = Array.from({ length: ROWS - 1 - filledRows.length }, () => Array(COLS).fill(''));

    if (filledRows.length < 2) {
      setNotice('Add at least two data rows before sorting.');
      return;
    }

    const sortedRows = filledRows
      .sort((a, b) => compareSortValues(sortValue(grid, a.originalRow, selected.col), sortValue(grid, b.originalRow, selected.col)))
      .map((item) => item.row);

    if (direction === 'desc') sortedRows.reverse();

    commitWorkbookChange(
      (draft) => ({ ...draft, grid: [draft.grid[0], ...sortedRows, ...blankRows] }),
      `Sorted by ${columnName(selected.col)} ${direction === 'asc' ? 'ascending' : 'descending'}`,
      `Sorted rows by column ${columnName(selected.col)}.`
    );
  }

  function clearSelectedColumn() {
    commitWorkbookChange(
      (draft) => {
        draft.grid.forEach((row, index) => {
          if (index > 0) row[selected.col] = '';
        });
        return draft;
      },
      `Cleared column ${columnName(selected.col)}`,
      `Cleared data in column ${columnName(selected.col)}.`
    );
  }

  function clearSelectedRow() {
    commitWorkbookChange(
      (draft) => {
        draft.grid[selected.row] = Array(COLS).fill('');
        return draft;
      },
      `Cleared row ${selected.row + 1}`,
      `Cleared row ${selected.row + 1}.`
    );
  }

  function insertRowBelow() {
    commitWorkbookChange(
      (draft) => {
        draft.grid.splice(Math.min(ROWS, selected.row + 1), 0, Array(COLS).fill(''));
        draft.grid = draft.grid.slice(0, ROWS);
        return draft;
      },
      `Inserted row below ${selected.row + 1}`,
      `Inserted a row below row ${selected.row + 1}.`
    );
  }

  function deleteSelectedRow() {
    commitWorkbookChange(
      (draft) => {
        draft.grid.splice(selected.row, 1);
        draft.grid.push(Array(COLS).fill(''));
        return draft;
      },
      `Deleted row ${selected.row + 1}`,
      `Deleted row ${selected.row + 1}.`
    );
    setSelected((current) => ({ row: Math.min(current.row, ROWS - 1), col: current.col }));
  }

  function insertColumnRight() {
    commitWorkbookChange(
      (draft) => {
        draft.grid = draft.grid.map((row) => {
          const nextRow = [...row];
          nextRow.splice(Math.min(COLS, selected.col + 1), 0, '');
          return nextRow.slice(0, COLS);
        });
        return draft;
      },
      `Inserted column after ${columnName(selected.col)}`,
      `Inserted a column after ${columnName(selected.col)}.`
    );
  }

  function deleteSelectedColumn() {
    commitWorkbookChange(
      (draft) => {
        draft.grid = draft.grid.map((row) => {
          const nextRow = [...row];
          nextRow.splice(selected.col, 1);
          nextRow.push('');
          return nextRow;
        });
        return draft;
      },
      `Deleted column ${columnName(selected.col)}`,
      `Deleted column ${columnName(selected.col)}.`
    );
    setSelected((current) => ({ row: current.row, col: Math.min(current.col, COLS - 1) }));
  }

  function removeBlankRows() {
    const filledRows = grid.slice(1).filter(rowHasData);
    const removed = ROWS - 1 - filledRows.length;

    if (!removed) {
      setNotice('No blank rows to remove.');
      return;
    }

    commitWorkbookChange(
      (draft) => ({
        ...draft,
        grid: [draft.grid[0], ...filledRows, ...Array.from({ length: removed }, () => Array(COLS).fill(''))]
      }),
      `Removed ${removed} blank rows`,
      `Moved ${removed} blank row${removed === 1 ? '' : 's'} to the bottom.`
    );
  }

  function formatSelectedCell(mode) {
    const value = evaluateCell(grid, selected.row, selected.col, new Set());
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      setNotice('Select a numeric cell before applying number formatting.');
      return;
    }

    setCellValue(
      selected.row,
      selected.col,
      formatNumericValue(value, mode),
      `Formatted ${cellId(selected.row, selected.col)} as ${mode}`
    );
    setNotice(`Formatted ${cellId(selected.row, selected.col)} as ${mode}.`);
  }

  function insertQuickFormula(fn) {
    const dataRows = [];

    for (let row = 1; row < ROWS; row += 1) {
      const raw = String(grid[row]?.[selected.col] || '').trim();
      const rowHasContext = grid[row]?.some((cell) => String(cell || '').trim());
      if (rowHasContext) dataRows.push(row);
      if (!raw && rowHasContext) continue;
    }

    const numericRows = dataRows.filter((row) => typeof evaluateCell(grid, row, selected.col, new Set()) === 'number');
    if (!numericRows.length) {
      setNotice('Select a column with numeric values before inserting a quick formula.');
      return;
    }

    const writeRow = grid.findIndex((row, index) => index > Math.max(...numericRows) && row.every((cell) => !String(cell || '').trim()));
    if (writeRow < 1) {
      setNotice('No blank row is available for the quick formula.');
      return;
    }

    const firstRef = cellId(Math.min(...numericRows), selected.col);
    const lastRef = cellId(Math.max(...numericRows), selected.col);
    const formula = fn === 'AVG' ? `=AVERAGE(${firstRef}:${lastRef})` : `=${fn}(${firstRef}:${lastRef})`;

    commitWorkbookChange(
      (draft) => {
        draft.grid[writeRow][0] = `${fn} ${columnName(selected.col)}`;
        draft.grid[writeRow][selected.col] = formula;
        return draft;
      },
      `Inserted ${fn} for column ${columnName(selected.col)}`,
      `Inserted ${fn} formula in ${cellId(writeRow, selected.col)}.`
    );
  }

  function trimSelectedColumn() {
    const nextGrid = cloneGrid(grid);
    let changed = 0;

    nextGrid.forEach((row, index) => {
      if (index === 0) return;
      const current = String(row[selected.col] || '');
      const trimmed = current.trim();
      if (current !== trimmed) {
        row[selected.col] = trimmed;
        changed += 1;
      }
    });

    if (!changed) {
      setNotice('No extra spaces found.');
      return;
    }

    commitWorkbookChange(
      (draft) => ({ ...draft, grid: nextGrid }),
      `Trimmed column ${columnName(selected.col)}`,
      `Trimmed ${changed} cell${changed === 1 ? '' : 's'} in column ${columnName(selected.col)}.`
    );
  }

  function convertSelectedColumnToNumbers() {
    const nextGrid = cloneGrid(grid);
    let changed = 0;

    nextGrid.forEach((row, index) => {
      if (index === 0) return;
      const current = String(row[selected.col] || '').trim();
      if (!current || current.startsWith('=')) return;
      const numeric = Number(current.replace(/[$,\s]/g, '').replace(/%$/, ''));
      if (Number.isFinite(numeric)) {
        const nextValue = current.endsWith('%') ? String(numeric / 100) : String(numeric);
        if (row[selected.col] !== nextValue) {
          row[selected.col] = nextValue;
          changed += 1;
        }
      }
    });

    if (!changed) {
      setNotice('No convertible values found.');
      return;
    }

    commitWorkbookChange(
      (draft) => ({ ...draft, grid: nextGrid }),
      `Converted column ${columnName(selected.col)} to numbers`,
      `Converted ${changed} cell${changed === 1 ? '' : 's'} in column ${columnName(selected.col)}.`
    );
  }

  function fillSelectedColumnBlanks() {
    const nextGrid = cloneGrid(grid);
    let lastValue = '';
    let changed = 0;

    for (let row = 1; row < ROWS; row += 1) {
      const current = String(nextGrid[row][selected.col] || '').trim();
      const hasContext = rowHasData(nextGrid[row]);

      if (current) {
        lastValue = nextGrid[row][selected.col];
        continue;
      }

      if (hasContext && lastValue) {
        nextGrid[row][selected.col] = lastValue;
        changed += 1;
      }
    }

    if (!changed) {
      setNotice('No blanks were filled in the selected column.');
      return;
    }

    commitWorkbookChange(
      (draft) => ({ ...draft, grid: nextGrid }),
      `Filled blanks in column ${columnName(selected.col)}`,
      `Filled ${changed} blank cell${changed === 1 ? '' : 's'} in column ${columnName(selected.col)}.`
    );
  }

  function removeDuplicateRowsByColumn() {
    const seen = new Set();
    const keptRows = [];
    let removed = 0;

    grid.slice(1).forEach((row) => {
      if (!rowHasData(row)) return;
      const key = String(row[selected.col] || '').trim().toLowerCase();
      if (key && seen.has(key)) {
        removed += 1;
        return;
      }
      if (key) seen.add(key);
      keptRows.push(row);
    });

    if (!removed) {
      setNotice('No duplicate data rows found for the selected column.');
      return;
    }

    const blankRows = Array.from({ length: ROWS - 1 - keptRows.length }, () => Array(COLS).fill(''));
    commitWorkbookChange(
      (draft) => ({ ...draft, grid: [draft.grid[0], ...keptRows, ...blankRows] }),
      `Removed ${removed} duplicate rows by column ${columnName(selected.col)}`,
      `Removed ${removed} duplicate row${removed === 1 ? '' : 's'} by column ${columnName(selected.col)}.`
    );
  }

  function writePivotSummaryToSheet(chartAfterWrite = false) {
    if (!pivotSummary.rows.length) {
      setNotice('Choose a text group column and a numeric value column before writing a summary.');
      return;
    }

    const rows = pivotSummary.rows.slice(0, ROWS - 1);
    const output = [
      [`Summary by ${pivotSummary.labelHeader}`, 'Count', `Sum ${pivotSummary.valueHeader}`, `Avg ${pivotSummary.valueHeader}`],
      ...rows.map((row) => [row.label, String(row.count), String(Math.round(row.sum)), String(Math.round(row.avg))])
    ];
    const startRow = findBlankBlock(grid, output.length, PIVOT_START_COL, 4);

    if (startRow < 0) {
      setNotice('No empty summary block is available in the right-side columns.');
      return;
    }

    commitWorkbookChange(
      (draft) => {
        output.forEach((row, rowIndex) => {
          row.forEach((cell, colIndex) => {
            draft.grid[startRow + rowIndex][PIVOT_START_COL + colIndex] = cell;
          });
        });

        if (chartAfterWrite) {
          draft.chart = {
            type: 'bar',
            labelColumn: PIVOT_START_COL,
            valueColumn: PIVOT_START_COL + 2,
            title: `Sum ${pivotSummary.valueHeader} by ${pivotSummary.labelHeader}`
          };
        }

        return draft;
      },
      chartAfterWrite ? 'Wrote and charted summary table' : 'Wrote summary table',
      chartAfterWrite
        ? `Summary written to ${cellId(startRow, PIVOT_START_COL)} and charted.`
        : `Summary written to ${cellId(startRow, PIVOT_START_COL)}.`
    );
    setSelected({ row: startRow, col: PIVOT_START_COL });
  }

  function downloadPivotSummaryCsv() {
    if (!pivotSummary.rows.length) {
      setNotice('No summary rows are available to export.');
      return;
    }

    const rows = [
      [pivotSummary.labelHeader, 'Count', `Sum ${pivotSummary.valueHeader}`, `Avg ${pivotSummary.valueHeader}`],
      ...pivotSummary.rows.map((row) => [row.label, row.count, Math.round(row.sum), Math.round(row.avg)])
    ];
    const csv = rows.map((row) => row.map(csvEscape).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${active.name || 'vectorsheet'}-summary.csv`.replace(/[^\w.-]+/g, '-').toLowerCase();
    link.click();
    URL.revokeObjectURL(url);
    setNotice('Summary CSV exported.');
  }

  function saveNamedRange() {
    if (!selectedColumnRange) {
      setNotice('Select a column with data before saving a named range.');
      return;
    }

    const fallbackName = String(grid[0]?.[selected.col] || columnName(selected.col))
      .replace(/[^a-z0-9]+/gi, ' ')
      .trim()
      .replace(/\s+/g, ' ');
    const label = (namedRangeName.trim() || fallbackName || `Range ${namedRanges.length + 1}`).slice(0, 32);
    const nextRange = {
      id: String(Date.now()),
      name: label,
      ref: selectedColumnRange.ref,
      column: columnName(selected.col),
      savedAt: new Date().toISOString()
    };
    const nextRanges = [nextRange, ...namedRanges.filter((range) => range.name.toLowerCase() !== label.toLowerCase())].slice(0, 12);
    writeNamedRanges(activeRef.current, nextRanges);
    setNamedRanges(nextRanges);
    setNamedRangeName('');
    setNotice(`Named range "${label}" saved as ${selectedColumnRange.ref}.`);
  }

  function deleteNamedRange(range) {
    const nextRanges = namedRanges.filter((item) => item.id !== range.id);
    writeNamedRanges(activeRef.current, nextRanges);
    setNamedRanges(nextRanges);
    setNotice(`Named range "${range.name}" deleted.`);
  }

  function insertNamedRangeSum(range) {
    if (!range?.ref) return;
    setCellValue(selected.row, selected.col, `=SUM(${range.ref})`, `Inserted named range formula in ${cellId(selected.row, selected.col)}`);
    setNotice(`Inserted SUM for "${range.name}" in ${cellId(selected.row, selected.col)}.`);
  }

  function insertFormulaTemplate(kind) {
    const valueRange = dataRangeForColumn(grid, summaryConfig.valueCol);
    const labelRange = dataRangeForColumn(grid, summaryConfig.labelCol);
    const selectedRange = dataRangeForColumn(grid, selected.col);
    const firstLabel = cleanFormulaCriterion(pivotSummary.rows[0]?.label || displayValue(grid, 1, summaryConfig.labelCol));

    let formula = '';
    if (kind === 'SUMIF' && labelRange && valueRange && firstLabel) {
      formula = `=SUMIF(${labelRange.ref},"${firstLabel}",${valueRange.ref})`;
    }
    if (kind === 'COUNTIF' && selectedRange) {
      formula = selectedQuality.numeric ? `=COUNTIF(${selectedRange.ref},">0")` : `=COUNTIF(${selectedRange.ref},"*")`;
    }
    if (kind === 'AVERAGEIF' && labelRange && valueRange && firstLabel) {
      formula = `=AVERAGEIF(${labelRange.ref},"${firstLabel}",${valueRange.ref})`;
    }
    if (kind === 'IF') {
      formula = `=IF(${cellId(selected.row, selected.col)}>0,1,0)`;
    }
    if (kind === 'ROUND') {
      formula = `=ROUND(${cellId(selected.row, selected.col)},2)`;
    }

    if (!formula) {
      setNotice('This formula template needs a usable data range first.');
      return;
    }

    setCellValue(selected.row, selected.col, formula, `Inserted ${kind} template in ${cellId(selected.row, selected.col)}`);
    setNotice(`Inserted ${kind} template in ${cellId(selected.row, selected.col)}.`);
  }

  function goToFirstIssue() {
    const validationRef = [...validationSet][0];
    const errorRef = audit.errors[0]?.ref || validationRef;
    if (!errorRef) {
      setNotice('No formula or validation issues found.');
      return;
    }

    const match = /^([A-L])(\d+)$/i.exec(errorRef);
    if (!match) return;
    setSelected({ row: Number(match[2]) - 1, col: match[1].toUpperCase().charCodeAt(0) - 65 });
    setNotice(`Selected first issue at ${errorRef}.`);
  }

  function saveLocalVersion() {
    const current = activeRef.current;
    const nextVersion = {
      id: String(Date.now()),
      savedAt: new Date().toISOString(),
      name: current.name,
      snapshot: snapshotWorkbook(current)
    };
    const nextVersions = [nextVersion, ...readVersions(current)].slice(0, 8);
    writeVersions(current, nextVersions);
    setVersions(nextVersions);
    setNotice('Version snapshot saved locally.');
  }

  function restoreLocalVersion(version) {
    if (!version?.snapshot) return;

    commitWorkbookChange(
      () => ({
        ...activeRef.current,
        ...version.snapshot,
        grid: cloneGrid(version.snapshot.grid),
        chart: { ...(version.snapshot.chart || { type: 'none', labelColumn: 0, valueColumn: 1, title: '' }) },
        tags: [...(version.snapshot.tags || [])]
      }),
      `Restored version from ${new Date(version.savedAt).toLocaleString()}`,
      'Version restored locally.'
    );
  }

  function saveCellNote() {
    const nextNotes = { ...notes };
    const text = noteDraft.trim();

    if (text) nextNotes[selectedRef] = text;
    else delete nextNotes[selectedRef];

    writeNotes(activeRef.current, nextNotes);
    setNotes(nextNotes);
    setNotice(text ? `Note saved for ${selectedRef}.` : `Note cleared for ${selectedRef}.`);
  }

  function clearCellNote() {
    const nextNotes = { ...notes };
    delete nextNotes[selectedRef];
    writeNotes(activeRef.current, nextNotes);
    setNotes(nextNotes);
    setNoteDraft('');
    setNotice(`Note cleared for ${selectedRef}.`);
  }

  function saveScenarioPreset() {
    const label = scenarioName.trim() || `Scenario ${savedScenarios.length + 1}`;
    const nextScenario = {
      id: String(Date.now()),
      name: label,
      savedAt: new Date().toISOString(),
      values: { ...scenario }
    };
    const nextScenarios = [nextScenario, ...savedScenarios.filter((item) => item.name !== label)].slice(0, 8);
    writeScenarios(activeRef.current, nextScenarios);
    setSavedScenarios(nextScenarios);
    setScenarioName('');
    setNotice(`Scenario "${label}" saved.`);
  }

  function applyScenarioPreset(item) {
    if (!item?.values) return;
    setScenario(item.values);
    setNotice(`Scenario "${item.name}" applied.`);
  }

  function deleteScenarioPreset(item) {
    const nextScenarios = savedScenarios.filter((scenarioItem) => scenarioItem.id !== item.id);
    writeScenarios(activeRef.current, nextScenarios);
    setSavedScenarios(nextScenarios);
    setNotice(`Scenario "${item.name}" deleted.`);
  }

  function exportWorkbookReport() {
    const report = {
      product: 'Vectorsheets',
      exportedAt: new Date().toISOString(),
      workbook: {
        id: active.id,
        name: active.name,
        status: active.status,
        prompt: active.prompt || prompt,
        tags: active.tags,
        summary: active.summary
      },
      health: {
        stats,
        audit,
        selectedColumn: {
          column: columnName(selected.col),
          profile: selectedColumn,
          quality: selectedQuality
        }
      },
      view: {
        filterColumn: columnName(selected.col),
        filterText,
        visibleDataRows: Math.max(0, visibleRows.length - 1),
        conditionalRule,
        conditionalCells: [...conditionalSet],
        validationRule,
        validationIssues: [...validationSet]
      },
      summary: {
        groupColumn: columnName(summaryConfig.labelCol),
        valueColumn: columnName(summaryConfig.valueCol),
        labelHeader: pivotSummary.labelHeader,
        valueHeader: pivotSummary.valueHeader,
        total: pivotSummary.total,
        rows: pivotSummary.rows
      },
      chart: active.chart,
      scenarios: savedScenarios,
      namedRanges,
      notes,
      grid
    };
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${active.name || 'vectorsheet'}-report.json`.replace(/[^\w.-]+/g, '-').toLowerCase();
    link.click();
    URL.revokeObjectURL(url);
    setNotice('Workbook report exported.');
  }

  function exportHtmlReport() {
    const visibleDataRows = visibleRows.filter((row) => row === 0 || rowHasData(grid[row])).slice(0, 28);
    const tableRows = visibleDataRows
      .map((row) => {
        const cells = Array.from({ length: COLS }, (_, col) => {
          const ref = cellId(row, col);
          const className = cx(
            row === 0 && 'header',
            conditionalSet.has(ref) && 'flagged',
            validationSet.has(ref) && 'invalid'
          );
          const tag = row === 0 ? 'th' : 'td';
          return `<${tag}${className ? ` class="${className}"` : ''}>${escapeHtml(displayValue(grid, row, col))}</${tag}>`;
        }).join('');
        return `<tr>${cells}</tr>`;
      })
      .join('');
    const notesHtml = Object.entries(notes)
      .filter(([, value]) => String(value || '').trim())
      .slice(0, 12)
      .map(([ref, value]) => `<li><strong>${escapeHtml(ref)}</strong><span>${escapeHtml(value)}</span></li>`)
      .join('');
    const scenarioHtml = savedScenarios
      .slice(0, 8)
      .map(
        (item) =>
          `<li><strong>${escapeHtml(item.name)}</strong><span>${item.values.growth}% growth, ${item.values.margin}% margin, ${item.values.confidence}% confidence</span></li>`
      )
      .join('');
    const namedRangeHtml = namedRanges
      .slice(0, 12)
      .map((range) => `<li><strong>${escapeHtml(range.name)}</strong><span>${escapeHtml(range.ref)}</span></li>`)
      .join('');
    const summaryRows = pivotSummary.rows
      .slice(0, 12)
      .map(
        (row) =>
          `<tr><td>${escapeHtml(row.label)}</td><td>${row.count}</td><td>${escapeHtml(metricLabel(row.sum))}</td><td>${escapeHtml(metricLabel(row.avg))}</td></tr>`
      )
      .join('');
    const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(active.name || 'Vectorsheets report')}</title>
  <style>
    body{margin:0;background:#f5f7fb;color:#1f2328;font-family:Aptos,Segoe UI,system-ui,sans-serif}
    main{max-width:1180px;margin:0 auto;padding:28px}
    header,.panel{background:#fff;border:1px solid #d9e0ea;border-radius:10px;padding:18px;margin-bottom:14px}
    h1{margin:0;font-size:28px;letter-spacing:0} h2{margin:0 0 10px;font-size:15px}
    p{color:#667085;line-height:1.5}.metrics{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}
    .metric{border:1px solid #d9e0ea;border-radius:8px;padding:12px;background:#f7f9fc}.metric span{display:block;color:#667085;font-size:12px}.metric strong{font-size:20px}
    table{width:100%;border-collapse:collapse;background:#fff;font-family:Cascadia Mono,Consolas,monospace;font-size:12px}
    th,td{border:1px solid #d9e0ea;padding:7px;max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-align:left}
    th,.header{background:#eef2f7;font-weight:700}.flagged{background:#ecfdf3}.invalid{background:#fff1eb;color:#9a3412}
    ul{padding:0;list-style:none;display:grid;gap:8px}li{border:1px solid #d9e0ea;border-radius:8px;background:#f7f9fc;padding:10px;display:flex;gap:10px;justify-content:space-between}
    @media(max-width:760px){main{padding:14px}.metrics{grid-template-columns:1fr}li{display:block}}
  </style>
</head>
<body>
  <main>
    <header>
      <h1>${escapeHtml(active.name || 'Vectorsheets report')}</h1>
      <p>${escapeHtml(active.summary || 'Workbook report exported from Vectorsheets.')}</p>
    </header>
    <section class="panel metrics">
      <div class="metric"><span>Filled cells</span><strong>${stats.filled}</strong></div>
      <div class="metric"><span>Numeric cells</span><strong>${stats.numeric}</strong></div>
      <div class="metric"><span>Formulas</span><strong>${stats.formulas}</strong></div>
      <div class="metric"><span>Validation issues</span><strong>${validationSet.size}</strong></div>
    </section>
    <section class="panel">
      <h2>Sheet preview</h2>
      <table>${tableRows}</table>
    </section>
    <section class="panel">
      <h2>Column ${columnName(selected.col)} profile</h2>
      <p>Quality ${selectedQuality.score}. Sum ${metricLabel(selectedColumn.sum)}. Average ${metricLabel(selectedColumn.avg)}. Filter ${filterText ? `"${escapeHtml(filterText)}"` : 'off'}.</p>
    </section>
    <section class="panel">
      <h2>Summary by ${escapeHtml(pivotSummary.labelHeader)}</h2>
      <table><tr><th>${escapeHtml(pivotSummary.labelHeader)}</th><th>Count</th><th>Sum ${escapeHtml(pivotSummary.valueHeader)}</th><th>Avg ${escapeHtml(pivotSummary.valueHeader)}</th></tr>${summaryRows || '<tr><td colspan="4">No summary rows available.</td></tr>'}</table>
    </section>
    <section class="panel">
      <h2>Notes</h2>
      <ul>${notesHtml || '<li><span>No saved cell notes.</span></li>'}</ul>
    </section>
    <section class="panel">
      <h2>Named ranges</h2>
      <ul>${namedRangeHtml || '<li><span>No named ranges saved.</span></li>'}</ul>
    </section>
    <section class="panel">
      <h2>Scenarios</h2>
      <ul>${scenarioHtml || '<li><span>No saved scenarios.</span></li>'}</ul>
    </section>
  </main>
</body>
</html>`;
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${active.name || 'vectorsheet'}-report.html`.replace(/[^\w.-]+/g, '-').toLowerCase();
    link.click();
    URL.revokeObjectURL(url);
    setNotice('HTML report exported.');
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand-block">
          <div className="brand-mark">
            <Grid3X3 size={20} />
          </div>
          <div>
            <div className="brand-name">Vectorsheets</div>
            <div className="brand-subtitle">by SuperOrbit</div>
          </div>
        </div>

        <div className="search-box">
          <Search size={15} />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search workbooks" />
        </div>

        <div className="side-section">
          <div className="side-heading">
            <FolderOpen size={15} />
            Workspace
          </div>
          <button className="new-workbook" onClick={createNewWorkbook}>
            <Plus size={16} />
            New workbook
          </button>
          <div className="workbook-list">
            {filteredWorkbooks.map((workbook) => (
              <button
                className={cx('workbook-item', active.id === workbook.id && 'active')}
                key={workbook.id || workbook.name}
                onClick={() => selectWorkbook(workbook)}
              >
                <FileSpreadsheet size={16} />
                <span>
                  <strong>{workbook.name}</strong>
                  <small>{workbook.status || 'Live model'}</small>
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className="side-section">
          <div className="side-heading">
            <Sparkles size={15} />
            Model templates
          </div>
          {suggestions.map((item) => (
            <button className="template-item" key={item} onClick={() => runPrompt(item)}>
              <ChevronRight size={14} />
              {item.split(':')[0]}
            </button>
          ))}
        </div>

        <div className="ops-strip">
          <span>{health?.database === 'mongo' ? 'MongoDB live' : 'Demo mode'}</span>
          <strong>{aiStatus}</strong>
        </div>
      </aside>

      <section className="main-stage">
        <header className="topbar">
          <div>
            <div className="eyebrow">Spreadsheet agent workspace</div>
            <input
              className="workbook-title"
              value={active.name}
              onChange={(event) => {
                setActive((current) => ({ ...current, name: event.target.value }));
                setDirty(true);
              }}
            />
          </div>

          <div className="top-actions">
            <button className="icon-button" onClick={undoChange} disabled={!history.undo.length} title="Undo">
              <Undo2 size={16} />
            </button>
            <button className="icon-button" onClick={redoChange} disabled={!history.redo.length} title="Redo">
              <Redo2 size={16} />
            </button>
            <button className="icon-button" onClick={loadApp} title="Refresh workspace">
              <RefreshCw size={16} />
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv,text/plain"
              className="file-input"
              onChange={handleCsvImport}
            />
            <button className="command-button" onClick={() => fileInputRef.current?.click()}>
              <Upload size={16} />
              Import CSV
            </button>
            <button className="command-button" onClick={downloadCsv}>
              <Download size={16} />
              Export CSV
            </button>
            <button className="command-button" onClick={exportWorkbookReport}>
              <ClipboardList size={16} />
              Export report
            </button>
            <button className="command-button" onClick={exportHtmlReport}>
              <Download size={16} />
              Export HTML
            </button>
            <button className="command-button" onClick={duplicateWorkbook}>
              <Copy size={16} />
              Duplicate
            </button>
            <button className="icon-button danger" onClick={deleteActiveWorkbook} title="Delete workbook">
              <Trash2 size={16} />
            </button>
            <button className="command-button primary" onClick={saveWorkbook}>
              <Save size={16} />
              {dirty ? 'Save changes' : 'Saved'}
            </button>
          </div>
        </header>

        <section className="command-center">
          <div className="prompt-line">
            <Wand2 size={18} />
            <textarea
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              placeholder="Describe the spreadsheet, model, forecast, plan, tracker, or operating system you want Vectorsheets to build."
              onKeyDown={(event) => {
                if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) runPrompt();
              }}
            />
            <button className="generate-button" onClick={() => runPrompt()} disabled={Boolean(loading)}>
              Generate
            </button>
          </div>
          <div className="prompt-chips">
            {suggestions.map((item) => (
              <button key={item} onClick={() => runPrompt(item)}>
                {item.split(':')[0]}
              </button>
            ))}
          </div>
        </section>

        <section className="product-grid">
          <div className="workbench-panel">
            <div className="sheet-tools">
              <div className="sheet-find">
                <Search size={15} />
                <input
                  value={sheetQuery}
                  onChange={(event) => setSheetQuery(event.target.value)}
                  placeholder="Find in sheet"
                />
                <span>{sheetMatches.length ? `${activeMatchIndex + 1}/${sheetMatches.length}` : '0'}</span>
                <button onClick={() => moveMatch(-1)} disabled={!sheetMatches.length} title="Previous match">
                  Prev
                </button>
                <button onClick={() => moveMatch(1)} disabled={!sheetMatches.length} title="Next match">
                  Next
                </button>
              </div>
              <div className="format-tools">
                <button onClick={() => formatSelectedCell('number')}>Number</button>
                <button onClick={() => formatSelectedCell('currency')}>Currency</button>
                <button onClick={() => formatSelectedCell('percent')}>Percent</button>
              </div>
            </div>
            <div className="formula-bar">
              <span className="cell-ref">{cellId(selected.row, selected.col)}</span>
              <input
                value={formulaDraft}
                onChange={(event) => setFormulaDraft(event.target.value)}
                onBlur={commitFormula}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') commitFormula();
                }}
                placeholder="Type a value or =SUM(A1:A5)"
              />
              <span className="cell-value">{formatValue(selectedValue)}</span>
            </div>

            <SpreadsheetGrid
              grid={grid}
              selected={selected}
              editing={editing}
              onSelect={(row, col) => {
                setSelected({ row, col });
                setEditing(null);
              }}
              onEdit={(row, col) => setEditing({ row, col })}
              onCommit={commitEdit}
              onCancel={() => setEditing(null)}
              onPaste={handleGridPaste}
              matchSet={matchSet}
              activeMatch={activeMatch}
              noteSet={noteSet}
              conditionalSet={conditionalSet}
              validationSet={validationSet}
              visibleRows={visibleRows}
            />

            <div className="status-bar">
              <span>{loading || notice || active.activity?.lastAction || 'Ready'}</span>
              <span>
                {stats.filled} cells filled / {stats.numeric} numeric
                {filterText.trim() ? ` / ${Math.max(0, visibleRows.length - 1)} filtered` : ''}
                {validationSet.size ? ` / ${validationSet.size} validation issues` : ''} / {dirty ? 'unsaved changes' : 'synced'}
              </span>
            </div>
          </div>

          <aside className="inspector-panel">
            <div className="metric-grid">
              <div className="metric-tile">
                <Gauge size={17} />
                <span>Model value</span>
                <strong>{metricLabel(totalValue)}</strong>
              </div>
              <div className="metric-tile">
                <Activity size={17} />
                <span>Peak row</span>
                <strong>{peak.label}</strong>
              </div>
              <div className="metric-tile">
                <Zap size={17} />
                <span>AI runs</span>
                <strong>{active.activity?.aiRuns || 0}</strong>
              </div>
              <div className="metric-tile">
                <Layers3 size={17} />
                <span>Formulas</span>
                <strong>{stats.formulas}</strong>
              </div>
            </div>

            <section className="ops-section">
              <div className="panel-heading">
                <Zap size={16} />
                Model ops
              </div>
              <div className="action-grid">
                <button onClick={fillFormulaDown}>
                  <Layers3 size={15} />
                  <span>
                    <strong>Fill formula down</strong>
                    <small>Extends the selected formula through matching data rows.</small>
                  </span>
                </button>
                <button onClick={writeForecast} disabled={!forecast.length}>
                  <BarChart3 size={15} />
                  <span>
                    <strong>Write forecast</strong>
                    <small>Appends four trend rows from the active chart series.</small>
                  </span>
                </button>
              </div>
            </section>

            <section className="data-tools-section">
              <div className="panel-heading">
                <ListFilter size={16} />
                Data tools
              </div>
              <div className="filter-control">
                <label>
                  <span>Filter {columnName(selected.col)}</span>
                  <input
                    value={filterText}
                    onChange={(event) => setFilterText(event.target.value)}
                    placeholder="Type to filter rows"
                  />
                </label>
                <strong>{filterText.trim() ? `${Math.max(0, visibleRows.length - 1)}/${dataRowCount}` : `${dataRowCount}`}</strong>
                <button onClick={() => setFilterText('')} disabled={!filterText.trim()}>
                  Clear
                </button>
              </div>
              <div className="tool-button-grid">
                <button onClick={() => sortBySelectedColumn('asc')}>Sort A to Z</button>
                <button onClick={() => sortBySelectedColumn('desc')}>Sort Z to A</button>
                <button onClick={insertRowBelow}>Insert row</button>
                <button onClick={deleteSelectedRow}>Delete row</button>
                <button onClick={insertColumnRight}>Insert column</button>
                <button onClick={deleteSelectedColumn}>Delete column</button>
                <button onClick={clearSelectedRow}>Clear row</button>
                <button onClick={clearSelectedColumn}>Clear column</button>
                <button onClick={fillSelectedColumnBlanks}>Fill blanks down</button>
                <button onClick={removeDuplicateRowsByColumn}>Remove duplicates</button>
                <button className="wide-tool" onClick={removeBlankRows}>
                  Move blank rows down
                </button>
              </div>
            </section>

            <section className="summary-section">
              <div className="panel-heading">
                <Grid3X3 size={16} />
                Summary builder
              </div>
              <div className="summary-controls">
                <label>
                  <span>Group</span>
                  <select
                    value={summaryConfig.labelCol}
                    onChange={(event) =>
                      setSummaryConfig((current) => ({ ...current, labelCol: Number(event.target.value) }))
                    }
                  >
                    {columnOptions()}
                  </select>
                </label>
                <label>
                  <span>Value</span>
                  <select
                    value={summaryConfig.valueCol}
                    onChange={(event) =>
                      setSummaryConfig((current) => ({ ...current, valueCol: Number(event.target.value) }))
                    }
                  >
                    {columnOptions()}
                  </select>
                </label>
              </div>
              <div className="summary-preview">
                {pivotSummary.rows.slice(0, 4).map((row) => (
                  <div key={row.label}>
                    <span>{row.label}</span>
                    <strong>{metricLabel(row.sum)}</strong>
                  </div>
                ))}
                {!pivotSummary.rows.length && <p>No grouped numeric rows yet.</p>}
              </div>
              <div className="tool-button-grid">
                <button onClick={() => writePivotSummaryToSheet(false)}>Write summary</button>
                <button onClick={() => writePivotSummaryToSheet(true)}>Write + chart</button>
                <button className="wide-tool" onClick={downloadPivotSummaryCsv}>
                  Export summary CSV
                </button>
              </div>
            </section>

            <section className="named-ranges-section">
              <div className="panel-heading">
                <Layers3 size={16} />
                Named ranges
              </div>
              <div className="named-range-save">
                <input
                  value={namedRangeName}
                  onChange={(event) => setNamedRangeName(event.target.value)}
                  placeholder={selectedColumnRange ? `${columnName(selected.col)} range name` : 'Select data first'}
                />
                <button onClick={saveNamedRange}>Save range</button>
              </div>
              <div className="range-hint">
                {selectedColumnRange ? (
                  <span>{selectedColumnRange.ref} from column {columnName(selected.col)}</span>
                ) : (
                  <span>No data range in selected column</span>
                )}
              </div>
              <div className="named-range-list">
                {namedRanges.map((range) => (
                  <div className="named-range-item" key={range.id}>
                    <button onClick={() => insertNamedRangeSum(range)}>
                      <strong>{range.name}</strong>
                      <span>{range.ref}</span>
                    </button>
                    <button className="mini-danger" onClick={() => deleteNamedRange(range)} title="Delete named range">
                      Delete
                    </button>
                  </div>
                ))}
                {!namedRanges.length && <p>No named ranges yet.</p>}
              </div>
            </section>

            <section className="quick-formula-section">
              <div className="panel-heading">
                <Zap size={16} />
                Quick formulas
              </div>
              <div className="tool-button-grid">
                <button onClick={() => insertQuickFormula('SUM')}>Insert SUM</button>
                <button onClick={() => insertQuickFormula('AVG')}>Insert AVG</button>
                <button onClick={() => insertQuickFormula('MIN')}>Insert MIN</button>
                <button onClick={() => insertQuickFormula('MAX')}>Insert MAX</button>
                <button className="wide-tool" onClick={() => insertQuickFormula('COUNT')}>
                  Insert COUNT
                </button>
              </div>
              <div className="formula-template-grid">
                <button onClick={() => insertFormulaTemplate('SUMIF')}>SUMIF</button>
                <button onClick={() => insertFormulaTemplate('COUNTIF')}>COUNTIF</button>
                <button onClick={() => insertFormulaTemplate('AVERAGEIF')}>AVERAGEIF</button>
                <button onClick={() => insertFormulaTemplate('IF')}>IF</button>
                <button onClick={() => insertFormulaTemplate('ROUND')}>ROUND</button>
              </div>
            </section>

            <section className="quality-section">
              <div className="panel-heading">
                <Check size={16} />
                Data quality
              </div>
              <div className="quality-score">
                <strong>{selectedQuality.score}</strong>
                <span>Column {columnName(selected.col)} score</span>
              </div>
              <div className="quality-grid">
                <span>Blanks <strong>{selectedQuality.blanks}</strong></span>
                <span>Duplicates <strong>{selectedQuality.duplicates}</strong></span>
                <span>Outliers <strong>{selectedQuality.outliers}</strong></span>
                <span>Spaces <strong>{selectedQuality.trimmedIssues}</strong></span>
              </div>
              <div className="tool-button-grid">
                <button onClick={trimSelectedColumn}>Trim spaces</button>
                <button onClick={convertSelectedColumnToNumbers}>Convert numbers</button>
              </div>
            </section>

            <section className="visual-rules-section">
              <div className="panel-heading">
                <Activity size={16} />
                Visual rules
              </div>
              <div className="rule-button-grid">
                <button className={cx(conditionalRule === 'above-average' && 'active')} onClick={() => setConditionalRule('above-average')}>
                  Above avg
                </button>
                <button className={cx(conditionalRule === 'top-value' && 'active')} onClick={() => setConditionalRule('top-value')}>
                  Top value
                </button>
                <button className={cx(conditionalRule === 'negative' && 'active')} onClick={() => setConditionalRule('negative')}>
                  Negative
                </button>
                <button className={cx(conditionalRule === 'duplicates' && 'active')} onClick={() => setConditionalRule('duplicates')}>
                  Duplicates
                </button>
                <button className={cx(conditionalRule === 'blanks' && 'active')} onClick={() => setConditionalRule('blanks')}>
                  Blanks
                </button>
                <button onClick={() => setConditionalRule('none')} disabled={conditionalRule === 'none'}>
                  Clear rule
                </button>
              </div>
              <div className="rule-readout">
                <span>Column {columnName(selected.col)}</span>
                <strong>{conditionalSet.size} highlighted</strong>
              </div>
            </section>

            <section className="validation-section">
              <div className="panel-heading">
                <ShieldCheck size={16} />
                Validation
              </div>
              <div className="rule-button-grid">
                <button className={cx(validationRule === 'required' && 'active')} onClick={() => setValidationRule('required')}>
                  Required
                </button>
                <button className={cx(validationRule === 'number' && 'active')} onClick={() => setValidationRule('number')}>
                  Numbers
                </button>
                <button className={cx(validationRule === 'unique' && 'active')} onClick={() => setValidationRule('unique')}>
                  Unique
                </button>
                <button className={cx(validationRule === 'formula-clean' && 'active')} onClick={() => setValidationRule('formula-clean')}>
                  Formula errors
                </button>
                <button className="wide-tool" onClick={() => setValidationRule('none')} disabled={validationRule === 'none'}>
                  Clear validation
                </button>
              </div>
              <div className={cx('validation-readout', validationSet.size && 'has-issues')}>
                <span>{validationResult.label} in column {columnName(selected.col)}</span>
                <strong>{validationSet.size} issue{validationSet.size === 1 ? '' : 's'}</strong>
              </div>
            </section>

            <section className="assistant-section">
              <div className="panel-heading">
                <Sparkles size={16} />
                Sheet assistant
              </div>
              <div className="assistant-list">
                {assistantNotes.map((note) => (
                  <p key={note}>{note}</p>
                ))}
              </div>
            </section>

            <section className="workbook-health-section">
              <div className="panel-heading">
                <ShieldCheck size={16} />
                Workbook health
              </div>
              <div className="health-list">
                {workbookHealth.map((item) => (
                  <div className={cx('health-item', item.status)} key={item.label}>
                    <span>{item.label}</span>
                    <strong>{item.value}</strong>
                  </div>
                ))}
              </div>
              <button className="secondary-action" onClick={goToFirstIssue}>
                Go to first issue
              </button>
            </section>

            <section className="ai-runtime-section">
              <div className="panel-heading">
                <Sparkles size={16} />
                AI runtime
              </div>
              <div className="runtime-grid">
                <span>Provider <strong>{aiRuntimeDetails.provider}</strong></span>
                <span>Runtime <strong>{aiRuntimeDetails.runtime}</strong></span>
                <span>Model <strong>{aiRuntimeDetails.model}</strong></span>
                <span>Auth <strong>{aiRuntimeDetails.auth}</strong></span>
              </div>
              {aiRuntimeDetails.lastError && <p className="runtime-error">{aiRuntimeDetails.lastError}</p>}
            </section>

            <section className="versions-section">
              <div className="panel-heading">
                <Save size={16} />
                Local versions
              </div>
              <button className="secondary-action" onClick={saveLocalVersion}>
                Save snapshot
              </button>
              <div className="version-list">
                {versions.map((version) => (
                  <button key={version.id} onClick={() => restoreLocalVersion(version)}>
                    <strong>{version.name}</strong>
                    <span>{new Date(version.savedAt).toLocaleString()}</span>
                  </button>
                ))}
                {!versions.length && <p>No local snapshots yet.</p>}
              </div>
            </section>

            <section className="insight-section">
              <div className="panel-heading">
                <ClipboardList size={16} />
                Vector AI insight
              </div>
              <p>{active.summary}</p>
              <div className="tag-row">
                {(active.tags || []).map((tag) => (
                  <span key={tag}>{tag}</span>
                ))}
              </div>
            </section>

            <section className="cell-intel-section">
              <div className="panel-heading">
                <Grid3X3 size={16} />
                Cell intelligence
              </div>
              <div className="cell-intel-head">
                <strong>{cellProfile.ref}</strong>
                <span>{cellProfile.type}</span>
                <code>{cellProfile.value || 'blank'}</code>
              </div>
              <div className="intel-grid">
                <span>Column</span>
                <strong>{cellProfile.header}</strong>
                <span>Raw</span>
                <code>{cellProfile.raw || 'empty'}</code>
              </div>
              <div className="trace-block">
                <span>References</span>
                <div>
                  {cellProfile.references.length ? (
                    cellProfile.references.map((ref) => <code key={ref}>{ref}</code>)
                  ) : (
                    <small>No upstream references</small>
                  )}
                </div>
              </div>
              <div className="trace-block">
                <span>Dependents</span>
                <div>
                  {cellProfile.dependents.length ? (
                    cellProfile.dependents.map((item) => <code key={`${item.ref}-${item.raw}`}>{item.ref}</code>)
                  ) : (
                    <small>No formulas depend on this cell</small>
                  )}
                </div>
              </div>
              <div className="cell-note-editor">
                <label htmlFor="cell-note">Cell note</label>
                <textarea
                  id="cell-note"
                  value={noteDraft}
                  onChange={(event) => setNoteDraft(event.target.value)}
                  placeholder={`Add a note for ${selectedRef}`}
                />
                <div>
                  <button onClick={saveCellNote}>Save note</button>
                  <button onClick={clearCellNote}>Clear note</button>
                </div>
              </div>
            </section>

            <section className="column-profile-section">
              <div className="panel-heading">
                <Gauge size={16} />
                Column profile
              </div>
              <div className="profile-title">
                <strong>{selectedColumn.header}</strong>
                <span>{selectedColumn.filled} filled</span>
              </div>
              <div className="profile-metrics">
                <span>
                  Sum <strong>{metricLabel(selectedColumn.sum)}</strong>
                </span>
                <span>
                  Avg <strong>{metricLabel(selectedColumn.avg)}</strong>
                </span>
                <span>
                  Min <strong>{metricLabel(selectedColumn.min)}</strong>
                </span>
                <span>
                  Max <strong>{metricLabel(selectedColumn.max)}</strong>
                </span>
              </div>
            </section>

            <section className="chart-section">
              <div className="panel-heading">
                <BarChart3 size={16} />
                {active.chart?.title || 'Workbook chart'}
              </div>
              <div className="chart-controls">
                <label>
                  <span>Type</span>
                  <select
                    value={active.chart?.type || 'none'}
                    onChange={(event) => updateChartSetting({ type: event.target.value }, 'Updated chart type.')}
                  >
                    <option value="bar">Bar</option>
                    <option value="line">Line</option>
                    <option value="none">None</option>
                  </select>
                </label>
                <label>
                  <span>Label</span>
                  <select
                    value={active.chart?.labelColumn ?? 0}
                    onChange={(event) =>
                      updateChartSetting({ labelColumn: Number(event.target.value) }, 'Updated chart label column.')
                    }
                  >
                    {columnOptions()}
                  </select>
                </label>
                <label>
                  <span>Value</span>
                  <select
                    value={active.chart?.valueColumn ?? 1}
                    onChange={(event) =>
                      updateChartSetting({ valueColumn: Number(event.target.value) }, 'Updated chart value column.')
                    }
                  >
                    {columnOptions()}
                  </select>
                </label>
                <label className="chart-title-control">
                  <span>Title</span>
                  <input
                    value={chartTitleDraft}
                    onChange={(event) => setChartTitleDraft(event.target.value)}
                    onBlur={() => {
                      if ((active.chart?.title || '') !== chartTitleDraft) {
                        updateChartSetting({ title: chartTitleDraft }, 'Updated chart title.');
                      }
                    }}
                    placeholder="Chart title"
                  />
                </label>
              </div>
              <WorkbookChart workbook={active} grid={grid} />
              {forecast.length > 0 && (
                <div className="forecast-list">
                  {forecast.map((point) => (
                    <span key={point.label}>
                      {point.label}
                      <strong>{metricLabel(point.value)}</strong>
                    </span>
                  ))}
                </div>
              )}
            </section>

            <section className="scenario-section">
              <div className="panel-heading">
                <Sparkles size={16} />
                Scenario console
              </div>
              <label>
                <span>Growth pressure</span>
                <input
                  type="range"
                  min="0"
                  max="30"
                  value={scenario.growth}
                  onChange={(event) => setScenario((current) => ({ ...current, growth: Number(event.target.value) }))}
                />
                <strong>{scenario.growth}%</strong>
              </label>
              <label>
                <span>Margin target</span>
                <input
                  type="range"
                  min="40"
                  max="95"
                  value={scenario.margin}
                  onChange={(event) => setScenario((current) => ({ ...current, margin: Number(event.target.value) }))}
                />
                <strong>{scenario.margin}%</strong>
              </label>
              <label>
                <span>Confidence</span>
                <input
                  type="range"
                  min="10"
                  max="99"
                  value={scenario.confidence}
                  onChange={(event) =>
                    setScenario((current) => ({ ...current, confidence: Number(event.target.value) }))
                  }
                />
                <strong>{scenario.confidence}%</strong>
              </label>
              <div className="scenario-readout">
                <Check size={15} />
                {weightedOutcome.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}{' '}
                weighted outcome
              </div>
              <button className="secondary-action" onClick={writeScenarioToCell}>
                Write to {cellId(selected.row, selected.col)}
              </button>
              <div className="scenario-library">
                <div className="scenario-save-row">
                  <input
                    value={scenarioName}
                    onChange={(event) => setScenarioName(event.target.value)}
                    placeholder="Scenario name"
                  />
                  <button onClick={saveScenarioPreset}>Save</button>
                </div>
                <div className="scenario-list">
                  {savedScenarios.map((item) => (
                    <div className="scenario-item" key={item.id}>
                      <button onClick={() => applyScenarioPreset(item)}>
                        <strong>{item.name}</strong>
                        <span>
                          {item.values.growth}% growth / {item.values.margin}% margin / {item.values.confidence}%
                        </span>
                      </button>
                      <button className="mini-danger" onClick={() => deleteScenarioPreset(item)} title="Delete scenario">
                        Delete
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </section>

            <section className="audit-section">
              <div className="panel-heading">
                <Gauge size={16} />
                Model audit
              </div>
              <div className="audit-status">
                <span>{audit.health}</span>
                <strong>{audit.errors.length} errors</strong>
              </div>
              <div className="audit-list">
                {audit.formulas.slice(0, 5).map((formula) => (
                  <div className="audit-row" key={`${formula.ref}-${formula.raw}`}>
                    <span>{formula.ref}</span>
                    <code>{formula.raw}</code>
                    <strong>{formula.value}</strong>
                  </div>
                ))}
                {!audit.formulas.length && <p>No formulas yet. Add one with the formula bar.</p>}
              </div>
              <div className="assumption-strip">
                {audit.assumptions.slice(0, 4).map((item) => (
                  <span key={`${item.ref}-${item.header}`}>
                    {item.header}: <strong>{item.value}</strong>
                  </span>
                ))}
              </div>
            </section>
          </aside>
        </section>

        <section className="mission-row">
          {missions.map(([title, body]) => (
            <div className="mission-card" key={title}>
              <span>{title}</span>
              <p>{body}</p>
            </div>
          ))}
        </section>
      </section>
    </main>
  );
}
