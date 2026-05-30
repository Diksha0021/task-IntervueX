/** Role keywords by interview profile — used for server-side analytics. */
export const PROFILE_KEYWORDS = {
  'web-dev-internship': [
    'react', 'node', 'javascript', 'typescript', 'npm', 'vite', 'express', 'api',
    'css', 'html', 'git', 'component', 'hooks', 'async', 'rest', 'webpack', 'next',
  ],
  'fullstack-engineer': [
    'react', 'node', 'database', 'sql', 'api', 'authentication', 'docker', 'aws',
    'typescript', 'postgresql', 'mongodb', 'redis', 'testing', 'ci', 'deployment',
  ],
  'frontend-developer': [
    'react', 'css', 'html', 'javascript', 'typescript', 'accessibility', 'performance',
    'webpack', 'vite', 'component', 'state', 'redux', 'responsive', 'semantic', 'a11y',
  ],
  'backend-node': [
    'node', 'express', 'api', 'postgresql', 'redis', 'queue', 'jwt', 'oauth',
    'microservices', 'logging', 'security', 'sql', 'orm', 'prisma', 'testing',
  ],
  'data-science-intern': [
    'python', 'pandas', 'numpy', 'scikit', 'matplotlib', 'sql', 'jupyter', 'model',
    'regression', 'classification', 'feature', 'validation', 'statistics',
  ],
}

export function getKeywordsForProfile(profileId) {
  if (!profileId) return []
  return PROFILE_KEYWORDS[profileId] ?? []
}
