# Conversation avec le support d'Anthropic

- **Canal :** claude.ai, menu « Obtenir de l'aide », puis « Envoyez-nous un message ». L'interlocuteur est l'agent automatique « Fin AI Agent ».
- **N° de conversation :** 215476915382275
- **Date :** 18/11/2026, vers 21:00 UTC.
- **Rubrique choisie :** « Problèmes techniques/Erreurs ».

Les messages sont retranscrits tels qu'affichés. Le prénom de l'utilisateur est remplacé par [utilisateur].

---

**Utilisateur :**

> Claude desktop MCP client: ~270,000 reconnect requests in 2 days to my MCP server, request for compensation. Product: Claude Pro, Claude desktop app (Code tab) on Windows 11 Pro, user agent claude-code/2.1.325 (claude-desktop, agent-sdk/0.3.325). Since at least 17 Nov 2026 (consistent, as long as the app is open), the app sent 269,551 GET requests to my MCP server https://myide.tech/api/mcp/pilot, about 2 per second. The client was trying to open the optional SSE listening stream (GET, Accept: text/event-stream). My server answered with a 200 JSON description instead of a stream or a 405, and the client reconnected immediately, again and again, with no exponential backoff and no retry limit. Over the same period only 48 real MCP calls (POST) were made. This put needless load on my production server and filled its logs. I have since made the server return 405 for that request, which stopped the loop on 18 Nov 2026 at 20:50 UTC, but a client should not retry without any delay in this situation. I am asking for: 1) compensation for the harm caused (a credit or refund on my subscription); 2) a fix in the client: backoff and a retry limit on the GET stream. I can provide nginx log excerpts on request. Thank you.

*Remarque :* au moment de ce message, seuls les journaux des 17 et 18/11 avaient été analysés. L'analyse complète, faite ensuite, montre que la boucle remonte au moins au 04/11 et totalise 1 308 136 requêtes GET (voir le README).

**Fin AI Agent :**

> Hi [utilisateur], thanks for the detailed write-up, and for pinning down the cause on your server side.
>
> **Client fix (backoff and retry limit):** Sharing the details here in this conversation is all that's needed to report this as a product bug, and your report already covers the product, the user agent, the behavior and the request volume. You can also send it from inside the app: in Claude Code in the Desktop app, /bug opens a feedback form that sends your report to Anthropic. There's currently no way to track the status of a fix, and reaching out multiple times about the same issue won't speed it up.
>
> **Compensation:** Payments are non-refundable except where our Terms say otherwise or where local law requires it. I can't confirm any credit or refund for the load on your server.
>
> I understand this may not be the outcome you hoped for, and I'm here if you have any other questions.
>
> Is that what you were looking for?

**Utilisateur :**

> No, this does not resolve my request. Please escalate this conversation to a human support agent. I would like a person to review my compensation request (a credit on my Claude Pro subscription) for the harm caused by the Claude desktop client's retry loop described above. Thank you.

**Fin AI Agent :**

> I understand this isn't the outcome you were hoping for, and I'll pass your conversation on to a human agent now for further review.

---

*En attente de la réponse d'un agent humain.*
