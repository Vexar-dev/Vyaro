import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSIONS_KEY, ROLES_KEY } from '../decorators/roles.decorator';
import type { AuthenticatedUser } from '../decorators/current-user.decorator';

/**
 * Enforces @Roles(...) and @RequirePermissions(...) metadata server-side.
 * Hiding an admin button in the frontend is NOT authorization — this guard is
 * the actual boundary and runs on every protected admin/support endpoint.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    const requiredPermissions = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles?.length && !requiredPermissions?.length) return true;

    const request = context.switchToHttp().getRequest();
    const user: AuthenticatedUser | undefined = request.user;
    if (!user) {
      throw new ForbiddenException({ code: 'FORBIDDEN', message: 'غير مصرح' });
    }

    if (requiredRoles?.length && !requiredRoles.some((r) => user.roles.includes(r))) {
      throw new ForbiddenException({ code: 'FORBIDDEN', message: 'غير مصرح بهذا الإجراء' });
    }

    // Permission checks are resolved against the user's effective permission set,
    // which is attached to the request by JwtStrategy from role→permission joins.
    if (requiredPermissions?.length) {
      const userPermissions: string[] = (request.user as any).permissions ?? [];
      const hasAll = requiredPermissions.every((p) => userPermissions.includes(p));
      if (!hasAll) {
        throw new ForbiddenException({ code: 'FORBIDDEN', message: 'غير مصرح بهذا الإجراء' });
      }
    }

    return true;
  }
}
