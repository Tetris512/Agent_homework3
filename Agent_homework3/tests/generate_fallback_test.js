// Simple test harness to POST truncated snippets to /api/generate-debug
// Usage: node tests/generate_fallback_test.js

const fetch = global.fetch || require('node-fetch')

const samples = [
  `{
  "itinerary": [
    {
      "day": 1,
      "activities": [
        {
          "time": "08:00",
          "name": "抵达东京成田机场",
          "type": "交通",
          "estimatedCost": 200
        },
        {
          "time": "09:30",
          "name": "入住新宿区酒店",
          "type": "住宿",
          "address": "东京都新宿区西新宿1-1-1",
          "estimatedCost": 600
        },
        {
          "time": "12:00",
          "name": "博多一风堂拉面（新宿店）",
          "type": "餐厅",
          "address": "东京都新宿区新宿3-36-12",
          "estimatedCost": 80
        },
        {
          "time": "14:00",
          "name": "秋叶原电器街与动漫商店巡礼",
          "type": "景点",
          "address": "东京都千代田区外神田",
          "estimatedCost": 0
        },
        {
          "time": "18:00",
          "name": "Maidreamin女仆餐厅体验",
          "type": "餐厅",
          "address": "东京都千代田区外神田4-3-7",
          "estimatedCost": 120
        }
      ]
    },
    {
      "day": 2,
      "activities": [
        {
          "time": "09:00",
          "name": "浅草寺与雷门参观",
          "type": "景点",
          "address": "东京都台东区浅草2-3-1",
          "estimatedCost": 0
        },
        {
          "time": "11:30",
          "name": "浅草今半寿喜烧",
          "type": "餐厅",
          "address": "东京都台东区浅草1-25-10",
          "estimatedCost": 200
        },
        {
          "time": "14:00",
          "name": "东京晴空塔登塔",
          "type": "景点",
          "address": "东京都墨田区押上1-1-2",
          "estimatedCost": 150
        },
        {
          "time": "18:00",
          "name": "动漫主题餐厅：Pittoresque",
          "type": "餐厅",
          "address": "东京都丰岛区东池袋1-8-1",
          "estimatedCost": 130
        }
      ]
    },
    {
      "day": 3,
      "activities": [
        {
          "time": "08:00",
          "name": "乘坐JR前往镰仓",
          "type": "交通",
          "estimatedCost": 100
        },
        {
          "time": "10:00",
          "name": "镰仓大佛与长谷寺",
          "type": "景点",
          "address": "神奈川县镰仓市长谷4-2-28",
          "estimatedCost": 80
        }
      ]
    }
  ],
  "summary": "示例截断片段"
`,
]

async function run() {
  const url = 'http://localhost:3000/api/generate-debug'
  for (const s of samples) {
    console.log('Posting sample (len=' + s.length + ')')
    const resp = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rawText: s }) })
    const j = await resp.json()
    console.log(JSON.stringify(j, null, 2))
    if (j.parsedSanitized && j.parsedSanitized.ok) console.log('Parsed sanitized OK')
    else console.error('Parsed sanitized failed:', j.parsedSanitized?.error)
  }
}

run().catch(e => { console.error(e); process.exit(1) })
