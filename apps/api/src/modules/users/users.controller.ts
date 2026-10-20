import { Body, Controller, Delete, Get, Param, Patch } from '@nestjs/common';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { UsersService } from './users.service';
import { ChangeUsernameDto, UpdateProfileDto } from './dto/users.dto';

@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  // NOTE: every route below reads the target user from the verified JWT (@CurrentUser),
  // never from a client-supplied :id — this is what prevents IDOR on "my" resources.

  @Get('me')
  getMe(@CurrentUser() user: AuthenticatedUser) {
    return this.users.getMyProfile(user.publicId);
  }

  @Patch('me')
  updateMe(@CurrentUser() user: AuthenticatedUser, @Body() dto: UpdateProfileDto) {
    return this.users.updateMyProfile(user.publicId, dto);
  }

  @Patch('me/username')
  changeUsername(@CurrentUser() user: AuthenticatedUser, @Body() dto: ChangeUsernameDto) {
    return this.users.changeUsername(user.publicId, dto.newUsername, dto.reason);
  }

  @Get('me/sessions')
  listSessions(@CurrentUser() user: AuthenticatedUser) {
    return this.users.listMySessions(user.publicId);
  }

  @Delete('me/sessions/:sessionPublicId')
  revokeSession(@CurrentUser() user: AuthenticatedUser, @Param('sessionPublicId') sessionPublicId: string) {
    return this.users.revokeMySession(user.publicId, sessionPublicId);
  }

  // Public, minimal lookup — used by the transfer flow to show the recipient's name
  // before confirmation (Phase 4). Deliberately returns nothing sensitive.
  @Get('username/:username')
  findByUsername(@Param('username') username: string) {
    return this.users.findPublicByUsername(username);
  }
}
