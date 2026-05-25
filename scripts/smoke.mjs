import { chromium } from 'playwright';

const appUrl = process.env.APP_URL || 'http://127.0.0.1:8080';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });

try {
  await page.goto(appUrl, { waitUntil: 'networkidle' });
  await page.locator('.sheet-grid').waitFor({ state: 'visible', timeout: 15000 });
  await page.locator('.generate-button svg').waitFor({ state: 'detached', timeout: 5000 });
  await page.locator('.ops-section').waitFor({ state: 'visible', timeout: 15000 });

  const initialTitle = await page.locator('.workbook-title').inputValue();
  if (!initialTitle) throw new Error('Workbook title did not load.');

  await page.locator('.file-input').setInputFiles({
    name: 'vectorsheets-import.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(
      [
        'Metric,Jan,Feb,Scenario',
        'Smoke Revenue 7741,100,200,',
        'Cost,40,80,',
        'Margin,=B2-B3,=C2-C3,"=ROUND(ABS(B2-B3)/B2,2)"',
        'Decision,=IF(B2>B3,1,0),=MEDIAN(B2:C2),',
        'Qualified,"=COUNTIF(B2:C2,"">=100"")","=SUMIF(B2:C2,"">=100"",B2:C2)",'
      ].join('\n')
    )
  });
  await page.locator('td', { hasText: 'Smoke Revenue 7741' }).first().waitFor({ state: 'visible', timeout: 15000 });
  await page.locator('td', { hasText: '0.6' }).first().waitFor({ state: 'visible', timeout: 15000 });
  await page.locator('td', { hasText: '300' }).first().waitFor({ state: 'visible', timeout: 15000 });

  await page.getByTitle('Undo').click();
  await page.locator('td', { hasText: 'Smoke Revenue 7741' }).first().waitFor({ state: 'detached', timeout: 15000 });
  await page.getByTitle('Redo').click();
  await page.locator('td', { hasText: 'Smoke Revenue 7741' }).first().waitFor({ state: 'visible', timeout: 15000 });

  await page.locator('.sheet-find input').fill('Smoke Revenue 7741');
  await page.locator('.sheet-find', { hasText: '1/1' }).waitFor({ state: 'visible', timeout: 15000 });
  await page.locator('td.search-match', { hasText: 'Smoke Revenue 7741' }).waitFor({ state: 'visible', timeout: 15000 });
  await page.locator('.sheet-find input').fill('');

  await page.locator('.filter-control input').fill('Smoke Revenue');
  await page.locator('.status-bar', { hasText: '1 filtered' }).waitFor({ state: 'visible', timeout: 15000 });
  await page.locator('.filter-control button', { hasText: 'Clear' }).click();
  await page.waitForFunction(() => document.querySelector('.filter-control input')?.value === '', null, {
    timeout: 15000
  });

  await page.getByRole('button', { name: 'Numbers', exact: true }).click();
  await page.locator('td.validation-issue', { hasText: 'Smoke Revenue 7741' }).waitFor({
    state: 'visible',
    timeout: 15000
  });
  await page.getByRole('button', { name: 'Clear validation' }).click();

  await page.locator('.sheet-cell').nth(13).click();
  await page.getByRole('button', { name: 'Currency' }).click();
  await page.waitForFunction(() => document.querySelector('.formula-bar input')?.value === '$100', null, {
    timeout: 15000
  });
  await page.getByRole('button', { name: 'Above avg' }).click();
  await page.locator('td.conditional-hit').first().waitFor({ state: 'visible', timeout: 15000 });
  await page.getByRole('button', { name: 'Clear rule' }).click();

  await page.getByRole('button', { name: 'Write + chart' }).click();
  await page.locator('.status-bar', { hasText: 'Summary written' }).waitFor({ state: 'visible', timeout: 15000 });
  await page.locator('td', { hasText: 'Summary by Metric' }).first().waitFor({ state: 'visible', timeout: 15000 });
  await page.locator('.chart-bar').first().waitFor({ state: 'visible', timeout: 15000 });

  const summaryDownload = await Promise.all([
    page.waitForEvent('download', { timeout: 15000 }),
    page.getByRole('button', { name: 'Export summary CSV' }).click()
  ]);
  const summaryName = summaryDownload[0].suggestedFilename();
  if (!summaryName.endsWith('-summary.csv')) throw new Error(`Unexpected summary filename: ${summaryName}`);

  await page.locator('.sheet-cell').nth(134).click();
  await page.locator('.named-range-save input').fill('Feb actuals');
  await page.getByRole('button', { name: 'Save range' }).click();
  await page.locator('.status-bar', { hasText: 'Named range "Feb actuals" saved' }).waitFor({
    state: 'visible',
    timeout: 15000
  });
  await page.locator('.named-range-item', { hasText: 'Feb actuals' }).getByRole('button').first().click();
  await page.waitForFunction(() => document.querySelector('.formula-bar input')?.value?.startsWith('=SUM('), null, {
    timeout: 15000
  });
  await page.locator('.sheet-cell').nth(135).click();
  await page.getByRole('button', { name: 'SUMIF', exact: true }).click();
  await page.locator('.status-bar', { hasText: 'Inserted SUMIF template' }).waitFor({
    state: 'visible',
    timeout: 15000
  });

  await page.locator('.sheet-cell').nth(13).click();
  await page.locator('#cell-note').fill('Smoke note for the revenue assumption');
  await page.getByRole('button', { name: 'Save note' }).click();
  await page.locator('.status-bar', { hasText: 'Note saved for B2.' }).waitFor({ state: 'visible', timeout: 15000 });
  await page.locator('td.has-note').first().waitFor({ state: 'visible', timeout: 15000 });

  await page.getByRole('button', { name: 'Sort Z to A' }).click();
  await page.locator('.status-bar', { hasText: 'Sorted rows by column B.' }).waitFor({
    state: 'visible',
    timeout: 15000
  });

  await page.getByRole('button', { name: 'Insert row' }).click();
  await page.locator('.status-bar', { hasText: 'Inserted a row below row' }).waitFor({
    state: 'visible',
    timeout: 15000
  });
  await page.getByRole('button', { name: 'Delete row' }).click();
  await page.locator('.status-bar', { hasText: 'Deleted row' }).waitFor({ state: 'visible', timeout: 15000 });

  await page.getByRole('button', { name: 'Insert SUM' }).click();
  await page.locator('.status-bar', { hasText: 'Inserted SUM formula' }).waitFor({ state: 'visible', timeout: 15000 });

  await page.getByRole('button', { name: 'Save snapshot' }).click();
  await page.locator('.status-bar', { hasText: 'Version snapshot saved locally.' }).waitFor({
    state: 'visible',
    timeout: 15000
  });
  await page.locator('.version-list button').first().waitFor({ state: 'visible', timeout: 15000 });

  await page.locator('.scenario-save-row input').fill('Smoke upside');
  await page.locator('.scenario-save-row button').click();
  await page.locator('.status-bar', { hasText: 'Scenario "Smoke upside" saved.' }).waitFor({
    state: 'visible',
    timeout: 15000
  });
  await page.locator('.scenario-item', { hasText: 'Smoke upside' }).waitFor({ state: 'visible', timeout: 15000 });

  const reportDownload = await Promise.all([
    page.waitForEvent('download', { timeout: 15000 }),
    page.getByRole('button', { name: 'Export report' }).click()
  ]);
  const reportName = reportDownload[0].suggestedFilename();
  if (!reportName.endsWith('-report.json')) throw new Error(`Unexpected report filename: ${reportName}`);

  const htmlDownload = await Promise.all([
    page.waitForEvent('download', { timeout: 15000 }),
    page.getByRole('button', { name: 'Export HTML' }).click()
  ]);
  const htmlName = htmlDownload[0].suggestedFilename();
  if (!htmlName.endsWith('-report.html')) throw new Error(`Unexpected HTML report filename: ${htmlName}`);

  await page.locator('.sheet-cell').nth(13).click();
  await page.locator('.formula-bar input').fill('  1234  ');
  await page.locator('.formula-bar input').press('Enter');
  await page.getByRole('button', { name: 'Trim spaces' }).click();
  await page.locator('.status-bar', { hasText: 'Trimmed' }).waitFor({ state: 'visible', timeout: 15000 });
  await page.locator('.formula-bar input').fill('$1,234');
  await page.locator('.formula-bar input').press('Enter');
  await page.getByRole('button', { name: 'Convert numbers' }).click();
  await page.locator('.status-bar', { hasText: 'Converted' }).waitFor({ state: 'visible', timeout: 15000 });

  await page.locator('.sheet-cell').nth(55).click();
  await page.locator('.grid-wrap').evaluate((node) => {
    const data = new DataTransfer();
    data.setData('text/plain', 'Paste A\tPaste B\n12\t24');
    node.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));
  });
  await page.locator('td', { hasText: 'Paste A' }).first().waitFor({ state: 'visible', timeout: 15000 });

  await page.locator('.sheet-cell').nth(238).click();
  await page.locator('.grid-wrap').evaluate((node) => {
    const data = new DataTransfer();
    data.setData('text/plain', 'Segment\tAmount\nRepeat\t10\n\t20\nRepeat\t30');
    node.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));
  });
  await page.getByRole('button', { name: 'Fill blanks down' }).click();
  await page.locator('.status-bar', { hasText: 'Filled' }).waitFor({ state: 'visible', timeout: 15000 });
  await page.getByRole('button', { name: 'Remove duplicates' }).click();
  await page.locator('.status-bar', { hasText: 'duplicate row' }).waitFor({ state: 'visible', timeout: 15000 });

  await page.locator('.chart-controls select').first().selectOption('bar');
  await page.locator('.chart-controls select').nth(1).selectOption('0');
  await page.locator('.chart-controls select').nth(2).selectOption('1');
  await page.locator('.chart-controls input').fill('Smoke chart');
  await page.locator('.chart-controls input').blur();
  await page.locator('.chart-bar').first().waitFor({ state: 'visible', timeout: 15000 });

  await page.getByRole('button', { name: /Write to/i }).click();
  const scenarioStatus = await page.locator('.status-bar').innerText();
  if (!scenarioStatus.includes('Scenario output written')) throw new Error('Scenario writeback did not report success.');

  await Promise.all([
    page.waitForResponse((response) => response.url().includes('/api/workbooks') && response.ok(), { timeout: 15000 }),
    page.getByRole('button', { name: 'Duplicate', exact: true }).click()
  ]);
  await page.waitForFunction(() => document.querySelector('.workbook-title')?.value?.startsWith('Copy of'), null, {
    timeout: 15000
  });

  page.once('dialog', (dialog) => dialog.accept());
  await Promise.all([
    page.waitForResponse((response) => response.url().includes('/api/workbooks/') && response.status() === 204, {
      timeout: 15000
    }),
    page.getByTitle('Delete workbook').click()
  ]);
  await page.locator('.status-bar', { hasText: 'Workbook deleted.' }).waitFor({ state: 'visible', timeout: 15000 });

  await page.locator('.prompt-line textarea').fill('Q3 sales analysis across products and regions with pipeline and win-rate scoring');
  await Promise.all([
    page.waitForResponse((response) => response.url().includes('/api/generate') && response.ok(), { timeout: 15000 }),
    page.locator('.generate-button').click()
  ]);
  await page.waitForFunction(
    () => {
      const filledCells = [...document.querySelectorAll('.sheet-cell')].filter((cell) => cell.textContent.trim());
      return filledCells.length >= 8;
    },
    null,
    { timeout: 15000 }
  );

  await page.locator('.formula-bar input').fill('Q3 sales intelligence verified');
  await page.locator('.formula-bar input').press('Enter');
  await page.locator('td', { hasText: 'Q3 sales intelligence verified' }).first().waitFor({
    state: 'visible',
    timeout: 15000
  });

  await Promise.all([
    page.waitForResponse((response) => response.url().includes('/api/workbooks/') && response.ok(), { timeout: 15000 }),
    page.locator('.command-button.primary').click()
  ]);

  const auditStatus = await page.locator('.audit-status').innerText();
  if (!auditStatus.includes('errors')) throw new Error('Model audit did not render.');

  const writeForecast = page.getByRole('button', { name: /Write forecast/i });
  await writeForecast.click();
  await page.locator('td', { hasText: 'Forecast 1' }).first().waitFor({ state: 'visible', timeout: 15000 });

  const modelOps = await page.locator('.ops-section').innerText();
  if (!modelOps.includes('Fill formula down')) throw new Error('Model ops controls did not render.');

  console.log(
    `Vectorsheets smoke passed: ${initialTitle} -> imported, SUMIF/COUNTIF evaluated, searched, filtered, validated, conditionally formatted, summarized, named ranges, formula templates, noted, formatted, sorted, edited rows, quick formulas, quality cleanup, versions, scenarios, report exports, charted, duplicated, generated, saved, forecasted.`
  );
} finally {
  await browser.close();
}
