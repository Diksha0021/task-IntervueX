/** 6 questions each: 2 behavioral + 4 role-specific. Duration 20–30 min by track. */
export const INTERVIEW_PROFILES = [
  {
    id: 'web-dev-internship',
    title: 'Web Development Internship',
    roleLabel: 'Web Development Intern',
    durationMinutes: 25,
    keywords: [
      'react', 'node', 'javascript', 'typescript', 'npm', 'vite', 'express', 'api',
      'css', 'html', 'git', 'component', 'hooks', 'async', 'rest', 'webpack', 'next',
    ],
    questions: [
      {
        type: 'behavioral',
        text: 'Tell us about yourself and why you are interested in this web development internship.',
      },
      {
        type: 'behavioral',
        text: 'Describe a time you worked on a team project with a tight deadline. What was your role and what did you learn?',
      },
      {
        type: 'technical',
        text: 'Explain how React components re-render. When would you use useState versus useEffect in a real feature?',
      },
      {
        type: 'technical',
        text: 'How would you design a simple REST API in Node.js with Express for a todo app? Mention routes, middleware, and error handling.',
      },
      {
        type: 'technical',
        text: 'Walk through how you would debug a slow page load in a React + Vite app. What tools would you use?',
      },
      {
        type: 'technical',
        text: 'Which tools from the modern web stack (Git, npm, bundlers, browser DevTools) do you use regularly, and how?',
      },
    ],
  },
  {
    id: 'fullstack-engineer',
    title: 'Full Stack Engineer',
    roleLabel: 'Full Stack Engineer',
    durationMinutes: 30,
    keywords: [
      'react', 'node', 'database', 'sql', 'api', 'authentication', 'docker', 'aws',
      'typescript', 'postgresql', 'mongodb', 'redis', 'testing', 'ci', 'deployment',
    ],
    questions: [
      {
        type: 'behavioral',
        text: 'Tell us about a full-stack project you are most proud of. What technologies did you choose and why?',
      },
      {
        type: 'behavioral',
        text: 'Describe a disagreement with a teammate about technical direction. How did you resolve it?',
      },
      {
        type: 'technical',
        text: 'How do you structure authentication and authorization in a React frontend with a Node.js API?',
      },
      {
        type: 'technical',
        text: 'Compare SQL and NoSQL for a high-traffic application. When would you pick each?',
      },
      {
        type: 'technical',
        text: 'Explain your approach to deploying a full-stack app (build, CI/CD, environment variables, monitoring).',
      },
      {
        type: 'technical',
        text: 'How do you write integration tests across the API and database layers?',
      },
    ],
  },
  {
    id: 'frontend-developer',
    title: 'Frontend Developer',
    roleLabel: 'Frontend Developer',
    durationMinutes: 22,
    keywords: [
      'react', 'css', 'accessibility', 'performance', 'webpack', 'typescript', 'state',
      'redux', 'zustand', 'tailwind', 'responsive', 'semantic', 'aria', 'lighthouse',
    ],
    questions: [
      {
        type: 'behavioral',
        text: 'Why do you want to specialize in frontend development, and what kind of products excite you?',
      },
      {
        type: 'behavioral',
        text: 'Tell us about feedback you received on UI/UX quality. How did you improve your work?',
      },
      {
        type: 'technical',
        text: 'How do you manage component state in a large React application? Compare approaches you have used.',
      },
      {
        type: 'technical',
        text: 'What steps do you take to make a web app accessible (WCAG) and responsive across devices?',
      },
      {
        type: 'technical',
        text: 'Describe how you optimize frontend performance (bundle size, lazy loading, Core Web Vitals).',
      },
      {
        type: 'technical',
        text: 'How do you collaborate with designers using Figma or similar tools in your workflow?',
      },
    ],
  },
  {
    id: 'backend-node',
    title: 'Backend (Node.js)',
    roleLabel: 'Backend Developer',
    durationMinutes: 28,
    keywords: [
      'node', 'express', 'api', 'postgresql', 'redis', 'queue', 'jwt', 'oauth',
      'microservices', 'logging', 'security', 'sql', 'orm', 'prisma', 'testing',
    ],
    questions: [
      {
        type: 'behavioral',
        text: 'Describe your experience building backend services. What scale or traffic have you handled?',
      },
      {
        type: 'behavioral',
        text: 'Tell us about a production incident you helped resolve. What was the root cause?',
      },
      {
        type: 'technical',
        text: 'Design a rate-limited public API in Node.js. What libraries and patterns would you use?',
      },
      {
        type: 'technical',
        text: 'How do you model relationships in PostgreSQL for users, orders, and payments?',
      },
      {
        type: 'technical',
        text: 'Explain idempotency and how you would implement it for payment webhooks.',
      },
      {
        type: 'technical',
        text: 'What is your strategy for structured logging, metrics, and tracing in a Node service?',
      },
    ],
  },
  {
    id: 'data-science-intern',
    title: 'Data Science Internship',
    roleLabel: 'Data Science Intern',
    durationMinutes: 20,
    keywords: [
      'python', 'pandas', 'numpy', 'scikit', 'matplotlib', 'sql', 'jupyter', 'model',
      'regression', 'classification', 'feature', 'validation', 'pandas', 'statistics',
    ],
    questions: [
      {
        type: 'behavioral',
        text: 'What drew you to data science, and describe a dataset or problem you explored on your own.',
      },
      {
        type: 'behavioral',
        text: 'How do you explain a technical result to a non-technical stakeholder?',
      },
      {
        type: 'technical',
        text: 'Walk through your process for cleaning and exploring a messy CSV in pandas.',
      },
      {
        type: 'technical',
        text: 'When would you use linear regression versus a tree-based model? Give a practical example.',
      },
      {
        type: 'technical',
        text: 'How do you detect and handle overfitting when training a classifier?',
      },
      {
        type: 'technical',
        text: 'Write a SQL query mindset: how would you join users to their last 5 orders for analysis?',
      },
    ],
  },
]

export function getProfileById(id) {
  return INTERVIEW_PROFILES.find((p) => p.id === id) ?? INTERVIEW_PROFILES[0]
}

export function getQuestionTexts(profile) {
  return profile.questions.map((q) => q.text)
}

export function formatDuration(profile) {
  return `${profile.durationMinutes} min`
}
