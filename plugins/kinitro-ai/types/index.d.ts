export type DomainChoice = { slug: string; name: string }

declare module 'claude-code' {
  interface PluginState {
    'kinitro-ai': {
      approved: DomainChoice[]
      current: string | null
      chooser: boolean
      selectorUrl: string | null
      bandNote: string | null
      bound: string | null
      testMode: boolean
      startPack: boolean
      contextKey: string
      sessionKey: { sid: string; key: string } | null
      approval: { sid: string; slug: string; request: string; url: string; domainName: string; agentName: string; expiresAt: string } | null
      secondNotice: boolean
      headless: boolean
    }
  }
}
