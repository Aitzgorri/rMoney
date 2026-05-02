const fs = require('fs');
const path = require('path');

const specsDir = path.join(__dirname, '..', 'specs', 'features');

if (!fs.existsSync(specsDir) || fs.readdirSync(specsDir).filter(f => f.endsWith('.md')).length === 0) {
  console.log('\nNo specs yet. Create one with: npm run spec:new "Feature Name"\n');
  process.exit(0);
}

const statusIcon = {
  draft:       '[ ]',
  ready:       '[~]',
  'in-progress': '[>]',
  done:        '[x]',
};

const statusOrder = ['in-progress', 'ready', 'draft', 'done'];

const files = fs.readdirSync(specsDir).filter(f => f.endsWith('.md'));

const specs = files.map(file => {
  const content = fs.readFileSync(path.join(specsDir, file), 'utf8');
  const id     = (content.match(/^id:\s*(.+)/m)     || [])[1]?.trim() ?? '???';
  const name   = (content.match(/^name:\s*(.+)/m)   || [])[1]?.trim() ?? file;
  const status = (content.match(/^status:\s*(.+)/m) || [])[1]?.trim() ?? 'draft';

  // Count acceptance criteria
  const total = (content.match(/^- \[.\]/gm) || []).length;
  const done  = (content.match(/^- \[x\]/gm) || []).length;

  return { id, name, status, done, total, file };
});

specs.sort((a, b) => statusOrder.indexOf(a.status) - statusOrder.indexOf(b.status));

console.log('\n SPEC LIST');
console.log(' ' + '-'.repeat(62));
console.log(' Icon  ID          Status        Criteria   Name');
console.log(' ' + '-'.repeat(62));

specs.forEach(({ id, name, status, done, total }) => {
  const icon     = statusIcon[status] ?? '[?]';
  const criteria = total > 0 ? `${done}/${total}` : '—';
  console.log(` ${icon}  ${id.padEnd(10)}  ${status.padEnd(12)}  ${criteria.padEnd(9)}  ${name}`);
});

console.log(' ' + '-'.repeat(62));
console.log(' [ ] draft   [~] ready   [>] in-progress   [x] done\n');
