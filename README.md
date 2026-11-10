# SouverainRecrut

## Présentation

SouverainRecrut est une plateforme web de gestion des recrutements destinée aux entreprises.

Elle permet de :

- gérer les candidats ;
- publier des offres d'emploi ;
- suivre les candidatures ;
- centraliser le processus de recrutement.

Ce projet est utilisé comme **projet fil rouge** des cours  DevOps.

> **Projet CI/CD – Evan Jeuland / Nathaël Martinelle**
>
> Livrables dans [`documentation/`](documentation) : [rapport final](documentation/rapport-final.md), [architecture](documentation/architecture.md), [procédure de déploiement](documentation/procedure-deploiement.md), [procédure de rollback](documentation/procedure-rollback.md) et [captures](documentation/captures).
> Le provisionnement et le déploiement sont dans le dépôt GitLab [`souverainrecrut-deploiement`](https://gitlab.com/eanathos1/souverainrecrut-deploiement).

---

## Architecture

Le projet est composé de deux applications.

```
Frontend (React)
        │
        ▼
Backend (Express API)
        │
        ▼
PostgreSQL
```

---

## Stack technique

### Frontend

- React
- TypeScript
- Vite
- Axios
- Material UI

### Backend

- Node.js
- Express
- TypeScript
- Prisma
- PostgreSQL

### DevOps

- Git
- GitLab
- Docker
- GitLab CI/CD
- Terraform
- Ansible
- Nginx

---

## Arborescence

```
souverainrecrut/
│
├── backend/
├── frontend/
├── docs/
└── README.md
```

---

## Auteur

ALIMOU DIALLO