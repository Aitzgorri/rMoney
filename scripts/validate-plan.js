// Validates that specs/implementation-plan.md is in sync with spec files.
//
// Checks:
// 1. Every spec with unchecked criteria has items in the plan
// 2. Item counts per spec roughly match (plan vs spec unchecked criteria)
// 3. Done specs have no items left in the plan
// 4. Plan doesn't reference specs that don't exist

const fs = require('fs');
const path = require('path');

const specsDir = path.join(__dirname, '..', 'specs', 'features');
const planPath = path.join(__dirname, '..', 'specs', 'implementation-plan.md');

// --- Read all spec files ---
const specFiles = fs.readdirSync(specsDir).filter(f => f.endsWith('.md'));
const specs = specFiles.map(file => {
  const content = fs.readFileSync(path.join(specsDir, file), 'utf8');
  const id      = (content.match(/^id:\s*(.+)/m)     || [])[1]?.trim() ?? '???';
  const name    = (content.match(/^name:\s*(.+)/m)    || [])[1]?.trim() ?? file;
  const status  = (content.match(/^status:\s*(.+)/m)  || [])[1]?.trim() ?? 'draft';
  const pending = (content.match(/^- \[ \] .+/gm) || []).length;
  return { id, name, status, pending, file };
});

// --- Read implementation plan ---
if (!fs.existsSync(planPath)) {
  console.error('\n  ✗ specs/implementation-plan.md not found\n');
  process.exit(1);
}
const planContent = fs.readFileSync(planPath, 'utf8');

// Count unchecked items in the plan per SPEC-XXX
// Items are grouped under headers like "### SPEC-005 Transaction Entry — remaining items"
// A spec can appear in multiple phases, so we accumulate.
const planItems = {};  // { 'SPEC-005': count }
const planLines = planContent.split('\n');

let currentSpec = null;
for (const line of planLines) {
  // Detect spec headers: "### SPEC-005 ..."
  const headerMatch = line.match(/^###\s+(SPEC-\d{3})/);
  if (headerMatch) {
    currentSpec = headerMatch[1];
    if (!planItems[currentSpec]) planItems[currentSpec] = 0;
  }
  // Detect phase headers or non-spec headers — reset current spec
  else if (/^##[^#]/.test(line)) {
    currentSpec = null;
  }
  // Count unchecked items under current spec
  if (currentSpec && /^\d+\.\s*\[ \]/.test(line)) {
    planItems[currentSpec]++;
  }
}

// --- Run checks ---
const errors = [];
const warnings = [];

for (const spec of specs) {
  const planCount = planItems[spec.id] || 0;

  // Check 1: Done specs should have no items in the plan
  if (spec.status === 'done' && planCount > 0) {
    errors.push(`${spec.id} ${spec.name} is done but still has ${planCount} item(s) in the plan — remove them`);
  }

  // Check 2: Specs with pending criteria should have items in the plan
  if (spec.pending > 0 && planCount === 0 && spec.status !== 'done') {
    errors.push(`${spec.id} ${spec.name} has ${spec.pending} unchecked criteria but 0 items in the plan — add them`);
  }

  // Check 3: Count mismatch (not exact because plan may consolidate or split items)
  if (spec.pending > 0 && planCount > 0 && Math.abs(spec.pending - planCount) > 2) {
    warnings.push(
      `${spec.id} ${spec.name}: spec has ${spec.pending} unchecked criteria, plan has ${planCount} items (difference: ${Math.abs(spec.pending - planCount)})`
    );
  }

  // Clean up — mark spec as seen
  if (planItems[spec.id] !== undefined) {
    planItems[spec.id] = -1;  // sentinel: spec exists
  }
}

// Check 4: Plan references specs that don't exist
for (const [specId, count] of Object.entries(planItems)) {
  if (count !== -1) {
    // was never matched to a spec file — but it might have count 0 from header-only
    // Only flag if it had items
    if (count > 0) {
      errors.push(`Plan references ${specId} but no matching spec file was found`);
    }
  }
}

// --- Report ---
console.log('\n  IMPLEMENTATION PLAN VALIDATION');
console.log('  ' + '-'.repeat(50));

// Summary table
console.log('\n  Spec              Status         Spec    Plan');
console.log('  ' + '-'.repeat(50));
for (const spec of specs) {
  const planCount = planItems[spec.id] === -1
    ? (planContent.match(new RegExp(`###\\s+${spec.id}`, 'g')) || []).length > 0
      ? countPlanItemsForSpec(spec.id)
      : 0
    : (planItems[spec.id] || 0);

  const flag = spec.status === 'done' && planCount > 0 ? ' ✗'
    : spec.pending > 0 && planCount === 0 && spec.status !== 'done' ? ' ✗'
    : '';

  console.log(
    `  ${spec.id}  ${spec.status.padEnd(13)}  ${String(spec.pending).padEnd(6)}  ${planCount}${flag}`
  );
}
console.log('  ' + '-'.repeat(50));
console.log('  Spec = unchecked criteria in spec file');
console.log('  Plan = unchecked items in implementation plan');

if (errors.length === 0 && warnings.length === 0) {
  console.log('\n  ✓ Plan is in sync with specs\n');
  process.exit(0);
}

if (errors.length > 0) {
  console.log('\n  ERRORS:');
  errors.forEach(e => console.log(`    ✗ ${e}`));
}

if (warnings.length > 0) {
  console.log('\n  WARNINGS (may be intentional):');
  warnings.forEach(w => console.log(`    ! ${w}`));
}

console.log('');
if (errors.length > 0) process.exit(1);

// Helper to recount plan items for a spec (used after sentinel overwrite)
function countPlanItemsForSpec(specId) {
  let count = 0;
  let active = false;
  for (const line of planLines) {
    const headerMatch = line.match(/^###\s+(SPEC-\d{3})/);
    if (headerMatch) {
      active = headerMatch[1] === specId;
    } else if (/^##[^#]/.test(line)) {
      active = false;
    }
    if (active && /^\d+\.\s*\[ \]/.test(line)) {
      count++;
    }
  }
  return count;
}
