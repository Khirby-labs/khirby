import {
  Controller,
  Get,
  Post,
  Patch,
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
import { ContactsService } from './contacts.service';
import { CreateContactDto } from './dto/create-contact.dto';
import { UpdateContactDto } from './dto/update-contact.dto';
import { ListContactsQueryDto } from './dto/list-contacts-query.dto';

@ApiTags('contacts')
@ApiBearerAuth('session')
@Controller('contacts')
@UseGuards(SessionGuard, PermissionGuard)
@RequirePermission('contacts', 'manage')
export class ContactsController {
  constructor(private contacts: ContactsService) {}

  @Get()
  @ApiOperation({ summary: 'List contacts (paginated)' })
  @ApiResponse({ status: 200, description: 'Contact list' })
  findAll(@Query() query: ListContactsQueryDto) {
    return this.contacts.findAll({
      page: query.page ?? 1,
      pageSize: query.pageSize ?? 20,
      search: query.search,
      sortBy: query.sortBy,
      sortDir: query.sortDir,
      hasPhone: query.hasPhone,
      formId: query.formId,
      newsletter: query.newsletter,
      createdFrom: query.createdFrom,
      createdTo: query.createdTo,
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get contact by ID' })
  @ApiResponse({ status: 200, description: 'Contact' })
  findOne(@Param('id') id: string) {
    return this.contacts.findById(id);
  }

  @Post()
  @ApiOperation({ summary: 'Create contact' })
  @ApiResponse({ status: 201, description: 'Contact created' })
  create(@Body() dto: CreateContactDto) {
    return this.contacts.create(dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update contact' })
  @ApiResponse({ status: 200, description: 'Contact updated' })
  update(@Param('id') id: string, @Body() dto: UpdateContactDto) {
    return this.contacts.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete contact' })
  @ApiResponse({ status: 204, description: 'Contact deleted' })
  delete(@Param('id') id: string) {
    return this.contacts.delete(id);
  }
}
