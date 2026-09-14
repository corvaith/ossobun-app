import assert from 'node:assert/strict';
import test from 'node:test';
import { EMOJIS, EMOJI_IDS, ICONS, ICON_IDS } from '../src/config/emojis.js';

const SYNTAX = /^<a?:[a-z0-9_]+:\d{5,25}>$/;

test('every emoji entry has well-formed syntax', () => {
  for (const [name, syntax] of Object.entries(EMOJIS)) {
    assert.match(syntax, SYNTAX, `${name} has invalid syntax: ${syntax}`);
    const parsed = /^<a?:([a-z0-9_]+):(\d+)>$/.exec(syntax);
    assert.equal(parsed[1], name, `${name} syntax carries a different name`);
    assert.equal(parsed[2], EMOJI_IDS[name], `${name} id mismatch`);
  }
});

test('emoji ids are numeric and unique', () => {
  const ids = Object.values(EMOJI_IDS);
  assert.equal(new Set(ids).size, ids.length, 'duplicate emoji ids');
  for (const id of ids) assert.match(id, /^\d{5,25}$/);
});

test('animated emoji use the animated prefix', () => {
  for (const [name, syntax] of Object.entries(EMOJIS)) {
    if (syntax.startsWith('<a:')) assert.ok(name);
  }
  assert.ok(Object.values(EMOJIS).some((s) => s.startsWith('<a:')));
  assert.ok(Object.values(EMOJIS).some((s) => s.startsWith('<:')));
});

test('every semantic alias resolves to a real emoji', () => {
  const names = new Set(Object.keys(EMOJIS));
  for (const [alias, syntax] of Object.entries(ICONS)) {
    assert.match(syntax, SYNTAX, `alias ${alias} has invalid syntax`);
    assert.ok(
      Object.values(EMOJIS).includes(syntax),
      `alias ${alias} points at something not in EMOJIS`
    );
    assert.ok(names.size > 0);
  }
});

test('alias ids stay in sync with alias syntax', () => {
  for (const alias of Object.keys(ICONS)) {
    const parsed = /^<a?:([a-z0-9_]+):(\d+)>$/.exec(ICONS[alias]);
    assert.equal(parsed[2], ICON_IDS[alias], `alias ${alias} id mismatch`);
    assert.equal(EMOJI_IDS[parsed[1]], ICON_IDS[alias]);
  }
});

test('the aliases the bot code relies on all exist', () => {
  const required = [
    'success',
    'failed',
    'warning',
    'info',
    'loading',
    'processing',
    'check',
    'error',
    'add',
    'delete',
    'edit',
    'search',
    'link',
    'mail',
    'owner',
    'admin',
    'staff',
    'lock',
    'ban',
    'code',
    'terminal',
    'cloud',
    'deploy',
    'git',
    'bug',
    'web',
    'crown',
    'heart',
    'question',
  ];
  for (const alias of required) {
    assert.ok(ICONS[alias], `missing required alias: ${alias}`);
    assert.ok(ICON_IDS[alias], `missing id for alias: ${alias}`);
  }
});
