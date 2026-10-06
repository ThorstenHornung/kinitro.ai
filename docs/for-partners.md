# For partners

**Partners can build specialized agent solutions on kinitro.ai and offer them to customers, at a charge.** The platform supplies the governed place, the agent runtime connection and the delivery path. You supply the domain expertise. This page describes what a solution consists of and how to get started. It is a beta: commercial terms are agreed individually.

## What a solution consists of

| Part | What you provide |
|---|---|
| **Persona and instructions** | Who the agent is, its standing rules, its start routine and its per-turn reminders. They are stored on the agent node. |
| **Procedures** | Step-by-step ways of working for the tasks your solution handles. The agent fetches the right one before it acts. |
| **Knowledge** | Methods, benchmarks, findings and sources, as small records with review dates. |
| **Data model** | Data tables and model handbooks, if your solution calculates or tracks something. |
| **UI views** | The screens and navigation the customer works with. |
| **Documents and templates** | Report and deliverable formats, with naming and status rules. |

Together they make a domain a customer can use without platform knowledge. See [Domain setup](domain-setup.md) for the structure.

## How it reaches customers

1. You build the solution in a kinitro.ai domain, in Design mode.
2. The customer gets an account and an agent seat, set up by kinitro or by you as the partner.
3. The customer connects the kinitro.ai connector in Claude and installs the plugin from this repository. See [Getting started](getting-started.md).
4. The plugin briefs the agent from the customer's domain at the right moments. The customer talks to the agent in plain language.
5. Deliverables and knowledge stay in the customer's domain.

kinitro.ai works with several agentic platforms. It starts with Claude. More platforms are being added rapidly. This repository holds what is needed for Claude.

## Example: Verum

**Verum** is "agent-led business planning & intelligence". It is one example of a specialized agent offering on kinitro.ai. It shows how persona, procedures, models and documents can add up to a solution for a clear business job.

## Building your solution: a short path

1. **Define the job.** Who is the customer and what result do they need?
2. **Write the persona and standing rules.** Keep them short and concrete.
3. **Write the procedures.** One per task type.
4. **Fill the knowledge.** Atomic records with sources and review dates.
5. **Add data and views** if the job needs them.
6. **Test with `arm-test`.** Check that every section reaches the agent. See the [plugin reference](plugin-reference.md#the-probe-tool).
7. **Run a pilot** with one customer user. Read the session protocols and improve the texts.

## Commercial terms

The offering is chargeable. Commercial terms are agreed individually during the beta. No price list exists yet.

## Beta status and access

- The repository is private. You need an invitation.
- The plugin is version 0.8.0. See the [known limits](plugin-reference.md#known-limits-in-the-beta).
- The software and documentation are licensed for evaluation during the beta. See the [LICENSE](../LICENSE).
- The kinitro names and logo are not covered by the evaluation license. Ask kinitro before you use them, and read the [brand rules](brand.md) first.

To apply, contact Thorsten Hornung at kinitro consulting through the channel you were invited on.
