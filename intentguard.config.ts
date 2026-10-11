export default {
  baseURL: 'http://127.0.0.1:5173',
  contracts: ['intent/*.yaml'],
  outputDir: '.intentguard',
  viewports: [{ width: 1280, height: 800 }],
  provider: 'none',
  // Set a multimodal model supported by your OpenAI account when enabling openai.
  model: process.env.INTENTGUARD_MODEL,
  readySelector: '[data-entity="task"]',
  redact: ['[data-sensitive]', '.customer-email'],
  cache: true,
};
