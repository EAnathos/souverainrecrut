# Architecture CI/CD – SouverainRecrut Backend

Ce document décrit l'architecture de la chaîne de livraison de l'API Backend : les composants, leurs responsabilités, les flux entre eux et les choix de sécurité. Le détail de la mise en œuvre est dans le [rapport CI/CD](rapport-final.md).

## 1. Vue d'ensemble

```
                         CHAÎNE D'INTÉGRATION ET DE PUBLICATION
┌──────────────┐   polling   ┌──────────────────────────────────────────────────────────┐
│ GitHub       │ ──────────► │ Jenkins (conteneur, poste de développement)               │
│ branche Dev  │             │ install → tests → SonarCloud → build → Trivy → publication│
└──────────────┘             └───────────────────────────────┬──────────────────────────┘
                                                             │ push (token d'écriture)
                                                             ▼
                                              ┌──────────────────────────────┐
                                              │ Docker Hub                    │
                                              │ souverainrecrut-backend:<tag> │
                                              │ …-backend-migrate:<tag>       │
                                              └──────────────┬───────────────┘
                                                             │ pull (token de lecture)
                         CHAÎNE DE PROVISIONNEMENT ET DE DÉPLOIEMENT
┌───────────────────────┐  SSH   ┌───────────────────────────▼──────────────────────────┐
│ Poste d'administration │ ─────► │ VM Ubuntu – production (VMware Workstation, NAT)     │
│ (WSL)                  │        │                                                       │
│ Terraform → Ansible    │        │  GitLab Runner (utilisateur gitlab-runner, shell)     │
└───────────────────────┘        │        │ SSH 127.0.0.1                                 │
                                  │        ▼                                               │
┌───────────────────────┐ HTTPS  │  utilisateur deploy ─► Docker Compose                 │
│ GitLab.com             │ ◄───── │        ┌─────────┐   ┌──────────┐   ┌─────────┐       │
│ .gitlab-ci.yml         │ (jobs) │        │   db    │ ► │ migrate  │ ► │   api   │ :4000 │
│ variables sécurisées   │        │        │Postgres │   │ (unique) │   │ Express │       │
└───────────────────────┘        │        └────┬────┘   └──────────┘   └─────────┘       │
                                  │             └── volume souverainrecrut_pgdata         │
                                  └───────────────────────────────────────────────────────┘
```

Le principe directeur : **l'image est construite une seule fois**, par Jenkins, après tous les contrôles ; elle est ensuite déployée telle quelle, identifiée par un tag immuable. Le serveur ne voit jamais le code source.

## 2. Composants et responsabilités

| Composant | Emplacement | Responsabilité | Dépôt / fichier |
|---|---|---|---|
| GitHub | Cloud | Code source, branche de travail `Dev` | `github.com/EAnathos/souverainrecrut` |
| Jenkins | Conteneur sur le poste de développement | Intégration continue : tests, qualité, construction, scan, publication | `Jenkinsfile`, `jenkins/` (configuration as code) |
| SonarCloud | Cloud | Analyse de qualité, Quality Gate bloquant | `backend/sonar-project.properties` |
| Trivy | Conteneur lancé par Jenkins | Scan de vulnérabilités des deux images, seuil bloquant | stage *Scan Trivy* |
| Docker Hub | Cloud | Registre des images versionnées | `eanathos/souverainrecrut-backend[-migrate]` |
| Terraform | Poste d'administration (WSL) | Clé de déploiement, inventaire Ansible, contrôle SSH | `terraform/` (dépôt GitLab) |
| Ansible | Poste d'administration (WSL) | Configuration du serveur : disque, DNS, Docker, utilisateur, pare-feu, runner | `ansible/` (dépôt GitLab) |
| GitLab CI/CD | Cloud + runner sur la VM | Déploiement : validation, approbation, vérification, rollback | `.gitlab-ci.yml` (dépôt GitLab) |
| VM de production | VMware Workstation | Exécution de l'API et de PostgreSQL | `deployment/docker-compose.yml` |

## 3. Les images

| Image | Construite depuis | Contenu | Rôle |
|---|---|---|---|
| `souverainrecrut-backend:<version>-<commit>` | cible finale du `Dockerfile` | `dist/`, dépendances de production, client Prisma ; ni npm ni CLI Prisma ; utilisateur `node` | API |
| `souverainrecrut-backend-migrate:<version>-<commit>` | cible `migrator` | dépendances de production + CLI Prisma + `prisma/` | `prisma migrate deploy`, puis arrêt |

Les deux images sortent du **même build Jenkins**, donc du même commit, et portent le **même tag**. Un tag comme `1.1.0-dbc9278` relie sans ambiguïté :
- une version applicative (`package.json`) ;
- un commit Git précis (`dbc9278`) ;
- un résultat de tests, une analyse SonarCloud et un scan Trivy (le build Jenkins correspondant).

Les tags mobiles (`dev`, `latest`) existent pour la lecture humaine mais ne sont **jamais** utilisés pour déployer.

## 4. Flux d'une modification, du commit à la production

| # | Étape | Acteur | Contrôle bloquant |
|---|---|---|---|
| 1 | Commit et push sur `Dev` | Développeur | — |
| 2 | Détection du commit (polling 2 min) | Jenkins | — |
| 3 | `npm ci`, `prisma generate` | Jenkins | dépendances |
| 4 | 64 tests, couverture ≥ 80 % | Jenkins (Vitest) | test en échec ou couverture insuffisante |
| 5 | Analyse et Quality Gate | SonarCloud | Quality Gate rouge |
| 6 | Compilation TypeScript | Jenkins | erreur de compilation |
| 7 | Construction des deux images | Jenkins (Docker) | échec du build |
| 8 | Scan des deux images | Trivy | HIGH ou CRITICAL corrigeable |
| 9 | Publication `<version>-<commit>` | Jenkins → Docker Hub | uniquement si 3 à 8 sont verts |
| 10 | *Run pipeline* avec `IMAGE_TAG` | Opérateur | — |
| 11 | `validate` : format du tag, images présentes, SSH | GitLab Runner | tag invalide ou image absente |
| 12 | `deploy_production` | Opérateur (**approbation**) | décision humaine |
| 13 | `pull`, puis `db` → `migrate` → `api` | Docker Compose | base non saine, migration en échec |
| 14 | `verify_production` : santé, migrations, `/health`, `/ready` | GitLab Runner | API non saine |
| 15 | En cas de problème : `rollback_production` | Opérateur | vérifications rejouées |

## 5. Réseau

| Flux | Source → destination | Protocole | Remarque |
|---|---|---|---|
| Lecture du code | Jenkins → GitHub | HTTPS | dépôt public, pas de credential |
| Analyse | Jenkins → SonarCloud | HTTPS | token `sonar-token` |
| Publication | Jenkins → Docker Hub | HTTPS | token d'écriture |
| Administration | WSL → VM | SSH (22) | clé admin |
| Récupération des jobs | Runner (VM) → GitLab.com | HTTPS sortant | compatible NAT, aucun port entrant |
| Déploiement | Runner → `deploy@127.0.0.1` | SSH local | clé de déploiement Terraform |
| Téléchargement des images | VM → Docker Hub | HTTPS | token de lecture |
| Accès à l'API | Utilisateur → VM | HTTP (4000) | seul port applicatif ouvert |
| Base de données | API → `db` | TCP 5432, réseau Docker interne | **jamais publié sur l'hôte** |

**Pourquoi le runner est sur la VM :** la VM est en NAT derrière le poste ; GitLab.com ne peut pas l'atteindre. Un runner qui interroge GitLab en sortie contourne la contrainte sans ouvrir de port. Le pipeline garde malgré tout une étape SSH vers l'utilisateur `deploy` : le runner lui-même n'a aucun droit sur Docker.

## 6. Sécurité

| Domaine | Mesure |
|---|---|
| Secrets | Aucun secret versionné : `.env`, `*.tfstate`, `terraform.tfvars`, `.secrets/`, `inventory.ini` ignorés ; credentials Jenkins via JCasC et `.env` local ; variables GitLab masquées et protégées |
| Moindre privilège | Token Docker Hub d'écriture pour Jenkins, de lecture pour le déploiement ; runner sans accès Docker ; seul `deploy` pilote Docker ; répertoire de déploiement en `0750` |
| Image | Base figée par digest, utilisateur non root, npm retiré, `.dockerignore`, `HEALTHCHECK`, labels OCI, 0 vulnérabilité HIGH/CRITICAL corrigeable |
| Serveur | Pare-feu UFW (entrant refusé sauf 22 et 4000), mises à jour appliquées, authentification SSH par clé |
| Pipeline | Approbation manuelle avant production, un seul déploiement à la fois (`resource_group`), empreinte SSH vérifiée, clé validée puis supprimée en fin de job, `.env` en `0600` jamais affiché |
| Données | Base non exposée, volume persistant, migrations uniquement en avant (`migrate deploy`) |

## 7. Choix techniques

| Choix | Alternative écartée | Raison |
|---|---|---|
| Jenkins conteneurisé, configuré par code (JCasC) | Configuration manuelle | Reproductible en une commande ; une configuration manuelle a été perdue en cours de projet |
| Vitest + supertest, Prisma mocké | Jest, base de test réelle | TypeScript natif, tests rapides et sans dépendance externe |
| Quality Gate via `sonar.qualitygate.wait` | `waitForQualityGate` | Ce dernier exige un webhook SonarCloud vers Jenkins, impossible vers `localhost` |
| Image de migrations séparée | CLI Prisma dans l'image de l'API | L'image exposée reste minimale (surface d'attaque, Trivy) |
| Service `migrate` dans Compose | Migrations au démarrage de l'API | Ordre garanti : l'API ne démarre pas si une migration échoue |
| VM directement dans Workstation | ESXi imbriqué + provider vSphere | Virtualisation imbriquée impossible sur l'hôte (VBS Windows 11) |
| Terraform sur ressources locales (`tls`, `local`, `null`) | Provider vSphere | Pas d'ESXi/vCenter disponible |
| Runner GitLab sur la VM | Runner partagé + SSH entrant | VM injoignable depuis Internet (NAT) |
| Pipeline lancé manuellement | Déclenchement sur push | Un push ne doit jamais déployer en production implicitement |
