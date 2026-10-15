#!/usr/bin/env node
/**
 * Static checks that run before a build.
 *
 * These exist because the Attendance screen once shipped rendering <H1> with
 * no H1 import - a crash on open that no amount of reading caught. Parsing
 * alone would not have found it either; the component check would.
 */
let parse;
try {
  ({ parse } = require('@babel/parser'));
} catch {
  console.error('Dependencies are not installed yet. Run:\n\n  npm install\n');
  process.exit(2);
}
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SKIP = new Set(['node_modules', '.git', 'dist', 'android', 'ios', 'assets', '.expo']);
const GLOBALS = new Set([
  'React', 'Fragment', 'Math', 'Date', 'Number', 'String', 'Object', 'Array', 'JSON',
  'Set', 'Map', 'Promise', 'console', 'require', 'module', 'exports', 'Error', 'Boolean',
]);

function walk(dir, out = []) {
  for (const name of fs.readdirSync(dir)) {
    if (SKIP.has(name)) continue;
    const p = path.join(dir, name);
    if (fs.statSync(p).isDirectory()) walk(p, out);
    else if (name.endsWith('.js') || name.endsWith('.jsx')) out.push(p);
  }
  return out;
}

const rel = (f) => f.replace(ROOT + path.sep, '');
const problems = [];
const files = walk(ROOT);
const asts = new Map();

// 1. everything parses
for (const f of files) {
  try {
    asts.set(f, parse(fs.readFileSync(f, 'utf8'), { sourceType: 'unambiguous', plugins: ['jsx'] }));
  } catch (e) {
    problems.push(`SYNTAX     ${rel(f)} -> ${e.message}`);
  }
}

// 2. collect exports for import checking
function resolveRel(fromFile, spec) {
  let target = path.resolve(path.dirname(fromFile), spec);
  if (fs.existsSync(target) && fs.statSync(target).isDirectory()) target = path.join(target, 'index.js');
  else if (!target.endsWith('.js')) target += '.js';
  return target;
}

const exportsOf = new Map();
const starFrom = new Map();          // file -> [files it re-exports wholesale]
for (const [f, ast] of asts) {
  const names = new Set();
  const stars = [];
  for (const n of ast.program.body) {
    if (n.type === 'ExportNamedDeclaration') {
      if (n.declaration) {
        if (n.declaration.id) names.add(n.declaration.id.name);
        for (const d of n.declaration.declarations || []) if (d.id.type === 'Identifier') names.add(d.id.name);
      }
      for (const sp of n.specifiers || []) names.add(sp.exported.name);
    }
    if (n.type === 'ExportDefaultDeclaration') names.add('default');
    // `export * from './storeCore'` forwards every named export.
    if (n.type === 'ExportAllDeclaration' && n.source.value.startsWith('.')) {
      stars.push(resolveRel(f, n.source.value));
    }
  }
  exportsOf.set(f, names);
  starFrom.set(f, stars);
}

// Pull forwarded names through, repeatedly, so chains resolve too.
for (let pass = 0; pass < 5; pass++) {
  let grew = false;
  for (const [f, stars] of starFrom) {
    for (const target of stars) {
      const from = exportsOf.get(target);
      if (!from) continue;
      const mine = exportsOf.get(f);
      for (const name of from) {
        if (name !== 'default' && !mine.has(name)) { mine.add(name); grew = true; }
      }
    }
  }
  if (!grew) break;
}

for (const [f, ast] of asts) {
  const declared = new Set(GLOBALS);
  const usedComponents = new Map();

  (function visit(n) {
    if (!n || typeof n !== 'object') return;
    if (Array.isArray(n)) return n.forEach(visit);
    if (!n.type) return;
    if (/^Import(Specifier|DefaultSpecifier|NamespaceSpecifier)$/.test(n.type)) declared.add(n.local.name);
    if (n.type === 'VariableDeclarator' && n.id.type === 'Identifier') declared.add(n.id.name);
    if ((n.type === 'FunctionDeclaration' || n.type === 'ClassDeclaration') && n.id) declared.add(n.id.name);
    if (/Function(Declaration|Expression)$|ArrowFunctionExpression/.test(n.type)) {
      for (const p of n.params || []) {
        if (p.type === 'Identifier') declared.add(p.name);
        if (p.type === 'ObjectPattern') for (const pr of p.properties) {
          if (pr.type === 'ObjectProperty' && pr.value.type === 'Identifier') declared.add(pr.value.name);
          if (pr.type === 'RestElement' && pr.argument.type === 'Identifier') declared.add(pr.argument.name);
        }
      }
    }
    if (n.type === 'JSXOpeningElement' && n.name.type === 'JSXIdentifier' && /^[A-Z]/.test(n.name.name)) {
      usedComponents.set(n.name.name, n.loc.start.line);
    }
    for (const k of Object.keys(n)) { if (k === 'loc') continue; visit(n[k]); }
  })(ast.program);

  // 3a. a component declared INSIDE another component is a new type on every
  //     render, so React remounts it each time - losing its state and any
  //     press in progress. Found in Attendance, where a one-second clock
  //     remounted the stat tiles every second.
  (function nested(n, insideComponent) {
    if (!n || typeof n !== 'object') return;
    if (Array.isArray(n)) return n.forEach((c) => nested(c, insideComponent));
    if (!n.type) return;
    const isComponentFn =
      (n.type === 'FunctionDeclaration' && n.id && /^[A-Z]/.test(n.id.name)) ||
      (n.type === 'VariableDeclarator' && n.id.type === 'Identifier' && /^[A-Z]/.test(n.id.name) &&
        n.init && /Function|Arrow/.test(n.init.type));
    if (isComponentFn && insideComponent) {
      const name = n.id.name;
      const line = n.loc.start.line;
      // Only flag it if it actually renders JSX.
      const src = JSON.stringify(n.init || n.body || {});
      if (src.includes('"JSXElement"') || src.includes('"JSXFragment"')) {
        problems.push(`NESTED     ${rel(f)}:${line}  <${name}> is declared inside ${insideComponent} and remounts on every render`);
      }
    }
    const owner = isComponentFn ? n.id.name : insideComponent;
    for (const k of Object.keys(n)) { if (k === 'loc') continue; nested(n[k], owner); }
  })(ast.program, null);

  // 3. components rendered but never imported
  for (const [name, line] of usedComponents) {
    if (!declared.has(name)) problems.push(`NO IMPORT  ${rel(f)}:${line}  <${name}>`);
  }

  // 4. imports that point at something the target does not export
  for (const n of ast.program.body) {
    if (n.type !== 'ImportDeclaration') continue;
    const src = n.source.value;
    if (!src.startsWith('.')) continue;
    let target = path.resolve(path.dirname(f), src);
    if (fs.existsSync(target) && fs.statSync(target).isDirectory()) target = path.join(target, 'index.js');
    else if (!target.endsWith('.js')) target += '.js';
    if (!fs.existsSync(target)) {
      if (!/\.(wav|png|jpg|json)$/.test(src)) problems.push(`MISSING    ${rel(f)} -> ${src}`);
      continue;
    }
    const available = exportsOf.get(target);
    if (!available) continue;
    for (const sp of n.specifiers) {
      if (sp.type === 'ImportSpecifier' && !available.has(sp.imported.name)) {
        problems.push(`NOT EXPORTED ${rel(f)} imports {${sp.imported.name}} from ${src}`);
      }
      if (sp.type === 'ImportDefaultSpecifier' && !available.has('default')) {
        problems.push(`NO DEFAULT ${rel(f)} imports default from ${src}`);
      }
    }
  }
}

// 4b. a name used but never declared or imported. The ReferenceError only
//     appears when that line runs, on the phone: an `editChip` left behind by a
//     bad edit crashed Settings that way, and neither the parser nor the
//     component check above can see it. Uses Babel's own scope analysis.
let traverse = null;
try { traverse = require('@babel/traverse').default; } catch { /* older install: skip this one check */ }
if (traverse) {
  const KNOWN = new Set([...Object.getOwnPropertyNames(globalThis), '__DEV__', 'FormData', 'requestAnimationFrame', 'cancelAnimationFrame', 'navigator', 'alert', 'process', 'require', 'module', 'exports', 'global', '__dirname', '__filename']);
  // Files only the browser build loads (*.web.js, web/) may also use the page's own globals.
  const BROWSER = new Set(['window', 'document', 'localStorage', 'Notification', 'HTMLElement']);
  const browserOnly = (f) => /\.web\.js$/.test(f) || rel(f).startsWith('web' + path.sep);
  for (const [f, ast] of asts) {
    const inBrowser = browserOnly(f);
    try {
      traverse(ast, {
        ReferencedIdentifier(p) {
          const name = p.node.name;
          if (p.node.type === 'JSXIdentifier' && /^[a-z]/.test(name)) return;       // <div>-style host tag
          if (p.scope.hasBinding(name) || KNOWN.has(name) || (inBrowser && BROWSER.has(name))) return;
          problems.push(`UNDEFINED  ${rel(f)}:${p.node.loc ? p.node.loc.start.line : '?'}  ${name} is used but never declared or imported`);
        },
      });
    } catch (e) {
      problems.push(`SCOPE      ${rel(f)} -> ${e.message}`);
    }
  }
}

// 5. things that should never be committed
const FORBIDDEN = [
  // The photo editor is a fixed dark surface on purpose (a photo reads best on
  // near-black whatever the app theme); only its accent follows the theme.
  // The browser's Alert dialog (platformSetup.web.js) is plain page CSS, outside the app's theme.
  [/#[0-9A-Fa-f]{6}/, 'hardcoded colour (use the theme)', (f) => !/theme\.js|charts\.js|colour\.js|ErrorBoundary\.js|ImageEditor\.js|imageEditorHtml\.js|platformSetup\.web\.js/.test(f)],
];
for (const f of files) {
  const src = fs.readFileSync(f, 'utf8');
  for (const [re, label, applies] of FORBIDDEN) {
    if (applies && !applies(f)) continue;
    src.split('\n').forEach((line, i) => {
      if (re.test(line) && !line.includes("'#fff'") && !line.includes('placeholder')) {
        problems.push(`STYLE      ${rel(f)}:${i + 1}  ${label}`);
      }
    });
  }
}

console.log(`Checked ${files.length} files.`);
if (problems.length) {
  problems.forEach((p) => console.log('  ' + p));
  console.log(`\n${problems.length} problem(s).`);
  process.exit(1);
}
console.log('No problems found.');
