# How it works

**kinitro.ai keeps everything an agent needs in one governed place. The plugin hands the right part to the agent at the right moment.** This page explains the building blocks, the four instruction layers, the way agents work and the flow of a session.

1. [Platform concepts](#platform-concepts)
2. [The four instruction layers](#the-four-instruction-layers)
3. [How agents work](#how-agents-work)
4. [A session from start to finish](#a-session-from-start-to-finish)

## Platform concepts

| Concept | In plain words |
|---|---|
| **Domain** | Your workspace in kinitro.ai. It holds the purpose of your solution, its knowledge, documents, data and views. One domain per solution or project. |
| **Agent node and seat** | The agent node is the place where one agent's own instructions live. The seat ties your account to a domain and an agent node. |
| **Memory** | What the agent keeps, sorted by how long it should live. Scratch and session protocols are short-lived. Knowledge and designs are permanent. Each fact is kept once, not copied. |
| **Knowledge** | Findings, methods and sources, written as small records. Each has a review date, so stale knowledge is found and renewed. |
| **Procedures** | Step-by-step ways of working, kept in a shared library. The agent reads the procedure for a task type before it acts. |
| **Register** | The list of work items and open points of a solution, with owner, status and history. |
| **UI views** | The screens of your solution in kinitro.ai. The agent tailors navigation and views to you and your project, after agreeing the options with you. |
| **Cloud folder** | A file area in kinitro.ai for Office files, PDFs and data. You open files in the built-in editor and comment there. |
| **Design mode** | A working mode in which the technical parts of a domain are visible and editable: data model, tools and scratch space. Business users normally work without it. |

You do not need to learn these terms to work with an agent. The agent coaches you in using the platform.

## The four instruction layers

All instruction texts live in kinitro.ai and the domain owner can edit them. The plugin does not contain any of them. It only decides **when** a section is handed to the agent.

| Layer | Applies to | Where it lives | Example content |
|---|---|---|---|
| **General** | All kinitro.ai agents | The briefing document behind the `general-procedures` edge of your domain | Working principles, reporting style |
| **Claude-specific** | Agents running in Claude | The same briefing document | How to work with Claude's tools and its context limits |
| **Domain** | Everyone working in one domain | Domain purpose and Index, read by the agent itself | What the solution is for, how its sections are organized |
| **Agent** | One agent | The agent node: its own instruction contents | Persona, own standing rules, start routine |

How the plugin merges them:

- General and Claude-specific layers come from one briefing document, split into named sections.
- The agent's own instructions are added to the matching sections under the heading **Agent-specific**.
- The agent's persona **replaces** the general persona, if the agent has one.
- The domain layer is not injected. The agent reads the domain purpose and Index itself.

The section names and the matching agent instruction types are listed in the [plugin reference](plugin-reference.md#what-must-be-configured-in-kinitroai).

## How agents work

The general briefing asks every kinitro.ai agent to work by these principles. Your domain owner can adapt them.

1. **Procedure before task.** The agent fetches the procedure for the task type from the shared library before it acts.
2. **Verify before asserting.** Claims are checked against documents, data or sources. Figures that look odd are named and questioned, not smoothed over.
3. **Answer first.** Every answer starts with the conclusion (Pyramid Principle) and groups its support without overlaps (MECE).
4. **"Action needed" block.** If you must decide or do something, the answer starts with a short block that says so. Otherwise it says "no action needed".
5. **One decision at a time.** Open points come as a prioritized list. Then the agent takes one point at a time, with a recommendation and the price of doing nothing.
6. **Coach, do not assume.** The agent explains the platform and the method in business terms.
7. **Stay responsive.** Activities that take more than two minutes run in the background. Shorter ones start with a short preamble.
8. **Scripts instead of tool-call chains.** Repetitive work runs as one script, not as many single calls.
9. **Delegate economically.** Delegated work goes to cost-efficient models, with detailed briefs.
10. **Approval only where it matters.** The agent asks before writes outside its own domain and before irreversible, costly or external actions.
11. **Your language, English content.** The agent talks to you in your language. Enduring content such as documents, indexes and names is written in English.

## A session from start to finish

```
 START                 first prompt of the session
   |                   plugin loads the briefing (from cache while the connector connects)
   |                   -> Persona + Working rules (first-message context block)
   |                   -> Session start
   v
 TURNS                 every prompt
   |                   -> marker line + Every turn
   |                   end of every turn: prompt + answer appended to the protocol in your domain
   v
 CHECKPOINT            context window reaches 70 %, then every +5 points
   |                   -> Context nearly full (your briefing says what to do, for example to secure results)
   v
 COMPACTION            Claude summarizes the conversation (at about 80 %)
   |                   -> Compaction instruction goes to the summarizer
   v
 AFTER COMPACTION      first prompt after the summary
                       -> Persona + Working rules again, After compaction
                       back to TURNS
```

Why this matters: a long conversation outgrows the model's context window. At the checkpoint the agent is told in time, so it can secure what must survive in kinitro.ai. After compaction it gets its persona and rules again, plus the After compaction instructions. Nothing important should depend on the conversation alone.

The protocol document is a mirror for you and your team. It costs no model tokens. Details are in the [plugin reference](plugin-reference.md).
