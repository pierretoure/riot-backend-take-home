# Cahier des charges — Riot Backend Take-Home

**Version** : 1.0 · **Date** : 2026-08-10

API HTTP exposant quatre endpoints — `/encrypt`, `/decrypt`, `/sign`, `/verify` — conformément au sujet (`README.md`).

---

## 1. Objectifs

| # | Objectif | Critère de réussite |
|---|---|---|
| O1 | Implémenter les 4 endpoints du sujet | Les exemples littéraux du README passent en test E2E |
| O2 | Rendre l'algorithme de chiffrement interchangeable | Remplacer Base64 par une autre implémentation = 1 nouvelle classe + 1 ligne de binding, aucun changement dans les services |
| O3 | Rendre l'algorithme de signature interchangeable | Idem pour HMAC-SHA256 |
| O4 | Garantir les propriétés de cohérence | `decrypt(encrypt(x)) === x` et `verify(sign(x), x) → 204`, vérifiés en property-based testing |
| O5 | Documenter l'API | Swagger UI servi par l'application, OpenAPI 3.x |

**Hors périmètre** (assumé et documenté dans le README) : persistance, authentification, rotation de clés HMAC, chiffrement au-delà de la profondeur 1.

---

## 2. Stack technique

| Élément | Choix |
|---|---|
| Langage | TypeScript, `strict: true`, aucun `any` |
| Framework | NestJS `11.1.28` |
| Runtime | Node.js 22 LTS |
| Tests | Jest + Supertest + fast-check |
| Doc API | `@nestjs/swagger` (OpenAPI 3.x) |
| Config | `@nestjs/config` + validation de schéma |
| Qualité | ESLint + Prettier |
| Crypto | Module `node:crypto` natif — aucune dépendance cryptographique tierce |

---

## 3. Architecture

### 3.1 Couches

```
HTTP  ──►  Controllers (routes, DTO, codes HTTP, Swagger)
             │  ne contient aucune logique métier
             ▼
           Services (domaine : parcours du payload, orchestration)
             │  ne dépend que d'interfaces (ports)
             ▼
           Adapters (implémentations concrètes : Base64, HMAC-SHA256)
```

Règle structurante : **le domaine ne connaît que des interfaces**. Il ignore Base64, HMAC et NestJS lui-même.

### 3.2 Ports

```ts
export interface Cipher {
  encrypt(plaintext: string): string;
  decrypt(ciphertext: string): string;
  /** Une chaîne peut-elle plausiblement être un chiffré produit par ce Cipher ? */
  looksEncrypted(value: string): boolean;
}

export interface Signer {
  sign(payload: string): string;
  verify(payload: string, signature: string): boolean;
}
```

`looksEncrypted` appartient au port car la détection est **spécifique à l'algorithme** : la déplacer dans le service casserait l'abstraction (une implémentation AES n'a pas la même heuristique qu'une implémentation Base64).

### 3.3 Injection de dépendances

Binding par token dans le module, un seul point de changement pour basculer d'algorithme :

```ts
// crypto.module.ts
providers: [
  { provide: CIPHER, useClass: Base64Cipher },   // ← seul point à modifier
  { provide: SIGNER, useClass: HmacSha256Signer },
  CryptoService,
  SignatureService,
]
```

**Preuve de l'abstraction** : la suite de contrat du port est exécutée via un `describe.each` sur la liste des adapters, de sorte qu'une seconde implémentation n'a qu'à y être ajoutée pour être tenue aux mêmes règles.

### 3.4 Arborescence cible

Trois emplacements, un par portée :

- **Tests unitaires** — `*.test.ts` à côté du fichier testé. La proximité rend la couverture visible d'un coup d'œil et évite une arborescence miroir à maintenir.
- **Tests d'intégration** — `src/<domaine>/test/`. Ils montent une application Nest et tapent les routes du domaine, mais restent **rattachés au domaine** : supprimer `crypto/` emporte ses tests avec lui.
- **Tests end-to-end** — `test/` à la racine, réservé aux parcours **enchaînant plusieurs requêtes HTTP**, où la sortie d'un appel devient l'entrée du suivant. Ils ne testent pas une route mais une propriété du système, et n'appartiennent donc à aucun domaine. Pour l'instant : `encrypt→decrypt` et `sign→verify`, soit exactement les deux exigences de cohérence du sujet.

```
src/
├── main.ts                             bootstrap, helmet, ValidationPipe, Swagger
├── app.module.ts
├── config/
│   ├── env.schema.ts                   validation fail-fast des variables d'env
│   ├── env.schema.test.ts
│   └── config.module.ts
├── common/
│   ├── filters/
│   │   ├── all-exceptions.filter.ts    filtre d'exceptions global
│   │   └── all-exceptions.filter.test.ts
│   ├── interceptors/
│   │   ├── logging.interceptor.ts      logging + request-id
│   │   └── logging.interceptor.test.ts
│   └── json/
│       ├── canonicalize.ts             RFC 8785 (tri récursif des clés)
│       ├── canonicalize.test.ts
│       ├── canonicalize.property.test.ts
│       └── json.types.ts               JsonValue, JsonObject
├── crypto/
│   ├── ports/cipher.port.ts
│   ├── adapters/
│   │   ├── base64.cipher.ts
│   │   ├── base64.cipher.test.ts
│   │   └── cipher.contract.test.ts     suite partagée, jouée contre tous les adapters
│   ├── crypto.service.ts
│   ├── crypto.service.test.ts
│   ├── crypto.service.property.test.ts round-trip decrypt(encrypt(x)) === x
│   ├── crypto.controller.ts
│   ├── crypto.module.ts
│   ├── dto/
│   └── test/                           intégration : routes du domaine crypto
│       ├── encrypt.integration.test.ts
│       ├── decrypt.integration.test.ts
│       └── crypto-errors.integration.test.ts
├── signature/
│   ├── ports/signer.port.ts
│   ├── adapters/
│   │   ├── hmac-sha256.signer.ts
│   │   ├── hmac-sha256.signer.test.ts
│   │   └── signer.contract.test.ts     suite partagée, jouée contre tous les adapters
│   ├── signature.service.ts
│   ├── signature.service.test.ts
│   ├── signature.service.property.test.ts
│   ├── signature.controller.ts
│   ├── signature.module.ts
│   ├── dto/
│   └── test/                           intégration : routes du domaine signature
│       ├── sign.integration.test.ts
│       ├── verify.integration.test.ts
│       └── signature-errors.integration.test.ts
├── health/health.controller.ts
└── testing/
    └── create-test-app.ts              factory d'application Nest, partagée intégration + e2e

test/                                   end-to-end : parcours multi-requêtes
├── encrypt-decrypt.e2e.test.ts         POST /encrypt → POST /decrypt === payload initial
└── sign-verify.e2e.test.ts             POST /sign → POST /verify === 204
```

Le helper `create-test-app.ts` vit dans `src/testing/` plutôt que dans `test/` : il est consommé par les deux portées, et le placer sous `src/` évite un import qui remonte hors du `rootDir` TypeScript. Il est exclu du build de production.

---

## 4. Spécifications fonctionnelles

### 4.1 `POST /encrypt`

- **Entrée** : n'importe quel objet JSON.
- **Traitement** : pour chaque propriété de **profondeur 1**, `base64(JSON.stringify(valeur))`.
- **Sortie** : `200`, objet dont toutes les valeurs sont des chaînes.

L'encodage passe **systématiquement** par `JSON.stringify`, y compris pour les chaînes. C'est ce qui préserve les types au déchiffrement et rend l'heuristique de détection cohérente.

| Valeur d'entrée | Encodé |
|---|---|
| `30` | `base64("30")` → `"MzA="` |
| `"John Doe"` | `base64("\"John Doe\"")` → `"IkpvaG4gRG9lIg=="` |
| `{"email":"…"}` | `base64("{\"email\":\"…\"}")` |
| `null` | `base64("null")` → `"bnVsbA=="` |

### 4.2 `POST /decrypt`

- **Entrée** : n'importe quel objet JSON.
- **Traitement** : pour chaque propriété de profondeur 1, si la valeur est une chaîne **détectée comme chiffrée**, la décoder et la reparser ; sinon la laisser strictement inchangée.
- **Sortie** : `200`.

**Heuristique de détection** (`Base64Cipher.looksEncrypted`), les 4 critères doivent passer :

1. La chaîne correspond à `/^[A-Za-z0-9+/]+={0,2}$/` et sa longueur est un multiple de 4.
2. Round-trip strict : `base64Encode(base64Decode(s)) === s`.
3. Les octets décodés forment de l'UTF-8 valide (décodage strict, rejet des séquences invalides).
4. `JSON.parse` du texte décodé réussit.

| Exemple | Résultat |
|---|---|
| `"1998-11-19"` | critère 1 KO (`-`, longueur 10) → laissé tel quel |
| `"John"` | critères 1–2 OK, 3 KO (octets `26 88 67`) → laissé tel quel |
| `"MzA="` | tous OK → `30` (number) |

**Limite connue, à documenter dans le README** : la détection est heuristique par construction. Une chaîne en clair qui serait à la fois du Base64 valide, de l'UTF-8 valide et du JSON valide (ex. l'utilisateur envoie littéralement `"MzA="`) sera décodée à tort. Aucune heuristique ne peut lever cette ambiguïté sans marqueur explicite dans le format — un `Cipher` à enveloppe (`enc:v1:…`) est mentionné comme alternative déterministe et écarté pour rester conforme au sujet.

### 4.3 `POST /sign`

- **Entrée** : n'importe quel objet JSON.
- **Traitement** : `HMAC-SHA256(secret, canonicalize(payload))`, encodé en hexadécimal minuscule.
- **Sortie** : `200`, **exclusivement** `{ "signature": "<hex>" }`.

### 4.4 `POST /verify`

- **Entrée** : `{ "signature": string, "data": JsonValue }`, les deux propriétés obligatoires.
- **Traitement** : recalcul du HMAC sur `canonicalize(data)`, puis comparaison **en temps constant** (`crypto.timingSafeEqual`, précédée d'une égalité de longueur).
- **Sortie** : `204` si valide, `400` sinon.

### 4.5 Canonicalisation JSON

Fonction pure `canonicalize(value: JsonValue): string`, inspirée de RFC 8785 (JCS) :

- **Objets** : clés triées par ordre lexicographique de code unit UTF-16, **récursivement à tous les niveaux**.
- **Tableaux** : ordre **strictement préservé** (c'est une donnée, pas un ensemble) ; les éléments sont canonicalisés récursivement.
- **Sérialisation** : les conteneurs (`{…}`, `[…]`) sont assemblés **manuellement** à partir du tableau de clés trié ; seules les primitives passent par `JSON.stringify`, ce qui fixe la représentation des nombres (format ES6/`Number::toString`), des chaînes et des booléens.
- **Pourquoi pas `JSON.stringify` sur un objet retrié** : la spécification ECMAScript impose que les clés ressemblant à des indices de tableau (`"1"`, `"2"`, `"10"`) soient énumérées en ordre **numérique croissant**, avant toutes les autres clés, quel que soit l'ordre d'insertion. `Object.keys` et donc `JSON.stringify` héritent de ce comportement. Reconstruire un objet avec les clés réinsérées dans l'ordre trié puis le sérialiser **annulerait silencieusement le tri** : `{"1","10","2"}` deviendrait `{"1","2","10"}`. Assembler la chaîne soi-même contourne entièrement le moteur. Un test dédié verrouille ce cas.
- **`null`** : conservé comme valeur à part entière ; `{"a": null}` et `{}` produisent des signatures **différentes**.
- **Écart assumé vs RFC 8785 strict** : pas de normalisation Unicode NFC appliquée aux chaînes. Deux représentations Unicode différentes du même caractère perçu produisent donc deux signatures différentes. Acceptable ici (signataire et vérificateur sont le même service) et documenté.

---

## 5. Gestion de la configuration

Variables d'environnement, chargées via `@nestjs/config` (module global) et validées par un schéma au démarrage.

| Variable | Requis | Défaut | Contrainte |
|---|---|---|---|
| `SIGNER_SECRET` | oui | — | chaîne, ≥ 32 caractères |
| `PORT` | non | `3000` | entier 1–65535 |
| `NODE_ENV` | non | `development` | `development` \| `test` \| `production` |
| `LOG_LEVEL` | non | `log` | niveau NestJS : `fatal`, `error`, `warn`, `log`, `debug`, `verbose` |

- **Fail-fast** : si `SIGNER_SECRET` est absent ou trop court, l'application **refuse de démarrer** avec un message explicite. Aucune valeur par défaut de secret n'existe dans le code.
- `.env.example` est versionné ; `.env` est ignoré par git.
- Le secret n'est jamais journalisé, ni exposé dans une réponse d'erreur, ni présent dans Swagger.

---

## 6. Gestion des erreurs

`ValidationPipe` global (`whitelist`, `forbidNonWhitelisted`, `transform`) + filtre d'exceptions global produisant un format homogène :

**Limite structurelle du `ValidationPipe` ici** : `whitelist: true` supprime toute propriété non décorée d'un DTO. Or trois des quatre routes acceptent un **JSON arbitraire** — un DTO en classe y réduirait systématiquement le payload à `{}`, ce qui casserait les endpoints au lieu de les protéger. Les corps de requête sont donc typés par des **interfaces** TypeScript (que Nest expose comme métatype `Object`, et que le pipe ignore de ce fait), et validés par des fonctions de parsing explicites levant `BadRequestException` : `parseSignRequest`, `parseVerifyRequest`, et leurs équivalents côté crypto. Le `ValidationPipe` global reste en place pour les DTO à forme fixe qui pourraient apparaître plus tard. Corollaire assumé : `class-validator` et `class-transformer` ne sont pas utilisés, et ne sont donc pas installés.

```json
{
  "statusCode": 400,
  "error": "Bad Request",
  "message": "Property \"signature\" must be a non-empty string",
  "requestId": "01J…"
}
```

| Cas | Réponse |
|---|---|
| Body vide, JSON malformé, `Content-Type` non JSON | `400` |
| Racine non-objet (tableau ou scalaire) sur `/encrypt`, `/decrypt`, `/sign` | `400` |
| `/verify` sans `signature` ou sans `data` | `400` |
| Signature invalide ou payload altéré | `400` |
| Body dépassant la limite de taille | `413` |

**Exigence transverse** : aucune entrée client, quelle qu'elle soit, ne doit produire un `500`. Un test E2E dédié couvre les entrées pathologiques.

---

## 7. Documentation API

- `@nestjs/swagger`, spécification OpenAPI 3.x, UI servie sur `/docs`, JSON sur `/docs-json`.
- Chaque endpoint documente : description, schéma de requête, tous les codes de réponse possibles, et un exemple **repris littéralement du sujet**.
- Les DTO portent les décorateurs `@ApiProperty` ; les payloads libres sont typés `additionalProperties: true`.

---

## 8. Sécurité

- Comparaison de signature en **temps constant** — une comparaison `===` est explicitement proscrite.
- `helmet` activé.
- Limite de taille du body : `100kb`.
- Rate limiting via `@nestjs/throttler`.
- Endpoint `GET /health` → `200 { "status": "ok" }`, non soumis au rate limiting.
- Garde de profondeur/taille sur le parcours des payloads pour éviter les JSON pathologiques.
- Aucun secret ni payload en clair dans les logs.

---

## 9. Observabilité

- Logs structurés en JSON.
- Interceptor de logging : `requestId` (généré ou repris de l'en-tête `x-request-id`), méthode, route, statut, durée.
- Le `requestId` est renvoyé dans l'en-tête de réponse et inclus dans les corps d'erreur.
- **Jamais** de contenu de payload, de secret ni de signature complète dans les logs.

---

## 10. Stratégie de tests

| Niveau | Portée |
|---|---|
| **Unitaire** (`*.test.ts`, colocalisé) | `canonicalize` (tri récursif, tableaux, `null`, nombres, imbrication profonde) ; `Base64Cipher` (encodage, décodage, `looksEncrypted` avec sa table de cas) ; `HmacSha256Signer` ; `CryptoService` ; `SignatureService` ; filtre et interceptor |
| **Contrat d'interchangeabilité** (`*.contract.test.ts`) | Suite partagée exprimant le contrat du port, exécutée via `describe.each` contre `Base64Cipher` **et** l'implémentation alternative — l'abstraction est prouvée, pas seulement affirmée |
| **Intégration** (`src/<domaine>/test/*.integration.test.ts`, Supertest) | Les 4 routes sur une application Nest réelle, une requête à la fois : reproduction littérale de **tous** les exemples du sujet ; invariance à l'ordre des propriétés sur `/sign` et `/verify` ; payload altéré → `400` ; table complète des cas d'erreur de la section 6 |
| **End-to-end** (`test/*.e2e.test.ts`, Supertest) | Les deux exigences de cohérence du sujet, en enchaînant les requêtes : `POST /encrypt` → `POST /decrypt` restitue le payload initial (types inclus) ; `POST /sign` → `POST /verify` retourne `204`. Aucune valeur intermédiaire codée en dur — la sortie du premier appel alimente le second |
| **Property-based (fast-check)** | `decrypt(encrypt(x))` ≡ `x` · `verify(sign(x), x)` → `204` · `canonicalize(x)` ≡ `canonicalize(shuffleKeys(x))` · `canonicalize(x)` ≠ `canonicalize(y)` pour `x ≠ y`. Générateur de JSON arbitraire incluant unicode, chaînes vides, nombres négatifs et flottants, `null`, imbrication profonde |

Jest est configuré en trois projets, pour pouvoir lancer la boucle rapide seule pendant le développement :

| Script | Portée |
|---|---|
| `test:unit` | `src/**/*.test.ts`, **hors** `src/**/test/**` |
| `test:integration` | `src/**/test/*.integration.test.ts` |
| `test:e2e` | `test/*.e2e.test.ts` |

L'exclusion de `src/**/test/**` dans le projet unitaire est nécessaire, sans quoi les tests d'intégration seraient ramassés deux fois.

**Les trois suites sont bloquantes en CI** (voir section 11) : un échec unitaire, d'intégration ou e2e fait échouer le build. Seule la **couverture** n'est pas soumise à un seuil bloquant ; elle est rapportée à titre informatif.

---

## 11. Livraison

**CI — GitHub Actions**, sur chaque push et chaque pull request :

```
install → lint → typecheck → test:unit → test:integration → test:e2e → build
```

**Étapes bloquantes** : `test:unit`, `test:integration` et `test:e2e` sont des gates. Un seul test en échec fait échouer le job — aucun `continue-on-error`, aucune étape de test marquée optionnelle, et Jest est lancé avec `--ci --passWithNoTests=false` pour qu'une suite vide ou un snapshot manquant échoue au lieu de passer silencieusement. Le job s'exécute avec un `SIGNER_SECRET` de test fourni par le workflow.

La branche `main` est protégée : le merge d'une pull request exige le job CI vert.

**Docker**

- `Dockerfile` multi-stage (build → runtime slim), utilisateur non-root, `HEALTHCHECK` sur `/health`.
- `docker-compose.yml` : démarrage en une commande, lecture du `.env`.

**Dépôt**

- Commits atomiques au format Conventional Commits.
- `README.md` propre remplaçant le sujet, contenant : démarrage rapide, variables d'environnement, exemples `curl` des 4 endpoints, décisions d'architecture, **limites connues** (heuristique de détection, écart Unicode vs JCS), et pistes d'évolution (rotation de clés HMAC, signature asymétrique, chiffrement récursif).

---

## 12. Critères d'acceptation

- [ ] Les 4 endpoints répondent conformément aux exemples du sujet.
- [ ] `/encrypt` → `/decrypt` restitue le payload original, **types inclus**.
- [ ] `/sign` → `/verify` retourne `204`, indépendamment de l'ordre des propriétés à tous les niveaux d'imbrication.
- [ ] Un payload ou une signature altérés retournent `400`.
- [ ] Les propriétés non chiffrées traversent `/decrypt` sans modification.
- [ ] Changer d'algorithme de chiffrement ne requiert de modifier qu'un seul binding de module.
- [ ] L'application refuse de démarrer sans `SIGNER_SECRET` valide.
- [ ] Aucune entrée client ne produit de `500`.
- [ ] Swagger UI accessible et complet.
- [ ] La CI est verte, tests unitaires, d'intégration et e2e bloquants.
