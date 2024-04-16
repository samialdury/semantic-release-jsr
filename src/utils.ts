import {
    NormalizedPluginConfig,
    PluginConfig,
    PublishResponse,
    PublishResponseContext
} from './types.ts';
import { publish as jsrPublish } from 'jsr';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { VerifyReleaseContext, VerifyConditionsContext } from 'semantic-release';
import { mkdtempSync } from 'fs';

export async function parseConfig (config: PluginConfig): Promise<NormalizedPluginConfig> {
    const cwd = config.cwd || process.cwd();

    let pkgJsonPath: string | null = config.pkgJsonPath || join(cwd, 'package.json');
    if (!config.pkgJsonPath && !existsSync(pkgJsonPath)) {
        pkgJsonPath = null;
    }

    let name: string | undefined;
    const versionJsonPaths: string[] = [];
    const jsrJsonPath = join(cwd, 'jsr.json');
    const denoJsonPath = join(cwd, 'deno.json');
    if (existsSync(jsrJsonPath)) {
        versionJsonPaths.push(jsrJsonPath);
    }
    if (existsSync(denoJsonPath)) {
        versionJsonPaths.push(denoJsonPath);
    }
    if (pkgJsonPath) {
        versionJsonPaths.push(pkgJsonPath);
    }

    for(const path of versionJsonPaths) {
        const content = await readFile(path, 'utf8');
        const json = JSON.parse(content);
        if (!name && json.name) {
            name = json.name;
        }
    }
    if (!name) {
        throw new Error('No name found in jsr.json or deno.json');
    }

    return {
        cwd,
        name,
        prepare: {
            versionJsonPaths
        },
        publish: {
            binFolder: getTemporeryBinFolder(),
            pkgJsonPath: pkgJsonPath,
            publishArgs: config.publishArgs || []
        }
    };
}

let temporaryBinFolder: string | undefined;
export function getTemporeryBinFolder (): string {
    if (temporaryBinFolder) {
        return temporaryBinFolder;
    }

    const path = mkdtempSync(join(tmpdir(), 'semantic-release-jsr-'));
    temporaryBinFolder = path;
    return path;
}

export async function updateVersionJson (file: string, context: VerifyReleaseContext) {
    if (!context.nextRelease) {
        return;
    }

    context.logger.log(`Updating version in ${file}`);
    const content = await readFile(file, 'utf8');
    const json = JSON.parse(content);
    if (json.version === context.nextRelease.version) {
        context.logger.log(`Skipped, ${file} is already up to date`);
        return;
    }

    json.version = context.nextRelease.version;
    await writeFile(file, JSON.stringify(json, null, 2));
    context.logger.log(`Wrote new version to ${file}`);
}

export async function publish (config: NormalizedPluginConfig, context: VerifyConditionsContext): Promise<void> {
    context.logger.log(`Run jsr publish in ${config.cwd} with ${JSON.stringify(config.publish)}`);

    const ms = Date.now();
    try {
        await jsrPublish(config.cwd, config.publish);
        context.logger.log(`jsr publish run successfully (took ${Date.now() - ms } ms)`);
    }
    catch (error) {
        context.logger.log(`jsr publish failed after ${Date.now() - ms } ms:`);
        context.logger.error(error instanceof Error ? error.stack : error);
        throw error;
    }
}

export function generatePublishResponse (config: NormalizedPluginConfig, context: PublishResponseContext): PublishResponse {
    let url = `https://jsr.io/${config.name}/versions`;
    if (context.nextRelease) {
        url = `https://jsr.io/${config.name}@${context.nextRelease.version}`;
    }

    return {
        name: 'JSR.io',
        url
    };
}
