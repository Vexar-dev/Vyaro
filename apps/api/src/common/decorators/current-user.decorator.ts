import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export interface AuthenticatedUser {
  id: bigint;
  publicId: string;
  username: string;
  roles: string[];
  permissions: string[];
}

/** Pulled from the request by JwtAuthGuard after verifying the access token. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthenticatedUser => {
    const request = ctx.switchToHttp().getRequest();
    return request.user;
  },
);
