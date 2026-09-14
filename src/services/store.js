import { db } from '#database/index';
import { createAutoRoleRepository } from '#database/repositories/autoRoleRepository';
import { createMemberRepository } from '#database/repositories/memberRepository';
import { createPanelRepository } from '#database/repositories/panelRepository';
import { createVoiceRepository } from '#database/repositories/voiceRepository';

export const panelStore = createPanelRepository(db);
export const autoRoleStore = createAutoRoleRepository(db);
export const memberStore = createMemberRepository(db);
export const voiceStore = createVoiceRepository(db);
