import { test } from 'node:test';
import assert from 'node:assert/strict';
import { topologicalOrder, CycleError } from '../dist/engine-lib.js';

test('topo: linear chain', () => {
  const order = topologicalOrder({ a: [], b: ['a'], c: ['b'] });
  assert.deepEqual(order, ['a', 'b', 'c']);
});

test('topo: stable output for identical input', () => {
  const g = { x: [], y: [], z: ['x', 'y'] };
  const o1 = topologicalOrder(g);
  const o2 = topologicalOrder({ ...g });
  assert.deepEqual(o1, o2);
});

test('topo: diamond', () => {
  const order = topologicalOrder({ a: [], b: ['a'], c: ['a'], d: ['b', 'c'] });
  assert.equal(order[0], 'a');
  assert.equal(order[3], 'd');
});

test('topo: 2-node cycle → chain a->b->a', () => {
  try {
    topologicalOrder({ a: ['b'], b: ['a'] });
    assert.fail('expected CycleError');
  } catch (e) {
    assert.ok(e instanceof CycleError, 'should throw CycleError');
    assert.ok(e.chain.length >= 3, 'chain should include the cycle closure');
    assert.equal(e.chain[0], e.chain[e.chain.length - 1], 'chain closes on same node');
  }
});

test('topo: 3-node cycle a->b->c->a', () => {
  try {
    topologicalOrder({ a: ['b'], b: ['c'], c: ['a'] });
    assert.fail('expected CycleError');
  } catch (e) {
    assert.ok(e instanceof CycleError);
    const set = new Set(e.chain);
    assert.ok(set.has('a') && set.has('b') && set.has('c'));
  }
});
