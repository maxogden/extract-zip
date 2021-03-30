const extract = require('../')
const fs = require('fs-extra')
const os = require('os')
const path = require('path')
const test = require('ava')

const catsZip = path.join(__dirname, 'cats.zip')
const githubZip = path.join(__dirname, 'github.zip')
const noPermissionsZip = path.join(__dirname, 'no-permissions.zip')
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

async function pathExists (t, pathToCheck, message) {
  const exists = await fs.pathExists(pathToCheck)
  t.true(exists, message)
}

async function pathDoesntExist (t, pathToCheck, message) {
  const exists = await fs.pathExists(pathToCheck)
  t.false(exists, message)
}

async function assertPermissions (t, pathToCheck, expectedMode) {
  const stats = await fs.stat(pathToCheck)
  const actualMode = (stats.mode & 0o777)
  t.is(actualMode, expectedMode)
}

test('files', async t => {
  const dirPath = await tempExtract(t, 'files', catsZip)
  await pathExists(t, path.join(dirPath, 'cats', 'gJqEYBs.jpg'), 'file created')
})

test('symlinks', async t => {
  const dirPath = await tempExtract(t, 'symlinks', catsZip)
  const symlink = path.join(dirPath, 'cats', 'orange_symlink')

  await pathExists(t, path.join(dirPath, 'cats'), 'directory created')
  await pathExists(t, symlink, `symlink created: ${symlink}`)

  const stats = await fs.lstat(symlink)
  t.truthy(stats.isSymbolicLink(), 'symlink is valid')
  const linkPath = await fs.readlink(symlink)
  t.is(linkPath, 'orange')
})

test('directories', async t => {
  const dirPath = await tempExtract(t, 'directories', catsZip)
  const dirWithContent = path.join(dirPath, 'cats', 'orange')
  const dirWithoutContent = path.join(dirPath, 'cats', 'empty')

  await pathExists(t, dirWithContent, 'directory created')

  const filesWithContent = await fs.readdir(dirWithContent)
  t.not(filesWithContent.length, 0, 'directory has files')

  await pathExists(t, dirWithoutContent, 'empty directory created')

  const filesWithoutContent = await fs.readdir(dirWithoutContent)
  t.is(filesWithoutContent.length, 0, 'empty directory has no files')
})

test('verify github zip extraction worked', async t => {
  const dirPath = await tempExtract(t, 'verify-extraction', githubZip)
  await pathExists(t, path.join(dirPath, 'extract-zip-master', 'test'), 'folder created')
  if (process.platform !== 'win32') {
    await assertPermissions(t, path.join(dirPath, 'extract-zip-master', 'test'), 0o755)
  }
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
  await fs.remove(relativeTarget)
  await t.throwsAsync(extract(catsZip, { dir: relativeTarget }), {
    message: 'Target directory is expected to be absolute'
  })
  await pathDoesntExist(t, path.join(__dirname, relativeTarget), 'folder not created')
  await fs.remove(relativeTarget)
})

if (process.platform !== 'win32') {
  test('symlink destination disallowed', async t => {
    const dirPath = await mkdtemp(t, 'symlink-destination-disallowed')
    await pathDoesntExist(t, path.join(dirPath, 'file.txt'), "file doesn't exist at symlink target")

    await t.throwsAsync(extract(symlinkDestZip, { dir: dirPath }), {
      message: /Out of bound path ".*?" found while processing file symlink-dest\/aaa\/file.txt/
    })
  })

  test('no file created out of bound', async t => {
    const dirPath = await mkdtemp(t, 'out-of-bounds-file')
    await t.throwsAsync(extract(symlinkDestZip, { dir: dirPath }))

    const symlinkDestDir = path.join(dirPath, 'symlink-dest')

    await pathExists(t, symlinkDestDir, 'target folder created')
    await pathExists(t, path.join(symlinkDestDir, 'aaa'), 'symlink created')
    await pathExists(t, path.join(symlinkDestDir, 'ccc'), 'parent folder created')
    await pathDoesntExist(t, path.join(symlinkDestDir, 'ccc/file.txt'), 'file not created in original folder')
    await pathDoesntExist(t, path.join(dirPath, 'file.txt'), 'file not created in symlink target')
  })

  test('defaultDirMode', async t => {
    const dirPath = await mkdtemp(t, 'default-dir-mode')
    const defaultDirMode = 0o700
    await extract(githubZip, { dir: dirPath, defaultDirMode })
    await assertPermissions(t, path.join(dirPath, 'extract-zip-master', 'test'), defaultDirMode)
  })

  test('defaultFileMode not set', async t => {
    const dirPath = await mkdtemp(t, 'default-file-mode')
    await extract(noPermissionsZip, { dir: dirPath })
    await assertPermissions(t, path.join(dirPath, 'folder', 'file.txt'), 0o644)
  })

  test('defaultFileMode', async t => {
    const dirPath = await mkdtemp(t, 'default-file-mode')
    const defaultFileMode = 0o600
    await extract(noPermissionsZip, { dir: dirPath, defaultFileMode })
    await assertPermissions(t, path.join(dirPath, 'folder', 'file.txt'), defaultFileMode)
  })
}

test('files in subdirs where the subdir does not have its own entry is extracted', async t => {
  const dirPath = await tempExtract(t, 'subdir-file', subdirZip)
  await pathExists(t, path.join(dirPath, 'foo', 'bar'), 'file created')
})

test('extract broken zip', async t => {
  const dirPath = await mkdtemp(t, 'broken-zip')
  await t.throwsAsync(extract(brokenZip, { dir: dirPath }), {
    message: 'invalid central directory file header signature: 0x2014b00'
  })
})

test('filter file output', async t => {
  const dirPath = await mkdtemp(t, 'filter-files')
  await extract(catsZip, {
    dir: dirPath,
    filter: (entry, zipFile) => {
      if (entry.fileName !== 'a-cat.png') {
        return false
      }
      entry.fileName = 'bored-cat.png'
      entry.fileNameLength = entry.fileName.length
      return true
    }
  })
  const entries = await fs.readdir(dirPath)
  t.deepEqual(entries, ['bored-cat.png'])
})
