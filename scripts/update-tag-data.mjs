import { readdirSync, readFileSync, writeFileSync } from 'fs'
import path from 'path'
import matter from 'gray-matter'
import { slug } from 'github-slugger'
import prettier from 'prettier'

const blogDir = path.join(process.cwd(), 'data/blog')
const outFile = path.join(process.cwd(), 'app/tag-data.json')

function collectMdxFiles(dir) {
  const files = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      files.push(...collectMdxFiles(fullPath))
    } else if (entry.isFile() && entry.name.endsWith('.mdx')) {
      files.push(fullPath)
    }
  }
  return files
}

const tagCount = {}

for (const file of collectMdxFiles(blogDir)) {
  const { data } = matter(readFileSync(file, 'utf8'))
  if (data.draft === true || !Array.isArray(data.tags)) continue

  for (const tag of data.tags) {
    const key = slug(String(tag))
    tagCount[key] = (tagCount[key] || 0) + 1
  }
}

const formatted = await prettier.format(JSON.stringify(tagCount, null, 2), { parser: 'json' })
writeFileSync(outFile, formatted)
console.log(`Wrote ${Object.keys(tagCount).length} tags to app/tag-data.json`)
