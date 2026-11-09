# Rapport CI/CD – SouverainRecrut Backend

Projet fil rouge CI/CD – M2 Sup de Vinci Rennes. Périmètre : API Backend uniquement.

| Partie | Statut |
|---|---|
| 3.1 Préparation du dépôt | ✅ |
| 3.2 Tests Backend | ✅ |
| 3.3 Analyse SonarQube | ✅ |
| 3.4 Mise en place de Jenkins | ⏳ |
| 3.5 Automatisation de la chaîne CI | ⏳ |
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
