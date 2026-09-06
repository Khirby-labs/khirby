import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Query,
  Body,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { SessionGuard } from '../../core/auth/session.guard';
import { PermissionGuard } from '../../core/rbac/rbac.guard';
import { RequirePermission } from '../../core/rbac/require-permission.decorator';
import { CustomFieldsService } from './custom-fields.service';
import { CreateCustomFieldDto } from './dto/create-custom-field.dto';
import { ListCustomFieldsQueryDto } from './dto/list-custom-fields-query.dto';

@ApiTags('custom-fields')
@ApiBearerAuth('session')
@Controller('custom-fields')
@UseGuards(SessionGuard, PermissionGuard)
@RequirePermission('contacts', 'manage')
export class CustomFieldsController {
  constructor(private customFields: CustomFieldsService) {}

  @Get()
  @ApiOperation({ summary: 'List custom field definitions' })
  @ApiResponse({ status: 200, description: 'Definition list' })
  findAll(@Query() query: ListCustomFieldsQueryDto) {
    return this.customFields.list(query.entity);
  }

  @Post()
  @ApiOperation({ summary: 'Create a custom field definition' })
  @ApiResponse({ status: 201, description: 'Definition created' })
  create(@Body() dto: CreateCustomFieldDto) {
    return this.customFields.create(dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a custom field definition' })
  @ApiResponse({ status: 204, description: 'Definition deleted' })
  delete(@Param('id') id: string) {
    return this.customFields.delete(id);
  }
}
