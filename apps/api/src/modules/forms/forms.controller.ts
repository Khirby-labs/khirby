import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  HttpCode,
  HttpStatus,
  UseGuards,
  Query,
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
  @ApiOperation({ summary: 'List forms' })
  @ApiResponse({ status: 200, description: 'Forms with submission counts' })
  findAll() {
    return this.forms.findAll();
  }

  @Get('stats')
  @ApiOperation({ summary: 'Submission stats' })
  @ApiResponse({ status: 200, description: 'Submission aggregates' })
  getStats(@Query() query: FormStatsQueryDto) {
    return this.stats.getStats(query);
  }

  @Get(':id/submissions')
  @ApiOperation({ summary: 'Form submissions' })
  @ApiResponse({ status: 200, description: 'Paginated submission list' })
  findSubmissions(@Param('id') id: string, @Query() query: ListFormSubmissionsQueryDto) {
    return this.forms.findSubmissionsByFormId(id, query.page, query.pageSize);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get form by ID' })
  @ApiResponse({ status: 200, description: 'Form' })
  findOne(@Param('id') id: string) {
    return this.forms.findById(id);
  }

  @Post()
  @ApiOperation({ summary: 'Create form' })
  @ApiResponse({ status: 201, description: 'Form created' })
  create(@Body() dto: CreateFormDto) {
    return this.forms.create(dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update form' })
  @ApiResponse({ status: 200, description: 'Form updated' })
  update(@Param('id') id: string, @Body() dto: UpdateFormDto) {
    return this.forms.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete form' })
  @ApiResponse({ status: 204, description: 'Form deleted' })
  delete(@Param('id') id: string) {
    return this.forms.delete(id);
  }
}
