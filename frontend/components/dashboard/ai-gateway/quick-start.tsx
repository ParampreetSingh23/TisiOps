"use client"

import { Check, Copy } from "lucide-react"
import { useEffect, useState } from "react"

export function QuickStart() {
  const [activeTab, setActiveTab] = useState<"curl" | "node" | "python">("curl")
  const [copied, setCopied] = useState(false)
  const [host, setHost] = useState("https://api.tisiops.com")

  useEffect(() => {
    if (typeof window !== "undefined" && window.location.origin) {
      setHost(window.location.origin)
    }
  }, [])

  const curlCode = `curl ${host}/api/v1/ai/chat \\
  -H "Authorization: Bearer $TISIOPS_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "gemini-flash",
    "messages": [
      {
        "role": "user",
        "content": "Analyze my deployment error and recommend an infrastructure fix."
      }
    ],
    "temperature": 0.3,
    "maxTokens": 1000
  }'`

  const nodeCode = `import fetch from "node-fetch";

const response = await fetch("${host}/api/v1/ai/chat", {
  method: "POST",
  headers: {
    "Authorization": \`Bearer \${process.env.TISIOPS_API_KEY}\`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    model: "gemini-flash",
    messages: [
      {
        role: "user",
        content: "Analyze my deployment error and recommend an infrastructure fix.",
      },
    ],
    temperature: 0.3,
    maxTokens: 1000,
  }),
});

const data = await response.json();
console.log(data.content);`

  const pythonCode = `import os
import requests

response = requests.post(
    "${host}/api/v1/ai/chat",
    headers={
        "Authorization": f"Bearer {os.environ['TISIOPS_API_KEY']}",
        "Content-Type": "application/json",
    },
    json={
        "model": "gemini-flash",
        "messages": [
            {
                "role": "user",
                "content": "Analyze my deployment error and recommend an infrastructure fix.",
            }
        ],
        "temperature": 0.3,
        "maxTokens": 1000,
    },
)

data = response.json()
print(data["content"])`

  const currentCode =
    activeTab === "curl" ? curlCode : activeTab === "node" ? nodeCode : pythonCode

  function handleCopy() {
    navigator.clipboard.writeText(currentCode)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <section id="quick-start" className="space-y-4">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-heading text-lg font-medium tracking-[-0.02em] text-ink-strong">
            Quick Start & Integration
          </h2>
          <p className="text-xs text-ink-muted">
            Send your first AI chat completion request using your favorite client language or CLI.
          </p>
        </div>

        {/* Tab Controls */}
        <div className="flex items-center gap-1 rounded-[6px] border border-line bg-surface p-1">
          <button
            onClick={() => setActiveTab("curl")}
            className={`rounded-[4px] px-3 py-1 text-xs font-mono transition-colors ${
              activeTab === "curl"
                ? "bg-brand text-white font-semibold shadow-xs"
                : "text-ink-muted hover:text-ink-strong hover:bg-canvas"
            }`}
          >
            cURL
          </button>
          <button
            onClick={() => setActiveTab("node")}
            className={`rounded-[4px] px-3 py-1 text-xs font-mono transition-colors ${
              activeTab === "node"
                ? "bg-brand text-white font-semibold shadow-xs"
                : "text-ink-muted hover:text-ink-strong hover:bg-canvas"
            }`}
          >
            Node.js
          </button>
          <button
            onClick={() => setActiveTab("python")}
            className={`rounded-[4px] px-3 py-1 text-xs font-mono transition-colors ${
              activeTab === "python"
                ? "bg-brand text-white font-semibold shadow-xs"
                : "text-ink-muted hover:text-ink-strong hover:bg-canvas"
            }`}
          >
            Python
          </button>
        </div>
      </div>

      {/* Code Snippet Box */}
      <div className="overflow-hidden rounded-[8px] border border-line bg-canvas shadow-card">
        <div className="flex items-center justify-between border-b border-line bg-surface/50 px-4 py-2.5">
          <span className="font-mono text-xs text-ink-muted">
            {activeTab === "curl" ? "bash" : activeTab === "node" ? "typescript" : "python"}
          </span>
          <button
            onClick={handleCopy}
            className="inline-flex h-7 items-center gap-1.5 rounded-[4px] border border-line bg-surface px-2.5 text-xs text-ink-default hover:border-line-warm transition-colors"
          >
            {copied ? (
              <>
                <Check className="size-3 text-emerald-600" />
                <span className="text-[11px]">Copied snippet</span>
              </>
            ) : (
              <>
                <Copy className="size-3 text-ink-muted" />
                <span className="text-[11px]">Copy snippet</span>
              </>
            )}
          </button>
        </div>

        <pre className="scrollbar-subtle overflow-x-auto p-5 font-mono text-xs leading-relaxed text-ink-strong select-all">
          <code>{currentCode}</code>
        </pre>

        <div className="border-t border-line bg-surface/40 px-5 py-3 text-[11px] font-mono text-ink-muted flex items-center justify-between">
          <span>Supported by all standard OpenAI-compatible SDKs</span>
          <span>Automatic token usage accounting enabled</span>
        </div>
      </div>
    </section>
  )
}
