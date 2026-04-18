// Anchor expression parser tests.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseExpr, collectRefs, ExprParseError } from '../dist/engine-lib.js';

test('expr: literal duration s', () => {
  const ast = parseExpr('10s');
  assert.deepEqual(ast, { type: 'dur', ms: 10000 });
});

test('expr: literal duration ms', () => {
  const ast = parseExpr('500ms');
  assert.deepEqual(ast, { type: 'dur', ms: 500 });
});

test('expr: fractional seconds', () => {
  const ast = parseExpr('2.5s');
  assert.deepEqual(ast, { type: 'dur', ms: 2500 });
});

test('expr: simple ident', () => {
  const ast = parseExpr('opening');
  assert.deepEqual(ast, { type: 'ref', path: ['opening'] });
});

test('expr: dotted ident', () => {
  const ast = parseExpr('opening.end');
  assert.deepEqual(ast, { type: 'ref', path: ['opening', 'end'] });
});

test('expr: add with whitespace', () => {
  const ast = parseExpr('opening.end + 500ms');
  assert.equal(ast.type, 'binop');
  assert.equal(ast.op, '+');
});

test('expr: sub', () => {
  const ast = parseExpr('beat.drop - 300ms');
  assert.equal(ast.type, 'binop');
  assert.equal(ast.op, '-');
});

test('expr: left-associative chain', () => {
  const ast = parseExpr('intro.begin + 2.5s - 100ms');
  // Should parse as ((intro.begin + 2.5s) - 100ms)
  assert.equal(ast.type, 'binop');
  assert.equal(ast.op, '-');
  assert.equal(ast.left.type, 'binop');
  assert.equal(ast.left.op, '+');
});

test('expr: tabs allowed', () => {
  const ast = parseExpr('a\t+\tb');
  assert.equal(ast.type, 'binop');
});

test('expr: underscore ident', () => {
  const ast = parseExpr('_foo_bar');
  assert.deepEqual(ast, { type: 'ref', path: ['_foo_bar'] });
});

test('expr error: duration without unit', () => {
  assert.throws(() => parseExpr('10'), ExprParseError);
});

test('expr error: unknown operator *', () => {
  assert.throws(() => parseExpr('a * b'), ExprParseError);
});

test('expr error: dangling operator', () => {
  assert.throws(() => parseExpr('5s -'), ExprParseError);
});

test('expr error: empty string', () => {
  assert.throws(() => parseExpr(''), ExprParseError);
});

test('collectRefs: extracts unique heads', () => {
  const ast = parseExpr('a.begin + b.end - a.end');
  const refs = collectRefs(ast);
  assert.deepEqual(refs.sort(), ['a', 'b']);
});
