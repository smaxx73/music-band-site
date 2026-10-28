import source from '../../CHANGELOG.md?raw'
import { parseChangelog } from './changelog-parse'

// Figé dans le code au build, comme APP_VERSION : le journal des nouveautés est celui de la
// version en service, sans requête ni table.
export const CHANGELOG = parseChangelog(source)
