/* eslint-disable no-shadow */
import { resolve } from 'node:path';
import * as fs from 'fs-extra-plus';
import gulp from 'gulp';
import chalk from 'chalk';
import semver from 'semver';
import yaml from 'gulp-yaml';
import { execa } from 'execa';
import argv from './tools/args-parser.js';
import esBuild from './esbuild.config.js';

/* ------------------------------------------ */
/*  Configuration                             */
/* ------------------------------------------ */

const production = process.env.NODE_ENV === 'production';
const sourceDirectory = './src';
const distDirectory = './dist';
const yzurDirectory = './static/lib';
const templateExt = 'hbs';
const langGlob = `${sourceDirectory}/lang/**/*.{yml,yaml}`;
const staticFiles = ['lib', 'assets', 'fonts', 'scripts', 'system.json', 'template.json', 'LICENSE'];
const manifestPath = 'static/system.json';
const getDownloadURL = version =>
  `https://github.com/fvtt-fria-ligan/blade-runner-foundry-vtt/releases/download/v${version}/blade-runner-fvtt_v${version}.zip`;
const packageJson = JSON.parse(fs.readFileSync('package.json'));

const stdio = 'inherit';

/* ------------------------------------------ */
/*  Build                                     */
/* ------------------------------------------ */

/**
 * Builds the distributable JavaScript code.
 * @async
 */
async function buildSource({ watch } = {}) {
  await esBuild({ production, watch });
}

/* ------------------------------------------ */

/**
 * Copies all template files.
 * @async
 */
async function pipeTemplates() {
  const templateFiles = await fs.glob([`${sourceDirectory}/**/*.${templateExt}`]);
  if (templateFiles && templateFiles.length > 0) {
    for (const file of templateFiles) {
      await fs.copy(
        file,
        `${distDirectory}/templates/${file.replace(`${sourceDirectory}/`, '').replace('templates/', '')}`,
      );
    }
  }
}

/* ------------------------------------------ */

/**
 * Creates the JSON translation files, from the Yaml ones.
 * @async
 */
async function pipeTranslations() {
  gulp
    .src(langGlob)
    .pipe(yaml({ safe: true }))
    .pipe(gulp.dest('./dist/lang'));
}

/* ------------------------------------------ */

/**
 * Copies other source files.
 * @async
 */
async function pipeStatics() {
  for (const file of staticFiles) {
    if (fs.existsSync(`static/${file}`)) {
      await fs.copy(`static/${file}`, `${distDirectory}/${file}`);
    }
  }
}

/* ------------------------------------------ */

/**
 * Watches for changes for each build step.
 */
function buildWatch() {
  buildSource({ watch: true });
  gulp.watch(`${sourceDirectory}/**/*.${templateExt}`, { ignoreInitial: false }, pipeTemplates);
  gulp.watch(langGlob, { ignoreInitial: false }, pipeTranslations);
  gulp.watch(
    staticFiles.map(file => `static/${file}`),
    { ignoreInitial: false },
    pipeStatics,
  );
}

/* ------------------------------------------ */
/*  Clean                                     */
/* ------------------------------------------ */

/**
 * Removes built files from `dist` folder while ignoring source files.
 * @async
 */
async function cleanDist() {
  if (fs.existsSync('./dist')) await fs.remove('./dist');
}

/* ------------------------------------------ */
/*  Versioning                                */
/* ------------------------------------------ */

/**
 * Gets the contents of the manifest file as object.
 * @returns {object}
 */
function getManifest() {
  if (fs.existsSync(manifestPath)) {
    return {
      file: JSON.parse(fs.readFileSync(manifestPath)),
      name: 'system.json',
    };
  }
}

/* ------------------------------------------ */

/**
 * Gets the target version based on on the current version and the argument passed as release.
 * @param {string} currentVersion The current version
 * @param {string} release        The release type,
 *    any of `['major', 'premajor', 'minor', 'preminor', 'patch', 'prepatch', 'prerelease']`
 * @returns {string} The target version
 */
function getTargetVersion(currentVersion, release) {
  if (['major', 'premajor', 'minor', 'preminor', 'patch', 'prepatch', 'prerelease'].includes(release)) {
    return semver.inc(currentVersion, release);
  }
  else {
    return semver.valid(release);
  }
}

/* ------------------------------------------ */

/**
 * Makes a changelog.
 * @async
 */
async function changelog() {
  await execa('npx', ['standard-version', '--skip.bump', '--skip.tag', '--skip.commit'], { stdio });
}

/**
 * Commits and pushes release to Github Upstream.
 * @async
 */
async function commitTagPush() {
  const { version } = packageJson;
  const commitMsg = `chore(release): Release ${version}`;
  await execa('git', ['add', '-A'], { stdio });
  await execa('git', ['commit', '--message', commitMsg], { stdio });
  await execa('git', ['tag', `v${version}`], { stdio });
  await execa('git', ['push', 'upstream'], { stdio });
  await execa('git', ['push', 'upstream', '--tag'], { stdio });
}

/* ------------------------------------------ */

/**
 * Updates version and download URL.
 * @param {function} cb Callback function
 * @throws {Error} When manifest JSON not found
 * @throws {Error} When missing release type
 * @throws {Error} When incorrect version arguments
 * @throws {Error} When target version is identical to current version
 * @async
 */
async function bumpVersion(cb) {
  const manifest = getManifest();

  if (!manifest) cb(Error(chalk.red('Manifest JSON not found')));

  try {
    const release = argv.release || argv.r;

    const currentVersion = packageJson.version;

    if (!release) {
      return cb(Error('Missing release type'));
    }

    const targetVersion = getTargetVersion(currentVersion, release);

    if (!targetVersion) {
      return cb(new Error(chalk.red('Error: Incorrect version arguments')));
    }

    if (targetVersion === currentVersion) {
      return cb(new Error(chalk.red('Error: Target version is identical to current version')));
    }

    console.log(`Updating version number to '${targetVersion}'`);

    packageJson.version = targetVersion;
    fs.writeFileSync('package.json', JSON.stringify(packageJson, null, '  '));

    manifest.file.version = targetVersion;
    manifest.file.download = getDownloadURL(targetVersion);
    fs.writeFileSync(`static/${manifest.name}`, JSON.stringify(manifest.file, null, '  '));

    return cb();
  }
  catch (err) {
    cb(err);
  }
}

/* ------------------------------------------ */
/*  YZUR                                      */
/* ------------------------------------------ */

/**
 * Imports the latest YZUR library.
 * @async
 */
async function importYzur() {
  const source = resolve('node_modules/foundry-year-zero-roller/dist/yzur.js');
  const dest = resolve(`${yzurDirectory}/yzur.js`);
  if (fs.existsSync(source)) {
    fs.copyFileSync(source, dest);
    console.log(chalk.greenBright('[🎲YZUR🎲] Copied 1 file', chalk.blueBright(dest)));
  }
  else {
    throw new Error(chalk.red(`[YZUR] 🎲 Library file Not Found in "${source}"`));
  }
};

/* ------------------------------------------ */
/*  Scripts                                   */
/* ------------------------------------------ */

const execBuild = gulp.parallel(buildSource, pipeTemplates, pipeTranslations, pipeStatics);

export const clean = cleanDist;
export const build = gulp.series(clean, execBuild);
export const watch = gulp.series(buildWatch);
export const bump = gulp.series(bumpVersion, changelog, clean, execBuild);
export const release = commitTagPush;

export const yzur = importYzur;
