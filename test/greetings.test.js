import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEFAULT_TEXT,
  KINDS,
  KIND_META,
  PLACEHOLDERS,
  buildPayload,
  emptyConfig,
  enabledKinds,
  greetingSummary,
  normalizeConfig,
  placeholders,
  previewText,
  render,
} from '../src/services/greetings/logic.js';

function member(overrides = {}) {
  return {
    guild: { name: 'OSSOBUN.exe', memberCount: 128 },
    user: {
      id: '123456789012345678',
      username: 'Ossobun',
      displayAvatarURL: () => 'https://cdn.example/avatar.png',
    },
    ...overrides,
  };
}

test('a fresh config has all four greetings present and off', () => {
  const config = emptyConfig('g1');
  assert.deepEqual(enabledKinds(config), []);
  for (const kind of KINDS) {
    assert.equal(config[kind].enabled, false);
    assert.equal(config[kind].style, 'embed');
    assert.equal(config[kind].text, DEFAULT_TEXT[kind]);
    assert.equal(config[kind].channelId, null);
  }
});

test('normalizeConfig repairs junk without throwing', () => {
  const config = normalizeConfig('g1', {
    welcome: { enabled: 1, channelId: 99, style: 'fancy', text: '   ', color: 'nope' },
    farewell: { enabled: true, text: 'Bye {user}', style: 'text' },
    dm: 'not an object',
  });

  assert.equal(config.welcome.enabled, true);
  assert.equal(config.welcome.channelId, null);
  assert.equal(config.welcome.style, 'embed');
  assert.equal(config.welcome.text, DEFAULT_TEXT.welcome);
  assert.equal(config.welcome.color, 0xffdde8);
  assert.equal(config.farewell.text, 'Bye {user}');
  assert.equal(config.farewell.style, 'text');
  assert.equal(config.dm.enabled, false);
});

test('placeholders map every documented token', () => {
  const values = placeholders(member());
  for (const { token } of PLACEHOLDERS) {
    assert.ok(values[token] !== undefined, `${token} is not produced`);
  }
  assert.equal(values['{user}'], 'Ossobun');
  assert.equal(values['{mention}'], '<@123456789012345678>');
  assert.equal(values['{server}'], 'OSSOBUN.exe');
  assert.equal(values['{count}'], '128');
  assert.equal(values['{id}'], '123456789012345678');
});

test('render substitutes every occurrence of a token', () => {
  const values = { '{user}': 'Bob', '{server}': 'Home' };
  assert.equal(
    render('Hi {user} at {server}, welcome {user}!', values),
    'Hi Bob at Home, welcome Bob!'
  );
  assert.equal(render('no tokens here', values), 'no tokens here');
  assert.equal(render('{missing} stays', values), '{missing} stays');
});

test('embed style produces an embed, text style produces content', () => {
  const config = emptyConfig('g1');
  const values = { ...placeholders(member()), '{avatar}': 'https://cdn.example/a.png' };

  const embed = buildPayload('welcome', config.welcome, values);
  assert.equal(Array.isArray(embed.embeds), true);
  assert.equal(embed.content, undefined);
  assert.equal(embed.embeds[0].thumbnail.url, 'https://cdn.example/a.png');
  assert.match(embed.embeds[0].description, /Welcome <@123456789012345678>/);

  config.farewell.style = 'text';
  const plain = buildPayload('farewell', config.farewell, values);
  assert.equal(plain.embeds, undefined);
  assert.match(plain.content, /Ossobun has left/);
});

test('rendered payloads never leave raw placeholders behind', () => {
  const config = emptyConfig('g1');
  const values = { ...placeholders(member()), '{avatar}': '' };

  for (const kind of KINDS) {
    const payload = buildPayload(kind, config[kind], values);
    const text = JSON.stringify(payload);
    assert.doesNotMatch(text, /\{(user|mention|server|count|id)\}/, `${kind} left a placeholder`);
  }
});

test('preview shows a realistic sample, not the raw tokens', () => {
  const config = emptyConfig('g1');
  for (const kind of KINDS) {
    const preview = previewText(config[kind], kind);
    assert.doesNotMatch(preview, /\{(user|mention|server|count|id)\}/);
    assert.ok(preview.length > 0);
  }
});

test('greetingSummary flags a missing channel', () => {
  const config = emptyConfig('g1');
  assert.equal(greetingSummary(config, 'welcome'), 'Off');

  config.welcome.enabled = true;
  assert.match(greetingSummary(config, 'welcome'), /no channel/);

  config.welcome.channelId = '123456789';
  assert.match(greetingSummary(config, 'welcome'), /embed/);

  config.welcome.style = 'text';
  assert.match(greetingSummary(config, 'welcome'), /plain message/);

  // The DM greeting needs no channel at all.
  config.dm.enabled = true;
  assert.match(greetingSummary(config, 'dm'), /embed/);
});

test('every greeting declares a label, icon and description', () => {
  for (const kind of KINDS) {
    assert.ok(KIND_META[kind].label, `${kind} has no label`);
    assert.ok(KIND_META[kind].icon, `${kind} has no icon`);
    assert.ok(KIND_META[kind].description, `${kind} has no description`);
    assert.equal(typeof KIND_META[kind].channel, 'boolean');
  }
});

test('a config survives a JSON round trip', () => {
  const config = emptyConfig('g1');
  config.welcome.enabled = true;
  config.welcome.channelId = '123456789012345678';
  config.welcome.text = 'Yo {mention}';
  config.welcome.style = 'text';

  const restored = normalizeConfig('g1', JSON.parse(JSON.stringify(config)));
  assert.equal(restored.welcome.enabled, true);
  assert.equal(restored.welcome.channelId, '123456789012345678');
  assert.equal(restored.welcome.text, 'Yo {mention}');
  assert.equal(restored.welcome.style, 'text');
});

test('long text is trimmed to the Discord limit', () => {
  const config = normalizeConfig('g1', { welcome: { text: 'x'.repeat(5000) } });
  assert.equal(config.welcome.text.length, 1800);
});
