const extract = require('../')
const { existsSync, promises: fs } = require('fs')
const os = require('os')
const path = require('path')
const { promisify } = require('util')
const rimraf = promisify(require('rimraf'))
const test = require('ava')

const catsZip = path.join(__dirname, 'cats.zip')
const githubZip = path.join(__dirname, 'github.zip')
const subdirZip = path.join(__dirname, 'file-in-subdir-without-subdir-entry.zip')
const symlinkDestZip = path.join(__dirname, 'symlink-dest.zip')
const symlinkZip = path.join(__dirname, 'symlink.zip')
const brokenZip = path.join(__dirname, 'broken.zip')

const relativeTarget = './cats'

async function mkdtemp (t, suffix) {
  return fs.mkdtemp(path.join(os.tmpdir(), `extract-zip-${suffix}`))
}

async function tempExtract (t, suffix, zipPath) {
  const dirPath = await mkdtemp(t, suffix)
  await extract(zipPath, { dir: dirPath })
  return dirPath
}

function exists (t, pathToCheck, message) {
  const exists = existsSync(pathToCheck)
  t.true(exists, message)
}

function doesntExist (t, pathToCheck, message) {
  const exists = existsSync(pathToCheck)
  t.false(exists, message)
}

test('files', async t => {
  const dirPath = await tempExtract(t, 'files', catsZip)
  exists(t, path.join(dirPath, 'cats', 'gJqEYBs.jpg'), 'file created')
})

test('symlinks', async t => {
  const dirPath = await tempExtract(t, 'symlinks', catsZip)
  const symlink = path.join(dirPath, 'cats', 'orange_symlink')

  exists(t, symlink, 'symlink created')

  const stats = await fs.lstat(symlink)
  t.truthy(stats.isSymbolicLink(), 'symlink is valid')
  const linkPath = await fs.readlink(symlink)
  t.is(linkPath, 'orange')
})

test('directories', async t => {
  const dirPath = await tempExtract(t, 'directories', catsZip)
  const dirWithContent = path.join(dirPath, 'cats', 'orange')
  const dirWithoutContent = path.join(dirPath, 'cats', 'empty')

  exists(t, dirWithContent, 'directory created')

  const filesWithContent = await fs.readdir(dirWithContent)
  t.not(filesWithContent.length, 0, 'directory has files')

  exists(t, dirWithoutContent, 'empty directory created')

  const filesWithoutContent = await fs.readdir(dirWithoutContent)
  t.is(filesWithoutContent.length, 0, 'empty directory has no files')
})

test('verify github zip extraction worked', async t => {
  const dirPath = await tempExtract(t, 'verify-extraction', githubZip)
  exists(t, path.join(dirPath, 'extract-zip-master', 'test'), 'folder created')
})

test('opts.onEntry', async t => {
  const dirPath = await mkdtemp(t, 'onEntry')
  const actualEntries = []
  const expectedEntries = [
    'symlink/',
    'symlink/foo.txt',
    'symlink/foo_symlink.txt'
  ]
  const onEntry = function (entry) {
    actualEntries.push(entry.fileName)
  }
  await extract(symlinkZip, { dir: dirPath, onEntry })
  t.deepEqual(actualEntries, expectedEntries, 'entries should match')
})

test('relative target directory', async t => {
  await rimraf(relativeTarget)
  await t.throwsAsync(extract(catsZip, { dir: relativeTarget }), {
    message: 'Target directory is expected to be absolute'
  })
  doesntExist(t, path.join(__dirname, relativeTarget), 'folder not created')
  await rimraf(relativeTarget)
})

if (process.platform !== 'win32') {
  test('symlink destination disallowed', async t => {
    const dirPath = await mkdtemp(t, 'symlink-destination-disallowed')
    doesntExist(t, path.join(dirPath, 'file.txt'), "file doesn't exist at symlink target")

    await t.throwsAsync(extract(symlinkDestZip, { dir: dirPath }), {
      message: /Out of bound path ".*?" found while processing file symlink-dest\/aaa\/file.txt/
    })
  })

  test('no file created out of bound', async t => {
    const dirPath = await mkdtemp(t, 'out-of-bounds-file')
    await t.throwsAsync(extract(symlinkDestZip, { dir: dirPath }))

    const symlinkDestDir = path.join(dirPath, 'symlink-dest')

    exists(t, symlinkDestDir, 'target folder created')
    exists(t, path.join(symlinkDestDir, 'aaa'), 'symlink created')
    exists(t, path.join(symlinkDestDir, 'ccc'), 'parent folder created')
    doesntExist(t, path.join(symlinkDestDir, 'ccc/file.txt'), 'file not created in original folder')
    doesntExist(t, path.join(dirPath, 'file.txt'), 'file not created in symlink target')
  })
}

test('files in subdirs where the subdir does not have its own entry is extracted', async t => {
  const dirPath = await tempExtract(t, 'subdir-file', subdirZip)
  exists(t, path.join(dirPath, 'foo', 'bar'), 'file created')
})

test('extract broken zip', async t => {
  const dirPath = await mkdtemp(t, 'broken-zip')
  await t.throwsAsync(extract(brokenZip, { dir: dirPath }), {
    message: 'invalid central directory file header signature: 0x2014b00'
  })
})
