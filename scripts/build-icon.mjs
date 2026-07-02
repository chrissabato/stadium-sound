import sharp from 'sharp'
import pngToIco from 'png-to-ico'
import { writeFileSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')
const svgPath = join(root, 'logo.svg')

mkdirSync(join(root, 'resources'), { recursive: true })

const sizes = [16, 32, 48, 64, 128, 256]
const pngBuffers = await Promise.all(
  sizes.map((s) => sharp(svgPath).resize(s, s).png().toBuffer())
)

const icoBuffer = await pngToIco(pngBuffers)
writeFileSync(join(root, 'resources', 'icon.ico'), icoBuffer)
console.log('resources/icon.ico written')
