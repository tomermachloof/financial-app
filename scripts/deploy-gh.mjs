import ghpages from 'gh-pages'
import { resolve } from 'path'
import { execSync } from 'child_process'

// Safety guard: production deploys are only allowed from main
const branch = execSync('git rev-parse --abbrev-ref HEAD').toString().trim()
if (branch !== 'main') {
  console.error(`\nBLOCKED: production deploy is only allowed from the main branch.`)
  console.error(`Current branch: ${branch}\n`)
  console.error(`Merge your changes into main first, then deploy.\n`)
  process.exit(1)
}

console.log(`Branch: ${branch} — proceeding with deploy...`)
ghpages.publish(resolve('dist'), { dotfiles: true }, (err) => {
  if (err) { console.error('DEPLOY FAILED:', err); process.exit(1) }
  console.log('DEPLOY OK')
})
