import { SlashCommandBuilder } from 'discord.js';
import { resolveGuard } from '#structures/guards';

export class CommandBuilder {
  constructor() {
    this._name = null;
    this._description = null;
    this._category = 'uncategorized';
    this._usage = null;
    this._guards = [];
    this._optionsFn = null;
    this._handler = null;
  }

  setName(name) {
    this._name = name;
    return this;
  }

  setDescription(description) {
    this._description = description;
    return this;
  }

  setCategory(category) {
    this._category = category;
    return this;
  }

  setUsage(usage) {
    this._usage = usage;
    return this;
  }

  setGuard(...guards) {
    this._guards.push(...guards.map(resolveGuard));
    return this;
  }

  setOptions(fn) {
    this._optionsFn = fn;
    return this;
  }

  setHandler(fn) {
    this._handler = fn;
    return this;
  }

  build() {
    if (!this._name || !this._description || !this._handler) {
      throw new Error('CommandBuilder requires at least a name, description, and handler.');
    }

    let builder = new SlashCommandBuilder().setName(this._name).setDescription(this._description);
    if (this._optionsFn) builder = this._optionsFn(builder) || builder;

    const guards = this._guards;
    const handler = this._handler;

    return {
      data: builder,
      meta: { category: this._category, usage: this._usage || `/${this._name}` },
      execute: async (interaction) => {
        for (const guard of guards) {
          await guard(interaction);
        }
        return handler(interaction);
      },
    };
  }
}
