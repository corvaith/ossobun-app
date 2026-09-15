/**
 * Renders every AutoMod and Greetings screen for real and asserts the payload is
 * valid. Logic tests cannot catch a missing import or a bad reference inside a
 * render function, so each screen is built here exactly as Discord would.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { ICONS } from '../src/config/emojis.js';
import { RULES, RULE_META, emptyConfig as emptyAutoMod } from '../src/services/automod/logic.js';
import {
  renderActions,
  renderMenu as renderAutoModMenu,
  renderResetConfirm as renderAutoModReset,
  renderIgnore,
  renderLogPicker,
  renderRule,
} from '../src/services/automod/service.js';
import {
  KINDS,
  KIND_META,
  emptyConfig as emptyGreetings,
} from '../src/services/greetings/logic.js';
import {
  renderChannelPicker,
  renderMenu as renderGreetingMenu,
  renderResetConfirm as renderGreetingReset,
  renderKind,
  renderPlaceholders,
} from '../src/services/greetings/service.js';

const TOKEN = /<a?:[a-z0-9_]+:\d{5,25}>/g;

function plain(component) {
  return typeof component.toJSON === 'function'
    ? component.toJSON()
    : (component.data ?? component);
}

function describe(payload) {
  const embed = plain(payload.embeds[0]);
  return {
    title: embed.title ?? '',
    description: embed.description ?? '',
    buttons: payload.components.flatMap((row) =>
      plain(row)
        .components.filter((data) => data.label !== undefined)
        .map((data) => ({
          label: data.label ?? '',
          customId: data.custom_id ?? '',
          emoji: data.emoji?.id ?? null,
          disabled: Boolean(data.disabled),
        }))
    ),
    selects: payload.components.flatMap((row) =>
      plain(row)
        .components.filter((data) => Array.isArray(data.options))
        .map((data) => data.options.map((option) => option.value))
    ),
  };
}

function autoModOn() {
  const config = emptyAutoMod('g1');
  config.logChannelId = '123456789012345678';
  for (const rule of RULES) {
    config[rule].enabled = true;
    config[rule].actions = ['delete', 'warn', 'timeout'];
  }
  return config;
}

function greetingsOn() {
  const config = emptyGreetings('g1');
  for (const kind of KINDS) {
    config[kind].enabled = true;
    config[kind].channelId = '123456789012345678';
  }
  config.dm.style = 'text';
  return config;
}

test('automod menu renders every rule with label, description and status', () => {
  const view = describe(renderAutoModMenu(autoModOn()));

  assert.match(view.title, /AutoMod/);
  for (const rule of RULES) {
    assert.ok(view.description.includes(RULE_META[rule].label), `missing label for ${rule}`);
    assert.ok(view.description.includes(RULE_META[rule].description), `missing text for ${rule}`);
  }
  assert.equal(view.selects.length, 1);
  assert.deepEqual(view.selects[0], RULES);
  assert.ok(view.buttons.length >= 3);
});

test('automod menu renders on an empty config without throwing', () => {
  const view = describe(renderAutoModMenu(emptyAutoMod('g1')));
  assert.match(view.description, /Off/);
  assert.match(view.description, /not set/);
  for (const button of view.buttons) {
    assert.ok(button.label, 'a menu button has no label');
    assert.ok(button.customId, 'a menu button has no custom id');
  }
});

test('every automod rule screen renders with its own settings', () => {
  for (const rule of RULES) {
    const view = describe(renderRule(autoModOn(), rule));
    assert.ok(view.title.includes(RULE_META[rule].label), `bad title for ${rule}`);
    assert.match(view.description, /Status/);
    assert.match(view.description, /What happens/);
    assert.ok(view.buttons.length >= 4, `${rule} should offer at least 4 actions`);
    for (const button of view.buttons) {
      assert.ok(button.label, `a button on ${rule} has no label`);
      assert.ok(button.customId, `a button on ${rule} has no custom id`);
    }
    // Only the invite rule has nothing to tune.
    const limits = view.buttons.find((button) => button.label === 'Set limits');
    assert.equal(limits.disabled, rule === 'invites', `wrong limits state for ${rule}`);
  }
});

test('every automod rule screen renders when the rule is off', () => {
  const config = emptyAutoMod('g1');
  for (const rule of RULES) {
    const view = describe(renderRule(config, rule));
    assert.match(view.description, /Off/);
    assert.match(view.description, /Delete message/);
  }
});

test('automod punishment, log and ignore screens render', () => {
  const config = autoModOn();

  const actions = describe(renderActions(config, 'spam'));
  assert.match(actions.title, /Punishment/);
  assert.equal(actions.selects.length, 1);
  assert.deepEqual(actions.selects[0], ['delete', 'warn', 'timeout', 'kick', 'ban']);
  assert.match(actions.description, /then/);

  const log = describe(renderLogPicker(config));
  assert.match(log.description, /123456789012345678/);

  const ignore = describe(renderIgnore(config));
  assert.match(ignore.title, /Ignored/);
  assert.match(ignore.description, /none/);
});

test('automod reset screen lists what will change', () => {
  const view = describe(renderAutoModReset(autoModOn()));
  assert.match(view.title, /Reset AutoMod/);
  assert.match(view.description, /cannot be undone/);
  assert.match(view.description, /Message Spam/);
  assert.equal(view.buttons.length, 2);
});

test('greetings menu renders every kind with label, description and status', () => {
  const view = describe(renderGreetingMenu(greetingsOn()));

  assert.match(view.title, /Greetings/);
  for (const kind of KINDS) {
    assert.ok(view.description.includes(KIND_META[kind].label), `missing label for ${kind}`);
    assert.ok(view.description.includes(KIND_META[kind].description), `missing text for ${kind}`);
  }
  assert.deepEqual(view.selects[0], KINDS);
});

test('greetings menu renders on an empty config without throwing', () => {
  const view = describe(renderGreetingMenu(emptyGreetings('g1')));
  assert.match(view.description, /Off/);
  assert.match(view.description, /Nothing is active/);
});

test('every greeting screen renders with its own controls', () => {
  for (const kind of KINDS) {
    const view = describe(renderKind(greetingsOn(), kind));
    assert.ok(view.title.includes(KIND_META[kind].label), `bad title for ${kind}`);
    assert.match(view.description, /Status/);
    assert.match(view.description, /Style/);
    assert.match(view.description, /Message/);
    for (const button of view.buttons) {
      assert.ok(button.label, `a button on ${kind} has no label`);
      assert.ok(button.customId, `a button on ${kind} has no custom id`);
    }
    // The join DM has no channel to pick.
    const channel = view.buttons.find((button) => button.label === 'Pick channel');
    assert.equal(channel.disabled, !KIND_META[kind].channel, `wrong channel state for ${kind}`);
  }
});

test('every greeting screen renders when off', () => {
  const config = emptyGreetings('g1');
  for (const kind of KINDS) {
    const view = describe(renderKind(config, kind));
    assert.match(view.description, /Off/);
    // Only channel-based greetings can be missing a channel.
    if (KIND_META[kind].channel) {
      assert.match(view.description, /not picked yet/);
    }
  }
});

test('greeting placeholder, channel and reset screens render', () => {
  for (const kind of KINDS) {
    const placeholders = describe(renderPlaceholders(kind));
    assert.match(placeholders.title, /Variables/);
    assert.match(placeholders.description, /\{mention\}/);

    const channel = describe(renderChannelPicker(greetingsOn(), kind));
    assert.match(channel.title, /Channel for/);
    assert.match(channel.description, /123456789012345678/);
  }

  const reset = describe(renderGreetingReset(greetingsOn()));
  assert.match(reset.title, /Reset Greetings/);
  assert.match(reset.description, /cannot be undone/);
  assert.equal(reset.buttons.length, 2);
});

test('no screen renders a broken emoji token', () => {
  const automod = autoModOn();
  const greetings = greetingsOn();

  const screens = [
    renderAutoModMenu(automod),
    ...RULES.map((rule) => renderRule(automod, rule)),
    renderActions(automod, 'spam'),
    renderLogPicker(automod),
    renderIgnore(automod),
    renderAutoModReset(automod),
    renderGreetingMenu(greetings),
    ...KINDS.map((kind) => renderKind(greetings, kind)),
    ...KINDS.map((kind) => renderChannelPicker(greetings, kind)),
    renderGreetingReset(greetings),
  ];

  for (const payload of screens) {
    const text = JSON.stringify(payload);
    assert.equal((text.match(/<a?::\d+>/g) ?? []).length, 0, 'broken emoji token');
    assert.ok((text.match(TOKEN) ?? []).length > 0, 'screen has no custom emoji at all');
  }
});

test('no preview screen leaks an unrendered placeholder', () => {
  const greetings = greetingsOn();
  const screens = [
    renderGreetingMenu(greetings),
    ...KINDS.map((kind) => renderKind(greetings, kind)),
    ...KINDS.map((kind) => renderChannelPicker(greetings, kind)),
    renderGreetingReset(greetings),
  ];

  for (const payload of screens) {
    const text = JSON.stringify(payload);
    assert.doesNotMatch(text, /\{(user|mention|server|count|id)\}/, 'unrendered placeholder');
  }

  // The variables screen is the one place tokens are supposed to appear.
  const help = JSON.stringify(renderPlaceholders('welcome'));
  assert.match(help, /\{mention\}/);
});

test('every rule and greeting icon exists in the emoji config', () => {
  for (const rule of RULES) {
    assert.ok(
      ICONS[RULE_META[rule].icon],
      `rule ${rule} points at emoji alias "${RULE_META[rule].icon}" which does not exist`
    );
  }
  for (const kind of KINDS) {
    assert.ok(
      ICONS[KIND_META[kind].icon],
      `greeting ${kind} points at emoji alias "${KIND_META[kind].icon}" which does not exist`
    );
  }
});

test('icons inside one list are visually distinct', () => {
  // Two rules sharing an icon makes the menu harder to scan, and it usually
  // means an alias was picked for its name rather than what it renders.
  const ruleIcons = RULES.map((rule) => ICONS[RULE_META[rule].icon]);
  assert.equal(new Set(ruleIcons).size, ruleIcons.length, 'two automod rules share an icon');

  const kindIcons = KINDS.map((kind) => ICONS[KIND_META[kind].icon]);
  assert.equal(new Set(kindIcons).size, kindIcons.length, 'two greetings share an icon');
});

test('screens read as plain language, no shorthand', () => {
  const automod = describe(renderAutoModMenu(autoModOn()));
  assert.doesNotMatch(automod.description, /\bmsg\b|\bsec\b|undefined|NaN/);
  assert.match(automod.description, /seconds/);

  const greetings = describe(renderGreetingMenu(greetingsOn()));
  assert.doesNotMatch(greetings.description, /undefined|NaN|role\(s\)/);
});
