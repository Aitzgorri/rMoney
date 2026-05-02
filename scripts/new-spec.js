const fs = require('fs');
const path = require('path');

const name = process.argv[2];
if (!name) {
  console.error('Usage: npm run spec:new "Feature Name"');
  process.exit(1);
}

const specsDir = path.join(__dirname, '..', 'specs', 'features');
const templatePath = path.join(__dirname, '..', 'specs', '_template.md');

// Count existing specs to generate next ID
fs.mkdirSync(specsDir, { recursive: true });
const existing = fs.readdirSync(specsDir).filter(f => f.endsWith('.md'));
const id = String(existing.length + 1).padStart(3, '0');

// Generate filename from name
const filename = name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '') + '.md';
const filepath = path.join(specsDir, filename);

if (fs.existsSync(filepath)) {
  console.error(`Spec already exists: specs/features/${filename}`);
  process.exit(1);
}

// Fill in template placeholders
const today = new Date().toISOString().split('T')[0];
let content = fs.readFileSync(templatePath, 'utf8');
content = content
  .replace(/\{\{ID\}\}/g, `SPEC-${id}`)
  .replace(/\{\{NAME\}\}/g, name)
  .replace(/\{\{DATE\}\}/g, today);

fs.writeFileSync(filepath, content);
console.log(`\n✓ Created: specs/features/${filename}`);
console.log(`\nNext step: open the file and fill in the Goal, User Stories, and Acceptance Criteria.`);
