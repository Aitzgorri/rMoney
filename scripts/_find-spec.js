// Shared helper — finds a spec file by partial name match.
// Used by review, validate, and set-status scripts.

const fs = require('fs');
const path = require('path');

const specsDir = path.join(__dirname, '..', 'specs', 'features');

function findSpec(query) {
  if (!fs.existsSync(specsDir)) return null;
  const files = fs.readdirSync(specsDir).filter(f => f.endsWith('.md'));
  const q = query.toLowerCase().replace(/\s+/g, '-');
  return files.find(f => f.includes(q)) || null;
}

function readSpec(filename) {
  return fs.readFileSync(path.join(specsDir, filename), 'utf8');
}

function writeSpec(filename, content) {
  fs.writeFileSync(path.join(specsDir, filename), content);
}

function parseSpec(content) {
  return {
    id:      (content.match(/^id:\s*(.+)/m)     || [])[1]?.trim() ?? '???',
    name:    (content.match(/^name:\s*(.+)/m)   || [])[1]?.trim() ?? '???',
    status:  (content.match(/^status:\s*(.+)/m) || [])[1]?.trim() ?? 'draft',
    created: (content.match(/^created:\s*(.+)/m)|| [])[1]?.trim() ?? '???',
    allCriteria:     content.match(/^- \[.\] .+/gm) || [],
    doneCriteria:    content.match(/^- \[x\] .+/gm) || [],
    pendingCriteria: content.match(/^- \[ \] .+/gm) || [],
  };
}

module.exports = { specsDir, findSpec, readSpec, writeSpec, parseSpec };
