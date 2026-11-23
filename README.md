# GAP – Gestion des Accès Poste

Application de suivi des prêts de clés et de badges.

## Sécurité

- L'accès aux données est réservé aux agents connectés **et** inscrits dans la table
  Supabase `agents_autorises` (rôle `agent` ou `admin`).
- Pour ajouter un agent (SQL Editor de Supabase) :
  `insert into agents_autorises(email, role) values ('prenom.nom@exemple.fr', 'agent');`
  L'agent crée ensuite son compte depuis l'écran de connexion et confirme son adresse.

## Relances automatiques

Le workflow `.github/workflows/relances.yml` s'exécute chaque jour. Il nécessite le secret
GitHub `SB_KEY` (clé `service_role` du projet Supabase, à ne jamais placer dans `index.html`).
