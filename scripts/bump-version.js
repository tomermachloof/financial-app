import { writeFileSync } from 'fs'
writeFileSync('public/version.txt', String(Date.now()))
