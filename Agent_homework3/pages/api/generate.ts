import type { NextApiRequest, NextApiResponse } from 'next'

type Activity = { time: string; name: string; type: string; estimatedCost?: number }

// Basic input validation
function validateInput(body: any) {
  const errors: string[] = []
  const destination = String((body.destination || '').toString()).trim()
  const days = Number(body.days)
  const budget = body.budget == null ? null : Number(body.budget)
  const partySize = body.partySize == null ? 1 : Number(body.partySize)

  if (!destination) errors.push('目的地不能为空')
  if (!Number.isFinite(days) || days <= 0 || days > 30) errors.push('天数必须为 1-30 的整数')
  if (budget != null && (!Number.isFinite(budget) || budget < 0)) errors.push('预算必须为非负数字')
  if (!Number.isFinite(partySize) || partySize <= 0 || partySize > 50) errors.push('同行人数必须为 1-50 的整数')
  if (String(body.preferences || '').length > 1000) errors.push('偏好字段过长')

  return { ok: errors.length === 0, errors, cleaned: { destination, days, budget, partySize, preferences: body.preferences || '', transcript: body.transcript || '' } }
}

// Find the first JSON object substring by matching braces; returns substring or null
function extractJson(text: string): string | null {
  if (!text) return null
  const first = text.indexOf('{')
  if (first === -1) return null
  let depth = 0
  for (let i = first; i < text.length; i++) {
    const ch = text[i]
    if (ch === '{') depth++
    else if (ch === '}') depth--
    if (depth === 0) return text.slice(first, i + 1)
  }
  return null
}

// Try to sanitize common JSON issues produced by LLMs and then parse.
function sanitizeJsonString(s: string) {
  let t = s.trim()
  // remove triple backtick blocks and language markers
  t = t.replace(/```\s*json|```/gi, '')
  // replace smart quotes with plain quotes
  t = t.replace(/[“”]/g, '"').replace(/[‘’]/g, "'")
  // remove non-printable control characters except common whitespace
  t = t.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]+/g, '')
  // remove trailing commas before } or ]
  t = t.replace(/,\s*(?=[}\]])/g, '')
  // escape literal newlines inside quoted strings by replacing them with \n
  try {
    // avoid the /s flag for compatibility; use [\s\S] to match newlines
    t = t.replace(/"([^"\\]*(\\.[^"\\]*)*)"/g, (m) => m.replace(/\r?\n/g, '\\n'))
  } catch (e) {
    // if the regex fails in some JS runtimes, ignore this step
  }
  return t
}

function tryParseJsonTolerant(raw: string): any | null {
  if (!raw) return null
  try {
    return JSON.parse(raw)
  } catch (e) {
    // continue to sanitization
  }

  const cleaned = sanitizeJsonString(raw)
  try {
    return JSON.parse(cleaned)
  } catch (e) {
    // try to extract a balanced JSON substring from cleaned text
    const sub = extractJson(cleaned)
    if (sub) {
      try {
        return JSON.parse(sub)
      } catch (ee) {
        // fallthrough
      }
    }
  }

  // As a last resort, try json5 which tolerates trailing commas and some other common issues
  try {
    // require here to avoid breaking environments without the package until installed
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const JSON5 = require('json5')
    const cleaned2 = sanitizedForJson5(cleaned)
    try {
      return JSON5.parse(cleaned2)
    } catch (e) {
      // final fallthrough
    }
  } catch (ee) {
    // json5 not available or failed, ignore
  }

  return null
}

// Heuristic: determine if the raw LLM output was likely truncated (unbalanced braces or ends abruptly)
function isLikelyTruncated(raw: string) {
  if (!raw) return false
  const open = (raw.match(/{/g) || []).length
  const close = (raw.match(/}/g) || []).length
  if (open > close) return true
  // If it ends with a comma or within a quote without closing, treat as truncated
  const trimmed = raw.trim()
  if (/[,\[]$/.test(trimmed)) return true
  // if last non-space char is not '}' assume truncated
  const last = trimmed[trimmed.length - 1]
  if (last !== '}') return true
  return false
}

// Try to ask the LLM to complete a partial/truncated JSON snippet. Prefer Qianwen then OpenAI.
async function completePartialJson(partial: string, originalPrompt: string) {
  if (!partial) return null
  const schemaHint = `请仅返回有效的 JSON 对象并确保其符合以下结构（不要添加解释文本）：
${"{"}
  "itinerary": [ { "day": 1, "activities": [ {"time":"08:00","name":"xxx","type":"景点|餐厅|交通|住宿|其他","address":"可选","estimatedCost":100 } ] } ],
  "totalEstimatedCost": 1234,
  "accommodations": [{"name":"xxx","pricePerNight":300,"nights":3}],
  "transportPlan": "简要交通安排",
  "restaurants": [ {"name":"xxx","type":"xx","estimatedCostPerPerson":100} ],
  "summary": "一段简短摘要"
${"}"}`

  const prompt = `下面是一个被截断的模型输出，请根据上下文补全并返回完整的 JSON 对象，仅返回 JSON：\n\n截断内容:\n"""\n${partial}\n"""\n\n${schemaHint}\n\n原始生成请求（供参考）:\n${originalPrompt || ''}`

  try {
    if (process.env.QIANWEN_API_URL && process.env.QIANWEN_API_KEY) {
      const resp = await callQianwenWithRetry(prompt, 2)
      return resp
    }
    if (process.env.OPENAI_API_KEY) {
      const resp = await callOpenAIWithRetry(prompt, 2)
      return resp
    }
  } catch (err) {
    console.error('completePartialJson failed:', err)
  }
  return null
}

// Prepare a slightly different cleaned string for json5 parsing (allow comments etc.)
function sanitizedForJson5(s: string) {
  // json5 can handle single quotes and trailing commas; ensure control chars removed
  return s.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]+/g, '')
}

// Fetch with timeout helper (default timeout increased to 30s to be more tolerant of slow LLM endpoints)
async function fetchWithTimeout(url: string, opts: any = {}, timeoutMs = 30000) {
  const controller = new AbortController()
  const id = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(url, { signal: controller.signal, ...opts })
    clearTimeout(id)
    return res
  } catch (err) {
    clearTimeout(id)
    throw err
  }
}

// Call OpenAI with retries and timeout
async function callOpenAIWithRetry(prompt: string, maxRetries = 2) {
  const key = process.env.OPENAI_API_KEY
  if (!key) throw new Error('OPENAI_API_KEY 未配置')

  const body = {
    model: 'gpt-3.5-turbo',
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.6,
    max_tokens: 1500
  }

  let lastErr: any = null
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const resp = await fetchWithTimeout('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
        body: JSON.stringify(body)
      }, 15000)

      if (!resp.ok) {
        const txt = await resp.text().catch(() => '')
        throw new Error(`OpenAI error: ${resp.status} ${txt}`)
      }
      const j = await resp.json()
      const content = j?.choices?.[0]?.message?.content
      if (!content) throw new Error('OpenAI 返回空内容')
      return content
    } catch (err: any) {
      lastErr = err
      const backoff = 500 * Math.pow(2, attempt)
      // don't sleep after last attempt
      if (attempt < maxRetries) await new Promise(r => setTimeout(r, backoff))
    }
  }
  throw lastErr
}

// Call Qianwen (千问) or other custom LLM endpoint with retries
async function callQianwenWithRetry(prompt: string, maxRetries = 3) {
  const url = process.env.QIANWEN_API_URL
  const key = process.env.QIANWEN_API_KEY
  if (!url || !key) throw new Error('QIANWEN_API_URL or QIANWEN_API_KEY 未配置')
  const keyHeader = process.env.QIANWEN_API_KEY_HEADER || 'Authorization'

  const model = process.env.QIANWEN_MODEL || 'gpt-3.5-turbo'
  const maxTokens = Number(process.env.QIANWEN_MAX_TOKENS) || 1500
  const qBody = {
    model,
    messages: [{ role: 'user', content: prompt }],
    max_tokens: maxTokens,
    temperature: 0.6
  }

  // allow env overrides for timeout and retries to handle slow providers or long responses
  const baseTimeout = Number(process.env.QIANWEN_TIMEOUT_MS) || 60000 // default 60s
  const configuredRetries = Number(process.env.QIANWEN_MAX_RETRIES) || maxRetries

  let lastErr: any = null
  for (let attempt = 0; attempt <= configuredRetries; attempt++) {
    try {
      const headers: any = { 'Content-Type': 'application/json' }
      if (keyHeader === 'Authorization') headers['Authorization'] = `Bearer ${key}`
      else headers[keyHeader] = key

      // Use a longer timeout for each attempt. On retries we progressively increase timeout.
      const timeoutForAttempt = baseTimeout + attempt * 5000
      const resp = await fetchWithTimeout(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(qBody)
      }, timeoutForAttempt)

      if (!resp.ok) {
        const txt = await resp.text().catch(() => '')
        // If DashScope complains about invalid body, try common alternative request formats
        if (resp.status === 400 && txt && txt.toLowerCase().includes('required body invalid')) {
          const altBodies = [
            // OpenAI-compatible chat (already tried), next try simple prompt
            { model, prompt },
            { model, input: prompt },
            // messages.content as array of text objects
            { model, messages: [{ role: 'user', content: [{ type: 'text', text: prompt }] }] },
            // messages.content as object with text
            { model, messages: [{ role: 'user', content: { type: 'text', text: prompt } }] }
          ]
          for (const alt of altBodies) {
            try {
              const r2 = await fetchWithTimeout(url, { method: 'POST', headers, body: JSON.stringify(alt) }, timeoutForAttempt)
              if (!r2.ok) continue
              const ct2 = r2.headers.get('content-type') || ''
              if (ct2.includes('application/json')) {
                const j2 = await r2.json()
                if (typeof j2 === 'string') return j2
                if (j2?.choices?.[0]?.text) return j2.choices[0].text
                if (j2?.choices?.[0]?.message?.content) return j2.choices[0].message.content
                if (j2?.data?.[0]?.text) return j2.data[0].text
                return JSON.stringify(j2)
              }
              const txt2 = await r2.text()
              return txt2
            } catch (e) {
              // try next alternative
            }
          }
        }
        throw new Error(`Qianwen error: ${resp.status} ${txt}`)
      }

      // Try to parse JSON response; if not JSON, return text
      const ct = resp.headers.get('content-type') || ''
      if (ct.includes('application/json')) {
        const j = await resp.json()
        // Try common fields
        if (typeof j === 'string') return j
        if (j?.choices?.[0]?.text) return j.choices[0].text
        if (j?.choices?.[0]?.message?.content) return j.choices[0].message.content
        if (j?.data?.[0]?.text) return j.data[0].text
        // fallback to JSON string
        return JSON.stringify(j)
      }

      const txt = await resp.text()
      return txt
    } catch (err: any) {
      lastErr = err
      // If aborted (timeout), annotate message for clarity
      if (err && (err.name === 'AbortError' || String(err).toLowerCase().includes('aborted') || String(err).toLowerCase().includes('timeout'))) {
        lastErr = new Error(`request timed out (attempt ${attempt + 1}): ${err?.message || err}`)
      }
      const backoff = 700 * Math.pow(2, attempt)
      if (attempt < maxRetries) await new Promise(r => setTimeout(r, backoff))
    }
  }
  throw lastErr
}

// Try to convert arbitrary assistant/text output into the required JSON schema by asking the LLM to reformat.
// Prefer using Qianwen if available, otherwise OpenAI if configured.
async function convertTextToJson(rawText: string) {
  const schemaHint = `输出必须为可被机器解析的 JSON 对象，结构为:
{
  "itinerary": [ { "day": 1, "activities": [ {"time":"08:00","name":"xxx","type":"景点|餐厅|交通|住宿|其他","address":"可选","estimatedCost":100 } ] } ],
  "totalEstimatedCost": 1234,
  "accommodations": [{"name":"xxx","pricePerNight":300,"nights":3}],
  "transportPlan": "简要交通安排",
  "restaurants": [ {"name":"xxx","type":"xx","estimatedCostPerPerson":100} ],
  "summary": "一段简短摘要"
}`

  const prompt = `下面是一段模型的输出，请将其严格转换为上面描述的 JSON 结构并仅返回 JSON 对象，不要添加解释或多余文本。\n\n原始输出:\n"""\n${rawText}\n"""\n\n${schemaHint}`

  try {
    if (process.env.QIANWEN_API_URL && process.env.QIANWEN_API_KEY) {
      const resp = await callQianwenWithRetry(prompt, 2)
      return resp
    }
    if (process.env.OPENAI_API_KEY) {
      const resp = await callOpenAIWithRetry(prompt, 2)
      return resp
    }
  } catch (err) {
    console.error('convertTextToJson failed:', err)
  }
  return null
}

function makePrompt(payload: any) {
  const { destination, days, budget, partySize, preferences, transcript } = payload
  return `请作为旅行规划师，根据以下信息生成一个结构化的 JSON 行程：\n- 目的地：${destination}\n- 天数：${days}\n- 预算（总计，人民币）：${budget || '未指定'}\n- 同行人数：${partySize}\n- 偏好：${preferences || ''}\n- 其他语音输入：${transcript || ''}\n\n输出只应为一个 JSON 对象，格式如下：{\n  "itinerary": [ { "day": 1, "activities": [ {"time":"08:00","name":"xxx","type":"景点|餐厅|交通|住宿|其他","address":"可选","estimatedCost":100 } ] } ],\n  "totalEstimatedCost": 1234,\n  "accommodations": [{"name":"xxx","pricePerNight":300,"nights":3}],\n  "transportPlan": "租车/火车/飞机等简要说明",\n  "restaurants": [ {"name":"xxx","type":"xx","estimatedCostPerPerson":100} ],\n  "summary": "一段简短摘要"\n}\n\n注意：仅返回 JSON 对象，不要在 JSON 之外添加任何说明。` 
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).end()

  const validation = validateInput(req.body)
  if (!validation.ok) return res.status(400).json({ error: '参数验证失败', details: validation.errors })

  const { destination, days } = validation.cleaned

  // Prefer Qianwen (if configured), otherwise try OpenAI if configured
  const prompt = makePrompt(validation.cleaned)
  if (process.env.QIANWEN_API_URL && process.env.QIANWEN_API_KEY) {
    try {
      const content = await callQianwenWithRetry(prompt, 2)
      let jsonText = extractJson(content)
      // If direct extraction failed, try asking the LLM to convert to strict JSON
      if (!jsonText) {
        console.warn('Qianwen: 未从原始输出直接提取到 JSON，尝试用 convertTextToJson 重格式化')
        const converted = await convertTextToJson(content)
        if (converted) {
          jsonText = extractJson(converted)
          if (!jsonText) {
            // if converted appears to be full JSON string, try parsing directly
            try {
              const maybe = typeof converted === 'string' ? converted.trim() : ''
              if (maybe.startsWith('{') || maybe.startsWith('[')) jsonText = maybe
            } catch (e) {
              // ignore
            }
          }
        }
      }

      // If still not found and content looks truncated, attempt to ask the model to complete the JSON
      if (!jsonText && isLikelyTruncated(content)) {
        console.warn('Qianwen: 内容疑似被截断，尝试调用 completePartialJson 补全')
        const completed = await completePartialJson(content, prompt)
        if (completed) {
          jsonText = extractJson(completed)
          if (!jsonText) {
            const maybe = typeof completed === 'string' ? completed.trim() : ''
            if (maybe.startsWith('{') || maybe.startsWith('[')) jsonText = maybe
          }
        }
      }

      if (!jsonText) throw new Error('未从千问输出中提取到 JSON')
      const parsed = tryParseJsonTolerant(jsonText)
      if (!parsed) {
        console.error('Qianwen: JSON 解析失败，snippet length=', String(jsonText?.length || 0))
        // log a short preview for debugging
        console.error('Qianwen: snippet preview:', (jsonText || '').slice(0, 2000))
        throw new Error('Qianwen 输出的 JSON 无法解析')
      }
      return res.status(200).json(parsed)
    } catch (err: any) {
      console.error('Qianwen generation failed:', err?.message || err)
      // fall through to OpenAI if available
    }
  }

  if (process.env.OPENAI_API_KEY) {
    try {
      const content = await callOpenAIWithRetry(prompt, 2)
      let jsonText = extractJson(content)
      if (!jsonText) {
        console.warn('OpenAI: 未从原始输出直接提取到 JSON，尝试用 convertTextToJson 重格式化')
        const converted = await convertTextToJson(content)
        if (converted) {
          jsonText = extractJson(converted)
          if (!jsonText) {
            try {
              const maybe = typeof converted === 'string' ? converted.trim() : ''
              if (maybe.startsWith('{') || maybe.startsWith('[')) jsonText = maybe
            } catch (e) {
              // ignore
            }
          }
        }
      }

      if (!jsonText && isLikelyTruncated(content)) {
        console.warn('OpenAI: 内容疑似被截断，尝试调用 completePartialJson 补全')
        const completed = await completePartialJson(content, prompt)
        if (completed) {
          jsonText = extractJson(completed)
          if (!jsonText) {
            const maybe = typeof completed === 'string' ? completed.trim() : ''
            if (maybe.startsWith('{') || maybe.startsWith('[')) jsonText = maybe
          }
        }
      }

      if (!jsonText) throw new Error('未从模型输出中提取到 JSON')
      const parsed = tryParseJsonTolerant(jsonText)
      if (!parsed) {
        console.error('OpenAI: JSON 解析失败，snippet length=', String(jsonText?.length || 0))
        console.error('OpenAI: snippet preview:', (jsonText || '').slice(0, 2000))
        throw new Error('模型输出的 JSON 无法解析')
      }
      return res.status(200).json(parsed)
    } catch (err: any) {
      console.error('OpenAI generation failed:', err?.message || err)
      return res.status(502).json({ error: 'LLM 生成失败，已回退到 mock', detail: String(err?.message || err) })
    }
  }

  // Mock fallback (same structure as expected from OpenAI)
  const itinerary = [] as any[]
  for (let d = 1; d <= Number(days); d++) {
    const activities: Activity[] = [
      { time: '09:00', name: `${destination} 地标景点游览`, type: '景点', estimatedCost: 200 },
      { time: '12:00', name: `${destination} 本地美食午餐`, type: '餐厅', estimatedCost: 150 },
      { time: '14:00', name: `下午休闲/购物（根据偏好）`, type: '其他', estimatedCost: 100 },
      { time: '18:00', name: `晚餐推荐（家庭友好）`, type: '餐厅', estimatedCost: 200 }
    ]
    itinerary.push({ day: d, activities })
  }
  const totalEstimatedCost = itinerary.flatMap(i => i.activities.map((a: any) => a.estimatedCost || 0)).reduce((s, v) => s + v, 0)
  const result = {
    itinerary,
    totalEstimatedCost,
    accommodations: [{ name: `${destination} 推荐酒店`, pricePerNight: 800, nights: Number(days) }],
    transportPlan: '往返建议：飞机，城市内地铁/出租车',
    restaurants: [{ name: `${destination} 本地名店`, type: '本地菜', estimatedCostPerPerson: 120 }],
    summary: `为 ${destination} 生成 ${days} 天行程（使用 mock 数据）`
  }
  return res.status(200).json(result)
}
