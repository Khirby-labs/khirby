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
  @ApiOperation({ summary: 'Lista kontaktów (stronicowana)' })
  @ApiResponse({ status: 200, description: 'Lista kontaktów' })
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
  @ApiOperation({ summary: 'Pobierz kontakt po ID' })
  @ApiResponse({ status: 200, description: 'Kontakt' })
  findOne(@Param('id') id: string) {
    return this.contacts.findById(id);
  }

  @Post()
  @ApiOperation({ summary: 'Utwórz kontakt' })
  @ApiResponse({ status: 201, description: 'Kontakt utworzony' })
  create(@Body() dto: CreateContactDto) {
    return this.contacts.create(dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Zaktualizuj kontakt' })
  @ApiResponse({ status: 200, description: 'Kontakt zaktualizowany' })
  update(@Param('id') id: string, @Body() dto: UpdateContactDto) {
    return this.contacts.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Usuń kontakt' })
  @ApiResponse({ status: 204, description: 'Kontakt usunięty' })
  delete(@Param('id') id: string) {
    return this.contacts.delete(id);
  }
}
