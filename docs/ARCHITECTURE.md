# Architecture technique

## Vue d'ensemble

```
┌─────────────────────────────────────────────────────────────────┐
│                        Flux de données                          │
└─────────────────────────────────────────────────────────────────┘

    GitLab/GitHub                Cloudflare                   Local
    ─────────────                ──────────                   ─────
         │                           │                          │
         │ 1. MR Event               │                          │
         │ (reviewer assigned)       │                          │
         │                           │                          │
         ├──────────────────────────►│                          │
         │                           │ 2. Tunnel                │
         │                           ├─────────────────────────►│
         │                           │                          │
         │                           │                   ┌──────┴──────┐
         │                           │                   │   Fastify   │
         │                           │                   │   Server    │
         │                           │                   └──────┬──────┘
         │                           │                          │
         │                           │                   3. Verify signature
         │                           │                   4. Filter event
         │                           │                   5. Enqueue job
         │                           │                          │
         │                           │                   ┌──────┴──────┐
         │                           │                   │   p-queue   │
         │                           │                   │  (max 2)    │
         │                           │                   └──────┬──────┘
         │                           │                          │
         │                           │                   6. spawn claude
         │                           │                          │
         │                           │                   ┌──────┴──────┐
         │                           │                   │ Claude CLI  │
         │                           │                   │ /skill MR#  │
         │                           │                   └──────┬──────┘
         │                           │                          │
         │◄──────────────────────────┼──────────────────────────┤
         │                           │                   7. Post comments
         │ 8. Inline comments        │                      via glab api
         │    on MR                  │                          │
         │                           │                          │
```

## Structure des fichiers

```
src/
├── server.ts              # Point d'entrée Fastify
│
├── config/
│   └── loader.ts          # Chargement et validation config
│
├── security/
│   └── verifier.ts        # Vérification signatures webhook
│
├── webhooks/
│   ├── gitlab.handler.ts  # Handler GitLab
│   ├── github.handler.ts  # Handler GitHub
│   └── eventFilter.ts     # Logique de filtrage
│
├── queue/
│   └── reviewQueue.ts     # Gestion queue + déduplication
│
└── claude/
    └── invoker.ts         # Invocation CLI Claude
```

## Composants

### 1. Server (server.ts)

- **Framework** : Fastify 4.x
- **Rôle** : Point d'entrée HTTP, routing, raw body parsing
- **Particularité** : Custom content parser pour stocker le raw body (nécessaire pour HMAC GitHub)

### 2. Config Loader (config/loader.ts)

- Charge `config.json` et `.env`
- Validation stricte au démarrage
- Cache en mémoire (singleton)
- Fonctions de recherche de repo par URL ou path

### 3. Security Verifier (security/verifier.ts)

- **GitLab** : Comparaison token `X-Gitlab-Token` avec `timingSafeEqual`
- **GitHub** : Vérification HMAC-SHA256 de `X-Hub-Signature-256`
- Protection contre timing attacks

### 4. Event Filter (webhooks/eventFilter.ts)

Filtre les événements selon ces critères :

| Critère | GitLab | GitHub |
|---------|--------|--------|
| Type event | `merge_request` | `pull_request` |
| Action | `update` avec reviewers changed | `review_requested` |
| État | `opened` | `open` |
| Draft | Non | Non |
| Reviewer | Username dans la liste | `requested_reviewer.login` |

### 5. Review Queue (queue/reviewQueue.ts)

- **Librairie** : p-queue
- **Concurrence** : Configurable (défaut: 2)
- **Déduplication** : Map avec TTL (défaut: 5 min)
- **Tracking** : Jobs actifs et historique des 20 derniers

### 6. Claude Invoker (claude/invoker.ts)

```bash
claude --print --permission-mode dontAsk --model sonnet -p "/<skill> <MR_NUMBER>"
```

- **Spawn** : `child_process.spawn` (pas exec, pour gérer les gros outputs)
- **CWD** : Chemin local du repo configuré
- **Timeout** : 30 minutes max
- **Notifications** : `notify-send` au début et à la fin

## Sécurité

### Vérification des webhooks

```typescript
// GitLab : simple token comparison
const token = request.headers['x-gitlab-token'];
timingSafeEqual(Buffer.from(token), Buffer.from(expectedToken));

// GitHub : HMAC-SHA256
const hmac = createHmac('sha256', secret);
hmac.update(rawBody);
const expected = `sha256=${hmac.digest('hex')}`;
timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
```

### Pourquoi timingSafeEqual ?

Comparaison caractère par caractère = timing attack possible.
`timingSafeEqual` prend toujours le même temps quelque soit l'input.

## Déduplication

Problème : GitLab peut envoyer plusieurs webhooks pour le même événement (updates rapides).

Solution :
```typescript
const recentJobs = new Map<string, number>(); // jobId -> timestamp

function shouldDeduplicate(jobId: string): boolean {
  const lastRun = recentJobs.get(jobId);
  if (!lastRun) return false;
  return Date.now() - lastRun < deduplicationWindowMs;
}
```

Le job ID est `platform:projectPath:mrNumber`.

## Extension

### Ajouter une nouvelle plateforme

1. Créer `webhooks/newplatform.handler.ts`
2. Ajouter la vérification de signature dans `security/verifier.ts`
3. Ajouter le type dans `eventFilter.ts`
4. Enregistrer la route dans `server.ts`
5. Ajouter le type `platform` dans les configs

### Ajouter des notifications

Modifier `claude/invoker.ts` :
```typescript
// Slack
await fetch(slackWebhookUrl, { method: 'POST', body: JSON.stringify({ text }) });

// Email
await transporter.sendMail({ to, subject, text });
```
