const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');

const files = {
  css: 'src/renderer/index.css',
  dashboard: 'src/renderer/pages/Dashboard.tsx',
  sessions: 'src/renderer/pages/Sessions.tsx',
  payments: 'src/renderer/pages/Payments.tsx',
  tournaments: 'src/renderer/pages/Tournaments.tsx',
  tournamentDetail: 'src/renderer/pages/TournamentDetail.tsx',
  report: 'src/renderer/pages/Report.tsx',
};

const expectedCssClasses = [
  '.ar-page',
  '.ar-page-header',
  '.ar-page-title',
  '.ar-page-copy',
  '.ar-card',
  '.ar-stat-card',
  '.ar-section-label',
  '.ar-segment',
  '.ar-toolbar',
  '.ar-hero-card',
  '.ar-table-shell',
];

const pageContracts = {
  dashboard: ['ar-page', 'ar-page-header', 'ar-hero-card', 'ar-stat-card', 'ar-table-shell'],
  sessions: ['ar-page', 'ar-page-header', 'ar-hero-card', 'ar-stat-card', 'ar-table-shell'],
  payments: ['ar-page', 'ar-page-header', 'ar-card', 'ar-segment', 'ar-toolbar'],
  tournaments: ['ar-page', 'ar-page-header', 'ar-card', 'ar-stat-card', 'ar-table-shell'],
  tournamentDetail: ['ar-page', 'ar-page-header', 'ar-card', 'ar-stat-card', 'ar-segment'],
  report: ['ar-page', 'ar-page-header', 'ar-card', 'ar-segment', 'ar-table-shell'],
};

const failures = [];

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

const css = read(files.css);
for (const selector of expectedCssClasses) {
  if (!css.includes(selector)) {
    failures.push(`${files.css} missing ${selector}`);
  }
}

const arPageRule = css.match(/\.ar-page\s*\{[^}]*\}/s)?.[0] ?? '';
const expectedArPageDeclarations = [
  ['height', '100%'],
  ['min-height', '0'],
  ['overflow-y', 'auto'],
];

for (const [property, value] of expectedArPageDeclarations) {
  const declarationPattern = new RegExp(`(^|[;{])\\s*${property}\\s*:\\s*${value}\\s*(;|})`);
  if (!declarationPattern.test(arPageRule)) {
    failures.push(`${files.css} .ar-page missing ${property}: ${value}`);
  }
}

for (const [key, classes] of Object.entries(pageContracts)) {
  const rel = files[key];
  const source = read(rel);
  for (const className of classes) {
    if (!source.includes(className)) {
      failures.push(`${rel} missing ${className}`);
    }
  }
}

if (failures.length) {
  console.error('Page UI contract check failed:');
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log('Page UI contract checks passed');
