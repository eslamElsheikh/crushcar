import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import ts from 'typescript';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const v1Dir = path.resolve(rootDir, '../safro-v1');

function getSourceFiles(dir) {
  const results = [];
  if (!fs.existsSync(dir)) return results;
  const list = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of list) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules' && entry.name !== '.next' && entry.name !== '.git') {
        results.push(...getSourceFiles(fullPath));
      }
    } else if (entry.isFile() && (entry.name.endsWith('.tsx') || entry.name.endsWith('.ts'))) {
      results.push(fullPath);
    }
  }
  return results;
}

// Extract fetch calls using TypeScript AST
export function extractCallsWithTS(filePath, isV1 = false) {
  const content = fs.readFileSync(filePath, 'utf8');
  const sourceFile = ts.createSourceFile(
    filePath,
    content,
    ts.ScriptTarget.Latest,
    true,
    filePath.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  );

  const calls = [];

  function visit(node) {
    if (ts.isCallExpression(node)) {
      let isFetch = false;
      if (ts.isIdentifier(node.expression) && node.expression.text === 'fetch') {
        isFetch = true;
      }

      if (isFetch && node.arguments.length >= 1) {
        const urlArg = node.arguments[0];
        let rawUrl = '';

        if (ts.isStringLiteral(urlArg) || ts.isNoSubstitutionTemplateLiteral(urlArg)) {
          rawUrl = urlArg.text;
        } else if (ts.isTemplateExpression(urlArg)) {
          let constructed = urlArg.head.text;
          for (const span of urlArg.templateSpans) {
            const isPath = constructed.endsWith('/') || span.literal.text.startsWith('/');
            if (isPath) {
              constructed += '[id]' + span.literal.text;
            } else {
              constructed += span.literal.text;
            }
          }
          rawUrl = constructed;
        } else if (ts.isIdentifier(urlArg)) {
          rawUrl = urlArg.text;
        } else {
          rawUrl = urlArg.getText(sourceFile);
        }

        if (rawUrl.includes('/api/')) {
          let endpoint = rawUrl.split('?')[0].replace(/['"`]/g, '').trim();
          endpoint = endpoint.replace(/\/+$/, '');
          if (!endpoint.startsWith('/api')) {
            const idx = endpoint.indexOf('/api');
            if (idx >= 0) endpoint = endpoint.slice(idx);
          }

          let method = 'GET';
          const bodyKeys = [];

          if (node.arguments.length >= 2) {
            const optArg = node.arguments[1];
            if (ts.isObjectLiteralExpression(optArg)) {
              for (const prop of optArg.properties) {
                if (ts.isPropertyAssignment(prop) && prop.name) {
                  const propName = prop.name.getText(sourceFile).replace(/['"]/g, '');
                  if (propName === 'method') {
                    if (ts.isStringLiteral(prop.initializer)) {
                      method = prop.initializer.text.toUpperCase();
                    }
                  } else if (propName === 'body') {
                    if (ts.isCallExpression(prop.initializer)) {
                      const callExpr = prop.initializer;
                      if (callExpr.expression.getText(sourceFile).includes('JSON.stringify') && callExpr.arguments.length > 0) {
                        const bodyObj = callExpr.arguments[0];
                        if (ts.isObjectLiteralExpression(bodyObj)) {
                          for (const bp of bodyObj.properties) {
                            if (bp.name) {
                              bodyKeys.push(bp.name.getText(sourceFile).replace(/['"]/g, ''));
                            }
                          }
                        } else if (ts.isIdentifier(bodyObj)) {
                          bodyKeys.push(`[${bodyObj.text}]`);
                        }
                      }
                    }
                  }
                }
              }
            }
          }

          // Extract response fields read by UI
          const responseFields = new Set();
          let parent = node.parent;
          
          // Case 1: const res = await fetch(...)
          if (parent && ts.isAwaitExpression(parent)) {
            const varDecl = parent.parent;
            if (varDecl && ts.isVariableDeclaration(varDecl) && ts.isIdentifier(varDecl.name)) {
              const resVarName = varDecl.name.text;
              const enclosingBlock = findEnclosingBlock(varDecl);
              if (enclosingBlock) {
                findResUsages(enclosingBlock, resVarName, responseFields, sourceFile);
              }
            }
          }
          // Case 2: fetch(...).then(r => r.json()).then(data => ...)
          else if (parent && ts.isPropertyAccessExpression(parent) && parent.name.text === 'then') {
            const thenCall = parent.parent;
            if (thenCall && ts.isCallExpression(thenCall)) {
              findPromiseChains(thenCall, responseFields, sourceFile);
            }
          }

          const lineAndChar = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
          
          calls.push({
            file: path.relative(isV1 ? v1Dir : rootDir, filePath).replace(/\\/g, '/'),
            line: lineAndChar.line + 1,
            rawUrl,
            endpoint,
            method,
            bodyKeys,
            responseFields: Array.from(responseFields),
          });
        }
      }
    }
    ts.forEachChild(node, visit);
  }

  function findEnclosingBlock(node) {
    let curr = node.parent;
    while (curr) {
      if (ts.isBlock(curr) || ts.isFunctionDeclaration(curr) || ts.isArrowFunction(curr)) {
        return curr;
      }
      curr = curr.parent;
    }
    return null;
  }

  function findResUsages(block, resVarName, fields, sf) {
    function visitRes(n) {
      // res.json()
      if (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression)) {
        if (n.expression.expression.getText(sf) === resVarName && n.expression.name.text === 'json') {
          // const data = await res.json() or const { x, y } = await res.json()
          let p = n.parent;
          if (p && ts.isAwaitExpression(p)) p = p.parent;
          if (p && ts.isVariableDeclaration(p)) {
            if (ts.isObjectBindingPattern(p.name)) {
              for (const elem of p.name.elements) {
                if (ts.isIdentifier(elem.name)) fields.add(elem.name.text);
              }
            } else if (ts.isIdentifier(p.name)) {
              const dataVar = p.name.text;
              findDataUsages(block, dataVar, fields, sf);
            }
          }
        }
      }
      ts.forEachChild(n, visitRes);
    }
    visitRes(block);
  }

  function findDataUsages(block, dataVar, fields, sf) {
    function visitData(n) {
      if (ts.isPropertyAccessExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === dataVar) {
        fields.add(n.name.text);
      }
      ts.forEachChild(n, visitData);
    }
    visitData(block);
  }

  function findPromiseChains(callExpr, fields, sf) {
    let curr = callExpr;
    while (curr && ts.isCallExpression(curr)) {
      if (curr.arguments.length > 0) {
        const arg = curr.arguments[0];
        if (ts.isArrowFunction(arg) || ts.isFunctionExpression(arg)) {
          if (arg.parameters.length > 0 && ts.isIdentifier(arg.parameters[0].name)) {
            const paramName = arg.parameters[0].name.text;
            findDataUsages(arg.body, paramName, fields, sf);
          }
        }
      }
      if (ts.isPropertyAccessExpression(curr.parent) && curr.parent.name.text === 'then') {
        curr = curr.parent.parent;
      } else {
        break;
      }
    }
  }

  visit(sourceFile);
  return calls;
}

// Find route file and exported methods
export function resolveRoute(apiBaseDir, endpoint) {
  const clean = endpoint.replace(/^\/api\/?/, '');
  const segments = clean.split('/').filter(Boolean);

  function search(dir, segIdx) {
    if (segIdx === segments.length) {
      const tsFile = path.join(dir, 'route.ts');
      const jsFile = path.join(dir, 'route.js');
      if (fs.existsSync(tsFile)) return tsFile;
      if (fs.existsSync(jsFile)) return jsFile;
      return null;
    }

    const seg = segments[segIdx];
    // Exact match
    const exact = path.join(dir, seg);
    if (fs.existsSync(exact) && fs.statSync(exact).isDirectory()) {
      const found = search(exact, segIdx + 1);
      if (found) return found;
    }

    // Dynamic / Catch-all match
    if (fs.existsSync(dir)) {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const ent of entries) {
        if (ent.isDirectory()) {
          // Catch-all e.g. [...nextauth]
          if (ent.name.startsWith('[...') && ent.name.endsWith(']')) {
            const tsFile = path.join(dir, ent.name, 'route.ts');
            const jsFile = path.join(dir, ent.name, 'route.js');
            if (fs.existsSync(tsFile)) return tsFile;
            if (fs.existsSync(jsFile)) return jsFile;
          }
          // Standard dynamic param e.g. [id]
          if (ent.name.startsWith('[') && !ent.name.startsWith('[...') && ent.name.endsWith(']')) {
            const found = search(path.join(dir, ent.name), segIdx + 1);
            if (found) return found;
          }
        }
      }
    }

    return null;
  }

  const resolved = search(apiBaseDir, 0);
  if (!resolved) {
    return { exists: false, routeFile: null, exportedMethods: [], bodyParams: [] };
  }

  const content = fs.readFileSync(resolved, 'utf8');
  const routeSource = ts.createSourceFile(resolved, content, ts.ScriptTarget.Latest, true);
  const exportedMethods = [];
  const bodyParams = new Set();

  function visitRoute(node) {
    // Function declarations
    if (ts.isFunctionDeclaration(node) && node.name) {
      const isExported = node.modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword);
      if (isExported) {
        exportedMethods.push(node.name.text.toUpperCase());
      }
    }

    // Variable declarations
    if (ts.isVariableStatement(node)) {
      const isExported = node.modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword);
      if (isExported) {
        for (const decl of node.declarationList.declarations) {
          if (ts.isIdentifier(decl.name)) {
            exportedMethods.push(decl.name.text.toUpperCase());
          } else if (ts.isObjectBindingPattern(decl.name)) {
            for (const elem of decl.name.elements) {
              if (ts.isIdentifier(elem.name)) {
                exportedMethods.push(elem.name.text.toUpperCase());
              }
            }
          }
        }
      }
    }

    // Export declarations: export { GET, POST }
    if (ts.isExportDeclaration(node) && node.exportClause && ts.isNamedExports(node.exportClause)) {
      for (const elem of node.exportClause.elements) {
        exportedMethods.push(elem.name.text.toUpperCase());
      }
    }

    // Extract req.json() destructuring: const { a, b } = await req.json()
    if (ts.isVariableDeclaration(node) && node.initializer) {
      let init = node.initializer;
      if (ts.isAwaitExpression(init)) init = init.expression;
      if (ts.isCallExpression(init) && init.expression.getText(routeSource).includes('.json')) {
        if (ts.isObjectBindingPattern(node.name)) {
          for (const elem of node.name.elements) {
            if (ts.isIdentifier(elem.name)) {
              bodyParams.add(elem.name.text);
            }
          }
        }
      }
      // Also check destructuring from body: const { a, b } = body
      if (ts.isIdentifier(init) && (init.text === 'body' || init.text === 'data')) {
        if (ts.isObjectBindingPattern(node.name)) {
          for (const elem of node.name.elements) {
            if (ts.isIdentifier(elem.name)) {
              bodyParams.add(elem.name.text);
            }
          }
        }
      }
    }

    // Check Zod schema objects: z.object({ foo: ..., bar: ... })
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
      if (node.expression.name.text === 'object' && node.arguments.length > 0) {
        const arg = node.arguments[0];
        if (ts.isObjectLiteralExpression(arg)) {
          for (const prop of arg.properties) {
            if (prop.name) {
              bodyParams.add(prop.name.getText(routeSource).replace(/['"]/g, ''));
            }
          }
        }
      }
    }

    ts.forEachChild(node, visitRoute);
  }

  visitRoute(routeSource);

  return {
    exists: true,
    routeFile: path.relative(rootDir, resolved).replace(/\\/g, '/'),
    exportedMethods,
    bodyParams: Array.from(bodyParams),
  };
}

export async function runContractCheck() {
  const v2UiFiles = getSourceFiles(path.join(rootDir, 'src')).filter(f => !f.includes('src/app/api') && !f.includes('src\\app\\api'));
  const v2Calls = [];
  for (const f of v2UiFiles) {
    v2Calls.push(...extractCallsWithTS(f, false));
  }

  const apiDir = path.join(rootDir, 'src/app/api');
  const checks = [];

  for (const call of v2Calls) {
    const route = resolveRoute(apiDir, call.endpoint);
    let status = 'OK';
    let message = '';

    if (!route.exists) {
      status = 'MISSING_ROUTE';
      message = `Route file not found for ${call.endpoint}`;
    } else if (!route.exportedMethods.includes(call.method)) {
      status = 'METHOD_MISMATCH';
      message = `Route exports [${route.exportedMethods.join(', ')}], UI sends ${call.method}`;
    }

    checks.push({
      call,
      route,
      status,
      message,
    });
  }

  // Reverse Diff against V1
  let v1Calls = [];
  if (fs.existsSync(v1Dir)) {
    const v1UiFiles = getSourceFiles(path.join(v1Dir, 'src')).filter(f => !f.includes('src/app/api') && !f.includes('src\\app\\api'));
    for (const f of v1UiFiles) {
      v1Calls.push(...extractCallsWithTS(f, true));
    }
  }

  const v2Pairs = new Set(v2Calls.map(c => `${c.method} ${c.endpoint}`));
  const v1Map = new Map();
  for (const c of v1Calls) {
    const key = `${c.method} ${c.endpoint}`;
    if (!v1Map.has(key)) v1Map.set(key, c);
  }

  const reverseDiff = [];
  for (const [key, call] of v1Map.entries()) {
    if (!v2Pairs.has(key)) {
      reverseDiff.push(call);
    }
  }

  return { checks, reverseDiff, totalV2: v2Calls.length, totalV1: v1Calls.length };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { checks, reverseDiff, totalV2, totalV1 } = await runContractCheck();

  console.log(`\n=================== UI VS API STATIC CONTRACT AUDIT ===================`);
  console.log(`Total V2 UI API Calls: ${totalV2}`);
  console.log(`Total V1 UI API Calls: ${totalV1}`);

  const failures = checks.filter(c => c.status !== 'OK');
  console.log(`Contract Failures: ${failures.length}\n`);

  if (failures.length > 0) {
    console.log('FAILURES / BACKEND GAPS:');
    for (const f of failures) {
      console.log(`❌ [${f.status}] ${f.call.method} ${f.call.endpoint} (${f.call.file}:${f.call.line})`);
      console.log(`   -> ${f.message}`);
    }
  } else {
    console.log('✓ All V2 UI calls match existing route handlers and exported methods!');
  }

  console.log(`\n=================== V2 UI -> API CONTRACT TABLE ===================\n`);
  console.log(`| Method | Endpoint | UI Caller | Request Body Keys | Response Fields Read | Route File | Status |`);
  console.log(`| :--- | :--- | :--- | :--- | :--- | :--- | :---: |`);

  // Deduplicate by method + endpoint + caller file for compact table
  const seenRows = new Set();
  for (const c of checks) {
    const key = `${c.call.method}|${c.call.endpoint}|${c.call.file}`;
    if (seenRows.has(key)) continue;
    seenRows.add(key);

    const bKeys = c.call.bodyKeys.length > 0 ? c.call.bodyKeys.join(', ') : '-';
    const rFields = c.call.responseFields.length > 0 ? c.call.responseFields.join(', ') : '-';
    const rFile = c.route.routeFile || 'NONE';
    const statusIcon = c.status === 'OK' ? '✅ OK' : `❌ ${c.status}`;
    console.log(`| \`${c.call.method}\` | \`${c.call.endpoint}\` | \`${c.call.file}\` | \`${bKeys}\` | \`${rFields}\` | \`${rFile}\` | ${statusIcon} |`);
  }

  console.log(`\n=================== REVERSE DIFF (V1 CALLS NOT IN V2) ===================`);
  console.log(`Total V1 unique calls absent in V2: ${reverseDiff.length}\n`);
  for (const r of reverseDiff) {
    console.log(`- ${r.method.padEnd(6)} ${r.endpoint.padEnd(35)} (V1: ${r.file}:${r.line})`);
  }
}
