# Finances & Budget — contexte projet

## Stack
- **Backend** : Python / Flask, SQLite (`backend/data.db`)
- **Frontend** : React (Vite), JSX, CSS custom (pas de framework UI)
- **Auth** : sessions Flask, système d'invitation par token

## Infrastructure
- L'app tourne sur un **NAS Synology** de Paul
- Accessible à distance via **Tailscale** (VPN mesh)
- Le backend Flask sert aussi le frontend buildé (dossier `backend/static/`)

## Utilisateurs
- **Paul** : compte admin, espace de données propre
- **Marie** (femme de Paul) : compte lié à Paul via `data_owner_id` — partage exactement le même espace de données
- Les autres utilisateurs ont leur propre espace isolé

## Structure des données clés
- `account_tabs` : onglets de compte par utilisateur (perso, joint…), premier = défaut
- `repartition` : répartition mensuelle des placements + `compte_courant` (montant variable/mois)
- `transactions` : filtrées par `user_id` (= `data_owner_id`) + `account_type`
- `data_owner_id` sur `users` : si non-null, l'utilisateur voit les données d'un autre

## Commandes utiles
```bash
# Tests backend
cd backend && python3 -m pytest -v

# Build frontend
cd frontend && npx vite build

# Lancer le frontend en dev
cd frontend && npm run dev
```

## Conventions de commit
- Préfixe `feat:`, `fix:`, `test:`, `refactor:`
- Toujours fetch + vérifier l'état avant de commiter
- Co-Author: Claude Sonnet 4.6
