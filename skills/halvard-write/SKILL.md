---
name: halvard-write
description: Write or rewrite text that an agent or a program must read with one meaning. Use for briefs, acceptance criteria, review findings, error messages and tool or skill descriptions, or when asked to disambiguate text. Not for creative or marketing copy.
---

Apply the discipline of ASD-STE100 Simplified Technical English to a reader that cannot ask a follow-up question: another agent, a reviewer process, a parser. The standard removes the two main sources of misreading, words with more than one meaning and sentences with more than one possible structure. User and project writing rules win where they differ.

## Modes

Pick a mode from the text type before rewriting. Keep the choice internal unless asked. Strict applies to procedures, briefs, acceptance criteria, error messages, tool and skill descriptions and review findings, anywhere a wrong reading has a cost. It applies every rule below. STE-flavored applies to READMEs, PR descriptions, changelogs and explanatory prose. It keeps the structural rules and treats the lexical rules as advisory, because prose needs some range.

## Structural rules

| Rule | Do | Do not |
|---|---|---|
| Active voice | "The runner deletes the file." | "The file is deleted.", unless the actor is unknown or irrelevant |
| No phrasal verbs | "Start the job." "Revert the change." | "Spin up the job." "Roll back the change." |
| One instruction per sentence | "Open the file. Read line 3." | "Open the file and read line 3, then check it." |
| Sentence length | At most 20 words for instructions, 25 for descriptions | Long compound or subordinate sentences |
| No semicolons | Separate sentences | Any semicolon |
| Noun clusters | At most three stacked nouns | "high pressure fuel pump inlet valve assembly" |
| No ellipsis | Keep subject, verb and article | "Files not backed up will be lost" |
| Keep modality | "The request may have failed." stays hedged | Promoting a hedge to a fact, or inventing certainty |
| Paragraphs | One topic, at most six sentences | Several topics in one paragraph |
| Lists for sequences | A list for three or more steps or conditions | A sequence buried in one sentence |

Use simple tenses. Keep a compound tense only where it carries information the simple form cannot, such as current relevance ("the job has completed") or a hedge ("may have failed").

## Lexical rules

Treat these as a direction of travel, not a checkable standard. Use one word for one meaning and reuse it. Do not rotate "check", "verify" and "confirm" for the same action. Prefer the verb to its noun form ("analyze the log", not "perform an analysis of the log"). Keep one part of speech per word where both read equally well. Keep necessary domain terms and define each once if it is not common English.

## Scan first

Before rewriting, scan for these habits. Each has a word or mark to point at.

- Synonym rotation: one thing gets several names.
- Stacked hedges that assert nothing.
- Nominalizations such as "perform an analysis of".
- Marketing adjectives such as seamless or robust.
- Run-on sentences joined by semicolons or dashes.
- Phrasal verbs such as "reach out", "roll back" or "set up". Use one plain verb: contact, revert, configure.

## Process

Read the text once for meaning before changing it. Walk it sentence by sentence and fix each violation while preserving the meaning exactly. In Strict mode, write each instruction to the reader as an imperative, and remove every passive and compound tense the meaning does not need. When a shorter form would drop a safety condition, scope qualifier, number or exception, keep the longer form and flag it.

Before you output, compare every hedge in the source with the rewrite. Words such as may, might, could, attempt, try, sometimes and likely carry the author's confidence. Each one must survive with the same strength. A rewrite that turns "it may resolve the conflict" into "it resolves the conflict" is a different claim. When the tense rule and a hedge conflict, keep the hedge. Never add a cause, frequency or mechanism the source did not state. Stop when a sentence is unambiguous, not when it is shortest. If the text already complies, say so. If it has nothing to say, say that instead of polishing it.

## Output

By default output only the rewritten text, with no preamble, mode announcement or summary. When a longer phrasing was kept on purpose, add one line after the whole text starting `Kept as-is:` naming the phrase and the precision it protects. When asked for the reasoning, output a table with the columns rule violated, original and rewrite. Follow it with the mode and the number of violations. Then add one line on anything left unchanged on purpose.

This fixes form, not substance, and does not produce certified STE documentation.

Adapted from danyuchn asd-ste100-skill, dropping the Python linter and the dictionary discussion; see ../../UPSTREAM.md.
