import ghpages from 'gh-pages'
import { resolve } from 'path'
ghpages.publish(resolve('dist'), { dotfiles: true }, (err) => {
  if (err) { console.error('DEPLOY FAILED:', err); process.exit(1) }
  console.log('DEPLOY OK')
})
