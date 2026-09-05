import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
  Req,
} from '@nestjs/common';
import { FastifyRequest } from 'fastify';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { SessionGuard } from '../../core/auth/session.guard';
import { PermissionGuard } from '../../core/rbac/rbac.guard';
import { RequirePermission, RequireSuperAdmin } from '../../core/rbac/require-permission.decorator';
import { UsersService } from './users.service';
import { IsEmail, IsString, MinLength, IsOptional } from 'class-validator';

class CreateUserDto {
  @IsEmail() email: string;
  @IsString() @MinLength(8) password: string;
}

class UpdateUserDto {
  @IsEmail() @IsOptional() email?: string;
  @IsString() @MinLength(8) @IsOptional() password?: string;
}

@ApiTags('users')
@ApiBearerAuth('session')
@Controller('users')
@UseGuards(SessionGuard, PermissionGuard)
@RequirePermission('settings', 'manage')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  @ApiOperation({ summary: 'List users' })
  @ApiResponse({ status: 200, description: 'User list' })
  findAll(@Req() req: FastifyRequest) {
    return this.users.findAll((req.session as { userId?: string }).userId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get user by ID' })
  @ApiResponse({ status: 200, description: 'User' })
  findOne(@Param('id') id: string) {
    return this.users.findById(id);
  }

  @Post()
  @ApiOperation({ summary: 'Create user' })
  @ApiResponse({ status: 201, description: 'User created' })
  create(@Body() dto: CreateUserDto) {
    return this.users.create(dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update user' })
  @ApiResponse({ status: 200, description: 'User updated' })
  update(@Param('id') id: string, @Body() dto: UpdateUserDto, @Req() req: FastifyRequest) {
    return this.users.update(id, dto, (req.session as { userId?: string }).userId);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete user' })
  @ApiResponse({ status: 204, description: 'User deleted' })
  delete(@Param('id') id: string, @Req() req: FastifyRequest) {
    return this.users.delete(id, (req.session as { userId?: string }).userId);
  }

  @Post(':id/roles/:roleId')
  @RequireSuperAdmin()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Assign role' })
  @ApiResponse({ status: 200, description: 'Role assigned' })
  assignRole(@Param('id') id: string, @Param('roleId') roleId: string) {
    return this.users.assignRole(id, roleId);
  }

  @Delete(':id/roles/:roleId')
  @RequireSuperAdmin()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Remove role' })
  @ApiResponse({ status: 200, description: 'Role removed' })
  removeRole(@Param('id') id: string, @Param('roleId') roleId: string) {
    return this.users.removeRole(id, roleId);
  }
}
