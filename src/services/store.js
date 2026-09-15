import { db } from '#database/index';
import { createAutoModRepository } from '#database/repositories/autoModRepository';
import { createAutoRoleRepository } from '#database/repositories/autoRoleRepository';
import { createGreetingRepository } from '#database/repositories/greetingRepository';
import { createMemberRepository } from '#database/repositories/memberRepository';
import { createPanelRepository } from '#database/repositories/panelRepository';
import { createVoiceRepository } from '#database/repositories/voiceRepository';

export const panelStore = createPanelRepository(db);
export const autoRoleStore = createAutoRoleRepository(db);
export const autoModStore = createAutoModRepository(db);
export const greetingStore = createGreetingRepository(db);
export const memberStore = createMemberRepository(db);
export const voiceStore = createVoiceRepository(db);
