/**
 * Renders every auto-role screen for real and asserts the payload is valid.
 *
 * The `/autorole` crash was a ReferenceError inside menuEmbed() that unit tests
 * on pure logic never touched, because the module imported fine and the error
 * only surfaced when the embed was actually built. These tests call the render
 * functions directly, so any missing import or bad reference fails here.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { FEATURES, FEATURE_META, emptyConfig } from '../src/services/autoRoles/logic.js';
import {
  renderFeature,
  renderMenu,
  renderResetConfirm,
  renderResetPicker,
} from '../src/services/autoRoles/service.js';

const TOKEN = /<a?:[a-z0-9_]+:\d{5,25}>/g;

function configured() {
  const config = emptyConfig('guild-1');
  config.join.enabled = true;
  config.join.roleIds = ['111111111111111111'];
  config.timed.enabled = true;
  config.timed.days = 7;
  config.timed.roleIds = ['222222222222222222', '333333333333333333'];
  config.invite.enabled = true;
  config.invite.count = 10;
  config.invite.roleIds = ['444444444444444444'];
  config.activity.enabled = true;
  config.activity.messages = 5;
  config.activity.days = 7;
  config.activity.roleIds = ['555555555555555555'];
  config.dmNotification = true;
  config.__roleNames = {
    111111111111111111: 'Member',
    222222222222222222: 'Regular',
    333333333333333333: 'Loyal',
    444444444444444444: 'Recruiter',
    555555555555555555: 'Chatter',
  };
  return config;
}

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
      plain(row).components.map((data) => ({
        label: data.label ?? '',
        customId: data.custom_id ?? '',
        emoji: data.emoji?.id ?? null,
      }))
    ),
    selects: payload.components.flatMap((row) =>
      plain(row)
        .components.filter((data) => Array.isArray(data.options))
        .map((data) => data.options.map((option) => option.value))
    ),
  };
}

test('menu renders with every rule named and described', () => {
  const view = describe(renderMenu(configured()));

  assert.match(view.title, /Auto Roles/);
  for (const feature of FEATURES) {
    assert.ok(
      view.description.includes(FEATURE_META[feature].label),
      `menu is missing the label for ${feature}`
    );
    assert.ok(
      view.description.includes(FEATURE_META[feature].description),
      `menu is missing the description for ${feature}`
    );
  }
  assert.equal(view.buttons.length, 6);
});

test('menu renders on an empty config without throwing', () => {
  const view = describe(renderMenu(emptyConfig('guild-1')));
  assert.match(view.description, /Off/);
  assert.ok(view.buttons.length >= 6);
});

test('every feature screen renders with its own settings and buttons', () => {
  for (const feature of FEATURES) {
    const view = describe(renderFeature(configured(), feature));
    assert.ok(view.title.includes(FEATURE_META[feature].label), `bad title for ${feature}`);
    assert.match(view.description, /Roles to give/);
    assert.ok(view.buttons.length >= 4, `${feature} should offer at least 4 actions`);
    for (const button of view.buttons) {
      assert.ok(button.label, `a button on ${feature} has no label`);
      assert.ok(button.customId, `a button on ${feature} has no custom id`);
    }
  }
});

test('feature screens render with no roles picked yet', () => {
  const config = emptyConfig('guild-1');
  for (const feature of FEATURES) {
    const view = describe(renderFeature(config, feature));
    assert.match(view.description, /None yet/);
  }
});

test('reset picker lists every resettable rule as a select option', () => {
  const view = describe(renderResetPicker(configured()));
  assert.match(view.title, /Reset Settings/);
  assert.equal(view.selects.length, 1);
  assert.deepEqual(view.selects[0], ['join', 'timed', 'invite', 'activity', 'dmNotification']);
});

test('reset confirm names the rules and asks twice', () => {
  const view = describe(renderResetConfirm(configured(), ['timed', 'invite']));
  assert.match(view.title, /Are You Sure/);
  assert.match(view.description, /cannot be undone/);
  assert.match(view.description, /Tenure Role/);
  assert.match(view.description, /Invite Reward/);
  assert.equal(view.buttons.length, 2);
});

test('rendered text never contains a broken emoji token', () => {
  const screens = [
    renderMenu(configured()),
    ...FEATURES.map((feature) => renderFeature(configured(), feature)),
    renderResetPicker(configured()),
    renderResetConfirm(configured(), ['join']),
  ];

  for (const payload of screens) {
    const text = JSON.stringify(payload);
    assert.equal((text.match(/<a?::\d+>/g) ?? []).length, 0, 'found an emoji token with no name');
    const tokens = text.match(TOKEN) ?? [];
    assert.ok(tokens.length > 0, 'screen rendered with no custom emoji at all');
  }
});

test('status text is plain language, never abbreviated', () => {
  const view = describe(renderMenu(configured()));
  assert.doesNotMatch(view.description, /role\(s\)|msg \/|Enabled|Disabled/);
  assert.match(view.description, /messages/);
});
