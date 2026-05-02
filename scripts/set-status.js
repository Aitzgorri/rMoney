const { findSpec, readSpec, writeSpec, parseSpec } = require('./_find-spec');

const newStatus = process.argv[2]; // embedded by npm script (ready / in-progress / done)
const query = process.argv[3];     // provided by user after --

const validStatuses = ['ready', 'in-progress', 'done'];

if (!newStatus || !validStatuses.includes(newStatus)) {
  console.error(`Invalid status: "${newStatus}". Must be one of: ${validStatuses.join(', ')}`);
  process.exit(1);
}

if (!query) {
  console.error(`Usage: npm run spec:${newStatus === 'in-progress' ? 'implement' : newStatus} -- "name"`);
  process.exit(1);
}

const file = findSpec(query);
if (!file) {
  console.error(`No spec found matching: "${query}"`);
  process.exit(1);
}

const content = readSpec(file);
const { id, name, status, allCriteria, pendingCriteria } = parseSpec(content);

// Guard: warn if trying to mark done with unchecked criteria
if (newStatus === 'done' && pendingCriteria.length > 0) {
  console.log(`\n  Warning: ${pendingCriteria.length} acceptance criteria are still unchecked:`);
  pendingCriteria.forEach(c => console.log(`    ${c}`));
  console.log('\n  Mark them as done in the spec file first (change [ ] to [x]).');
  console.log('  If you want to force it anyway, edit the status manually.\n');
  process.exit(1);
}

// Guard: warn if trying to mark ready when currently draft and not validated
if (newStatus === 'ready' && status === 'draft') {
  // Just a reminder, not a blocker
  console.log(`  Tip: run "npm run spec:validate -- ${query}" first to check the spec is complete.`);
}

// Update the status line in the frontmatter
const updated = content.replace(/^status:\s*.+/m, `status: ${newStatus}`);
writeSpec(file, updated);

const arrow = `${status} → ${newStatus}`;
console.log(`\n  ✓ ${id} — ${name}`);
console.log(`    Status: ${arrow}\n`);
