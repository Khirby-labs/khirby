import {
  Controller, Get, Post, Patch, Delete,
  Param, Body, HttpCode, HttpStatus, UseGuards, Query,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { SessionGuard } from '../../core/auth/session.guard';
import { PermissionGuard } from '../../core/rbac/rbac.guard';
import { RequirePermission } from '../../core/rbac/require-permission.decorator';
import { FormsService } from './forms.service';
import { FormsStatsService } from './forms-stats.service';
import { CreateFormDto } from './dto/create-form.dto';
import { UpdateFormDto } from './dto/update-form.dto';
import { FormStatsQueryDto } from './dto/form-stats-query.dto';
import { ListFormSubmissionsQueryDto } from './dto/list-form-submissions-query.dto';

@ApiTags('forms')
@ApiBearerAuth('session')
@Controller('forms')
@UseGuards(SessionGuard, PermissionGuard)
@RequirePermission('forms', 'manage')
export class FormsController {
  constructor(
    private forms: FormsService,
    private stats: FormsStatsService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Lista formularzy' })
  @ApiResponse({ status: 200, description: 'Lista formularzy z liczbą zgłoszeń' })
  findAll() { return this.forms.findAll(); }

  @Get('stats')
  @ApiOperation({ summary: 'Statystyki zgłoszeń' })
  @ApiResponse({ status: 200, description: 'Agregaty zgłoszeń' })
  getStats(@Query() query: FormStatsQueryDto) {
    return this.stats.getStats(query);
  }

  @Get(':id/submissions')
  @ApiOperation({ summary: 'Zgłoszenia formularza' })
  @ApiResponse({ status: 200, description: 'Paginowana lista zgłoszeń' })
  findSubmissions(
    @Param('id') id: string,
    @Query() query: ListFormSubmissionsQueryDto,
  ) {
    return this.forms.findSubmissionsByFormId(id, query.page, query.pageSize);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Formularz po ID' })
  @ApiResponse({ status: 200, description: 'Formularz' })
  findOne(@Param('id') id: string) { return this.forms.findById(id); }

  @Post()
  @ApiOperation({ summary: 'Utwórz formularz' })
  @ApiResponse({ status: 201, description: 'Formularz utworzony' })
  create(@Body() dto: CreateFormDto) { return this.forms.create(dto); }

  @Patch(':id')
  @ApiOperation({ summary: 'Zaktualizuj' })
  @ApiResponse({ status: 200, description: 'Zaktualizowano' })
  update(@Param('id') id: string, @Body() dto: UpdateFormDto) { return this.forms.update(id, dto); }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Usuń' })
  @ApiResponse({ status: 204, description: 'Usunięto' })
  delete(@Param('id') id: string) { return this.forms.delete(id); }
}
