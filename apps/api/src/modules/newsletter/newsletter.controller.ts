import {
  Controller, Get, Post, Delete, Param, Body, UseGuards, HttpCode, HttpStatus,
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
  @ApiOperation({ summary: 'Lista list newslettera' })
  @ApiResponse({ status: 200, description: 'Listy newslettera' })
  getLists() { return this.newsletterService.getLists(); }

  @Post('lists')
  @ApiOperation({ summary: 'Utwórz listę' })
  @ApiResponse({ status: 201, description: 'Lista utworzona' })
  createList(@Body() dto: CreateNewsletterListDto) {
    return this.newsletterService.createList(dto);
  }

  @Delete('lists/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Usuń listę' })
  @ApiResponse({ status: 204, description: 'Lista usunięta' })
  deleteList(@Param('id') id: string) { return this.newsletterService.deleteList(id); }
}
