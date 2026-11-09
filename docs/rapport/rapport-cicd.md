# Rapport CI/CD – SouverainRecrut Backend

Projet fil rouge CI/CD – M2 Sup de Vinci Rennes. Périmètre : API Backend uniquement.

| Partie | Statut |
|---|---|
| 3.1 Préparation du dépôt | ✅ |
| 3.2 Tests Backend | ✅ |
| 3.3 Analyse SonarQube | ✅ |
| 3.4 Mise en place de Jenkins | ✅ |
| 3.5 Automatisation de la chaîne CI | ✅ |
| 3.6 Image Docker / Docker Hub | ⏳ |
| 4. Provisionnement (Terraform, Ansible, GitLab) | ⏳ |
| 5. Déploiement et validation | ⏳ |

---

## 3.1 Préparation du dépôt

- Fork : `github.com/EAnathos/souverainrecrut`, branche de travail `Dev`.
- Stratégie de branches : développement sur `Dev`, intégration dans `main` par Pull Request.
- Vérification locale : `npm ci` puis `npx prisma generate` dans `backend/`.

## 3.2 Tests Backend

**Choix : Vitest + supertest.**
- Vitest : support natif de TypeScript (pas de ts-jest), rapide, couverture v8 intégrée.
- supertest : tests HTTP sur l'application Express sans démarrer de serveur.
- Prisma est mocké (`vitest-mock-extended`) : les tests ne nécessitent pas de base PostgreSQL, ils sont donc rapides et reproductibles dans la pipeline.

**Couverture fonctionnelle (64 tests, 8 fichiers dans `backend/tests/`) :**

| Domaine | Cas testés |
|---|---|
| Authentification | login valide (JWT, mot de passe absent de la réponse), email inconnu, mauvais mot de passe, `/auth/me` |
| Contrôle des accès | sans token, schéma non Bearer, token falsifié, token expiré, `RECRUITER` refusé sur les routes `ADMIN` (403) |
| Candidats, offres, candidatures, utilisateurs | CRUD, pagination, 404, doublon d'email (409), validation Zod (400), hachage bcrypt du mot de passe |
| Système | `/health`, `/ready` (base disponible / indisponible → 503), `/info`, dashboard, 404, erreur 500 sans fuite d'information |

**Commandes et rapports :**

```bash
npm test                 # exécution des tests
npm run test:coverage    # tests + couverture
```

| Rapport | Chemin | Utilisé par |
|---|---|---|
| Couverture LCOV | `backend/coverage/lcov.info` | SonarQube |
| Couverture HTML | `backend/coverage/index.html` | lecture humaine |
| Résultats JUnit | `backend/reports/junit.xml` | Jenkins |

**Résultat :** 64/64 tests OK, couverture 99,4 % des lignes. Un seuil de 80 % est imposé dans `vitest.config.ts` : en dessous, la commande échoue et bloque la pipeline.

## 3.3 Analyse de la qualité avec SonarQube

**Outil :** SonarQube Cloud (organisation `eanathos`, projet `EAnathos_souverainrecrut`).

**Configuration :** `backend/sonar-project.properties` (sources `src`, tests `tests`, rapport LCOV, exclusion de `server.ts` et de la documentation Swagger). Le token n'est jamais versionné : il est fourni par la variable `SONAR_TOKEN`.

```bash
cd backend
npm run test:coverage
SONAR_TOKEN=*** npx @sonar/scan
```

**Problèmes relevés à la première analyse et corrections :**

| Type | Règle | Problème | Correction |
|---|---|---|---|
| Vulnérabilité | typescript:S5689 | L'en-tête `X-Powered-By` révèle la technologie (Express) | `app.disable("x-powered-by")` + test associé |
| Code smell (×2) | typescript:S7773 | `parseInt` global | `Number.parseInt` |

**Quality Gate « Sonar way » (code neuf) :**

| Condition | Seuil | Résultat |
|---|---|---|
| Couverture | ≥ 80 % | 100 % |
| Duplications | ≤ 3 % | 0 % |
| Notes fiabilité / sécurité / maintenabilité | A | A / A / A |
| Security hotspots revus | 100 % | 100 % |

**Bilan global :** 0 bug, 0 vulnérabilité, 0 code smell, 0 hotspot, 0 % de duplication, 98,6 % de couverture. Statut du Quality Gate : **PASSED**.

📸 *Captures à joindre : tableau de bord SonarQube (Quality Gate PASSED), sortie de `npm run test:coverage`.*

## 3.4 Mise en place de Jenkins

**Choix : Jenkins conteneurisé, configuré « as code » (plugin Configuration as Code, JCasC).**
- Toute la configuration (compte admin, outils, serveur SonarCloud, credentials, job) est décrite dans des fichiers versionnés : Jenkins est reproductible avec une seule commande, sans clic dans l'interface.
- Une première installation configurée à la main a montré la limite de cette approche : après un changement de réglage de sécurité, le compte admin était perdu. Avec JCasC, la configuration est réappliquée à chaque démarrage.

**Fichiers (`jenkins/`) :**

| Fichier | Rôle |
|---|---|
| `Dockerfile` | Image `jenkins/jenkins:lts-jdk21` + CLI Docker + plugins préinstallés |
| `plugins.txt` | Liste des plugins |
| `casc/jenkins.yaml` | Configuration JCasC : sécurité, Node 22, SonarCloud, credentials, job pipeline |
| `docker-compose.yml` | Lancement du conteneur, montage du socket Docker et de la configuration |
| `.env.example` | Modèle des variables secrètes (le vrai `.env` n'est pas versionné) |

```bash
cd jenkins
cp .env.example .env      # puis renseigner les valeurs
docker compose up -d --build
# interface : http://localhost:8080
```

**Plugins :**

| Besoin | Plugins |
|---|---|
| Pipeline et Git | `workflow-aggregator`, `pipeline-stage-view`, `git` |
| Configuration as code | `configuration-as-code`, `job-dsl` |
| Intégration SonarQube | `sonar` |
| Outillage et rapports | `nodejs`, `junit`, `htmlpublisher`, `credentials-binding`, `ws-cleanup`, `timestamper` |

**Accès au dépôt GitHub :** le job `souverainrecrut-backend` lit le `Jenkinsfile` de la branche `Dev` de `https://github.com/EAnathos/souverainrecrut.git`. Le dépôt étant public, aucun credential GitHub n'est nécessaire.

**Credentials (aucun secret dans le dépôt) :**

| ID Jenkins | Type | Usage | Source de la valeur |
|---|---|---|---|
| `sonar-token` | Secret text | Analyse SonarCloud | `SONAR_TOKEN` dans `jenkins/.env` |
| `dockerhub` | Username / password | Publication de l'image | `DOCKERHUB_USERNAME` et `DOCKERHUB_TOKEN` (token d'accès, pas le mot de passe du compte) |
| compte `admin` | Utilisateur Jenkins | Connexion à l'interface | `JENKINS_ADMIN_ID` / `JENKINS_ADMIN_PASSWORD` |

`jenkins/.env` est exclu par le `.gitignore` (`**/.env`). Les valeurs sont injectées dans JCasC sous forme de variables (`${SONAR_TOKEN}`) et masquées dans les logs de build.

**Accès à Docker :** le socket Docker de l'hôte est monté dans le conteneur (`/var/run/docker.sock`) et l'image embarque uniquement le CLI Docker. Jenkins pilote donc le démon de l'hôte pour construire, scanner et pousser l'image. Le conteneur tourne en `root` pour accéder au socket : acceptable pour un Jenkins local de développement, à remplacer par un agent dédié dans un environnement partagé.

**Sécurité de l'instance :** base d'utilisateurs Jenkins, inscription désactivée, accès anonyme refusé (403), assistant d'installation désactivé.

## 3.5 Automatisation de la chaîne CI

**Pipeline déclaratif :** `Jenkinsfile` à la racine du dépôt. Chaque étape bloque la suivante en cas d'échec : l'image n'est publiée que si tous les contrôles sont verts.

| # | Stage | Commande | Critère bloquant |
|---|---|---|---|
| 1 | Checkout | `checkout scm` (branche `Dev`) | dépôt inaccessible |
| 2 | Install | `npm ci` puis `npx prisma generate` | dépendance ou client Prisma en erreur |
| 3 | Tests & couverture | `npm run test:coverage` | test en échec ou couverture < 80 % |
| 4 | Analyse SonarQube & Quality Gate | `npx @sonar/scan -Dsonar.qualitygate.wait=true` | Quality Gate en échec |
| 5 | Build TypeScript | `npm run build` | erreur de compilation |
| 6 | Build image Docker | `docker build -t souverainrecrut-backend:<build>` | échec du build |
| 7 | Scan Trivy | `aquasec/trivy:0.58.1 image --severity HIGH,CRITICAL --exit-code 1 --ignore-unfixed` | vulnérabilité HIGH ou CRITICAL corrigeable |
| 8 | Publication Docker Hub | `docker login` / `docker tag` / `docker push` | uniquement sur `Dev` ou `main` |

**Rapports publiés dans Jenkins :** résultats JUnit (`backend/reports/junit.xml`), couverture HTML (`backend/coverage/index.html`), archive du build (`backend/dist/**`).

**Déclenchement :** polling SCM toutes les 2 minutes (`H/2 * * * *`) sur la branche `Dev`. Un webhook GitHub n'est pas utilisable ici car Jenkins tourne sur `localhost`, inaccessible depuis GitHub.

**Contrôle du Quality Gate :** le paramètre `sonar.qualitygate.wait=true` fait attendre au scanner le verdict de SonarCloud (délai maximal de 300 s) et le fait échouer si le Quality Gate est rouge. Cette méthode remplace l'étape `waitForQualityGate`, qui suppose un webhook SonarCloud vers Jenkins, impossible vers `localhost`.

**Scan Trivy et corrections :** Trivy s'exécute dans un conteneur et lit l'image via le socket Docker ; sa base de vulnérabilités est conservée dans un volume (`trivy-cache`). Le premier scan a relevé 27 vulnérabilités HIGH/CRITICAL, toutes dans des paquets npm (l'Alpine de base était sain) :

| Origine | Exemples | Correction |
|---|---|---|
| npm embarqué dans l'image Node | `pacote`, `sigstore`, `picomatch`, `ip-address` | npm, npx et le cache retirés de l'image finale (inutiles à l'exécution) |
| Dépendances de l'application | `proxy-addr` (CRITICAL), `body-parser`, `js-yaml`, `fast-uri`, `brace-expansion` | `npm audit fix` |
| Dépendance transitive de Prisma | `deepmerge-ts` 7.1.5 | `@prisma/client` aligné sur le CLI (6.19.3) et `overrides` vers `deepmerge-ts` ^8 |

L'image a aussi été durcie : passage de `node:20-alpine` à `node:22-alpine` (aligné sur `engines`), ajout d'un `.dockerignore` (`node_modules`, `coverage`, `tests` ne sont plus copiés), `npm ci --omit=dev`. Après corrections : **0 vulnérabilité HIGH/CRITICAL**, les 64 tests passent et l'API démarre (réponse HTTP 200).

**Publication :** l'image est poussée sur Docker Hub sous `<DOCKERHUB_USERNAME>/souverainrecrut-backend` avec deux tags : le numéro du build (traçabilité) et `dev` (ou `latest` pour `main`). La connexion utilise le credential `dockerhub` et se termine par un `docker logout`.

**Résultat – build #5 (commit `0425e7f`) : SUCCESS en 10 min 28 s**

| Stage | Résultat | Durée |
|---|---|---|
| Checkout | ✅ | 1 s |
| Install | ✅ | 52 s |
| Tests & couverture | ✅ 8 fichiers de tests, 99,4 % des lignes | 8 s |
| Analyse SonarQube & Quality Gate | ✅ `QUALITY GATE STATUS: PASSED` | 4 min 04 s |
| Build TypeScript | ✅ | 8 s |
| Build image Docker | ✅ | 3 min 42 s |
| Scan Trivy | ✅ 0 HIGH, 0 CRITICAL | 17 s |
| Publication Docker Hub | ✅ tags `5` et `dev` (même digest) | 1 min 06 s |

**Problèmes rencontrés :**

| Problème | Cause | Solution |
|---|---|---|
| `Read-only file system` sur `backend@tmp` | Pipeline exécuté dans un dossier monté en lecture seule | Travail dans le workspace Jenkins (clone Git) |
| Build #4 en échec (`ECONNRESET`) | Coupure réseau pendant `npm ci` dans le build Docker | Relance ; erreur ponctuelle, sans lien avec la pipeline |
| Polling sans effet après passage sur GitHub | Jenkins interroge le dépôt du dernier build (ancien dépôt local) | Un build manuel, puis le polling utilise GitHub |

📸 *Captures à joindre : Stage View Jenkins du build #5, log « QUALITY GATE STATUS: PASSED », sortie Trivy (Total: 0), tags `5` et `dev` sur Docker Hub.*
