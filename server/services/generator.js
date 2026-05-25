const ROWS = 36;
const COLS = 12;

const nowIso = () => new Date().toISOString();
const money = (value) => Math.round(value);

export function emptyGrid(rows = ROWS, cols = COLS) {
  return Array.from({ length: rows }, () => Array(cols).fill(''));
}

export function countFormulaCells(grid) {
  return grid.flat().filter((cell) => String(cell || '').startsWith('=')).length;
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

export function buildWorkbook({ name, prompt, headers, rows, formulas = {}, summary, chart, tags = [] }) {
  const grid = emptyGrid();

  headers.slice(0, COLS).forEach((header, c) => {
    grid[0][c] = String(header);
  });

  rows.slice(0, ROWS - 1).forEach((row, r) => {
    row.slice(0, COLS).forEach((value, c) => {
      grid[r + 1][c] = value == null ? '' : String(value);
    });
  });

  Object.entries(formulas).forEach(([ref, formula]) => {
    const match = /^([A-L])(\d+)$/i.exec(ref);
    if (!match) return;
    const c = match[1].toUpperCase().charCodeAt(0) - 65;
    const r = Number(match[2]) - 1;
    if (r >= 0 && r < ROWS && c >= 0 && c < COLS) {
      grid[r][c] = String(formula);
    }
  });

  return {
    name,
    status: 'Generated model',
    prompt,
    grid,
    summary,
    chart,
    tags,
    activity: {
      aiRuns: 1,
      formulaCells: countFormulaCells(grid),
      lastAction: `Generated ${nowIso().slice(0, 10)}`
    }
  };
}

function saasForecast(prompt) {
  const headers = ['Month', 'Customers', 'Net New', 'Churned', 'ARPA', 'MRR', 'ARR', 'Gross Margin'];
  const rows = [];
  let customers = 100;
  const arpa = 50;

  for (let i = 1; i <= 12; i += 1) {
    const netNew = Math.round(customers * 0.08);
    const churned = Math.round(customers * 0.03);
    customers += netNew - churned;
    const mrr = customers * arpa;
    rows.push([`M${i}`, customers, netNew, churned, arpa, mrr, `=F${i + 1}*12`, '82%']);
  }

  rows.push(['Total', '', '=SUM(C2:C13)', '=SUM(D2:D13)', '', '=SUM(F2:F13)', '=SUM(G2:G13)', '']);

  return buildWorkbook({
    name: 'SaaS revenue forecast',
    prompt,
    headers,
    rows,
    summary:
      'The model compounds customer growth against churn, then projects MRR and ARR by month. The main lever is net customer expansion, so the workbook keeps churn visible beside new customer adds.',
    chart: { type: 'line', labelColumn: 0, valueColumn: 6, title: 'Projected ARR' },
    tags: ['forecast', 'saas', 'revenue']
  });
}

function hiringPlan(prompt) {
  const headers = ['Quarter', 'Function', 'Role', 'Headcount', 'Salary', 'Benefits', 'Total Cost', 'Priority'];
  const roles = [
    ['Q1', 'Engineering', 'Product engineers', 4, 155000, 0.22, 'Critical'],
    ['Q1', 'Design', 'Product designer', 1, 135000, 0.22, 'High'],
    ['Q2', 'Engineering', 'Platform engineers', 3, 165000, 0.22, 'Critical'],
    ['Q2', 'Data', 'Analytics engineer', 1, 145000, 0.22, 'High'],
    ['Q3', 'GTM', 'Solutions engineer', 2, 140000, 0.2, 'Medium'],
    ['Q3', 'Engineering', 'QA automation', 2, 120000, 0.2, 'High'],
    ['Q4', 'Support', 'Customer success', 2, 98000, 0.18, 'Medium']
  ];

  const rows = roles.map((role, index) => {
    const row = index + 2;
    return [role[0], role[1], role[2], role[3], role[4], role[5], `=D${row}*E${row}*(1+F${row})`, role[6]];
  });

  rows.push(['Total', '', '', '=SUM(D2:D8)', '', '', '=SUM(G2:G8)', '']);

  return buildWorkbook({
    name: 'Engineering hiring plan',
    prompt,
    headers,
    rows,
    summary:
      'The plan sequences core engineering capacity before go-to-market support. Fully loaded annual cost is formula driven, making salary and benefit assumptions easy to tune.',
    chart: { type: 'bar', labelColumn: 1, valueColumn: 6, title: 'Cost by hiring lane' },
    tags: ['planning', 'headcount', 'operating model']
  });
}

function salesDashboard(prompt) {
  const headers = ['Product', 'Region', 'Revenue', 'Pipeline', 'Win Rate', 'Gross Margin', 'Score'];
  const rows = [
    ['Vector Core', 'North America', 246000, 410000, 0.34, 0.83, '=C2*E2*F2'],
    ['Vector Core', 'Europe', 178000, 320000, 0.29, 0.79, '=C3*E3*F3'],
    ['Formula AI', 'North America', 322000, 540000, 0.37, 0.86, '=C4*E4*F4'],
    ['Formula AI', 'APAC', 141000, 290000, 0.24, 0.76, '=C5*E5*F5'],
    ['Ops Studio', 'Europe', 205000, 360000, 0.31, 0.81, '=C6*E6*F6'],
    ['Ops Studio', 'LATAM', 88000, 170000, 0.22, 0.74, '=C7*E7*F7'],
    ['Data Rooms', 'North America', 194000, 260000, 0.41, 0.84, '=C8*E8*F8'],
    ['Data Rooms', 'APAC', 117000, 230000, 0.27, 0.78, '=C9*E9*F9'],
    ['Total', '', '=SUM(C2:C9)', '=SUM(D2:D9)', '=AVERAGE(E2:E9)', '=AVERAGE(F2:F9)', '=SUM(G2:G9)']
  ];

  return buildWorkbook({
    name: 'Q3 sales intelligence',
    prompt,
    headers,
    rows,
    summary:
      'Formula AI leads on revenue and opportunity quality, while APAC has pipeline that needs conversion work. The score column blends revenue, win rate, and margin so leadership can prioritize follow-up.',
    chart: { type: 'bar', labelColumn: 0, valueColumn: 2, title: 'Revenue by product line' },
    tags: ['sales', 'dashboard', 'analysis']
  });
}

function budgetModel(prompt) {
  const headers = ['Category', 'Planned', 'Actual', 'Variance', 'Owner', 'Risk'];
  const rows = [
    ['Housing', 3400, 3400, '=B2-C2', 'Finance', 'Locked'],
    ['Food', 1400, 1530, '=B3-C3', 'Household', 'Watch'],
    ['Transport', 820, 780, '=B4-C4', 'Household', 'On track'],
    ['Childcare', 2100, 2100, '=B5-C5', 'Family', 'Locked'],
    ['Utilities', 520, 610, '=B6-C6', 'Household', 'Watch'],
    ['Savings', 2400, 2200, '=B7-C7', 'Finance', 'Improve'],
    ['Discretionary', 1100, 980, '=B8-C8', 'Household', 'On track'],
    ['Total', '=SUM(B2:B8)', '=SUM(C2:C8)', '=SUM(D2:D8)', '', '']
  ];

  return buildWorkbook({
    name: 'Household budget control',
    prompt,
    headers,
    rows,
    summary:
      'The budget is under pressure from food and utilities, but transport and discretionary spending offset part of the variance. Savings remains the clearest lever to protect.',
    chart: { type: 'bar', labelColumn: 0, valueColumn: 2, title: 'Actual spend by category' },
    tags: ['budget', 'planning', 'control']
  });
}

function supportOperations(prompt) {
  const headers = ['Channel', 'Open Tickets', 'SLA Risk', 'Agents', 'Tickets / Agent', 'Target Agents', 'Staffing Gap', 'Priority'];
  const rows = [
    ['Email', 420, 0.18, 8, '=B2/D2', '=ROUND(B2/45,0)', '=F2-D2', 'Watch'],
    ['Chat', 310, 0.24, 7, '=B3/D3', '=ROUND(B3/40,0)', '=F3-D3', 'High'],
    ['Phone', 185, 0.31, 5, '=B4/D4', '=ROUND(B4/32,0)', '=F4-D4', 'High'],
    ['Social', 96, 0.16, 2, '=B5/D5', '=ROUND(B5/35,0)', '=F5-D5', 'Watch'],
    ['Enterprise', 74, 0.38, 3, '=B6/D6', '=ROUND(B6/25,0)', '=F6-D6', 'Critical'],
    ['Self-serve', 52, 0.07, 1, '=B7/D7', '=ROUND(B7/50,0)', '=F7-D7', 'Low'],
    ['Total', '=SUM(B2:B7)', '=AVERAGE(C2:C7)', '=SUM(D2:D7)', '=AVERAGE(E2:E7)', '=SUM(F2:F7)', '=SUM(G2:G7)', '']
  ];

  return buildWorkbook({
    name: 'Support operations command center',
    prompt,
    headers,
    rows,
    summary:
      'Phone, chat, and enterprise queues carry the highest SLA risk. The staffing gap column converts ticket volume into target agents so operators can see where to rebalance coverage first.',
    chart: { type: 'bar', labelColumn: 0, valueColumn: 2, title: 'SLA risk by support channel' },
    tags: ['support', 'operations', 'staffing']
  });
}

function operatingModel(prompt) {
  const headers = ['Initiative', 'Owner', 'Impact', 'Effort', 'Confidence', 'Weighted Score', 'Decision'];
  const rows = [
    ['Self-serve import', 'Product', 8, 4, 0.78, '=C2/E2*D2', 'Build now'],
    ['AI formula audit', 'AI', 9, 5, 0.72, '=C3/E3*D3', 'Build now'],
    ['SOC2 export controls', 'Platform', 7, 6, 0.68, '=C4/E4*D4', 'Plan'],
    ['Data connector library', 'Integrations', 8, 7, 0.63, '=C5/E5*D5', 'Plan'],
    ['Template marketplace', 'Growth', 6, 5, 0.58, '=C6/E6*D6', 'Later'],
    ['Scenario simulator', 'Product', 9, 6, 0.74, '=C7/E7*D7', 'Build now'],
    ['Average', '', '=AVERAGE(C2:C7)', '=AVERAGE(D2:D7)', '=AVERAGE(E2:E7)', '=AVERAGE(F2:F7)', '']
  ];

  return buildWorkbook({
    name: 'Operating priority model',
    prompt,
    headers,
    rows,
    summary:
      'The workbook ranks initiatives by impact, effort, and confidence. Self-serve import, AI formula audit, and scenario simulation form the strongest near-term product package.',
    chart: { type: 'bar', labelColumn: 0, valueColumn: 5, title: 'Weighted priority score' },
    tags: ['strategy', 'roadmap', 'prioritization']
  });
}

export function generateWorkbookFromPrompt(prompt = '') {
  const normalized = prompt.toLowerCase();

  if (
    normalized.includes('support') ||
    normalized.includes('ticket') ||
    normalized.includes('sla') ||
    normalized.includes('staffing')
  ) {
    return supportOperations(prompt);
  }

  if (normalized.includes('saas') || normalized.includes('revenue') || normalized.includes('forecast')) {
    return saasForecast(prompt);
  }

  if (normalized.includes('hiring') || normalized.includes('headcount') || normalized.includes('engineering')) {
    return hiringPlan(prompt);
  }

  if (normalized.includes('sales') || normalized.includes('q3') || normalized.includes('region')) {
    return salesDashboard(prompt);
  }

  if (normalized.includes('budget') || normalized.includes('household') || normalized.includes('spend')) {
    return budgetModel(prompt);
  }

  return operatingModel(prompt);
}

export function starterWorkbooks() {
  return [
    generateWorkbookFromPrompt(
      'Build a 12-month SaaS revenue forecast: 100 starting customers, $50 per seat, 8% monthly growth, 3% churn'
    ),
    generateWorkbookFromPrompt('Create a hiring plan for a 15-person engineering team across 4 quarters')
  ];
}
