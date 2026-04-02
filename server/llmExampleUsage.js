import dotenv from 'dotenv'
import { generateLLMResponse } from '../services/llmService.js'

dotenv.config()

async function runExampleUsage() {
  const prompt = 'Summarize the provided user journey data in a short analytical paragraph.'
  const data = {
    userId: '141178688',
    dateRange: '2026-03-17 to 2026-04-02',
    sessionCount: 3,
    enquiryCount: 2,
    buyleadCount: 1,
  }

  const content = await generateLLMResponse(data, prompt)
  console.log(content)
}

runExampleUsage().catch((error) => {
  console.error('LLM example usage failed:', error)
})
