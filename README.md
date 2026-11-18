# Boucle de reconnexion du client MCP de Claude desktop vers myide.tech

Dossier de constat, en lecture seule. Collecte faite le **2026-11-18 à 21:02:40 UTC**.

## Les faits

Du **4 au 18 novembre 2026**, l'application Claude desktop (Claude Code, `claude-code/2.1.317` puis `2.1.325`, `agent-sdk`) a envoyé **1 308 136 requêtes GET** au serveur MCP `https://myide.tech/api/mcp/pilot`. Sur la même période, elle n'a fait que **667 requêtes POST**, qui sont les vrais échanges MCP. Ce chiffre de 1,3 million ne couvre que les 15 jours encore présents dans les journaux. Les jours précédents ont déjà été effacés par la rotation.

Les requêtes arrivaient environ **2 fois par seconde**, sans interruption tant que l'application était ouverte. Elles ont cessé le **18/11/2026 à 20:50 UTC**, après le correctif côté serveur décrit plus bas.

| Jour | GET (Claude desktop) | POST (Claude desktop) |
|---|---:|---:|
| 04/11 | 24 890 | 140 |
| 05/11 | 46 972 | 16 |
| 06/11 | 33 138 | 88 |
| 07/11 | 856 | 20 |
| 08/11 | 32 144 | 16 |
| 09/11 | 148 676 | 47 |
| 10/11 | 154 253 | 25 |
| 11/11 | 162 361 | 124 |
| 12/11 | 126 041 | 107 |
| 13/11 | 176 842 | 12 |
| 14/11 | 64 284 | 4 |
| 15/11 | 54 211 | 0 |
| 16/11 | 11 908 | 24 |
| 17/11 | 75 240 | 36 |
| 18/11 | 196 320 | 8 |
| **Total** | **1 308 136** | **667** |

## Le mécanisme

Le transport HTTP de MCP permet au client d'ouvrir un canal d'écoute facultatif, par un `GET` avec `Accept: text/event-stream`. Le serveur doit alors faire l'une de deux choses :
- ouvrir un flux SSE ;
- répondre `405 Method Not Allowed`.

Jusqu'au correctif, myide répondait à tout GET par une fiche descriptive JSON avec le code `200`. Voir le fichier `route-avant-correctif.ts`, fonction `GET`.

Le client Claude desktop recevait donc 200 sans flux. Il **se reconnectait aussitôt, en boucle**, sans délai croissant entre les tentatives (backoff) et sans nombre maximal de tentatives.

Les deux côtés y ont leur part :
- **myide** ne renvoyait pas le 405 prévu par la norme. C'est corrigé dans `route-apres-correctif.ts` : un GET qui demande un flux reçoit 405, et la boucle s'est arrêtée immédiatement.
- **Le client Claude desktop** a réessayé pendant 15 jours, à environ 2 requêtes par seconde, sans jamais ralentir.

## Démarches auprès d'Anthropic

Voir [`conversation-support.md`](conversation-support.md), conversation n° 215476915382275 du 18/11/2026.
- L'agent automatique du support a enregistré le défaut du client.
- Il a refusé tout crédit ou remboursement.
- La demande a ensuite été transmise à un agent humain pour réexamen.

## Contenu du dossier

| Fichier | Contenu |
|---|---|
| `extrait-api-mcp-pilot.log.gz` | Toutes les lignes du journal nginx qui concernent `/api/mcp/pilot`, du 04/11 au 18/11/2026. **Les adresses IP sont remplacées par un pseudonyme** (empreinte salée). Il n'y a ni clé, ni jeton, ni adresse e-mail. |
| `decompte-par-jour.csv` | Nombre de requêtes par jour, méthode, code de réponse et client. |
| `decompte-par-minute.csv` | Nombre de requêtes par minute, méthode et code de réponse. |
| `route-avant-correctif.ts` / `route-apres-correctif.ts` | Le code de la route serveur avant et après le correctif. |
| `SHA256-journaux-bruts.txt` | Empreintes SHA-256 des journaux nginx bruts. Ils sont conservés hors ligne et ne sont pas publiés, car ils contiennent les adresses IP d'autres visiteurs. |
| `SHA256-public.txt` | Empreintes des fichiers publiés. La ligne `extrait-api-mcp-pilot.log` correspond au fichier `.gz` une fois décompressé. |
| `horodatage-collecte.txt` | Date et heure de la collecte. |

## Vérifier les fichiers

```bash
gunzip -k extrait-api-mcp-pilot.log.gz
sha256sum -c SHA256-public.txt
```

Ce dépôt est archivé sur GitHub, donc en lecture seule. Son historique Git sert d'horodatage de publication.
