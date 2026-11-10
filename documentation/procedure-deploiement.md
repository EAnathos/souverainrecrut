# Procédure de déploiement – SouverainRecrut Backend

Cette procédure permet de reproduire l'ensemble de la chaîne, d'une VM vierge jusqu'à l'API en production. Elle se lit dans l'ordre ; les étapes 1 à 4 ne sont faites qu'une fois, l'étape 5 à chaque nouvelle version.

| Où | Ce qu'on y fait |
|---|---|
| Poste Windows | VMware, Docker Desktop (Jenkins), navigateur (GitLab, Docker Hub) |
| WSL (Ubuntu sur le poste) | Terraform, Ansible, clé SSH |
| VM de production | **rien à la main** : tout est installé par Ansible et déployé par GitLab |

Dépôts :
- code et intégration continue : `github.com/EAnathos/souverainrecrut` (branche `Dev`) ;
- provisionnement et déploiement : `gitlab.com/eanathos1/souverainrecrut-deploiement`.

---

## 0. Prérequis

### Poste d'administration (WSL)

```bash
# PowerShell (Windows)
wsl --install -d Ubuntu

# Ubuntu (WSL)
sudo apt update && sudo apt install -y ansible curl gnupg
# Terraform : dépôt APT HashiCorp
wget -O- https://apt.releases.hashicorp.com/gpg | sudo gpg --dearmor -o /usr/share/keyrings/hashicorp.gpg
echo "deb [signed-by=/usr/share/keyrings/hashicorp.gpg] https://apt.releases.hashicorp.com $(lsb_release -cs) main" \
  | sudo tee /etc/apt/sources.list.d/hashicorp.list
sudo apt update && sudo apt install -y terraform
```

Le projet étant sur le disque Windows (`/mnt/c`), les droits Unix doivent y être activés, sinon Terraform ne peut pas installer ses providers :

```bash
printf '[automount]\noptions = "metadata,umask=22,fmask=11"\n' | sudo tee /etc/wsl.conf
# puis, dans PowerShell : wsl --shutdown
```

### VM de production

| Ressource | Valeur |
|---|---|
| Hyperviseur | VMware Workstation (VM créée manuellement, le provider vSphere exige ESXi/vCenter) |
| Système | Ubuntu ≥ 22.04 (24.04 Server recommandé), OpenSSH installé |
| Ressources | 2 vCPU, 4 Go RAM, 30 Go de disque minimum |
| Réseau | NAT, accès Internet |
| Option processeur | « Virtualiser AMD-V/RVI » **décochée** |

Autoriser la clé d'administration depuis WSL (remplacer l'utilisateur et l'IP) :

```bash
ssh-keygen -t ed25519 -f ~/.ssh/id_ed25519 -N ""
ssh-copy-id <admin>@<ip_vm>
ssh <admin>@<ip_vm> hostname          # doit répondre sans mot de passe
```

Prendre un snapshot de la VM avant configuration.

---

## 1. Publier une image (Jenkins)

1. Démarrer Docker Desktop, puis Jenkins (`cd jenkins && docker compose up -d`, interface sur http://localhost:8080).
2. Pousser sur `Dev` (détection automatique en 2 min) ou lancer **Build Now**.
3. En fin de build, relever le tag `<version>-<commit>` (ligne `Images construites : …`).
4. Vérifier sur Docker Hub que `souverainrecrut-backend` et `souverainrecrut-backend-migrate` portent ce tag, et que les deux dépôts sont **publics** (le job `validate` les interroge sans authentification).

---

## 2. Provisionnement (Terraform)

```bash
cd terraform
cp terraform.tfvars.example terraform.tfvars   # server_ip, admin_user
terraform init && terraform validate && terraform plan && terraform apply
```

Résultat : clé de déploiement `.secrets/deploy_key`, `ansible/inventory.ini`, connexion SSH vérifiée.

**Conserver** `terraform.tfstate`, `terraform.tfvars` et `.secrets/` : ils ne sont pas versionnés (ils contiennent la clé privée) mais sont nécessaires pour toute opération ultérieure.

---

## 3. Configuration du serveur (Ansible)

1. Dans GitLab : **Settings > CI/CD > Runners > New project runner**, tag `souverainrecrut-prod`, puis copier le jeton `glrt-…` (affiché une seule fois). Ne pas exécuter les commandes proposées par GitLab : Ansible s'en charge.
2. Lancer le playbook (le jeton n'est jamais écrit dans un fichier) :

```bash
cd ansible
ansible-galaxy collection install -r requirements.yml
ansible-playbook -i inventory.ini playbook.yml -K -e gitlab_runner_token=glrt-XXXX
```

`-K` demande le mot de passe sudo **de la VM**. Le premier passage dure plusieurs minutes (mise à jour complète du système).

| Le playbook… | Détail |
|---|---|
| agrandit la partition racine | à tout le disque, avec ou sans LVM |
| fixe des DNS publics | le relais DNS du NAT VMware est instable |
| met à jour le système | `dist-upgrade`, redémarrage si nécessaire |
| installe Docker Engine + Compose | dépôt officiel, rotation des logs |
| crée l'utilisateur `deploy` | groupe `docker`, clé Terraform, `/opt/souverainrecrut` en `0750` |
| configure le pare-feu | entrant refusé sauf SSH et 4000 |
| installe GitLab Runner | exécuteur shell, sans accès Docker, enregistré une seule fois |

Contrôles :
- récapitulatif `failed=0` ; un second passage doit afficher `changed=0` (idempotence) ;
- dans GitLab, le runner apparaît **Online**.

Pour rejouer le playbook plus tard, le jeton est facultatif : sans lui, le rôle `gitlab_runner` est ignoré.

---

## 4. Variables GitLab (Settings > CI/CD > Variables)

| Variable | Valeur | Type | Visibilité | Protégée |
|---|---|---|---|---|
| `DOCKERHUB_USER` | compte Docker Hub | Variable | Visible | non |
| `DOCKERHUB_TOKEN` | token Docker Hub **Read-only** | Variable | Masked and hidden | oui |
| `SSH_HOST` | `127.0.0.1` | Variable | Visible | non |
| `SSH_USER` | `deploy` | Variable | Visible | non |
| `SSH_PRIVATE_KEY` | clé de déploiement en base64 (voir ci-dessous) | **File** | Visible | oui |
| `POSTGRES_PASSWORD` | `openssl rand -hex 32` | Variable | Masked and hidden | oui |
| `JWT_SECRET` | `openssl rand -hex 32` (autre valeur) | Variable | Masked and hidden | oui |
| `IMAGE_TAG` | tag à déployer, ex. `1.0.0-fcc937f` | Variable | Visible | non |

« Expand variable reference » décoché partout, environnement « All ».

**Clé SSH :** la copier encodée en base64 sur une seule ligne, directement dans le presse-papiers. Un copier-coller depuis le terminal abîme la clé (`error in libcrypto`).

```bash
cd terraform
terraform output -raw deploy_private_key | base64 -w0 | clip.exe
```

`SSH_HOST=127.0.0.1` : le runner tourne sur le serveur ; il se connecte en SSH à la même machine, en tant que `deploy`.

---

## 5. Déployer une version

1. Mettre `IMAGE_TAG` sur le tag publié par Jenkins (*Settings > CI/CD > Variables*).
2. **Build > Pipelines > Run pipeline**, branche `main`. Utiliser *Run pipeline* et non *Retry* : *Retry* rejoue l'ancien commit du dépôt.

| Job | Déclenchement | Ce qu'il fait |
|---|---|---|
| `validate` | automatique | format du tag, présence des deux images sur Docker Hub, accès SSH et Docker |
| `deploy_production` | **manuel : bouton ▶ (approbation)** | génère `.env`, mémorise la version en place (`.previous_tag`), copie les fichiers, `docker compose pull` puis `up -d` |
| `verify_production` | automatique | état `healthy`, migrations terminées (`exit 0`), `/v1/health`, `/v1/ready`, image en place |
| `rollback_production` | manuel | voir [procedure-rollback.md](procedure-rollback.md) |

Ordre de démarrage garanti par Compose : `db` (healthy) → `migrate` (terminé avec succès) → `api` (healthy).

---

## 6. Vérifications

Depuis le poste :

```bash
curl http://<ip_vm>:4000/v1/health    # {"status":"UP", "environment":"production"}
curl http://<ip_vm>:4000/v1/ready     # l'API joint PostgreSQL
curl http://<ip_vm>:4000/v1/info      # version déployée
```

Sur le serveur, `/opt/souverainrecrut` n'est accessible qu'à `deploy` :

```bash
sudo -u deploy bash -c "cd /opt/souverainrecrut && docker compose ps && docker compose logs --tail=30 api"
```

### Premier compte administrateur

L'API n'a pas de route d'inscription. Sur une base neuve, créer un administrateur directement en base, avec le bcrypt de l'image de l'API :

```bash
HASH=$(sudo docker exec souverainrecrut-api-1 node -e "console.log(require('bcrypt').hashSync('<mot_de_passe>',10))")
sudo docker exec souverainrecrut-db-1 psql -U souverainrecrut -d souverainrecrut -c \
  "INSERT INTO users (id,\"firstName\",\"lastName\",email,password,role,\"createdAt\",\"updatedAt\")
   VALUES ('admin1','Admin','Test','admin@test.fr','$HASH','ADMIN',now(),now());"
```

Puis tester l'authentification et une route protégée :

```bash
TOKEN=$(curl -s -X POST http://<ip_vm>:4000/v1/auth/login -H "Content-Type: application/json" \
  -d '{"email":"admin@test.fr","password":"<mot_de_passe>"}' | grep -o '"token":"[^"]*"' | cut -d'"' -f4)
curl -s http://<ip_vm>:4000/v1/jobs -H "Authorization: Bearer $TOKEN"     # 200
curl -s http://<ip_vm>:4000/v1/jobs                                        # 401
```

### Persistance

```bash
sudo -u deploy bash -c "cd /opt/souverainrecrut && docker compose restart && sleep 20 && docker compose ps"
```

Le login doit toujours fonctionner : les données sont dans le volume `souverainrecrut_pgdata`.

---

## 7. Dépannage

| Symptôme | Cause probable | Action |
|---|---|---|
| Job en *pending* alors que le runner est *Online* | La VM n'a plus Internet (NAT VMware figé) | Sur la VM : `sudo journalctl -u gitlab-runner -n 20`, `ping 1.1.1.1`. Sur le poste (admin) : `Restart-Service "VMware NAT Service", VMnetDHCP` |
| Job en *pending*, runner *Offline* | VM éteinte, en veille ou service arrêté | Démarrer la VM ; `sudo systemctl restart gitlab-runner` |
| `validate` : *IMAGE_TAG invalide* | Tag mal saisi | Format `<x.y.z>-<7 caractères hexa>` |
| `validate` : *image introuvable* | Build Jenkins non terminé ou dépôt Docker Hub privé | Vérifier les tags sur Docker Hub et la visibilité |
| `validate` : *SSH_PRIVATE_KEY invalide* | Clé abîmée par le copier-coller | Recopier la clé en base64 (étape 4) |
| `deploy` : *db is unhealthy*, *No space left on device* | Disque plein | `df -h /` sur la VM ; agrandir le disque dans VMware puis rejouer Ansible |
| `terraform init` : *chmod … operation not permitted* | Droits Unix non activés sur `/mnt/c` | Configuration `/etc/wsl.conf` (étape 0) |
| Correctif sans effet sur le job | Job relancé avec *Retry* | Lancer un nouveau pipeline (*Run pipeline*) |

---

## Secrets

Aucun secret n'est versionné : `terraform.tfvars`, `*.tfstate`, `.secrets/`, `inventory.ini` et `.env` sont ignorés. Le `.env` de production est généré par le job, copié en `0600` puis supprimé de l'espace de travail du runner ; le token Docker Hub passe par `--password-stdin` et la session est fermée (`docker logout`) après le `pull`.
