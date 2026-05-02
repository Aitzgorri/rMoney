const { findSpec, readSpec, parseSpec } = require('./_find-spec');

const query = process.argv[2];
if (!query) {
  console.error('Usage: npm run spec:review -- "name"');
  process.exit(1);
}

const file = findSpec(query);
if (!file) {
  console.error(`No spec found matching: "${query}"`);
  process.exit(1);
}

const content = readSpec(file);
const { id, name, status, created, allCriteria, doneCriteria, pendingCriteria } = parseSpec(content);

// Extract open questions section
const oqMatch = content.match(/## Open Questions\n([\s\S]*?)(?=\n##|$)/);
const oqText = oqMatch ? oqMatch[1].trim() : '';
const hasOpenQuestions = oqText && oqText !== 'None.' && oqText.length > 0;

const statusIcon = { draft: '[ ]', ready: '[~]', 'in-progress': '[>]', done: '[x]' };

console.log('\n' + '='.repeat(62));
console.log(`  ${statusIcon[status] ?? '[?]'}  ${id} — ${name}`);
console.log('='.repeat(62));
console.log(`  Status:   ${status}`);
console.log(`  Created:  ${created}`);
console.log(`  Progress: ${doneCriteria.length}/${allCriteria.length} acceptance criteria done`);

if (pendingCriteria.length > 0) {
  console.log('\n  Remaining:');
  pendingCriteria.forEach(c => console.log(`    ${c}`));
}

if (hasOpenQuestions) {
  console.log('\n  Open Questions:');
  oqText.split('\n').filter(Boolean).forEach(l => console.log(`    ${l}`));
}

console.log('\n  File: specs/features/' + file);
console.log('='.repeat(62) + '\n');
