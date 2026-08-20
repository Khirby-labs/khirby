import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { IsString, IsNotEmpty } from 'class-validator';
import { SessionGuard } from '../../core/auth/session.guard';
import { PermissionGuard } from '../../core/rbac/rbac.guard';
import { RequirePermission } from '../../core/rbac/require-permission.decorator';
import { NewsletterService } from './newsletter.service';

class CreateNewsletterListDto {
  @IsString()
  @IsNotEmpty()
  listmonkListId: string;

  @IsString()
  @IsNotEmpty()
  name: string;
}

@ApiTags('newsletter')
@ApiBearerAuth('session')
@Controller('newsletter')
@UseGuards(SessionGuard, PermissionGuard)
@RequirePermission('newsletter', 'manage')
export class NewsletterController {
  constructor(private readonly newsletterService: NewsletterService) {}

  @Get('lists')
  @ApiOperation({ summary: 'List newsletter lists' })
  @ApiResponse({ status: 200, description: 'Newsletter lists' })
  getLists() {
    return this.newsletterService.getLists();
  }

  @Post('lists')
  @ApiOperation({ summary: 'Create list' })
  @ApiResponse({ status: 201, description: 'List created' })
  createList(@Body() dto: CreateNewsletterListDto) {
    return this.newsletterService.createList(dto);
  }

  @Delete('lists/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete list' })
  @ApiResponse({ status: 204, description: 'List deleted' })
  deleteList(@Param('id') id: string) {
    return this.newsletterService.deleteList(id);
  }
}
