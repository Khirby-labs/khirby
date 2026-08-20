import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Put,
  Param,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { SessionGuard } from '../../core/auth/session.guard';
import { PermissionGuard } from '../../core/rbac/rbac.guard';
import { RequirePermission, RequireSuperAdmin } from '../../core/rbac/require-permission.decorator';
import { RolesService } from './roles.service';
import { CreateRoleDto, UpdateRoleDto, SetPermissionsDto } from './dto/role.dto';
// Relative import (like permission-catalog): type-only, so erased by tsc; a bare
// '@khirby/types' specifier would otherwise survive nest build into dist.
import type { Role, RolePermission } from '../../../../../packages/types/src';

@ApiTags('roles')
@ApiBearerAuth('session')
@Controller('roles')
@UseGuards(SessionGuard, PermissionGuard)
@RequirePermission('roles', 'manage')
export class RolesController {
  constructor(private readonly rolesService: RolesService) {}

  @Get()
  @ApiOperation({ summary: 'List roles' })
  @ApiResponse({ status: 200, description: 'Role list' })
  findAll(): Promise<Role[]> {
    return this.rolesService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get role by ID' })
  @ApiResponse({ status: 200, description: 'Role' })
  findById(@Param('id') id: string): Promise<Role> {
    return this.rolesService.findById(id);
  }

  @Post()
  @RequireSuperAdmin()
  @ApiOperation({ summary: 'Create role' })
  @ApiResponse({ status: 201, description: 'Role created' })
  create(@Body() dto: CreateRoleDto): Promise<Role> {
    return this.rolesService.create(dto);
  }

  @Patch(':id')
  @RequireSuperAdmin()
  @ApiOperation({ summary: 'Update role' })
  @ApiResponse({ status: 200, description: 'Role updated' })
  update(@Param('id') id: string, @Body() dto: UpdateRoleDto): Promise<Role> {
    return this.rolesService.update(id, dto);
  }

  @Delete(':id')
  @RequireSuperAdmin()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete role' })
  @ApiResponse({ status: 204, description: 'Role deleted' })
  delete(@Param('id') id: string) {
    return this.rolesService.delete(id);
  }

  @Put(':id/permissions')
  @RequireSuperAdmin()
  @ApiOperation({ summary: 'Set role permissions' })
  @ApiResponse({ status: 200, description: 'Permissions set' })
  setPermissions(
    @Param('id') id: string,
    @Body() body: SetPermissionsDto,
  ): Promise<RolePermission[]> {
    return this.rolesService.setPermissions(id, body.permissions);
  }

  @Post(':id/users/:userId')
  @RequireSuperAdmin()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Assign role to user' })
  @ApiResponse({ status: 204, description: 'Assigned' })
  assignToUser(@Param('id') roleId: string, @Param('userId') userId: string) {
    return this.rolesService.assignToUser(userId, roleId);
  }

  @Delete(':id/users/:userId')
  @RequireSuperAdmin()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove role from user' })
  @ApiResponse({ status: 204, description: 'Removed' })
  removeFromUser(@Param('id') roleId: string, @Param('userId') userId: string) {
    return this.rolesService.removeFromUser(userId, roleId);
  }
}
