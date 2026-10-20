import { Test } from '@nestjs/testing';
import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from '../../src/common/guards/roles.guard';
import { ROLES_KEY, PERMISSIONS_KEY } from '../../src/common/decorators/roles.decorator';

function makeContext(user: any): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
    getHandler: () => ({}),
    getClass: () => ({}),
  } as unknown as ExecutionContext;
}

describe('RolesGuard (server-side RBAC enforcement)', () => {
  let reflector: Reflector;
  let guard: RolesGuard;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [RolesGuard, Reflector],
    }).compile();
    guard = moduleRef.get(RolesGuard);
    reflector = moduleRef.get(Reflector);
  });

  it('allows access when no @Roles/@RequirePermissions metadata is present', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);
    expect(guard.canActivate(makeContext({ roles: ['USER'] }))).toBe(true);
  });

  it('denies a USER hitting an @Roles(ADMIN) endpoint', () => {
    jest
      .spyOn(reflector, 'getAllAndOverride')
      .mockImplementation((key: any) => (key === ROLES_KEY ? ['ADMIN'] : undefined));
    expect(() => guard.canActivate(makeContext({ roles: ['USER'], permissions: [] }))).toThrow(
      ForbiddenException,
    );
  });

  it('allows an ADMIN hitting an @Roles(ADMIN) endpoint', () => {
    jest
      .spyOn(reflector, 'getAllAndOverride')
      .mockImplementation((key: any) => (key === ROLES_KEY ? ['ADMIN'] : undefined));
    expect(guard.canActivate(makeContext({ roles: ['ADMIN'], permissions: [] }))).toBe(true);
  });

  it('denies when a required permission is missing, even with the right role', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockImplementation((key: any) => {
      if (key === ROLES_KEY) return ['ADMIN'];
      if (key === PERMISSIONS_KEY) return ['providers.manage'];
      return undefined;
    });
    expect(() =>
      guard.canActivate(makeContext({ roles: ['ADMIN'], permissions: ['users.view'] })),
    ).toThrow(ForbiddenException);
  });

  it('rejects an unauthenticated request when roles are required', () => {
    jest
      .spyOn(reflector, 'getAllAndOverride')
      .mockImplementation((key: any) => (key === ROLES_KEY ? ['ADMIN'] : undefined));
    expect(() => guard.canActivate(makeContext(undefined))).toThrow(ForbiddenException);
  });
});
