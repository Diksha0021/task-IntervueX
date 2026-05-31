/** Topic presets recruiters can select when creating an interview. */
export const INTERVIEW_TOPIC_OPTIONS = [
  'React',
  'Node.js',
  'JavaScript',
  'TypeScript',
  'Python',
  'SQL & Databases',
  'System Design',
  'Data Structures',
  'API Design',
  'HTML & CSS',
  'AWS & Cloud',
  'Docker & DevOps',
  'Testing & QA',
  'Behavioral',
  'Leadership',
  'Communication',
  'UI/UX',
  'Machine Learning',
]

const TOPIC_QUESTION_TEMPLATES = {
  React:
    'Explain how React components re-render. When would you use useState versus useEffect in a real feature?',
  'Node.js':
    'How would you design a REST API in Node.js with Express? Mention routes, middleware, and error handling.',
  JavaScript:
    'Explain closures and async/await in JavaScript. How do you handle errors in async code?',
  TypeScript:
    'Why use TypeScript over JavaScript? Give examples of types or interfaces that prevent bugs in a team codebase.',
  Python:
    'Describe how you structure a Python backend service. How do you handle validation and errors?',
  'SQL & Databases':
    'How would you design database tables for a multi-user todo app? When would you add indexes?',
  'System Design':
    'How would you design a URL shortener that handles millions of requests per day?',
  'Data Structures':
    'When would you use a hash map versus a tree? Give a practical example from a project you built.',
  'API Design':
    'What makes a REST API well-designed? How do you version APIs and handle breaking changes?',
  'HTML & CSS':
    'How do you build responsive, accessible layouts? What WCAG practices do you follow?',
  'AWS & Cloud':
    'Describe a cloud deployment you have done or would plan. Which AWS services would you use and why?',
  'Docker & DevOps':
    'Explain how Docker helps in development and deployment. What goes in a CI pipeline for a web app?',
  'Testing & QA':
    'How do you test a React feature end-to-end? What is your approach to unit vs integration tests?',
  Behavioral:
    'Tell us about yourself and why you are interested in this role.',
  Leadership:
    'Describe a time you led a team through a disagreement or setback. What was the outcome?',
  Communication:
    'Tell us about a time you had to explain a technical concept to a non-technical stakeholder.',
  'UI/UX':
    'Tell us about feedback you received on UI/UX quality. How did you improve your work?',
  'Machine Learning':
    'Explain a machine learning project or concept you have worked with. How did you evaluate model quality?',
}

const FALLBACK_TECHNICAL =
  'Walk through a recent technical problem you solved. What tools and approach did you use?'

/**
 * Build up to 6 interview questions from selected topics.
 * @param {string[]} topics
 * @param {string[]} [customQuestions]
 */
export function buildQuestionsFromTopics(topics = [], customQuestions = []) {
  const manual = customQuestions
    .map((q) => q.trim())
    .filter(Boolean)
    .map((text) => ({ type: text.length > 120 ? 'technical' : 'behavioral', text }))

  if (manual.length >= 3) {
    return manual.slice(0, 8)
  }

  const fromTopics = []
  for (const topic of topics) {
    const text = TOPIC_QUESTION_TEMPLATES[topic]
    if (text) {
      fromTopics.push({
        type: topic === 'Behavioral' || topic === 'Leadership' || topic === 'Communication' ? 'behavioral' : 'technical',
        text,
      })
    }
  }

  const merged = [...manual]
  for (const q of fromTopics) {
    if (merged.length >= 6) break
    if (!merged.some((m) => m.text === q.text)) merged.push(q)
  }

  while (merged.length < 6) {
    merged.push({ type: 'technical', text: FALLBACK_TECHNICAL })
  }

  return merged.slice(0, 6)
}

export function topicsToKeywords(topics = []) {
  const map = {
    React: ['react', 'component', 'hooks', 'jsx'],
    'Node.js': ['node', 'express', 'api', 'javascript'],
    JavaScript: ['javascript', 'async', 'closure', 'es6'],
    TypeScript: ['typescript', 'types', 'interface'],
    Python: ['python', 'django', 'flask'],
    'SQL & Databases': ['sql', 'database', 'index', 'query'],
    'System Design': ['scalability', 'architecture', 'load', 'cache'],
    'API Design': ['rest', 'api', 'endpoint', 'versioning'],
    'HTML & CSS': ['html', 'css', 'responsive', 'accessibility'],
    'AWS & Cloud': ['aws', 'cloud', 'deployment', 's3'],
    'Docker & DevOps': ['docker', 'ci', 'devops', 'pipeline'],
    'Testing & QA': ['testing', 'jest', 'cypress', 'qa'],
    Behavioral: ['teamwork', 'communication', 'deadline'],
    Leadership: ['leadership', 'mentoring', 'decision'],
    Communication: ['communication', 'stakeholder', 'presentation'],
    'UI/UX': ['ux', 'ui', 'design', 'accessibility'],
    'Machine Learning': ['ml', 'model', 'training', 'data'],
  }

  const keywords = new Set()
  for (const topic of topics) {
    for (const kw of map[topic] ?? [topic.toLowerCase().split(' ')[0]]) {
      keywords.add(kw)
    }
  }
  return [...keywords]
}
