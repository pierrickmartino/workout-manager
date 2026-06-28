# Workout Manager — Prompt de conception et développement

Je souhaite développer une application web appelée **Workout Manager**.

L’objectif de l’application est de permettre à des utilisateurs débutants, intermédiaires ou experts de **créer, démarrer, suivre et faire évoluer leurs entraînements de fitness** à l’aide d’un système assisté par IA.

L’application doit permettre deux grands cas d’usage :

1. Créer un **programme d’entraînement complet sur plusieurs semaines**.
2. Créer une **séance d’entraînement unique**.

L’application devra être conçue de manière modulaire, maintenable et évolutive.

---

## 1. Contexte utilisateur

Lors de l’onboarding, l’utilisateur devra renseigner des informations permettant de construire son profil sportif.

Exemples d’informations à collecter :

* Genre
* Âge
* Taille
* Poids
* Niveau sportif
* Habitudes d’entraînement
* Contraintes physiques éventuelles
* Équipements disponibles
* Historique ou exemple de dernier entraînement effectué

Ces informations serviront à personnaliser les recommandations de l’IA, notamment pour adapter la difficulté, le volume, l’intensité et le choix des exercices.

L’application devra rester prudente sur les recommandations sportives, en particulier pour les cas sensibles comme la reprise après blessure, la rééducation ou le post-partum.

---

## 2. Création d’un programme d’entraînement

L’utilisateur doit pouvoir générer un programme d’entraînement sur plusieurs semaines.

Pour cela, l’application lui demandera notamment :

* Le type d’entraînement souhaité :

  * Musculation
  * Calisthenics
  * CrossFit
  * Hyrox
  * Pilates
  * Yoga
  
* L’objectif principal :

  * Augmentation de la force
  * Prise de masse musculaire
  * Stabilisation
  * Perte de poids
  * Amélioration de figures spécifiques
  * Amélioration de la souplesse
  * Rééducation post-natale
  
* Le nombre de séances par semaine
* La durée moyenne des séances
* Les équipements disponibles

Une fois ces paramètres renseignés, l’application utilisera un modèle IA pour générer un programme personnalisé.

Un programme est composé de plusieurs séances d’entraînement.

Chaque séance est composée de plusieurs exercices.

Chaque exercice peut contenir des informations comme :

* Nom
* Description
* Groupes musculaires ciblés
* Niveau de difficulté
* Séries
* Répétitions
* Temps de repos
* Tempo
* Charge recommandée si applicable
* Durée si applicable
* Instructions techniques
* Erreurs fréquentes
* Variantes possibles

---

## 3. Création d’une séance unique

L’utilisateur doit aussi pouvoir générer une séance d’entraînement isolée, sans créer de programme complet.

Pour cela, l’application lui demandera notamment :

* Le type d’entraînement souhaité
* La durée de la séance
* Les équipements disponibles

Une fois les paramètres renseignés, l’application utilisera un modèle IA pour générer une séance personnalisée.

Une séance est composée d’un groupe d’exercices structurés.

---

## 4. Feedback utilisateur et régénération

Après la génération d’un programme ou d’une séance, l’utilisateur pourra donner un avis :

* Positif
* Négatif

Le feedback devra être stocké en base de données.

Si l’avis est négatif, l’application pourra proposer une régénération.

Dans une première version, une seule régénération sera autorisée.

Avant de régénérer :

* Pour un programme, l’utilisateur pourra choisir de conserver certaines séances.
* Pour une séance unique, l’utilisateur pourra choisir de conserver certains exercices.

L’IA devra alors régénérer uniquement les parties non conservées.

---

## 5. Gestion des exercices

Lorsque l’IA propose un exercice qui n’existe pas encore dans la base de données, l’application devra le stocker.

L’application devra ensuite enrichir cet exercice avec un maximum d’informations utiles pour guider l’utilisateur pendant sa séance :

* Description claire
* Consignes d’exécution
* Muscles sollicités
* Niveau de difficulté
* Équipement nécessaire
* Variantes
* Alternatives
* Précautions éventuelles

Si un utilisateur ne peut pas réaliser un exercice proposé, il doit pouvoir demander une variante ou une alternative adaptée à son profil, à son équipement et à son objectif.

---

## 6. Cache et optimisation des coûts IA

Pour limiter les coûts liés aux appels au modèle IA, l’application devra mettre en place un système de cache.

Si une demande de génération correspond à des paramètres déjà connus, l’application pourra réutiliser un programme ou une séance déjà généré.

Le cache devra être basé sur des paramètres normalisés, par exemple :

* Type d’entraînement
* Objectif
* Niveau utilisateur
* Nombre de séances
* Durée
* Équipements disponibles
* Contraintes importantes
* Profil sportif simplifié

Le système devra éviter de réutiliser un programme inadapté si le profil utilisateur contient des différences importantes.

---

## 7. Suivi de l’évolution

L’application devra permettre à l’utilisateur de suivre son évolution dans le temps.

Les fonctionnalités de suivi pourront inclure :

* Historique des séances réalisées
* Exercices complétés
* Charges utilisées
* Répétitions effectuées
* Temps de repos
* Ressenti utilisateur
* Difficulté perçue
* Progression sur certains exercices
* Évolution du poids ou d’autres métriques si l’utilisateur les renseigne

Ces données pourront ensuite être utilisées pour ajuster les futures recommandations de l’IA.

---

## 8. Stack technique souhaitée

L’application utilisera la stack suivante :

* Frontend : Next.js App Router v16+, TypeScript, Tailwind CSS v4+, shadcn/ui, TanStack Query
* Backend : FastAPI, PostgreSQL, SQLModel, Alembic
* Authentification : Clerk, avec vérification JWT côté FastAPI via JWKS.
* Déploiement : Docker
* Mobile-first : PWA mobile-first dès le départ
* Cache IA : Redis (seulement si nécessaire)
* Jobs IA : RQ (seulement si nécessaire)

Stockage tokens :

* Pas de localStorage pour les tokens sensibles.
* Sessions/cookies sécurisés côté frontend, JWT vérifié côté API.

Architecture :
* Next.js gère l’expérience utilisateur.
* FastAPI gère la logique métier, l’IA, les programmes, les séances, les feedbacks et les données utilisateur.