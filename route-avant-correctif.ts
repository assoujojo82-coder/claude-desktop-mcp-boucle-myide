/**
 * Serveur MCP intégré myide-pilot : les API du compte + relais vers
 * les serveurs MCP déclarés. Même garde que /api/mcp/servers (session).
 */

import { NextRequest, NextResponse } from 'next/server'
import { assistantCompletion } from '@/lib/ai/assistant-completion'
import { getAuthSession } from '@/lib/auth/session-auth'
import { executerPilotMcp, outilsPilotMcp } from '@/lib/code-agent/api-call'
import { postMcp } from '@/lib/code-agent/mcp-http'
import { userWorkspaceRootFor } from '@/lib/server/user-workspace'
import fs from '@/lib/execution/filesystem'
import path from 'path'
import { noterUsage, permis, verifierJeton } from '@/lib/auth/mcp-cles'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const FICHE = {
  name: 'myide-pilot',
  title: 'myide — pilote API et MCP',
  version: '1',
  protocol: 'mcp',
  transport: 'http-jsonrpc',
  endpoint: 'https://myide.tech/api/mcp/pilot',
  methods: ['initialize', 'tools/list', 'tools/call'],
  tools: ['lister_connecteurs', 'api_call', 'mcp'],
  usage:
    'POST une requête JSON-RPC. L’agent l’appelle avec mcp_call server="myide-pilot". Les API et serveurs se déclarent dans Mon compte → API et MCP.',
}

function ficheJson() {
  return NextResponse.json(FICHE, { headers: { Allow: 'GET, HEAD, POST, OPTIONS' } })
}

function ficheHtml() {
  const html = `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>myide-pilot — serveur MCP</title>
  <style>
    body{margin:0;min-height:100vh;background:#0b0b0c;color:#f4f4f5;font:16px/1.5 system-ui,sans-serif;padding:48px 24px}
    main{max-width:40rem;margin:0 auto}
    h1{font-size:1.75rem;font-weight:600;margin:0 0 .5rem}
    p,li{color:#a1a1aa}
    code{color:#e4e4e7;background:#18181b;padding:.1em .35em;border-radius:4px}
    a{color:#93c5fd}
  </style>
</head>
<body>
  <main>
    <p>Serveur MCP</p>
    <h1>myide-pilot</h1>
    <p>Ce n’est pas une page à cliquer. C’est le serveur JSON-RPC que l’agent appelle pour piloter tes API REST/SOAP/Access et tes autres serveurs MCP.</p>
    <ul>
      <li>Transport : <code>POST</code> JSON-RPC (<code>initialize</code>, <code>tools/list</code>, <code>tools/call</code>)</li>
      <li>Depuis l’IDE : <code>mcp_call</code> avec <code>server="myide-pilot"</code></li>
      <li>Déclarer une API ou un serveur : <a href="/ide">Mon compte → API et MCP</a></li>
    </ul>
    <p>Une URL publique se colle dans <code>api_call</code>. Une clé reste dans le coffre du compte.</p>
  </main>
</body>
</html>`
  return new NextResponse(html, {
    status: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8', Allow: 'GET, HEAD, POST, OPTIONS' },
  })
}

/** Le navigateur ouvre un GET : avant, Next renvoyait 405. */
export async function GET(request: NextRequest) {
  const accept = request.headers.get('accept') || ''
  if (accept.includes('text/html') && !accept.includes('application/json')) return ficheHtml()
  return ficheJson()
}

export async function HEAD() {
  return new NextResponse(null, { status: 200, headers: { Allow: 'GET, HEAD, POST, OPTIONS' } })
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: { Allow: 'GET, HEAD, POST, OPTIONS' } })
}

async function serveursMcp(userId: string) {
  try {
    const raw = await fs.readFile(path.join(await userWorkspaceRootFor(userId), '.cascade', 'mcp-servers.json'), 'utf8')
    const data = JSON.parse(raw) as Array<{ id: string; name: string; url: string; enabled?: boolean; headers?: Record<string, string> }>
    return Array.isArray(data) ? data.filter((s) => s?.enabled !== false && s?.url) : []
  } catch {
    return []
  }
}

export async function POST(request: NextRequest) {
  // Deux façons d'être identifiable : la session du navigateur, ou une CLÉ DURABLE
  // (`Authorization: Bearer myide_mcp_…` / `x-api-key`) pour un outil extérieur —
  // CAO, script, client MCP. Sans l'une des deux, on refuse : un identifiant fabriqué
  // par un visiteur anonyme n'ouvre pas le serveur MCP.
  const entete = request.headers.get('authorization') || ''
  const jeton = (entete.replace(/^Bearer\s+/i, '') || request.headers.get('x-api-key') || '').trim()
  const session = getAuthSession()
  const cle = jeton ? await verifierJeton(jeton) : null
  let uid: string
  if (jeton) {
    if (!cle) {
      return NextResponse.json(
        { jsonrpc: '2.0', id: null, error: { code: -32001, message: 'Clé refusée ou révoquée' } },
        { status: 401 },
      )
    }
    if (!permis(cle.id)) {
      return NextResponse.json(
        { jsonrpc: '2.0', id: null, error: { code: -32002, message: 'Trop d’appels : réessayez dans une minute' } },
        { status: 429 },
      )
    }
    void noterUsage(cle.id)
    uid = cle.userId
  } else if (session?.userId) {
    uid = session.userId
  } else {
    return NextResponse.json(
      {
        jsonrpc: '2.0',
        id: null,
        error: { code: -32000, message: 'Authentification requise (clé Bearer ou session)' },
      },
      { status: 401 },
    )
  }
  // Portées : une clé limitée à la lecture ne peut pas appeler un outil.
  const portee = (exigee: 'mcp:read' | 'mcp:call' | 'assistant:generate') =>
    !cle || cle.portees.includes(exigee)
      ? null
      : NextResponse.json(
          { jsonrpc: '2.0', id: null, error: { code: -32003, message: `Portée manquante : ${exigee}` } },
          { status: 403 },
        )
  const body = await request.json().catch(() => null)
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return NextResponse.json({ jsonrpc: '2.0', error: { code: -32600, message: 'Requête JSON-RPC unique' } }, { status: 400 })
  }
  const id = (body as { id?: unknown }).id ?? 1
  const method = String((body as { method?: unknown }).method || '')
  const params = ((body as { params?: Record<string, unknown> }).params || {}) as Record<string, unknown>

  if (method === 'initialize') {
    return NextResponse.json({
      jsonrpc: '2.0',
      id,
      result: {
        protocolVersion: '2025-06-18',
        capabilities: { tools: {} },
        serverInfo: { name: 'myide-pilot', version: '1' },
      },
    })
  }
  if (method === 'notifications/initialized') return new NextResponse(null, { status: 202 })
  if (method === 'tools/list') {
    const refusLecture = portee('mcp:read')
    if (refusLecture) return refusLecture
    const tools = await outilsPilotMcp(uid)
    return NextResponse.json({
      jsonrpc: '2.0',
      id,
      result: {
        tools: [{ name: 'assistant_completion', description: 'Moteur IA inclus myide pour un assistant externe. Génère une réponse ou une proposition CAO, sans exécuter les outils ni modifier les données. Identité et quotas du compte MCP.', inputSchema: { type: 'object', properties: { messages: { type: 'array' }, tools: { type: 'array' } }, required: ['messages'], additionalProperties: false } }, ...tools.map((t) => ({
          name: t.name,
          description: t.description,
          inputSchema: { type: 'object', additionalProperties: true },
        }))],
      },
    })
  }
  if (method === 'tools/call') {
    const nom = String((params as { name?: string }).name || '')
    const args = ((params as { arguments?: Record<string, unknown> }).arguments || {}) as Record<string, unknown>
    try {
      if (nom === 'assistant_completion') {
        const refus = portee('assistant:generate')
        if (refus) return refus
        const value = await assistantCompletion(uid, cle ? cle.email : session?.email, args)
        return NextResponse.json({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: JSON.stringify(value) }] } })
      }
      const refusAppel = portee('mcp:call')
      if (refusAppel) return refusAppel
      // Liaison de plateforme (2026-11-04) : l'e-mail du compte suit, comme dans le chat.
      const email = cle ? cle.email : session?.email
      const text = await executerPilotMcp({ userId: uid, email }, nom, args, {
        appelerMcp: async (server, tool, a) => {
          const liaison = await import('@/lib/integrations/liaison-plateforme')
          const servers = await serveursMcp(uid)
          const s = servers.find((x) => x.id === server || x.name === server)
          const url = s?.url || (liaison.plateformeDeNom(server) === 'synergieloc' && liaison.liaisonActive('synergieloc') ? liaison.CIBLES.synergieloc.url : '')
          if (!url) throw new Error(`Serveur MCP introuvable: ${server}`)
          const signe = await liaison.entetesLiaison({ userId: uid, email }, url)
          const res = await postMcp(
            url,
            { jsonrpc: '2.0', id: Date.now(), method: 'tools/call', params: { name: tool, arguments: a } },
            { headers: signe || s?.headers, delaiMs: 20_000 },
          )
          return (await res.text()).slice(0, 12_000)
        },
      })
      return NextResponse.json({
        jsonrpc: '2.0',
        id,
        result: { content: [{ type: 'text', text }] },
      })
    } catch (e) {
      return NextResponse.json({
        jsonrpc: '2.0',
        id,
        result: { isError: true, content: [{ type: 'text', text: e instanceof Error ? e.message : 'échec' }] },
      })
    }
  }
  return NextResponse.json({ jsonrpc: '2.0', id, error: { code: -32601, message: 'Méthode inconnue' } }, { status: 404 })
}
