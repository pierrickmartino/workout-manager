# Workout Manager — Design and Development Prompt

I want to develop a web application called **Workout Manager**.

The goal of the application is to allow beginner, intermediate, or advanced users to **create, start, track, and evolve their fitness workouts** using an AI-assisted system.

The application must support two main use cases:

1. Create a **complete multi-week training program**.
2. Create a **single workout session**.

The application should be designed to be modular, maintainable, and scalable.

---

## 1. User context

During onboarding, the user should provide information that helps build their fitness profile.

Examples of information to collect:

* Gender
* Age
* Height
* Weight
* Fitness level
* Training habits
* Any physical constraints
* Available equipment
* History or example of the most recent workout completed

This information will be used to personalize the AI recommendations, particularly to adjust difficulty, volume, intensity, and exercise selection.

The application should remain cautious in its fitness recommendations, especially for sensitive cases such as returning from injury, rehabilitation, or postpartum.

---

## 2. Training program creation

The user must be able to generate a multi-week training program.

To do this, the application should ask for:

* The desired training type:

  * Strength training
  * Calisthenics
  * CrossFit
  * Hyrox
  * Pilates
  * Yoga
  
* The main objective:

  * Increase strength
  * Gain muscle mass
  * Stabilization
  * Weight loss
  * Improve specific skills
  * Improve flexibility
  * Postnatal rehabilitation
  
* The number of sessions per week
* The average session duration
* The available equipment

Once these parameters are entered, the application will use an AI model to generate a personalized program.

A program is composed of multiple workout sessions.

Each session is composed of multiple exercises.

Each exercise may include information such as:

* Name
* Description
* Targeted muscle groups
* Difficulty level
* Sets
* Repetitions
* Rest time
* Tempo
* Recommended load if applicable
* Duration if applicable
* Technical instructions
* Common mistakes
* Possible variations

---

## 3. Single workout session creation

The user should also be able to generate a single workout session without creating a full program.

For this, the application should ask for:

* The desired training type
* The duration of the session
* The available equipment

Once the parameters are entered, the application will use an AI model to generate a personalized session.

A session is composed of a structured group of exercises.

---

## 4. User feedback and regeneration

After generating a program or a session, the user should be able to provide feedback:

* Positive
* Negative

The feedback should be stored in the database.

If the feedback is negative, the application may offer regeneration.

In an initial version, only one regeneration will be allowed.

Before regenerating:

* For a program, the user can choose to keep certain sessions.
* For a single session, the user can choose to keep certain exercises.

The AI should then regenerate only the parts that are not kept.

---

## 5. Exercise management

When the AI suggests an exercise that does not yet exist in the database, the application should store it.

The application should then enrich that exercise with as much useful information as possible to guide the user during their session:

* Clear description
* Execution instructions
* Muscles targeted
* Difficulty level
* Required equipment
* Variations
* Alternatives
* Possible precautions

If a user cannot perform a suggested exercise, they should be able to request a variation or alternative adapted to their profile, equipment, and goal.

---

## 6. AI cost optimization and caching

To limit the costs related to AI model calls, the application should implement a caching system.

If a generation request matches already known parameters, the application can reuse a previously generated program or session.

The cache should be based on normalized parameters, for example:

* Training type
* Objective
* User level
* Number of sessions
* Duration
* Available equipment
* Important constraints
* Simplified fitness profile

The system should avoid reusing an unsuitable program if the user profile contains significant differences.

---

## 7. Progress tracking

The application should allow the user to track their progress over time.

Tracking features may include:

* History of completed sessions
* Completed exercises
* Weights used
* Repetitions performed
* Rest times
* User feedback
* Perceived difficulty
* Progress on specific exercises
* Changes in weight or other metrics if the user provides them

This data can then be used to adjust future AI recommendations.

---

## 8. Desired technical stack

The application will use the following stack:

* Frontend: Next.js App Router v16+, TypeScript, Tailwind CSS v4+, shadcn/ui, TanStack Query
* Backend: FastAPI, PostgreSQL, SQLModel, Alembic
* Authentication: Clerk, with JWT verification on FastAPI via JWKS
* Deployment: Docker
* Mobile-first: PWA mobile-first from the start
* AI cache: Redis (only if needed)
* AI jobs: RQ (only if needed)

Token storage:

* No localStorage for sensitive tokens.
* Secure sessions/cookies on the frontend, JWT verified on the API side.

Architecture:
* Next.js handles the user experience.
* FastAPI handles business logic, AI, programs, sessions, feedback, and user data.
