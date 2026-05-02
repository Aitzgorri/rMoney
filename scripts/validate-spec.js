const { findSpec, readSpec, parseSpec } = require('./_find-spec');

const query = process.argv[2];
if (!query) {
  console.error('Usage: npm run spec:validate -- "name"');
  process.exit(1);
}

const file = findSpec(query);
if (!file) {
  console.error(`No spec found matching: "${query}"`);
  process.exit(1);
}

const content = readSpec(file);
const { id, name, allCriteria } = parseSpec(content);

const errors = [];
const warnings = [];

// Check for unfilled template placeholders
if (content.includes('{{')) {
  errors.push('Contains unfilled template placeholders ({{ }})');
}

// Check Goal is filled
if (content.includes("What this feature achieves for the user. Why does it matter?")) {
  errors.push('Goal section is still the template default — fill it in');
}

// Check User Stories are filled
if (content.includes('As a user, I can ... so that ...')) {
  errors.push('User Stories section is still the template default — fill it in');
}

// Check Acceptance Criteria exist
if (allCriteria.length === 0) {
  errors.push('No acceptance criteria defined');
} else if (allCriteria.length < 2) {
  warnings.push('Only 1 acceptance criterion — consider adding more');
}

// Check UI section is filled
if (content.includes('Describe what the user sees. Text sketches are fine.')) {
  warnings.push('UI / Screens section is still the template default');
}

// Check Data section is filled
if (content.includes('What data does this feature create, read, update, or delete?')) {
  warnings.push('Data section is still the template default');
}

// Check open questions
const oqMatch = content.match(/## Open Questions\n([\s\S]*?)(?=\n##|$)/);
const oqText = oqMatch ? oqMatch[1].trim() : '';
if (oqText && oqText !== 'None.' && !oqText.startsWith('-')) {
  // has content but might be template default
}
if (oqText === 'Things to decide before implementation starts.') {
  warnings.push('Open Questions section is still the template default — write "None." if empty');
}

// Report
console.log(`\n  Validating: ${id} — ${name}`);
console.log('  ' + '-'.repeat(50));

if (errors.length === 0 && warnings.length === 0) {
  console.log('  ✓ Spec looks good — ready to mark as ready\n');
  process.exit(0);
}

if (errors.length > 0) {
  console.log('\n  ERRORS (must fix before marking ready):');
  errors.forEach(e => console.log(`    ✗ ${e}`));
}

if (warnings.length > 0) {
  console.log('\n  WARNINGS (recommended to fix):');
  warnings.forEach(w => console.log(`    ! ${w}`));
}

console.log('');
if (errors.length > 0) process.exit(1);
