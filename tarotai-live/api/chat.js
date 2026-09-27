import { generateText, stepCountIs, tool } from 'ai';
import { z } from 'zod';
const model = process.env.TAROTAI_MODEL || 'openai/gpt-5.6-sol';

const planTool = tool({
  description: 'Create a concrete execution plan for a substantial user task.',
  inputSchema: z.object({
    goal: z.string(),
    steps: z.array(z.string()).min(2).max(12),
    successCriteria: z.array(z.string()).min(1).max(8)
  }),
  execute: async ({ goal, steps, successCriteria }) => ({
    type: 'plan', goal, steps, successCriteria
  })
});

const webSearchTool = tool({
  description: 'Search the live public web when current or unfamiliar information is required. Use multiple queries for important claims.',
  inputSchema: z.object({
    query: z.string().min(2),
    recencyDays: z.number().int().min(0).max(3650).optional()
  }),
  execute: async ({ query, recencyDays }) => {
    const key = process.env.EXA_API_KEY;
    if (!key) {
      return {
        type: 'web_search',
        status: 'unavailable',
        message: 'Live web search is not configured on this deployment.'
      };
    }
    const body = {
      query,
      numResults: 6,
      contents: { text: { maxCharacters: 3500 } }
    };
    if (recencyDays && recencyDays > 0) {
      body.startPublishedDate = new Date(Date.now() - recencyDays * 86400000).toISOString();
    }
    const response = await fetch('https://api.exa.ai/search', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body),
      cache: 'no-store'
    });
    if (!response.ok) {
      return { type: 'web_search', status: 'error', message: `Search provider HTTP ${response.status}` };
    }
    const data = await response.json();
    return {
      type: 'web_search',
      status: 'ok',
      results: (data.results || []).map((r) => ({
        title: r.title,
        url: r.url,
        snippet: (r.text || '').slice(0, 1200),
        publishedDate: r.publishedDate || null
      }))
    };
  }
});

const readWebpageTool = tool({
  description: 'Read a known public webpage URL and return its visible text.',
  inputSchema: z.object({ url: z.string().url() }),
  execute: async ({ url }) => {
    try {
      const response = await fetch(url, {
        headers: { 'User-Agent': 'tarotai/1.0' },
        cache: 'no-store'
      });
      if (!response.ok) {
        return { type: 'read_webpage', status: 'error', url, message: `HTTP ${response.status}` };
      }
      const html = await response.text();
      const text = html
        .replace(/<script[\\s\\S]*?<\\/script>/gi, ' ')
        .replace(/<style[\\s\\S]*?<\\/style>/gi, ' ')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\\s+/g, ' ')
        .trim();
      return { type: 'read_webpage', status: 'ok', url, text: text.slice(0, 14000) };
    } catch (error) {
      return {
        type: 'read_webpage',
        status: 'error',
        url,
        message: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
});

const executeTaskTool = tool({
  description: 'Execute an authorized action through the configured tarotai executor. Use only for capabilities explicitly permitted by server configuration. Never bypass authentication or security.',
  inputSchema: z.object({
    capability: z.enum(['browser', 'filesystem', 'terminal', 'application', 'api']),
    action: z.string().min(1),
    arguments: z.record(z.string(), z.unknown()).default({}),
    permission: z.string().min(1)
  }),
  execute: async ({ capability, action, arguments: args, permission }) => {
    const allowed = new Set(
      (process.env.TAROTAI_AUTONOMOUS_PERMISSIONS || '')
        .split(',')
        .map((v) => v.trim())
        .filter(Boolean)
    );
    if (!allowed.has(permission)) {
      return {
        type: 'permission',
        status: 'needs_attention',
        permission,
        capability,
        action,
        message: `Permission '${permission}' is not enabled on the server.`
      };
    }
    const endpoint = process.env.TAROTAI_TOOL_EXECUTOR_URL;
    if (!endpoint) {
      return {
        type: 'executor',
        status: 'unavailable',
        message: 'No task executor is configured. This website can answer questions, research, plan, and verify, but computer/application actions need a separate authorized executor.'
      };
    }
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(process.env.TAROTAI_TOOL_EXECUTOR_TOKEN
          ? { Authorization: `Bearer ${process.env.TAROTAI_TOOL_EXECUTOR_TOKEN}` }
          : {})
      },
      body: JSON.stringify({ capability, action, arguments: args }),
      cache: 'no-store'
    });
    const payload = await response.json().catch(() => ({ message: 'Executor returned non-JSON output.' }));
    return {
      type: 'executor',
      status: response.ok ? 'ok' : 'error',
      capability,
      action,
      payload
    };
  }
});

const verifyTool = tool({
  description: 'Record an explicit verification step before claiming a task is complete.',
  inputSchema: z.object({
    target: z.string(),
    checks: z.array(z.string()).min(1).max(8),
    outcome: z.enum(['passed', 'partial', 'failed']),
    notes: z.string()
  }),
  execute: async ({ target, checks, outcome, notes }) => ({
    type: 'verification', target, checks, outcome, notes
  })
});

const ownerContext = `
Owner working context:
- Communication: prefers direct, friendly, simple WhatsApp-style explanations when studying; prefers proactive execution and does not want repeated questions when the necessary context is already available.
- Study: working across CA/CMA/B.Com Hons with Economics; often studies CA Foundation/business-law/economics/accountancy topics and benefits from practical examples.
- PC profile: Windows 11 Home; Intel i5-3350P; Radeon RX 580 2048SP; 8 GB DDR3; Zebronics H61/LGA1155 motherboard; 120 GB + 256 GB SSD; 500 W Ant Esports PSU. Known troubleshooting areas include low CPU clock under load, random restarts, Secure Boot/TPM configuration, driver compatibility, and gaming performance.
- PCDealHub: Indian PC-hardware deals/affiliate project in GitHub repository tarotgamerz/pcdealhub. It has a GitHub Pages site, deal validation/freshness/RSS automation, and ongoing affiliate-network setup. The owner prefers free or very-low-cost tooling and wants the project improved proactively.
- Gaming: mobile-first player; BGMI/Warzone/Apex-related interests; likes adapting mobile-style controls when using Steam Link.
- tarotai goal: a private operator-grade AI that can answer questions, research current information, plan tasks, execute authorized actions, observe results, adapt on failure, verify outcomes, and retain useful non-sensitive context over time.
`;

const system = ownerContext + `You are tarotai, a private operator-grade AI agent.

Operating loop:
Understand objective → Plan → Execute → Observe → Adapt → Verify → Complete.

Behavior:
- For substantial tasks, call set_task_plan first.
- Actually do the work with available tools instead of merely describing what someone else should do.
- When a tool fails, diagnose it, choose a sensible alternative, and continue when possible.
- Use web_search for current, changing, unfamiliar, or source-sensitive facts when it is available.
- After important research, prefer multiple authoritative sources and distinguish source facts from inference.
- Use read_webpage when a specific public URL needs inspection.
- Use execute_task only when the action is explicitly allowed by the server's permissions.
- Never bypass authentication, access controls, security mechanisms, paywalls, or permissions.
- Never claim an external action succeeded unless its result was returned and verified.
- Finish with clear sections: Completed, Failed, Needs Attention.
- Keep responses useful and direct. The owner prefers proactive execution over unnecessary questions.
- Treat the memory supplied by the user interface as context, not as proof of current external facts.`;

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const authorized = (req.headers.cookie || '').split(';').map(v => v.trim()).some(v => v === 'tarotai_session=authorized');
  if (process.env.TAROTAI_ACCESS_CODE && !authorized) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const messages = Array.isArray(body.messages) ? body.messages : [];
  const memory = Array.isArray(body.memory) ? body.memory.slice(0, 30) : [];
  if (!messages.length) return res.status(400).json({ error: 'messages is required' });

  const memoryText = memory.length
    ? '\nKnown owner memory:\n' + memory.map((m) => `- ${m.key}: ${m.value}`).join('\\n')
    : '';

  try {
    // On Vercel, the AI SDK automatically uses the platform's OIDC authentication
    // when a plain Gateway model string is supplied.
    const result = await generateText({
      model,
      system: system + memoryText,
      messages,
      tools: {
        set_task_plan: planTool,
        web_search: webSearchTool,
        read_webpage: readWebpageTool,
        execute_task: executeTaskTool,
        verify_result: verifyTool
      },
      stopWhen: stepCountIs(10),
      maxOutputTokens: 6000
    });

    const steps = Array.isArray(result.steps) ? result.steps : [];
    const toolEvents = steps.flatMap((step) => {
      const calls = Array.isArray(step.toolCalls) ? step.toolCalls : [];
      const outputs = Array.isArray(step.toolResults) ? step.toolResults : [];
      return calls.map((call, index) => ({
        name: call.toolName,
        input: call.input,
        output: outputs[index]?.output ?? null
      }));
    });

    return res.status(200).json({
      text: result.text,
      toolEvents,
      finishReason: result.finishReason || null,
      usage: result.usage || null
    });
  } catch (error) {
    console.error('tarotai chat error', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'AI request failed'
    });
  }
}
