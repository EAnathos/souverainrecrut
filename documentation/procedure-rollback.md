# Procédure de rollback – SouverainRecrut Backend

## Principe

Chaque image est immuable et identifiée par `<version>-<commit>`. Revenir en arrière consiste à redémarrer l'API sur un tag antérieur déjà présent sur Docker Hub, **sans reconstruire**.

À chaque déploiement, le job `deploy_production` enregistre sur le serveur :

- `/opt/souverainrecrut/.previous_tag` : version en place avant le déploiement ;
- `/opt/souverainrecrut/.current_tag` : version déployée.

## Option 1 – Job GitLab `rollback_production` (recommandé)

1. Ouvrir le pipeline du déploiement à annuler.
2. Lancer le job manuel **`rollback_production`**.
3. Le job lit `.previous_tag`, remplace `IMAGE_TAG` dans `.env`, tire l'image et recrée **uniquement** le conteneur `api` (`up -d --no-deps api`), puis rejoue les vérifications (healthy, `/v1/health`, `/v1/ready`).

## Option 2 – Redéployer un tag précis

Mettre la variable `IMAGE_TAG` sur le tag antérieur (*Settings > CI/CD > Variables*), puis **Run pipeline** et approuver `deploy_production`. Les tags disponibles sont listés sur Docker Hub (`<compte>/souverainrecrut-backend`, onglet *Tags*). Cette option permet de revenir plus d'une version en arrière.

## Option 3 – Manuellement sur le serveur (secours)

Depuis la console de la VM (le répertoire n'est accessible qu'à `deploy`) :

```bash
sudo -u deploy bash
cd /opt/souverainrecrut
cat .current_tag .previous_tag
sed -i 's/^IMAGE_TAG=.*/IMAGE_TAG=<tag antérieur>/' .env
docker compose pull api && docker compose up -d --no-deps api
docker compose ps && curl -fsS http://127.0.0.1:4000/v1/health
```

Le `pull` nécessite d'être connecté à Docker Hub si les dépôts sont privés (`docker login`, puis `docker logout`).

## Base de données : limite du rollback

Le rollback applicatif **ne défait pas** les migrations Prisma : `prisma migrate deploy` ne sait qu'avancer. C'est pourquoi le rollback ne relance pas le service `migrate`.

Règles appliquées pour que l'ancienne version reste compatible avec le schéma courant (migrations *expand / contract*) :

- une migration **ajoute** (table, colonne nullable ou avec valeur par défaut) ; elle ne supprime ni ne renomme dans la même version que le code qui en dépend ;
- la suppression d'une colonne n'intervient qu'une version **après** que le code a cessé de l'utiliser ;
- avant une migration destructive : sauvegarde de la base.

```bash
# Sauvegarde / restauration
docker compose exec -T db pg_dump -U souverainrecrut souverainrecrut > backup-$(date +%F).sql
docker compose exec -T db psql -U souverainrecrut souverainrecrut < backup-AAAA-MM-JJ.sql
```

## Scénario de test maîtrisé (réalisé)

| Étape | Action | Résultat obtenu |
|---|---|---|
| 1 | Version A en place : `1.0.0-fcc937f`, compte `admin@test.fr` créé | `/v1/info` → `"version":"1.0.0"` |
| 2 | Commit `dbc9278` sur `Dev` : version 1.1.0 | Jenkins publie `1.1.0-dbc9278` (tests, Quality Gate et Trivy verts) |
| 3 | `IMAGE_TAG=1.1.0-dbc9278`, Run pipeline, approbation de `deploy_production` | `/v1/info` → `"version":"1.1.0"` ; `.previous_tag` = `1.0.0-fcc937f` |
| 4 | `rollback_production` dans le même pipeline | Job vert, vérifications comprises ; `/v1/info` → `"version":"1.0.0"` |
| 5 | Login `admin@test.fr` | Toujours valide : les données sont conservées |

La version 1.1.0 ne contenait aucune migration : le rollback n'a eu aucun effet sur le schéma.

Après un rollback, penser à remettre la variable `IMAGE_TAG` sur la version réellement en place, pour qu'un prochain pipeline ne redéploie pas la version retirée par erreur.
