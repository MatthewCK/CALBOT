# CALBOT

A family of projects about Cal Raleigh's record 2025 season (60 home runs, the most ever by a catcher or a switch-hitter), with a group-chat bet on his final total as a personal backdrop. It's a fun project in its own right, and it's also the centerpiece of a portfolio for Silver Bulletin's Associate Interactive Developer job (Nate Silver's site, which publishes models like FLIPR for elections and ELWAY for the NFL).

The full plan, with the reasoning, is in `docs/PLAN.md`. Read it before starting anything large.

## Layout

One git repo, one folder per project. Each folder has its own `CLAUDE.md` with the details for working there.

| Folder | What it is | Language | State |
|---|---|---|---|
| `model/` | CALBOT Model: data collection, simulations, bet tracking, event detection; publishes outputs | Python | Empty skeleton |
| `contract/` | The output contract every consumer reads (PLAN.md section 3) | JSON Schema | Placeholders |
| `web/` | CALBOT Web: the interactive D3 site | HTML/CSS/JS + D3 | Prototype in `web/prototype/` |
| `whatsapp/` | CALBOT WhatsApp: the group-chat bot | Node | Working, deployed on Railway |
| `docs/` | `PLAN.md` | | |

### Rules that span folders

- **Connect through data, not code.** `web/` and `whatsapp/` read the model's published outputs; they never import code from `model/`. One source of truth means the site and the bot never disagree.
- **The contract is versioned.** Every output carries a `schema` number. Change `contract/` first, then the model, then the consumers.
- **The bet is data, not code.** Players, guesses and rules live in a config file the model reads.
- Each folder keeps its own dependencies and tooling (`package.json` in `whatsapp/`, `pyproject.toml` in `model/`). Run commands from inside the folder.
- Commit messages say which part they touch when it isn't obvious (for example "web: …", "model: …").

## Who it's for

- Readers: baseball and data people who enjoy a model they can play with.
- Hiring reviewers at Silver Bulletin. The job posting stresses: working interactives, model output that flows into the site automatically, checking that published numbers are correct, accurate and appealing data visualizations, working within Substack's limits (web, email and app), and using AI tools with real understanding ("not just a vibecoder").

## The model (as of the prototype)

- A home-run rate per game with a Gamma prior from his 2024 rate (34 HR in 153 games), weighted as 150 games of evidence, updated after every game.
- Each simulation draws a rate from the posterior, then plays out the remaining games as Poisson draws. 20,000 simulations per game state.
- The bet: closest guess to the final total wins; ties split.
- Today this lives in `web/prototype/build_data.py`. Roadmap step 3 moves it into `model/`.
- Later idea: FLIPR-style Lite / Classic / Deluxe versions with a toggle on every chart.

## The prototype data is partly made up

The MLB API was blocked when the prototype was built, so `web/prototype/season.json` is approximate:
- Real: monthly totals and milestones (first HR on Mar 31 in game 5; 26 through game 63; 32 through game 77; 38 at the All-Star break; 48 and 49 on Aug 24; 59 and 60 on Sep 24; 60 final).
- Approximate: which game each other home run fell on, and the game dates.
- Invented: the five bettors and guesses (Dad 29, Tori 34, Big Mike 38, Nguyen 43, Me 47). The real names and guesses come from the owner.

**First job: replace it with the real game log** from
`https://statsapi.mlb.com/api/v1/people/663728/stats?stats=gameLog&season=2025&group=hitting`
(663728 is Cal Raleigh). Check that the total is 60 and the milestones above line up.

## Where it's headed

Roadmap (PLAN.md section 10): real data, real bet, model package, web from outputs, season of the day, publisher + Substack, bot migration, apply, Opening Day 2027 (late March) live.

Stack: Python for the model and data, HTML/CSS/JS with D3 for the front end (no heavy framework), Git with clean commits. Later: BigQuery + SQL, GitHub Actions then Cloud Run for scheduling, Datawrapper for Substack charts.

## Working notes

- Keep the AI-usage story honest: note in commits or a log how AI tools were used.
- Verify numbers against the source after every data change. Accuracy is part of the pitch.
- Never commit secrets. `whatsapp/.env` holds real phone numbers and chat IDs and is gitignored.
