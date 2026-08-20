import { Test, TestingModule } from '@nestjs/testing';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { THROTTLER_SKIP } from '@nestjs/throttler/dist/throttler.constants';
import { AgentChatController } from './agent-chat.controller';
import { AgentChatService } from './agent-chat.service';
import { SessionGuard } from '../../core/auth/session.guard';
import { PermissionGuard } from '../../core/rbac/rbac.guard';
import { PERMISSION_KEY } from '../../core/rbac/require-permission.decorator';

describe('AgentChatController', () => {
  let moduleRef: TestingModule;

  beforeEach(async () => {
    moduleRef = await Test.createTestingModule({
      controllers: [AgentChatController],
      providers: [{ provide: AgentChatService, useValue: { runAgentLoop: jest.fn() } }],
    })
      .overrideGuard(SessionGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(PermissionGuard)
      .useValue({ canActivate: () => true })
      .compile();
  });

  afterEach(async () => {
    await moduleRef?.close();
  });

  it('applies SessionGuard first, then PermissionGuard', () => {
    const guards = Reflect.getMetadata(GUARDS_METADATA, AgentChatController) ?? [];
    expect(guards[0]).toBe(SessionGuard);
    expect(guards).toContain(PermissionGuard);
  });

  it('requires agent:use', () => {
    const perm = Reflect.getMetadata(PERMISSION_KEY, AgentChatController);
    expect(perm).toEqual({ resource: 'agent', action: 'use' });
  });

  it('does not skip throttling', () => {
    const skip = Reflect.getMetadata(THROTTLER_SKIP, AgentChatController.prototype.chat);
    expect(skip).toBeUndefined();
  });
});
