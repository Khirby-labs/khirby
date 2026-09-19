import { mkdirSync, mkdtempSync, writeFileSync, symlinkSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import { loadVolumeNestModuleFile } from '../../../../../packages/plugin-host/src/volume-nest';
import { findRepoRoot } from './instance-plugins.loader';

/**
 * Regression: volume plugins load Nest via ts-node. Without
 * `useDefineForClassFields: false`, class-validator DTO property decorators
 * throw "Decorating class property failed" at ValidationPipe — which is what
 * made Listmonk campaign preview / subscriber lookup return 500.
 */
describe('volume nest class-validator DTOs', () => {
  it('ValidationPipe can instantiate a DTO compiled by volume ts-node', async () => {
    const root = mkdtempSync(join(tmpdir(), 'volume-nest-dto-'));
    const pkg = join(root, 'crm-plugin-dto-probe');
    mkdirSync(join(pkg, 'src'), { recursive: true });

    const repoRoot = findRepoRoot(join(__dirname, '..'));
    if (repoRoot) {
      symlinkSync(join(repoRoot, 'apps/api/node_modules'), join(root, 'node_modules'));
    }

    writeFileSync(
      join(pkg, 'package.json'),
      JSON.stringify({
        name: 'crm-plugin-dto-probe',
        version: '0.0.1',
        main: './src/index.ts',
      }),
    );

    // DTO lives in a sibling file so we can require it after ts-node is armed
    // by loadVolumeNestModuleFile (same path Listmonk controllers take).
    writeFileSync(
      join(pkg, 'src', 'preview.dto.ts'),
      `
import { IsInt, IsString } from 'class-validator';

export class PreviewDto {
  @IsInt()
  templateId: number;

  @IsString()
  body: string;
}
`,
    );

    writeFileSync(
      join(pkg, 'src', 'nest-module.ts'),
      `
import { Module } from '@nestjs/common';
import './preview.dto';

@Module({})
export class PluginNestModule {}
`,
    );

    loadVolumeNestModuleFile(join(pkg, 'src', 'nest-module.ts'));

    const req = createRequire(join(pkg, 'package.json'));
    const { PreviewDto } = req(join(pkg, 'src', 'preview.dto.ts')) as {
      PreviewDto: new () => { templateId: number; body: string };
    };

    const pipe = new ValidationPipe({ transform: true, whitelist: true });
    const result = await pipe.transform(
      { templateId: 3, body: '<p>hi</p>', evil: 'drop-me' },
      { type: 'body', metatype: PreviewDto },
    );

    expect(result).toEqual({ templateId: 3, body: '<p>hi</p>' });
    expect((result as { evil?: unknown }).evil).toBeUndefined();
  });
});
